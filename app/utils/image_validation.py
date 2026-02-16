from PIL import Image
from io import BytesIO

ALLOWED_FORMATS = ["JPEG", "PNG"]
MIN_WIDTH = 512
MIN_HEIGHT = 512

def validate_avatar_image(file_bytes: bytes):
    try:
        img = Image.open(BytesIO(file_bytes))
    except Exception:
        raise ValueError("Invalid image file")

    if img.format not in ALLOWED_FORMATS:
        raise ValueError("Only JPEG or PNG images are allowed")

    width, height = img.size
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        raise ValueError("Image resolution too low (min 512x512)")

    return True
