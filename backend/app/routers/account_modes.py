from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict

from app.core.security import AuthGateway, BearerToken
from app.routers.bookings import CurrentUser, _token
from app.schemas.user import User, UserRole

router = APIRouter(prefix="/api/v1/cuenta", tags=["Modos de cuenta"])


@router.delete("", status_code=204)
async def deactivate_account(user: CurrentUser, credentials: BearerToken, gateway: AuthGateway):
    if user.rol not in (UserRole.CLIENTE, UserRole.TRABAJADOR):
        raise HTTPException(403, "Esta cuenta no puede ser desactivada desde la aplicación")
    response = await gateway.request(
        "POST", "/rest/v1/rpc/desactivar_cuenta_actual", json={},
        access_token=_token(credentials),
    )
    if response.status_code >= 400:
        try:
            code = response.json().get("code")
        except (ValueError, AttributeError):
            code = None
        if code == "PGRST202":
            raise HTTPException(503, "Falta aplicar la migración de desactivación de cuentas")
        if response.status_code in (401, 403) or code == "42501":
            raise HTTPException(403, "No tienes permiso para desactivar esta cuenta")
        raise HTTPException(502, "No se pudo desactivar la cuenta")
    try:
        result = response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de desactivación inválida") from exc
    if result is False:
        raise HTTPException(409, "La cuenta no pudo ser desactivada; actualiza tu perfil")
    if result is not True:
        raise HTTPException(502, "Respuesta de desactivación inválida")
    return Response(status_code=204)


class ModeStatus(BaseModel):
    rol_activo: Literal["CLIENTE", "TRABAJADOR"]
    puede_ser_cliente: bool
    puede_ser_trabajador: bool
    tiene_perfil_trabajador: bool
    perfil_cliente_completo: bool


class ModeChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rol: Literal["CLIENTE", "TRABAJADOR"]


async def rpc(name, payload, user, credentials, gateway):
    if user.rol not in (UserRole.CLIENTE, UserRole.TRABAJADOR):
        raise HTTPException(403, "Esta cuenta no puede cambiar de modo")
    response = await gateway.request(
        "POST", f"/rest/v1/rpc/{name}", access_token=_token(credentials), json=payload,
    )
    if response.status_code >= 400:
        try:
            code = response.json().get("code")
        except (ValueError, AttributeError):
            code = None
        status, message = {
            "PGRST202": (503, "Falta aplicar la migración de modos de cuenta"),
            "42501": (403, "Necesitas una cuenta activa y aprobación para usar trabajador"),
            "22023": (422, "Selecciona un modo válido"),
        }.get(code, (502, "No se pudo consultar o cambiar el modo de la cuenta"))
        raise HTTPException(status, message)
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de modos inválida") from exc


@router.get("/modos", response_model=ModeStatus)
async def modes(user: CurrentUser, credentials: BearerToken, gateway: AuthGateway):
    value = await rpc("consultar_modos_cuenta", {}, user, credentials, gateway)
    try:
        result = ModeStatus.model_validate(value)
        if result.rol_activo != user.rol:
            raise ValueError("La cuenta cambió de modo; vuelve a consultar")
        return result
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de modos inválida; actualiza tu perfil") from exc


@router.post("/modo", response_model=User)
async def change_mode(
    body: ModeChange, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
):
    value = await rpc("cambiar_modo_cuenta", {"p_rol": body.rol}, user, credentials, gateway)
    try:
        if not isinstance(value, list) or len(value) != 1:
            raise ValueError
        result = User.model_validate(value[0])
        if result.id != user.id or result.rol != body.rol or not result.activo:
            raise ValueError
        return result
    except ValueError as exc:
        raise HTTPException(502, "No se pudo comprobar el cambio; actualiza tu perfil") from exc
