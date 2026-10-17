from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.core.security import AuthGateway, BearerToken
from app.routers.bookings import CurrentUser, _parse, _role, _token
from app.schemas.earnings import WorkerEarnings
from app.schemas.user import UserRole

router = APIRouter(prefix="/api/v1/trabajadores/me", tags=["Ganancias"])


@router.get("/ganancias", response_model=WorkerEarnings)
async def worker_earnings(
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
    mes: Annotated[str, Query(pattern=r"^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$")],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> WorkerEarnings:
    _role(user, UserRole.TRABAJADOR)
    response = await gateway.request(
        "POST", "/rest/v1/rpc/consultar_ganancias_trabajador", access_token=_token(credentials),
        json={"p_mes": f"{mes}-01", "p_limit": limit, "p_offset": offset},
    )
    if response.status_code >= 400:
        try:
            code = response.json().get("code")
        except (ValueError, AttributeError):
            code = None
        status, detail = {
            "PGRST202": (503, "Falta aplicar la migración de ganancias"),
            "42501": (403, "Esta operación requiere una cuenta de trabajador activa"),
            "22023": (422, "Revisa el mes y la paginación"),
        }.get(code, (502, "No se pudieron consultar las ganancias"))
        raise HTTPException(status, detail)
    try:
        value = response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de ganancias inválida") from exc
    result = _parse(WorkerEarnings, value)
    if result.mes != mes or result.limit != limit or result.offset != offset:
        raise HTTPException(502, "Respuesta de ganancias inválida")
    return result
