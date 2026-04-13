"""
Credit balance and transaction history endpoints.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.models.user import User
from app.services.credit_service import get_balance, get_transaction_history, add_credits, is_admin

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/balance")
async def credit_balance(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Return the user's current credit balance."""
    balance = get_balance(current_user["id"])
    return {"balance": balance}


@router.get("/history")
async def credit_history(
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 50,
):
    """Return recent credit transactions for the authenticated user."""
    transactions = get_transaction_history(current_user["id"], limit=min(limit, 100))
    return {"transactions": transactions}


class AdminAddCreditsBody(BaseModel):
    user_id: str | None = None
    amount: int
    description: str = "Admin credit grant"


@router.post("/admin/add")
async def admin_add_credits(
    body: AdminAddCreditsBody,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Add credits to a user. Admin-only endpoint. If no user_id, adds to self."""
    if not is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can add credits.",
        )
    target_id = body.user_id or current_user["id"]
    new_balance = add_credits(target_id, body.amount, "admin_grant", body.description)
    return {"message": f"Added {body.amount} credits", "new_balance": new_balance}
