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
from app.api.thumbnail import router as thumbnail_router
from app.api.ads import router as ads_router
from app.api.clips import router as clips_router
from app.api.ai_videos import router as ai_videos_router
from app.api.showcase import router as showcase_router
from app.api.spyder import router as spyder_router
from app.api.team import router as team_router
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

# Public: landing-page showcase (no JWT — only surfaces admin content)
app.include_router(showcase_router, prefix="/showcase", tags=["Showcase (public)"])

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
app.include_router(
    thumbnail_router,
    prefix="/thumbnail",
    tags=["Thumbnail Generation"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    ads_router,
    prefix="/ads",
    tags=["Ads Generation"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    clips_router,
    prefix="/clips",
    tags=["Auto-Clip (URL → shorts)"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    ai_videos_router,
    prefix="/ai-videos",
    tags=["AI Video Generator (phrase → short)"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    spyder_router,
    prefix="/trackify",
    tags=["Trackify (competitor tracking)"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    team_router,
    prefix="/team",
    tags=["Team (collaboration + tasks)"],
    dependencies=[Depends(get_current_user)],
)

# ── Startup: schema migrations (auto) + admin bootstrap ──
@app.on_event("startup")
async def startup_migration():
    """
    Runs in order, before the app starts serving traffic:

    1. Schema auto-migrations — executes any pending SQL files from
       `supabase/migrations/` so deploying a new feature no longer
       requires opening the Supabase SQL Editor by hand. See
       app/core/migrations.py for the full contract.
    2. Admin bootstrap — keeps the founder account set up with admin
       role + a floor of credits so we can log in even after a fresh
       deploy.
    """
    import logging
    logger = logging.getLogger("startup")

    # 1. Schema migrations — never swallow: a bad schema is worse than
    #    a crashed boot because it produces cryptic runtime errors later.
    try:
        from app.core.migrations import run_pending_migrations
        run_pending_migrations()
    except Exception as e:
        logger.error(f"Auto-migrations failed: {e}")
        raise  # crash boot rather than serve on a half-migrated schema

    # 2. Zombie reaper — fire-and-forget background task that periodically
    #    kills ai_video_jobs that have been stuck in a non-terminal status
    #    for > 30 min (usually the worker thread died in a container
    #    restart). Marks them failed + refunds the user. Without this,
    #    stuck jobs would live in "animating 70%" forever in the UI.
    try:
        import asyncio
        from app.services.ai_video_refund import zombie_reaper_loop
        asyncio.create_task(zombie_reaper_loop())
        logger.info("Zombie reaper registered (runs every 10 min)")
    except Exception as e:
        logger.warning(f"Zombie reaper registration failed: {e}")

    # 3. Admin bootstrap — soft-fail: we don't want a Supabase hiccup to
    #    prevent the whole API from booting.
    try:
        from app.core.supabase import supabase
        from app.services.credit_service import add_credits

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
        logger.warning(f"Admin bootstrap skipped: {e}")


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