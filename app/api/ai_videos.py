"""
AI Video Generator API — turn a phrase into a rendered vertical short.

Routes (JWT-protected via main.py's router dependency):

    POST   /ai-videos/generate        start a new generation job
    GET    /ai-videos                 list completed jobs (summary)
    GET    /ai-videos/jobs/{job_id}   job details + per-scene progress
    DELETE /ai-videos/jobs/{job_id}   remove job + scenes + storage
    GET    /ai-videos/voices          available ElevenLabs voices (thin passthrough)

Credit model:
    Priced by (mode × duration) via `get_ai_video_credit_cost`. Charged
    upfront, refunded if the job fails before producing a final video.
"""
from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.pricing import (
    get_ai_video_cost_usd,
    get_ai_video_credit_cost,
)
from app.core.supabase import supabase
from app.models.user import User
from app.services.ai_video_generator import run_ai_video_job
from app.services.credit_service import (
    add_credits,
    deduct_credits,
    get_balance,
    is_admin,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ──────────────────────────────────────────────────────────────────────────
# Validation constants
# ──────────────────────────────────────────────────────────────────────────

_ALLOWED_MODES = {"slideshow", "motion"}
_ALLOWED_ASPECTS = {"9:16", "1:1", "16:9", "4:5"}
_ALLOWED_SUB_STYLES = {"karaoke", "block", "off"}
_MIN_DURATION = 10
_MAX_DURATION = 90
_MAX_PROMPT_LEN = 2000


# ──────────────────────────────────────────────────────────────────────────
# POST /ai-videos/generate
# ──────────────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_ai_video(
    current_user: Annotated[User, Depends(get_current_user)],
    background_tasks: BackgroundTasks,
    prompt: str = Form(..., description="The one-liner describing the video you want"),
    mode: str = Form("slideshow", description="'slideshow' (cheap, Ken Burns) | 'motion' (Kling image→video)"),
    duration_seconds: int = Form(30, ge=_MIN_DURATION, le=_MAX_DURATION),
    aspect_ratio: str = Form("9:16"),
    language: str = Form("auto", description="'auto' or ISO-639-1 code"),
    tone: Optional[str] = Form(None, description="Optional tone override (energetic, storytelling, etc.)"),
    voice_enabled: bool = Form(True),
    voice_id: Optional[str] = Form(None, description="ElevenLabs voice id (defaults to a multilingual voice)"),
    subtitle_style: str = Form("karaoke"),
):
    """
    Queue an AI-video generation job. Returns `{ job_id, status: "queued", ... }`.
    The client polls `/ai-videos/jobs/{job_id}` for progress + artefacts.
    """
    # ── Validation ─────────────────────────────────────────────────────
    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")
    if len(prompt) > _MAX_PROMPT_LEN:
        raise HTTPException(status_code=400, detail=f"Prompt too long (> {_MAX_PROMPT_LEN} chars).")
    if mode not in _ALLOWED_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {sorted(_ALLOWED_MODES)}")
    if aspect_ratio not in _ALLOWED_ASPECTS:
        raise HTTPException(status_code=400, detail=f"aspect_ratio must be one of {sorted(_ALLOWED_ASPECTS)}")
    if subtitle_style not in _ALLOWED_SUB_STYLES:
        raise HTTPException(status_code=400, detail=f"subtitle_style must be one of {sorted(_ALLOWED_SUB_STYLES)}")

    # Sanitise user-supplied tone / voice_id (they end up in DB + LLM prompts).
    tone = (tone or "").strip()[:80] or None
    voice_id = (voice_id or "").strip()[:80] or None

    # ── Credit charge ──────────────────────────────────────────────────
    user_id = current_user["id"]
    credit_cost = get_ai_video_credit_cost(mode, duration_seconds)

    if not is_admin(current_user):
        balance = get_balance(user_id)
        if balance < credit_cost:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "INSUFFICIENT_CREDITS",
                    "message": f"AI Video ({mode}, {duration_seconds}s) costs {credit_cost} credit(s). "
                               f"Current balance: {balance}.",
                },
            )
        deduct_credits(
            user_id, credit_cost,
            f"ai_video_{mode}",
            f"AI Video {mode} @ {duration_seconds}s — “{prompt[:80]}”",
        )

    # ── Persist the job row ────────────────────────────────────────────
    try:
        res = supabase.table("ai_video_jobs").insert({
            "user_id": user_id,
            "prompt": prompt,
            "mode": mode,
            "duration_seconds": duration_seconds,
            "aspect_ratio": aspect_ratio,
            "language": language,
            "voice_enabled": voice_enabled,
            "voice_id": voice_id,
            "subtitle_style": subtitle_style,
            "tone": tone,
            "status": "queued",
            "progress": 0,
        }).execute()
    except Exception as e:
        if not is_admin(current_user):
            add_credits(user_id, credit_cost, "ai_video_refund",
                        f"Refund — ai_video_job creation failed ({type(e).__name__})")
        logger.error(f"Failed to insert ai_video_jobs row: {e}")
        raise HTTPException(status_code=500, detail="Could not create AI video job.")

    row = (res.data or [{}])[0]
    job_id = row.get("id")
    if not job_id:
        if not is_admin(current_user):
            add_credits(user_id, credit_cost, "ai_video_refund",
                        "Refund — ai_video_job insert returned no id")
        raise HTTPException(status_code=500, detail="Could not create AI video job.")

    # ── Background pipeline ────────────────────────────────────────────
    background_tasks.add_task(
        _run_with_refund_guard,
        job_id=str(job_id),
        user_id=str(user_id),
        refund_amount=0 if is_admin(current_user) else credit_cost,
    )

    return {
        "status": "queued",
        "job_id": str(job_id),
        "mode": mode,
        "duration_seconds": duration_seconds,
        "aspect_ratio": aspect_ratio,
        "credits_charged": credit_cost,
        "estimated_cost_usd": get_ai_video_cost_usd(mode, duration_seconds),
        "message": "Job queued — poll /ai-videos/jobs/{job_id} for progress.",
    }


