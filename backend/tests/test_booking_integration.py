"""SCRUM-52: FastAPI -> real PostgREST -> real PostgreSQL/RLS.

Set BOOKING_INTEGRATION_URL only for the disposable Sprint 4 Docker stack.
Auth token verification is local to the test; all profile reads and RPCs are real.
Shared Supabase is never used. No dependencies beyond the existing test runtime.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway

URL = os.getenv("BOOKING_INTEGRATION_URL", "")
LOCAL_URL = "http://servimatch-sprint4-review-rest:3000"
SECRET = "servimatch-sprint4-isolated-jwt-test-secret-only"
WORKER = "11111111-1111-4111-8111-111111111111"
OTHER_WORKER = "22222222-2222-4222-8222-222222222222"
CLIENT = "55555555-5555-4555-8555-555555555555"
OTHER_CLIENT = "66666666-6666-4666-8666-666666666666"
ADMIN = "33333333-3333-4333-8333-333333333333"
HOME = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
SHOP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
pytestmark = pytest.mark.skipif(not URL, reason="Requires isolated PostgreSQL/PostgREST stack")


def _b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def token(user_id):
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64(json.dumps({"sub": user_id, "role": "authenticated",
                           "exp": int(time.time()) + 3600}).encode())
    message = f"{header}.{body}"
    return message + "." + _b64(hmac.digest(SECRET.encode(), message.encode(), hashlib.sha256))


def headers(user_id):
    return {"Authorization": f"Bearer {token(user_id)}"}


@pytest.fixture
def integration():
    assert URL == LOCAL_URL, "Integration writes are restricted to the disposable test stack"
    with httpx.Client(base_url=URL, timeout=10) as direct:
        result = direct.post("/rpc/test_reset_bookings", headers=headers(ADMIN), json={})
        assert result.status_code == 204, result.text
    remote = httpx.AsyncClient(base_url=URL, timeout=10)
    race_ids = set()
    race_reads = set()
    race_gate = asyncio.Event()

    async def route(request):
        if request.url.path == "/auth/v1/user":
            encoded = request.headers["Authorization"].removeprefix("Bearer ")
            message, signature = encoded.rsplit(".", 1)
            expected = _b64(hmac.digest(SECRET.encode(), message.encode(), hashlib.sha256))
            if not hmac.compare_digest(signature, expected):
                return httpx.Response(401, json={"message": "Invalid test token"})
            payload = message.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
            return httpx.Response(200, json={"id": claims["sub"]})
        path = request.url.path.removeprefix("/rest/v1")
        result = await remote.request(request.method, path, params=request.url.params,
                                      headers=dict(request.headers), content=request.content)
        # Force both competing API requests to observe PENDIENTE before either writes.
        # Otherwise one may see RECHAZADA early and never exercise the SQL conflict.
        booking_id = request.url.params.get("id", "").removeprefix("eq.")
        if path == "/solicitudes" and request.method == "GET" and booking_id in race_ids:
            race_reads.add(booking_id)
            if len(race_reads) == 2:
                race_ids.clear()
                race_gate.set()
            else:
                await asyncio.wait_for(race_gate.wait(), timeout=5)
        return result

    transport = httpx.AsyncClient(transport=httpx.MockTransport(route))
    gateway = SupabaseAuthGateway(transport, "https://isolated.test", "test-publishable")
    app.dependency_overrides[get_auth_gateway] = lambda: gateway
    try:
        with TestClient(app) as api:
            api.integration_race_ids = race_ids
            yield api
            # Close on the same event loop used for real network requests.
            api.portal.call(remote.aclose)
    finally:
        app.dependency_overrides.pop(get_auth_gateway, None)
        asyncio.run(transport.aclose())


def schedule(api, service=HOME, start=None):
    start = start or datetime.now(UTC) + timedelta(days=2)
    result = api.post(f"/api/v1/trabajador/servicios/{service}/disponibilidad",
                      headers=headers(WORKER), json={
                          "inicio_en": start.isoformat(),
                          "fin_en": (start + timedelta(hours=4)).isoformat(),
                      })
    assert result.status_code == 201, result.text
    return start, result.json()


def create(api, start, service=HOME, user=CLIENT):
    body = {"servicio_id": service, "inicio_en": start.isoformat()}
    if service == HOME:
        body["direccion_servicio"] = "Direccion privada del cliente 123"
    result = api.post("/api/v1/solicitudes", headers=headers(user), json=body)
    assert result.status_code == 201, result.text
    return result.json()


def action(api, booking, name, user=WORKER, body=None):
    return api.post(f"/api/v1/solicitudes/{booking['id']}/{name}",
                    headers=headers(user), json=body)


@pytest.mark.parametrize("service,steps", [
    (HOME, ["en-camino", "iniciar"]), (SHOP, ["iniciar", "listo"]),
])
def test_complete_lifecycle_uses_real_rpc_and_code(integration, service, steps):
    api = integration
    start, _ = schedule(api, service)
    booking = create(api, start, service)
    assert booking["modalidad"] == ("DOMICILIO" if service == HOME else "TALLER")
    assert booking["ubicacion_servicio"] == (
        "Direccion privada del cliente 123" if service == HOME else "Avenida Central 123"
    )
    assert action(api, booking, "aceptar").status_code == 200
    assert action(api, booking, "iniciar").status_code == 409
    with httpx.Client(base_url=URL) as direct:
        paid = direct.post("/rpc/test_set_paid", headers=headers(ADMIN),
                           json={"p_id": booking["id"]})
        assert paid.status_code == 204, paid.text
    for step in steps:
        result = action(api, booking, step)
        assert result.status_code == 200, result.text
    code = action(api, booking, "codigo-confirmacion")
    assert code.status_code == 200, code.text
    result = action(api, booking, "completar", CLIENT, {"codigo": code.json()["codigo"]})
    assert result.status_code == 200 and result.json()["estado"] == "COMPLETADA", result.text
    assert action(api, booking, "completar", CLIENT,
                  {"codigo": code.json()["codigo"]}).status_code == 409


def test_database_rls_and_http_ownership_hide_private_address(integration):
    api = integration
    start, _ = schedule(api)
    booking = create(api, start)
    for user in (OTHER_CLIENT, OTHER_WORKER):
        result = api.get(f"/api/v1/solicitudes/{booking['id']}", headers=headers(user))
        assert result.status_code == 404 and "Direccion privada" not in result.text
        assert api.get("/api/v1/solicitudes", headers=headers(user)).json() == []
    with httpx.Client(base_url=URL) as direct:
        assert direct.get("/solicitudes", headers=headers(OTHER_CLIENT)).json() == []
        assert direct.get("/confirmaciones_solicitud", headers=headers(CLIENT)).status_code == 403
        assert direct.patch("/solicitudes", headers=headers(WORKER),
                            json={"estado": "PAGADA"}).status_code == 403


def test_conflicts_duplicate_requests_and_adjacent_slots(integration):
    api = integration
    start, block = schedule(api)
    booking = create(api, start)
    duplicate = api.post("/api/v1/solicitudes", headers=headers(CLIENT), json={
        "servicio_id": HOME, "inicio_en": start.isoformat(),
        "direccion_servicio": "Client address 123",
    })
    assert duplicate.status_code == 409
    overlap = create(api, start + timedelta(minutes=30), user=OTHER_CLIENT)
    assert action(api, booking, "aceptar").status_code == 200
    assert api.get(f"/api/v1/solicitudes/{overlap['id']}",
                   headers=headers(OTHER_CLIENT)).json()["estado"] == "RECHAZADA"
    remove = api.delete(f"/api/v1/trabajador/servicios/{HOME}/disponibilidad/{block['id']}",
                        headers=headers(WORKER))
    assert remove.status_code == 409
    adjacent = create(api, start + timedelta(minutes=60))
    assert action(api, adjacent, "aceptar").status_code == 200


def test_concurrent_acceptances_confirm_only_one_booking(integration):
    api = integration
    start, _ = schedule(api)
    first, second = create(api, start), create(api, start, user=OTHER_CLIENT)
    api.integration_race_ids.update([first["id"], second["id"]])
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda booking: action(api, booking, "aceptar"), [first, second]))
    assert sorted(result.status_code for result in results) == [200, 409]
    states = [api.get(f"/api/v1/solicitudes/{item['id']}", headers=headers(WORKER)).json()["estado"]
              for item in (first, second)]
    assert sorted(states) == ["ACEPTADA", "RECHAZADA"]


@pytest.mark.parametrize("user", [CLIENT, WORKER])
def test_cancellation_releases_slot_and_preserves_reason(integration, user):
    api = integration
    start, _ = schedule(api)
    booking = create(api, start)
    assert action(api, booking, "aceptar").status_code == 200
    result = action(api, booking, "cancelar", user, {"motivo": "  Cambio de planes  "})
    assert result.status_code == 200 and result.json()["motivo_cancelacion"] == "Cambio de planes"
    assert action(api, booking, "aceptar").status_code == 409
    replacement = create(api, start)
    assert action(api, replacement, "aceptar").status_code == 200


def test_worker_cannot_manage_foreign_availability(integration):
    api = integration
    start, block = schedule(api)
    path = f"/api/v1/trabajador/servicios/{HOME}/disponibilidad"
    result = api.post(path, headers=headers(OTHER_WORKER), json={
        "inicio_en": start.isoformat(), "fin_en": (start + timedelta(hours=3)).isoformat(),
    })
    assert result.status_code == 403
    assert api.delete(f"{path}/{block['id']}", headers=headers(OTHER_WORKER)).status_code == 403
    assert api.delete(f"{path}/{block['id']}", headers=headers(WORKER)).status_code == 200
