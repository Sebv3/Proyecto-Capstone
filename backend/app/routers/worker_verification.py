from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.schemas.user import User, UserRole
from app.schemas.worker_verification import (
    VerificationResponse,
    WorkerProfileAddress,
    WorkerProfileResponse,
)

router = APIRouter(prefix="/api/v1", tags=["Perfil y verificación trabajador"])
CurrentUser = Annotated[User, Depends(get_current_user)]
BUCKET = "documentos-verificacion"
MAX_FILE_BYTES = 5 * 1024 * 1024
IMAGE_FORMATS = {
    "image/jpeg": (b"\xff\xd8\xff", ".jpg"),
    "image/png": (b"\x89PNG\r\n\x1a\n", ".png"),
    "image/webp": (b"RIFF", ".webp"),
}


def _worker_token(user: User, credentials: BearerToken) -> str:
    if user.rol != UserRole.TRABAJADOR:
        raise HTTPException(status_code=403, detail="Esta operación requiere un trabajador")
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Se requiere un token Bearer")
    return credentials.credentials


def _check_upstream(code: int, message: str) -> None:
    if code in (401, 403):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para realizar esta operación"
        )
    if code >= 500:
        raise HTTPException(status_code=502, detail="Supabase no está disponible")
    if code >= 400:
        raise HTTPException(status_code=400, detail=message)


async def _get_worker(user: User, gateway: AuthGateway, token: str) -> WorkerProfileResponse:
    response = await gateway.request(
        "GET",
        "/rest/v1/trabajadores",
        params={
            "usuario_id": f"eq.{user.id}",
            "select": (
                "usuario_id,direccion_base,comuna:comunas(id,nombre),"
                "creado_en,actualizado_en"
            ),
        },
        access_token=token,
    )
    _check_upstream(response.status_code, "No se pudo consultar el perfil trabajador")
    rows = response.json()
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=404, detail="Completa el perfil trabajador")
    return WorkerProfileResponse.model_validate(rows[0])


async def _ensure_active_commune(comuna_id: UUID, gateway: AuthGateway, token: str) -> None:
    response = await gateway.request(
        "GET", "/rest/v1/comunas",
        params={"id": f"eq.{comuna_id}", "activa": "eq.true", "select": "id"},
        access_token=token,
    )
    _check_upstream(response.status_code, "No se pudo validar la comuna")
    try:
        rows = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respuesta de comuna inválida") from exc
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=422, detail="La comuna seleccionada no está disponible")


async def _get_verification(user: User, gateway: AuthGateway, token: str) -> VerificationResponse:
    response = await gateway.request(
        "GET",
        "/rest/v1/verificaciones_trabajador",
        params={
            "trabajador_id": f"eq.{user.id}",
            "select": "trabajador_id,estado,motivo_rechazo,creado_en,actualizado_en",
        },
        access_token=token,
    )
    _check_upstream(response.status_code, "No se pudo consultar la verificación")
    rows = response.json()
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=404, detail="Aún no has enviado documentos")
    return VerificationResponse.model_validate(rows[0])


@router.get("/perfiles/trabajador", response_model=WorkerProfileResponse)
async def get_worker_profile(user: CurrentUser, credentials: BearerToken, gateway: AuthGateway):
    return await _get_worker(user, gateway, _worker_token(user, credentials))


