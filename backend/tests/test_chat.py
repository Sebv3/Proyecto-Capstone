import json

import httpx
import pytest

from tests import test_bookings as booking_tests
from tests.test_bookings import BOOKING, CLIENT, HEADERS, WORKER


@pytest.fixture
def make_client():
    yield from booking_tests.make_client.__wrapped__()


MESSAGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
CONVERSATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
MESSAGE = {"id": MESSAGE_ID, "conversacion_id": CONVERSATION_ID, "autor_id": CLIENT["id"],
           "contenido": "Hola", "creado_en": "2026-10-13T12:00:00Z", "editado_en": None}
PAGE = {"solicitud_id": BOOKING["id"], "conversacion_id": CONVERSATION_ID,
        "contraparte_nombre": "Trabajador", "servicio_nombre": "Servicio", "items": [MESSAGE],
        "limit": 50, "offset": 0, "has_more": False}
PATH = f"/api/v1/solicitudes/{BOOKING['id']}/chat"


@pytest.mark.parametrize("user", [CLIENT, WORKER])
def test_open_chat_authenticates_and_uses_server_owned_participants(make_client, user):
    def handler(request):
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert json.loads(request.content) == {"p_solicitud_id": BOOKING["id"], "p_accion": "ABRIR"}
        return httpx.Response(200, json=PAGE)

    assert make_client(handler, user).post(PATH, headers=HEADERS).status_code == 200


def test_listing_is_paginated_without_opening_conversation(make_client):
    def handler(request):
        body = json.loads(request.content)
        assert body["p_accion"] == "LEER"
        assert (body["p_limit"], body["p_offset"]) == (20, 40)
        return httpx.Response(200, json=PAGE)

    result = make_client(handler).get(PATH + "?limit=20&offset=40", headers=HEADERS)
    assert result.status_code == 200


@pytest.mark.parametrize("method,action", [("post", "ENVIAR"), ("patch", "EDITAR")])
def test_message_writes_strip_whitespace_and_never_choose_author(make_client, method, action):
    def handler(request):
        body = json.loads(request.content)
        assert body["p_accion"] == action
        assert body["p_contenido"] == "Hola"
        assert body["p_mensaje_id"] == MESSAGE_ID
        assert "autor_id" not in body
        return httpx.Response(200, json=MESSAGE)

    payload = {"contenido": "  Hola  "}
    path = PATH + "/mensajes"
    if method == "post":
        payload["id"] = MESSAGE_ID
    else:
        path += "/" + MESSAGE_ID
    result = getattr(make_client(handler), method)(path, headers=HEADERS, json=payload)
    assert result.status_code == 200


@pytest.mark.parametrize("payload", [
    {"id": MESSAGE_ID, "contenido": " "}, {"id": MESSAGE_ID, "contenido": "x" * 2001},
    {"id": MESSAGE_ID, "contenido": "Hola", "autor_id": WORKER["id"]},
])
def test_invalid_or_forged_messages_never_reach_rpc(make_client, payload):
    assert make_client(lambda request: pytest.fail("Invalid message reached RPC")).post(
        PATH + "/mensajes", headers=HEADERS, json=payload,
    ).status_code == 422


def test_delete_only_sends_message_and_booking_ids(make_client):
    def handler(request):
        assert json.loads(request.content) == {"p_solicitud_id": BOOKING["id"],
                                               "p_accion": "ELIMINAR", "p_mensaje_id": MESSAGE_ID}
        return httpx.Response(200, json={"ok": True})

    assert make_client(handler).delete(PATH + "/mensajes/" + MESSAGE_ID,
                                       headers=HEADERS).status_code == 200


@pytest.mark.parametrize("code,status", [
    ("PT410", 410), ("P0002", 404), ("42501", 403), ("PGRST202", 503), ("PT409", 409),
])
def test_chat_errors_hide_upstream_private_details(make_client, code, status):
    result = make_client(lambda request: httpx.Response(
        400, json={"code": code, "message": "private information"},
    )).get(PATH, headers=HEADERS)
    assert result.status_code == status
    assert "private" not in result.text


def test_chat_requires_session(make_client):
    result = make_client(lambda request: pytest.fail("Anonymous reached RPC")).get(PATH)
    assert result.status_code == 401
