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


class ServiceUpdate(BaseModel):
    categoria_id: UUID | None = None
    nombre: ServiceName | None = None
    descripcion: ServiceDescription | None = None
    precio_base: int | None = Field(default=None, gt=0)
    duracion_estimada_minutos: int | None = Field(default=None, gt=0)
    modalidad: ServiceModality | None = None
    activo: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Debes indicar al menos un campo para actualizar")
        if any(getattr(self, field) is None for field in self.model_fields_set):
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


class CatalogServiceListResponse(BaseModel):
    items: list[CatalogServiceResponse]
    total: int
    limit: int
    offset: int
