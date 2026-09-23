import re
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.schemas.client_profile import Address
from app.schemas.user import ChileanRut, User, UserName

Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=3,
        max_length=320,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    ),
]


class RegisterRequest(BaseModel):
    email: Email
    password: str = Field(min_length=8)
    nombre: UserName
    rut: ChileanRut
    rol: Literal["CLIENTE", "TRABAJADOR"]
    direccion: Address | None = None
    comuna_id: UUID | None = None

    @field_validator("rut", mode="before")
    @classmethod
    def normalize_rut(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        clean = re.sub(r"[.\s-]", "", value.upper())
        return f"{clean[:-1]}-{clean[-1:]}"

    @field_validator("rut")
    @classmethod
    def validate_rut(cls, value: str) -> str:
        body, check_digit = value.split("-")
        total = sum(int(digit) * (2 + index % 6) for index, digit in enumerate(reversed(body)))
        remainder = 11 - total % 11
        expected = {11: "0", 10: "K"}.get(remainder, str(remainder))
        if check_digit != expected:
            raise ValueError("El dígito verificador del RUT no es válido")
        return value

    @model_validator(mode="after")
    def require_client_profile(self) -> Self:
        if self.rol == "CLIENTE" and (self.direccion is None or self.comuna_id is None):
            raise ValueError("Los clientes deben indicar dirección y comuna")
        if self.rol == "TRABAJADOR" and (
            self.direccion is not None or self.comuna_id is not None
        ):
            raise ValueError("El perfil de trabajador se completa después del registro")
        return self


class LoginRequest(BaseModel):
    email: Email
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class SessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int


class RegisterResponse(BaseModel):
    user_id: UUID
    session: SessionResponse | None
    email_confirmation_required: bool


class MeResponse(BaseModel):
    user: User
