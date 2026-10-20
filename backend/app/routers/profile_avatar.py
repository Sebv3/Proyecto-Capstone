import logging
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.routers.worker_verification import _validated_image
from app.schemas.user import User

router = APIRouter(prefix="/api/v1/perfil/foto", tags=["Foto de perfil"])
CurrentUser = Annotated[User, Depends(get_current_user)]
BUCKET = "profile-avatars"
logger = logging.getLogger(__name__)


class AvatarResponse(BaseModel):
    avatar_url: str | None


def _check_response(code: int) -> None:
    if code in (401, 403):
        raise HTTPException(403, "No tienes permiso para cambiar esta foto")
    if code >= 400:
        raise HTTPException(502, "No se pudo guardar la foto; revisa el almacenamiento de perfiles")


async def _save_avatar(
    user: User, token: str, gateway: AuthGateway, url: str | None,
) -> AvatarResponse:
    response = await gateway.request(
        "PATCH", "/rest/v1/usuarios", access_token=token,
        params={"id": f"eq.{user.id}", "select": "id,avatar_url"},
        json={"avatar_url": url}, extra_headers={"Prefer": "return=representation"},
    )
    _check_response(response.status_code)
    try:
        rows = response.json()
        if (not isinstance(rows, list) or len(rows) != 1
                or rows[0]["id"] != str(user.id) or rows[0]["avatar_url"] != url):
            raise ValueError("Unexpected profile")
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            502, "No se pudo confirmar la actualización; recarga tu perfil"
        ) from exc
    return AvatarResponse(avatar_url=url)


async def _remove_previous(user: User, gateway: AuthGateway, token: str) -> None:
    prefix = f"{gateway.url}/storage/v1/object/public/{BUCKET}/{user.id}/"
    if not user.avatar_url or not user.avatar_url.startswith(prefix):
        return
    filename = user.avatar_url.removeprefix(prefix)
    try:
        stem, extension = filename.rsplit(".", 1)
        UUID(stem)
        if extension not in ("jpg", "png", "webp"):
            return
    except ValueError:
        return
    try:
        response = await gateway.request(
            "DELETE", f"/storage/v1/object/{BUCKET}", access_token=token,
            json={"prefixes": [f"{user.id}/{filename}"]},
        )
        if response.status_code >= 400:
            logger.warning("Previous avatar cleanup failed")
    except HTTPException:
        # The new profile value is already committed; cleanup must not undo it.
        logger.warning("Previous avatar cleanup unavailable")


@router.post("", response_model=AvatarResponse)
async def upload_avatar(
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
    foto: Annotated[UploadFile, File()],
) -> AvatarResponse:
    if credentials is None:
        raise HTTPException(401, "Se requiere un token Bearer")
    token = credentials.credentials
    data, mime, extension = await _validated_image(foto, "Foto de perfil")
    path = f"{user.id}/{uuid4()}{extension}"
    response = await gateway.request(
        "POST", f"/storage/v1/object/{BUCKET}/{path}", content=data, access_token=token,
        extra_headers={"Content-Type": mime, "x-upsert": "false"},
    )
    _check_response(response.status_code)
    url = f"{gateway.url}/storage/v1/object/public/{BUCKET}/{path}"
    result = await _save_avatar(user, token, gateway, url)
    # Keep the old photo if saving fails. An ambiguous write may have committed,
    # so never delete the new upload on a network/response error.
    await _remove_previous(user, gateway, token)
    return result


@router.delete("", response_model=AvatarResponse)
async def remove_avatar(
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
) -> AvatarResponse:
    if credentials is None:
        raise HTTPException(401, "Se requiere un token Bearer")
    result = await _save_avatar(user, credentials.credentials, gateway, None)
    await _remove_previous(user, gateway, credentials.credentials)
    return result
