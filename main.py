import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.api.avatar import router as avatar_router
from app.api.video import router as video_router
from app.api.auth import router as auth_router
from app.api.payments import router as payments_router
from app.api.credits import router as credits_router
from app.core.auth import get_current_user

app = FastAPI(
    title="AI Avatar Generator",
    description="An API to generate futuristic digital avatars using Gemini 3 Pro Image (Nano Banana Pro)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "https://saa-s-frontend-six.vercel.app", "https://horpen.ai", "https://www.horpen.ai"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Generation-Cost", "X-Generation-Engine", "X-Generation-Type"],
)

# Auth: signup/login (no JWT required)
app.include_router(auth_router, prefix="/auth", tags=["Auth"])

# Payments: checkout (JWT) + webhook (Stripe signature, no JWT)
app.include_router(payments_router, prefix="/payments", tags=["Payments"])

# Credits: balance + history (JWT required)
app.include_router(
    credits_router,
    prefix="/credits",
    tags=["Credits"],
    dependencies=[Depends(get_current_user)],
)

# Avatar and video: require JWT
app.include_router(
    avatar_router,
    prefix="/avatar",
    tags=["Avatar Generation"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    video_router,
    prefix="/video",
    tags=["Video Generation"],
    dependencies=[Depends(get_current_user)],
)

# ── One-time startup migration ──
@app.on_event("startup")
async def startup_migration():
    """Ensure admin account is set up properly."""
    import logging
    logger = logging.getLogger("startup")
    try:
        from app.core.supabase import supabase
        from app.services.credit_service import add_credits, get_balance

        ADMIN_EMAIL = "anskoju@gmail.com"
        res = supabase.table("users").select("id, email, role, credit_balance").eq("email", ADMIN_EMAIL).limit(1).execute()
        if res.data and len(res.data) > 0:
            user = res.data[0]
            user_id = str(user["id"])
            # Set admin role if not already
            if user.get("role") != "administrator":
                supabase.table("users").update({"role": "administrator"}).eq("id", user_id).execute()
                logger.info(f"Set {ADMIN_EMAIL} as administrator")
            # Add 120 credits if balance is low
            balance = user.get("credit_balance", 0) or 0
            if balance < 50:
                add_credits(user_id, 120, "admin_grant", "Startup admin credit grant")
                logger.info(f"Added 120 credits to {ADMIN_EMAIL}. Old balance: {balance}")
    except Exception as e:
        logger.warning(f"Startup migration skipped: {e}")


# 3. Health Check / Root Endpoint
@app.get("/", tags=["System"])
async def root():
    return {
        "message": "AI Avatar API is Online",
        "status": "Ready",
        "model_engine": "Gemini 3 Pro Image (Nano Banana Pro)"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)