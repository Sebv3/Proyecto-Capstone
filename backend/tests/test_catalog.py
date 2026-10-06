import asyncio
import json
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway

CATEGORY_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
SERVICE_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
WORKER_ID = "11111111-2222-4333-8444-555555555555"
COMMUNE_ID = "22222222-3333-4444-8555-666666666666"

CATEGORY = {
    "id": CATEGORY_ID,
    "slug": "cerrajeria",
    "nombre": "Cerrajería",
    "descripcion": "Apertura de puertas y cambio de chapas.",
    "requiere_certificacion": False,
    "certificacion_requerida": None,
    "orden": 5,
}

SERVICE_ROW = {
    "id": SERVICE_ID,
    "nombre": "Apertura de puerta",
    "descripcion": "Apertura de puerta domiciliaria sin destruir la chapa.",
    "precio_base": 25000,
    "duracion_estimada_minutos": 60,
    "modalidad": "DOMICILIO",
    "categoria_id": CATEGORY_ID,
    "categoria_slug": "cerrajeria",
    "categoria_nombre": "Cerrajería",
    "categoria_descripcion": "Apertura de puertas y cambio de chapas.",
    "categoria_requiere_certificacion": False,
    "categoria_certificacion_requerida": None,
    "categoria_orden": 5,
    "trabajador_id": WORKER_ID,
    "trabajador_nombre": "Trabajador Prueba",
    "comuna_id": COMMUNE_ID,
    "comuna_nombre": "Santiago",
    "creado_en": "2026-10-02T12:00:00Z",
    "actualizado_en": "2026-10-02T12:00:00Z",
    "total_count": 1,
}


@pytest.fixture
def make_client():
    clients: list[httpx.AsyncClient] = []

    def create(handler: Callable[[httpx.Request], httpx.Response]) -> TestClient:
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        clients.append(client)
        gateway = SupabaseAuthGateway(client, "https://test.supabase.co", "sb_publishable_test")
        app.dependency_overrides[get_auth_gateway] = lambda: gateway
        return TestClient(app)

    yield create
    app.dependency_overrides.pop(get_auth_gateway, None)
    for client in clients:
        asyncio.run(client.aclose())


