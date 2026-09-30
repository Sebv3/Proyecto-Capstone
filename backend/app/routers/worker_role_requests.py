from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.routers.worker_verification import BUCKET, _cleanup, _validated_image
from app.schemas.user import User, UserRole
from app.schemas.worker_role_request import WorkerRoleRequestResponse

router = APIRouter(prefix="/api/v1/solicitudes/rol-trabajador", tags=["Solicitud rol trabajador"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def _client_token(user: User, credentials: BearerToken) -> str:
    if user.rol != UserRole.CLIENTE:
        raise HTTPException(status_code=403, detail="Esta operación requiere un cliente")
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Se requiere un token Bearer")
    return credentials.credentials


def _upstream_error(code: int) -> None:
    if code == 409:
        raise HTTPException(status_code=409, detail="Ya existe una solicitud pendiente")
    if code in (401, 403):
        raise HTTPException(status_code=403, detail="No tienes permiso para esta operación")
    if code >= 500:
        raise HTTPException(status_code=502, detail="Supabase no está disponible")
    if code >= 400:
        raise HTTPException(status_code=400, detail="No se pudo procesar la solicitud")


def _parse_request(payload: Any) -> WorkerRoleRequestResponse:
    try:
        if not isinstance(payload, list) or not payload:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        return WorkerRoleRequestResponse.model_validate(payload[0])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de solicitud inválida") from exc


@router.get("", response_model=WorkerRoleRequestResponse)
async def get_worker_role_request(
    current_user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
) -> WorkerRoleRequestResponse:
    token = _client_token(current_user, credentials)
    response = await gateway.request(
        "GET",
        "/rest/v1/solicitudes_rol_trabajador",
        params={
            "usuario_id": f"eq.{current_user.id}",
            "select": "id,usuario_id,estado,motivo_rechazo,creado_en,actualizado_en",
            "order": "creado_en.desc",
            "limit": "1",
        },
        access_token=token,
    )
    _upstream_error(response.status_code)
    try:
        return _parse_request(response.json())
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de solicitud inválida") from exc


@router.post("", response_model=WorkerRoleRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_worker_role_request(
    current_user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
    carnet_frontal: Annotated[UploadFile, File()],
    carnet_reverso: Annotated[UploadFile, File()],
    selfie: Annotated[UploadFile, File()],
) -> WorkerRoleRequestResponse:
    token = _client_token(current_user, credentials)
    pending = await gateway.request(
        "GET",
        "/rest/v1/solicitudes_rol_trabajador",
        params={
            "usuario_id": f"eq.{current_user.id}",
            "estado": "eq.PENDIENTE",
            "select": "id",
            "limit": "1",
        },
        access_token=token,
    )
    _upstream_error(pending.status_code)
    try:
        if pending.json():
            raise HTTPException(status_code=409, detail="Ya existe una solicitud pendiente")
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de solicitud inválida") from exc

    try:
        images = {
            "carnet_frontal_path": await _validated_image(carnet_frontal, "Carnet frontal"),
            "carnet_reverso_path": await _validated_image(carnet_reverso, "Carnet reverso"),
            "selfie_path": await _validated_image(selfie, "Selfie"),
        }
        submission = uuid4()
        paths: dict[str, str] = {}
        uploaded: list[str] = []
        for field, (data, mime, extension) in images.items():
            path = f"{current_user.id}/solicitudes-rol/{submission}/{field}{extension}"
            upload = await gateway.request(
                "POST",
                f"/storage/v1/object/{BUCKET}/{path}",
                content=data,
                access_token=token,
                extra_headers={"Content-Type": mime, "x-upsert": "false"},
            )
            _upstream_error(upload.status_code)
            paths[field] = path
            uploaded.append(path)

        response = await gateway.request(
            "POST",
            "/rest/v1/solicitudes_rol_trabajador",
            params={"select": "*"},
            json={"usuario_id": str(current_user.id), **paths},
            access_token=token,
            extra_headers={"Prefer": "return=representation"},
        )
        _upstream_error(response.status_code)
        return _parse_request(response.json())
    except Exception:
        if "uploaded" in locals():
            try:
                await _cleanup(uploaded, gateway, token)
            except HTTPException:
                pass
        raise
