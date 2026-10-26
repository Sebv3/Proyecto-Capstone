from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.core.security import AuthGateway, BearerToken
from app.routers.bookings import CurrentUser, _parse, _role, _token
from app.schemas.payment import PaymentSummary, SimulatedPaymentRequest
from app.schemas.user import UserRole

router = APIRouter(prefix="/api/v1/solicitudes", tags=["Pagos simulados"])


async def _payment_rpc(gateway: AuthGateway, token: str, name: str, booking_id: UUID):
    response = await gateway.request(
        "POST", f"/rest/v1/rpc/{name}", access_token=token,
        json={"p_solicitud_id": str(booking_id)},
    )
    if response.status_code >= 400:
        try:
            code = response.json().get("code")
        except (ValueError, AttributeError):
            code = None
        if code in ("PGRST202", "42P01", "42703"):
            raise HTTPException(503, "Falta aplicar la migración de pagos simulados")
        if code == "P0002":
            raise HTTPException(404, "Solicitud no encontrada")
        if code == "42501" or response.status_code in (401, 403):
            raise HTTPException(403, "No tienes permiso para realizar esta operación")
        if code in ("PT409", "23505", "40001"):
            raise HTTPException(409, "La solicitud ya no admite pago; actualiza su estado")
        raise HTTPException(502, "No se pudo procesar el pago simulado")
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de pago inválida") from exc


@router.get("/{booking_id}/pago", response_model=PaymentSummary)
async def payment_summary(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
) -> PaymentSummary:
    if user.rol not in (UserRole.CLIENTE, UserRole.TRABAJADOR):
        raise HTTPException(403, "Esta operación requiere un participante")
    result = _parse(PaymentSummary, await _payment_rpc(
        gateway, _token(credentials), "consultar_pago_solicitud", booking_id,
    ))
    if result.pago and (result.pago.solicitud_id != booking_id
                       or user.id not in (result.pago.cliente_id, result.pago.trabajador_id)):
        raise HTTPException(502, "Respuesta de pago inválida")
    return result


@router.post("/{booking_id}/pago/simular", deprecated=True)
async def simulate_payment(
    booking_id: UUID, body: SimulatedPaymentRequest,
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
):
    _role(user, UserRole.CLIENTE)
    raise HTTPException(409, "Completa el pago de prueba mediante Mercado Pago")
