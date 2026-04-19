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
from app.services.ai_video_refund import (
    mark_job_failed,
    refund_job_credits,
)
from app.services.credit_service import (
    add_credits,
    deduct_credits,
    get_balance,
    is_admin,
)
from app.services.niche_registry import get_niche, list_niches

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
    niche_slug: Optional[str] = Form(
        None,
        description=(
            "Optional: apply a niche preset's visual style + narrator voice to the "
            "generation. The user-supplied duration / mode / voice / subtitle "
            "options from the form still take precedence — the niche only injects "
            "its style_instructions + visual_style into the LLM prompts and image "
            "generator. See /ai-videos/niches for the catalogue."
        ),
    ),
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

    # Resolve the niche (optional) — this gives us style_instructions +
    # visual_style to inject into the pipeline. The niche never overrides
    # user-visible form controls; the user keeps full control over mode /
    # duration / aspect / voice / subs. Only the hidden style layers come
    # from the preset.
    niche_slug = (niche_slug or "").strip() or None
    resolved_niche = None
    if niche_slug:
        resolved_niche = get_niche(niche_slug)
        if resolved_niche is None:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown niche '{niche_slug}'. See /ai-videos/niches.",
            )
        # If the form didn't supply a tone, default to the niche's tone so
        # the script generator still gets the niche voice.
        if not tone and resolved_niche.tone:
            tone = resolved_niche.tone[:80]

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
    job_payload = {
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
    }
    # Snapshot the niche style into the row so the pipeline sees it and so
    # past jobs stay reproducible even if the niche definition evolves
    # later. Same snapshot approach /generate-from-niche uses.
    if resolved_niche is not None:
        job_payload["niche_slug"] = resolved_niche.slug
        job_payload["style_instructions"] = resolved_niche.style_instructions or None
        job_payload["visual_style"] = resolved_niche.visual_style or None

    try:
        res = supabase.table("ai_video_jobs").insert(job_payload).execute()
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


# ──────────────────────────────────────────────────────────────────────────
# GET /ai-videos/niches — list the preset channel identities
# ──────────────────────────────────────────────────────────────────────────

@router.get("/niches")
async def list_video_niches():
    """
    Return every registered niche. Used by the frontend to render the
    one-click generation cards ("Generate like @humain.penseur",
    "Generate like …"). The serialized shape excludes prompt internals —
    see `Niche.serialize()` for what's public.
    """
    return {"niches": [n.serialize() for n in list_niches()]}


@router.get("/niches/{slug}/topic-ideas")
async def get_niche_topic_ideas(
    current_user: Annotated[User, Depends(get_current_user)],
    slug: str,
    count: int = 6,
):
    """
    Return `count` fresh topic ideas for a given niche, ranked by expected
    virality / watch-through. Used by the "Suggest topics" action on the
    dashboard so the user can pick a title before kicking off the full
    (expensive) generation pipeline.

    This is a cheap LLM call — we price it at 0 credits intentionally so
    users browse freely.
    """
    niche = get_niche(slug)
    if not niche:
        raise HTTPException(status_code=404, detail=f"Unknown niche '{slug}'.")

    count = max(1, min(12, count))
    try:
        topics = await niche.suggest_topics(count=count)
    except Exception as e:
        logger.warning(f"Niche {slug} topic suggestion call failed: {e}")
        topics = list(niche.fallback_topics)[:count]

    return {
        "niche_slug": niche.slug,
        "niche_name": niche.name,
        "topics": topics,
    }


# ──────────────────────────────────────────────────────────────────────────
# POST /ai-videos/generate-from-niche — one-click niche generation
# ──────────────────────────────────────────────────────────────────────────

