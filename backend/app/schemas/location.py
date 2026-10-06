from uuid import UUID

from pydantic import BaseModel, Field


class LocationServiceResponse(BaseModel):
    id: UUID
    nombre: str
    precio_base: int = Field(gt=0)
    categoria_id: UUID
    categoria_nombre: str


class LocationResponse(BaseModel):
    id: UUID
    trabajador_id: UUID
    nombre: str
    direccion_publica: str
    latitud: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitud: float = Field(ge=-180, le=180, allow_inf_nan=False)
    trabajador_nombre: str
    servicios: list[LocationServiceResponse] = Field(min_length=1)