def test_lists_active_categories_without_authentication(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/v1/categorias"
        assert "Authorization" not in request.headers
        assert request.url.params["activa"] == "eq.true"
        assert request.url.params["order"] == "orden.asc"
        return httpx.Response(200, json=[CATEGORY])

    response = make_client(handler).get("/api/v1/categorias")
    assert response.status_code == 200
    assert response.json()[0]["nombre"] == "Cerrajería"


def test_lists_services_with_combined_filters_and_pagination(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/v1/rpc/buscar_servicios_catalogo"
        assert "Authorization" not in request.headers
        assert json.loads(request.content) == {
            "p_servicio_id": None,
            "p_q": "puerta",
            "p_categoria_id": CATEGORY_ID,
            "p_modalidad": "DOMICILIO",
            "p_precio_min": 10000,
            "p_precio_max": 30000,
            "p_limit": 10,
            "p_offset": 20,
        }
        return httpx.Response(200, json=[{**SERVICE_ROW, "total_count": 25}])

    response = make_client(handler).get(
        "/api/v1/servicios",
        params={
            "q": " puerta ",
            "categoria_id": CATEGORY_ID,
            "modalidad": "DOMICILIO",
            "precio_min": 10000,
            "precio_max": 30000,
            "limit": 10,
            "offset": 20,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 25
    assert body["limit"] == 10
    assert body["offset"] == 20
    assert body["items"][0]["trabajador"]["comuna"]["nombre"] == "Santiago"


def test_service_filters_reject_inverted_price_range(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        pytest.fail("El rango inválido no debe consultar Supabase")

    response = make_client(handler).get(
        "/api/v1/servicios", params={"precio_min": 30000, "precio_max": 10000}
    )
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "El precio mínimo no puede ser mayor que el precio máximo"
    )


def test_gets_service_detail_without_private_worker_data(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/v1/rpc/buscar_servicios_catalogo"
        body = json.loads(request.content)
        assert body["p_servicio_id"] == SERVICE_ID
        assert body["p_limit"] == 1
        return httpx.Response(200, json=[SERVICE_ROW])

    response = make_client(handler).get(f"/api/v1/servicios/{SERVICE_ID}")
    assert response.status_code == 200
    worker = response.json()["trabajador"]
    assert worker == {
        "id": WORKER_ID,
        "nombre": "Trabajador Prueba",
        "comuna": {"id": COMMUNE_ID, "nombre": "Santiago"},
    }


def test_service_detail_returns_404_when_not_found(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    response = make_client(handler).get(f"/api/v1/servicios/{SERVICE_ID}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Servicio no encontrado"


@pytest.mark.parametrize(
    "params",
    [
        {"q": "x"}, {"q": "x" * 101}, {"categoria_id": "invalid"},
        {"modalidad": "REMOTO"}, {"precio_min": 0}, {"precio_max": -1},
        {"limit": 0}, {"limit": 101}, {"offset": -1},
    ],
)
def test_invalid_filters_never_reach_supabase(make_client, params) -> None:
    def handler(request):
        pytest.fail("Los filtros inválidos deben rechazarse antes del RPC")

    assert make_client(handler).get("/api/v1/servicios", params=params).status_code == 422


def test_empty_catalog_preserves_requested_pagination(make_client) -> None:
    client = make_client(lambda request: httpx.Response(200, json=[]))
    response = client.get("/api/v1/servicios", params={"limit": 10, "offset": 30})
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "limit": 10, "offset": 30}


@pytest.mark.parametrize("path", ["categorias", "servicios", f"servicios/{SERVICE_ID}"])
@pytest.mark.parametrize("payload", [{"unexpected": "object"}, [None], [{"id": SERVICE_ID}]])
def test_malformed_catalog_payload_returns_controlled_error(make_client, path, payload) -> None:
    response = make_client(lambda request: httpx.Response(200, json=payload)).get(
        f"/api/v1/{path}"
    )
    assert response.status_code == 502
    assert "inválida" in response.json()["detail"]


@pytest.mark.parametrize("path", ["categorias", "servicios", f"servicios/{SERVICE_ID}"])
@pytest.mark.parametrize("status", [400, 401, 403, 500, 503])
def test_catalog_upstream_errors_do_not_expose_private_details(make_client, path, status) -> None:
    response = make_client(
        lambda request: httpx.Response(status, json={"message": "private-database-detail"})
    ).get(f"/api/v1/{path}")
    assert response.status_code == (502 if status >= 500 else 400)
    assert "private-database-detail" not in response.text


@pytest.mark.parametrize("path", ["categorias", "servicios", f"servicios/{SERVICE_ID}"])
def test_catalog_connection_failure_returns_502(make_client, path) -> None:
    def handler(request):
        raise httpx.ConnectError("private-hostname", request=request)

    response = make_client(handler).get(f"/api/v1/{path}")
    assert response.status_code == 502
    assert response.json()["detail"] == "Supabase no está disponible"


def test_detail_projects_public_location_and_discards_private_fields(make_client) -> None:
    row = {
        **SERVICE_ROW, "ubicacion_publica": "Sector Plaza Central", "latitud": -33.45,
        "longitud": -70.66, "radio_cobertura_km": 5, "rut": "12345678-5",
        "email": "private@example.com", "direccion_base": "private address",
        "documento_path": "private/document.pdf",
    }
    response = make_client(lambda request: httpx.Response(200, json=[row])).get(
        f"/api/v1/servicios/{SERVICE_ID}"
    )
    assert response.status_code == 200
    assert response.json()["ubicacion_publica"] == "Sector Plaza Central"
    assert response.json()["radio_cobertura_km"] == 5
    for private in ["rut", "email", "direccion_base", "documento_path"]:
        assert private not in response.json()
        assert private not in response.json()["trabajador"]
