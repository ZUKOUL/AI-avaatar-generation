import uuid
from app.core.supabase import supabase

AVATAR_BUCKET = "avatars"

def upload_avatar_image(file_bytes: bytes, content_type: str):
    filename = f"{uuid.uuid4()}.png"

    supabase.storage.from_(AVATAR_BUCKET).upload(
        filename,
        file_bytes,
        {"content-type": content_type}
    )

    public_url = supabase.storage.from_(AVATAR_BUCKET).get_public_url(filename)
    return public_url


def generate_identity_descriptor():
    return (
        "The same person with identical facial features, "
        "consistent face shape, skin tone, age, and gender."
    )
