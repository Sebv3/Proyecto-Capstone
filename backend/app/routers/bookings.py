import secrets
from datetime import UTC
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime, TypeAdapter

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.schemas.booking import (
    AvailabilityCreate,
    AvailabilityResponse,
    BookingCancel,
    BookingComplete,
    BookingCreate,
    BookingResponse,
    BookingStatus,
    ConfirmationCodeResponse,
)
from app.schemas.user import User, UserRole
from app.services.booking_states import BookingActor, transition_booking

router = APIRouter(prefix="/api/v1", tags=["Solicitudes y agenda"])
CurrentUser = Annotated[User, Depends(get_current_user)]
BOOKING_FIELDS = (
    "id,servicio_id,cliente_id,trabajador_id,servicio_nombre,precio_base,"
    "duracion_estimada_minutos,modalidad,inicio_en,ubicacion_servicio,estado,"
    "motivo_cancelacion,creado_en,actualizado_en"
)


def _token(credentials: BearerToken) -> str:
    if credentials is None:
        raise HTTPException(401, "Se requiere un token Bearer")
    return credentials.credentials


def _error(response: Any) -> None:
    if response.status_code < 400:
        return
    try:
        code = response.json().get("code")
    except (AttributeError, TypeError, ValueError):
        code = None
    if code == "PGRST202":
        raise HTTPException(503, "Falta aplicar la migración de solicitudes y agenda")
    if code == "P0002":
        raise HTTPException(404, "Solicitud, servicio o bloque no disponible")
    if code == "42501" or response.status_code in (401, 403):
        raise HTTPException(403, "No tienes permiso para realizar esta operación")
    if code in ("PT409", "40001", "23P01", "23505"):
        raise HTTPException(
            409, "El horario o estado ya no está disponible; actualiza la solicitud"
        )
    if code in ("22023", "23514", "23502"):
        raise HTTPException(422, "Revisa la fecha, dirección y datos de la solicitud")
    raise HTTPException(502, "No se pudo procesar la operación en Supabase")


async def _rpc(gateway: AuthGateway, token: str | None, name: str, body: dict) -> Any:
    response = await gateway.request(
        "POST", f"/rest/v1/rpc/{name}", json=body, access_token=token
    )
    _error(response)
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de Supabase inválida") from exc


