"""
Stripe payment endpoints: Checkout Session creation + webhook handler.
"""
import logging
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.pricing import CREDITS_PER_PURCHASE
from app.models.user import User
from app.services.credit_service import add_credits, check_duplicate_session

logger = logging.getLogger(__name__)
router = APIRouter()

# Configure Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


# Minimum credits to purchase (must stay above Stripe's $0.50 minimum)
MIN_CREDITS = 5


class CheckoutRequest(BaseModel):
    quantity: int = Field(default=100, ge=MIN_CREDITS, description="Number of credits to purchase")


@router.post("/create-checkout-session")
async def create_checkout_session(
    current_user: Annotated[User, Depends(get_current_user)],
    body: CheckoutRequest = CheckoutRequest(),
):
    """Create a Stripe Checkout Session. Quantity = number of credits (1 unit = 1 credit)."""
    if not settings.STRIPE_PRICE_ID:
        raise HTTPException(status_code=500, detail="Stripe price not configured")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": settings.STRIPE_PRICE_ID,
                "quantity": body.quantity,
            }],
            mode="payment",
            customer_email=current_user["email"],
            metadata={
                "user_id": current_user["id"],
                "credits": str(body.quantity),
            },
            success_url="https://saa-s-frontend-six.vercel.app/?payment=success&session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://saa-s-frontend-six.vercel.app/?payment=cancel",
        )
        return {"url": session.url, "session_id": session.id}

    except stripe.StripeError as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Handle Stripe webhook events. Verifies signature, processes checkout.session.completed
    to add credits to the user's account. Idempotent via stripe_session_id check.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    # Verify webhook signature
    if settings.STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid signature")
    else:
        # Dev mode: parse without signature verification
        import json
        event = json.loads(payload)
        logger.warning("STRIPE_WEBHOOK_SECRET not set — skipping signature verification (dev mode)")

    # Handle checkout.session.completed
    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        session_id = session["id"]
        metadata = session.get("metadata", {})
        user_id = metadata.get("user_id")
        credits = int(metadata.get("credits", CREDITS_PER_PURCHASE))

        if not user_id:
            logger.error(f"Webhook: No user_id in session metadata for {session_id}")
            return {"status": "error", "message": "Missing user_id in metadata"}

        # Idempotency: skip if already processed
        if check_duplicate_session(session_id):
            logger.info(f"Webhook: Session {session_id} already processed, skipping")
            return {"status": "already_processed"}

        # Add credits
        new_balance = add_credits(
            user_id=user_id,
            amount=credits,
            txn_type="purchase",
            description=f"Purchased {credits} credits via Stripe",
            stripe_session_id=session_id,
        )
        logger.info(f"Webhook: Added {credits} credits to user {user_id}. Balance: {new_balance}")
        return {"status": "success", "credits_added": credits, "new_balance": new_balance}

    # Acknowledge other event types
    return {"status": "ignored", "type": event.get("type")}
