from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, field_validator, model_validator


class WorkerRoleRequestResponse(BaseModel):
    id: UUID
    usuario_id: UUID
    estado: Literal["PENDIENTE", "APROBADA", "RECHAZADA"]
    motivo_rechazo: str | None
    revisado_por: UUID | None = None
    revisado_en: datetime | None = None
    creado_en: datetime
    actualizado_en: datetime


class WorkerRoleReviewRequest(BaseModel):
    estado: Literal["APROBADA", "RECHAZADA"]
    motivo_rechazo: str | None = None

    @field_validator("motivo_rechazo")
    @classmethod
    def normalize_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def validate_reason(self) -> Self:
        if self.estado == "RECHAZADA" and self.motivo_rechazo is None:
            raise ValueError("Debe indicar el motivo del rechazo")
        if self.estado == "APROBADA" and self.motivo_rechazo is not None:
            raise ValueError("Una aprobación no debe incluir motivo de rechazo")
        return self
