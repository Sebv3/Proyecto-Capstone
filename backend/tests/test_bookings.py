import asyncio
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway
from tests.test_worker_services import SERVICE_ID, WORKER, WORKER_ID

CLIENT_ID = "22222222-3333-4444-8555-666666666666"
BOOKING_ID = "dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb"
CLIENT = {**WORKER, "id": CLIENT_ID, "rol": "CLIENTE"}
HEADERS = {"Authorization": "Bearer test-token"}
START = (datetime.now(UTC) + timedelta(days=2)).isoformat()
BOOKING = {
    "id": BOOKING_ID, "servicio_id": SERVICE_ID, "cliente_id": CLIENT_ID,
    "trabajador_id": WORKER_ID, "servicio_nombre": "Reparacion de puerta",
    "precio_base": 25000, "duracion_estimada_minutos": 60, "modalidad": "DOMICILIO",
    "inicio_en": START, "ubicacion_servicio": "Direccion del cliente 123",
    "estado": "PENDIENTE", "motivo_cancelacion": None,
    "creado_en": "2026-10-06T12:00:00Z", "actualizado_en": "2026-10-06T12:00:00Z",
}


@pytest.fixture
def make_client():
    clients = []

    def create(handler, user=CLIENT):
        def transport(request):
            if request.url.path == "/auth/v1/user":
                assert request.headers["Authorization"] == HEADERS["Authorization"]
                return httpx.Response(200, json={"id": user["id"]})
            if request.url.path == "/rest/v1/usuarios":
                return httpx.Response(200, json=[user])
            return handler(request)

        client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
        clients.append(client)
        gateway = SupabaseAuthGateway(client, "https://test.supabase.co", "test-key")
        app.dependency_overrides[get_auth_gateway] = lambda: gateway
        return TestClient(app)

    yield create
    app.dependency_overrides.pop(get_auth_gateway, None)
    for client in clients:
        asyncio.run(client.aclose())


def test_create_uses_authenticated_rpc_and_server_owned_snapshots(make_client):
    def handler(request):
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert request.url.path == "/rest/v1/rpc/crear_solicitud"
        assert json.loads(request.content) == {
            "p_servicio_id": SERVICE_ID, "p_inicio_en": START,
            "p_direccion_servicio": "Direccion del cliente 123",
        }
        return httpx.Response(200, json=[BOOKING])

    response = make_client(handler).post("/api/v1/solicitudes", headers=HEADERS, json={
        "servicio_id": SERVICE_ID, "inicio_en": START,
        "direccion_servicio": "Direccion del cliente 123",
    })
    assert response.status_code == 201
    assert response.json()["precio_base"] == 25000


@pytest.mark.parametrize("user,field", [(CLIENT, "cliente_id"), (WORKER, "trabajador_id")])
def test_listing_is_scoped_and_paginated(make_client, user, field):
    def handler(request):
        assert request.url.params[field] == f"eq.{user['id']}"
        assert request.url.params["estado"] == "eq.PENDIENTE"
        assert request.url.params["limit"] == "10"
        assert request.url.params["offset"] == "20"
        return httpx.Response(200, json=[BOOKING])

    response = make_client(handler, user).get(
        "/api/v1/solicitudes?estado=PENDIENTE&limit=10&offset=20", headers=HEADERS
    )
    assert response.status_code == 200


def test_agenda_filters_confirmed_reservations_in_utc_day_range(make_client):
    def handler(request):
        assert request.url.params["trabajador_id"] == f"eq.{WORKER_ID}"
        assert request.url.params["and"] == (
            "(estado.in.(ACEPTADA,PAGADA,EN_CAMINO,EN_CURSO,LISTO,COMPLETADA),"
            "inicio_en.gte.2030-01-10T03:00:00+00:00,"
            "inicio_en.lt.2030-01-11T03:00:00+00:00)"
        )
        return httpx.Response(200, json=[{**BOOKING, "estado": "ACEPTADA"}])

    result = make_client(handler, WORKER).get("/api/v1/solicitudes", headers=HEADERS, params={
        "agenda": "true", "desde": "2030-01-10T00:00:00-03:00",
        "hasta": "2030-01-11T00:00:00-03:00",
    })
    assert result.status_code == 200


@pytest.mark.parametrize("params,status", [
    ({"agenda": "true"}, 403),
    ({"desde": "2030-01-10T00:00:00"}, 422),
    ({"desde": "2030-01-10T00:00:00Z", "hasta": "2030-01-10T00:00:00Z"}, 422),
    ({"desde": "2030-01-11T00:00:00Z", "hasta": "2030-01-10T00:00:00Z"}, 422),
])
def test_agenda_rejects_client_and_invalid_date_ranges(make_client, params, status):
    def handler(request):
        pytest.fail("An invalid range or unauthorized agenda must not reach storage")

    result = make_client(handler).get("/api/v1/solicitudes", headers=HEADERS, params=params)
    assert result.status_code == status


