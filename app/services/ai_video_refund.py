"""
Centralised refund + zombie-cleanup helpers for AI-video jobs.

Three paths can trigger a refund on the same job — the post-pipeline
guard (`_run_with_refund_guard`), the user-initiated cancel endpoint,
and the background zombie reaper. Without coordination they'd happily
refund the same job three times. The `credit_refunded` column (see
migration 011) is the single source of truth: any refund path sets it
to true on success and checks it first.

All helpers are async-safe and never raise — they log + swallow on
DB or Supabase hiccups so they never take down the app.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.core.pricing import get_ai_video_credit_cost
from app.core.supabase import supabase
from app.services.credit_service import add_credits

logger = logging.getLogger(__name__)


def _has_credits_refunded(job: dict) -> bool:
    """Read the flag defensively — legacy rows before migration 011 may
    not have the column populated yet."""
    val = job.get("credit_refunded")
    return bool(val)


def _refund_amount_for(job: dict) -> int:
    """Compute what the user should get back. Returns 0 for rows that
    shouldn't refund (legacy / already processed)."""
    mode = job.get("mode") or "slideshow"
    duration = int(job.get("duration_seconds") or 30)
    try:
        return get_ai_video_credit_cost(mode, duration)
    except Exception:
        return 0


def refund_job_credits(job_id: str, reason: str, txn_type: str = "ai_video_refund") -> bool:
    """
    Refund the user's credits for a given ai_video_job, IF the row hasn't
    been refunded already. Returns True if a refund was actually issued.

    Safe to call from multiple paths on the same job — the
    `credit_refunded` flag de-duplicates.
    """
    try:
        res = (
            supabase.table("ai_video_jobs")
            .select("id, user_id, mode, duration_seconds, credit_refunded")
            .eq("id", job_id)
            .maybe_single()
            .execute()
        )
    except Exception as e:
        logger.warning(f"refund_job_credits: could not load job {job_id}: {e}")
        return False

    job = getattr(res, "data", None) if res else None
    if not job:
        return False

    if _has_credits_refunded(job):
        return False  # already refunded — no-op

    amount = _refund_amount_for(job)
    if amount <= 0:
        # Mark the flag anyway so later paths don't retry a zero refund.
        try:
            supabase.table("ai_video_jobs").update({"credit_refunded": True}).eq("id", job_id).execute()
        except Exception:
            pass
        return False

    # Flip the flag FIRST — if the credit write fails we'd rather under-
    # refund (which the user can escalate) than double-refund (which is
    # impossible to unwind cleanly). Check the update actually landed by
    # reading the row back; if it didn't (race with another path), bail.
    try:
        upd = (
            supabase.table("ai_video_jobs")
            .update({"credit_refunded": True})
            .eq("id", job_id)
            .eq("credit_refunded", False)     # atomic compare-and-set
            .execute()
        )
        if not upd.data:
            # Another path beat us to it.
            return False
    except Exception as e:
        logger.warning(f"refund_job_credits: CAS update failed for {job_id}: {e}")
        return False

    user_id = str(job["user_id"])
    try:
        add_credits(user_id, amount, txn_type, reason[:200])
    except Exception as e:
        # Credit write failed after we already flipped the flag — log
        # loudly so we can reconcile manually. This is the only state
        # that requires human review.
        logger.error(
            f"CRITICAL: credit_refunded flipped to true but add_credits "
            f"failed for job {job_id} user {user_id} amount {amount}: {e}"
        )
        return False

    logger.info(f"Refunded {amount} credits for ai_video_job {job_id} ({reason})")
    return True


def mark_job_failed(job_id: str, error_message: str) -> bool:
    """Set status=failed + progress=100 + record the error. Only flips
    non-terminal rows (no-op on already-completed/-failed jobs)."""
    try:
        res = (
            supabase.table("ai_video_jobs")
            .update({
                "status": "failed",
                "progress": 100,
                "error_message": error_message[:1000],
            })
            .eq("id", job_id)
            .not_.in_("status", ["completed", "failed"])
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        logger.warning(f"mark_job_failed: DB update failed for {job_id}: {e}")
        return False


# ──────────────────────────────────────────────────────────────────────────
# Zombie reaper — runs as a startup background task. Scans every N minutes
# for non-terminal jobs that haven't had an `updated_at` tick in too long,
# assumes the worker thread died (container restart / crash), marks them
# failed + refunds.
# ──────────────────────────────────────────────────────────────────────────

# How long a job can sit unchanged before we call it dead. Generous —
# a real 60s motion-mode job with 12 scenes at 240s each would take
# up to 48 min. We set the threshold well beyond that so we only kill
# actual zombies.
_ZOMBIE_THRESHOLD_MINUTES = 30

# How often the reaper runs. Cheap query so frequent polling is fine.
_REAPER_INTERVAL_SECONDS = 600   # 10 minutes


async def _reap_once() -> int:
    """One pass of the reaper. Returns how many jobs it killed."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=_ZOMBIE_THRESHOLD_MINUTES)).isoformat()
    try:
        res = (
            supabase.table("ai_video_jobs")
            .select("id, user_id, mode, duration_seconds, status, updated_at")
            .not_.in_("status", ["completed", "failed"])
            .lt("updated_at", cutoff)
            .limit(50)
            .execute()
        )
    except Exception as e:
        logger.warning(f"Zombie reaper query failed: {e}")
        return 0

    rows = res.data or []
    if not rows:
        return 0

    killed = 0
    for row in rows:
        job_id = str(row["id"])
        was_failed = mark_job_failed(
            job_id,
            "Job timed out — the worker appears to have died. Credits refunded.",
        )
        if was_failed:
            refund_job_credits(
                job_id,
                reason=f"Auto-refund — zombie job {job_id} reaped after {_ZOMBIE_THRESHOLD_MINUTES} min of silence",
                txn_type="ai_video_zombie_refund",
            )
            killed += 1
    if killed:
        logger.info(f"Zombie reaper: killed {killed} stale ai_video_job(s)")
    return killed


async def zombie_reaper_loop() -> None:
    """Scheduled forever-loop. Registered at app startup."""
    # Small stagger at boot so the reaper doesn't collide with other
    # startup tasks (migrations, admin bootstrap).
    await asyncio.sleep(30)
    while True:
        try:
            await _reap_once()
        except Exception as e:
            # Defensive — we never want the loop to die.
            logger.error(f"Zombie reaper iteration errored: {e}")
        await asyncio.sleep(_REAPER_INTERVAL_SECONDS)
