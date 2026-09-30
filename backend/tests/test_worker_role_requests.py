import asyncio
import json
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway

USER_ID = "11111111-2222-3333-4444-555555555555"
REQUEST_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
TOKEN_HEADERS = {"Authorization": "Bearer test-access-token"}
USER = {
    "id": USER_ID,
    "email": "cliente@example.com",
    "nombre": "Cliente Prueba",
    "rut": "12345678-5",
    "telefono": "+56912345678",
    "avatar_url": None,
    "rol": "CLIENTE",
    "activo": True,
    "creado_en": "2026-09-15T12:00:00Z",
    "actualizado_en": "2026-09-15T12:00:00Z",
}
ROLE_REQUEST = {
    "id": REQUEST_ID,
    "usuario_id": USER_ID,
    "estado": "PENDIENTE",
    "motivo_rechazo": None,
    "creado_en": "2026-09-29T12:00:00Z",
    "actualizado_en": "2026-09-29T12:00:00Z",
}
FILES = {
    "carnet_frontal": ("frontal.jpg", b"\xff\xd8\xfffront", "image/jpeg"),
    "carnet_reverso": ("reverso.jpg", b"\xff\xd8\xffback", "image/jpeg"),
    "selfie": ("selfie.jpg", b"\xff\xd8\xffselfie", "image/jpeg"),
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


def _authenticate(request: httpx.Request, user: dict = USER) -> httpx.Response | None:
    assert request.headers["Authorization"] == "Bearer test-access-token"
    if request.url.path == "/auth/v1/user":
        return httpx.Response(200, json={"id": USER_ID})
    if request.url.path == "/rest/v1/usuarios":
        return httpx.Response(200, json=[user])
    return None


def test_gets_latest_worker_role_request(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        assert request.url.path == "/rest/v1/solicitudes_rol_trabajador"
        assert request.url.params["order"] == "creado_en.desc"
        return httpx.Response(200, json=[ROLE_REQUEST])

    response = make_client(handler).get(
        "/api/v1/solicitudes/rol-trabajador", headers=TOKEN_HEADERS
    )
    assert response.status_code == 200
    assert response.json()["estado"] == "PENDIENTE"


def test_get_returns_not_found_without_requests(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        return httpx.Response(200, json=[])

    response = make_client(handler).get(
        "/api/v1/solicitudes/rol-trabajador", headers=TOKEN_HEADERS
    )
    assert response.status_code == 404


def test_client_creates_worker_role_request(make_client) -> None:
    uploaded = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal uploaded
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        if request.url.path == "/rest/v1/solicitudes_rol_trabajador" and request.method == "GET":
            assert request.url.params["estado"] == "eq.PENDIENTE"
            return httpx.Response(200, json=[])
        if request.url.path.startswith("/storage/v1/object/documentos-verificacion/"):
            uploaded += 1
            assert "/solicitudes-rol/" in request.url.path
            return httpx.Response(200, json={})
        assert request.url.path == "/rest/v1/solicitudes_rol_trabajador"
        assert request.method == "POST"
        assert request.headers["Prefer"] == "return=representation"
        payload = json.loads(request.content)
        assert payload["usuario_id"] == USER_ID
        assert set(payload) == {
            "usuario_id", "carnet_frontal_path", "carnet_reverso_path", "selfie_path",
        }
        return httpx.Response(201, json=[ROLE_REQUEST])

    response = make_client(handler).post(
        "/api/v1/solicitudes/rol-trabajador", headers=TOKEN_HEADERS, files=FILES
    )
    assert response.status_code == 201
    assert response.json()["usuario_id"] == USER_ID
    assert uploaded == 3


def test_duplicate_pending_request_is_rejected(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        assert request.method == "GET"
        return httpx.Response(200, json=[{"id": REQUEST_ID}])

    response = make_client(handler).post(
        "/api/v1/solicitudes/rol-trabajador", headers=TOKEN_HEADERS, files=FILES
    )
    assert response.status_code == 409


def test_worker_cannot_create_role_request(make_client) -> None:
    worker = {**USER, "rol": "TRABAJADOR"}

    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request, worker)
        if authenticated is not None:
            return authenticated
        pytest.fail("A worker request must not reach the role request table")

    response = make_client(handler).post(
        "/api/v1/solicitudes/rol-trabajador", headers=TOKEN_HEADERS, files=FILES
    )
    assert response.status_code == 403


def test_role_request_rejects_invalid_document(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        if request.url.path == "/rest/v1/solicitudes_rol_trabajador":
            return httpx.Response(200, json=[])
        pytest.fail("Invalid files must not be uploaded")

    files = {**FILES, "selfie": ("selfie.txt", b"not-an-image", "text/plain")}
    response = make_client(handler).post(
        "/api/v1/solicitudes/rol-trabajador", headers=TOKEN_HEADERS, files=files
    )
    assert response.status_code == 422
