"""
Public showcase endpoint — feeds the marketing landing page with real
generations instead of gradient placeholders.

The landing page at `/` (Next.js root) hits this route on mount,
fills its hero gallery + feature-card illustrations with actual
thumbnails / avatars / ads / video frames produced by the admin
account. Fallback to placeholder gradients happens client-side when
the call errors out, so the landing is never blocked by a showcase
outage.

Why public (no JWT):
    The landing page runs unauthenticated by definition. We already
    hand out public URLs via Supabase Storage's `get_public_url()`
    anywhere an image is rendered in-app, so exposing a curated
    read-only feed of those same URLs doesn't leak anything new.

Privacy guard:
    We only surface content produced by users with role=administrator
    (today that's the founder's account), NEVER arbitrary user
    generations. That keeps customer content out of the public feed
    even though the Storage bucket itself is world-readable.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Query

from app.core.supabase import supabase

logger = logging.getLogger(__name__)
router = APIRouter()


def _admin_user_ids() -> list[str]:
    """Fetch the UUIDs of every administrator account. Cached per call
    — this is called at most a handful of times per second even under
    landing-page hug-of-death scenarios."""
    try:
        res = (
            supabase.table("users")
            .select("id")
            .eq("role", "administrator")
            .execute()
        )
        return [str(row["id"]) for row in (res.data or [])]
    except Exception as e:
        logger.warning(f"Showcase: could not load admin users: {e}")
        return []


def _public_url(storage_path: Optional[str]) -> Optional[str]:
    """Turn a Supabase Storage path into a CDN URL. Returns None when
    the path is missing or the Storage client trips."""
    if not storage_path:
        return None
    try:
        return supabase.storage.from_("avatars").get_public_url(storage_path)
    except Exception:
        return None


@router.get("/featured")
async def get_featured_showcase(
    thumbnails_limit: int = Query(10, ge=1, le=24),
    avatars_limit: int = Query(6, ge=1, le=12),
    images_limit: int = Query(8, ge=1, le=16),
    ads_limit: int = Query(6, ge=1, le=12),
    videos_limit: int = Query(4, ge=1, le=8),
):
    """
    Return a curated showcase of recent generations from admin
    accounts. Shape:
        {
          "thumbnails": [{"url": ..., "aspect": "16:9", "created_at": ...}],
          "avatars":    [{"url": ..., "aspect": "1:1"}],
          "images":     [{"url": ..., "aspect": "1:1"}],
          "ads":        [{"url": ..., "aspect": "1:1"}],
          "videos":     [{"thumbnail_url": ..., "video_url": ..., "aspect": "9:16"}],
        }
    Every bucket is empty-safe — the landing renders gradient
    placeholders for anything the endpoint didn't fill.
    """
    admin_ids = _admin_user_ids()
    if not admin_ids:
        # No admin account yet — return empty arrays so the landing
        # falls back to its gradients without surfacing an error.
        return {
            "thumbnails": [],
            "avatars": [],
            "images": [],
            "ads": [],
            "videos": [],
        }

    # ── Thumbnails ────────────────────────────────────────────────
    # Thumbnails live in `generated_images` with a `storage_path`
    # starting `thumbnails/…` (per the Thumbnail Generator service).
    thumbnails = []
    try:
        res = (
            supabase.table("generated_images")
            .select("id, image_url, storage_path, created_at")
            .in_("user_id", admin_ids)
            .like("storage_path", "thumbnails/%")
            .order("created_at", desc=True)
            .limit(thumbnails_limit)
            .execute()
        )
        for row in (res.data or []):
            url = row.get("image_url") or _public_url(row.get("storage_path"))
            if url:
                thumbnails.append({
                    "url": url,
                    "aspect": "16:9",
                    "created_at": row.get("created_at"),
                })
    except Exception as e:
        logger.warning(f"Showcase thumbnails query failed: {e}")

    # ── Avatars ───────────────────────────────────────────────────
    # Stored in `characters` with `image_paths[]`; first entry is the
    # clean identity portrait (by convention in the avatar service).
    avatars = []
    try:
        res = (
            supabase.table("characters")
            .select("id, image_paths, created_at")
            .in_("user_id", admin_ids)
            .order("created_at", desc=True)
            .limit(avatars_limit)
            .execute()
        )
        for row in (res.data or []):
            paths = row.get("image_paths") or []
            if not paths:
                continue
            url = _public_url(paths[0])
            if url:
                avatars.append({
                    "url": url,
                    "aspect": "1:1",
                    "created_at": row.get("created_at"),
                })
    except Exception as e:
        logger.warning(f"Showcase avatars query failed: {e}")

    # ── Generated images (non-thumbnails) ─────────────────────────
    images = []
    try:
        res = (
            supabase.table("generated_images")
            .select("id, image_url, storage_path, created_at")
            .in_("user_id", admin_ids)
            .not_.like("storage_path", "thumbnails/%")
            .order("created_at", desc=True)
            .limit(images_limit)
            .execute()
        )
        for row in (res.data or []):
            url = row.get("image_url") or _public_url(row.get("storage_path"))
            if url:
                images.append({
                    "url": url,
                    "aspect": "1:1",
                    "created_at": row.get("created_at"),
                })
    except Exception as e:
        logger.warning(f"Showcase images query failed: {e}")

    # ── Ads ────────────────────────────────────────────────────────
    ads = []
    try:
        res = (
            supabase.table("generated_ads")
            .select("id, image_url, storage_path, aspect_ratio, created_at")
            .in_("user_id", admin_ids)
            .order("created_at", desc=True)
            .limit(ads_limit)
            .execute()
        )
        for row in (res.data or []):
            url = row.get("image_url") or _public_url(row.get("storage_path"))
            if url:
                ads.append({
                    "url": url,
                    "aspect": row.get("aspect_ratio") or "1:1",
                    "created_at": row.get("created_at"),
                })
    except Exception as e:
        logger.warning(f"Showcase ads query failed: {e}")

    # ── AI Videos ──────────────────────────────────────────────────
    videos = []
    try:
        res = (
            supabase.table("ai_video_jobs")
            .select(
                "id, video_url, thumbnail_url, aspect_ratio, created_at, status"
            )
            .in_("user_id", admin_ids)
            .eq("status", "completed")
            .order("created_at", desc=True)
            .limit(videos_limit)
            .execute()
        )
        for row in (res.data or []):
            thumb = row.get("thumbnail_url")
            vurl = row.get("video_url")
            if thumb or vurl:
                videos.append({
                    "thumbnail_url": thumb,
                    "video_url": vurl,
                    "aspect": row.get("aspect_ratio") or "9:16",
                    "created_at": row.get("created_at"),
                })
    except Exception as e:
        logger.warning(f"Showcase AI videos query failed: {e}")

    return {
        "thumbnails": thumbnails,
        "avatars": avatars,
        "images": images,
        "ads": ads,
        "videos": videos,
    }
