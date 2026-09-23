import asyncio
import json
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway

USER_ID = "11111111-2222-3333-4444-555555555555"
SESSION = {
    "access_token": "test-access-token",
    "refresh_token": "new-refresh-token",
    "token_type": "bearer",
    "expires_in": 3600,
}
PROFILE = {
    "id": USER_ID,
    "email": "persona@example.com",
    "nombre": "Persona Prueba",
    "rut": "12345678-5",
    "telefono": None,
    "avatar_url": None,
    "rol": "CLIENTE",
    "activo": True,
    "creado_en": "2026-09-15T12:00:00Z",
    "actualizado_en": "2026-09-15T12:00:00Z",
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


def _register_body(role: str = "CLIENTE") -> dict[str, str]:
    body = {
        "email": "persona@example.com",
        "password": "secret123",
        "nombre": "Persona Prueba",
        "rut": "12345678-5",
        "rol": role,
    }
    if role == "CLIENTE":
        body.update(
            {
                "direccion": "Avenida Siempre Viva 123",
                "comuna_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            }
        )
    return body


def test_register_sends_profile_metadata_and_handles_email_confirmation(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/rest/v1/comunas":
            assert "Authorization" not in request.headers
            return httpx.Response(200, json=[{"id": _register_body()["comuna_id"]}])
        assert request.url.path == "/auth/v1/signup"
        assert request.headers["apikey"] == "sb_publishable_test"
        assert json.loads(request.content) == {
            "email": "persona@example.com",
            "password": "secret123",
            "data": {
                "nombre": "Persona Prueba",
                "rut": "12345678-5",
                "rol": "CLIENTE",
                "direccion": "Avenida Siempre Viva 123",
                "comuna_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            },
        }
        return httpx.Response(200, json={"id": USER_ID})

    response = make_client(handler).post("/api/v1/auth/register", json=_register_body())
    assert response.status_code == 201
    assert response.json() == {
        "user_id": USER_ID,
        "session": None,
        "email_confirmation_required": True,
    }


def test_register_returns_tokens_when_email_confirmation_is_disabled(make_client) -> None:
    client = make_client(lambda _: httpx.Response(200, json={**SESSION, "user": {"id": USER_ID}}))
    response = client.post("/api/v1/auth/register", json=_register_body("TRABAJADOR"))
    assert response.status_code == 201
    assert response.json()["session"] == SESSION
    assert response.json()["email_confirmation_required"] is False


def test_register_rejects_admin_without_contacting_supabase(make_client) -> None:
    def unexpected(_: httpx.Request) -> httpx.Response:
        pytest.fail("An ADMIN registration must not reach Supabase")

    response = make_client(unexpected).post("/api/v1/auth/register", json=_register_body("ADMIN"))
    assert response.status_code == 422


def test_client_registration_requires_address_and_commune(make_client) -> None:
    def unexpected(_: httpx.Request) -> httpx.Response:
        pytest.fail("An incomplete client registration must not reach Supabase")

    body = _register_body()
    for missing in ("direccion", "comuna_id"):
        incomplete = {key: value for key, value in body.items() if key != missing}
        response = make_client(unexpected).post("/api/v1/auth/register", json=incomplete)
        assert response.status_code == 422


def test_client_registration_rejects_unavailable_commune(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/v1/comunas"
        return httpx.Response(200, json=[])

    response = make_client(handler).post("/api/v1/auth/register", json=_register_body())
    assert response.status_code == 422
    assert response.json()["detail"] == "La comuna seleccionada no está disponible"


@pytest.mark.parametrize("rut", ["12345678-0", "12x345678-5", "123-6"])
def test_register_rejects_invalid_rut_before_supabase(make_client, rut) -> None:
    def unexpected(_: httpx.Request) -> httpx.Response:
        pytest.fail("An invalid RUT must not reach Supabase")

    body = {**_register_body(), "rut": rut}
    response = make_client(unexpected).post("/api/v1/auth/register", json=body)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "rut"]


@pytest.mark.parametrize(
    ("rut", "normalized"),
    [(" 12.345.678-5 ", "12345678-5"), ("6.000.000-k", "6000000-K"),
     ("10.000.004-0", "10000004-0")],
)
def test_register_normalizes_valid_rut(make_client, rut, normalized) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/rest/v1/comunas":
            return httpx.Response(200, json=[{"id": _register_body()["comuna_id"]}])
        assert json.loads(request.content)["data"]["rut"] == normalized
        return httpx.Response(200, json={"id": USER_ID})

    body = {**_register_body(), "rut": rut}
    assert make_client(handler).post("/api/v1/auth/register", json=body).status_code == 201


def test_login_explains_email_confirmation(make_client) -> None:
    client = make_client(
        lambda _: httpx.Response(400, json={"error_code": "email_not_confirmed"})
    )
    response = client.post(
        "/api/v1/auth/login", json={"email": "persona@example.com", "password": "secret123"}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Confirma tu correo antes de iniciar sesión"


def test_login_and_refresh_use_the_right_supabase_grants(make_client) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=SESSION)

    client = make_client(handler)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "persona@example.com", "password": "secret123"},
    )
    refresh = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": "old-refresh-token"}
    )

    assert login.status_code == refresh.status_code == 200
    assert login.json() == refresh.json() == SESSION
    assert [request.url.params["grant_type"] for request in requests] == [
        "password",
        "refresh_token",
    ]
    assert json.loads(requests[1].content) == {"refresh_token": "old-refresh-token"}


def test_login_rejects_invalid_credentials(make_client) -> None:
    client = make_client(lambda _: httpx.Response(400, json={"msg": "Invalid credentials"}))
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "persona@example.com", "password": "incorrecta"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Credenciales inválidas"}


def test_me_verifies_the_token_and_reads_its_profile(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer test-access-token"
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID})
        assert request.url.path == "/rest/v1/usuarios"
        assert request.url.params["id"] == f"eq.{USER_ID}"
        return httpx.Response(200, json=[PROFILE])

    response = make_client(handler).get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer test-access-token"}
    )
    assert response.status_code == 200
    assert response.json()["user"]["id"] == USER_ID
    assert response.json()["user"]["rol"] == "CLIENTE"


def test_me_rejects_missing_and_invalid_tokens(make_client) -> None:
    client = make_client(lambda _: httpx.Response(401, json={"msg": "Invalid JWT"}))
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer bad"}).status_code == 401


def test_me_rejects_an_inactive_profile(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID})
        return httpx.Response(200, json=[{**PROFILE, "activo": False}])

    response = make_client(handler).get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer test-access-token"}
    )
    assert response.status_code == 403
