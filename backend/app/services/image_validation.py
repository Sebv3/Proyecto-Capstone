from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

MAX_IMAGE_PIXELS = 20_000_000
MAX_IMAGE_SIDE = 8192
FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


def _decode_image(data: bytes, mime: str, label: str) -> None:
    try:
        with Image.open(BytesIO(data), formats=list(FORMATS.values())) as image:
            if image.format != FORMATS.get(mime):
                raise ValueError("Mismatched image format")
            width, height = image.size
            if (width * height > MAX_IMAGE_PIXELS
                    or max(width, height) > MAX_IMAGE_SIDE):
                raise HTTPException(
                    422, f"{label}: usa una imagen de hasta 20 megapíxeles y 8192 píxeles por lado"
                )
            if getattr(image, "n_frames", 1) != 1:
                raise HTTPException(422, f"{label}: selecciona una imagen sin animación")
            image.verify()
        # verify() checks structure, but decoding also detects truncated pixel data.
        with Image.open(BytesIO(data), formats=list(FORMATS.values())) as image:
            image.load()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError,
            Image.DecompressionBombError) as exc:
        raise HTTPException(422, f"{label}: la imagen no es válida o está dañada") from exc


async def validate_image(data: bytes, mime: str, label: str) -> None:
    # Image decoding is CPU-bound and must not block the API's event loop.
    await run_in_threadpool(_decode_image, data, mime, label)
