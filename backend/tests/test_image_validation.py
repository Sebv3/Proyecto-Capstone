from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image
from starlette.datastructures import Headers, UploadFile

from app.routers.worker_verification import _validated_image
from app.services.image_validation import _decode_image
from tests.image_fixtures import image_bytes


@pytest.mark.parametrize("format,mime", [("JPEG", "image/jpeg"), ("PNG", "image/png"),
                                        ("WEBP", "image/webp")])
def test_real_images_are_decodable_and_preserved(format, mime):
    data = image_bytes(format)
    _decode_image(data, mime, "Foto")


@pytest.mark.asyncio
@pytest.mark.parametrize("data,mime", [
    (b"\xff\xd8\xffnot-a-real-image", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\nnot-a-real-image", "image/png"),
    (b"RIFF1234WEBPnot-a-real-image", "image/webp"),
    (image_bytes("JPEG")[:100], "image/jpeg"),
])
async def test_forged_headers_and_truncated_images_are_rejected(data, mime):
    file = UploadFile(BytesIO(data), headers=Headers({"content-type": mime}))
    with pytest.raises(HTTPException) as error:
        await _validated_image(file, "Foto")
    assert error.value.status_code == 422


def test_mime_does_not_override_decoded_image_type():
    with pytest.raises(HTTPException) as error:
        _decode_image(image_bytes("PNG"), "image/jpeg", "Foto")
    assert error.value.status_code == 422


@pytest.mark.parametrize("size", [(8193, 1), (4500, 4500)])
def test_dimensions_and_pixel_count_are_bounded_before_decoding(size):
    with pytest.raises(HTTPException) as error:
        _decode_image(image_bytes("PNG", size), "image/png", "Foto")
    assert error.value.status_code == 422
    assert "20 megapíxeles" in error.value.detail


def test_animated_images_are_rejected():
    buffer = BytesIO()
    Image.new("RGB", (10, 10), "red").save(buffer, format="PNG", save_all=True,
        append_images=[Image.new("RGB", (10, 10), "blue")], duration=100, loop=0)
    with pytest.raises(HTTPException) as error:
        _decode_image(buffer.getvalue(), "image/png", "Foto")
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_image_decode_is_dispatched_off_the_event_loop(monkeypatch):
    from app.services import image_validation

    calls = []

    async def pool(function, *args):
        calls.append(function)
        function(*args)

    monkeypatch.setattr(image_validation, "run_in_threadpool", pool)
    await image_validation.validate_image(image_bytes(), "image/jpeg", "Foto")
    assert calls == [image_validation._decode_image]
