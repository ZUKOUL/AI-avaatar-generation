"""
Auto-Clip orchestrator.

Coordinates the full "long-form URL → N vertical shorts" pipeline and
keeps the `clip_jobs` + `generated_clips` tables in sync so the frontend
can poll progress and render results as they land.

High-level flow:
    1. POST /clips/from-url creates a `clip_jobs` row in status=queued
       and schedules `run_clip_job(job_id)` as a FastAPI BackgroundTask.
    2. run_clip_job() updates the status column at each stage:
         queued → downloading → transcribing → detecting → cutting → completed
       On failure it sets status=failed and writes `error_message`.
    3. For each viral moment returned by the detector we run the full
       cut → reframe → subs → thumbnail → upload sub-pipeline and insert
       one row in `generated_clips`. Frontend polls the endpoint and
       streams clips in as they appear.

Why it's one long async function rather than a Celery worker:
    FastAPI's BackgroundTasks already gives us fire-and-forget. We don't
    need the complexity of a task queue for Phase 1 — if this grows past
    ~10 concurrent jobs we swap this file for a Redis-backed queue
    without touching the rest of the codebase.
"""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
import traceback
import uuid
from typing import Optional

from app.core.supabase import supabase
from app.services.video_pipeline import (
    ViralMoment,
    cut_segment,
    detect_viral_moments,
    download_source,
    extract_thumbnail,
    reframe_to_vertical,
    render_karaoke_subs,
    transcribe_audio,
    upload_to_storage,
)

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────
# Job state transitions — thin wrappers around the DB write so the status
# machine stays legible when we read run_clip_job().
# ──────────────────────────────────────────────────────────────────────────

def _mark(job_id: str, **fields) -> None:
    """Partial update of a clip_jobs row. Always safe to call from anywhere."""
    if not fields:
        return
    try:
        supabase.table("clip_jobs").update(fields).eq("id", job_id).execute()
    except Exception as e:
        # Never let a DB error in progress reporting kill the whole job —
        # log it and move on. The worst case is a stale progress bar.
        logger.warning(f"clip_jobs update failed for {job_id}: {e}")


def _fail(job_id: str, message: str) -> None:
    """Terminal failure. Records the message so the UI can show it."""
    logger.error(f"clip_job {job_id} failed: {message}")
    _mark(job_id, status="failed", error_message=message[:1000], progress=100)


# ──────────────────────────────────────────────────────────────────────────
# Public entry points
# ──────────────────────────────────────────────────────────────────────────

async def run_clip_job(job_id: str) -> None:
    """
    Full pipeline for a single clip_job. Called in the background from
    the /clips/from-url endpoint.

    Safe to await OR to schedule as a background task (it swallows its
    own exceptions so a crash never leaks into the caller's request).
    """
    # Load the job so we have the user-chosen parameters.
    try:
        res = (
            supabase.table("clip_jobs")
            .select("*")
            .eq("id", job_id)
            .maybe_single()
            .execute()
        )
    except Exception as e:
        logger.error(f"Could not load clip_job {job_id}: {e}")
        return

    job = getattr(res, "data", None)
    if not job:
        logger.error(f"clip_job {job_id} not found — aborting pipeline")
        return

    source_url: str = job["source_url"]
    requested_count: int = int(job.get("requested_count") or 5)
    aspect_ratio: str = job.get("aspect_ratio") or "9:16"
    subtitle_style: str = job.get("subtitle_style") or "karaoke"
    user_id: str = str(job["user_id"])

    # Isolated scratch directory per job so we never clobber files across
    # parallel runs. Cleaned on success + failure.
    workdir = tempfile.mkdtemp(prefix=f"clipjob_{job_id[:8]}_")

    try:
        # ── Stage 1: download ───────────────────────────────────────────
        _mark(job_id, status="downloading", progress=5)
        source = await asyncio.to_thread(download_source, source_url, workdir)
        _mark(
            job_id,
            source_title=source.title[:500] if source.title else None,
            source_duration=int(source.duration_seconds),
            progress=20,
        )

        # ── Stage 2: transcribe ─────────────────────────────────────────
        _mark(job_id, status="transcribing", progress=25)
        transcript = await transcribe_audio(source.path)
        if transcript.language:
            _mark(job_id, language=transcript.language)

        # ── Stage 3: moment detection ──────────────────────────────────
        _mark(job_id, status="detecting", progress=45)
        moments = await detect_viral_moments(
            transcript, source.duration_seconds, count=requested_count
        )

        if not moments:
            # Fallback: evenly-spaced slices so the user still gets SOMETHING
            # back when the LLM can't help (no key, transcript too short, etc.)
            moments = _fallback_evenly_spaced(source.duration_seconds, requested_count)

        if not moments:
            _fail(job_id, "No viable clip windows could be produced from this source.")
            return

        # ── Stage 4-8 per moment: cut, reframe, subs, thumb, upload ─────
        _mark(job_id, status="cutting", progress=55)
        total = len(moments)
        for idx, moment in enumerate(moments):
            try:
                await _produce_one_clip(
                    job_id=job_id,
                    user_id=user_id,
                    source_path=source.path,
                    transcript=transcript,
                    moment=moment,
                    aspect_ratio=aspect_ratio,
                    subtitle_style=subtitle_style,
                    workdir=workdir,
                    clip_index=idx,
                )
            except Exception as e:
                # Per-clip failure shouldn't kill the whole batch. Log, skip,
                # keep going — the job still completes with (N-1) clips.
                logger.warning(
                    f"clip_job {job_id}: moment {idx} failed: {e}\n{traceback.format_exc()}"
                )
            # Progress: 55 → 95 linearly across moments.
            pct = int(55 + 40 * ((idx + 1) / max(1, total)))
            _mark(job_id, progress=min(95, pct))

        # ── Completed ──────────────────────────────────────────────────
        _mark(job_id, status="completed", progress=100, error_message=None)

    except Exception as e:
        tb = traceback.format_exc()
        logger.error(f"clip_job {job_id} crashed:\n{tb}")
        _fail(job_id, f"{type(e).__name__}: {e}")
    finally:
        # Scrub the scratch dir so long-running workers don't slowly fill
        # the disk. Best-effort — we don't want a cleanup failure to mark
        # the job as failed.
        try:
            import shutil
            shutil.rmtree(workdir, ignore_errors=True)
        except Exception:
            pass


