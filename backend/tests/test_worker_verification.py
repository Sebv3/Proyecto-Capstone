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
HEADERS = {"Authorization": "Bearer test-access-token"}
USER = {
    "id": USER_ID,
    "email": "worker@example.com",
    "nombre": "Trabajador Prueba",
    "rut": "12345678-5",
    "telefono": None,
    "avatar_url": None,
    "rol": "TRABAJADOR",
    "activo": True,
    "creado_en": "2026-09-15T12:00:00Z",
    "actualizado_en": "2026-09-15T12:00:00Z",
}
WORKER = {
    "usuario_id": USER_ID,
    "direccion_base": "Calle Principal 123",
    "comuna": {"id": COMMUNE_ID, "nombre": "Santiago"},
    "creado_en": "2026-09-25T12:00:00Z",
    "actualizado_en": "2026-09-25T12:00:00Z",
}
VERIFICATION = {
    "trabajador_id": USER_ID,
    "estado": "PENDIENTE",
    "motivo_rechazo": None,
    "creado_en": "2026-09-25T12:00:00Z",
    "actualizado_en": "2026-09-25T12:00:00Z",
}
JPEG = b"\xff\xd8\xff" + b"test-image-data"
FILES = {
    "carnet_frontal": ("front.jpg", JPEG, "image/jpeg"),
    "carnet_reverso": ("back.jpg", JPEG, "image/jpeg"),
    "selfie": ("selfie.jpg", JPEG, "image/jpeg"),
}


@pytest.fixture
def make_client():
    clients: list[httpx.AsyncClient] = []

    def create(handler: Callable[[httpx.Request], httpx.Response]) -> TestClient:
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        clients.append(client)
        app.dependency_overrides[get_auth_gateway] = lambda: SupabaseAuthGateway(
            client, "https://test.supabase.co", "sb_publishable_test"
        )
        return TestClient(app)

    yield create
    app.dependency_overrides.pop(get_auth_gateway, None)
    for client in clients:
        asyncio.run(client.aclose())


def authenticated(request: httpx.Request, user: dict = USER):
    assert request.headers["Authorization"] == "Bearer test-access-token"
    if request.url.path == "/auth/v1/user":
        return httpx.Response(200, json={"id": USER_ID})
    if request.url.path == "/rest/v1/usuarios":
        return httpx.Response(200, json=[user])
    return None


def test_worker_creates_address_before_verification(make_client):
    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        if request.url.path == "/rest/v1/comunas":
            return httpx.Response(200, json=[{"id": COMMUNE_ID}])
        if request.url.path == "/rest/v1/trabajadores" and request.method == "POST":
            assert json.loads(request.content) == {
                "usuario_id": USER_ID,
                "direccion_base": "Calle Principal 123",
                "comuna_id": COMMUNE_ID,
            }
            return httpx.Response(201)
        if request.url.path == "/rest/v1/trabajadores" and request.method == "GET":
            return httpx.Response(200, json=[WORKER])
        pytest.fail(f"unexpected request: {request.method} {request.url.path}")

    response = make_client(handler).post(
        "/api/v1/perfiles/trabajador",
        headers=HEADERS,
        json={"direccion_base": " Calle Principal 123 ", "comuna_id": COMMUNE_ID},
    )
    assert response.status_code == 201
    assert response.json()["direccion_base"] == "Calle Principal 123"
    assert response.json()["comuna"]["nombre"] == "Santiago"


def test_worker_edits_address(make_client):
    updated = {**WORKER, "direccion_base": "Nueva Calle 456"}

    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        if request.url.path == "/rest/v1/comunas":
            return httpx.Response(200, json=[{"id": COMMUNE_ID}])
        if request.url.path == "/rest/v1/verificaciones_trabajador":
            return httpx.Response(200, json=[VERIFICATION])
        if request.url.path == "/rest/v1/trabajadores" and request.method == "GET":
            return httpx.Response(200, json=[WORKER])
        assert request.url.path == "/rest/v1/trabajadores"
        assert request.method == "PATCH"
        assert request.url.params["usuario_id"] == f"eq.{USER_ID}"
        assert json.loads(request.content) == {
            "direccion_base": "Nueva Calle 456", "comuna_id": COMMUNE_ID,
        }
        return httpx.Response(200, json=[updated])

    response = make_client(handler).patch(
        "/api/v1/perfiles/trabajador",
        headers=HEADERS,
        json={"direccion_base": "Nueva Calle 456", "comuna_id": COMMUNE_ID},
    )
    assert response.status_code == 200
    assert response.json()["direccion_base"] == "Nueva Calle 456"


