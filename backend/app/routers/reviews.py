from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response

from app.core.security import AuthGateway, BearerToken
from app.routers.bookings import CurrentUser, _parse, _role, _token
from app.schemas.review import ReviewCreate, ReviewResponse, WorkerReviews
from app.schemas.user import UserRole

router = APIRouter(prefix="/api/v1", tags=["Calificaciones"])


async def _rpc(gateway, token, name, body):
    response = await gateway.request("POST", f"/rest/v1/rpc/{name}",
                                     access_token=token, json=body)
    if response.status_code >= 400:
        try:
            code = response.json().get("code")
        except (AttributeError, ValueError):
            code = None
        status, detail = {
            "PGRST202": (503, "Falta aplicar la migración de calificaciones"),
            "P0002": (404, "Solicitud o trabajador no disponible"),
            "42501": (403, "Solo el cliente dueño puede calificar el servicio"),
            "PT409": (409, "Solo se califica una vez una solicitud completada"),
            "23505": (409, "La solicitud ya tiene una calificación"),
            "22023": (422, "Revisa la puntuación y el comentario"),
        }.get(code, (502, "No se pudo consultar o guardar la calificación"))
        raise HTTPException(status, detail)
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de calificación inválida") from exc


@router.post(
    "/solicitudes/{booking_id}/calificacion", response_model=ReviewResponse, status_code=201,
)
async def create_review(
    booking_id: UUID, body: ReviewCreate, response: Response,
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
) -> ReviewResponse:
    _role(user, UserRole.CLIENTE)
    result = await _rpc(gateway, _token(credentials), "crear_calificacion", {
        "p_solicitud_id": str(booking_id), "p_puntuacion": body.puntuacion,
        "p_comentario": body.comentario,
    })
    if not isinstance(result, dict) or type(result.get("creada")) is not bool:
        raise HTTPException(502, "Respuesta de calificación inválida")
    review = _parse(ReviewResponse, result.get("calificacion"))
    if review.solicitud_id != booking_id or review.cliente_id != user.id:
        raise HTTPException(502, "Respuesta de calificación inválida")
    response.status_code = 201 if result["creada"] else 200
    return review


@router.get("/solicitudes/{booking_id}/calificacion", response_model=ReviewResponse | None)
async def get_review(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
) -> ReviewResponse | None:
    value = await _rpc(gateway, _token(credentials), "consultar_calificacion_solicitud", {
        "p_solicitud_id": str(booking_id),
    })
    if not isinstance(value, dict) or "calificacion" not in value:
        raise HTTPException(502, "Respuesta de calificación inválida")
    if value["calificacion"] is None:
        return None
    review = _parse(ReviewResponse, value["calificacion"])
    if (review.solicitud_id != booking_id
        or user.id not in (review.cliente_id, review.trabajador_id)):
        raise HTTPException(502, "Respuesta de calificación inválida")
    return review


@router.get("/trabajadores/{worker_id}/calificaciones", response_model=WorkerReviews)
async def worker_reviews(
    worker_id: UUID, gateway: AuthGateway,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> WorkerReviews:
    value = await _rpc(gateway, None, "consultar_calificaciones_trabajador", {
        "p_trabajador_id": str(worker_id), "p_limit": limit, "p_offset": offset,
    })
    result = _parse(WorkerReviews, value)
    if result.trabajador_id != worker_id:
        raise HTTPException(502, "Respuesta de calificación inválida")
    return result
