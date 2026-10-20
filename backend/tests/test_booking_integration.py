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
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.mercadopago import get_mercadopago, get_payment_store
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


def token(user_id, role="authenticated"):
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64(json.dumps({"sub": user_id, "role": role,
                           "exp": int(time.time()) + 3600}).encode())
    message = f"{header}.{body}"
    return message + "." + _b64(hmac.digest(SECRET.encode(), message.encode(), hashlib.sha256))


def headers(user_id):
    return {"Authorization": f"Bearer {token(user_id)}"}


@pytest.fixture
def integration(monkeypatch):
    monkeypatch.setenv("MERCADO_PAGO_ENABLED", "false")
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
            api.integration_gateway = gateway
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
    body = {"servicio_id": service, "inicio_en": start.isoformat(),
            "comuna_servicio_id": "77777777-7777-4777-8777-777777777777"}
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
    chat_path = f"/api/v1/solicitudes/{booking['id']}/chat"
    assert api.post(chat_path, headers=headers(CLIENT)).status_code == 200
    sent = api.post(chat_path + "/mensajes", headers=headers(CLIENT), json={
        "id": "abababab-abab-4bab-8bab-abababababab", "contenido": "Coordinar el servicio",
    })
    assert sent.status_code == 200
    assert booking["modalidad"] == ("DOMICILIO" if service == HOME else "TALLER")
    assert booking["ubicacion_servicio"] == (
        "Direccion privada del cliente 123" if service == HOME else "Avenida Central 123"
    )
    assert action(api, booking, "aceptar").status_code == 200
    assert action(api, booking, "iniciar").status_code == 409
    paid = api.post(f"/api/v1/solicitudes/{booking['id']}/pago/simular",
                    headers=headers(CLIENT), json={})
    assert paid.status_code == 200, paid.text
    assert paid.json()["pago"]["monto_total"] == (23000 if service == HOME else 34500)
    for step in steps:
        result = action(api, booking, step)
        assert result.status_code == 200, result.text
    assert action(api, booking, "codigo-confirmacion", WORKER).status_code == 403
    code = action(api, booking, "codigo-confirmacion", CLIENT)
    assert code.status_code == 200, code.text
    assert action(api, booking, "completar", CLIENT,
                  {"codigo": code.json()["codigo"]}).status_code == 403
    result = action(api, booking, "completar", WORKER, {"codigo": code.json()["codigo"]})
    assert result.status_code == 200 and result.json()["estado"] == "COMPLETADA", result.text
    month = datetime.now(ZoneInfo("America/Santiago")).strftime("%Y-%m")
    earnings_path = f"/api/v1/trabajadores/me/ganancias?mes={month}"
    earnings = api.get(earnings_path, headers=headers(WORKER))
    assert earnings.status_code == 200, earnings.text
    summary = earnings.json()
    assert summary["total_completado"] == booking["precio_base"]
    assert summary["cantidad_completada"] == 1 and summary["total_en_curso"] == 0
    assert sum(day["monto"] for day in summary["dias"]) == booking["precio_base"]
    assert summary["items"][0]["solicitud_id"] == booking["id"]
    assert api.get(earnings_path, headers=headers(OTHER_WORKER)).json()["items"] == []
    assert api.get(earnings_path, headers=headers(CLIENT)).status_code == 403
    assert api.get(chat_path, headers=headers(CLIENT)).status_code == 410
    review_path = f"/api/v1/solicitudes/{booking['id']}/calificacion"
    review = api.post(review_path, headers=headers(CLIENT), json={
        "puntuacion": 5, "comentario": "Muy buen trabajo",
    })
    assert review.status_code == 201, review.text
    assert api.get(review_path, headers=headers(WORKER)).json()["puntuacion"] == 5
    assert action(api, booking, "completar", WORKER,
                  {"codigo": code.json()["codigo"]}).status_code == 409


def test_client_tabs_sort_by_creation_and_paginate_after_filtering(integration):
    api = integration
    start, _ = schedule(api)
    first = create(api, start + timedelta(hours=3))
    rejected = create(api, start)
    assert action(api, rejected, "rechazar").status_code == 200
    cancelled = create(api, start + timedelta(hours=1))
    result = action(api, cancelled, "cancelar", CLIENT, {"motivo": "Cambio de planes"})
    assert result.status_code == 200
    newest = create(api, start + timedelta(hours=2))

    for view, expected in [("activas", [newest, first]), ("historial", [cancelled, rejected])]:
        for offset, booking in enumerate(expected):
            response = api.get("/api/v1/solicitudes", headers=headers(CLIENT), params={
                "vista": view, "limit": 1, "offset": offset,
            })
            assert response.status_code == 200, response.text
            assert [row["id"] for row in response.json()] == [booking["id"]]
        assert api.get("/api/v1/solicitudes", headers=headers(OTHER_CLIENT),
                       params={"vista": view}).json() == []
    assert api.get("/api/v1/solicitudes", headers=headers(CLIENT), params={
        "vista": "activas", "estado": "CANCELADA",
    }).json() == []
    assert api.get("/api/v1/solicitudes", headers=headers(CLIENT), params={
        "vista": "historial", "estado": "RECHAZADA",
    }).json()[0]["id"] == rejected["id"]
    worker_list = api.get("/api/v1/solicitudes", headers=headers(WORKER))
    assert [row["id"] for row in worker_list.json()] == [
        newest["id"], first["id"],
    ]


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
        "comuna_servicio_id": "77777777-7777-4777-8777-777777777777",
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


