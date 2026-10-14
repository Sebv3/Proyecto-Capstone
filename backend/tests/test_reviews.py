import json

import httpx
import pytest
from pydantic import ValidationError

from app.schemas.review import ReviewCreate
from tests import test_bookings as booking_tests
from tests.test_bookings import BOOKING, CLIENT, HEADERS, WORKER


@pytest.fixture
def make_client():
    yield from booking_tests.make_client.__wrapped__()


REVIEW = {"id": "99999999-9999-4999-8999-999999999999", "solicitud_id": BOOKING["id"],
          "cliente_id": CLIENT["id"], "trabajador_id": WORKER["id"],
          "servicio_id": BOOKING["servicio_id"], "servicio_nombre": BOOKING["servicio_nombre"],
          "puntuacion": 5, "comentario": "Muy buen trabajo", "creado_en": "2026-10-13T12:00:00Z"}
PATH = f"/api/v1/solicitudes/{BOOKING['id']}/calificacion"


@pytest.mark.parametrize("rating", [0, 6, 4.5, "5", True, None])
def test_rating_requires_an_integer_from_one_to_five(rating):
    with pytest.raises(ValidationError):
        ReviewCreate(puntuacion=rating)


def test_comment_is_optional_trimmed_and_limited():
    assert ReviewCreate(puntuacion=1, comentario="  ").comentario is None
    assert ReviewCreate(puntuacion=5, comentario=" Bien ").comentario == "Bien"
    with pytest.raises(ValidationError):
        ReviewCreate(puntuacion=3, comentario="x" * 1001)


@pytest.mark.parametrize("created,status", [(True, 201), (False, 200)])
def test_creation_and_retry_use_authenticated_server_owned_identity(make_client, created, status):
    def handler(request):
        assert request.url.path == "/rest/v1/rpc/crear_calificacion"
        assert request.headers["Authorization"] == HEADERS["Authorization"]
        assert json.loads(request.content) == {
            "p_solicitud_id": BOOKING["id"], "p_puntuacion": 5,
            "p_comentario": "Muy buen trabajo",
        }
        return httpx.Response(200, json={"creada": created, "calificacion": REVIEW})

    result = make_client(handler).post(PATH, headers=HEADERS, json={
        "puntuacion": 5, "comentario": " Muy buen trabajo ",
    })
    assert result.status_code == status
    assert result.json()["cliente_id"] == CLIENT["id"]


@pytest.mark.parametrize("field", ["cliente_id", "trabajador_id", "servicio_id", "solicitud_id"])
def test_creation_rejects_forged_ownership_fields(make_client, field):
    result = make_client(lambda request: pytest.fail("Forged ownership reached RPC")).post(
        PATH, headers=HEADERS, json={"puntuacion": 5, field: WORKER["id"]},
    )
    assert result.status_code == 422


def test_worker_cannot_create_client_review(make_client):
    result = make_client(lambda request: pytest.fail("Worker reached create RPC"), WORKER).post(
        PATH, headers=HEADERS, json={"puntuacion": 5},
    )
    assert result.status_code == 403


@pytest.mark.parametrize("user", [CLIENT, WORKER])
@pytest.mark.parametrize("value", [None, REVIEW])
def test_participants_can_read_existing_or_absent_review(make_client, user, value):
    client = make_client(lambda request: httpx.Response(200, json={"calificacion": value}), user)
    result = client.get(PATH, headers=HEADERS)
    assert result.status_code == 200
    assert result.json() == value


def test_public_reviews_hide_booking_and_author_identifiers(make_client):
    def handler(request):
        assert "Authorization" not in request.headers
        assert json.loads(request.content) == {"p_trabajador_id": WORKER["id"],
                                               "p_limit": 10, "p_offset": 20}
        return httpx.Response(200, json={"trabajador_id": WORKER["id"], "promedio": 5,
            "cantidad": 30, "items": [REVIEW], "limit": 10, "offset": 20, "has_more": False})

    result = make_client(handler).get(
        f"/api/v1/trabajadores/{WORKER['id']}/calificaciones?limit=10&offset=20",
    )
    assert result.status_code == 200
    public = result.json()["items"][0]
    assert "cliente_id" not in public and "solicitud_id" not in public
    assert "servicio_id" not in public and "trabajador_id" not in public


@pytest.mark.parametrize("code,status", [
    ("PT409", 409), ("42501", 403), ("P0002", 404), ("PGRST202", 503), ("22023", 422),
])
def test_review_errors_hide_private_database_details(make_client, code, status):
    result = make_client(lambda request: httpx.Response(
        400, json={"code": code, "message": "private information"},
    )).post(PATH, headers=HEADERS, json={"puntuacion": 5})
    assert result.status_code == status and "private" not in result.text


def test_review_creation_requires_session(make_client):
    result = make_client(lambda request: pytest.fail("Anonymous reached RPC")).post(
        PATH, json={"puntuacion": 5},
    )
    assert result.status_code == 401
