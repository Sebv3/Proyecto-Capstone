from enum import StrEnum

from pydantic import TypeAdapter

from app.schemas.booking import BookingReason, BookingStatus
from app.schemas.catalog import ServiceModality


class BookingActor(StrEnum):
    CLIENTE = "CLIENTE"
    TRABAJADOR = "TRABAJADOR"
    PAGO = "PAGO"
    CONFIRMACION = "CONFIRMACION"


def transition_booking(
    current: BookingStatus,
    target: BookingStatus,
    modality: ServiceModality,
    actor: BookingActor,
    *,
    cancellation_reason: str | None = None,
) -> BookingStatus:
    """Validate a transition; callers must authenticate the actual participant.

    PAGO and CONFIRMACION are backend processes, never roles supplied by the app.
    Paid cancellations await the refund workflow; they are deliberately blocked.
    """
    # Explicit conversion rejects unknown strings instead of accepting an invalid state.
    current, target = BookingStatus(current), BookingStatus(target)
    modality, actor = ServiceModality(modality), BookingActor(actor)
    incompatible = (
        BookingStatus.LISTO if modality == ServiceModality.DOMICILIO else BookingStatus.EN_CAMINO
    )
    if incompatible in (current, target):
        raise ValueError("El estado no corresponde a la modalidad del servicio")

    allowed = {
        (BookingStatus.PENDIENTE, BookingStatus.ACEPTADA): BookingActor.TRABAJADOR,
        (BookingStatus.PENDIENTE, BookingStatus.RECHAZADA): BookingActor.TRABAJADOR,
        (BookingStatus.ACEPTADA, BookingStatus.PAGADA): BookingActor.PAGO,
    }
    if modality == ServiceModality.DOMICILIO:
        allowed.update({
            (BookingStatus.PAGADA, BookingStatus.EN_CAMINO): BookingActor.TRABAJADOR,
            (BookingStatus.EN_CAMINO, BookingStatus.EN_CURSO): BookingActor.TRABAJADOR,
            (BookingStatus.EN_CURSO, BookingStatus.COMPLETADA): BookingActor.CONFIRMACION,
        })
    else:
        allowed.update({
            (BookingStatus.PAGADA, BookingStatus.EN_CURSO): BookingActor.TRABAJADOR,
            (BookingStatus.EN_CURSO, BookingStatus.LISTO): BookingActor.TRABAJADOR,
            (BookingStatus.LISTO, BookingStatus.COMPLETADA): BookingActor.CONFIRMACION,
        })

    if target == BookingStatus.CANCELADA:
        if current not in (BookingStatus.PENDIENTE, BookingStatus.ACEPTADA) or actor not in (
            BookingActor.CLIENTE, BookingActor.TRABAJADOR
        ):
            raise ValueError("No se permite cancelar en este estado o con este actor")
        # Same validation as the persisted reason, including trimming and length bounds.
        TypeAdapter(BookingReason).validate_python(cancellation_reason)
    elif cancellation_reason is not None:
        raise ValueError("El motivo corresponde solo a una cancelación")
    elif allowed.get((current, target)) != actor:
        raise ValueError("La transición no está permitida para este estado y actor")
    return target