def test_simulated_payment_permissions_idempotency_and_rls(integration):
    api = integration
    start, _ = schedule(api)
    booking = create(api, start)
    path = f"/api/v1/solicitudes/{booking['id']}/pago"
    assert api.post(path + "/simular", headers=headers(CLIENT), json={}).status_code == 409
    assert action(api, booking, "aceptar").status_code == 200
    quote = api.get(path, headers=headers(CLIENT))
    assert quote.status_code == 200 and quote.json()["monto_total"] == 23000
    for user in (WORKER, OTHER_CLIENT):
        assert api.post(path + "/simular", headers=headers(user), json={}).status_code == 403
    assert api.get(path, headers=headers(OTHER_CLIENT)).status_code == 404
    # Concurrent retries must produce one receipt and one committed payment.
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: api.post(
            path + "/simular", headers=headers(CLIENT), json={},
        ), range(2)))
    assert all(result.status_code == 200 for result in results)
    assert results[0].json()["pago"]["id"] == results[1].json()["pago"]["id"]
    cancelled = action(api, booking, "cancelar", CLIENT, {"motivo": "Cambio de planes"})
    assert cancelled.status_code == 409
    with httpx.Client(base_url=URL) as direct:
        assert len(direct.get("/pagos", headers=headers(CLIENT)).json()) == 1
        assert len(direct.get("/pagos", headers=headers(WORKER)).json()) == 1
        assert direct.get("/pagos", headers=headers(OTHER_CLIENT)).json() == []
        assert direct.patch("/pagos", headers=headers(CLIENT),
                            json={"monto_total": 1}).status_code == 403


def test_concurrent_cancellation_and_payment_are_mutually_exclusive(integration):
    api = integration
    start, _ = schedule(api)
    booking = create(api, start)
    assert action(api, booking, "aceptar").status_code == 200
    path = f"/api/v1/solicitudes/{booking['id']}/pago/simular"
    with ThreadPoolExecutor(max_workers=2) as pool:
        payment = pool.submit(api.post, path, headers=headers(CLIENT), json={})
        cancellation = pool.submit(action, api, booking, "cancelar", CLIENT,
                                   {"motivo": "Cambio de planes"})
        results = [payment.result(), cancellation.result()]
    assert sorted(result.status_code for result in results) == [200, 409]
    final = api.get(f"/api/v1/solicitudes/{booking['id']}", headers=headers(CLIENT)).json()
    with httpx.Client(base_url=URL) as direct:
        receipts = direct.get("/pagos", headers=headers(CLIENT)).json()
    assert len(receipts) == (1 if final["estado"] == "PAGADA" else 0)
    assert final["estado"] in ("PAGADA", "CANCELADA")


def test_temporary_chat_crud_permissions_and_terminal_cleanup(integration):
    api = integration
    start, _ = schedule(api)
    booking = create(api, start)
    path = f"/api/v1/solicitudes/{booking['id']}/chat"
    assert api.get(path, headers=headers(CLIENT)).json()["conversacion_id"] is None
    first = api.post(path, headers=headers(CLIENT))
    second = api.post(path, headers=headers(WORKER))
    assert first.status_code == second.status_code == 200
    assert first.json()["conversacion_id"] == second.json()["conversacion_id"]
    assert api.get(path, headers=headers(OTHER_CLIENT)).status_code == 404
    message_id = "aaaaaaaa-1234-4123-8123-aaaaaaaaaaaa"
    payload = {"id": message_id, "contenido": "Mensaje temporal"}
    for _ in range(2):
        sent = api.post(path + "/mensajes", headers=headers(CLIENT), json=payload)
        assert sent.status_code == 200
    assert len(api.get(path, headers=headers(WORKER)).json()["items"]) == 1
    message_path = path + "/mensajes/" + message_id
    assert api.patch(message_path, headers=headers(WORKER),
                     json={"contenido": "No soy el autor"}).status_code == 404
    assert api.patch(message_path, headers=headers(CLIENT),
                     json={"contenido": "Texto nuevo"}).status_code == 200
    assert api.delete(message_path, headers=headers(WORKER)).status_code == 404
    assert api.delete(message_path, headers=headers(CLIENT)).status_code == 200
    assert api.get(path, headers=headers(CLIENT)).json()["items"] == []
    assert api.post(path + "/mensajes", headers=headers(CLIENT), json=payload).status_code == 200
    cancelled = action(api, booking, "cancelar", CLIENT, {"motivo": "Cambio de planes"})
    assert cancelled.status_code == 200
    assert api.get(path, headers=headers(CLIENT)).status_code == 410
    assert api.post(path, headers=headers(CLIENT)).status_code == 410
    with httpx.Client(base_url=URL) as direct:
        assert direct.get("/conversaciones", headers=headers(CLIENT)).json() == []
        assert direct.get("/mensajes", headers=headers(CLIENT)).json() == []


