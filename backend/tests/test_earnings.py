import json

import httpx
import pytest

from tests import test_bookings as booking_tests
from tests.test_bookings import CLIENT, HEADERS, WORKER


@pytest.fixture
def make_client():
    yield from booking_tests.make_client.__wrapped__()


PATH = "/api/v1/trabajadores/me/ganancias"
SUMMARY = {
    "mes": "2026-10", "moneda": "CLP", "simulado": True,
    "total_completado": 25000, "cantidad_completada": 1,
    "total_en_curso": 15000, "cantidad_en_curso": 1,
    "dias": [{"fecha": "2026-10-16", "monto": 25000}], "items": [],
    "limit": 20, "offset": 0, "has_more": False,
}


def test_earnings_derive_identity_from_session_and_forward_month(make_client):
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/consultar_ganancias_trabajador"
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert json.loads(request.content) == {"p_mes": "2026-10-01", "p_limit": 20, "p_offset": 0}
        return httpx.Response(200, json=SUMMARY)
    result = make_client(handler, WORKER).get(PATH + "?mes=2026-10", headers=HEADERS)
    assert result.status_code == 200 and result.json() == SUMMARY


def test_client_cannot_read_worker_earnings(make_client):
    result = make_client(lambda _: pytest.fail("Client reached RPC"), CLIENT).get(
        PATH + "?mes=2026-10", headers=HEADERS,
    )
    assert result.status_code == 403


def test_earnings_require_a_session(make_client):
    assert make_client(lambda _: pytest.fail("Anonymous reached RPC")).get(
        PATH + "?mes=2026-10",
    ).status_code == 401


@pytest.mark.parametrize("query", ["", "?mes=2026-13", "?mes=2026-00", "?mes=2026-1",
    "?mes=1999-12", "?mes=2101-01", "?mes=2026-10&offset=-1", "?mes=2026-10&limit=101"])
def test_invalid_period_and_pagination_never_reach_database(make_client, query):
    result = make_client(lambda _: pytest.fail("Invalid query reached RPC"), WORKER).get(
        PATH + query, headers=HEADERS,
    )
    assert result.status_code == 422


@pytest.mark.parametrize("code,status", [("PGRST202", 503), ("42501", 403),
                                        ("22023", 422), ("unknown", 502)])
def test_earnings_errors_hide_database_details(make_client, code, status):
    result = make_client(lambda _: httpx.Response(400, json={
        "code": code, "message": "private database details",
    }), WORKER).get(PATH + "?mes=2026-10", headers=HEADERS)
    assert result.status_code == status and "private" not in result.text


def test_wrong_period_response_is_not_shown(make_client):
    result = make_client(lambda _: httpx.Response(200, json={**SUMMARY, "mes": "2026-09"}),
                         WORKER).get(PATH + "?mes=2026-10", headers=HEADERS)
    assert result.status_code == 502
