import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi import HTTPException

from app.main import app
from app.services.mercadopago import (
    MercadoPago,
    checkout_url,
    get_mercadopago,
    get_payment_store,
    validate_signature,
)
from app.services.supabase_auth import SupabaseAuthGateway
from tests import test_bookings as booking_tests
from tests.test_bookings import BOOKING, CLIENT, HEADERS, WORKER

PATH = f"/api/v1/solicitudes/{BOOKING['id']}/pago/mercadopago"
WEBHOOK = "/api/v1/pagos/mercadopago/webhook"
CHECKOUT_ID = "88888888-8888-4888-8888-888888888888"
CHECKOUT = {
    "id": CHECKOUT_ID,
    "solicitud_id": BOOKING["id"],
    "cliente_id": CLIENT["id"],
    "trabajador_id": WORKER["id"],
    "servicio_nombre": BOOKING["servicio_nombre"],
    "tarifa_base": 25000,
    "comision": 3750,
    "monto_total": 28750,
    "estado": "CREANDO",
    "checkout_url": None,
    "preferencia_id": None,
    "creado_en": "2026-10-01T12:00:00Z",
    "expira_en": BOOKING["inicio_en"],
}
PREFERENCE = {
    "id": "pref-1",
    "collector_id": 123,
    "external_reference": CHECKOUT_ID,
    "init_point": "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-1",
}
READY = {
    **CHECKOUT,
    "checkout_url": PREFERENCE["init_point"],
    "preferencia_id": "pref-1",
    "collector_id": "123",
    "estado": "LISTO",
}
PAYMENT = {
    "id": 456,
    "external_reference": CHECKOUT_ID,
    "collector_id": 123,
    "transaction_amount": 28750,
    "currency_id": "CLP",
    "live_mode": False,
    "status": "approved",
    "date_approved": "2026-10-17T12:00:00Z",
    "date_last_updated": "2026-10-17T12:01:00Z",
}


def signed(identifier="456"):
    manifest = f"id:{identifier};request-id:request-123;ts:1234567890;"
    digest = hmac.new(b"test-webhook-secret", manifest.encode(), hashlib.sha256).hexdigest()
    return {"x-request-id": "request-123", "x-signature": f"ts=1234567890,v1={digest}"}


@pytest.fixture
def make_mp_client(monkeypatch):
    monkeypatch.setenv("MERCADO_PAGO_ENABLED", "true")
    monkeypatch.setenv("MERCADO_PAGO_WEBHOOK_SECRET", "test-webhook-secret")
    monkeypatch.setenv("MERCADO_PAGO_PUBLIC_URL", "https://backend.example.test")
    factory = booking_tests.make_client.__wrapped__()
    make_client = next(factory)
    clients = []

    def create(handler, user=CLIENT, seller=None):
        def dispatch(request):
            if request.url.path == "/users/me":
                assert request.headers["Authorization"] == "Bearer private-test-token"
                return httpx.Response(
                    200,
                    json=seller
                    or {
                        "id": 123,
                        "site_id": "MLC",
                        "tags": ["test_user"],
                    },
                )
            return handler(request)

        transport = httpx.AsyncClient(transport=httpx.MockTransport(dispatch))
        clients.append(transport)
        app.dependency_overrides[get_mercadopago] = lambda: MercadoPago(
            transport,
            "private-test-token",
        )
        app.dependency_overrides[get_payment_store] = lambda: SupabaseAuthGateway(
            transport,
            "https://store.example.test",
            "server-only-key",
        )
        return make_client(handler, user)

    yield create
    app.dependency_overrides.pop(get_mercadopago, None)
    app.dependency_overrides.pop(get_payment_store, None)
    for client in clients:
        asyncio.run(client.aclose())
    try:
        next(factory)
    except StopIteration:
        pass


