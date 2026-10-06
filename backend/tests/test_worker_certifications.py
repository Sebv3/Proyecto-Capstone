import json

import httpx
import pytest

from tests.test_worker_services import CATEGORY_ID, WORKER, WORKER_ID, _authenticate
from tests.test_worker_services import make_client as make_client

HEADERS = {"Authorization": "Bearer worker-access-token"}
CERT_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
CERT = {
    "id": CERT_ID,
    "trabajador_id": WORKER_ID,
    "categoria_id": CATEGORY_ID,
    "nombre": "Licencia SEC",
    "estado": "PENDIENTE",
    "motivo_rechazo": None,
    "creado_en": "2026-10-05T12:00:00Z",
    "actualizado_en": "2026-10-05T12:00:00Z",
}
URL = "/api/v1/trabajador/certificaciones"


def test_worker_list_uses_owner_filter_and_hides_document_path(make_client):
    def handler(request):
        auth = _authenticate(request)
        if auth is not None:
            return auth
        assert request.url.params["trabajador_id"] == f"eq.{WORKER_ID}"
        assert "documento_path" not in request.url.params["select"]
        return httpx.Response(200, json=[{**CERT, "documento_path": "private"}])

    result = make_client(handler).get(URL, headers=HEADERS)
    assert result.status_code == 200
    assert "documento_path" not in result.json()[0]


@pytest.mark.parametrize("resubmit", [False, True])
def test_upload_and_resubmit_are_private_and_never_accept_worker_approval(make_client, resubmit):
    uploaded = []

    def handler(request):
        auth = _authenticate(request)
        if auth is not None:
            return auth
        if request.url.path == "/rest/v1/categorias":
            assert request.url.params["requiere_certificacion"] == "eq.true"
            return httpx.Response(200, json=[{"id": CATEGORY_ID}])
        if request.method == "GET":
            return httpx.Response(200, json=[{**CERT, "estado": "RECHAZADA"}] if resubmit else [])
        if "/storage/v1/object/" in request.url.path:
            assert request.headers["x-upsert"] == "false"
            assert request.content.startswith(b"%PDF-")
            assert f"/{WORKER_ID}/{CATEGORY_ID}/" in request.url.path
            uploaded.append(request.url.path)
            return httpx.Response(200, json={})
        payload = json.loads(request.content)
        assert "estado" not in payload and "revisado_por" not in payload
        assert payload["nombre"] == "Licencia SEC"
        assert len(uploaded) == 1
        assert request.method == ("PATCH" if resubmit else "POST")
        if resubmit:
            assert request.url.params["estado"] == "eq.RECHAZADA"
        return httpx.Response(201, json=[CERT])

    result = make_client(handler).post(
        URL,
        headers=HEADERS,
        data={"categoria_id": CATEGORY_ID, "nombre": " Licencia SEC "},
        files={"documento": ("license.pdf", b"%PDF-1.7\nfixture", "application/pdf")},
    )
    assert result.status_code == 201
    assert result.json()["estado"] == "PENDIENTE"
    assert "documento_path" not in result.json()


@pytest.mark.parametrize("state", ["PENDIENTE", "APROBADA"])
def test_pending_or_approved_document_cannot_be_replaced(make_client, state):
    def handler(request):
        auth = _authenticate(request)
        if auth is not None:
            return auth
        assert request.method == "GET"
        return httpx.Response(
            200,
            json=[{"id": CATEGORY_ID}]
            if "categorias" in request.url.path
            else [{**CERT, "estado": state}],
        )

    result = make_client(handler).post(
        URL,
        headers=HEADERS,
        data={"categoria_id": CATEGORY_ID, "nombre": "Licencia SEC"},
        files={"documento": ("license.pdf", b"%PDF-1.7", "application/pdf")},
    )
    assert result.status_code == 409


@pytest.mark.parametrize(
    "data,mime",
    [
        (b"fake", "application/pdf"),
        (b"", "image/png"),
        (b"fake", "text/plain"),
        (b"%PDF-" + b"x" * (5 * 1024 * 1024), "application/pdf"),
        (b"RIFF0000FAKE", "image/webp"),
    ],
)
def test_invalid_documents_never_reach_storage(make_client, data, mime):
    def handler(request):
        auth = _authenticate(request)
        if auth is not None:
            return auth
        assert request.method == "GET"
        return httpx.Response(
            200, json=[{"id": CATEGORY_ID}] if "categorias" in request.url.path else []
        )

    result = make_client(handler).post(
        URL,
        headers=HEADERS,
        data={"categoria_id": CATEGORY_ID, "nombre": "Licencia SEC"},
        files={"documento": ("file", data, mime)},
    )
    assert result.status_code == 422


