from typing import Annotated
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, field_validator

Rating = Annotated[int, Field(strict=True, ge=1, le=5)]
Comment = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    puntuacion: Rating
    comentario: Comment | None = None

    @field_validator("comentario")
    @classmethod
    def normalize_comment(cls, value: str | None) -> str | None:
        return value or None


class PublicReview(BaseModel):
    id: UUID
    puntuacion: Rating
    comentario: Comment | None
    servicio_nombre: str
    creado_en: AwareDatetime


class ReviewResponse(PublicReview):
    solicitud_id: UUID
    cliente_id: UUID
    trabajador_id: UUID
    servicio_id: UUID


class WorkerReviews(BaseModel):
    trabajador_id: UUID
    promedio: float | None = Field(ge=1, le=5)
    cantidad: int = Field(ge=0)
    items: list[PublicReview]
    limit: int
    offset: int
    has_more: bool