async def _produce_one_clip(
    *,
    job_id: str,
    user_id: str,
    source_path: str,
    transcript,
    moment: ViralMoment,
    aspect_ratio: str,
    subtitle_style: str,
    workdir: str,
    clip_index: int,
) -> None:
    """Run cut → reframe → subs → thumb → upload for a single moment, then
    persist a `generated_clips` row. Raises on hard failure so the outer
    loop can log + skip."""
    tag = f"{clip_index:02d}_{uuid.uuid4().hex[:8]}"
    raw_clip_path = os.path.join(workdir, f"raw_{tag}.mp4")
    reframed_path = os.path.join(workdir, f"vert_{tag}.mp4")
    final_path    = os.path.join(workdir, f"final_{tag}.mp4")
    thumb_path    = os.path.join(workdir, f"thumb_{tag}.jpg")

    # 1. Cut the time range out of the source.
    await asyncio.to_thread(
        cut_segment, source_path, moment.start, moment.end, raw_clip_path
    )

    # 2. Reframe to the target aspect ratio (Sieve or centre-crop fallback).
    await reframe_to_vertical(raw_clip_path, reframed_path, aspect_ratio)

    # 3. Burn in word-level subtitles (or block / off depending on style).
    await asyncio.to_thread(
        render_karaoke_subs,
        reframed_path,
        transcript,
        moment.start,
        moment.end,
        final_path,
        subtitle_style,
    )

    # 4. Grab a thumbnail frame.
    try:
        await asyncio.to_thread(extract_thumbnail, final_path, thumb_path, 0.5)
    except Exception as e:
        logger.warning(f"Thumbnail extraction failed for clip {tag}: {e}")
        thumb_path = ""  # skip upload

    # 5. Upload video + thumbnail to Supabase Storage.
    storage_video_path = f"generated_clips/{user_id}/{job_id}/{tag}.mp4"
    storage_thumb_path = (
        f"generated_clips/{user_id}/{job_id}/{tag}.jpg"
        if thumb_path else None
    )
    video_url = await asyncio.to_thread(
        upload_to_storage, final_path, storage_video_path, "video/mp4"
    )
    thumbnail_url: Optional[str] = None
    if thumb_path and os.path.isfile(thumb_path):
        thumbnail_url = await asyncio.to_thread(
            upload_to_storage, thumb_path, storage_thumb_path, "image/jpeg"
        )

    # 6. Pull the local transcript text for this window (nice for search + UI).
    local_text = " ".join(
        w.text for w in transcript.words
        if moment.start <= w.start < moment.end
    ).strip()
    if not local_text:
        local_text = transcript.full_text[:500] if transcript.full_text else ""

    # 7. Persist.
    supabase.table("generated_clips").insert({
        "job_id": job_id,
        "user_id": user_id,
        "start_seconds": round(moment.start, 3),
        "end_seconds": round(moment.end, 3),
        "title": moment.title[:500] if moment.title else None,
        "transcript": local_text[:5000] if local_text else None,
        "virality_score": moment.virality_score,
        "reason": moment.reason[:500] if moment.reason else None,
        "aspect_ratio": aspect_ratio,
        "video_url": video_url,
        "storage_path": storage_video_path,
        "thumbnail_url": thumbnail_url,
        "thumbnail_path": storage_thumb_path,
    }).execute()


# ──────────────────────────────────────────────────────────────────────────
# Fallback moment picker for when the LLM/transcription isn't available.
# ──────────────────────────────────────────────────────────────────────────

def _fallback_evenly_spaced(duration: float, count: int) -> list[ViralMoment]:
    """Slice the source into `count` equally-sized non-overlapping windows,
    each 45 seconds long, starting at the N-tiles of the source. Used when
    we can't actually read the transcript (missing keys, very short
    source, etc.)."""
    if duration < 20 or count < 1:
        return []
    clip_len = min(45.0, max(15.0, duration / max(1, count)))
    moments: list[ViralMoment] = []
    gap = max(1.0, (duration - clip_len) / max(1, count))
    for i in range(count):
        start = round(i * gap, 2)
        end = round(min(duration, start + clip_len), 2)
        if end - start < 15:
            break
        moments.append(ViralMoment(
            start=start,
            end=end,
            title=f"Highlight #{i + 1}",
            reason="Evenly-spaced fallback (no transcript available).",
            virality_score=50 - i,  # mild ordering
        ))
    return moments
