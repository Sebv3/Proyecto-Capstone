from datetime import datetime
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, StringConstraints, model_validator

from app.schemas.user import PhoneNumber, UserName

Address = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=5, max_length=200),
]


class CommuneResponse(BaseModel):
    id: UUID
    nombre: str


class ClientProfileCreate(BaseModel):
    direccion: Address
    comuna_id: UUID


class ClientProfileUpdate(BaseModel):
    nombre: UserName | None = None
    telefono: PhoneNumber | None = None
    direccion: Address | None = None
    comuna_id: UUID | None = None

    @model_validator(mode="after")
    def require_a_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Debes enviar al menos un dato para actualizar")
        return self


class ClientProfileResponse(BaseModel):
    usuario_id: UUID
    email: str
    nombre: str
    rut: str
    telefono: str | None
    avatar_url: str | None
    direccion: str
    comuna: CommuneResponse
    activo: bool
    creado_en: datetime
    actualizado_en: datetime
