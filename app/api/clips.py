"""
Auto-Clip API — long-form URL → N vertical shorts.

Routes (all require JWT via the router-level dependency in main.py):

    POST   /clips/from-url       start a new clipping job
    GET    /clips/jobs           list jobs for the user
    GET    /clips/jobs/{job_id}  single job + its generated_clips rows
    DELETE /clips/jobs/{job_id}  remove job + every clip it produced
    GET    /clips                list all clips the user owns (flat feed)
    DELETE /clips/{clip_id}      delete a single clip

Credit model:
    Upfront charge = requested_count × CREDIT_COST_AUTOCLIP.
    Refund on terminal failure (status=failed with zero clips produced).
    Partial success keeps the full charge (industry norm — Opus/SendShort
    do the same, and it's much simpler operationally than per-clip billing).

The actual pipeline runs as a FastAPI BackgroundTask — see
`app.services.video_clipper.run_clip_job`.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Annotated, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException

from app.core.auth import get_current_user
from app.core.pricing import CREDIT_COST_AUTOCLIP, COST_AUTOCLIP_PER_CLIP
from app.core.supabase import supabase
from app.models.user import User
from app.services.credit_service import (
    add_credits,
    deduct_credits,
    get_balance,
    is_admin,
)
from app.services.video_clipper import run_clip_job

logger = logging.getLogger(__name__)
router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────
# Input validation helpers
# ──────────────────────────────────────────────────────────────────────────

# Supported source hosts. yt-dlp technically handles a lot more, but we
# whitelist the common ones for now to avoid supporting adversarial URLs
# (internal intranets, file://, etc.).
_ALLOWED_HOSTS = {
    "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
    "vimeo.com", "www.vimeo.com", "player.vimeo.com",
    "tiktok.com", "www.tiktok.com",
    "twitter.com", "x.com", "www.twitter.com",
}

_ALLOWED_ASPECTS = {"9:16", "1:1", "4:5"}
_ALLOWED_SUBTITLE_STYLES = {"karaoke", "block", "off"}


def _validate_source_url(url: str) -> str:
    """Return the URL normalised to an https scheme. Raises 400 otherwise."""
    if not url or len(url) > 2000:
        raise HTTPException(status_code=400, detail="Missing or too-long source URL.")
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400,
            detail="Source URL must start with http:// or https://",
        )
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_HOSTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"We only support YouTube / Vimeo / TikTok / X URLs right now. "
                f"Got host: {host}."
            ),
        )
    # Upgrade http → https silently so yt-dlp doesn't waste a redirect.
    if parsed.scheme == "http":
        url = "https://" + url.split("://", 1)[1]
    return url


# ──────────────────────────────────────────────────────────────────────────
# POST /clips/from-url — start a job
# ──────────────────────────────────────────────────────────────────────────

@router.post("/from-url")
async def create_clip_job(
    current_user: Annotated[User, Depends(get_current_user)],
    background_tasks: BackgroundTasks,
    source_url: str = Form(..., description="YouTube / Vimeo / TikTok / X URL"),
    requested_count: int = Form(5, ge=1, le=10, description="How many clips to produce (1-10)"),
    aspect_ratio: str = Form("9:16", description="'9:16' | '1:1' | '4:5'"),
    subtitle_style: str = Form("karaoke", description="'karaoke' | 'block' | 'off'"),
):
    """
    Queue a clipping job. Returns immediately with a `job_id` the client
    can poll via `/clips/jobs/{job_id}`.

    The heavy lifting (download → transcribe → detect → cut → reframe →
    subs → upload) runs in a BackgroundTask so this call returns fast.
    """
    # Input validation ------------------------------------------------------
    url = _validate_source_url(source_url)
    if aspect_ratio not in _ALLOWED_ASPECTS:
        raise HTTPException(
            status_code=400,
            detail=f"aspect_ratio must be one of {sorted(_ALLOWED_ASPECTS)}",
        )
    if subtitle_style not in _ALLOWED_SUBTITLE_STYLES:
        raise HTTPException(
            status_code=400,
            detail=f"subtitle_style must be one of {sorted(_ALLOWED_SUBTITLE_STYLES)}",
        )

    # Credit check + deduction ---------------------------------------------
    credit_cost = CREDIT_COST_AUTOCLIP * requested_count
    user_id = current_user["id"]
    if not is_admin(current_user):
        balance = get_balance(user_id)
        if balance < credit_cost:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "INSUFFICIENT_CREDITS",
                    "message": f"Auto-Clip needs {credit_cost} credit(s) for "
                               f"{requested_count} clip(s). Current balance: {balance}.",
                },
            )
        deduct_credits(
            user_id, credit_cost, "autoclip",
            f"Auto-Clip job for {requested_count} clip(s) from {url[:80]}",
        )

    # Persist the job row ---------------------------------------------------
    try:
        res = supabase.table("clip_jobs").insert({
            "user_id": user_id,
            "source_url": url,
            "requested_count": requested_count,
            "aspect_ratio": aspect_ratio,
            "subtitle_style": subtitle_style,
            "status": "queued",
            "progress": 0,
        }).execute()
    except Exception as e:
        # Roll the credit charge back — we never started the work.
        if not is_admin(current_user):
            add_credits(user_id, credit_cost, "autoclip_refund",
                        f"Refund — clip_job creation failed ({type(e).__name__})")
        logger.error(f"Failed to insert clip_jobs row: {e}")
        raise HTTPException(status_code=500, detail="Could not create clip job.")

    row = (res.data or [{}])[0]
    job_id = row.get("id")
    if not job_id:
        if not is_admin(current_user):
            add_credits(user_id, credit_cost, "autoclip_refund",
                        "Refund — clip_job insert returned no id")
        raise HTTPException(status_code=500, detail="Could not create clip job.")

    # Kick off the background pipeline -------------------------------------
    # run_clip_job is an async coroutine; FastAPI's BackgroundTasks supports
    # async callables natively. We wrap it with a refund-on-empty-failure
    # so the user isn't charged when the whole job implodes.
    background_tasks.add_task(
        _run_with_refund_guard,
        job_id=str(job_id),
        user_id=str(user_id),
        refund_amount=0 if is_admin(current_user) else credit_cost,
    )

    return {
        "status": "queued",
        "job_id": str(job_id),
        "requested_count": requested_count,
        "aspect_ratio": aspect_ratio,
        "subtitle_style": subtitle_style,
        "credits_charged": credit_cost,
        "estimated_cost_usd": round(COST_AUTOCLIP_PER_CLIP * requested_count, 3),
        "message": "Job queued — poll /clips/jobs/{job_id} for progress.",
    }


async def _run_with_refund_guard(
    job_id: str,
    user_id: str,
    refund_amount: int,
) -> None:
    """
    Wrap run_clip_job so that a TOTAL failure (status=failed + zero clips
    produced) triggers a credit refund. Partial success keeps the charge.
    """
    try:
        await run_clip_job(job_id)
    except Exception as e:
        # run_clip_job already swallows its own exceptions, but belt +
        # braces: if anything leaks, log it.
        logger.error(f"refund_guard caught unexpected exception for {job_id}: {e}")

    if refund_amount <= 0:
        return

    # Inspect the final state.
    try:
        job_res = (
            supabase.table("clip_jobs")
            .select("status")
            .eq("id", job_id)
            .maybe_single()
            .execute()
        )
        status = getattr(job_res, "data", {}).get("status") if job_res else None
        clips_res = (
            supabase.table("generated_clips")
            .select("id")
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        )
        produced_any = bool(clips_res.data)
    except Exception as e:
        logger.warning(f"Could not inspect clip_job {job_id} for refund: {e}")
        return

    if status == "failed" and not produced_any:
        try:
            add_credits(
                user_id, refund_amount, "autoclip_refund",
                f"Refund — clip_job {job_id} failed before producing any clips",
            )
        except Exception as e:
            logger.warning(f"Refund failed for clip_job {job_id}: {e}")


# ──────────────────────────────────────────────────────────────────────────
# GET /clips/jobs — list user's jobs (summary shape, no clip payload)
# ──────────────────────────────────────────────────────────────────────────

@router.get("/jobs")
async def list_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 50,
):
    """List recent clipping jobs for the current user (summary only)."""
    limit = min(max(1, limit), 100)
    res = (
        supabase.table("clip_jobs")
        .select(
            "id, source_url, source_title, source_duration, language, "
            "requested_count, aspect_ratio, subtitle_style, status, progress, "
            "error_message, created_at, updated_at"
        )
        .eq("user_id", current_user["id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"jobs": res.data or []}


# ──────────────────────────────────────────────────────────────────────────
# GET /clips/jobs/{job_id} — single job + its clips
# ──────────────────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}")
async def get_job(
    current_user: Annotated[User, Depends(get_current_user)],
    job_id: str,
):
    """Return the job row and every generated_clips row produced by it."""
    job_res = (
        supabase.table("clip_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", current_user["id"])
        .maybe_single()
        .execute()
    )
    job = getattr(job_res, "data", None) if job_res else None
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    clips_res = (
        supabase.table("generated_clips")
        .select("*")
        .eq("job_id", job_id)
        .order("virality_score", desc=True)
        .execute()
    )

    return {
        "job": job,
        "clips": clips_res.data or [],
    }


# ──────────────────────────────────────────────────────────────────────────
# GET /clips — flat feed across all jobs
# ──────────────────────────────────────────────────────────────────────────

@router.get("")
async def list_clips(
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 50,
):
    """Flat list of the user's clips, most recent first. Handy for a
    gallery view that doesn't care which job a clip came from."""
    limit = min(max(1, limit), 200)
    res = (
        supabase.table("generated_clips")
        .select(
            "id, job_id, title, transcript, virality_score, reason, "
            "aspect_ratio, video_url, thumbnail_url, start_seconds, "
            "end_seconds, created_at"
        )
        .eq("user_id", current_user["id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"clips": res.data or []}


# ──────────────────────────────────────────────────────────────────────────
# DELETE /clips/jobs/{job_id} — remove job + clips + storage objects
# ──────────────────────────────────────────────────────────────────────────

@router.delete("/jobs/{job_id}")
async def delete_job(
    current_user: Annotated[User, Depends(get_current_user)],
    job_id: str,
):
    """Remove a clip_job, every generated_clips row it owns, and every
    object in Supabase Storage those clips reference."""
    # Ownership check first — we never want to leak other users' jobs.
    job_res = (
        supabase.table("clip_jobs")
        .select("id, user_id")
        .eq("id", job_id)
        .eq("user_id", current_user["id"])
        .maybe_single()
        .execute()
    )
    if not job_res or not getattr(job_res, "data", None):
        raise HTTPException(status_code=404, detail="Job not found.")

    # Gather storage paths so we can delete them from the bucket too.
    clips_res = (
        supabase.table("generated_clips")
        .select("storage_path, thumbnail_path")
        .eq("job_id", job_id)
        .eq("user_id", current_user["id"])
        .execute()
    )
    paths: list[str] = []
    for c in clips_res.data or []:
        if c.get("storage_path"):
            paths.append(c["storage_path"])
        if c.get("thumbnail_path"):
            paths.append(c["thumbnail_path"])

    if paths:
        # Supabase-py accepts a list of paths to remove in one call.
        try:
            supabase.storage.from_("avatars").remove(paths)
        except Exception as e:
            # Don't fail the delete just because storage cleanup errored —
            # orphaned files are cheaper than half-deleted DB state.
            logger.warning(f"Storage cleanup failed for job {job_id}: {e}")

    # DB cascade does the clips — but we delete both for symmetry + safety
    # in case someone later disables ON DELETE CASCADE.
    supabase.table("generated_clips").delete().eq("job_id", job_id).eq(
        "user_id", current_user["id"]
    ).execute()
    supabase.table("clip_jobs").delete().eq("id", job_id).eq(
        "user_id", current_user["id"]
    ).execute()

    return {"deleted": True, "job_id": job_id, "clips_removed": len(clips_res.data or [])}


# ──────────────────────────────────────────────────────────────────────────
# DELETE /clips/{clip_id} — single-clip delete (storage + row)
# ──────────────────────────────────────────────────────────────────────────

@router.delete("/{clip_id}")
async def delete_clip(
    current_user: Annotated[User, Depends(get_current_user)],
    clip_id: str,
):
    res = (
        supabase.table("generated_clips")
        .select("id, storage_path, thumbnail_path, user_id")
        .eq("id", clip_id)
        .eq("user_id", current_user["id"])
        .maybe_single()
        .execute()
    )
    if not res or not getattr(res, "data", None):
        raise HTTPException(status_code=404, detail="Clip not found.")

    paths = [p for p in (res.data.get("storage_path"), res.data.get("thumbnail_path")) if p]
    if paths:
        try:
            supabase.storage.from_("avatars").remove(paths)
        except Exception as e:
            logger.warning(f"Storage cleanup failed for clip {clip_id}: {e}")

    supabase.table("generated_clips").delete().eq("id", clip_id).eq(
        "user_id", current_user["id"]
    ).execute()

    return {"deleted": True, "clip_id": clip_id}
