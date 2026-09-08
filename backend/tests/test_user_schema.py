from datetime import UTC, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas.user import User, UserRole


def valid_user_data() -> dict[str, object]:
    now = datetime.now(UTC)
    return {
        "id": "4d5bd8f6-6c81-4fa5-87ed-cf181228f43f",
        "email": "cliente@servimatch.cl",
        "nombre": "  Ana Pérez  ",
        "rut": "12345678-5",
        "telefono": "+569 12345678",
        "avatar_url": None,
        "rol": "CLIENTE",
        "activo": True,
        "creado_en": now,
        "actualizado_en": now,
    }


def test_user_accepts_client_profile() -> None:
    user = User.model_validate(valid_user_data())

    assert user.id == UUID("4d5bd8f6-6c81-4fa5-87ed-cf181228f43f")
    assert user.nombre == "Ana Pérez"
    assert user.rol is UserRole.CLIENTE


def test_user_accepts_worker_role() -> None:
    data = valid_user_data()
    data["rol"] = "TRABAJADOR"

    user = User.model_validate(data)

    assert user.rol is UserRole.TRABAJADOR


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("rol", "SUPERUSUARIO"),
        ("rut", "12.345.678-5"),
        ("telefono", "123"),
    ],
)
def test_user_rejects_invalid_profile_data(field: str, value: str) -> None:
    data = valid_user_data()
    data[field] = value

    with pytest.raises(ValidationError):
        User.model_validate(data)
