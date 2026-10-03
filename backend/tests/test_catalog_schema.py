from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas.catalog import ServiceCreate, ServiceModality, ServiceUpdate

CATEGORY_ID = UUID("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")


def test_service_create_normalizes_text_and_accepts_modalities() -> None:
    for modality in ServiceModality:
        service = ServiceCreate(
            categoria_id=CATEGORY_ID,
            nombre="  Instalación de enchufes  ",
            descripcion="  Instalación domiciliaria de enchufes certificados.  ",
            precio_base=25000,
            duracion_estimada_minutos=90,
            modalidad=modality,
        )
        assert service.nombre == "Instalación de enchufes"
        assert service.descripcion.startswith("Instalación domiciliaria")
        assert service.modalidad == modality


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("nombre", "x"),
        ("descripcion", "corta"),
        ("precio_base", 0),
        ("duracion_estimada_minutos", 0),
        ("modalidad", "REMOTO"),
    ],
)
def test_service_create_rejects_invalid_values(field: str, value: object) -> None:
    data = {
        "categoria_id": CATEGORY_ID,
        "nombre": "Reparación de puerta",
        "descripcion": "Reparación completa de puerta de madera.",
        "precio_base": 30000,
        "duracion_estimada_minutos": 120,
        "modalidad": "DOMICILIO",
    }
    data[field] = value
    with pytest.raises(ValidationError):
        ServiceCreate.model_validate(data)


def test_service_update_requires_at_least_one_field() -> None:
    with pytest.raises(ValidationError):
        ServiceUpdate()
    assert ServiceUpdate(activo=False).activo is False


@pytest.mark.parametrize(
    "field",
    [
        "categoria_id",
        "nombre",
        "descripcion",
        "precio_base",
        "duracion_estimada_minutos",
        "modalidad",
        "activo",
    ],
)
def test_service_update_rejects_explicit_null(field: str) -> None:
    with pytest.raises(ValidationError):
        ServiceUpdate.model_validate({field: None})