def test_message_send_racing_cancellation_cannot_retain_chat(integration):
    api = integration
    start, _ = schedule(api)
    booking = create(api, start)
    path = f"/api/v1/solicitudes/{booking['id']}/chat"
    assert api.post(path, headers=headers(CLIENT)).status_code == 200
    with ThreadPoolExecutor(max_workers=2) as pool:
        sent = pool.submit(api.post, path + "/mensajes", headers=headers(CLIENT), json={
            "id": "abababab-abab-4bab-8bab-abababababab", "contenido": "Mensaje simultaneo",
        })
        cancelled = pool.submit(action, api, booking, "cancelar", CLIENT,
                                {"motivo": "Cambio de planes"})
        assert sent.result().status_code in (200, 410)
        assert cancelled.result().status_code == 200
    assert api.get(path, headers=headers(CLIENT)).status_code == 410
    with httpx.Client(base_url=URL) as direct:
        assert direct.get("/conversaciones", headers=headers(CLIENT)).json() == []
        assert direct.get("/mensajes", headers=headers(CLIENT)).json() == []


def test_completed_review_concurrent_retries_and_public_privacy(integration):
    api = integration
    start, _ = schedule(api)
    booking = create(api, start)
    path = f"/api/v1/solicitudes/{booking['id']}/calificacion"
    assert api.get(path, headers=headers(CLIENT)).json() is None
    assert api.post(path, headers=headers(CLIENT), json={"puntuacion": 5}).status_code == 409
    assert action(api, booking, "aceptar").status_code == 200
    assert api.post(f"/api/v1/solicitudes/{booking['id']}/pago/simular",
                    headers=headers(CLIENT), json={}).status_code == 200
    for step in ("en-camino", "iniciar"):
        assert action(api, booking, step).status_code == 200
    code = action(api, booking, "codigo-confirmacion", CLIENT).json()["codigo"]
    assert action(api, booking, "completar", WORKER, {"codigo": code}).status_code == 200
    for user in (WORKER, OTHER_CLIENT):
        assert api.post(path, headers=headers(user), json={"puntuacion": 5}).status_code == 403
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: api.post(path, headers=headers(CLIENT), json={
            "puntuacion": 4, "comentario": "Buen trabajo",
        }), range(2)))
    assert sorted(result.status_code for result in results) == [200, 201]
    assert results[0].json()["id"] == results[1].json()["id"]
    assert api.post(path, headers=headers(CLIENT), json={"puntuacion": 1}).status_code == 409
    assert api.get(path, headers=headers(OTHER_CLIENT)).status_code == 404
    public = api.get(f"/api/v1/trabajadores/{WORKER}/calificaciones")
    assert public.status_code == 200
    assert public.json()["promedio"] == 4 and public.json()["cantidad"] == 1
    assert set(public.json()["items"][0]) == {
        "id", "puntuacion", "comentario", "servicio_nombre", "creado_en",
    }
    with httpx.Client(base_url=URL) as direct:
        assert direct.get("/calificaciones", headers=headers(OTHER_CLIENT)).json() == []
        assert direct.patch("/calificaciones", headers=headers(CLIENT),
                            json={"puntuacion": 1}).status_code == 403


