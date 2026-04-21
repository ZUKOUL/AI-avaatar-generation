"""
Spyder API — track competitors 24/7.

Lets a user register a set of "brands" (Meta Ads Library pages, TikTok
handles, YouTube channels) that Horpen will scan and archive. Each
archived creative is AI-analysed so it can be recreated in Canvas with
a single click.

Endpoints :
  POST   /spyder/brands              — add a brand to track
  GET    /spyder/brands              — list the user's tracked brands
  DELETE /spyder/brands/{brand_id}   — stop tracking a brand
  GET    /spyder/feed                — aggregated creative feed (paginated)
  GET    /spyder/ads/{ad_id}         — single ad with AI analysis
  POST   /spyder/recreate/{ad_id}    — build a Canvas prompt from the ad

Worker note : the actual scraper runs as a separate cron/worker that
inserts rows into `spyder_ads`. This router is strictly CRUD + feed ; a
real scan isn't triggered from the HTTP side.
"""
from __future__ import annotations

import logging
from typing import Annotated, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl

from app.core.auth import get_current_user
from app.core.supabase import supabase
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_PLATFORMS = {"meta", "tiktok", "instagram", "youtube", "web"}


# ─────────────────────────────────────────────────────────────────
#  Schemas
# ─────────────────────────────────────────────────────────────────


class AddBrandRequest(BaseModel):
    source_url: HttpUrl
    platform: str = Field(..., description="meta | tiktok | instagram | youtube | web")
    display_name: Optional[str] = None


class BrandResponse(BaseModel):
    id: str
    platform: str
    source_url: str
    display_name: str
    avatar_url: Optional[str] = None
    status: str
    last_scan_at: Optional[str] = None
    created_at: str


class AdResponse(BaseModel):
    id: str
    brand_id: str
    platform: str
    ad_type: str
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    caption: Optional[str] = None
    landing_url: Optional[str] = None
    perf_score: Optional[int] = None
    ai_analysis: dict = Field(default_factory=dict)
    first_seen_at: str


class RecreateResponse(BaseModel):
    # Everything Canvas needs to open pre-filled : the extracted
    # style/hook/angle, plus a ready-to-submit prompt. The frontend hops
    # to /dashboard/canvas?prefill=<this.id> and fetches the prompt.
    canvas_prompt: str
    hook: Optional[str] = None
    angle: Optional[str] = None
    style_summary: Optional[str] = None
    source_ad_id: str


# ─────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────


def _infer_display_name(source_url: str, platform: str) -> str:
    """Fall back to the hostname or last path segment when the client
    doesn't pass an explicit display_name. The scanner overwrites this
    with the real brand name once it fetches metadata."""
    try:
        parsed = urlparse(source_url)
        # TikTok/Instagram/YouTube : last path segment (handle).
        if platform in {"tiktok", "instagram", "youtube"}:
            segments = [s for s in parsed.path.split("/") if s]
            if segments:
                return segments[-1].lstrip("@")
        # Default : hostname.
        return (parsed.hostname or source_url)[:64]
    except Exception:
        return source_url[:64]


# ─────────────────────────────────────────────────────────────────
#  Brands CRUD
# ─────────────────────────────────────────────────────────────────


