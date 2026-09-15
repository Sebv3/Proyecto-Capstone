from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.schemas.user import User
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway

bearer = HTTPBearer(auto_error=False)
AuthGateway = Annotated[SupabaseAuthGateway, Depends(get_auth_gateway)]
BearerToken = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


async def get_current_user(credentials: BearerToken, gateway: AuthGateway) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Se requiere un token Bearer")

    access_token = credentials.credentials
    verified = await gateway.request("GET", "/auth/v1/user", access_token=access_token)
    if verified.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Token inválido")
    if verified.status_code != 200:
        raise HTTPException(status_code=502, detail="No se pudo validar el token")

    try:
        user_id = UUID(verified.json()["id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de usuario inválida") from exc

    profile = await gateway.request(
        "GET",
        "/rest/v1/usuarios",
        params={"id": f"eq.{user_id}", "select": "*"},
        access_token=access_token,
    )
    if profile.status_code != 200:
        raise HTTPException(status_code=502, detail="No se pudo consultar el perfil")

    try:
        rows = profile.json()
        if not isinstance(rows, list) or not rows:
            raise HTTPException(status_code=404, detail="Perfil no encontrado")
        user = User.model_validate(rows[0])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de perfil inválida") from exc
    if user.id != user_id:
        raise HTTPException(status_code=502, detail="El perfil no coincide con el token")
    if not user.activo:
        raise HTTPException(status_code=403, detail="Cuenta inactiva")
    return user
