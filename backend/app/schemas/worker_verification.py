from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.client_profile import CommuneResponse

Address = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)]


class WorkerProfileAddress(BaseModel):
    direccion_base: Address
    comuna_id: UUID


class WorkerProfileResponse(BaseModel):
    usuario_id: UUID
    direccion_base: str
    comuna: CommuneResponse | None
    creado_en: datetime
    actualizado_en: datetime


class VerificationResponse(BaseModel):
    trabajador_id: UUID
    estado: str
    motivo_rechazo: str | None
    creado_en: datetime
    actualizado_en: datetime
