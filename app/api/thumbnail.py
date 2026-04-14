"""
Thumbnail Generator — Pikzels-style viral YouTube thumbnails via Nano Banana Pro.

Supports four modes:
  • prompt    — Text-to-thumbnail from scratch.
  • recreate  — Paste a YouTube URL, we fetch the video's existing thumbnail
                and use it as a reference to generate a new one.
  • edit      — User uploads a thumbnail, we remix it per the prompt.
  • title     — Same as prompt but the prompt is augmented with instructions
                to bake a bold title/text overlay into the image.

Reference images (for character identity lock) are carried through in all modes
via the `refs` multipart field, plus a `source_image_url` field that lets the
client pass a remote URL (used by the recreate mode after we upload-then-URL
the scraped YouTube thumbnail back to Supabase).

Credit cost: CREDIT_COST_THUMBNAIL (falls back to CREDIT_COST_IMAGE * 2).
"""

import os
import re
import uuid
import logging
from typing import Annotated, List, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from google import genai
from google.genai import types
from google.genai.errors import APIError

from app.core.auth import get_current_user
from app.core.pricing import COST_GEMINI_FLASH_IMAGE, CREDIT_COST_IMAGE
from app.core.supabase import supabase
from app.models.user import User
from app.services.credit_service import deduct_credits, get_balance, is_admin

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_REFERENCE_IMAGES = 5
# Thumbnail generation costs more than a plain avatar because it burns an extra
# 16:9 Gemini call + sometimes a YouTube fetch. Double the image cost by default.
CREDIT_COST_THUMBNAIL = CREDIT_COST_IMAGE * 2

# YouTube URL → video ID. Covers watch?v=, youtu.be/, shorts/, embed/.
YOUTUBE_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|shorts/|embed/|v/)|youtu\.be/)([A-Za-z0-9_-]{11})"
)


def extract_youtube_id(url: str) -> Optional[str]:
    """Return the 11-char YouTube video ID, or None if `url` doesn't match."""
    if not url:
        return None
    match = YOUTUBE_RE.search(url)
    return match.group(1) if match else None


async def fetch_youtube_thumbnail(video_id: str) -> Optional[bytes]:
    """
    Fetch the highest-available thumbnail for a YouTube video.

    We try maxresdefault → hqdefault → mqdefault; some videos never had a
    maxresdefault generated, so the fallback chain matters. Returns the image
    bytes, or None on total failure.
    """
    candidates = [
        f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
        f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg",
    ]
    async with httpx.AsyncClient(timeout=10.0) as client:
        for url in candidates:
            try:
                r = await client.get(url)
                # YouTube returns a 120px grey placeholder when a size doesn't
                # exist — that response is 200 OK, so we also gate on size.
                if r.status_code == 200 and len(r.content) > 1500:
                    return r.content
            except Exception as e:
                logger.warning(f"Thumbnail fetch failed for {url}: {e}")
    return None