def test_worker_cannot_edit_address_before_document_submission(make_client):
    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        if request.url.path == "/rest/v1/trabajadores":
            return httpx.Response(200, json=[WORKER])
        assert request.url.path == "/rest/v1/verificaciones_trabajador"
        return httpx.Response(200, json=[])

    response = make_client(handler).patch(
        "/api/v1/perfiles/trabajador", headers=HEADERS,
        json={"direccion_base": "Nueva Calle 456", "comuna_id": COMMUNE_ID},
    )
    assert response.status_code == 404


def test_legacy_worker_can_add_commune_before_documents(make_client):
    completed = {**WORKER, "comuna": {"id": COMMUNE_ID, "nombre": "Santiago"}}

    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        if request.url.path == "/rest/v1/trabajadores":
            if request.method == "GET":
                return httpx.Response(200, json=[{**WORKER, "comuna": None}])
            assert request.method == "PATCH"
            assert json.loads(request.content)["comuna_id"] == COMMUNE_ID
            return httpx.Response(200, json=[completed])
        if request.url.path == "/rest/v1/comunas":
            return httpx.Response(200, json=[{"id": COMMUNE_ID}])
        pytest.fail("Legacy completion should not require a verification")

    response = make_client(handler).patch(
        "/api/v1/perfiles/trabajador", headers=HEADERS,
        json={"direccion_base": "Calle Principal 123", "comuna_id": COMMUNE_ID},
    )
    assert response.status_code == 200
    assert response.json()["comuna"]["id"] == COMMUNE_ID


def test_worker_profile_rejects_inactive_commune(make_client):
    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        assert request.url.path == "/rest/v1/comunas"
        return httpx.Response(200, json=[])

    response = make_client(handler).post(
        "/api/v1/perfiles/trabajador", headers=HEADERS,
        json={"direccion_base": "Calle Principal 123", "comuna_id": COMMUNE_ID},
    )
    assert response.status_code == 422


def test_client_cannot_access_worker_profile(make_client):
    def handler(request: httpx.Request):
        response = authenticated(request, {**USER, "rol": "CLIENTE"})
        if response is not None:
            return response
        pytest.fail("A client should not access worker data")

    response = make_client(handler).get("/api/v1/perfiles/trabajador", headers=HEADERS)
    assert response.status_code == 403


def test_upload_requires_worker_address(make_client):
    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        assert request.url.path == "/rest/v1/trabajadores"
        return httpx.Response(200, json=[])

    response = make_client(handler).post(
        "/api/v1/verificaciones/trabajador",
        headers=HEADERS,
        files=FILES,
    )
    assert response.status_code == 404


def test_upload_requires_worker_commune(make_client):
    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        assert request.url.path == "/rest/v1/trabajadores"
        return httpx.Response(200, json=[{**WORKER, "comuna": None}])

    response = make_client(handler).post(
        "/api/v1/verificaciones/trabajador", headers=HEADERS, files=FILES,
    )
    assert response.status_code == 409


@pytest.mark.parametrize("state", ["PENDIENTE", "APROBADA"])
def test_upload_rejects_existing_active_verification(make_client, state):
    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        if request.url.path == "/rest/v1/trabajadores":
            return httpx.Response(200, json=[WORKER])
        if request.url.path == "/rest/v1/verificaciones_trabajador":
            return httpx.Response(200, json=[{"estado": state}])
        pytest.fail("Documents must not be uploaded")

    response = make_client(handler).post(
        "/api/v1/verificaciones/trabajador",
        headers=HEADERS,
        files=FILES,
    )
    assert response.status_code == 409