async def _run_with_refund_guard(
    job_id: str,
    user_id: str,
    refund_amount: int,
) -> None:
    """
    Wrapper around run_ai_video_job that refunds credits if the job fails
    before producing a final video_url. Partial success (e.g. one scene
    failed but the final rendered anyway) keeps the full charge.
    """
    try:
        await run_ai_video_job(job_id)
    except Exception as e:
        logger.error(f"ai_video refund_guard caught exception for {job_id}: {e}")

    if refund_amount <= 0:
        return

    try:
        res = (
            supabase.table("ai_video_jobs")
            .select("status, video_url")
            .eq("id", job_id)
            .maybe_single()
            .execute()
        )
        job = getattr(res, "data", None) if res else None
        should_refund = (
            bool(job)
            and job.get("status") == "failed"
            and not job.get("video_url")
        )
    except Exception as e:
        logger.warning(f"Could not inspect ai_video_job {job_id} for refund: {e}")
        return

    if should_refund:
        try:
            add_credits(
                user_id, refund_amount, "ai_video_refund",
                f"Refund — ai_video_job {job_id} failed before producing a final video",
            )
        except Exception as e:
            logger.warning(f"Refund failed for ai_video_job {job_id}: {e}")


# ──────────────────────────────────────────────────────────────────────────
# GET /ai-videos — summary list of user's jobs
# ──────────────────────────────────────────────────────────────────────────