@pytest.mark.parametrize("action,target,current,modality", [
    ("aceptar", "ACEPTADA", "PENDIENTE", "DOMICILIO"),
    ("rechazar", "RECHAZADA", "PENDIENTE", "TALLER"),
    ("en-camino", "EN_CAMINO", "PAGADA", "DOMICILIO"),
    ("iniciar", "EN_CURSO", "EN_CAMINO", "DOMICILIO"),
    ("iniciar", "EN_CURSO", "PAGADA", "TALLER"),
    ("listo", "LISTO", "EN_CURSO", "TALLER"),
])
def test_worker_actions_use_expected_state_for_atomic_update(
    make_client, action, target, current, modality
):
    booking = {**BOOKING, "estado": current, "modalidad": modality}

    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[booking])
        assert request.url.path == "/rest/v1/rpc/cambiar_estado_solicitud"
        assert json.loads(request.content) == {
            "p_solicitud_id": BOOKING_ID, "p_estado_esperado": current,
            "p_destino": target, "p_motivo": None,
        }
        return httpx.Response(200, json=[{**booking, "estado": target}])

    response = make_client(handler, WORKER).post(
        f"/api/v1/solicitudes/{BOOKING_ID}/{action}", headers=HEADERS
    )
    assert response.status_code == 200
    assert response.json()["estado"] == target


@pytest.mark.parametrize("user", [CLIENT, WORKER])
def test_participants_cancel_with_normalized_reason(make_client, user):
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[BOOKING])
        assert json.loads(request.content)["p_motivo"] == "Cambio de planes"
        return httpx.Response(200, json=[{
            **BOOKING, "estado": "CANCELADA", "motivo_cancelacion": "Cambio de planes",
        }])

    response = make_client(handler, user).post(
        f"/api/v1/solicitudes/{BOOKING_ID}/cancelar", headers=HEADERS,
        json={"motivo": "  Cambio de planes  "},
    )
    assert response.status_code == 200


@pytest.mark.parametrize("action", ["aceptar", "rechazar", "en-camino", "iniciar", "listo"])
def test_client_cannot_perform_worker_operations(make_client, action):
    def handler(request):
        pytest.fail("El cliente no debe consultar ni modificar la solicitud como trabajador")

    response = make_client(handler).post(
        f"/api/v1/solicitudes/{BOOKING_ID}/{action}", headers=HEADERS
    )
    assert response.status_code == 403


@pytest.mark.parametrize("action", ["aceptar", "iniciar", "cancelar"])
def test_foreign_worker_cannot_mutate_booking(make_client, action):
    other = {**WORKER, "id": "99999999-9999-4999-8999-999999999999"}
    response = make_client(lambda request: httpx.Response(200, json=[BOOKING]), other).post(
        f"/api/v1/solicitudes/{BOOKING_ID}/{action}", headers=HEADERS,
        json={"motivo": "Cambio de planes"} if action == "cancelar" else None,
    )
    assert response.status_code == 404


def test_start_does_not_bypass_payment(make_client):
    def handler(request):
        assert request.method == "GET"
        return httpx.Response(200, json=[{**BOOKING, "estado": "ACEPTADA"}])

    response = make_client(handler, WORKER).post(
        f"/api/v1/solicitudes/{BOOKING_ID}/iniciar", headers=HEADERS
    )
    assert response.status_code == 409


def test_worker_gets_random_confirmation_code_without_exposing_hash(make_client):
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[{**BOOKING, "estado": "EN_CURSO"}])
        code = json.loads(request.content)["p_codigo"]
        assert len(code) == 6 and code.isdigit()
        return httpx.Response(200, json=START)

    response = make_client(handler, WORKER).post(
        f"/api/v1/solicitudes/{BOOKING_ID}/codigo-confirmacion", headers=HEADERS
    )
    assert response.status_code == 200
    assert set(response.json()) == {"codigo", "expira_en"}


@pytest.mark.parametrize("payload,status", [
    ({**BOOKING, "estado": "COMPLETADA"}, 200),
    ({"error": "codigo_invalido"}, 409), ({"error": "codigo_no_disponible"}, 409),
])
def test_client_completion_validates_private_code(make_client, payload, status):
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[{**BOOKING, "estado": "EN_CURSO"}])
        assert request.url.path == "/rest/v1/rpc/completar_solicitud"
        assert json.loads(request.content) == {"p_solicitud_id": BOOKING_ID, "p_codigo": "123456"}
        return httpx.Response(200, json=payload)

    response = make_client(handler).post(
        f"/api/v1/solicitudes/{BOOKING_ID}/completar", headers=HEADERS, json={"codigo": "123456"}
    )
    assert response.status_code == status


