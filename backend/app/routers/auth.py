from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import AuthGateway, get_current_user
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    SessionResponse,
)
from app.schemas.user import User

router = APIRouter(prefix="/api/v1/auth", tags=["Autenticación"])


def _session(payload: dict[str, Any]) -> SessionResponse:
    try:
        return SessionResponse.model_validate(payload)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de sesión inválida") from exc


def _auth_error(status_code: int, detail: str, invalid_status: int = 400) -> None:
    if status_code == 429:
        raise HTTPException(status_code=429, detail="Demasiados intentos; inténtalo más tarde")
    if status_code >= 500:
        raise HTTPException(status_code=502, detail="Supabase no está disponible")
    if status_code >= 400:
        raise HTTPException(status_code=invalid_status, detail=detail)


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register(body: RegisterRequest, gateway: AuthGateway) -> RegisterResponse:
    response = await gateway.request(
        "POST",
        "/auth/v1/signup",
        json={
            "email": body.email,
            "password": body.password,
            "data": {"nombre": body.nombre, "rut": body.rut, "rol": body.rol},
        },
    )
    _auth_error(response.status_code, "No se pudo registrar el usuario")

    try:
        payload = response.json()
        user_id = UUID((payload.get("user") or payload)["id"])
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de registro inválida") from exc

    session = _session(payload) if payload.get("access_token") else None
    return RegisterResponse(
        user_id=user_id,
        session=session,
        email_confirmation_required=session is None,
    )


@router.post("/login", response_model=SessionResponse)
async def login(body: LoginRequest, gateway: AuthGateway) -> SessionResponse:
    response = await gateway.request(
        "POST",
        "/auth/v1/token",
        params={"grant_type": "password"},
        json={"email": body.email, "password": body.password},
    )
    _auth_error(response.status_code, "Credenciales inválidas", invalid_status=401)
    try:
        return _session(response.json())
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de sesión inválida") from exc


@router.post("/refresh", response_model=SessionResponse)
async def refresh(body: RefreshRequest, gateway: AuthGateway) -> SessionResponse:
    response = await gateway.request(
        "POST",
        "/auth/v1/token",
        params={"grant_type": "refresh_token"},
        json={"refresh_token": body.refresh_token},
    )
    _auth_error(response.status_code, "Sesión caducada", invalid_status=401)
    try:
        return _session(response.json())
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de sesión inválida") from exc


@router.get("/me", response_model=MeResponse)
async def me(current_user: Annotated[User, Depends(get_current_user)]) -> MeResponse:
    return MeResponse(user=current_user)
