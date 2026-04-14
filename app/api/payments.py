"""
Stripe payment endpoints: Checkout Session creation + webhook handler.
Supports multi-tier pricing (creator / studio).
"""
import logging
from typing import Annotated, Literal

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.pricing import PRICING_TIERS, DEFAULT_TIER, get_tier, get_available_tiers
from app.models.user import User
from app.services.credit_service import add_credits, check_duplicate_session

logger = logging.getLogger(__name__)
router = APIRouter()

# Configure Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY

# Map tier slugs to the corresponding Settings attribute for the Stripe Price ID
_TIER_PRICE_ID_MAP = {
    "creator": settings.STRIPE_PRICE_ID_CREATOR,
    "studio": settings.STRIPE_PRICE_ID_STUDIO,
}


class CheckoutRequest(BaseModel):
    tier: Literal["creator", "studio"] = Field(
        default=DEFAULT_TIER,
        description="Pricing tier to purchase",
    )


@router.get("/tiers")
async def list_tiers():
    """Return available pricing tiers for the frontend."""
    return {"tiers": get_available_tiers()}


@router.post("/create-checkout-session")
async def create_checkout_session(
    current_user: Annotated[User, Depends(get_current_user)],
    body: CheckoutRequest = CheckoutRequest(),
):
    """Create a Stripe Checkout Session for the selected tier."""

    # Resolve tier info
    try:
        tier_info = get_tier(body.tier)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Get the Stripe Price ID for this tier
    stripe_price_id = _TIER_PRICE_ID_MAP.get(body.tier, "")
    if not stripe_price_id:
        raise HTTPException(
            status_code=500,
            detail=f"Stripe price not configured for tier '{body.tier}'",
        )

    credits = tier_info["credits"]

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": stripe_price_id,
                "quantity": 1,
            }],
            mode="payment",
            customer_email=current_user["email"],
            metadata={
                "user_id": current_user["id"],
                "credits": str(credits),
                "tier": body.tier,
            },
            success_url="https://saa-s-frontend-six.vercel.app/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://saa-s-frontend-six.vercel.app/dashboard?payment=cancel",
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
        tier = metadata.get("tier", DEFAULT_TIER)
        credits = int(metadata.get("credits", PRICING_TIERS[DEFAULT_TIER]["credits"]))

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
            description=f"Purchased {credits} credits ({tier} tier) via Stripe",
            stripe_session_id=session_id,
        )
        logger.info(f"Webhook: Added {credits} credits ({tier}) to user {user_id}. Balance: {new_balance}")
        return {"status": "success", "credits_added": credits, "new_balance": new_balance}

    # Acknowledge other event types
    return {"status": "ignored", "type": event.get("type")}
