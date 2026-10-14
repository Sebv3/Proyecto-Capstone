from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import AwareDatetime, BaseModel, ConfigDict, StringConstraints

from app.core.security import AuthGateway, BearerToken
from app.routers.bookings import CurrentUser, _parse, _token
from app.schemas.user import UserRole

router = APIRouter(prefix="/api/v1/solicitudes", tags=["Chat temporal"])
MessageText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]


class MessageEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contenido: MessageText


class MessageCreate(MessageEdit):
    id: UUID


class Message(BaseModel):
    id: UUID
    conversacion_id: UUID
    autor_id: UUID
    contenido: str
    creado_en: AwareDatetime
    editado_en: AwareDatetime | None


class ChatPage(BaseModel):
    solicitud_id: UUID
    conversacion_id: UUID | None
    contraparte_nombre: str
    servicio_nombre: str
    items: list[Message]
    limit: int
    offset: int
    has_more: bool


class Deleted(BaseModel):
    ok: Literal[True]


async def _rpc(user, credentials, gateway, booking_id, action, **values):
    if user.rol not in (UserRole.CLIENTE, UserRole.TRABAJADOR):
        raise HTTPException(403, "El chat requiere un participante")
    response = await gateway.request(
        "POST", "/rest/v1/rpc/gestionar_chat_solicitud", access_token=_token(credentials),
        json={"p_solicitud_id": str(booking_id), "p_accion": action, **values},
    )
    if response.status_code >= 400:
        try:
            code = response.json().get("code")
        except (AttributeError, ValueError):
            code = None
        status, detail = {
            "P0002": (404, "Solicitud o mensaje no encontrado"),
            "42501": (403, "No tienes acceso a este chat"),
            "PT410": (410, "El servicio terminó y su chat fue eliminado"),
            "PT409": (409, "El mensaje cambió; actualiza el chat"),
            "22023": (422, "Revisa el contenido del mensaje"),
            "PGRST202": (503, "Falta aplicar la migración del chat"),
        }.get(code, (502, "No se pudo consultar o actualizar el chat"))
        raise HTTPException(status, detail)
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de chat inválida") from exc


@router.post("/{booking_id}/chat", response_model=ChatPage)
async def open_chat(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
) -> ChatPage:
    return _parse(ChatPage, await _rpc(user, credentials, gateway, booking_id, "ABRIR"))


@router.get("/{booking_id}/chat", response_model=ChatPage)
async def read_chat(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ChatPage:
    return _parse(ChatPage, await _rpc(
        user, credentials, gateway, booking_id, "LEER", p_limit=limit, p_offset=offset,
    ))


@router.post("/{booking_id}/chat/mensajes", response_model=Message)
async def send_message(
    booking_id: UUID, body: MessageCreate,
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
) -> Message:
    return _parse(Message, await _rpc(
        user, credentials, gateway, booking_id, "ENVIAR",
        p_contenido=body.contenido, p_mensaje_id=str(body.id),
    ))


@router.patch("/{booking_id}/chat/mensajes/{message_id}", response_model=Message)
async def edit_message(
    booking_id: UUID, message_id: UUID, body: MessageEdit,
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
) -> Message:
    return _parse(Message, await _rpc(
        user, credentials, gateway, booking_id, "EDITAR",
        p_contenido=body.contenido, p_mensaje_id=str(message_id),
    ))


@router.delete("/{booking_id}/chat/mensajes/{message_id}", response_model=Deleted)
async def delete_message(
    booking_id: UUID, message_id: UUID,
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway,
) -> Deleted:
    return _parse(Deleted, await _rpc(
        user, credentials, gateway, booking_id, "ELIMINAR", p_mensaje_id=str(message_id),
    ))
