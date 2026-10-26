import httpx
import pytest
from pydantic import ValidationError

from app.schemas.payment import PaymentAmounts, PaymentResult
from tests import test_bookings as booking_tests
from tests.test_bookings import BOOKING, CLIENT, HEADERS, WORKER


@pytest.fixture
def make_client(monkeypatch):
    monkeypatch.setenv("MERCADO_PAGO_ENABLED", "false")
    yield from booking_tests.make_client.__wrapped__()

PAYMENT = {
    "id": "99999999-9999-4999-8999-999999999999",
    "solicitud_id": BOOKING["id"], "cliente_id": BOOKING["cliente_id"],
    "trabajador_id": BOOKING["trabajador_id"], "tarifa_base": BOOKING["precio_base"],
    "comision": 3750, "monto_total": 28750, "moneda": "CLP", "simulado": True,
    "estado": "APROBADO", "creado_en": "2026-10-13T12:00:00Z",
}
RESULT = {"pago": PAYMENT, "solicitud": {**BOOKING, "estado": "PAGADA"}}
PATH = f"/api/v1/solicitudes/{BOOKING['id']}/pago"


@pytest.mark.parametrize("base,fee", [(1, 0), (3, 0), (4, 1), (10, 2), (20000, 3000)])
def test_commission_rounds_half_up_in_integer_clp(base, fee):
    PaymentAmounts(tarifa_base=base, comision=fee, monto_total=base+fee,
                   moneda="CLP", simulado=True)
    with pytest.raises(ValidationError):
        PaymentAmounts(tarifa_base=base, comision=fee+1, monto_total=base+fee+1,
                       moneda="CLP", simulado=True)


@pytest.mark.parametrize("enabled", ["true", "false"])
def test_simulated_payment_is_disabled_even_without_mp(make_client, monkeypatch, enabled):
    monkeypatch.setenv("MERCADO_PAGO_ENABLED", enabled)
    def handler(request):
        pytest.fail("A user must not reach the simulated payment RPC")

    result = make_client(handler).post(PATH + "/simular", headers=HEADERS, json={})
    assert result.status_code == 409
    assert "Mercado Pago" in result.json()["detail"]


@pytest.mark.parametrize("field,value", [
    ("tarifa_base", 1), ("comision", 0), ("monto_total", 1),
    ("cliente_id", WORKER["id"]), ("estado", "APROBADO"), ("simulado", False),
])
def test_client_cannot_inject_payment_fields(make_client, field, value):
    def handler(request):
        pytest.fail("Invalid payload must not reach payment RPC")

    result = make_client(handler).post(PATH + "/simular", headers=HEADERS, json={field: value})
    assert result.status_code == 422


def test_worker_cannot_simulate_payment(make_client):
    result = make_client(lambda request: pytest.fail("Worker reached RPC"), WORKER).post(
        PATH + "/simular", headers=HEADERS, json={},
    )
    assert result.status_code == 403


def test_missing_session_cannot_pay(make_client):
    assert make_client(lambda request: pytest.fail("Unauthenticated RPC")).post(
        PATH + "/simular", json={},
    ).status_code == 401


@pytest.mark.parametrize("user", [CLIENT, WORKER])
def test_participant_can_read_summary(make_client, user):
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/consultar_pago_solicitud"
        return httpx.Response(200, json={
            **{key: PAYMENT[key] for key in (
                "tarifa_base", "comision", "monto_total", "moneda", "simulado"
            )}, "pago": PAYMENT,
        })

    assert make_client(handler, user).get(PATH, headers=HEADERS).status_code == 200


@pytest.mark.parametrize("code,status", [
    ("PT409", 409), ("42501", 403), ("P0002", 404), ("PGRST202", 503), ("unexpected", 502),
])
def test_payment_errors_hide_database_details(make_client, code, status):
    result = make_client(lambda request: httpx.Response(
        400, json={"code": code, "message": "private database details"},
    )).get(PATH, headers=HEADERS)
    assert result.status_code == status
    assert "private" not in result.text


@pytest.mark.parametrize("changes", [
    {"comision": 1}, {"monto_total": 1}, {"simulado": False},
    {"cliente_id": WORKER["id"]},
])
def test_inconsistent_rpc_results_are_rejected(make_client, changes):
    result = make_client(lambda request: httpx.Response(
        200, json={**{key: PAYMENT[key] for key in (
            "tarifa_base", "comision", "monto_total", "moneda", "simulado",
        )}, "pago": {**PAYMENT, **changes}},
    )).get(PATH, headers=HEADERS)
    assert result.status_code == 502


def test_payment_result_cannot_report_accepted_booking():
    with pytest.raises(ValidationError):
        PaymentResult.model_validate({**RESULT, "solicitud": {**BOOKING, "estado": "ACEPTADA"}})
