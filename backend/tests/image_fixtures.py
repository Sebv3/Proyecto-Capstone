from functools import lru_cache
from io import BytesIO

from PIL import Image


@lru_cache
def image_bytes(format="JPEG", size=(20, 20)):
    buffer = BytesIO()
    Image.new("RGB", size, color="#087D56").save(buffer, format=format)
    return buffer.getvalue()