@router.post(
    "/perfiles/trabajador",
    response_model=WorkerProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_worker_profile(
    body: WorkerProfileAddress,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
):
    token = _worker_token(user, credentials)
    await _ensure_active_commune(body.comuna_id, gateway, token)
    response = await gateway.request(
        "POST",
        "/rest/v1/trabajadores",
        json={
            "usuario_id": str(user.id), "direccion_base": body.direccion_base,
            "comuna_id": str(body.comuna_id),
        },
        access_token=token,
    )
    if response.status_code == 409:
        raise HTTPException(status_code=409, detail="El perfil trabajador ya existe")
    _check_upstream(response.status_code, "No se pudo crear el perfil trabajador")
    return await _get_worker(user, gateway, token)


@router.patch("/perfiles/trabajador", response_model=WorkerProfileResponse)
async def update_worker_profile(
    body: WorkerProfileAddress,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
):
    token = _worker_token(user, credentials)
    profile = await _get_worker(user, gateway, token)
    if profile.comuna is not None:
        await _get_verification(user, gateway, token)
    await _ensure_active_commune(body.comuna_id, gateway, token)
    response = await gateway.request(
        "PATCH",
        "/rest/v1/trabajadores",
        params={"usuario_id": f"eq.{user.id}"},
        json={"direccion_base": body.direccion_base, "comuna_id": str(body.comuna_id)},
        access_token=token,
        extra_headers={"Prefer": "return=representation"},
    )
    _check_upstream(response.status_code, "No se pudo actualizar la ubicación")
    rows = response.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Perfil trabajador no encontrado")
    return WorkerProfileResponse.model_validate(rows[0])


@router.get("/verificaciones/trabajador", response_model=VerificationResponse)
async def get_worker_verification(
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
):
    return await _get_verification(user, gateway, _worker_token(user, credentials))


async def _validated_image(file: UploadFile, label: str) -> tuple[bytes, str, str]:
    mime = file.content_type or ""
    if mime not in IMAGE_FORMATS:
        raise HTTPException(status_code=422, detail=f"{label}: usa JPEG, PNG o WebP")
    data = await file.read(MAX_FILE_BYTES + 1)
    if not data or len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=422, detail=f"{label}: archivo vacío o mayor a 5 MB")
    signature, extension = IMAGE_FORMATS[mime]
    if not data.startswith(signature) or (mime == "image/webp" and data[8:12] != b"WEBP"):
        raise HTTPException(
            status_code=422, detail=f"{label}: el archivo no coincide con su formato"
        )
    return data, mime, extension


async def _cleanup(paths: list[str], gateway: AuthGateway, token: str) -> None:
    if paths:
        await gateway.request(
            "DELETE",
            f"/storage/v1/object/{BUCKET}",
            json={"prefixes": paths},
            access_token=token,
        )


@router.post(
    "/verificaciones/trabajador",
    response_model=VerificationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_worker_verification(
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
    carnet_frontal: Annotated[UploadFile, File()],
    carnet_reverso: Annotated[UploadFile, File()],
    selfie: Annotated[UploadFile, File()],
):
    token = _worker_token(user, credentials)
    profile = await _get_worker(user, gateway, token)
    if profile.comuna is None:
        raise HTTPException(status_code=409, detail="Completa tu comuna antes de enviar documentos")
    existing = await gateway.request(
        "GET",
        "/rest/v1/verificaciones_trabajador",
        params={"trabajador_id": f"eq.{user.id}", "select": "estado"},
        access_token=token,
    )
    _check_upstream(existing.status_code, "No se pudo consultar la verificación")
    rows = existing.json()
    if rows and rows[0]["estado"] != "RECHAZADA":
        raise HTTPException(status_code=409, detail="La verificación ya está pendiente o aprobada")

    images = {
        "carnet_frontal_path": await _validated_image(carnet_frontal, "Carnet frontal"),
        "carnet_reverso_path": await _validated_image(carnet_reverso, "Carnet reverso"),
        "selfie_path": await _validated_image(selfie, "Selfie"),
    }
    submission = uuid4()
    paths: dict[str, str] = {}
    uploaded: list[str] = []
    try:
        for field, (data, mime, extension) in images.items():
            path = f"{user.id}/{submission}/{field}{extension}"
            response = await gateway.request(
                "POST",
                f"/storage/v1/object/{BUCKET}/{path}",
                content=data,
                access_token=token,
                extra_headers={"Content-Type": mime, "x-upsert": "false"},
            )
            _check_upstream(response.status_code, "No se pudo subir un documento")
            paths[field] = path
            uploaded.append(path)

        method = "PATCH" if rows else "POST"
        params = {"trabajador_id": f"eq.{user.id}"} if rows else None
        response = await gateway.request(
            method,
            "/rest/v1/verificaciones_trabajador",
            params=params,
            json={"trabajador_id": str(user.id), **paths} if not rows else paths,
            access_token=token,
            extra_headers={"Prefer": "return=representation"},
        )
        _check_upstream(response.status_code, "No se pudo guardar la verificación")
        saved = response.json()
        if not saved:
            raise HTTPException(
                status_code=409, detail="La verificación cambió; vuelve a intentarlo"
            )
        return VerificationResponse.model_validate(saved[0])
    except Exception:
        try:
            await _cleanup(uploaded, gateway, token)
        except HTTPException:
            # Preserve the original error; orphan cleanup can be retried operationally.
            pass
        raise
