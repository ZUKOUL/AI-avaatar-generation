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

import base64
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


# ──────────────────────────────────────────────────────────────────────────────
# Prompt-prefix encoding
#
# Every thumbnail row in `generated_images` has its prompt column prefixed
# with `[thumbnail|mode|ratio]` (and now optionally a 4th base64-JSON slot
# for extra metadata like the YouTube URL and reference-image URL). This
# keeps the schema flat (no migration) while still letting /history and
# /avatar/images recover everything the lightbox wants to show.
# ──────────────────────────────────────────────────────────────────────────────
def encode_thumbnail_prefix(
    mode: str,
    aspect_ratio: str,
    *,
    youtube_url: Optional[str] = None,
    reference_image_url: Optional[str] = None,
) -> str:
    """
    Build the `[thumbnail|mode|ratio|<b64meta>]` prefix string.

    If no extra metadata is present, returns the shorter 3-slot legacy
    form `[thumbnail|mode|ratio]` — keeps rows compact when there's
    nothing to encode and matches what old parsers expected.
    """
    meta = {}
    if youtube_url:
        meta["yt"] = youtube_url
    if reference_image_url:
        meta["ref"] = reference_image_url
    if meta:
        raw = json.dumps(meta, separators=(",", ":")).encode()
        b64 = base64.urlsafe_b64encode(raw).decode().rstrip("=")
        return f"[thumbnail|{mode}|{aspect_ratio}|{b64}]"
    return f"[thumbnail|{mode}|{aspect_ratio}]"


