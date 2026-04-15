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

import json
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
    # Visual target hint. When the user clicks (or draws) a region on the
    # source thumbnail, the frontend sends us a short label for what occupies
    # that region (e.g. "Blond man on left", "Red product box", "Title text
    # HOW I GOT RICH") so we can wire it straight into the generation prompt.
    target_label: Optional[str] = Form(None, description="Short description of the region to replace/edit"),
    # Kept for backward compatibility with the first-wave frontend.
    person_to_replace_label: Optional[str] = Form(None, description="Legacy alias of target_label"),
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

    # When the user attached extra reference images (beyond the first YouTube/
    # source thumbnail), we know they intend to inject a specific person. The
    # prompt then has to treat the source as a *layout* reference rather than
    # locking the source's identity — otherwise face-swap requests get ignored.
    has_character_refs = len([c for c in gemini_contents if not isinstance(c, str)]) > 1

    if mode == "prompt":
        full_prompt = (
            f"Create an original YouTube thumbnail. {base_style} "
            + (
                "One or more reference images show the specific person(s) who "
                "must appear as the subject. Reproduce their face identity "
                "exactly — do NOT alter, beautify, or idealize facial features. "
                if has_character_refs
                else ""
            )
            + f"Thumbnail concept: {prompt}"
        )
    elif mode == "recreate":
        # Unified target label: prefer the new `target_label`, fall back to
        # the legacy `person_to_replace_label`.
        effective_target = (target_label or person_to_replace_label or "").strip()
        target_clause = (
            f"The region to replace is described as: \"{effective_target}\". "
            "Swap THAT specific subject/element (matching its position, pose, "
            "scale, and lighting) for the referenced person/content. Do not "
            "touch any other people or elements in the frame. "
            if effective_target and has_character_refs
            else ""
        )
        if has_character_refs:
            # Face-swap / person-injection: keep the ORIGINAL composition,
            # lighting and background, but replace the subject with the
            # reference person(s).
            full_prompt = (
                "The FIRST image is the ORIGINAL YouTube thumbnail — use it as "
                "the compositional and stylistic reference (framing, lighting, "
                "mood, background, colors). "
                "The following reference images show the specific person(s) "
                "the user wants featured. Reproduce their face and identity "
                "EXACTLY — do NOT alter, beautify, or idealize facial features. "
                f"{target_clause}"
                "If the prompt asks you to replace someone in the original, "
                "swap the corresponding subject so the referenced person "
                "occupies that position, matching the original's pose, "
                "lighting, and expression. Keep everything else identical. "
                f"{base_style} "
                f"Change to apply: {prompt}"
            )
        else:
            full_prompt = (
                "The first image is the ORIGINAL YouTube thumbnail. "
                "Generate a NEW thumbnail that keeps the overall composition, "
                "lighting, and subject framing but applies the requested "
                "change literally — the user's instructions take priority "
                "over preserving details. "
                f"{base_style} "
                f"Change to apply: {prompt}"
            )
    elif mode == "edit":
        effective_target = (target_label or person_to_replace_label or "").strip()
        target_clause = (
            f"The region to replace is described as: \"{effective_target}\". "
            "Swap THAT specific subject/element (matching its position, pose, "
            "scale, and lighting) for the referenced person/content. Do not "
            "touch any other people or elements in the frame. "
            if effective_target and has_character_refs
            else ""
        )
        full_prompt = (
            "The first uploaded image is the source thumbnail — keep its "
            "composition, lighting and overall look, then apply the requested "
            "edit literally. "
            + (
                "Additional reference images show the specific person(s) "
                "to feature; reproduce their face identity exactly when the "
                "edit involves swapping or adding a character. "
                if has_character_refs
                else ""
            )
            + target_clause
            + f"{base_style} "
            + f"Edit instructions: {prompt}"
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
# POST /thumbnail/detect-people
# Uses Gemini 2.5 Flash's bounding-box mode to locate every human visible in
# the source thumbnail. The frontend overlays the boxes on the preview so the
# user can click the person they want to replace instead of typing a prompt.
# ──────────────────────────────────────────────────────────────────────────────
DETECT_PROMPT = (
    "Detect every distinct identifiable subject in this thumbnail — humans, "
    "animals, prominent objects, products, and large readable text blocks. "
    "Return a JSON array where each element has:\n"
    "- \"label\": a short description (3-8 words). For people prefer "
    "distinguishing features (hair color, clothing, position, known identity). "
    "For text, quote the first few words. For objects state what they are. "
    "Examples: \"Blond man on left\", \"Red sports car\", "
    "\"Title text: HOW I GOT RICH\".\n"
    "- \"kind\": one of \"person\", \"object\", \"text\", \"other\".\n"
    "- \"box_2d\": bounding box as [ymin, xmin, ymax, xmax] normalized to "
    "a 0-1000 scale.\n"
    "- \"is_main\": true for the single most prominent subject, false "
    "otherwise.\n"
    "Ignore tiny incidental details. Return at most 8 subjects. If nothing "
    "identifiable is present, return an empty array []. Return ONLY the "
    "JSON array, nothing else."
)


def _parse_detection_response(raw: str) -> list[dict]:
    """Pull a JSON array out of Gemini's response, tolerating ```json fences."""
    if not raw:
        return []
    cleaned = raw.strip()
    # Strip markdown fences if the model ignored response_mime_type.
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Last-resort: grab the first array-looking substring.
        m = re.search(r"\[.*\]", cleaned, re.DOTALL)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    return data if isinstance(data, list) else []


@router.post("/detect-people")
async def detect_people(
    current_user: Annotated[User, Depends(get_current_user)],
    youtube_url: Optional[str] = Form(None, description="YouTube URL to scrape"),
    image_url: Optional[str] = Form(None, description="Already-hosted image URL"),
    file: Optional[UploadFile] = File(None, description="Uploaded image"),
):
    """Detect people in a thumbnail. Accepts one of: upload, youtube_url, image_url."""
    image_bytes: Optional[bytes] = None
    mime_type = "image/jpeg"

    if file is not None:
        image_bytes = await file.read()
        mime_type = file.content_type or "image/jpeg"
    elif youtube_url:
        vid = extract_youtube_id(youtube_url)
        if not vid:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL.")
        image_bytes = await fetch_youtube_thumbnail(vid)
        if not image_bytes:
            raise HTTPException(status_code=404, detail="Couldn't fetch thumbnail for that video.")
    elif image_url:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(image_url)
                if r.status_code != 200:
                    raise HTTPException(status_code=400, detail="Couldn't fetch image_url.")
                image_bytes = r.content
                mime_type = r.headers.get("content-type", "image/jpeg")
        except httpx.HTTPError as e:
            raise HTTPException(status_code=400, detail=f"Fetch failed: {e}")

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Provide one of: file upload, youtube_url, or image_url.",
        )

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                DETECT_PROMPT,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.0,
            ),
        )
    except APIError as e:
        logger.error(f"detect-people Gemini error: {e}")
        raise HTTPException(status_code=400, detail=f"Detection failed: {e}")
    except Exception as e:
        logger.error(f"detect-people unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")

    raw = response.text or ""
    detections = _parse_detection_response(raw)

    # Normalize into a format the frontend can render directly. Gemini returns
    # [ymin, xmin, ymax, xmax] on a 0-1000 scale; we convert to 0-1 fractional
    # {x, y, w, h} so the frontend can position boxes with CSS percents.
    people = []
    for idx, item in enumerate(detections):
        if not isinstance(item, dict):
            continue
        box = item.get("box_2d") or item.get("box") or []
        if not (isinstance(box, list) and len(box) == 4):
            continue
        try:
            ymin, xmin, ymax, xmax = (float(v) for v in box)
        except (TypeError, ValueError):
            continue
        # Clamp + normalize.
        ymin = max(0.0, min(1000.0, ymin))
        xmin = max(0.0, min(1000.0, xmin))
        ymax = max(0.0, min(1000.0, ymax))
        xmax = max(0.0, min(1000.0, xmax))
        if ymax <= ymin or xmax <= xmin:
            continue
        raw_kind = str(item.get("kind") or "person").lower().strip()
        if raw_kind not in {"person", "object", "text", "other"}:
            raw_kind = "other"
        people.append(
            {
                "id": f"subject_{idx}",
                "label": str(item.get("label") or f"Subject {idx + 1}").strip()[:80],
                "kind": raw_kind,
                "is_main": bool(item.get("is_main", False)),
                "box": {
                    "x": xmin / 1000.0,
                    "y": ymin / 1000.0,
                    "w": (xmax - xmin) / 1000.0,
                    "h": (ymax - ymin) / 1000.0,
                },
            }
        )

    # Keep "people" key for backward compat with the first frontend wave.
    return {"subjects": people, "people": people, "count": len(people)}


