"""
Signup and login: create account or issue JWT. No auth required to call these.
"""
import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

from app.core.auth import create_token, get_current_user, create_password_reset_token, decode_token
from app.core.config import settings
from app.core.supabase import supabase
from app.models.user import User
from app.services.auth_service import (
    create_user,
    get_user_by_email,
    hash_password,
    verify_password,
)
from app.services.credit_service import is_admin
from app.services.email_service import send_password_reset_email

router = APIRouter()

# Basic email format
EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
MIN_PASSWORD_LEN = 8

VALID_ROLES = ("user", "administrator")


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


class ChangeRoleBody(BaseModel):
    role: Literal["user", "administrator"]


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


@router.patch("/users/{user_id}/role")
async def change_user_role(
    user_id: str,
    body: ChangeRoleBody,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Change a user's role. Only administrators can call this endpoint.
    Accepts: {"role": "user"} or {"role": "administrator"}
    """
    # Only admins can change roles
    if not is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "FORBIDDEN", "message": "Only administrators can change user roles."},
        )

    # Prevent admins from demoting themselves
    if user_id == current_user["id"] and body.role != "administrator":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "SELF_DEMOTION", "message": "You cannot remove your own administrator role."},
        )

    # Verify target user exists
    target = supabase.table("users").select("id, email, role").eq("id", user_id).limit(1).execute()
    if not target.data or len(target.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "USER_NOT_FOUND", "message": "Target user not found."},
        )

    # Update role
    supabase.table("users").update({"role": body.role}).eq("id", user_id).execute()

    return {
        "status": "Success",
        "user_id": user_id,
        "email": target.data[0]["email"],
        "new_role": body.role,
        "message": f"Role updated to '{body.role}' successfully.",
    }


class ForgotPasswordBody(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        return v.strip().lower()


@router.post("/forgot-password")
@router.post("/forgot-password/")
async def forgot_password(body: ForgotPasswordBody):
    """Initiates the password reset flow by sending a token link via email."""
    user = get_user_by_email(body.email)
    
    # Generic success message to prevent email enumeration
    success_msg = {"message": "If an account with that email exists, a password reset link has been sent."}
    
    if not user:
         return success_msg

    # Generate the time-limited reset token
    user_id = str(user["id"])
    reset_token = create_password_reset_token(user_id, body.email)
    
    # Construct the link leveraging FRONTEND_URL
    # Ensure no double slashes if frontend url has trailing slash
    base_url = settings.FRONTEND_URL.rstrip('/')
    reset_link = f"{base_url}/forgot-password?token={reset_token}"
    
    # Send email
    send_password_reset_email(to_email=body.email, reset_link=reset_link)

    return success_msg


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < MIN_PASSWORD_LEN:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LEN} characters")
        return v


@router.post("/reset-password")
@router.post("/reset-password/")
async def reset_password(body: ResetPasswordBody):
    """Processes the token and updates the user's password."""
    try:
        payload = decode_token(body.token)
    except HTTPException:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "INVALID_TOKEN", "message": "Invalid or expired token"})

    # Enforce token intent
    if payload.get("intent") != "password_reset":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "INVALID_INTENT", "message": "Invalid token type"})

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "INVALID_TOKEN", "message": "Invalid token data"})

    # Hash the new password
    new_password_hash = hash_password(body.new_password)
    
    # Update Supabase users table directly
    response = supabase.table("users").update({"password_hash": new_password_hash}).eq("id", user_id).execute()
    
    if not getattr(response, 'data', None) and not isinstance(response.data, list):
        pass

    return {"message": "Password has been reset successfully. You can now log in."}
