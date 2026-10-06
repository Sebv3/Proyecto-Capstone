from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.core.security import AuthGateway
from app.routers.catalog import _service_from_row
from app.schemas.catalog import CatalogServiceResponse
from app.schemas.location import LocationResponse

router = APIRouter(prefix="/api/v1/locales", tags=["Mapa de cobertura"])
service_map_router = APIRouter(prefix="/api/v1/mapa", tags=["Mapa de cobertura"])


@service_map_router.get("/servicios", response_model=list[CatalogServiceResponse])
async def list_map_services(gateway: AuthGateway) -> list[CatalogServiceResponse]:
    response = await gateway.request("POST", "/rest/v1/rpc/consultar_servicios_mapa", json={})
    if response.status_code == 404:
        raise HTTPException(status_code=503, detail="El mapa de servicios aún no está habilitado")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="No se pudo consultar el mapa")
    try:
        rows = response.json()
        if not isinstance(rows, list):
            raise TypeError
        services = [_service_from_row(row) for row in rows]
        if any(
            s.latitud is None or s.longitud is None or not s.ubicacion_publica for s in services
        ):
            raise ValueError
        return services
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de mapa inválida") from exc


async def _locations(gateway: AuthGateway, local_id: UUID | None = None) -> list[LocationResponse]:
    response = await gateway.request(
        "POST",
        "/rest/v1/rpc/consultar_locales_catalogo",
        json={"p_local_id": str(local_id) if local_id else None},
    )
    if response.status_code == 404:
        raise HTTPException(status_code=503, detail="El mapa de locales aún no está habilitado")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="No se pudieron consultar los locales")
    try:
        rows = response.json()
        if not isinstance(rows, list):
            raise TypeError
        return [LocationResponse.model_validate(row) for row in rows]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Respuesta de locales inválida") from exc


@router.get("", response_model=list[LocationResponse])
async def list_locations(gateway: AuthGateway) -> list[LocationResponse]:
    return await _locations(gateway)


@router.get("/{local_id}", response_model=LocationResponse)
async def get_location(local_id: UUID, gateway: AuthGateway) -> LocationResponse:
    rows = await _locations(gateway, local_id)
    if not rows:
        raise HTTPException(status_code=404, detail="Este local ya no está disponible")
    if len(rows) != 1 or rows[0].id != local_id:
        raise HTTPException(status_code=502, detail="Respuesta de local inválida")
    return rows[0]