@pytest.mark.parametrize("service,steps", [
    (HOME, ["en-camino", "iniciar"]), (SHOP, ["iniciar", "listo"]),
])
@pytest.mark.parametrize("cancelled", [False, True])
@pytest.mark.parametrize("provider_live_mode", [False, True])
def test_mp_checkout_reconciliation_real_database(
    integration, monkeypatch, service, steps, cancelled, provider_live_mode,
):
    api = integration
    monkeypatch.setenv("MERCADO_PAGO_ENABLED", "true")
    monkeypatch.setenv("MERCADO_PAGO_WEBHOOK_SECRET", "isolated-webhook-secret")
    monkeypatch.setenv("MERCADO_PAGO_PUBLIC_URL", "https://backend.example.test")
    start, _ = schedule(api, service)
    booking = create(api, start, service)
    assert action(api, booking, "aceptar").status_code == 200
    path = f"/api/v1/solicitudes/{booking['id']}/pago/mercadopago"

    class Provider:
        reference = None
        creates = 0
        status = "pending"

        async def test_seller(self):
            return "123"

        async def request(self, method, path, **kwargs):
            if method == "POST":
                assert path == "/checkout/preferences"
                self.creates += 1
                self.reference = kwargs["json"]["external_reference"]
                return {"id": "pref-isolated", "collector_id": 123,
                    "external_reference": self.reference,
                    "init_point": "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=test"}
            if path == "/v1/payments/search":
                return {"results": [{"id": 9001}], "paging": {"total": 1}}
            if path == "/checkout/preferences/pref-isolated":
                return {"id": "pref-isolated", "collector_id": 123,
                        "external_reference": self.reference,
                        "init_point": "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=test"}
            if path == "/users/789":
                return {"id": 789, "site_id": "MLC", "nickname": "TESTUSER789"}
            assert path == "/v1/payments/9001"
            return {"id": 9001, "external_reference": self.reference, "collector_id": 123,
                "transaction_amount": booking["precio_base"] * 115 // 100,
                "currency_id": "CLP", "live_mode": provider_live_mode, "status": self.status,
                "payer": {"id": 789, "email": "test_user_789@testuser.com"},
                "date_approved": (datetime.now(UTC).isoformat()
                                  if self.status == "approved" else None),
                "date_last_updated": datetime.now(UTC).isoformat()}

    class Store:
        async def request(self, method, path, **kwargs):
            return await api.integration_gateway.request(method, path,
                extra_headers={"Authorization": "Bearer " + token(ADMIN, "service_role")}, **kwargs)

    provider = Provider()
    app.dependency_overrides[get_mercadopago] = lambda: provider
    app.dependency_overrides[get_payment_store] = lambda: Store()
    try:
        with ThreadPoolExecutor(2) as pool:
            created = list(pool.map(lambda _: api.post(path, headers=headers(CLIENT), json={}),
                                    range(2)))
        assert any(result.status_code == 200 for result in created)
        assert all(result.status_code in (200, 409) for result in created)
        assert provider.creates == 1
        assert api.post(f"/api/v1/solicitudes/{booking['id']}/pago/simular",
                        headers=headers(CLIENT), json={}).status_code == 409
        pending = api.post(path + "/sincronizar", headers=headers(CLIENT), json={})
        assert pending.status_code == 200 and pending.json()["estado"] == "PENDIENTE"
        if cancelled:
            assert api.post(f"/api/v1/solicitudes/{booking['id']}/cancelar",
                            headers=headers(CLIENT),
                            json={"motivo": "Cambio de planes"}).status_code == 200
        provider.status = "approved"
        updated = api.post(path + "/sincronizar", headers=headers(CLIENT), json={})
        assert updated.status_code == 200, updated.text
        assert updated.json()["estado"] == ("REVISION" if cancelled else "APROBADO")
        digest = hmac.new(b"isolated-webhook-secret",
            b"id:9001;request-id:isolated-test;ts:1234567890;", hashlib.sha256).hexdigest()
        for _ in range(2):
            event = api.post("/api/v1/pagos/mercadopago/webhook?data.id=9001&type=payment",
                headers={"x-request-id": "isolated-test",
                         "x-signature": f"ts=1234567890,v1={digest}"}, json={})
            assert event.status_code == 200, event.text
        summary = api.get(f"/api/v1/solicitudes/{booking['id']}/pago",
                          headers=headers(CLIENT)).json()
        if cancelled:
            assert summary["pago"] is None
        else:
            assert summary["pago"]["proveedor"] == "MERCADO_PAGO_TEST"
            assert summary["pago"]["proveedor_pago_id"] == "9001"
            for step in steps:
                assert action(api, booking, step).status_code == 200
            code = action(api, booking, "codigo-confirmacion", CLIENT).json()["codigo"]
            assert action(api, booking, "completar", WORKER, {"codigo": code}).status_code == 200
            month = datetime.now(ZoneInfo("America/Santiago")).strftime("%Y-%m")
            earnings = api.get("/api/v1/trabajadores/me/ganancias?mes=" + month,
                               headers=headers(WORKER)).json()
            assert earnings["total_completado"] == booking["precio_base"]
    finally:
        app.dependency_overrides.pop(get_mercadopago, None)
        app.dependency_overrides.pop(get_payment_store, None)
