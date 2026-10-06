import json

import httpx
import pytest

from tests.test_catalog import CATEGORY_ID, SERVICE_ID, SERVICE_ROW, WORKER_ID
from tests.test_catalog import make_client as make_client

LOCAL_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
LOCAL = {
    "id": LOCAL_ID,
    "trabajador_id": WORKER_ID,
    "nombre": "Taller Central",
    "direccion_publica": "Avenida Central 123",
    "latitud": -33.45,
    "longitud": -70.66,
    "trabajador_nombre": "Ana",
    "servicios": [
        {
            "id": SERVICE_ID,
            "nombre": "Pintura",
            "precio_base": 20000,
            "categoria_id": CATEGORY_ID,
            "categoria_nombre": "Pintura",
        }
    ],
}


def test_service_map_returns_both_modalities_and_only_public_projection(make_client):
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/consultar_servicios_mapa"
        assert "Authorization" not in request.headers
        return httpx.Response(
            200,
            json=[
                {
                    **SERVICE_ROW,
                    "ubicacion_publica": "Sector Plaza Central",
                    "latitud": -33.45,
                    "longitud": -70.66,
                    "radio_cobertura_km": 5,
                    "rut": "private",
                },
                {
                    **SERVICE_ROW,
                    "modalidad": "TALLER",
                    "ubicacion_publica": "Avenida Central 123",
                    "latitud": -33.44,
                    "longitud": -70.65,
                    "radio_cobertura_km": None,
                },
            ],
        )

    response = make_client(handler).get("/api/v1/mapa/servicios")
    assert response.status_code == 200
    assert [s["modalidad"] for s in response.json()] == ["DOMICILIO", "TALLER"]
    assert "rut" not in response.text


def test_service_map_rejects_offers_without_coordinates(make_client):
    client = make_client(lambda _: httpx.Response(200, json=[SERVICE_ROW]))
    assert client.get("/api/v1/mapa/servicios").status_code == 502


def test_public_locations_project_only_public_fields(make_client):
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/consultar_locales_catalogo"
        assert json.loads(request.content) == {"p_local_id": None}
        assert "Authorization" not in request.headers
        return httpx.Response(200, json=[{**LOCAL, "rut": "private", "email": "private"}])

    response = make_client(handler).get("/api/v1/locales")
    assert response.status_code == 200
    assert response.json() == [LOCAL]


def test_location_detail_scopes_rpc_to_selected_location(make_client):
    def handler(request):
        assert json.loads(request.content) == {"p_local_id": LOCAL_ID}
        return httpx.Response(200, json=[LOCAL])

    assert make_client(handler).get(f"/api/v1/locales/{LOCAL_ID}").json() == LOCAL


@pytest.mark.parametrize(
    "payload", [None, {}, [{**LOCAL, "latitud": 100}], [{**LOCAL, "servicios": []}]]
)
def test_locations_reject_invalid_upstream_payload(make_client, payload):
    client = make_client(lambda _: httpx.Response(200, json=payload))
    assert client.get("/api/v1/locales").status_code == 502


def test_unavailable_location_returns_404(make_client):
    client = make_client(lambda _: httpx.Response(200, json=[]))
    assert client.get("/api/v1/locales").json() == []
    assert client.get(f"/api/v1/locales/{LOCAL_ID}").status_code == 404


def test_missing_migration_returns_503(make_client):
    client = make_client(lambda _: httpx.Response(404, json={"code": "PGRST202"}))
    assert client.get("/api/v1/locales").status_code == 503


def test_location_detail_rejects_unrelated_record(make_client):
    client = make_client(lambda _: httpx.Response(200, json=[LOCAL]))
    assert client.get(f"/api/v1/locales/{WORKER_ID}").status_code == 502


def test_invalid_uuid_does_not_query_supabase(make_client):
    def handler(_):
        pytest.fail("An invalid UUID should never reach Supabase")

    assert make_client(handler).get("/api/v1/locales/invalid").status_code == 422
