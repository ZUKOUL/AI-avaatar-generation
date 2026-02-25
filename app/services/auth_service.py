"""
User creation and password verification. Uses bcrypt for hashing.
"""
from app.core.config import settings
from app.core.supabase import supabase
from app.models.user import User

# bcrypt rounds; 12 is a good default for security vs speed
BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    import bcrypt
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_user(email: str, password_hash: str) -> User:
    """Insert user into DB; return user dict with id and email."""
    normalized_email = email.strip().lower()
    supabase.table("users").insert({
        "email": normalized_email,
        "password_hash": password_hash,
    }).execute()
    # Fetch the row we just inserted (insert builder doesn't support .select() in this client)
    row = get_user_by_email(normalized_email)
    if not row:
        raise RuntimeError("User insert did not return data")
    return {"id": str(row["id"]), "email": row["email"]}


def get_user_by_id(user_id: str) -> User | None:
    """Fetch user by id; return None if not found."""
    res = supabase.table("users").select("id, email").eq("id", user_id).limit(1).execute()
    if not res.data or len(res.data) == 0:
        return None
    row = res.data[0]
    return {"id": str(row["id"]), "email": row["email"]}


def get_user_by_email(email: str) -> dict | None:
    """Fetch full user row by email (for login); return None if not found."""
    res = (
        supabase.table("users")
        .select("id, email, password_hash")
        .eq("email", email.strip().lower())
        .limit(1)
        .execute()
    )
    if not res.data or len(res.data) == 0:
        return None
    return res.data[0]
