from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class CertificationResponse(BaseModel):
    id: UUID
    trabajador_id: UUID
    categoria_id: UUID
    nombre: str
    estado: Literal["PENDIENTE", "APROBADA", "RECHAZADA"]
    motivo_rechazo: str | None
    creado_en: datetime
    actualizado_en: datetime


class CertificationDocumentResponse(BaseModel):
    url: str
    expires_in: int = 60