def test_checkout_uses_server_amount_reference_and_public_callback(make_mp_client):
    calls = []

    def handler(request):
        calls.append(request.url.path)
        payload = json.loads(request.content)
        if request.url.path.endswith("iniciar_checkout_mercadopago"):
            assert payload == {"p_solicitud_id": BOOKING["id"]}
            assert request.headers["Authorization"] == HEADERS["Authorization"]
            return httpx.Response(200, json={"creado": True, "checkout": CHECKOUT})
        if request.url.path == "/checkout/preferences":
            assert payload["items"][0]["unit_price"] == 28750
            assert payload["external_reference"] == CHECKOUT_ID
            assert payload["notification_url"] == (
                "https://backend.example.test/api/v1/pagos/mercadopago/webhook?source_news=webhooks"
            )
            assert "payer" not in payload and "marketplace_fee" not in payload
            assert payload["expires"] is True
            assert datetime.fromisoformat(payload["expiration_date_from"]) == (
                datetime.fromisoformat(CHECKOUT["creado_en"].replace("Z", "+00:00"))
                - timedelta(minutes=5)
            )
            assert payload["expiration_date_to"] == CHECKOUT["expira_en"]
            return httpx.Response(201, json=PREFERENCE)
        assert request.url.path.endswith("guardar_preferencia_mercadopago")
        assert request.headers["apikey"] == "server-only-key"
        assert "Authorization" not in request.headers
        return httpx.Response(200, json=READY)

    response = make_mp_client(handler).post(PATH, headers=HEADERS, json={})
    assert response.status_code == 200, response.text
    assert response.json()["checkout_url"] == PREFERENCE["init_point"]
    assert "cliente_id" not in response.json()
    assert calls.count("/checkout/preferences") == 1


def test_existing_checkout_never_creates_another_preference(make_mp_client):
    def handler(request):
        if request.url.path.endswith("iniciar_checkout_mercadopago"):
            return httpx.Response(200, json={"creado": False, "checkout": READY})
        assert request.method == "GET" and request.url.path == "/checkout/preferences/pref-1"
        return httpx.Response(200, json=PREFERENCE)

    assert make_mp_client(handler).post(PATH, headers=HEADERS, json={}).status_code == 200


def test_existing_preference_start_is_repaired_without_changing_amount_or_link(make_mp_client):
    updates = []

    def handler(request):
        if request.url.path.endswith("iniciar_checkout_mercadopago"):
            return httpx.Response(200, json={"creado": False, "checkout": READY})
        assert request.url.path == "/checkout/preferences/pref-1"
        if request.method == "GET":
            return httpx.Response(
                200, json={**PREFERENCE, "expiration_date_from": "2026-10-01T12:03:00+00:00"}
            )
        assert request.method == "PUT"
        updates.append(json.loads(request.content))
        return httpx.Response(200, json=PREFERENCE)

    result = make_mp_client(handler).post(PATH, headers=HEADERS, json={})
    assert result.status_code == 200 and result.json()["checkout_url"] == READY["checkout_url"]
    assert updates == [
        {
            "expires": True,
            "expiration_date_from": "2026-10-01T11:55:00+00:00",
            "expiration_date_to": CHECKOUT["expira_en"],
        }
    ]


def test_correct_existing_window_needs_no_update(make_mp_client):
    def handler(request):
        if request.url.path.endswith("iniciar_checkout_mercadopago"):
            return httpx.Response(200, json={"creado": False, "checkout": READY})
        assert request.method == "GET"
        return httpx.Response(
            200, json={**PREFERENCE, "expiration_date_from": "2026-10-01T11:55:00+00:00"}
        )

    assert make_mp_client(handler).post(PATH, headers=HEADERS, json={}).status_code == 200


def test_lost_preference_response_is_recovered_by_reference_without_another_post(make_mp_client):
    def handler(request):
        if request.url.path.endswith("iniciar_checkout_mercadopago"):
            return httpx.Response(200, json={"creado": False, "checkout": CHECKOUT})
        if request.url.path == "/checkout/preferences/search":
            assert request.url.params["external_reference"] == CHECKOUT_ID
            return httpx.Response(200, json={"elements": [{"id": "pref-1"}]})
        if request.url.path == "/checkout/preferences/pref-1":
            assert request.method == "GET"
            return httpx.Response(200, json=PREFERENCE)
        assert request.url.path.endswith("guardar_preferencia_mercadopago")
        return httpx.Response(200, json=READY)

    assert make_mp_client(handler).post(PATH, headers=HEADERS, json={}).status_code == 200


def test_in_progress_creation_and_uncertain_search_do_not_duplicate(make_mp_client):
    for recent in (True, False):

        def handler(request, recent=recent):
            if request.url.path.endswith("iniciar_checkout_mercadopago"):
                return httpx.Response(
                    200,
                    json={
                        "creado": False,
                        "checkout": {
                            **CHECKOUT,
                            "creado_en": datetime.now(UTC).isoformat()
                            if recent
                            else CHECKOUT["creado_en"],
                        },
                    },
                )
            assert request.method == "GET" and request.url.path.endswith("/search")
            return httpx.Response(200, json={"elements": []})

        assert make_mp_client(handler).post(PATH, headers=HEADERS, json={}).status_code == 409