@router.post("/generate-from-niche")
async def generate_from_niche(
    current_user: Annotated[User, Depends(get_current_user)],
    background_tasks: BackgroundTasks,
    niche_slug: str = Form(..., description="Slug from /ai-videos/niches"),
    topic: Optional[str] = Form(
        None,
        description="Optional user-provided topic. If omitted, the niche "
                    "generates a fresh topic via its topic_generation_prompt.",
    ),
    duration_seconds: Optional[int] = Form(
        None,
        description="Override the niche default duration.",
    ),
    mode: Optional[str] = Form(
        None,
        description="Override the niche default mode ('slideshow' | 'motion').",
    ),
    voice_id: Optional[str] = Form(
        None,
        description="Override the niche default voice (ElevenLabs voice_id).",
    ),
    voice_enabled: Optional[bool] = Form(
        None,
        description="Override whether the video has voice-over.",
    ),
    subtitle_style: Optional[str] = Form(
        None,
        description="Override subtitle style: 'karaoke' | 'block' | 'off'.",
    ),
):
    """
    One-click path: given a niche slug, the backend picks a topic in the
    niche's voice (or uses a user override), locks in the niche style
    parameters, charges credits, and fires the standard AI-video
    pipeline.

    This is what powers the "Generate a new @humain.penseur video" button
    on the dashboard.
    """
    # ── Load niche ─────────────────────────────────────────────────────
    niche = get_niche(niche_slug)
    if not niche:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown niche '{niche_slug}'. See /ai-videos/niches for the catalogue.",
        )

    # Resolve effective settings — user overrides win over niche defaults.
    effective_duration = duration_seconds or niche.default_duration_seconds
    if not (_MIN_DURATION <= effective_duration <= _MAX_DURATION):
        raise HTTPException(
            status_code=400,
            detail=f"duration_seconds must be between {_MIN_DURATION} and {_MAX_DURATION}.",
        )
    effective_mode = (mode or niche.default_mode).strip().lower()
    if effective_mode not in _ALLOWED_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"mode must be one of {sorted(_ALLOWED_MODES)}",
        )

    # Voice + subtitle overrides — user-picked values win over niche defaults.
    effective_voice_id = (voice_id or niche.default_voice_id or "").strip() or None
    effective_voice_enabled = (
        voice_enabled if voice_enabled is not None else niche.default_voice_enabled
    )
    effective_subtitle_style = (
        (subtitle_style or niche.default_subtitle_style).strip().lower()
    )
    if effective_subtitle_style not in _ALLOWED_SUB_STYLES:
        raise HTTPException(
            status_code=400,
            detail=f"subtitle_style must be one of {sorted(_ALLOWED_SUB_STYLES)}",
        )

    # ── Pick the topic ─────────────────────────────────────────────────
    # Three layers: explicit user override > Gemini-fresh topic > niche fallback.
    user_topic = (topic or "").strip()
    if user_topic:
        if len(user_topic) > _MAX_PROMPT_LEN:
            raise HTTPException(status_code=400, detail=f"topic too long (> {_MAX_PROMPT_LEN} chars).")
        effective_prompt = user_topic
    else:
        try:
            effective_prompt = await niche.pick_topic()
        except Exception as e:
            logger.error(f"Niche {niche.slug} topic generation failed: {e}")
            raise HTTPException(
                status_code=502,
                detail="Could not auto-pick a topic for this niche. Try again or supply one manually.",
            )

    # ── Credit check + deduction ───────────────────────────────────────
    user_id = current_user["id"]
    credit_cost = get_ai_video_credit_cost(effective_mode, effective_duration)

    if not is_admin(current_user):
        balance = get_balance(user_id)
        if balance < credit_cost:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "INSUFFICIENT_CREDITS",
                    "message": (
                        f"{niche.name} video ({effective_mode}, "
                        f"{effective_duration}s) costs {credit_cost} credit(s). "
                        f"Current balance: {balance}."
                    ),
                },
            )
        deduct_credits(
            user_id, credit_cost,
            f"ai_video_{effective_mode}",
            f"{niche.name} — “{effective_prompt[:80]}”",
        )

    # ── Persist the job row ────────────────────────────────────────────
    # Snapshot the niche style into the row so future edits to the
    # niche_registry.py definitions don't alter past generations.
    try:
        res = supabase.table("ai_video_jobs").insert({
            "user_id": user_id,
            "prompt": effective_prompt,
            "mode": effective_mode,
            "duration_seconds": effective_duration,
            "aspect_ratio": niche.default_aspect_ratio,
            "language": niche.language,
            "voice_enabled": effective_voice_enabled,
            "voice_id": effective_voice_id,
            "subtitle_style": effective_subtitle_style,
            "tone": niche.tone or None,
            "niche_slug": niche.slug,
            "style_instructions": niche.style_instructions or None,
            "visual_style": niche.visual_style or None,
            "status": "queued",
            "progress": 0,
        }).execute()
    except Exception as e:
        if not is_admin(current_user):
            add_credits(user_id, credit_cost, "ai_video_refund",
                        f"Refund — niche job creation failed ({type(e).__name__})")
        logger.error(f"Failed to insert niche ai_video_jobs row: {e}")
        raise HTTPException(status_code=500, detail="Could not create niche video job.")

    row = (res.data or [{}])[0]
    job_id = row.get("id")
    if not job_id:
        if not is_admin(current_user):
            add_credits(user_id, credit_cost, "ai_video_refund",
                        "Refund — niche job insert returned no id")
        raise HTTPException(status_code=500, detail="Could not create niche video job.")

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
        "niche_slug": niche.slug,
        "niche_name": niche.name,
        "prompt": effective_prompt,
        "mode": effective_mode,
        "duration_seconds": effective_duration,
        "aspect_ratio": niche.default_aspect_ratio,
        "language": niche.language,
        "credits_charged": credit_cost,
        "estimated_cost_usd": get_ai_video_cost_usd(effective_mode, effective_duration),
        "message": f"Queued a {niche.name} video. Poll /ai-videos/jobs/{{job_id}} for progress.",
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

    Delegates the actual refund to `refund_job_credits` so the
    `credit_refunded` flag is honoured — prevents double-refund if the
    user also hits the /cancel endpoint or the zombie reaper fires.
    """
    try:
        await run_ai_video_job(job_id)
    except Exception as e:
        logger.error(f"ai_video refund_guard caught exception for {job_id}: {e}")

    if refund_amount <= 0:
        return

    # Only refund when the job actually failed to produce output. Partial
    # success (some scenes failed but the final video rendered) keeps the
    # charge — industry norm.
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
        refund_job_credits(
            job_id,
            reason=f"Auto-refund — ai_video_job {job_id} failed before producing a final video",
            txn_type="ai_video_refund",
        )


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
            "hook, detected_lang, video_url, thumbnail_url, niche_slug, "
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
# POST /ai-videos/jobs/{job_id}/cancel — user-initiated kill of a running
# or zombie job, refunds credits if they haven't been returned already.
# ──────────────────────────────────────────────────────────────────────────

@router.post("/jobs/{job_id}/cancel")
async def cancel_ai_video_job(
    current_user: Annotated[User, Depends(get_current_user)],
    job_id: str,
):
    """
    Cancel an in-progress or zombie AI-video job, marking it failed and
    refunding the user's credits. Completed jobs cannot be cancelled
    (use DELETE instead to remove them).

    This is the user's escape hatch when:
      - A Kling prediction hangs past its per-scene timeout and the
        orchestrator hasn't noticed yet
      - The container was restarted mid-pipeline, leaving the job
        stuck in a non-terminal status forever (a "zombie")
      - The user simply changed their mind

    Note: we CANNOT truly interrupt the background worker thread — if
    it's still running it will eventually finish (or time out) and
    write to the job row. Because we've already flipped status=failed
    and credit_refunded=true, any late write will:
      - try to mark status=completed → we accept that, the user sees a
        completed video they also got refunded for. Rare edge case;
        treat as a gift to the user.
      - try to refund → blocked by the credit_refunded CAS.
    """
    # Load + ownership check.
    res = (
        supabase.table("ai_video_jobs")
        .select("id, user_id, status, video_url")
        .eq("id", job_id)
        .eq("user_id", current_user["id"])
        .maybe_single()
        .execute()
    )
    if not res or not getattr(res, "data", None):
        raise HTTPException(status_code=404, detail="Job not found.")

    job = res.data
    if job.get("status") == "completed":
        raise HTTPException(
            status_code=400,
            detail="This job is already completed. Use DELETE to remove it instead.",
        )

    # Mark failed + refund — both are guarded against double-execution.
    marked = mark_job_failed(job_id, "Cancelled by user.")
    refunded = refund_job_credits(
        job_id,
        reason=f"User-initiated cancel of ai_video_job {job_id}",
        txn_type="ai_video_cancel_refund",
    )

    return {
        "cancelled": True,
        "job_id": job_id,
        "status_changed": marked,
        "credits_refunded": refunded,
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
