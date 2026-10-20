import json

import httpx
import pytest

from tests.test_bookings import CLIENT, HEADERS, WORKER
from tests.test_bookings import make_client as make_client

NOTIFICATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ROW = {
    "id": NOTIFICATION_ID, "tipo": "SOLICITUD",
    "referencia_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "categoria_id": None,
    "titulo": "Nueva solicitud", "mensaje": "Recibiste una solicitud.",
    "creado_en": "2026-10-11T12:00:00Z", "leida_en": None,
}


@pytest.mark.parametrize("user", [CLIENT, WORKER])
def test_notifications_scope_and_pagination(make_client, user):
    def handler(request):
        assert request.url.params["usuario_id"] == f"eq.{user['id']}"
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert request.url.params["limit"] == "20"
        assert request.url.params["offset"] == "20"
        assert request.url.params["order"] == "creado_en.desc,id.desc"
        return httpx.Response(200, json=[ROW])

    result = make_client(handler, user).get(
        "/api/v1/notificaciones?offset=20", headers=HEADERS,
    )
    assert result.status_code == 200
    assert result.json()[0]["leida_en"] is None


def test_unread_count_is_exact_and_private(make_client):
    def handler(request):
        assert request.url.params["usuario_id"] == f"eq.{CLIENT['id']}"
        assert request.url.params["leida_en"] == "is.null"
        assert request.headers["Prefer"] == "count=exact"
        return httpx.Response(
            200, headers={"Content-Range": "0-0/34"}, json=[{"id": NOTIFICATION_ID}],
        )

    result = make_client(handler).get("/api/v1/notificaciones/sin-leer", headers=HEADERS)
    assert result.status_code == 200
    assert result.json() == {"cantidad": 34}


@pytest.mark.parametrize("notification_id", [None, NOTIFICATION_ID])
def test_read_uses_authenticated_rpc_without_client_owned_identity(make_client, notification_id):
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/leer_notificaciones"
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert json.loads(request.content) == {"p_id": notification_id}
        return httpx.Response(200, json=1)

    path = f"{notification_id}/leer" if notification_id else "leer-todas"
    result = make_client(handler).post(f"/api/v1/notificaciones/{path}", headers=HEADERS)
    assert result.status_code == 200


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer test-token"}])
def test_inactive_or_anonymous_notifications_are_rejected(make_client, headers):
    def handler(request):
        pytest.fail("Unauthorized notification access must not reach notifications")

    result = make_client(handler, {**CLIENT, "activo": False}).get(
        "/api/v1/notificaciones", headers=headers,
    )
    assert result.status_code in (401, 403)


def test_missing_migration_returns_availability_message(make_client):
    result = make_client(lambda _: httpx.Response(404)).get(
        "/api/v1/notificaciones", headers=HEADERS,
    )
    assert result.status_code == 503


def test_invalid_count_does_not_show_a_false_badge(make_client):
    result = make_client(lambda _: httpx.Response(200, json=[])).get(
        "/api/v1/notificaciones/sin-leer", headers=HEADERS,
    )
    assert result.status_code == 502


@pytest.mark.parametrize("user", [CLIENT, WORKER])
@pytest.mark.parametrize("only_read", [None, True, False])
def test_clear_uses_fixed_server_rule_even_for_old_clients(make_client, user, only_read):
    def handler(request):
        assert request.method == "POST"
        assert request.url.path == "/rest/v1/rpc/limpiar_notificaciones_finalizadas"
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert json.loads(request.content) == {}
        return httpx.Response(200, json=42)

    result = make_client(handler, user).delete(
        "/api/v1/notificaciones", headers=HEADERS,
        params={} if only_read is None else {"solo_leidas": str(only_read).lower()},
    )
    assert result.status_code == 200
    assert result.json() == {"eliminadas": 42}


@pytest.mark.parametrize("headers", [{}, HEADERS])
def test_clear_rejects_anonymous_or_inactive_users(make_client, headers):
    result = make_client(lambda request: pytest.fail("No deletion allowed"), {
        **CLIENT, "activo": False,
    }).delete("/api/v1/notificaciones", headers=headers)
    assert result.status_code in (401, 403)


@pytest.mark.parametrize("value", [-1, True, "5", None, {}])
def test_clear_rejects_invalid_confirmation(make_client, value):
    result = make_client(lambda request: httpx.Response(200, json=value)).delete(
        "/api/v1/notificaciones", headers=HEADERS,
    )
    assert result.status_code == 502


def test_clear_missing_migration_is_explained(make_client):
    result = make_client(lambda request: httpx.Response(404)).delete(
        "/api/v1/notificaciones", headers=HEADERS,
    )
    assert result.status_code == 503
