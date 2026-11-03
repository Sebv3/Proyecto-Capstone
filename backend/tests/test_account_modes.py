import json

import httpx
import pytest

from tests import test_bookings as booking_tests
from tests.test_bookings import CLIENT, HEADERS, WORKER

PATH = "/api/v1/cuenta"
STATUS = {
    "rol_activo": "CLIENTE", "puede_ser_cliente": True,
    "puede_ser_trabajador": True, "tiene_perfil_trabajador": True,
    "perfil_cliente_completo": True,
}


@pytest.fixture
def make_client():
    yield from booking_tests.make_client.__wrapped__()


def test_modes_require_a_session(make_client):
    client = make_client(lambda _: pytest.fail("Anonymous reached RPC"))
    assert client.get(PATH + "/modos").status_code == 401
    assert client.post(PATH + "/modo", json={"rol": "CLIENTE"}).status_code == 401


def test_read_modes_uses_only_session_identity(make_client):
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/consultar_modos_cuenta"
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert json.loads(request.content) == {}
        return httpx.Response(200, json=STATUS)
    assert make_client(handler).get(PATH + "/modos", headers=HEADERS).json() == STATUS


@pytest.mark.parametrize("user,role", [(CLIENT, "TRABAJADOR"), (WORKER, "CLIENTE")])
def test_switch_returns_current_account_and_explicit_target(make_client, user, role):
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/cambiar_modo_cuenta"
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert json.loads(request.content) == {"p_rol": role}
        return httpx.Response(200, json=[{**user, "rol": role}])
    response = make_client(handler, user).post(PATH + "/modo", headers=HEADERS, json={"rol": role})
    assert response.status_code == 200
    assert response.json()["id"] == user["id"] and response.json()["rol"] == role


@pytest.mark.parametrize("payload", [
    {"rol": "ADMIN"}, {"rol": "CLIENTE", "usuario_id": WORKER["id"]},
    {"rol": "TRABAJADOR", "aprobado": True}, {}, {"rol": None},
])
def test_invalid_or_forged_mode_changes_never_reach_database(make_client, payload):
    client = make_client(lambda _: pytest.fail("Forged body reached RPC"))
    assert client.post(PATH + "/modo", headers=HEADERS, json=payload).status_code == 422


@pytest.mark.parametrize("code,status", [("42501", 403), ("PGRST202", 503),
                                       ("22023", 422), ("unknown", 502)])
def test_switch_errors_hide_database_details(make_client, code, status):
    client = make_client(lambda _: httpx.Response(400, json={"code": code, "message": "secret"}))
    response = client.post(PATH + "/modo", headers=HEADERS, json={"rol": "TRABAJADOR"})
    assert response.status_code == status and "secret" not in response.text


@pytest.mark.parametrize("returned", [
    [], [{**WORKER}], [{**CLIENT}], [{**CLIENT, "activo": False}],
])
def test_unexpected_identity_role_or_inactive_result_is_rejected(make_client, returned):
    response = make_client(lambda _: httpx.Response(200, json=returned)).post(
        PATH + "/modo", headers=HEADERS, json={"rol": "TRABAJADOR"},
    )
    assert response.status_code == 502


def test_admin_cannot_turn_into_worker_or_client(make_client):
    client = make_client(lambda _: pytest.fail("Admin reached RPC"), {**CLIENT, "rol": "ADMIN"})
    assert client.get(PATH + "/modos", headers=HEADERS).status_code == 403
    assert client.post(PATH + "/modo", headers=HEADERS, json={"rol": "CLIENTE"}).status_code == 403


@pytest.mark.parametrize("user", [CLIENT, WORKER])
def test_deactivation_uses_session_identity_and_preserves_http_contract(make_client, user):
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/desactivar_cuenta_actual"
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert json.loads(request.content) == {}
        return httpx.Response(200, json=True)
    response = make_client(handler, user).delete(PATH, headers=HEADERS)
    assert response.status_code == 204 and response.content == b""


def test_deactivation_requires_session_and_rejects_admin(make_client):
    client = make_client(lambda _: pytest.fail("Anonymous reached RPC"))
    assert client.delete(PATH).status_code == 401
    admin = make_client(lambda _: pytest.fail("Admin reached RPC"), {**CLIENT, "rol": "ADMIN"})
    assert admin.delete(PATH, headers=HEADERS).status_code == 403


@pytest.mark.parametrize("value,status", [(False, 409), (None, 502), (1, 502), ({}, 502)])
def test_deactivation_requires_explicit_boolean_confirmation(make_client, value, status):
    client = make_client(lambda _: httpx.Response(200, json=value), WORKER)
    assert client.delete(PATH, headers=HEADERS).status_code == status


@pytest.mark.parametrize("code,status", [("PGRST202", 503), ("42501", 403), ("private", 502)])
def test_deactivation_errors_do_not_expose_database_details(make_client, code, status):
    client = make_client(lambda _: httpx.Response(400, json={"code": code, "message": "secret"}))
    result = client.delete(PATH, headers=HEADERS)
    assert result.status_code == status and "secret" not in result.text
