import asyncio
import json
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway

USER_ID = "11111111-2222-3333-4444-555555555555"
COMMUNE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
OTHER_COMMUNE_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"
TOKEN_HEADERS = {"Authorization": "Bearer test-access-token"}
USER = {
    "id": USER_ID,
    "email": "cliente@example.com",
    "nombre": "Cliente Prueba",
    "rut": "12345678-5",
    "telefono": None,
    "avatar_url": None,
    "rol": "CLIENTE",
    "activo": True,
    "creado_en": "2026-09-15T12:00:00Z",
    "actualizado_en": "2026-09-15T12:00:00Z",
}
CLIENT = {
    "usuario_id": USER_ID,
    "direccion": "Avenida Siempre Viva 123",
    "comuna": {"id": COMMUNE_ID, "nombre": "Santiago"},
    "creado_en": "2026-09-22T12:00:00Z",
    "actualizado_en": "2026-09-22T12:00:00Z",
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


def _authenticated_response(request: httpx.Request, user: dict = USER) -> httpx.Response | None:
    assert request.headers["Authorization"] == "Bearer test-access-token"
    if request.url.path == "/auth/v1/user":
        return httpx.Response(200, json={"id": USER_ID})
    if request.url.path == "/rest/v1/usuarios" and request.method == "GET":
        return httpx.Response(200, json=[user])
    return None


def test_lists_active_communes_in_alphabetical_order(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/v1/comunas"
        assert "Authorization" not in request.headers
        assert request.url.params["activa"] == "eq.true"
        assert request.url.params["order"] == "nombre.asc"
        return httpx.Response(
            200,
            json=[
                {"id": OTHER_COMMUNE_ID, "nombre": "Providencia"},
                {"id": COMMUNE_ID, "nombre": "Santiago"},
            ],
        )

    response = make_client(handler).get("/api/v1/comunas", headers=TOKEN_HEADERS)
    assert response.status_code == 200
    assert [commune["nombre"] for commune in response.json()] == ["Providencia", "Santiago"]


def test_creates_and_returns_client_profile(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticated_response(request)
        if authenticated is not None:
            return authenticated
        if request.url.path == "/rest/v1/comunas":
            return httpx.Response(200, json=[{"id": COMMUNE_ID}])
        if request.url.path == "/rest/v1/clientes" and request.method == "POST":
            assert json.loads(request.content) == {
                "usuario_id": USER_ID,
                "direccion": "Avenida Siempre Viva 123",
                "comuna_id": COMMUNE_ID,
            }
            return httpx.Response(201)
        if request.url.path == "/rest/v1/clientes" and request.method == "GET":
            return httpx.Response(200, json=[CLIENT])
        pytest.fail(f"Solicitud inesperada: {request.method} {request.url.path}")

    response = make_client(handler).post(
        "/api/v1/perfiles/cliente",
        headers=TOKEN_HEADERS,
        json={"direccion": " Avenida Siempre Viva 123 ", "comuna_id": COMMUNE_ID},
    )
    assert response.status_code == 201
    assert response.json()["comuna"]["nombre"] == "Santiago"
    assert response.json()["rut"] == "12345678-5"


def test_create_rejects_unavailable_commune(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticated_response(request)
        if authenticated is not None:
            return authenticated
        assert request.url.path == "/rest/v1/comunas"
        return httpx.Response(200, json=[])

    response = make_client(handler).post(
        "/api/v1/perfiles/cliente",
        headers=TOKEN_HEADERS,
        json={"direccion": "Dirección válida 123", "comuna_id": COMMUNE_ID},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "La comuna seleccionada no está disponible"


def test_create_reports_duplicate_profile(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticated_response(request)
        if authenticated is not None:
            return authenticated
        if request.url.path == "/rest/v1/comunas":
            return httpx.Response(200, json=[{"id": COMMUNE_ID}])
        return httpx.Response(409, json={"code": "23505"})

    response = make_client(handler).post(
        "/api/v1/perfiles/cliente",
        headers=TOKEN_HEADERS,
        json={"direccion": "Dirección válida 123", "comuna_id": COMMUNE_ID},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "El perfil cliente ya existe"


def test_reads_existing_client_profile(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticated_response(request)
        if authenticated is not None:
            return authenticated
        assert request.url.path == "/rest/v1/clientes"
        return httpx.Response(200, json=[CLIENT])

    response = make_client(handler).get("/api/v1/perfiles/cliente", headers=TOKEN_HEADERS)
    assert response.status_code == 200
    assert response.json()["direccion"] == "Avenida Siempre Viva 123"


def test_updates_user_and_client_data(make_client) -> None:
    updated_user = {**USER, "nombre": "Nombre Actualizado", "telefono": "+56912345678"}
    updated_client = {**CLIENT, "direccion": "Nueva dirección 456"}

    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticated_response(request)
        if authenticated is not None:
            return authenticated
        if request.url.path == "/rest/v1/usuarios" and request.method == "PATCH":
            assert request.headers["Prefer"] == "return=representation"
            assert json.loads(request.content) == {
                "nombre": "Nombre Actualizado",
                "telefono": "+56912345678",
            }
            return httpx.Response(200, json=[updated_user])
        if request.url.path == "/rest/v1/clientes" and request.method == "PATCH":
            assert json.loads(request.content) == {"direccion": "Nueva dirección 456"}
            return httpx.Response(200, json=[updated_client])
        if request.url.path == "/rest/v1/clientes" and request.method == "GET":
            return httpx.Response(200, json=[updated_client])
        pytest.fail(f"Solicitud inesperada: {request.method} {request.url.path}")

    response = make_client(handler).patch(
        "/api/v1/perfiles/cliente",
        headers=TOKEN_HEADERS,
        json={
            "nombre": "Nombre Actualizado",
            "telefono": "+56912345678",
            "direccion": "Nueva dirección 456",
        },
    )
    assert response.status_code == 200
    assert response.json()["nombre"] == "Nombre Actualizado"
    assert response.json()["direccion"] == "Nueva dirección 456"


def test_deactivates_account_through_safe_rpc(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticated_response(request)
        if authenticated is not None:
            return authenticated
        assert request.url.path == "/rest/v1/rpc/desactivar_cuenta_actual"
        assert request.method == "POST"
        return httpx.Response(200, json=True)

    response = make_client(handler).delete("/api/v1/perfiles/cliente", headers=TOKEN_HEADERS)
    assert response.status_code == 204
    assert response.content == b""


def test_worker_cannot_use_client_profile_endpoints(make_client) -> None:
    worker = {**USER, "rol": "TRABAJADOR"}

    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticated_response(request, worker)
        if authenticated is not None:
            return authenticated
        pytest.fail("Un trabajador no debe acceder a los datos de clientes")

    response = make_client(handler).get("/api/v1/perfiles/cliente", headers=TOKEN_HEADERS)
    assert response.status_code == 403


def test_profile_update_requires_at_least_one_field(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticated_response(request)
        if authenticated is not None:
            return authenticated
        pytest.fail("El cuerpo vacío no debe modificar el perfil")

    response = make_client(handler).patch(
        "/api/v1/perfiles/cliente", headers=TOKEN_HEADERS, json={}
    )
    assert response.status_code == 422