def decode_thumbnail_prefix(prompt: str) -> Optional[dict]:
    """
    Parse the prefix back into a dict of {mode, aspect_ratio, youtube_url,
    reference_image_url, clean_prompt}. Returns None if the prompt doesn't
    carry the prefix. Accepts both the new `|` delimiter and the legacy
    `:` form, plus the optional 4th base64 slot.
    """
    if not prompt:
        return None
    m = re.match(r"^\[thumbnail([|:])([^\]]+)\]\s*", prompt)
    if not m:
        return None
    sep = m.group(1)
    parts = m.group(2).split(sep)
    mode = parts[0] if parts else "prompt"
    aspect_ratio = parts[1] if len(parts) > 1 else "16:9"
    youtube_url: Optional[str] = None
    reference_image_url: Optional[str] = None
    if len(parts) > 2 and parts[2]:
        try:
            # Re-add padding stripped at encode time before decoding.
            pad = "=" * (-len(parts[2]) % 4)
            raw = base64.urlsafe_b64decode(parts[2] + pad).decode()
            meta = json.loads(raw)
            if isinstance(meta, dict):
                youtube_url = meta.get("yt")
                reference_image_url = meta.get("ref")
        except Exception:
            # Malformed metadata shouldn't break the whole row — treat it
            # as if the extra slot wasn't there. Mode/ratio still come
            # through cleanly.
            pass
    return {
        "mode": mode,
        "aspect_ratio": aspect_ratio,
        "youtube_url": youtube_url,
        "reference_image_url": reference_image_url,
        "clean_prompt": prompt[m.end():],
    }

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
    # First "source" image bytes — for edit mode this is the user's uploaded
    # thumbnail, for recreate this is the fetched YouTube frame. We hold on
    # to the bytes so we can re-upload the reference to Supabase storage and
    # return a stable URL that the lightbox can display later. Without this
    # hop, edit-mode thumbnails would have no persisted reference image.
    first_ref_bytes: Optional[bytes] = None
    first_ref_mime: str = "image/png"

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
        first_ref_bytes = yt_bytes
        first_ref_mime = "image/jpeg"
        logger.info(f"Recreate: seeded YouTube thumbnail for {video_id} ({len(yt_bytes)} bytes)")

    # 2. User-uploaded references (character, style, or source image for edit).
    if files:
        for idx, f in enumerate(files):
            data = await f.read()
            if not data:
                continue
            mime = f.content_type or "image/png"
            gemini_contents.append(types.Part.from_bytes(data=data, mime_type=mime))
            # Capture the first uploaded file as the "source" for edit mode
            # (recreate mode already filled first_ref_bytes with the YouTube
            # frame above, so we only overwrite if we don't have one yet).
            if first_ref_bytes is None and idx == 0:
                first_ref_bytes = data
                first_ref_mime = mime
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

    # Persist the source reference image to Supabase so the lightbox can
    # display it later (and let the user click it to re-open the composer
    # with that same source pre-loaded). Recreate-mode already has a
    # YouTube CDN URL but those can rot; uploading once gives us a stable
    # URL we control. Edit-mode has no public URL at all without this step.
    reference_image_url: Optional[str] = None
    if first_ref_bytes:
        ref_ext = "jpg" if first_ref_mime.endswith("jpeg") else "png"
        ref_path = f"thumbnails/{current_user['id']}/{thumb_id}-ref.{ref_ext}"
        try:
            supabase.storage.from_("avatars").upload(
                path=ref_path,
                file=first_ref_bytes,
                file_options={"content-type": first_ref_mime, "x-upsert": "true"},
            )
            reference_image_url = supabase.storage.from_("avatars").get_public_url(ref_path)
        except Exception as upload_err:
            # Non-fatal — the generated thumbnail still lands successfully,
            # we just won't have a reference image in the lightbox.
            logger.error(
                f"reference-image upload failed for thumbnail {thumb_id}: {upload_err}"
            )

    # Log this into `generated_images` so it shows up in both the thumbnail
    # history AND the image generator gallery. We originally tried a
    # separate `media` table but it was never migrated to production — that
    # silent insert failure is why no thumbnails were appearing anywhere.
    #
    # Encoding scheme: the prompt column starts with a `[thumbnail|mode|ratio]`
    # tag (plus an optional 4th base64-JSON slot carrying {yt,ref} URLs)
    # that the history/images endpoints split back out. Using `|` as the
    # delimiter (instead of `:`) keeps the tag unambiguous even when the
    # aspect ratio itself contains a colon (e.g. "16:9"). The tag is
    # stripped before display so users see their clean prompt.
    source_youtube_url = youtube_url.strip() if youtube_url else None
    prefix = encode_thumbnail_prefix(
        mode,
        aspect_ratio,
        youtube_url=source_youtube_url,
        reference_image_url=reference_image_url,
    )
    try:
        supabase.table("generated_images").insert(
            {
                "id": thumb_id,
                "user_id": current_user["id"],
                "avatar_id": None,  # thumbnails aren't bound to a character
                "prompt": f"{prefix} {prompt}",
                "image_url": image_url,
                "storage_path": storage_path,
            }
        ).execute()
    except Exception as db_err:
        # Non-fatal — the image is still generated and downloadable. But
        # log loudly because this means history will be empty for this row.
        logger.error(
            f"generated_images insert failed for thumbnail {thumb_id}: {db_err}"
        )

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
        # Legacy field — kept for existing frontends. Carries the YouTube
        # CDN URL in recreate mode (which is what it always meant).
        "source_thumbnail_url": used_youtube_url,
        # New fields that the lightbox uses: a stable Supabase-hosted copy
        # of the reference image (works for both recreate and edit), plus
        # the original YouTube link so we can render a "watch on YouTube"
        # button in the details panel.
        "reference_image_url": reference_image_url,
        "source_url": source_youtube_url,
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
    limit: int = 500,
):
    """
    Fetch past thumbnails for the signed-in user, most recent first.

    Reads from `generated_images` (the same table that stores regular avatar
    generations) and identifies thumbnails two ways:

      1. The prompt starts with our `[thumbnail|mode|ratio|b64]` tag (or the
         legacy `[thumbnail:mode]` / `[thumbnail|mode|ratio]` forms).
      2. The row's storage_path lives under the `thumbnails/{user_id}/…`
         folder that every thumbnail has always been uploaded to, even
         before we started encoding metadata in the prompt.

    The second signal lets legacy rows — generated before the prefix
    encoding shipped — still surface in the gallery. Without it, users
    saw only recent thumbnails and nothing older.

    Using the shared `generated_images` table means thumbnails also appear
    in the image-generator gallery and we avoid the migration risk of a
    separate `media` table.
    """
    # Bump the default/cap so the full catalogue is available. Users who
    # have generated hundreds of thumbnails still see their history.
    limit = max(1, min(limit, 1000))
    try:
        # Pull every candidate row for this user (no avatar_id filter, no
        # storage_path filter) and do the thumbnail classification in
        # Python. `storage_path` exists on every row and reliably points at
        # `thumbnails/…` for anything generated by /thumbnail/generate; the
        # prompt-prefix signal catches rows we've added since the encoding
        # upgrade even if someone manually edited storage_path. We fetch a
        # generous window because non-thumbnail rows (regular avatar
        # generations) share the table and get filtered out in Python.
        fetch_n = min(max(limit * 3, 200), 1500)
        try:
            res = (
                supabase.table("generated_images")
                .select("id, prompt, image_url, storage_path, created_at")
                .eq("user_id", current_user["id"])
                .order("created_at", desc=True)
                .limit(fetch_n)
                .execute()
            )
            raw_rows = res.data or []
        except Exception as fetch_err:
            logger.error(f"/thumbnail/history: generated_images fetch failed: {fetch_err}")
            raw_rows = []

        items: list[dict] = []
        for row in raw_rows:
            prompt = row.get("prompt") or ""
            storage_path = row.get("storage_path") or ""
            image_url = row.get("image_url") or ""
            meta = decode_thumbnail_prefix(prompt)
            # Two independent signals that this row is a thumbnail. Either
            # one is enough — rows that were written before we started
            # encoding the prefix still live under `thumbnails/…` and we
            # want them in the gallery too.
            looks_like_thumbnail = (
                meta is not None
                or storage_path.startswith("thumbnails/")
                or "/thumbnails/" in image_url
            )
            if not looks_like_thumbnail:
                continue
            if meta is not None:
                clean_prompt = meta["clean_prompt"]
                mode = meta["mode"]
                aspect_ratio = meta["aspect_ratio"]
                yt_url = meta.get("youtube_url")
                reference_image_url = meta.get("reference_image_url")
            else:
                # Legacy row: no metadata in the prompt. Show it with
                # sensible defaults so the user still sees the thumbnail.
                clean_prompt = prompt
                mode = "prompt"
                aspect_ratio = "16:9"
                yt_url = None
                reference_image_url = None
            yt_id = extract_youtube_id(yt_url) if yt_url else None
            items.append(
                {
                    "thumbnail_id": row["id"],
                    "image_url": image_url,
                    "prompt": clean_prompt,
                    "mode": mode,
                    "aspect_ratio": aspect_ratio,
                    "source_thumbnail_url": reference_image_url,
                    "reference_image_url": reference_image_url,
                    "source_url": yt_url,
                    "youtube_video_id": yt_id,
                    "title_text": None,
                    "created_at": row.get("created_at"),
                }
            )
            if len(items) >= limit:
                break

        return {"thumbnails": items, "count": len(items)}
    except Exception as e:
        # Never 500 the client — history is non-critical, a transient error
        # shouldn't blank the grid. Log and return empty.
        logger.error(f"Failed to fetch thumbnail history: {e}")
        return {"thumbnails": [], "count": 0}


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /thumbnail/{thumb_id}
# Used by the gallery's bulk-delete action. Cleans up the row AND the storage
# blob so deleted thumbnails don't clutter the bucket forever.
# ──────────────────────────────────────────────────────────────────────────────
@router.delete("/{thumb_id}")
async def delete_thumbnail(
    current_user: Annotated[User, Depends(get_current_user)],
    thumb_id: str,
):
    """Delete a thumbnail + its storage artefacts. Scoped to the signed-in user."""
    try:
        res = (
            supabase.table("generated_images")
            .select("id, user_id, storage_path")
            .eq("id", thumb_id)
            .eq("user_id", current_user["id"])
            .single()
            .execute()
        )
        row = getattr(res, "data", None)
    except Exception as fetch_err:
        logger.error(f"delete_thumbnail lookup failed for {thumb_id}: {fetch_err}")
        row = None

    if not row:
        raise HTTPException(status_code=404, detail="Thumbnail not found.")

    storage_path = row.get("storage_path") or ""
    paths_to_remove: list[str] = []
    if storage_path:
        paths_to_remove.append(storage_path)
        # The reference image (if any) lives alongside with a `-ref.{ext}`
        # suffix. We don't know which extension without another round-trip,
        # so try both — the storage API silently skips missing keys.
        base = storage_path.rsplit(".", 1)[0]
        paths_to_remove.extend([f"{base}-ref.png", f"{base}-ref.jpg"])

    if paths_to_remove:
        try:
            supabase.storage.from_("avatars").remove(paths_to_remove)
        except Exception as storage_err:
            # Non-fatal — the row delete below still frees the gallery slot.
            logger.warning(
                f"delete_thumbnail: storage cleanup failed for {thumb_id}: {storage_err}"
            )

    try:
        (
            supabase.table("generated_images")
            .delete()
            .eq("id", thumb_id)
            .eq("user_id", current_user["id"])
            .execute()
        )
    except Exception as db_err:
        logger.error(f"delete_thumbnail row delete failed for {thumb_id}: {db_err}")
        raise HTTPException(status_code=500, detail="Delete failed.")

    return {"status": "deleted", "thumbnail_id": thumb_id}


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