# ──────────────────────────────────────────────────────────────────────────────
# POST /thumbnail/generate
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/generate")
async def generate_thumbnail(
    current_user: Annotated[User, Depends(get_current_user)],
    mode: str = Form("prompt", description="prompt | recreate | edit | title"),
    prompt: str = Form(..., description="Describe the thumbnail you want"),
    youtube_url: Optional[str] = Form(None, description="Required for mode=recreate"),
    title_text: Optional[str] = Form(None, description="Optional bold overlay text"),
    aspect_ratio: str = Form("16:9", description="16:9 (default), 9:16, 1:1, 4:3, 3:4"),
    files: List[UploadFile] = File(default=[], description="Reference images (character, style, source thumbnail for edit)"),
):
    """Generate a thumbnail. Mode-aware prompt engineering + optional refs."""

    mode = (mode or "prompt").lower().strip()
    if mode not in {"prompt", "recreate", "edit", "title"}:
        raise HTTPException(status_code=400, detail=f"Unknown mode '{mode}'. Use prompt | recreate | edit | title.")

    if files and len(files) > MAX_REFERENCE_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_REFERENCE_IMAGES} reference images allowed.",
        )

    # Credit gate (admins get free passes).
    if not is_admin(current_user):
        balance = get_balance(current_user["id"])
        if balance < CREDIT_COST_THUMBNAIL:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "INSUFFICIENT_CREDITS",
                    "message": f"You need {CREDIT_COST_THUMBNAIL} credit(s). Current balance: {balance}",
                },
            )

    thumb_id = str(uuid.uuid4())
    logger.info(f"Thumbnail generation ({mode}) for user {current_user['id']}: {thumb_id}")

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    # ── Assemble Gemini multimodal input ────────────────────────────────────
    gemini_contents: list = []
    used_youtube_url: Optional[str] = None
    video_id: Optional[str] = None

    # 1. Recreate mode: pull the YouTube thumbnail and seed it as the first ref.
    if mode == "recreate":
        video_id = extract_youtube_id(youtube_url or "")
        if not video_id:
            raise HTTPException(
                status_code=400,
                detail="Couldn't parse a YouTube video ID from that URL.",
            )
        yt_bytes = await fetch_youtube_thumbnail(video_id)
        if not yt_bytes:
            raise HTTPException(
                status_code=404,
                detail="Couldn't fetch a thumbnail for that YouTube video.",
            )
        used_youtube_url = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
        gemini_contents.append(types.Part.from_bytes(data=yt_bytes, mime_type="image/jpeg"))
        logger.info(f"Recreate: seeded YouTube thumbnail for {video_id} ({len(yt_bytes)} bytes)")

    # 2. User-uploaded references (character, style, or source image for edit).
    if files:
        for f in files:
            data = await f.read()
            if not data:
                continue
            mime = f.content_type or "image/png"
            gemini_contents.append(types.Part.from_bytes(data=data, mime_type=mime))
        logger.info(f"Added {len(files)} user reference image(s)")

    # ── Mode-specific prompt engineering ────────────────────────────────────
    base_style = (
        "Ultra high-contrast YouTube thumbnail, 16:9 cinematic framing. "
        "Clean composition, dramatic lighting, saturated but natural colors, "
        "subject positioned for a strong focal point. No channel logos, no "
        "watermarks. Sharp, high detail, optimized to be eye-catching at small sizes."
    )

    if mode == "prompt":
        full_prompt = (
            f"Create an original YouTube thumbnail. {base_style} "
            f"Thumbnail concept: {prompt}"
        )
    elif mode == "recreate":
        full_prompt = (
            "The first image is the ORIGINAL YouTube thumbnail. "
            "Generate a NEW thumbnail that keeps the overall composition and "
            "subject framing but applies the requested change. "
            "Preserve the main character's identity exactly (face, hair, build). "
            f"{base_style} "
            f"Change to apply: {prompt}"
        )
    elif mode == "edit":
        full_prompt = (
            "The first uploaded image is the source thumbnail. "
            "Apply the requested edit while preserving everything else. "
            f"{base_style} "
            f"Edit instructions: {prompt}"
        )
    else:  # title
        title = (title_text or "").strip()
        full_prompt = (
            f"Create an original YouTube thumbnail with bold, readable title text baked into the image. "
            f"{base_style} "
            f"Thumbnail concept: {prompt} "
            + (
                f"Title text to render prominently (large, bold, high contrast, clearly legible): \"{title}\""
                if title
                else "Render a catchy short title (under 5 words) in a bold, highly legible sans-serif."
            )
        )

    gemini_contents.append(full_prompt)

    # ── Call Gemini ─────────────────────────────────────────────────────────
    try:
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio, image_size="2K"),
            ),
        )
    except APIError as api_err:
        logger.error(f"Gemini API Error: {api_err}")
        msg = api_err.message if hasattr(api_err, "message") else str(api_err)
        raise HTTPException(status_code=400, detail=f"AI provider error: {msg}")
    except Exception as e:
        logger.error(f"Unexpected Gemini error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to communicate with AI provider: {e}")

    if not response.candidates:
        raise HTTPException(status_code=500, detail="Gemini returned no candidates.")
    candidate = response.candidates[0]
    if not candidate.content or not candidate.content.parts:
        raise HTTPException(
            status_code=400,
            detail="Thumbnail generation was blocked (likely by safety filters).",
        )

    # Find the generated image part.
    generated_bytes: Optional[bytes] = None
    for part in candidate.content.parts:
        if part.text:
            logger.info(f"Gemini reasoning: {part.text[:200]}")
        elif part.inline_data:
            generated_bytes = part.inline_data.data
            break

    if not generated_bytes:
        raise HTTPException(status_code=500, detail="Gemini returned no image bytes.")

    # ── Persist to Supabase + record in media table ─────────────────────────
    storage_path = f"thumbnails/{current_user['id']}/{thumb_id}.png"
    supabase.storage.from_("avatars").upload(
        path=storage_path,
        file=generated_bytes,
        file_options={"content-type": "image/png", "x-upsert": "true"},
    )
    image_url = supabase.storage.from_("avatars").get_public_url(storage_path)

    # Log this as a media row so it shows up in history. The `media` table is
    # shared with image generation — we just tag the prompt with [thumbnail].
    try:
        supabase.table("media").insert(
            {
                "user_id": current_user["id"],
                "type": "image",
                "url": image_url,
                "prompt": f"[thumbnail:{mode}] {prompt}",
                "metadata": {
                    "kind": "thumbnail",
                    "mode": mode,
                    "aspect_ratio": aspect_ratio,
                    "youtube_url": used_youtube_url,
                    "youtube_video_id": video_id,
                    "title_text": title_text,
                },
            }
        ).execute()
    except Exception as db_err:
        # Non-fatal — the image is still generated and downloadable.
        logger.warning(f"media table insert failed (non-fatal): {db_err}")

    if not is_admin(current_user):
        deduct_credits(
            current_user["id"],
            CREDIT_COST_THUMBNAIL,
            "thumbnail_generation",
            f"Thumbnail {mode}: {prompt[:60]}",
        )

    return {
        "status": "Success",
        "thumbnail_id": thumb_id,
        "image_url": image_url,
        "mode": mode,
        "aspect_ratio": aspect_ratio,
        "youtube_video_id": video_id,
        "source_thumbnail_url": used_youtube_url,
        "cost_usd": COST_GEMINI_FLASH_IMAGE,
        "engine": "gemini-3-pro-image-preview",
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /thumbnail/youtube-preview?url=…
# Lightweight helper so the frontend can show a thumbnail preview *before*
# the user hits Generate (validates the URL + gives instant visual feedback).
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/youtube-preview")
async def youtube_preview(url: str):
    video_id = extract_youtube_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Not a valid YouTube URL.")
    # We don't download here — just return the canonical URLs. The browser
    # will request maxres first and cascade on 404 via <img onerror>.
    return {
        "video_id": video_id,
        "thumbnail_urls": {
            "maxres": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
            "hq": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
            "mq": f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg",
        },
    }