@pytest.mark.parametrize(
    "seller",
    [
        {"id": 123, "site_id": "MLC", "tags": []},
        {"id": 123, "site_id": "MLA", "tags": ["test_user"]},
    ],
)
def test_real_or_non_chilean_seller_cannot_create_checkout(make_mp_client, seller):
    response = make_mp_client(
        lambda _: pytest.fail("Unsafe seller reached checkout"), seller=seller
    ).post(PATH, headers=HEADERS, json={})
    assert response.status_code == 503


@pytest.mark.parametrize("field", ["monto_total", "cliente_id", "external_reference"])
def test_client_cannot_send_payment_amount_or_ownership(make_mp_client, field):
    result = make_mp_client(lambda _: pytest.fail("Forged input reached gateway")).post(
        PATH,
        headers=HEADERS,
        json={field: 1},
    )
    assert result.status_code == 422


def test_worker_cannot_create_payment(make_mp_client):
    assert (
        make_mp_client(lambda _: pytest.fail("Worker reached checkout"), WORKER)
        .post(
            PATH,
            headers=HEADERS,
            json={},
        )
        .status_code
        == 403
    )


def test_signed_webhook_reads_authoritative_payment_and_uses_privileged_rpc(make_mp_client):
    def handler(request):
        if request.url.path == "/v1/payments/456":
            assert request.method == "GET"
            return httpx.Response(200, json=PAYMENT)
        assert request.url.path.endswith("procesar_pago_mercadopago")
        assert request.headers["apikey"] == "server-only-key"
        body = json.loads(request.content)
        assert body["p_monto"] == "28750" and body["p_checkout_id"] == CHECKOUT_ID
        assert body["p_estado"] == "approved" and body["p_live_mode"] is False
        return httpx.Response(200, json={"estado": "APROBADO"})

    response = make_mp_client(handler).post(
        WEBHOOK + "?data.id=456&type=payment",
        headers=signed(),
        json={"type": "payment", "data": {"id": "456"}, "status": "rejected"},
    )
    assert response.status_code == 200 and response.json()["estado"] == "APROBADO"


@pytest.mark.parametrize(
    "headers,query,body,status",
    [
        ({}, "?data.id=456&type=payment", {}, 401),
        (signed(), "?data.id=457&type=payment", {}, 401),
        (signed(), "?data.id=456&data.id=457&type=payment", {}, 401),
        (signed(), "?data.id=456&type=payment", {"data": {"id": 999}}, 400),
    ],
)
def test_bad_webhooks_never_reach_gateways(make_mp_client, headers, query, body, status):
    response = make_mp_client(lambda _: pytest.fail("Bad webhook reached gateway")).post(
        WEBHOOK + query,
        headers=headers,
        json=body,
    )
    assert response.status_code == status


@pytest.mark.parametrize(
    "changes",
    [
        {"live_mode": True},
        {"collector_id": 999},
        {"currency_id": "USD"},
        {"external_reference": "forged"},
        {"date_last_updated": "invalid"},
    ],
)
def test_live_or_inconsistent_provider_payments_never_mark_paid(make_mp_client, changes):
    def handler(request):
        assert request.url.path == "/v1/payments/456"
        return httpx.Response(200, json={**PAYMENT, **changes})

    response = make_mp_client(handler).post(
        WEBHOOK + "?data.id=456&type=payment", headers=signed(), json={}
    )
    assert response.status_code == 422


def test_provider_simulator_fictitious_payment_is_ignored(make_mp_client):
    response = make_mp_client(lambda _: httpx.Response(404, json={})).post(
        WEBHOOK + "?data.id=456&type=payment",
        headers=signed(),
        json={},
    )
    assert response.status_code == 200 and response.json()["ignorado"] is True


@pytest.mark.parametrize(
    "account",
    [
        {"id": 789, "site_id": "MLC", "nickname": "TESTUSER789"},
        {"id": 789, "site_id": "MLC", "nickname": "@789", "user_type": "guest"},
    ],
)
def test_test_accounts_can_report_live_mode_true_without_becoming_real_payments(
    make_mp_client, account
):
    writes = []

    def handler(request):
        if request.url.path == "/v1/payments/456":
            return httpx.Response(
                200,
                json={
                    **PAYMENT,
                    "live_mode": True,
                    "payer": {"id": 789, "email": "test_user_789@testuser.com"},
                },
            )
        if request.url.path == "/users/789":
            return httpx.Response(200, json=account)
        assert request.url.path.endswith("procesar_pago_mercadopago")
        writes.append(json.loads(request.content))
        return httpx.Response(200, json={"estado": "APROBADO"})

    result = make_mp_client(handler).post(
        WEBHOOK + "?data.id=456&type=payment",
        headers=signed(),
        json={"live_mode": True, "type": "payment"},
    )
    assert result.status_code == 200 and result.json()["estado"] == "APROBADO"
    assert len(writes) == 1 and writes[0]["p_live_mode"] is False


