"""
Credit balance operations: read, add, deduct, history.
All mutations are recorded in credit_transactions for auditability.
"""
import logging
from app.core.supabase import supabase

logger = logging.getLogger(__name__)


def get_balance(user_id: str) -> int:
    """Return current credit balance for the user."""
    res = supabase.table("users").select("credit_balance").eq("id", user_id).single().execute()
    if not res.data:
        return 0
    return res.data.get("credit_balance", 0)


def check_duplicate_session(stripe_session_id: str) -> bool:
    """Return True if this Stripe session has already been processed (idempotency guard)."""
    res = (
        supabase.table("credit_transactions")
        .select("id")
        .eq("stripe_session_id", stripe_session_id)
        .limit(1)
        .execute()
    )
    return bool(res.data and len(res.data) > 0)


def add_credits(
    user_id: str,
    amount: int,
    txn_type: str,
    description: str = "",
    stripe_session_id: str | None = None,
) -> int:
    """Add credits to user. Returns new balance."""
    current = get_balance(user_id)
    new_balance = current + amount

    # Update user balance
    supabase.table("users").update({"credit_balance": new_balance}).eq("id", user_id).execute()

    # Record transaction
    txn = {
        "user_id": user_id,
        "amount": amount,
        "type": txn_type,
        "description": description,
        "balance_after": new_balance,
    }
    if stripe_session_id:
        txn["stripe_session_id"] = stripe_session_id

    supabase.table("credit_transactions").insert(txn).execute()
    logger.info(f"Added {amount} credits to user {user_id}. New balance: {new_balance}")
    return new_balance


def deduct_credits(
    user_id: str,
    amount: int,
    txn_type: str,
    description: str = "",
) -> int:
    """
    Deduct credits from user. Returns new balance.
    Raises ValueError if insufficient credits.
    """
    current = get_balance(user_id)
    if current < amount:
        raise ValueError(f"Insufficient credits. Need {amount}, have {current}.")

    new_balance = current - amount

    # Update user balance
    supabase.table("users").update({"credit_balance": new_balance}).eq("id", user_id).execute()

    # Record transaction (negative amount)
    supabase.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": -amount,
        "type": txn_type,
        "description": description,
        "balance_after": new_balance,
    }).execute()

    logger.info(f"Deducted {amount} credits from user {user_id}. New balance: {new_balance}")
    return new_balance


def get_transaction_history(user_id: str, limit: int = 50) -> list[dict]:
    """Fetch recent credit transactions for the user."""
    res = (
        supabase.table("credit_transactions")
        .select("id, amount, type, description, balance_after, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []
