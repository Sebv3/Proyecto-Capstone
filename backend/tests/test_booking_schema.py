from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.booking import BookingCreate, BookingResponse


def test_booking_start_is_future_and_normalized_to_utc():
    start = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    booking = BookingCreate(servicio_id=uuid4(), inicio_en=start,
                            direccion_servicio="  Avenida Central 123  ")
    assert booking.inicio_en.tzinfo == UTC
    assert booking.direccion_servicio == "Avenida Central 123"


@pytest.mark.parametrize("start", [
    "2020-01-01T10:00:00Z", "2099-01-01T10:00:00", "invalid",
])
def test_booking_rejects_past_or_ambiguous_start(start):
    with pytest.raises(ValidationError):
        BookingCreate(servicio_id=uuid4(), inicio_en=start)


@pytest.mark.parametrize("field", [
    "cliente_id", "trabajador_id", "estado", "precio_base", "modalidad",
])
def test_client_cannot_supply_ownership_state_or_offer_snapshots(field):
    with pytest.raises(ValidationError):
        BookingCreate.model_validate({
            "servicio_id": str(uuid4()), "inicio_en": "2099-01-01T10:00:00-03:00",
            field: "forged",
        })


def response_values():
    return {
        "id": uuid4(), "servicio_id": uuid4(), "cliente_id": uuid4(),
        "trabajador_id": uuid4(), "servicio_nombre": "Reparacion de puerta",
        "precio_base": 20000, "duracion_estimada_minutos": 60, "modalidad": "DOMICILIO",
        "inicio_en": "2099-01-01T10:00:00-03:00", "ubicacion_servicio": "Avenida Central 123",
        "estado": "PENDIENTE", "creado_en": "2026-10-06T10:00:00Z",
        "actualizado_en": "2026-10-06T10:00:00Z",
    }


@pytest.mark.parametrize("change", [
    {"modalidad": "DOMICILIO", "estado": "LISTO"},
    {"modalidad": "TALLER", "estado": "EN_CAMINO"},
    {"estado": "CANCELADA"},
    {"motivo_cancelacion": "Cambio de planes"},
    {"estado": "CANCELADA", "motivo_cancelacion": "   "},
])
def test_response_rejects_inconsistent_modality_and_cancellation(change):
    with pytest.raises(ValidationError):
        BookingResponse.model_validate({**response_values(), **change})


def test_response_preserves_history_and_validates_participants():
    values = response_values()
    # Historical starts must remain readable; future-only validation is for creation.
    booking = BookingResponse.model_validate({
        **values, "inicio_en": "2020-01-01T10:00:00Z", "estado": "CANCELADA",
        "motivo_cancelacion": "Cambio de planes",
    })
    assert booking.precio_base == 20000
    with pytest.raises(ValidationError):
        BookingResponse.model_validate({**values, "cliente_id": values["trabajador_id"]})