@pytest.mark.parametrize(
    "account",
    [
        {"id": 789, "site_id": "MLC", "nickname": "REALUSER789"},
        {"id": 789, "site_id": "MLA", "nickname": "TESTUSER789"},
        {"id": 999, "site_id": "MLC", "nickname": "TESTUSER789"},
        {"id": 789, "site_id": "MLC", "nickname": "@789", "user_type": "normal"},
        {"id": 789, "site_id": "MLA", "nickname": "@789", "user_type": "guest"},
        {"id": 999, "site_id": "MLC", "nickname": "@789", "user_type": "guest"},
        {"id": 789, "site_id": "MLC", "nickname": "REALUSER789", "user_type": "guest"},
    ],
)
def test_real_or_mismatched_buyer_cannot_use_test_account_compatibility(make_mp_client, account):
    def handler(request):
        if request.url.path == "/v1/payments/456":
            return httpx.Response(
                200,
                json={
                    **PAYMENT,
                    "live_mode": True,
                    "payer": {"id": 789, "email": "test_user_789@testuser.com"},
                },
            )
        assert request.url.path == "/users/789"
        return httpx.Response(200, json=account)

    result = make_mp_client(handler).post(
        WEBHOOK + "?data.id=456&type=payment", headers=signed(), json={}
    )
    assert result.status_code == 422


def test_personal_email_cannot_be_treated_as_a_test_buyer(make_mp_client):
    def handler(request):
        assert request.url.path == "/v1/payments/456"
        return httpx.Response(
            200,
            json={
                **PAYMENT,
                "live_mode": True,
                "payer": {"id": 789, "email": "personal@example.test"},
            },
        )

    result = make_mp_client(handler).post(
        WEBHOOK + "?data.id=456&type=payment", headers=signed(), json={}
    )
    assert result.status_code == 422


def test_database_failure_returns_failure_for_provider_retry(make_mp_client):
    def handler(request):
        if request.url.path == "/v1/payments/456":
            return httpx.Response(200, json=PAYMENT)
        return httpx.Response(404, json={"code": "PGRST202", "message": "private details"})

    response = make_mp_client(handler).post(
        WEBHOOK + "?data.id=456&type=payment", headers=signed(), json={}
    )
    assert response.status_code == 503 and "private" not in response.text


def test_sync_checks_owner_and_recovers_missed_webhook(make_mp_client):
    def handler(request):
        if request.url.path == "/rest/v1/solicitudes":
            return httpx.Response(200, json=[{**BOOKING, "estado": "ACEPTADA"}])
        if request.url.path == "/rest/v1/checkout_mercadopago":
            return httpx.Response(200, json=[READY])
        if request.url.path == "/v1/payments/search":
            assert request.url.params["external_reference"] == CHECKOUT_ID
            return httpx.Response(200, json={"results": [{"id": 456}], "paging": {"total": 1}})
        if request.url.path == "/v1/payments/456":
            return httpx.Response(200, json=PAYMENT)
        assert request.url.path.endswith("procesar_pago_mercadopago")
        return httpx.Response(200, json={"estado": "APROBADO"})

    assert (
        make_mp_client(handler).post(PATH + "/sincronizar", headers=HEADERS, json={}).status_code
        == 200
    )


def test_return_query_does_not_change_a_payment(make_mp_client):
    response = make_mp_client(lambda _: pytest.fail("Return page must not write state")).get(
        "/api/v1/pagos/mercadopago/retorno?status=approved&payment_id=456",
    )
    assert response.status_code == 200 and "Vuelve a ServiMatch" in response.text


@pytest.mark.parametrize(
    "url",
    [
        "http://www.mercadopago.cl/checkout",
        "https://evil.test/",
        "https://www.mercadopago.cl.evil.test/",
        "https://user@www.mercadopago.cl/",
    ],
)
def test_checkout_only_redirects_to_official_https_origins(url):
    with pytest.raises(HTTPException):
        checkout_url(url)


def test_signature_rejects_duplicated_headers_and_accepts_provider_retry(monkeypatch):
    monkeypatch.setenv("MERCADO_PAGO_WEBHOOK_SECRET", "test-webhook-secret")
    signature = signed()["x-signature"]
    validate_signature("456", "request-123", signature)
    with pytest.raises(HTTPException):
        validate_signature("456", "request-123", signature + ",ts=1234567890")
