from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.schemas.user import User, UserRole
from app.schemas.worker_verification import VerificationResponse, VerificationReviewRequest

router = APIRouter(prefix="/api/v1/admin/verificaciones", tags=["Administración"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def _admin_token(user: User, credentials: BearerToken) -> str:
    if user.rol != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Esta operación requiere un administrador")
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Se requiere un token Bearer")
    return credentials.credentials


def _parse_verification(payload: Any) -> VerificationResponse:
    try:
        if not isinstance(payload, list) or not payload:
            raise HTTPException(status_code=409, detail="No existe una verificación pendiente")
        return VerificationResponse.model_validate(payload[0])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de verificación inválida") from exc


@router.patch("/{trabajador_id}", response_model=VerificationResponse)
async def review_worker_verification(
    trabajador_id: UUID,
    body: VerificationReviewRequest,
    current_user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
) -> VerificationResponse:
    token = _admin_token(current_user, credentials)
    response = await gateway.request(
        "POST",
        "/rest/v1/rpc/revisar_verificacion_trabajador",
        json={
            "p_trabajador_id": str(trabajador_id),
            "p_estado": body.estado,
            "p_motivo": body.motivo_rechazo,
        },
        access_token=token,
    )
    if response.status_code in (401, 403):
        raise HTTPException(status_code=403, detail="No tienes permiso para revisar verificaciones")
    if response.status_code == 404 or response.status_code == 400:
        raise HTTPException(status_code=409, detail="No existe una verificación pendiente")
    if response.status_code >= 500:
        raise HTTPException(status_code=502, detail="Supabase no está disponible")
    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail="No se pudo revisar la verificación")
    try:
        return _parse_verification(response.json())
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de verificación inválida") from exc
