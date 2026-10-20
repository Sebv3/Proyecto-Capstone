from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime, BaseModel, TypeAdapter

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.schemas.user import User

router = APIRouter(prefix="/api/v1/notificaciones", tags=["Notificaciones"])
CurrentUser = Annotated[User, Depends(get_current_user)]
FIELDS = "id,tipo,referencia_id,categoria_id,titulo,mensaje,creado_en,leida_en"


class Notification(BaseModel):
    id: UUID
    tipo: Literal["SOLICITUD", "VERIFICACION", "CERTIFICACION", "ROL"]
    referencia_id: UUID
    categoria_id: UUID | None
    titulo: str
    mensaje: str
    creado_en: AwareDatetime
    leida_en: AwareDatetime | None


def _check(response):
    if response.status_code >= 400:
        if response.status_code in (401, 403):
            raise HTTPException(response.status_code, "No autorizado")
        if response.status_code == 404:
            raise HTTPException(503, "Las notificaciones aún no están disponibles")
        raise HTTPException(502, "No se pudieron consultar las notificaciones")


@router.get("", response_model=list[Notification])
async def list_notifications(
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Notification]:
    response = await gateway.request("GET", "/rest/v1/notificaciones", params={
        "usuario_id": f"eq.{user.id}", "select": FIELDS,
        "order": "creado_en.desc,id.desc", "limit": str(limit), "offset": str(offset),
    }, access_token=credentials.credentials)
    _check(response)
    try:
        return TypeAdapter(list[Notification]).validate_python(response.json())
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de notificaciones inválida") from exc


@router.get("/sin-leer")
async def unread_count(user: CurrentUser, credentials: BearerToken, gateway: AuthGateway):
    response = await gateway.request("GET", "/rest/v1/notificaciones", params={
        "usuario_id": f"eq.{user.id}", "leida_en": "is.null", "select": "id", "limit": "1",
    }, access_token=credentials.credentials, extra_headers={"Prefer": "count=exact"})
    _check(response)
    try:
        count = int(response.headers["Content-Range"].rsplit("/", 1)[1])
        if count < 0:
            raise ValueError("Invalid count")
    except (KeyError, ValueError) as exc:
        raise HTTPException(502, "Respuesta de notificaciones inválida") from exc
    return {"cantidad": count}


@router.delete("")
async def clear_notifications(
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
):
    response = await gateway.request(
        "POST", "/rest/v1/rpc/limpiar_notificaciones_finalizadas",
        json={}, access_token=credentials.credentials,
    )
    _check(response)
    try:
        count = response.json()
        if type(count) is not int or count < 0:
            raise ValueError("Invalid deleted count")
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de notificaciones inválida") from exc
    return {"eliminadas": count}


async def _read(gateway, token, notification_id=None):
    response = await gateway.request(
        "POST", "/rest/v1/rpc/leer_notificaciones",
        json={"p_id": str(notification_id) if notification_id else None}, access_token=token,
    )
    _check(response)
    return {"ok": True}


@router.post("/leer-todas")
async def read_all(user: CurrentUser, credentials: BearerToken, gateway: AuthGateway):
    return await _read(gateway, credentials.credentials)


@router.post("/{notification_id}/leer")
async def read_one(
    notification_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
):
    return await _read(gateway, credentials.credentials, notification_id)
