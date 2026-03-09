"""
Custom JWT: create and verify tokens; get_current_user dependency for protected routes.
"""
import time
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.models.user import User
from app.services.auth_service import get_user_by_id

# HS256; raise if secret missing in production
JWT_ALGORITHM = "HS256"

security = HTTPBearer(auto_error=False)


def create_token(user_id: str, email: str) -> str:
    """Encode a JWT for the given user. Used after signup/login."""
    if not settings.JWT_SECRET:
        raise ValueError("JWT_SECRET is not set")
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + settings.JWT_EXPIRE_SECONDS,
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def create_password_reset_token(user_id: str, email: str) -> str:
    """Generate a 15-minute token for password resets."""
    if not settings.JWT_SECRET:
        raise ValueError("JWT_SECRET is not set")
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "intent": "password_reset",
        "iat": now,
        "exp": now + 900,  # 15 minutes
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify JWT; return payload or raise."""
    if not settings.JWT_SECRET:
        raise ValueError("JWT_SECRET is not set")
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "TOKEN_EXPIRED", "message": "Token has expired"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "INVALID_TOKEN", "message": "Invalid token"},
        )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> User:
    """Extract Bearer token, verify JWT, load user from DB; return user or 401."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "Authorization header with Bearer token required"},
        )
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "INVALID_TOKEN", "message": "Invalid token"},
        )
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "USER_NOT_FOUND", "message": "User no longer exists"},
        )
    return user