@router.post("/brands", response_model=BrandResponse, status_code=201)
def add_brand(
    payload: AddBrandRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    """Register a new brand for Spyder to track. Returns the stored row
    with status='pending' — the worker will pick it up on its next
    cycle."""
    if payload.platform not in ALLOWED_PLATFORMS:
        raise HTTPException(400, f"platform must be one of {sorted(ALLOWED_PLATFORMS)}")

    source_url = str(payload.source_url)
    display_name = payload.display_name or _infer_display_name(source_url, payload.platform)

    try:
        row = {
            "user_id": str(user.id),
            "platform": payload.platform,
            "source_url": source_url,
            "display_name": display_name,
            "status": "pending",
        }
        res = supabase.table("spyder_brands").insert(row).execute()
        inserted = (res.data or [None])[0]
        if not inserted:
            raise HTTPException(500, "insert returned no rows")
    except HTTPException:
        raise
    except Exception as e:
        # Unique-constraint violation → user tries to add the same URL
        # twice. Surface that as a clean 409 rather than a 500.
        msg = str(e).lower()
        if "duplicate" in msg or "unique" in msg:
            raise HTTPException(409, "This brand is already tracked")
        logger.exception("Spyder add_brand failed")
        raise HTTPException(500, f"failed to add brand: {e}")

    return BrandResponse(**inserted)


@router.get("/brands", response_model=list[BrandResponse])
def list_brands(user: Annotated[User, Depends(get_current_user)]):
    """Return the user's tracked brands, newest first."""
    res = (
        supabase.table("spyder_brands")
        .select("id, platform, source_url, display_name, avatar_url, status, last_scan_at, created_at")
        .eq("user_id", str(user.id))
        .order("created_at", desc=True)
        .execute()
    )
    return [BrandResponse(**row) for row in (res.data or [])]


@router.delete("/brands/{brand_id}", status_code=204)
def delete_brand(brand_id: str, user: Annotated[User, Depends(get_current_user)]):
    """Stop tracking a brand. Cascades to its archived ads."""
    # Guard : users can only delete their own brands.
    res = (
        supabase.table("spyder_brands")
        .select("id")
        .eq("id", brand_id)
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
    )
    if not (res.data or []):
        raise HTTPException(404, "brand not found")
    supabase.table("spyder_brands").delete().eq("id", brand_id).execute()


# ─────────────────────────────────────────────────────────────────
#  Ads feed
# ─────────────────────────────────────────────────────────────────


@router.get("/feed", response_model=list[AdResponse])
def get_feed(
    user: Annotated[User, Depends(get_current_user)],
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    brand_id: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
):
    """Paginated feed of every ad archived for the user's brands. The
    frontend groups these by brand in the UI, but the endpoint returns
    a flat list ordered by first_seen_at DESC (= newest creatives first)."""
    q = (
        supabase.table("spyder_ads")
        .select(
            "id, brand_id, platform, ad_type, media_url, thumbnail_url, "
            "caption, landing_url, perf_score, ai_analysis, first_seen_at"
        )
        .eq("user_id", str(user.id))
        .order("first_seen_at", desc=True)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    if platform:
        q = q.eq("platform", platform)
    res = q.range(offset, offset + limit - 1).execute()
    return [AdResponse(**row) for row in (res.data or [])]


@router.get("/ads/{ad_id}", response_model=AdResponse)
def get_ad(ad_id: str, user: Annotated[User, Depends(get_current_user)]):
    """Full detail of a single archived ad, including the AI analysis."""
    res = (
        supabase.table("spyder_ads")
        .select(
            "id, brand_id, platform, ad_type, media_url, thumbnail_url, "
            "caption, landing_url, perf_score, ai_analysis, first_seen_at, user_id"
        )
        .eq("id", ad_id)
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(404, "ad not found")
    row.pop("user_id", None)
    return AdResponse(**row)


# ─────────────────────────────────────────────────────────────────
#  Recreate
# ─────────────────────────────────────────────────────────────────


def _prompt_from_analysis(ad_row: dict) -> RecreateResponse:
    """Turn the ai_analysis jsonb into a Canvas-ready prompt. Keeps the
    recipe (hook / angle / style) but deliberately avoids quoting the
    original copy verbatim so the user doesn't accidentally infringe on
    the source's assets."""
    ai = ad_row.get("ai_analysis") or {}
    hook = ai.get("hook")
    angle = ai.get("angle")
    emotion = ai.get("emotion")
    persona = ai.get("persona")
    style = ai.get("style")
    cta = ai.get("cta")

    # Fallback : if the scanner hasn't yet analysed this ad, at least
    # give Canvas the caption + ad_type to chew on.
    caption_hint = ad_row.get("caption")
    ad_type = ad_row.get("ad_type") or "image"

    parts = [f"Create a new {ad_type} creative in this style:"]
    if hook:
        parts.append(f"- Hook idea: rework the angle '{hook}' in your own words.")
    if angle:
        parts.append(f"- Narrative angle: {angle}.")
    if emotion:
        parts.append(f"- Core emotion: {emotion}.")
    if persona:
        parts.append(f"- Audience persona: {persona}.")
    if style:
        parts.append(f"- Visual style notes: {style}.")
    if cta:
        parts.append(f"- Call-to-action direction: {cta}.")
    if caption_hint and not any([hook, angle, style]):
        # Not a verbatim reproduction — summarise at most one sentence.
        parts.append("- Source caption tone (paraphrase, don't reuse verbatim).")
    parts.append("Replace the product and persona with mine. Stay 100% original.")

    return RecreateResponse(
        canvas_prompt="\n".join(parts),
        hook=hook,
        angle=angle,
        style_summary=style,
        source_ad_id=ad_row["id"],
    )


@router.post("/recreate/{ad_id}", response_model=RecreateResponse)
def recreate(ad_id: str, user: Annotated[User, Depends(get_current_user)]):
    """Build a Canvas-ready prompt derived from the archived ad's AI
    analysis. The frontend hands this prompt to /canvas alongside the
    user's current avatar/product so the generation stays in-brand."""
    res = (
        supabase.table("spyder_ads")
        .select("id, caption, ad_type, ai_analysis, user_id")
        .eq("id", ad_id)
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(404, "ad not found")
    return _prompt_from_analysis(row)


# ─────────────────────────────────────────────────────────────────
#  Health / stats
# ─────────────────────────────────────────────────────────────────


@router.get("/stats")
def stats(user: Annotated[User, Depends(get_current_user)]):
    """Tiny summary used by the dashboard header (N brands, N ads
    archivées cette semaine)."""
    try:
        brands = (
            supabase.table("spyder_brands")
            .select("id", count="exact")
            .eq("user_id", str(user.id))
            .execute()
        )
        ads = (
            supabase.table("spyder_ads")
            .select("id", count="exact")
            .eq("user_id", str(user.id))
            .execute()
        )
        return {
            "tracked_brands": brands.count or 0,
            "archived_ads": ads.count or 0,
        }
    except Exception as e:
        logger.warning(f"Spyder stats failed: {e}")
        return {"tracked_brands": 0, "archived_ads": 0}
