import asyncio
import json
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway

ADMIN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
WORKER_ID = "11111111-2222-3333-4444-555555555555"
TOKEN_HEADERS = {"Authorization": "Bearer admin-access-token"}
ADMIN = {
    "id": ADMIN_ID,
    "email": "admin@example.com",
    "nombre": "Admin Prueba",
    "rut": "12345678-5",
    "telefono": "+56912345678",
    "avatar_url": None,
    "rol": "ADMIN",
    "activo": True,
    "creado_en": "2026-09-15T12:00:00Z",
    "actualizado_en": "2026-09-15T12:00:00Z",
}
VERIFICATION = {
    "trabajador_id": WORKER_ID,
    "estado": "APROBADA",
    "motivo_rechazo": None,
    "creado_en": "2026-09-25T12:00:00Z",
    "actualizado_en": "2026-09-29T12:00:00Z",
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


def _authenticate(request: httpx.Request, user: dict = ADMIN) -> httpx.Response | None:
    assert request.headers["Authorization"] == TOKEN_HEADERS["Authorization"]
    if request.url.path == "/auth/v1/user":
        return httpx.Response(200, json={"id": ADMIN_ID})
    if request.url.path == "/rest/v1/usuarios":
        return httpx.Response(200, json=[user])
    return None


def test_admin_approves_pending_verification(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        assert request.url.path == "/rest/v1/rpc/revisar_verificacion_trabajador"
        assert json.loads(request.content) == {
            "p_trabajador_id": WORKER_ID,
            "p_estado": "APROBADA",
            "p_motivo": None,
        }
        return httpx.Response(200, json=[VERIFICATION])

    response = make_client(handler).patch(
        f"/api/v1/admin/verificaciones/{WORKER_ID}",
        headers=TOKEN_HEADERS,
        json={"estado": "APROBADA", "motivo_rechazo": None},
    )
    assert response.status_code == 200
    assert response.json()["estado"] == "APROBADA"


def test_admin_rejects_with_trimmed_reason(make_client) -> None:
    rejected = {**VERIFICATION, "estado": "RECHAZADA", "motivo_rechazo": "Carnet ilegible"}

    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        assert json.loads(request.content)["p_motivo"] == "Carnet ilegible"
        return httpx.Response(200, json=[rejected])

    response = make_client(handler).patch(
        f"/api/v1/admin/verificaciones/{WORKER_ID}",
        headers=TOKEN_HEADERS,
        json={"estado": "RECHAZADA", "motivo_rechazo": "  Carnet ilegible  "},
    )
    assert response.status_code == 200
    assert response.json()["motivo_rechazo"] == "Carnet ilegible"


@pytest.mark.parametrize(
    "body",
    [
        {"estado": "RECHAZADA", "motivo_rechazo": None},
        {"estado": "APROBADA", "motivo_rechazo": "No corresponde"},
        {"estado": "PENDIENTE", "motivo_rechazo": None},
    ],
)
def test_review_validates_state_and_reason(make_client, body) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        pytest.fail("Invalid review must not reach the review RPC")

    response = make_client(handler).patch(
        f"/api/v1/admin/verificaciones/{WORKER_ID}", headers=TOKEN_HEADERS, json=body
    )
    assert response.status_code == 422


def test_non_admin_cannot_review_verification(make_client) -> None:
    client_user = {**ADMIN, "rol": "CLIENTE"}

    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request, client_user)
        if authenticated is not None:
            return authenticated
        pytest.fail("Non-admin review must not reach the review RPC")

    response = make_client(handler).patch(
        f"/api/v1/admin/verificaciones/{WORKER_ID}",
        headers=TOKEN_HEADERS,
        json={"estado": "APROBADA", "motivo_rechazo": None},
    )
    assert response.status_code == 403


def test_review_rejects_worker_without_pending_verification(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        authenticated = _authenticate(request)
        if authenticated is not None:
            return authenticated
        return httpx.Response(400, json={"message": "No pending verification"})

    response = make_client(handler).patch(
        f"/api/v1/admin/verificaciones/{WORKER_ID}",
        headers=TOKEN_HEADERS,
        json={"estado": "APROBADA", "motivo_rechazo": None},
    )
    assert response.status_code == 409
