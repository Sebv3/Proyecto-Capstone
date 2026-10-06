from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Self
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.schemas.catalog import ServiceModality

BookingAddress = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=5, max_length=240)
]
BookingReason = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)
]


class BookingStatus(StrEnum):
    PENDIENTE = "PENDIENTE"
    ACEPTADA = "ACEPTADA"
    PAGADA = "PAGADA"
    EN_CAMINO = "EN_CAMINO"
    EN_CURSO = "EN_CURSO"
    LISTO = "LISTO"
    COMPLETADA = "COMPLETADA"
    RECHAZADA = "RECHAZADA"
    CANCELADA = "CANCELADA"


class BookingCreate(BaseModel):
    """Client input; ownership, modality and offer snapshots come from the backend."""

    model_config = ConfigDict(extra="forbid")

    servicio_id: UUID
    inicio_en: AwareDatetime
    direccion_servicio: BookingAddress | None = None

    @field_validator("inicio_en")
    @classmethod
    def require_future_start(cls, value: datetime) -> datetime:
        if value <= datetime.now(UTC):
            raise ValueError("La fecha y hora deben ser futuras")
        return value.astimezone(UTC)


class BookingResponse(BaseModel):
    id: UUID
    servicio_id: UUID
    cliente_id: UUID
    trabajador_id: UUID
    servicio_nombre: str
    precio_base: int = Field(gt=0)
    duracion_estimada_minutos: int = Field(gt=0)
    modalidad: ServiceModality
    inicio_en: AwareDatetime
    ubicacion_servicio: BookingAddress
    estado: BookingStatus
    motivo_cancelacion: BookingReason | None = None
    creado_en: AwareDatetime
    actualizado_en: AwareDatetime

    @model_validator(mode="after")
    def require_consistent_state(self) -> Self:
        if self.cliente_id == self.trabajador_id:
            raise ValueError("El cliente y el trabajador deben ser distintos")
        if self.modalidad == ServiceModality.TALLER and self.estado == BookingStatus.EN_CAMINO:
            raise ValueError("Un servicio de taller no utiliza EN_CAMINO")
        if self.modalidad == ServiceModality.DOMICILIO and self.estado == BookingStatus.LISTO:
            raise ValueError("Un servicio a domicilio no utiliza LISTO")
        if (self.estado == BookingStatus.CANCELADA) != (self.motivo_cancelacion is not None):
            raise ValueError("El motivo de cancelación corresponde solo a una solicitud cancelada")
        return self


class BookingCancel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    motivo: BookingReason


class BookingComplete(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: Annotated[str, StringConstraints(pattern=r"^[0-9]{6}$")]


class AvailabilityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inicio_en: AwareDatetime
    fin_en: AwareDatetime

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.inicio_en <= datetime.now(UTC) or self.fin_en <= self.inicio_en:
            raise ValueError("Indica un bloque futuro con término posterior al inicio")
        return self


class AvailabilityResponse(BaseModel):
    id: UUID
    servicio_id: UUID
    inicio_en: AwareDatetime
    fin_en: AwareDatetime


class ConfirmationCodeResponse(BaseModel):
    codigo: str
    expira_en: AwareDatetime
