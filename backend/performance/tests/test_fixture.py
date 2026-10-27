"""Guardrails run explicitly inside the isolated performance container."""

import importlib
import sys

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def fixture_api(monkeypatch):
    # Importing the harness changes only this process; restore shared app afterwards.
    overrides = app.dependency_overrides.copy()
    middleware = app.user_middleware.copy()
    routes = app.router.routes.copy()
    monkeypatch.setenv("PERF_UPSTREAM_DELAY_MS", "0")
    module = (importlib.reload(sys.modules["performance.fixture_app"])
              if "performance.fixture_app" in sys.modules
              else importlib.import_module("performance.fixture_app"))
    app.middleware_stack = None
    with TestClient(app) as client:
        yield client, module
    app.dependency_overrides = overrides
    app.user_middleware = middleware
    app.router.routes = routes
    app.middleware_stack = None


def test_fixture_reads_real_routes_with_fake_identity_and_data(fixture_api):
    client, fixture = fixture_api
    headers = {"Authorization": "Bearer fixture-client"}
    response = client.get("/api/v1/solicitudes?vista=activas&limit=20", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 20
    assert {row["cliente_id"] for row in response.json()} == {fixture.CLIENT}
    page = client.get(f"/api/v1/solicitudes/{fixture.BOOKING}/chat", headers=headers)
    assert page.status_code == 200 and len(page.json()["items"]) == 50
    assert page.json()["has_more"] is True
    assert client.get("/api/v1/servicios?limit=20").json()["total"] == 100


def test_fixture_rejects_writes_unknown_routes_and_real_tokens(fixture_api):
    client, _ = fixture_api
    assert client.post("/api/v1/solicitudes", json={}).status_code == 405
    assert client.post("/api/v1/pagos/mercadopago/webhook", json={}).status_code == 405
    assert client.get("/api/v1/pagos/configuracion").status_code == 404
    rejected = client.get("/api/v1/solicitudes", headers={"Authorization": "Bearer real-token"})
    assert rejected.status_code == 401
    assert client.get("/api/v1/solicitudes").status_code == 401


@pytest.mark.asyncio
async def test_transport_rejects_write_rpcs(fixture_api):
    _, fixture = fixture_api
    request = httpx.Request("POST", "https://fixture.invalid/rest/v1/rpc/crear_solicitud",
                            headers={"Authorization": "Bearer fixture-client"}, json={})
    response = await fixture.upstream(request)
    assert response.status_code == 500
    assert response.json()["code"] == "FIXTURE_UNSUPPORTED"