def _parse(model: Any, value: Any) -> Any:
    try:
        return TypeAdapter(model).validate_python(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(502, "Respuesta de Supabase inválida") from exc


def _one(model: Any, rows: Any) -> Any:
    if not isinstance(rows, list) or len(rows) != 1:
        raise HTTPException(502, "Respuesta de Supabase inválida")
    return _parse(model, rows[0])


def _role(user: User, role: UserRole) -> None:
    if user.rol != role:
        raise HTTPException(403, "Esta operación no corresponde a tu rol")


async def _read(booking_id: UUID, user: User, gateway: AuthGateway, token: str) -> BookingResponse:
    response = await gateway.request(
        "GET", "/rest/v1/solicitudes", access_token=token,
        params={"id": f"eq.{booking_id}", "select": BOOKING_FIELDS},
    )
    _error(response)
    try:
        rows = response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de Supabase inválida") from exc
    if rows == []:
        raise HTTPException(404, "Solicitud no encontrada")
    booking = _one(BookingResponse, rows)
    if user.id not in (booking.cliente_id, booking.trabajador_id):
        raise HTTPException(404, "Solicitud no encontrada")
    return booking


@router.post("/solicitudes", response_model=BookingResponse, status_code=201)
async def create_booking(
    body: BookingCreate, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> BookingResponse:
    _role(user, UserRole.CLIENTE)
    rows = await _rpc(gateway, _token(credentials), "crear_solicitud", {
        "p_servicio_id": str(body.servicio_id), "p_inicio_en": body.inicio_en.isoformat(),
        "p_direccion_servicio": body.direccion_servicio,
    })
    booking = _one(BookingResponse, rows)
    if booking.cliente_id != user.id:
        raise HTTPException(502, "Respuesta de Supabase inválida")
    return booking


@router.get("/solicitudes", response_model=list[BookingResponse])
async def list_bookings(
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
    estado: BookingStatus | None = None,
    desde: AwareDatetime | None = None,
    hasta: AwareDatetime | None = None,
    agenda: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[BookingResponse]:
    if user.rol not in (UserRole.CLIENTE, UserRole.TRABAJADOR):
        raise HTTPException(403, "Esta operación requiere un participante")
    if desde is not None and hasta is not None and hasta <= desde:
        raise HTTPException(422, "El término del rango debe ser posterior al inicio")
    if agenda:
        _role(user, UserRole.TRABAJADOR)
    field = "cliente_id" if user.rol == UserRole.CLIENTE else "trabajador_id"
    params = {
        field: f"eq.{user.id}", "select": BOOKING_FIELDS, "order": "inicio_en.asc,id.asc",
        "limit": str(limit), "offset": str(offset),
    }
    if estado is not None:
        params["estado"] = f"eq.{estado.value}"
    if agenda:
        states = "ACEPTADA,PAGADA,EN_CAMINO,EN_CURSO,LISTO,COMPLETADA"
        params["and"] = f"(estado.in.({states}))"
    ranges = []
    if desde is not None:
        ranges.append(f"inicio_en.gte.{desde.astimezone(UTC).isoformat()}")
    if hasta is not None:
        ranges.append(f"inicio_en.lt.{hasta.astimezone(UTC).isoformat()}")
    if ranges:
        if agenda:
            ranges.insert(0, f"estado.in.({states})")
        params["and"] = f"({','.join(ranges)})"
    response = await gateway.request(
        "GET", "/rest/v1/solicitudes", params=params, access_token=_token(credentials)
    )
    _error(response)
    try:
        rows = response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de Supabase inválida") from exc
    bookings = _parse(list[BookingResponse], rows)
    if any(getattr(item, field) != user.id for item in bookings):
        raise HTTPException(502, "Respuesta de Supabase inválida")
    return bookings


@router.get("/solicitudes/{booking_id}", response_model=BookingResponse)
async def get_booking(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> BookingResponse:
    return await _read(booking_id, user, gateway, _token(credentials))


async def _change(
    booking_id: UUID, target: BookingStatus, user: User, gateway: AuthGateway, token: str,
    reason: str | None = None,
) -> BookingResponse:
    booking = await _read(booking_id, user, gateway, token)
    actor = BookingActor.TRABAJADOR if user.id == booking.trabajador_id else BookingActor.CLIENTE
    if actor == BookingActor.TRABAJADOR:
        _role(user, UserRole.TRABAJADOR)
    try:
        transition_booking(booking.estado, target, booking.modalidad, actor,
                           cancellation_reason=reason)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    rows = await _rpc(gateway, token, "cambiar_estado_solicitud", {
        "p_solicitud_id": str(booking_id), "p_estado_esperado": booking.estado.value,
        "p_destino": target.value, "p_motivo": reason,
    })
    return _one(BookingResponse, rows)


@router.post("/solicitudes/{booking_id}/aceptar", response_model=BookingResponse)
async def accept_booking(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> BookingResponse:
    _role(user, UserRole.TRABAJADOR)
    return await _change(booking_id, BookingStatus.ACEPTADA, user, gateway, _token(credentials))


@router.post("/solicitudes/{booking_id}/rechazar", response_model=BookingResponse)
async def reject_booking(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> BookingResponse:
    _role(user, UserRole.TRABAJADOR)
    return await _change(booking_id, BookingStatus.RECHAZADA, user, gateway, _token(credentials))


@router.post("/solicitudes/{booking_id}/en-camino", response_model=BookingResponse)
async def travel_booking(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> BookingResponse:
    _role(user, UserRole.TRABAJADOR)
    return await _change(booking_id, BookingStatus.EN_CAMINO, user, gateway, _token(credentials))


@router.post("/solicitudes/{booking_id}/iniciar", response_model=BookingResponse)
async def start_booking(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> BookingResponse:
    _role(user, UserRole.TRABAJADOR)
    return await _change(booking_id, BookingStatus.EN_CURSO, user, gateway, _token(credentials))


@router.post("/solicitudes/{booking_id}/listo", response_model=BookingResponse)
async def ready_booking(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> BookingResponse:
    _role(user, UserRole.TRABAJADOR)
    return await _change(booking_id, BookingStatus.LISTO, user, gateway, _token(credentials))


@router.post("/solicitudes/{booking_id}/cancelar", response_model=BookingResponse)
async def cancel_booking(
    booking_id: UUID, body: BookingCancel,
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> BookingResponse:
    return await _change(booking_id, BookingStatus.CANCELADA, user, gateway,
                         _token(credentials), body.motivo)


@router.post("/solicitudes/{booking_id}/codigo-confirmacion",
             response_model=ConfirmationCodeResponse)
async def confirmation_code(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> ConfirmationCodeResponse:
    _role(user, UserRole.TRABAJADOR)
    token = _token(credentials)
    booking = await _read(booking_id, user, gateway, token)
    if booking.trabajador_id != user.id:
        raise HTTPException(403, "Solo el trabajador puede generar el código")
    code = f"{secrets.randbelow(1000000):06d}"
    expires = await _rpc(gateway, token, "generar_codigo_solicitud", {
        "p_solicitud_id": str(booking_id), "p_codigo": code,
    })
    return _parse(ConfirmationCodeResponse, {"codigo": code, "expira_en": expires})


@router.post("/solicitudes/{booking_id}/completar", response_model=BookingResponse)
async def complete_booking(
    booking_id: UUID, body: BookingComplete,
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> BookingResponse:
    token = _token(credentials)
    booking = await _read(booking_id, user, gateway, token)
    if booking.cliente_id != user.id:
        raise HTTPException(403, "Solo el cliente puede confirmar la finalización")
    try:
        transition_booking(booking.estado, BookingStatus.COMPLETADA, booking.modalidad,
                           BookingActor.CONFIRMACION)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    result = await _rpc(gateway, token, "completar_solicitud", {
        "p_solicitud_id": str(booking_id), "p_codigo": body.codigo,
    })
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(409, "Código incorrecto, vencido o bloqueado; consulta al trabajador")
    return _parse(BookingResponse, result)


@router.get("/servicios/{service_id}/disponibilidad", response_model=list[AvailabilityResponse])
async def availability(service_id: UUID, gateway: AuthGateway) -> list[AvailabilityResponse]:
    rows = await _rpc(gateway, None, "consultar_disponibilidad", {"p_servicio_id": str(service_id)})
    return _parse(list[AvailabilityResponse], rows)


@router.post("/trabajador/servicios/{service_id}/disponibilidad",
             response_model=AvailabilityResponse, status_code=201)
async def add_availability(
    service_id: UUID, body: AvailabilityCreate,
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> AvailabilityResponse:
    _role(user, UserRole.TRABAJADOR)
    rows = await _rpc(gateway, _token(credentials), "gestionar_disponibilidad", {
        "p_servicio_id": str(service_id), "p_inicio_en": body.inicio_en.isoformat(),
        "p_fin_en": body.fin_en.isoformat(), "p_bloque_id": None,
    })
    return _one(AvailabilityResponse, rows)


@router.delete("/trabajador/servicios/{service_id}/disponibilidad/{block_id}",
               response_model=AvailabilityResponse)
async def remove_availability(
    service_id: UUID, block_id: UUID,
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> AvailabilityResponse:
    _role(user, UserRole.TRABAJADOR)
    rows = await _rpc(gateway, _token(credentials), "gestionar_disponibilidad", {
        "p_servicio_id": str(service_id), "p_bloque_id": str(block_id),
    })
    return _one(AvailabilityResponse, rows)
