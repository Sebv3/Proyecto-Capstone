from datetime import datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

UserName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=120),
]
ChileanRut = Annotated[
    str,
    StringConstraints(pattern=r"^[0-9]{7,8}-[0-9K]$"),
]
PhoneNumber = Annotated[
    str,
    StringConstraints(pattern=r"^[+]?[0-9 ]{8,15}$"),
]


class UserRole(StrEnum):
    CLIENTE = "CLIENTE"
    TRABAJADOR = "TRABAJADOR"
    ADMIN = "ADMIN"


class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str = Field(min_length=3, max_length=320)
    nombre: UserName
    rut: ChileanRut
    telefono: PhoneNumber | None = None
    avatar_url: str | None = None
    rol: UserRole
    activo: bool
    creado_en: datetime
    actualizado_en: datetime