@pytest.mark.parametrize("code,status", [
    ("P0002", 404), ("42501", 403), ("40001", 409), ("22023", 422), ("PGRST202", 503),
])
def test_database_errors_are_controlled(make_client, code, status):
    response = make_client(
        lambda request: httpx.Response(400, json={"code": code, "message": "private-detail"})
    ).post("/api/v1/solicitudes", headers=HEADERS,
           json={"servicio_id": SERVICE_ID, "inicio_en": START})
    assert response.status_code == status
    assert "private-detail" not in response.text


@pytest.mark.parametrize("path", ["/solicitudes", f"/solicitudes/{BOOKING_ID}"])
def test_read_requires_authentication(make_client, path):
    def handler(request):
        pytest.fail("No debe consultar Supabase sin sesion")

    assert make_client(handler).get(f"/api/v1{path}").status_code == 401


@pytest.mark.parametrize("extra", [{"estado": "PAGADA"}, {"cliente_id": WORKER_ID}])
def test_create_rejects_forged_fields(make_client, extra):
    response = make_client(lambda request: pytest.fail("No debe crear datos falsificados")).post(
        "/api/v1/solicitudes", headers=HEADERS,
        json={"servicio_id": SERVICE_ID, "inicio_en": START, **extra},
    )
    assert response.status_code == 422


def test_public_availability_does_not_send_auth_or_private_client_data(make_client):
    def handler(request):
        assert "Authorization" not in request.headers
        assert request.url.path == "/rest/v1/rpc/consultar_disponibilidad"
        assert json.loads(request.content) == {"p_servicio_id": SERVICE_ID}
        return httpx.Response(200, json=[])

    response = make_client(handler).get(f"/api/v1/servicios/{SERVICE_ID}/disponibilidad")
    assert response.status_code == 200
    assert response.json() == []


def test_worker_adds_and_removes_availability_with_authenticated_rpc(make_client):
    end = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    block = {"id": BOOKING_ID, "servicio_id": SERVICE_ID, "inicio_en": START, "fin_en": end}

    def handler(request):
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert request.url.path == "/rest/v1/rpc/gestionar_disponibilidad"
        body = json.loads(request.content)
        assert body["p_servicio_id"] == SERVICE_ID
        if body.get("p_bloque_id") is None:
            assert body["p_inicio_en"] == START and body["p_fin_en"] == end
        else:
            assert body["p_bloque_id"] == BOOKING_ID
        return httpx.Response(200, json=[block])

    client = make_client(handler, WORKER)
    path = f"/api/v1/trabajador/servicios/{SERVICE_ID}/disponibilidad"
    assert client.post(path, headers=HEADERS,
                       json={"inicio_en": START, "fin_en": end}).status_code == 201
    assert client.delete(f"{path}/{BOOKING_ID}", headers=HEADERS).status_code == 200


@pytest.mark.parametrize("payload", [{}, {"codigo": "123"}, {"codigo": "abcdef"}])
def test_completion_rejects_invalid_code_payload(make_client, payload):
    client = make_client(lambda request: pytest.fail("No debe validar un codigo mal formado"))
    response = client.post(
        f"/api/v1/solicitudes/{BOOKING_ID}/completar", headers=HEADERS, json=payload
    )
    assert response.status_code == 422


@pytest.mark.parametrize("payload", [{}, {"motivo": " "}, {"motivo": "x" * 501}])
def test_cancel_requires_a_reason(make_client, payload):
    response = make_client(lambda request: pytest.fail("No debe cancelar sin motivo")).post(
        f"/api/v1/solicitudes/{BOOKING_ID}/cancelar", headers=HEADERS, json=payload
    )
    assert response.status_code == 422


@pytest.mark.parametrize("payload", [{}, None, [None], [{"id": BOOKING_ID}]])
def test_malformed_booking_response_is_controlled(make_client, payload):
    response = make_client(lambda request: httpx.Response(200, json=payload)).get(
        "/api/v1/solicitudes", headers=HEADERS
    )
    assert response.status_code == 502


def test_worker_cannot_confirm_on_clients_behalf(make_client):
    response = make_client(
        lambda request: httpx.Response(200, json=[{**BOOKING, "estado": "EN_CURSO"}]), WORKER
    ).post(f"/api/v1/solicitudes/{BOOKING_ID}/completar", headers=HEADERS,
           json={"codigo": "123456"})
    assert response.status_code == 403