@router.get("")
async def list_ai_video_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 50,
):
    limit = min(max(1, limit), 100)
    res = (
        supabase.table("ai_video_jobs")
        .select(
            "id, prompt, mode, duration_seconds, aspect_ratio, language, "
            "voice_enabled, subtitle_style, tone, status, progress, "
            "hook, detected_lang, video_url, thumbnail_url, "
            "error_message, created_at, updated_at"
        )
        .eq("user_id", current_user["id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"jobs": res.data or []}


# ──────────────────────────────────────────────────────────────────────────
# GET /ai-videos/jobs/{job_id}
# ──────────────────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}")
async def get_ai_video_job(
    current_user: Annotated[User, Depends(get_current_user)],
    job_id: str,
):
    job_res = (
        supabase.table("ai_video_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", current_user["id"])
        .maybe_single()
        .execute()
    )
    job = getattr(job_res, "data", None) if job_res else None
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    scenes_res = (
        supabase.table("ai_video_scenes")
        .select("*")
        .eq("job_id", job_id)
        .order("scene_index")
        .execute()
    )

    return {
        "job": job,
        "scenes": scenes_res.data or [],
    }


# ──────────────────────────────────────────────────────────────────────────
# DELETE /ai-videos/jobs/{job_id}
# ──────────────────────────────────────────────────────────────────────────

@router.delete("/jobs/{job_id}")
async def delete_ai_video_job(
    current_user: Annotated[User, Depends(get_current_user)],
    job_id: str,
):
    """Remove the job row, every scene row, and every object in storage
    the job produced."""
    job_res = (
        supabase.table("ai_video_jobs")
        .select("id, user_id, storage_path, thumbnail_path")
        .eq("id", job_id)
        .eq("user_id", current_user["id"])
        .maybe_single()
        .execute()
    )
    if not job_res or not getattr(job_res, "data", None):
        raise HTTPException(status_code=404, detail="Job not found.")

    # Gather storage paths from the job row + every scene row.
    paths: list[str] = []
    job_data = job_res.data
    if job_data.get("storage_path"):
        paths.append(job_data["storage_path"])
    if job_data.get("thumbnail_path"):
        paths.append(job_data["thumbnail_path"])

    scenes_res = (
        supabase.table("ai_video_scenes")
        .select("image_path, clip_path")
        .eq("job_id", job_id)
        .eq("user_id", current_user["id"])
        .execute()
    )
    for s in scenes_res.data or []:
        if s.get("image_path"):
            paths.append(s["image_path"])
        if s.get("clip_path"):
            paths.append(s["clip_path"])

    if paths:
        try:
            supabase.storage.from_("avatars").remove(paths)
        except Exception as e:
            logger.warning(f"Storage cleanup failed for ai_video_job {job_id}: {e}")

    # ON DELETE CASCADE removes the scenes automatically, but we delete
    # explicitly for belt-and-braces.
    supabase.table("ai_video_scenes").delete().eq("job_id", job_id).eq(
        "user_id", current_user["id"]
    ).execute()
    supabase.table("ai_video_jobs").delete().eq("id", job_id).eq(
        "user_id", current_user["id"]
    ).execute()

    return {"deleted": True, "job_id": job_id, "scenes_removed": len(scenes_res.data or [])}


# ──────────────────────────────────────────────────────────────────────────
# GET /ai-videos/voices — surface the ElevenLabs voice catalogue
# ──────────────────────────────────────────────────────────────────────────

@router.get("/voices")
async def list_voices():
    """
    Proxy ElevenLabs' /v1/voices so the frontend can render a picker.
    Returns a degraded static list when the key is missing so the UI has
    SOMETHING to show during development.
    """
    if not settings.ELEVENLABS_API_KEY:
        return {
            "configured": False,
            "voices": [
                {"voice_id": settings.ELEVENLABS_DEFAULT_VOICE, "name": "Rachel (default)", "labels": {"language": "multi"}},
            ],
            "message": "ElevenLabs not configured — returning default voice only.",
        }

    import httpx
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            r = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning(f"Failed to fetch ElevenLabs voices: {e}")
        return {
            "configured": True,
            "voices": [
                {"voice_id": settings.ELEVENLABS_DEFAULT_VOICE, "name": "Rachel (default)", "labels": {}},
            ],
            "message": f"Could not reach ElevenLabs ({type(e).__name__}).",
        }

    # Trim the payload to what the frontend actually needs.
    voices = [
        {
            "voice_id": v.get("voice_id"),
            "name": v.get("name"),
            "preview_url": v.get("preview_url"),
            "labels": v.get("labels") or {},
            "category": v.get("category"),
        }
        for v in (data.get("voices") or [])
    ]
    return {"configured": True, "voices": voices}
