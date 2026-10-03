import asyncio
import json
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway

WORKER_ID = "11111111-2222-4333-8444-555555555555"
SERVICE_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
CATEGORY_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
TOKEN_HEADERS = {"Authorization": "Bearer worker-access-token"}
WORKER = {
    "id": WORKER_ID,
    "email": "trabajador@example.com",
    "nombre": "Trabajador Prueba",
    "rut": "12345678-5",
    "telefono": "+56912345678",
    "avatar_url": None,
    "rol": "TRABAJADOR",
    "activo": True,
    "creado_en": "2026-09-15T12:00:00Z",
    "actualizado_en": "2026-09-15T12:00:00Z",
}
SERVICE = {
    "id": SERVICE_ID,
    "trabajador_id": WORKER_ID,
    "categoria_id": CATEGORY_ID,
    "nombre": "Apertura de puerta",
    "descripcion": "Apertura de puerta domiciliaria sin destruir la chapa.",
    "precio_base": 25000,
    "duracion_estimada_minutos": 60,
    "modalidad": "DOMICILIO",
    "activo": True,
    "creado_en": "2026-10-02T12:00:00Z",
    "actualizado_en": "2026-10-02T12:00:00Z",
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


def _authenticate(request: httpx.Request, user: dict = WORKER) -> httpx.Response | None:
    assert request.headers["Authorization"] == TOKEN_HEADERS["Authorization"]
    if request.url.path == "/auth/v1/user":
        return httpx.Response(200, json={"id": WORKER_ID})
    if request.url.path == "/rest/v1/usuarios":
        return httpx.Response(200, json=[user])
    return None


def test_lists_own_active_and_inactive_services(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        assert request.url.path == "/rest/v1/servicios"
        assert request.url.params["trabajador_id"] == f"eq.{WORKER_ID}"
        assert request.url.params["order"] == "creado_en.desc"
        return httpx.Response(200, json=[SERVICE, {**SERVICE, "activo": False}])

    response = make_client(handler).get(
        "/api/v1/trabajador/servicios", headers=TOKEN_HEADERS
    )
    assert response.status_code == 200
    assert [item["activo"] for item in response.json()] == [True, False]


def test_creates_own_service(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        assert request.method == "POST"
        body = json.loads(request.content)
        assert body == {
            "trabajador_id": WORKER_ID,
            "categoria_id": CATEGORY_ID,
            "nombre": "Apertura de puerta",
            "descripcion": "Apertura de puerta domiciliaria sin destruir la chapa.",
            "precio_base": 25000,
            "duracion_estimada_minutos": 60,
            "modalidad": "DOMICILIO",
        }
        assert request.headers["Prefer"] == "return=representation"
        return httpx.Response(201, json=[SERVICE])

    response = make_client(handler).post(
        "/api/v1/trabajador/servicios",
        headers=TOKEN_HEADERS,
        json={
            "categoria_id": CATEGORY_ID,
            "nombre": "Apertura de puerta",
            "descripcion": "Apertura de puerta domiciliaria sin destruir la chapa.",
            "precio_base": 25000,
            "duracion_estimada_minutos": 60,
            "modalidad": "DOMICILIO",
        },
    )
    assert response.status_code == 201
    assert response.json()["trabajador_id"] == WORKER_ID


def test_updates_only_requested_fields(make_client) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        calls += 1
        if request.method == "GET":
            return httpx.Response(200, json=[SERVICE])
        assert request.method == "PATCH"
        assert request.url.params["id"] == f"eq.{SERVICE_ID}"
        assert json.loads(request.content) == {"precio_base": 30000, "activo": False}
        return httpx.Response(200, json=[{**SERVICE, "precio_base": 30000, "activo": False}])

    response = make_client(handler).patch(
        f"/api/v1/trabajador/servicios/{SERVICE_ID}",
        headers=TOKEN_HEADERS,
        json={"precio_base": 30000, "activo": False},
    )
    assert response.status_code == 200
    assert response.json()["precio_base"] == 30000
    assert response.json()["activo"] is False
    assert calls == 2


def test_delete_soft_deactivates_service(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        if request.method == "GET":
            return httpx.Response(200, json=[SERVICE])
        assert request.method == "PATCH"
        assert json.loads(request.content) == {"activo": False}
        assert request.headers["Prefer"] == "return=minimal"
        return httpx.Response(204)

    response = make_client(handler).delete(
        f"/api/v1/trabajador/servicios/{SERVICE_ID}", headers=TOKEN_HEADERS
    )
    assert response.status_code == 204


@pytest.mark.parametrize(
    ("message", "expected_status", "expected_detail"),
    [
        (
            "Un trabajador puede tener como maximo cinco servicios activos",
            409,
            "Ya tienes cinco servicios activos",
        ),
        (
            "El trabajador debe tener su verificacion aprobada para publicar",
            403,
            "Tu verificación debe estar aprobada para publicar servicios",
        ),
        (
            "La categoria seleccionada no esta disponible",
            422,
            "La categoría no está disponible",
        ),
    ],
)
def test_create_translates_database_rules(
    make_client, message: str, expected_status: int, expected_detail: str
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        return httpx.Response(400, json={"message": message})

    response = make_client(handler).post(
        "/api/v1/trabajador/servicios",
        headers=TOKEN_HEADERS,
        json={
            "categoria_id": CATEGORY_ID,
            "nombre": "Apertura de puerta",
            "descripcion": "Apertura de puerta domiciliaria sin destruir la chapa.",
            "precio_base": 25000,
            "duracion_estimada_minutos": 60,
            "modalidad": "DOMICILIO",
        },
    )
    assert response.status_code == expected_status
    assert response.json()["detail"] == expected_detail


def test_client_cannot_manage_worker_services(make_client) -> None:
    client_user = {**WORKER, "rol": "CLIENTE"}

    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request, client_user)
        if authenticated is not None:
            return authenticated
        pytest.fail("Un cliente no debe consultar servicios privados de trabajador")

    response = make_client(handler).get(
        "/api/v1/trabajador/servicios", headers=TOKEN_HEADERS
    )
    assert response.status_code == 403


def test_cannot_update_another_workers_service(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        assert request.method == "GET"
        return httpx.Response(200, json=[])

    response = make_client(handler).patch(
        f"/api/v1/trabajador/servicios/{SERVICE_ID}",
        headers=TOKEN_HEADERS,
        json={"precio_base": 30000},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Servicio no encontrado"
