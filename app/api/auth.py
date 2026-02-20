"""
Signup and login: create account or issue JWT. No auth required to call these.
"""
import re
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, field_validator

from app.core.auth import create_token
from app.services.auth_service import (
    create_user,
    get_user_by_email,
    hash_password,
    verify_password,
)

router = APIRouter()

# Basic email format
EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
MIN_PASSWORD_LEN = 8


class SignupBody(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        v = v.strip().lower()
        if not v or not EMAIL_RE.match(v):
            raise ValueError("Invalid email format")
        return v

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < MIN_PASSWORD_LEN:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LEN} characters")
        return v


class LoginBody(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        return v.strip().lower()


@router.post("/signup")
async def signup(body: SignupBody):
    """Create account; return JWT and user info. User must signup before login."""
    existing = get_user_by_email(body.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "EMAIL_TAKEN", "message": "An account with this email already exists"},
        )
    password_hash = hash_password(body.password)
    user = create_user(body.email, password_hash)
    token = create_token(user["id"], user["email"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }


@router.post("/login")
async def login(body: LoginBody):
    """Verify email/password; return JWT and user info."""
    row = get_user_by_email(body.email)
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "INVALID_CREDENTIALS", "message": "Invalid email or password"},
        )
    user = {"id": str(row["id"]), "email": row["email"]}
    token = create_token(user["id"], user["email"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }
