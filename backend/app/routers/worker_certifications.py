from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.security import AuthGateway, BearerToken, get_current_user
from app.schemas.user import User, UserRole
from app.schemas.worker_certification import CertificationDocumentResponse, CertificationResponse
from app.schemas.worker_verification import VerificationReviewRequest

router = APIRouter(prefix="/api/v1", tags=["Certificaciones"])
CurrentUser = Annotated[User, Depends(get_current_user)]
BUCKET = "certificaciones-trabajador"
FIELDS = "id,trabajador_id,categoria_id,nombre,estado,motivo_rechazo,creado_en,actualizado_en"
MAX_BYTES = 5 * 1024 * 1024
FORMATS = {
    "application/pdf": (b"%PDF-", ".pdf"),
    "image/jpeg": (b"\xff\xd8\xff", ".jpg"),
    "image/png": (b"\x89PNG\r\n\x1a\n", ".png"),
    "image/webp": (b"RIFF", ".webp"),
}


def _token(user: User, credentials: BearerToken, role: UserRole) -> str:
    if user.rol != role:
        raise HTTPException(status_code=403, detail="Esta operación no corresponde a tu rol")
    if credentials is None:
        raise HTTPException(status_code=401, detail="Se requiere un token Bearer")
    return credentials.credentials


def _check(response: Any) -> None:
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para realizar esta operación"
        )
    if response.status_code == 404:
        raise HTTPException(
            status_code=503, detail="El módulo de certificaciones no está disponible"
        )
    if response.status_code == 409:
        raise HTTPException(status_code=409, detail="La certificación ya está pendiente o aprobada")
    if response.status_code >= 500:
        raise HTTPException(status_code=502, detail="Supabase no está disponible")
    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail="No se pudo procesar la certificación")


def _rows(response: Any) -> list[dict[str, Any]]:
    _check(response)
    try:
        rows = response.json()
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError
        return rows
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail="Respuesta de certificaciones inválida"
        ) from exc


def _parse(row: dict[str, Any]) -> CertificationResponse:
    try:
        return CertificationResponse.model_validate(row)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de certificación inválida") from exc


@router.get("/trabajador/certificaciones", response_model=list[CertificationResponse])
async def list_own_certifications(
    user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
):
    token = _token(user, credentials, UserRole.TRABAJADOR)
    response = await gateway.request(
        "GET",
        "/rest/v1/certificaciones_trabajador",
        params={"trabajador_id": f"eq.{user.id}", "select": FIELDS, "order": "creado_en.desc"},
        access_token=token,
    )
    return [_parse(row) for row in _rows(response)]


