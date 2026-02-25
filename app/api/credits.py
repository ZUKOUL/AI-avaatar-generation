"""
Credit balance and transaction history endpoints.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.models.user import User
from app.services.credit_service import get_balance, get_transaction_history

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
