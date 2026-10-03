from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.security import AuthGateway
from app.schemas.catalog import (
    CatalogServiceListResponse,
    CatalogServiceResponse,
    CategoryResponse,
    ServiceModality,
)

router = APIRouter(prefix="/api/v1", tags=["Catálogo"])


def _upstream_error(status_code: int, detail: str) -> None:
    if status_code >= 500:
        raise HTTPException(status_code=502, detail="Supabase no está disponible")
    if status_code >= 400:
        raise HTTPException(status_code=400, detail=detail)


def _service_from_row(row: dict[str, Any]) -> CatalogServiceResponse:
    try:
        return CatalogServiceResponse.model_validate(
            {
                "id": row["id"],
                "nombre": row["nombre"],
                "descripcion": row["descripcion"],
                "precio_base": row["precio_base"],
                "duracion_estimada_minutos": row["duracion_estimada_minutos"],
                "modalidad": row["modalidad"],
                "categoria": {
                    "id": row["categoria_id"],
                    "slug": row["categoria_slug"],
                    "nombre": row["categoria_nombre"],
                    "descripcion": row["categoria_descripcion"],
                    "requiere_certificacion": row["categoria_requiere_certificacion"],
                    "certificacion_requerida": row["categoria_certificacion_requerida"],
                    "orden": row["categoria_orden"],
                },
                "trabajador": {
                    "id": row["trabajador_id"],
                    "nombre": row["trabajador_nombre"],
                    "comuna": (
                        {"id": row["comuna_id"], "nombre": row["comuna_nombre"]}
                        if row["comuna_id"] is not None
                        else None
                    ),
                },
                "creado_en": row["creado_en"],
                "actualizado_en": row["actualizado_en"],
            }
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de catálogo inválida") from exc


@router.get("/categorias", response_model=list[CategoryResponse])
async def list_categories(gateway: AuthGateway) -> list[CategoryResponse]:
    response = await gateway.request(
        "GET",
        "/rest/v1/categorias",
        params={
            "activa": "eq.true",
            "select": (
                "id,slug,nombre,descripcion,requiere_certificacion,"
                "certificacion_requerida,orden"
            ),
            "order": "orden.asc",
        },
    )
    _upstream_error(response.status_code, "No se pudieron consultar las categorías")
    try:
        rows = response.json()
        if not isinstance(rows, list):
            raise TypeError
        return [CategoryResponse.model_validate(row) for row in rows]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de categorías inválida") from exc


@router.get("/servicios", response_model=CatalogServiceListResponse)
async def list_services(
    gateway: AuthGateway,
    q: Annotated[str | None, Query(min_length=2, max_length=100)] = None,
    categoria_id: UUID | None = None,
    modalidad: ServiceModality | None = None,
    precio_min: Annotated[int | None, Query(gt=0)] = None,
    precio_max: Annotated[int | None, Query(gt=0)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CatalogServiceListResponse:
    if precio_min is not None and precio_max is not None and precio_min > precio_max:
        raise HTTPException(
            status_code=422,
            detail="El precio mínimo no puede ser mayor que el precio máximo",
        )

    response = await gateway.request(
        "POST",
        "/rest/v1/rpc/buscar_servicios_catalogo",
        json={
            "p_servicio_id": None,
            "p_q": q.strip() if q is not None else None,
            "p_categoria_id": str(categoria_id) if categoria_id is not None else None,
            "p_modalidad": modalidad.value if modalidad is not None else None,
            "p_precio_min": precio_min,
            "p_precio_max": precio_max,
            "p_limit": limit,
            "p_offset": offset,
        },
    )
    _upstream_error(response.status_code, "No se pudieron consultar los servicios")
    try:
        rows = response.json()
        if not isinstance(rows, list):
            raise TypeError
        total = int(rows[0]["total_count"]) if rows else 0
        items = [_service_from_row(row) for row in rows]
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de catálogo inválida") from exc
    return CatalogServiceListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/servicios/{servicio_id}", response_model=CatalogServiceResponse)
async def get_service(servicio_id: UUID, gateway: AuthGateway) -> CatalogServiceResponse:
    response = await gateway.request(
        "POST",
        "/rest/v1/rpc/buscar_servicios_catalogo",
        json={
            "p_servicio_id": str(servicio_id),
            "p_q": None,
            "p_categoria_id": None,
            "p_modalidad": None,
            "p_precio_min": None,
            "p_precio_max": None,
            "p_limit": 1,
            "p_offset": 0,
        },
    )
    _upstream_error(response.status_code, "No se pudo consultar el servicio")
    try:
        rows = response.json()
        if not isinstance(rows, list):
            raise TypeError
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de catálogo inválida") from exc
    if not rows:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return _service_from_row(rows[0])