@router.post("/trabajador/certificaciones", response_model=CertificationResponse, status_code=201)
async def submit_certification(
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
    categoria_id: Annotated[UUID, Form()],
    nombre: Annotated[str, Form(min_length=3, max_length=120)],
    documento: Annotated[UploadFile, File()],
):
    token = _token(user, credentials, UserRole.TRABAJADOR)
    nombre = nombre.strip()
    if len(nombre) < 3:
        raise HTTPException(status_code=422, detail="Ingresa el nombre de la certificación")
    category = await gateway.request(
        "GET",
        "/rest/v1/categorias",
        params={
            "id": f"eq.{categoria_id}",
            "activa": "eq.true",
            "requiere_certificacion": "eq.true",
            "select": "id",
        },
        access_token=token,
    )
    if not _rows(category):
        raise HTTPException(
            status_code=422, detail="La categoría no requiere certificación o no está disponible"
        )
    existing = await gateway.request(
        "GET",
        "/rest/v1/certificaciones_trabajador",
        params={
            "trabajador_id": f"eq.{user.id}",
            "categoria_id": f"eq.{categoria_id}",
            "select": "id,estado",
        },
        access_token=token,
    )
    rows = _rows(existing)
    if rows and rows[0].get("estado") != "RECHAZADA":
        raise HTTPException(status_code=409, detail="La certificación ya está pendiente o aprobada")
    mime = documento.content_type or ""
    if mime not in FORMATS:
        raise HTTPException(status_code=422, detail="Usa PDF, JPEG, PNG o WebP")
    data = await documento.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(status_code=422, detail="El archivo debe pesar entre 1 byte y 5 MB")
    signature, extension = FORMATS[mime]
    if not data.startswith(signature) or (mime == "image/webp" and data[8:12] != b"WEBP"):
        raise HTTPException(status_code=422, detail="El archivo no coincide con su formato")
    path = f"{user.id}/{categoria_id}/{uuid4()}{extension}"
    uploaded = False
    try:
        upload = await gateway.request(
            "POST",
            f"/storage/v1/object/{BUCKET}/{path}",
            content=data,
            access_token=token,
            extra_headers={"Content-Type": mime, "x-upsert": "false"},
        )
        _check(upload)
        uploaded = True
        payload = {"nombre": nombre, "documento_path": path}
        if not rows:
            payload.update(trabajador_id=str(user.id), categoria_id=str(categoria_id))
        saved = await gateway.request(
            "PATCH" if rows else "POST",
            "/rest/v1/certificaciones_trabajador",
            params={"id": f"eq.{rows[0]['id']}", "estado": "eq.RECHAZADA"} if rows else None,
            json=payload,
            access_token=token,
            extra_headers={"Prefer": "return=representation"},
        )
        result = _rows(saved)
        if not result:
            raise HTTPException(
                status_code=409, detail="La certificación cambió; actualiza su estado"
            )
        return _parse(result[0])
    except Exception:
        if uploaded:
            try:
                await gateway.request(
                    "DELETE",
                    f"/storage/v1/object/{BUCKET}",
                    json={"prefixes": [path]},
                    access_token=token,
                )
            except HTTPException:
                pass  # Preserve the original failure. Referenced files cannot be deleted by RLS.
        raise


@router.get("/admin/certificaciones", response_model=list[CertificationResponse])
async def list_pending_certifications(
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
):
    token = _token(user, credentials, UserRole.ADMIN)
    response = await gateway.request(
        "GET",
        "/rest/v1/certificaciones_trabajador",
        params={"estado": "eq.PENDIENTE", "select": FIELDS, "order": "creado_en.asc"},
        access_token=token,
    )
    return [_parse(row) for row in _rows(response)]


@router.get(
    "/admin/certificaciones/{certificacion_id}/documento",
    response_model=CertificationDocumentResponse,
)
async def certification_document(
    certificacion_id: UUID,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
):
    token = _token(user, credentials, UserRole.ADMIN)
    response = await gateway.request(
        "GET",
        "/rest/v1/certificaciones_trabajador",
        params={"id": f"eq.{certificacion_id}", "select": "documento_path"},
        access_token=token,
    )
    rows = _rows(response)
    if not rows:
        raise HTTPException(status_code=404, detail="Certificación no encontrada")
    path = rows[0].get("documento_path")
    if not isinstance(path, str) or not path:
        raise HTTPException(status_code=502, detail="Documento de certificación inválido")
    signed = await gateway.request(
        "POST",
        f"/storage/v1/object/sign/{BUCKET}/{path}",
        json={"expiresIn": 60},
        access_token=token,
    )
    _check(signed)
    try:
        relative = signed.json()["signedURL"]
        if not isinstance(relative, str) or not relative.startswith(f"/object/sign/{BUCKET}/"):
            raise ValueError
        return CertificationDocumentResponse(url=f"{gateway.url}/storage/v1{relative}")
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Enlace de documento inválido") from exc


@router.patch("/admin/certificaciones/{certificacion_id}", response_model=CertificationResponse)
async def review_certification(
    certificacion_id: UUID,
    body: VerificationReviewRequest,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
):
    token = _token(user, credentials, UserRole.ADMIN)
    response = await gateway.request(
        "POST",
        "/rest/v1/rpc/revisar_certificacion_trabajador",
        json={
            "p_certificacion_id": str(certificacion_id),
            "p_estado": body.estado,
            "p_motivo": body.motivo_rechazo,
        },
        access_token=token,
    )
    if response.status_code == 400:
        raise HTTPException(status_code=409, detail="No existe una certificación pendiente")
    rows = _rows(response)
    if not rows:
        raise HTTPException(status_code=409, detail="No existe una certificación pendiente")
    return _parse(rows[0])
