from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field


class EarningsDay(BaseModel):
    fecha: date
    monto: int = Field(ge=0)


class EarningsItem(BaseModel):
    solicitud_id: UUID
    servicio_nombre: str
    estado: Literal["PAGADA", "EN_CAMINO", "EN_CURSO", "LISTO", "COMPLETADA"]
    monto: int = Field(gt=0)
    fecha: AwareDatetime
    completada: bool


class WorkerEarnings(BaseModel):
    mes: str
    moneda: Literal["CLP"]
    simulado: Literal[True]
    total_completado: int = Field(ge=0)
    cantidad_completada: int = Field(ge=0)
    total_en_curso: int = Field(ge=0)
    cantidad_en_curso: int = Field(ge=0)
    dias: list[EarningsDay]
    items: list[EarningsItem]
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)
    has_more: bool
