import json
from uuid import UUID

import httpx
import pytest

from tests.image_fixtures import image_bytes
from tests.test_worker_role_requests import TOKEN_HEADERS, USER, USER_ID
from tests.test_worker_role_requests import _authenticate as _authenticate_user
from tests.test_worker_role_requests import make_client as make_client

BASE = "https://test.supabase.co/storage/v1/object/public/profile-avatars"
OLD_PATH = f"{USER_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg"
OLD = f"{BASE}/{OLD_PATH}"
JPEG = ("foto.jpg", image_bytes(), "image/jpeg")


def _authenticate(request, user=USER):
    assert request.headers["Authorization"] == TOKEN_HEADERS["Authorization"]
    return _authenticate_user(request, user) if request.method == "GET" else None


@pytest.mark.parametrize("role", ["CLIENTE", "TRABAJADOR", "ADMIN"])
def test_upload_uses_owner_token_and_only_updates_avatar(make_client, role):
    new_url = None
    calls = []

    def handler(request):
        nonlocal new_url
        auth = _authenticate(request, {**USER, "rol": role, "avatar_url": OLD})
        if auth is not None:
            return auth
        calls.append(request.method)
        if request.method == "POST":
            prefix = f"/storage/v1/object/profile-avatars/{USER_ID}/"
            assert request.url.path.startswith(prefix)
            UUID(request.url.path.removeprefix(prefix).removesuffix(".jpg"))
            assert request.content == JPEG[1]
            assert request.headers["content-type"] == "image/jpeg"
            assert request.headers["x-upsert"] == "false"
            new_url = BASE + request.url.path.split("profile-avatars", 1)[1]
            return httpx.Response(200, json={})
        if request.method == "PATCH":
            assert request.url.path == "/rest/v1/usuarios"
            assert request.url.params["id"] == f"eq.{USER_ID}"
            assert json.loads(request.content) == {"avatar_url": new_url}
            return httpx.Response(200, json=[{"id": USER_ID, "avatar_url": new_url}])
        assert request.method == "DELETE"
        assert json.loads(request.content) == {"prefixes": [OLD_PATH]}
        return httpx.Response(200, json=[])

    result = make_client(handler).post("/api/v1/perfil/foto", headers=TOKEN_HEADERS,
                                       files={"foto": JPEG})
    assert result.status_code == 200, result.text
    assert result.json() == {"avatar_url": new_url}
    assert calls == ["POST", "PATCH", "DELETE"]


@pytest.mark.parametrize("file", [
    ("empty.jpg", b"", "image/jpeg"),
    ("fake.jpg", b"Not an image", "image/jpeg"),
    ("large.jpg", b"\xff\xd8\xff" + b"x" * (5 * 1024 * 1024), "image/jpeg"),
    ("script.svg", b"<svg></svg>", "image/svg+xml"),
    ("fake.webp", b"RIFF1234WAVE", "image/webp"),
])
def test_invalid_files_never_reach_storage(make_client, file):
    def handler(request):
        auth = _authenticate(request)
        if auth is not None:
            return auth
        pytest.fail("Invalid photos must not be uploaded")

    response = make_client(handler).post("/api/v1/perfil/foto", headers=TOKEN_HEADERS,
                                         files={"foto": file})
    assert response.status_code == 422


@pytest.mark.parametrize("method", ["post", "delete"])
def test_avatar_requires_authentication(make_client, method):
    client = make_client(lambda request: pytest.fail("No upstream access without a token"))
    assert getattr(client, method)("/api/v1/perfil/foto").status_code == 401


@pytest.mark.parametrize("stage", ["POST", "PATCH"])
def test_failures_keep_previous_avatar_file(make_client, stage):
    def handler(request):
        auth = _authenticate(request, {**USER, "avatar_url": OLD})
        if auth is not None:
            return auth
        assert request.method != "DELETE"
        if request.method == stage:
            return httpx.Response(500, json={"message": "private upstream details"})
        return httpx.Response(200, json={})

    response = make_client(handler).post("/api/v1/perfil/foto", headers=TOKEN_HEADERS,
                                         files={"foto": JPEG})
    assert response.status_code == 502
    assert "private upstream" not in response.text


@pytest.mark.parametrize("old_url", [OLD, "https://external.example/photo.jpg", None])
def test_removal_clears_only_own_profile_and_cleans_only_managed_photo(make_client, old_url):
    deletes = []

    def handler(request):
        auth = _authenticate(request, {**USER, "avatar_url": old_url})
        if auth is not None:
            return auth
        if request.method == "PATCH":
            assert request.url.params["id"] == f"eq.{USER_ID}"
            assert json.loads(request.content) == {"avatar_url": None}
            return httpx.Response(200, json=[{"id": USER_ID, "avatar_url": None}])
        assert request.method == "DELETE"
        deletes.append(json.loads(request.content))
        # Failed cleanup does not invalidate the successful profile update.
        return httpx.Response(500, json={})

    response = make_client(handler).delete("/api/v1/perfil/foto", headers=TOKEN_HEADERS)
    assert response.status_code == 200
    assert response.json() == {"avatar_url": None}
    assert deletes == ([{"prefixes": [OLD_PATH]}] if old_url == OLD else [])


def test_inactive_account_cannot_upload(make_client):
    response = make_client(lambda request: _authenticate(request, {**USER, "activo": False})).post(
        "/api/v1/perfil/foto", headers=TOKEN_HEADERS, files={"foto": JPEG},
    )
    assert response.status_code == 403


@pytest.mark.parametrize("photo", [
    ("photo.png", image_bytes("PNG"), "image/png"),
    ("photo.webp", image_bytes("WEBP"), "image/webp"),
])
def test_other_supported_image_formats(make_client, photo):
    saved_url = None

    def handler(request):
        nonlocal saved_url
        auth = _authenticate(request)
        if auth is not None:
            return auth
        if request.method == "POST":
            assert request.headers["content-type"] == photo[2]
            assert request.content == photo[1]
            saved_url = BASE + request.url.path.split("profile-avatars", 1)[1]
            return httpx.Response(200, json={})
        assert request.method == "PATCH"
        return httpx.Response(200, json=[{"id": USER_ID, "avatar_url": saved_url}])

    response = make_client(handler).post("/api/v1/perfil/foto", headers=TOKEN_HEADERS,
                                         files={"foto": photo})
    assert response.status_code == 200
    assert response.json()["avatar_url"].endswith(photo[0].split(".")[-1])


def test_unconfirmed_profile_update_does_not_remove_previous_photo(make_client):
    def handler(request):
        auth = _authenticate(request, {**USER, "avatar_url": OLD})
        if auth is not None:
            return auth
        assert request.method == "PATCH"
        return httpx.Response(200, json=[])

    result = make_client(handler).delete("/api/v1/perfil/foto", headers=TOKEN_HEADERS)
    assert result.status_code == 502
