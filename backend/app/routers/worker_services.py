from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import ValidationError

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.schemas.catalog import ServiceCreate, ServiceResponse, ServiceUpdate
from app.schemas.user import User, UserRole

router = APIRouter(prefix="/api/v1/trabajador/servicios", tags=["Servicios trabajador"])
CurrentUser = Annotated[User, Depends(get_current_user)]
SERVICE_FIELDS = (
    "id,trabajador_id,categoria_id,nombre,descripcion,precio_base,"
    "duracion_estimada_minutos,modalidad,activo,creado_en,actualizado_en,"
    "ubicacion_publica,latitud,longitud,radio_cobertura_km"
)


def _worker_token(user: User, credentials: BearerToken) -> str:
    if user.rol != UserRole.TRABAJADOR:
        raise HTTPException(status_code=403, detail="Esta operación requiere un trabajador")
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Se requiere un token Bearer")
    return credentials.credentials


def _database_error(response: Any, fallback: str) -> None:
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para realizar esta operación"
        )
    if response.status_code >= 500:
        raise HTTPException(status_code=502, detail="Supabase no está disponible")
    if response.status_code < 400:
        return

    try:
        message = str(response.json().get("message", ""))
    except (AttributeError, TypeError, ValueError):
        message = ""
    lowered = message.lower()
    if "certificacion aprobada" in lowered:
        raise HTTPException(
            status_code=403, detail="La categoría requiere una certificación aprobada"
        )
    if "maximo cinco" in lowered:
        raise HTTPException(status_code=409, detail="Ya tienes cinco servicios activos")
    if "verificacion aprobada" in lowered:
        raise HTTPException(
            status_code=403,
            detail="Tu verificación debe estar aprobada para publicar servicios",
        )
    if "categoria seleccionada" in lowered:
        raise HTTPException(status_code=422, detail="La categoría no está disponible")
    raise HTTPException(status_code=400, detail=fallback)


def _parse_service(row: Any) -> ServiceResponse:
    try:
        return ServiceResponse.model_validate(row)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de servicio inválida") from exc


async def _read_service(
    servicio_id: UUID, user: User, gateway: AuthGateway, token: str
) -> ServiceResponse:
    response = await gateway.request(
        "GET",
        "/rest/v1/servicios",
        params={
            "id": f"eq.{servicio_id}",
            "trabajador_id": f"eq.{user.id}",
            "select": SERVICE_FIELDS,
        },
        access_token=token,
    )
    _database_error(response, "No se pudo consultar el servicio")
    try:
        rows = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de servicio inválida") from exc
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return _parse_service(rows[0])


@router.get("", response_model=list[ServiceResponse])
async def list_own_services(
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> list[ServiceResponse]:
    token = _worker_token(user, credentials)
    response = await gateway.request(
        "GET",
        "/rest/v1/servicios",
        params={
            "trabajador_id": f"eq.{user.id}",
            "select": SERVICE_FIELDS,
            "order": "creado_en.desc",
        },
        access_token=token,
    )
    _database_error(response, "No se pudieron consultar tus servicios")
    try:
        rows = response.json()
        if not isinstance(rows, list):
            raise TypeError
        return [_parse_service(row) for row in rows]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de servicios inválida") from exc


@router.get("/{servicio_id}", response_model=ServiceResponse)
async def get_own_service(
    servicio_id: UUID,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
) -> ServiceResponse:
    token = _worker_token(user, credentials)
    return await _read_service(servicio_id, user, gateway, token)


@router.post("", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
async def create_own_service(
    body: ServiceCreate,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
) -> ServiceResponse:
    token = _worker_token(user, credentials)
    response = await gateway.request(
        "POST",
        "/rest/v1/servicios",
        json={"trabajador_id": str(user.id), **body.model_dump(mode="json")},
        access_token=token,
        extra_headers={"Prefer": "return=representation"},
    )
    _database_error(response, "No se pudo crear el servicio")
    try:
        rows = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de servicio inválida") from exc
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=502, detail="Supabase no devolvió el servicio creado")
    return _parse_service(rows[0])


@router.patch("/{servicio_id}", response_model=ServiceResponse)
async def update_own_service(
    servicio_id: UUID,
    body: ServiceUpdate,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
) -> ServiceResponse:
    token = _worker_token(user, credentials)
    existing = await _read_service(servicio_id, user, gateway, token)
    location_fields = {
        "modalidad",
        "ubicacion_publica",
        "latitud",
        "longitud",
        "radio_cobertura_km",
    }
    if body.model_fields_set & location_fields:
        try:
            ServiceCreate.model_validate(
                {
                    **existing.model_dump(),
                    **body.model_dump(exclude_unset=True),
                }
            )
        except ValidationError as exc:
            raise HTTPException(
                status_code=422, detail="Revisa la ubicación y la cobertura"
            ) from exc
    response = await gateway.request(
        "PATCH",
        "/rest/v1/servicios",
        params={"id": f"eq.{servicio_id}", "trabajador_id": f"eq.{user.id}"},
        json=body.model_dump(mode="json", exclude_unset=True),
        access_token=token,
        extra_headers={"Prefer": "return=representation"},
    )
    _database_error(response, "No se pudo actualizar el servicio")
    try:
        rows = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de servicio inválida") from exc
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=409, detail="El servicio cambió; vuelve a intentarlo")
    return _parse_service(rows[0])


@router.delete("/{servicio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_own_service(
    servicio_id: UUID,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
) -> Response:
    token = _worker_token(user, credentials)
    await _read_service(servicio_id, user, gateway, token)
    response = await gateway.request(
        "PATCH",
        "/rest/v1/servicios",
        params={"id": f"eq.{servicio_id}", "trabajador_id": f"eq.{user.id}"},
        json={"activo": False},
        access_token=token,
        extra_headers={"Prefer": "return=minimal"},
    )
    _database_error(response, "No se pudo desactivar el servicio")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
