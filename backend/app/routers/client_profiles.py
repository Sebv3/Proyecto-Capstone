from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.schemas.client_profile import (
    ClientProfileCreate,
    ClientProfileResponse,
    ClientProfileUpdate,
    CommuneResponse,
)
from app.schemas.user import User, UserRole

router = APIRouter(prefix="/api/v1", tags=["Perfil cliente"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def _client_token(current_user: User, credentials: BearerToken) -> str:
    if current_user.rol != UserRole.CLIENTE:
        raise HTTPException(status_code=403, detail="Esta operación requiere un usuario CLIENTE")
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Se requiere un token Bearer")
    return credentials.credentials


def _upstream_error(status_code: int, detail: str) -> None:
    if status_code in (401, 403):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para realizar esta operación"
        )
    if status_code >= 500:
        raise HTTPException(status_code=502, detail="Supabase no está disponible")
    if status_code >= 400:
        raise HTTPException(status_code=400, detail=detail)


async def _ensure_active_commune(
    commune_id: UUID, gateway: AuthGateway, access_token: str
) -> None:
    response = await gateway.request(
        "GET",
        "/rest/v1/comunas",
        params={"id": f"eq.{commune_id}", "activa": "eq.true", "select": "id"},
        access_token=access_token,
    )
    _upstream_error(response.status_code, "No se pudo validar la comuna")
    try:
        rows = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de comuna inválida") from exc
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=422, detail="La comuna seleccionada no está disponible")


async def _read_profile(
    current_user: User, gateway: AuthGateway, access_token: str
) -> ClientProfileResponse:
    response = await gateway.request(
        "GET",
        "/rest/v1/clientes",
        params={
            "usuario_id": f"eq.{current_user.id}",
            "select": "usuario_id,direccion,comuna:comunas(id,nombre),creado_en,actualizado_en",
        },
        access_token=access_token,
    )
    _upstream_error(response.status_code, "No se pudo consultar el perfil cliente")
    try:
        rows = response.json()
        if not isinstance(rows, list) or not rows:
            raise HTTPException(status_code=404, detail="Perfil cliente no encontrado")
        client: dict[str, Any] = rows[0]
        return ClientProfileResponse(
            usuario_id=current_user.id,
            email=current_user.email,
            nombre=current_user.nombre,
            rut=current_user.rut,
            telefono=current_user.telefono,
            avatar_url=current_user.avatar_url,
            direccion=client["direccion"],
            comuna=client["comuna"],
            activo=current_user.activo,
            creado_en=client["creado_en"],
            actualizado_en=client["actualizado_en"],
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de perfil cliente inválida") from exc


@router.get("/comunas", response_model=list[CommuneResponse])
async def list_communes(gateway: AuthGateway) -> list[CommuneResponse]:
    response = await gateway.request(
        "GET",
        "/rest/v1/comunas",
        params={"activa": "eq.true", "select": "id,nombre", "order": "nombre.asc"},
    )
    _upstream_error(response.status_code, "No se pudieron consultar las comunas")
    try:
        return [CommuneResponse.model_validate(row) for row in response.json()]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de comunas inválida") from exc


@router.post(
    "/perfiles/cliente", response_model=ClientProfileResponse, status_code=status.HTTP_201_CREATED
)
async def create_client_profile(
    body: ClientProfileCreate,
    current_user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
) -> ClientProfileResponse:
    access_token = _client_token(current_user, credentials)
    await _ensure_active_commune(body.comuna_id, gateway, access_token)
    response = await gateway.request(
        "POST",
        "/rest/v1/clientes",
        json={
            "usuario_id": str(current_user.id),
            "direccion": body.direccion.strip(),
            "comuna_id": str(body.comuna_id),
        },
        access_token=access_token,
    )
    if response.status_code == 409:
        raise HTTPException(status_code=409, detail="El perfil cliente ya existe")
    _upstream_error(response.status_code, "No se pudo crear el perfil cliente")
    return await _read_profile(current_user, gateway, access_token)


@router.get("/perfiles/cliente", response_model=ClientProfileResponse)
async def get_client_profile(
    current_user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> ClientProfileResponse:
    access_token = _client_token(current_user, credentials)
    return await _read_profile(current_user, gateway, access_token)


@router.patch("/perfiles/cliente", response_model=ClientProfileResponse)
async def update_client_profile(
    body: ClientProfileUpdate,
    current_user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
) -> ClientProfileResponse:
    access_token = _client_token(current_user, credentials)
    changes = body.model_dump(exclude_unset=True)

    commune_id = changes.get("comuna_id")
    if commune_id is not None:
        await _ensure_active_commune(commune_id, gateway, access_token)

    user_changes = {key: changes[key] for key in ("nombre", "telefono") if key in changes}
    if "nombre" in user_changes:
        user_changes["nombre"] = user_changes["nombre"].strip()
    if user_changes:
        response = await gateway.request(
            "PATCH",
            "/rest/v1/usuarios",
            params={"id": f"eq.{current_user.id}"},
            json=user_changes,
            access_token=access_token,
            extra_headers={"Prefer": "return=representation"},
        )
        _upstream_error(response.status_code, "No se pudieron actualizar los datos personales")
        try:
            current_user = User.model_validate(response.json()[0])
        except (IndexError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Respuesta de usuario inválida") from exc

    client_changes: dict[str, Any] = {}
    if "direccion" in changes:
        client_changes["direccion"] = changes["direccion"].strip()
    if commune_id is not None:
        client_changes["comuna_id"] = str(commune_id)
    if client_changes:
        response = await gateway.request(
            "PATCH",
            "/rest/v1/clientes",
            params={"usuario_id": f"eq.{current_user.id}"},
            json=client_changes,
            access_token=access_token,
            extra_headers={"Prefer": "return=representation"},
        )
        _upstream_error(response.status_code, "No se pudo actualizar el perfil cliente")
        try:
            if not response.json():
                raise HTTPException(status_code=404, detail="Perfil cliente no encontrado")
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="Respuesta de perfil inválida") from exc

    return await _read_profile(current_user, gateway, access_token)


@router.delete("/perfiles/cliente", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_client_account(
    current_user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
) -> Response:
    access_token = _client_token(current_user, credentials)
    response = await gateway.request(
        "POST",
        "/rest/v1/rpc/desactivar_cuenta_actual",
        json={},
        access_token=access_token,
    )
    _upstream_error(response.status_code, "No se pudo desactivar la cuenta")
    try:
        if response.json() is not True:
            raise HTTPException(status_code=409, detail="La cuenta no pudo ser desactivada")
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de desactivación inválida") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