# ──────────────────────────────────────────────────────────────────────────────
# GET /thumbnail/history
# Returns the user's past thumbnails (persistent across sessions) so the
# frontend can render a proper gallery instead of session-only state.
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/history")
async def thumbnail_history(
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 60,
):
    """Fetch past thumbnails for the signed-in user, most recent first."""
    limit = max(1, min(limit, 120))
    try:
        # Filter by metadata.kind via PostgREST JSONB operator. Falls back to a
        # Python-side filter if the DB client can't express the filter — the
        # media table is not huge per user so the cost is negligible.
        try:
            res = (
                supabase.table("media")
                .select("id, url, prompt, metadata, created_at")
                .eq("user_id", current_user["id"])
                .filter("metadata->>kind", "eq", "thumbnail")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = res.data or []
        except Exception:
            res = (
                supabase.table("media")
                .select("id, url, prompt, metadata, created_at")
                .eq("user_id", current_user["id"])
                .order("created_at", desc=True)
                .limit(limit * 2)
                .execute()
            )
            rows = [
                r
                for r in (res.data or [])
                if (r.get("metadata") or {}).get("kind") == "thumbnail"
            ][:limit]

        def _clean_prompt(p: Optional[str]) -> str:
            if not p:
                return ""
            return re.sub(r"^\[thumbnail:[^\]]+\]\s*", "", p)

        items = []
        for row in rows:
            meta = row.get("metadata") or {}
            items.append(
                {
                    "thumbnail_id": row["id"],
                    "image_url": row["url"],
                    "prompt": _clean_prompt(row.get("prompt")),
                    "mode": meta.get("mode") or "prompt",
                    "aspect_ratio": meta.get("aspect_ratio") or "16:9",
                    "source_thumbnail_url": meta.get("youtube_url"),
                    "youtube_video_id": meta.get("youtube_video_id"),
                    "title_text": meta.get("title_text"),
                    "created_at": row.get("created_at"),
                }
            )
        return {"thumbnails": items, "count": len(items)}
    except Exception as e:
        logger.error(f"Failed to fetch thumbnail history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
