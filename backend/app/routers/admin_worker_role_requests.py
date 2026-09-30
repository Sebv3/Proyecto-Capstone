from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.schemas.user import User, UserRole
from app.schemas.worker_role_request import (
    WorkerRoleRequestResponse,
    WorkerRoleReviewRequest,
)

router = APIRouter(
    prefix="/api/v1/admin/solicitudes/rol-trabajador",
    tags=["Administración"],
)
CurrentUser = Annotated[User, Depends(get_current_user)]


def _admin_token(user: User, credentials: BearerToken) -> str:
    if user.rol != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Esta operación requiere un administrador")
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Se requiere un token Bearer")
    return credentials.credentials


def _parse_request(payload: Any) -> WorkerRoleRequestResponse:
    try:
        if not isinstance(payload, list) or not payload:
            raise HTTPException(status_code=409, detail="No existe una solicitud pendiente")
        return WorkerRoleRequestResponse.model_validate(payload[0])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de solicitud inválida") from exc


@router.patch("/{solicitud_id}", response_model=WorkerRoleRequestResponse)
async def review_worker_role_request(
    solicitud_id: UUID,
    body: WorkerRoleReviewRequest,
    current_user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
) -> WorkerRoleRequestResponse:
    token = _admin_token(current_user, credentials)
    response = await gateway.request(
        "POST",
        "/rest/v1/rpc/revisar_solicitud_rol_trabajador",
        json={
            "p_solicitud_id": str(solicitud_id),
            "p_estado": body.estado,
            "p_motivo": body.motivo_rechazo,
        },
        access_token=token,
    )
    if response.status_code in (401, 403):
        raise HTTPException(status_code=403, detail="No tienes permiso para revisar solicitudes")
    if response.status_code in (400, 404, 409):
        raise HTTPException(status_code=409, detail="No existe una solicitud pendiente válida")
    if response.status_code >= 500:
        raise HTTPException(status_code=502, detail="Supabase no está disponible")
    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail="No se pudo revisar la solicitud")
    try:
        return _parse_request(response.json())
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de solicitud inválida") from exc
