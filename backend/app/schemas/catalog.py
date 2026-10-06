from datetime import datetime
from enum import StrEnum
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, model_validator

ServiceName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=3, max_length=120),
]
ServiceDescription = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=10, max_length=1000),
]
PublicLocationText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=5, max_length=240)
]


class ServiceModality(StrEnum):
    DOMICILIO = "DOMICILIO"
    TALLER = "TALLER"


class CategoryResponse(BaseModel):
    id: UUID
    slug: str
    nombre: str
    descripcion: str
    requiere_certificacion: bool
    certificacion_requerida: str | None
    orden: int


class CatalogCommuneResponse(BaseModel):
    id: UUID
    nombre: str


class CatalogWorkerResponse(BaseModel):
    id: UUID
    nombre: str
    comuna: CatalogCommuneResponse | None


class ServiceCreate(BaseModel):
    categoria_id: UUID
    nombre: ServiceName
    descripcion: ServiceDescription
    precio_base: int = Field(gt=0)
    duracion_estimada_minutos: int = Field(gt=0)
    modalidad: ServiceModality
    ubicacion_publica: PublicLocationText
    latitud: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitud: float = Field(ge=-180, le=180, allow_inf_nan=False)
    radio_cobertura_km: int | None = Field(default=None, ge=1, le=100)

    @model_validator(mode="after")
    def validate_coverage(self) -> Self:
        if self.modalidad == ServiceModality.DOMICILIO and self.radio_cobertura_km is None:
            raise ValueError("Indica el radio de cobertura del servicio a domicilio")
        if self.modalidad == ServiceModality.TALLER and self.radio_cobertura_km is not None:
            raise ValueError("Un servicio de taller no tiene radio de cobertura")
        return self


class ServiceUpdate(BaseModel):
    categoria_id: UUID | None = None
    nombre: ServiceName | None = None
    descripcion: ServiceDescription | None = None
    precio_base: int | None = Field(default=None, gt=0)
    duracion_estimada_minutos: int | None = Field(default=None, gt=0)
    modalidad: ServiceModality | None = None
    activo: bool | None = None
    ubicacion_publica: PublicLocationText | None = None
    latitud: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitud: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    radio_cobertura_km: int | None = Field(default=None, ge=1, le=100)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Debes indicar al menos un campo para actualizar")
        if any(
            getattr(self, field) is None
            for field in self.model_fields_set
            if field != "radio_cobertura_km"
        ):
            raise ValueError("Los campos de un servicio no pueden ser null")
        return self


class ServiceResponse(BaseModel):
    id: UUID
    trabajador_id: UUID
    categoria_id: UUID
    nombre: str
    descripcion: str
    precio_base: int
    duracion_estimada_minutos: int
    modalidad: ServiceModality
    activo: bool
    creado_en: datetime
    actualizado_en: datetime
    ubicacion_publica: str | None = None
    latitud: float | None = None
    longitud: float | None = None
    radio_cobertura_km: int | None = None


class CatalogServiceResponse(BaseModel):
    id: UUID
    nombre: str
    descripcion: str
    precio_base: int
    duracion_estimada_minutos: int
    modalidad: ServiceModality
    categoria: CategoryResponse
    trabajador: CatalogWorkerResponse
    creado_en: datetime
    actualizado_en: datetime
    ubicacion_publica: str | None = None
    latitud: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitud: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    radio_cobertura_km: int | None = Field(default=None, ge=1, le=100)


class CatalogServiceListResponse(BaseModel):
    items: list[CatalogServiceResponse]
    total: int
    limit: int
    offset: int