def test_upload_sends_private_paths_and_returns_status(make_client):
    uploaded = []

    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        if request.url.path == "/rest/v1/trabajadores":
            return httpx.Response(200, json=[WORKER])
        if request.url.path == "/rest/v1/verificaciones_trabajador":
            if request.method == "GET":
                return httpx.Response(200, json=[])
            assert request.method == "POST"
            body = json.loads(request.content)
            assert body["trabajador_id"] == USER_ID
            assert all(
                path.startswith(f"{USER_ID}/")
                for key, path in body.items()
                if key.endswith("_path")
            )
            assert len(uploaded) == 3
            return httpx.Response(201, json=[VERIFICATION])
        if request.url.path.startswith("/storage/v1/object/documentos-verificacion/"):
            assert request.method == "POST"
            assert request.content == JPEG
            assert request.headers["content-type"] == "image/jpeg"
            uploaded.append(request.url.path)
            return httpx.Response(200, json={"Key": request.url.path})
        pytest.fail(f"unexpected request: {request.method} {request.url.path}")

    response = make_client(handler).post(
        "/api/v1/verificaciones/trabajador",
        headers=HEADERS,
        files=FILES,
    )
    assert response.status_code == 201
    assert response.json()["estado"] == "PENDIENTE"
    assert "carnet_frontal_path" not in response.json()


def test_upload_rejects_mismatched_image_format(make_client):
    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        if request.url.path == "/rest/v1/trabajadores":
            return httpx.Response(200, json=[WORKER])
        if request.url.path == "/rest/v1/verificaciones_trabajador":
            return httpx.Response(200, json=[])
        pytest.fail("An invalid document should not be uploaded")

    files = {**FILES, "selfie": ("selfie.jpg", b"not-an-image", "image/jpeg")}
    response = make_client(handler).post(
        "/api/v1/verificaciones/trabajador",
        headers=HEADERS,
        files=files,
    )
    assert response.status_code == 422


def test_rejected_verification_can_be_resubmitted(make_client):
    def handler(request: httpx.Request):
        response = authenticated(request)
        if response is not None:
            return response
        if request.url.path == "/rest/v1/trabajadores":
            return httpx.Response(200, json=[WORKER])
        if request.url.path == "/rest/v1/verificaciones_trabajador":
            if request.method == "GET":
                return httpx.Response(200, json=[{"estado": "RECHAZADA"}])
            assert request.method == "PATCH"
            assert request.url.params["trabajador_id"] == f"eq.{USER_ID}"
            body = json.loads(request.content)
            assert set(body) == {"carnet_frontal_path", "carnet_reverso_path", "selfie_path"}
            return httpx.Response(200, json=[VERIFICATION])
        if request.url.path.startswith("/storage/v1/object/documentos-verificacion/"):
            return httpx.Response(200, json={})
        pytest.fail(f"unexpected request: {request.method} {request.url.path}")

    response = make_client(handler).post(
        "/api/v1/verificaciones/trabajador", headers=HEADERS, files=FILES,
    )
    assert response.status_code == 201
    assert response.json()["estado"] == "PENDIENTE"


def test_failed_upload_removes_already_uploaded_documents(make_client):
    removed: list[str] = []
    uploaded = 0

    def handler(request: httpx.Request):
        nonlocal uploaded
        response = authenticated(request)
        if response is not None:
            return response
        if request.url.path == "/rest/v1/trabajadores":
            return httpx.Response(200, json=[WORKER])
        if request.url.path == "/rest/v1/verificaciones_trabajador":
            return httpx.Response(200, json=[])
        if request.url.path == "/storage/v1/object/documentos-verificacion":
            assert request.method == "DELETE"
            removed.extend(json.loads(request.content)["prefixes"])
            return httpx.Response(200, json=[])
        if request.url.path.startswith("/storage/v1/object/documentos-verificacion/"):
            uploaded += 1
            return httpx.Response(200 if uploaded == 1 else 500, json={})
        pytest.fail(f"unexpected request: {request.method} {request.url.path}")

    response = make_client(handler).post(
        "/api/v1/verificaciones/trabajador", headers=HEADERS, files=FILES,
    )
    assert response.status_code == 502
    assert len(removed) == 1
    assert removed[0].startswith(f"{USER_ID}/")
