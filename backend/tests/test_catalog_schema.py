from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas.catalog import ServiceCreate, ServiceModality, ServiceUpdate

CATEGORY_ID = UUID("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")


@pytest.mark.parametrize(
    "change",
    [
        {"ubicacion_publica": ""},
        {"latitud": None},
        {"longitud": None},
        {"latitud": 91},
        {"longitud": -181},
        {"latitud": float("inf")},
        {"radio_cobertura_km": None},
        {"radio_cobertura_km": 0},
        {"radio_cobertura_km": 101},
        {"modalidad": "TALLER", "radio_cobertura_km": 5},
    ],
)
def test_location_and_modality_coverage_are_validated(change):
    values = {
        "categoria_id": CATEGORY_ID,
        "nombre": "Reparacion",
        "descripcion": "Reparacion completa",
        "precio_base": 20000,
        "duracion_estimada_minutos": 60,
        "modalidad": "DOMICILIO",
        "ubicacion_publica": "Sector Plaza Central",
        "latitud": -33.45,
        "longitud": -70.66,
        "radio_cobertura_km": 5,
    }
    with pytest.raises(ValidationError):
        ServiceCreate.model_validate({**values, **change})


def test_service_create_normalizes_text_and_accepts_modalities() -> None:
    for modality in ServiceModality:
        service = ServiceCreate(
            categoria_id=CATEGORY_ID,
            nombre="  Instalación de enchufes  ",
            descripcion="  Instalación domiciliaria de enchufes certificados.  ",
            precio_base=25000,
            duracion_estimada_minutos=90,
            modalidad=modality,
            ubicacion_publica=" Sector Plaza Central ",
            latitud=-33.45,
            longitud=-70.66,
            radio_cobertura_km=5 if modality == ServiceModality.DOMICILIO else None,
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
        "ubicacion_publica": "Sector Plaza Central",
        "latitud": -33.45,
        "longitud": -70.66,
        "radio_cobertura_km": 5,
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
        "ubicacion_publica",
        "latitud",
        "longitud",
    ],
)
def test_service_update_rejects_explicit_null(field: str) -> None:
    with pytest.raises(ValidationError):
        ServiceUpdate.model_validate({field: None})


@pytest.mark.parametrize(
    ("field", "minimum", "maximum"),
    [("nombre", 3, 120), ("descripcion", 10, 1000), ("ubicacion_publica", 5, 240)],
)
def test_publication_text_boundaries_match_database(field, minimum, maximum) -> None:
    values = {
        "categoria_id": CATEGORY_ID, "nombre": "Reparacion",
        "descripcion": "Reparacion completa", "precio_base": 1,
        "duracion_estimada_minutos": 1, "modalidad": "TALLER",
        "ubicacion_publica": "Sector Plaza Central", "latitud": -90, "longitud": 180,
    }
    for length in (minimum, maximum):
        service = ServiceCreate.model_validate({**values, field: "x" * length})
        assert len(getattr(service, field)) == length
    for length in (minimum - 1, maximum + 1):
        with pytest.raises(ValidationError):
            ServiceCreate.model_validate({**values, field: "x" * length})


def test_update_serialization_preserves_explicit_radius_clear_and_omits_unset_fields() -> None:
    update = ServiceUpdate(modalidad="TALLER", radio_cobertura_km=None)
    assert update.model_dump(mode="json", exclude_unset=True) == {
        "modalidad": "TALLER", "radio_cobertura_km": None,
    }