def test_failed_save_cleans_up_only_the_new_upload(make_client):
    paths = []

    def handler(request):
        auth = _authenticate(request)
        if auth is not None:
            return auth
        if request.method == "GET":
            return httpx.Response(
                200, json=[{"id": CATEGORY_ID}] if "categorias" in request.url.path else []
            )
        if "/storage/" in request.url.path:
            if request.method == "POST":
                paths.append(request.url.path.split("certificaciones-trabajador/", 1)[1])
            else:
                assert json.loads(request.content)["prefixes"] == paths
            return httpx.Response(200, json={})
        return httpx.Response(409, json={"message": "private database details"})

    result = make_client(handler).post(
        URL,
        headers=HEADERS,
        data={"categoria_id": CATEGORY_ID, "nombre": "Licencia SEC"},
        files={"documento": ("license.pdf", b"%PDF-1.7", "application/pdf")},
    )
    assert result.status_code == 409
    assert "private" not in result.text


@pytest.mark.parametrize(
    "path,method",
    [
        (URL, "get"),
        (f"/api/v1/admin/certificaciones/{CERT_ID}", "patch"),
        (f"/api/v1/admin/certificaciones/{CERT_ID}/documento", "get"),
    ],
)
def test_wrong_role_cannot_read_upload_or_review_private_certifications(make_client, path, method):
    def handler(request):
        auth = _authenticate(request, {**WORKER, "rol": "CLIENTE"})
        if auth is not None:
            return auth
        pytest.fail("Wrong role reached private resources")

    kwargs = {"json": {"estado": "APROBADA"}} if method == "patch" else {}
    result = getattr(make_client(handler), method)(path, headers=HEADERS, **kwargs)
    assert result.status_code == 403


def test_admin_review_uses_atomic_rpc(make_client):
    def handler(request):
        auth = _authenticate(request, {**WORKER, "rol": "ADMIN"})
        if auth is not None:
            return auth
        assert request.url.path == "/rest/v1/rpc/revisar_certificacion_trabajador"
        assert json.loads(request.content) == {
            "p_certificacion_id": CERT_ID,
            "p_estado": "RECHAZADA",
            "p_motivo": "Ilegible",
        }
        return httpx.Response(
            200, json=[{**CERT, "estado": "RECHAZADA", "motivo_rechazo": "Ilegible"}]
        )

    result = make_client(handler).patch(
        f"/api/v1/admin/certificaciones/{CERT_ID}",
        headers=HEADERS,
        json={"estado": "RECHAZADA", "motivo_rechazo": " Ilegible "},
    )
    assert result.status_code == 200
    assert result.json()["estado"] == "RECHAZADA"


def test_admin_document_is_signed_and_short_lived(make_client):
    path = f"{WORKER_ID}/{CATEGORY_ID}/document.pdf"

    def handler(request):
        auth = _authenticate(request, {**WORKER, "rol": "ADMIN"})
        if auth is not None:
            return auth
        if request.method == "GET":
            return httpx.Response(200, json=[{"documento_path": path}])
        assert json.loads(request.content) == {"expiresIn": 60}
        return httpx.Response(
            200,
            json={
                "signedURL": f"/object/sign/certificaciones-trabajador/{path}?token=test",
            },
        )

    result = make_client(handler).get(
        f"/api/v1/admin/certificaciones/{CERT_ID}/documento",
        headers=HEADERS,
    )
    assert result.status_code == 200
    assert result.json()["expires_in"] == 60
    assert result.json()["url"].startswith("https://test.supabase.co/storage/v1/object/sign/")


def test_missing_migration_returns_actionable_unavailability(make_client):
    def handler(request):
        auth = _authenticate(request)
        return auth if auth is not None else httpx.Response(404, json={})

    assert make_client(handler).get(URL, headers=HEADERS).status_code == 503
