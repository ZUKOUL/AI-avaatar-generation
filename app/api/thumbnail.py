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
import io
import json
import os
import random
import re
import time
import uuid
import logging
from typing import Annotated, List, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from google import genai
from google.genai import types
from google.genai.errors import APIError
from PIL import Image, ImageDraw

from app.core.auth import get_current_user
from app.core.pricing import (
    COST_GEMINI_FLASH_IMAGE,
    CREDIT_COST_APPSTORE_PACK,
    CREDIT_COST_APPSTORE_PER_SCREEN,
    CREDIT_COST_IMAGE,
)
from app.core.supabase import supabase
from app.models.user import User
from app.services.appstore_strategist import design_appstore_brief
from app.services.credit_service import deduct_credits, get_balance, is_admin
from app.services import niche_loader


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

# ──────────────────────────────────────────────────────────────────────────────
# Inspiration feature — in-memory cache + niche config
# ──────────────────────────────────────────────────────────────────────────────
_inspiration_cache: dict = {}

INSPIRATION_NICHES = {
    "business": {
        "label": "Business & Finance",
        "emoji": "💼",
        # Target entrepreneurship / e-commerce / hustle culture creators
        # (Iman Gadzhi, Alex Hormozi, Yomi Denzel, Graham Stephan style)
        "query": "entrepreneur make money online ecommerce dropshipping passive income side hustle",
    },
    "sport": {
        "label": "Sport & Fitness",
        "emoji": "💪",
        "query": "workout routine fitness motivation bodybuilding gym training results",
    },
    "entertainment": {
        "label": "Entertainment",
        "emoji": "🎭",
        "query": "funniest moments try not to laugh reaction challenge viral experiment",
    },
    "mrbeast": {
        "label": "MrBeast Style",
        "emoji": "🏆",
        "query": "$10000 challenge win biggest extreme survival last to leave competition",
    },
    "gaming": {
        "label": "Gaming & Tech",
        "emoji": "🎮",
        "query": "gaming best moments epic plays tips tricks gameplay review 2024",
    },
}

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


def annotate_target_box(
    img_bytes: bytes,
    box_x: float,
    box_y: float,
    box_w: float,
    box_h: float,
    label: Optional[str] = None,
) -> bytes:
    """
    Draw a bright magenta rectangle on `img_bytes` at the given fractional
    coordinates (0-1 of image width/height) and return the annotated PNG
    bytes. This is what lets Gemini *see* which region the user drew on
    top of the thumbnail — without it, `target_label` alone is just text
    and the model has to guess which element of the frame it refers to.

    We use magenta (#ff00ff) because it's rarely present in real photos,
    so the marker pops out visually. The stroke width scales with the
    image so it's readable at any resolution.

    Falls back to the original bytes if Pillow can't parse the image —
    better to ship an un-annotated generation than to 500 the whole call.
    """
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        w, h = img.size
        # Clamp box inside the image so we never try to draw outside bounds.
        x0 = max(0, min(w - 2, int(box_x * w)))
        y0 = max(0, min(h - 2, int(box_y * h)))
        x1 = max(x0 + 2, min(w, int((box_x + box_w) * w)))
        y1 = max(y0 + 2, min(h, int((box_y + box_h) * h)))

        # Scale the stroke with image size so it stays visible on 1280×720
        # YouTube frames but doesn't overwhelm small uploads.
        stroke = max(4, min(w, h) // 160)

        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        # Double-stroke: bright magenta outline + thin white halo so the
        # rectangle reads clearly on both dark and light backgrounds.
        draw.rectangle(
            [x0, y0, x1, y1],
            outline=(255, 255, 255, 255),
            width=stroke + 2,
        )
        draw.rectangle(
            [x0, y0, x1, y1],
            outline=(255, 0, 255, 255),
            width=stroke,
        )

        # Small "TARGET" tag in the top-left corner of the rectangle so the
        # model has a textual hint too. Cheap belt-and-braces against the
        # model missing the magenta colour.
        tag_text = f"TARGET: {label}" if label else "TARGET"
        try:
            # Default PIL font is bitmap; good enough for a corner tag.
            tag_pad = 4
            tw = max(60, len(tag_text) * 6)
            th = 14
            draw.rectangle(
                [x0, max(0, y0 - th - 2), x0 + tw + tag_pad * 2, y0],
                fill=(255, 0, 255, 230),
            )
            draw.text(
                (x0 + tag_pad, max(0, y0 - th - 1)),
                tag_text,
                fill=(255, 255, 255, 255),
            )
        except Exception:
            # Font rendering on some minimal images (e.g. 16-bit palette)
            # can fail — skip the tag rather than failing the whole call.
            pass

        composed = Image.alpha_composite(img, overlay).convert("RGB")
        out = io.BytesIO()
        composed.save(out, format="PNG")
        return out.getvalue()
    except Exception as e:
        logger.warning(f"annotate_target_box failed: {e}")
        return img_bytes


def describe_box_position(
    box_x: float, box_y: float, box_w: float, box_h: float
) -> str:
    """
    Convert fractional box coords to a short human-readable position string
    (e.g. "center-right of the frame, occupying roughly 50%-90% horizontally
    and 20%-80% vertically"). Fed to Gemini as spatial grounding so we can
    steer edits to the right region without painting anything on the image.
    """
    cx = box_x + box_w / 2
    cy = box_y + box_h / 2
    # Horizontal zone
    if cx < 0.33:
        hpos = "left"
    elif cx < 0.66:
        hpos = "center"
    else:
        hpos = "right"
    # Vertical zone
    if cy < 0.33:
        vpos = "upper"
    elif cy < 0.66:
        vpos = "middle"
    else:
        vpos = "lower"
    if hpos == "center" and vpos == "middle":
        zone = "center of the frame"
    elif vpos == "middle":
        zone = f"{hpos} side of the frame"
    elif hpos == "center":
        zone = f"{vpos} middle of the frame"
    else:
        zone = f"{vpos}-{hpos} area of the frame"
    # Exact coord range
    xl, xr = int(box_x * 100), int((box_x + box_w) * 100)
    yt, yb = int(box_y * 100), int((box_y + box_h) * 100)
    return (
        f"{zone}, occupying roughly {xl}% to {xr}% horizontally and "
        f"{yt}% to {yb}% vertically"
    )


def crop_region(
    img_bytes: bytes,
    box_x: float,
    box_y: float,
    box_w: float,
    box_h: float,
    *,
    max_side: int = 768,
    pad: float = 0.04,
) -> Optional[bytes]:
    """
    Crop `img_bytes` to the given fractional box with a small padding so the
    cropped image includes enough context around the object to describe
    it (e.g. a t-shirt with a sliver of the person wearing it). Returns
    PNG bytes, or None if the crop is degenerate.

    Used by `/thumbnail/describe-region` to generate a meaningful label
    for custom-drawn boxes.
    """
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        w, h = img.size
        # Expand the box by `pad` on each side, clamped to the image bounds.
        ex = max(0.0, box_x - pad)
        ey = max(0.0, box_y - pad)
        ew = min(1.0 - ex, box_w + pad * 2)
        eh = min(1.0 - ey, box_h + pad * 2)
        x0 = int(ex * w)
        y0 = int(ey * h)
        x1 = int((ex + ew) * w)
        y1 = int((ey + eh) * h)
        if x1 - x0 < 8 or y1 - y0 < 8:
            return None
        crop = img.crop((x0, y0, x1, y1))
        # Downscale enormous crops so the Gemini call stays fast & cheap.
        crop.thumbnail((max_side, max_side), Image.LANCZOS)
        out = io.BytesIO()
        crop.save(out, format="PNG")
        return out.getvalue()
    except Exception as e:
        logger.warning(f"crop_region failed: {e}")
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
    # Fractional box coordinates (0-1) of the region the user marked on the
    # source thumbnail. When present we draw a magenta rectangle on the
    # source image before feeding it to Gemini, so the model has a VISUAL
    # pointer to the region instead of relying on text alone — this is the
    # fix for custom-drawn boxes whose label is just "Custom selection".
    target_box_x: Optional[float] = Form(None, description="Box left edge as fraction of image width (0-1)"),
    target_box_y: Optional[float] = Form(None, description="Box top edge as fraction of image height (0-1)"),
    target_box_w: Optional[float] = Form(None, description="Box width as fraction of image width (0-1)"),
    target_box_h: Optional[float] = Form(None, description="Box height as fraction of image height (0-1)"),
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

    # Decide whether the caller supplied a valid fractional box so we can
    # visually annotate the source with a magenta rectangle. Reject boxes
    # with zero area or coordinates outside [0,1] — those would either be
    # invisible or signal a bug on the client. Only used in recreate/edit;
    # in `prompt`/`title` there's no source to annotate.
    has_target_box = (
        target_box_x is not None
        and target_box_y is not None
        and target_box_w is not None
        and target_box_h is not None
        and 0.0 <= target_box_x <= 1.0
        and 0.0 <= target_box_y <= 1.0
        and target_box_w > 0.005
        and target_box_h > 0.005
        and target_box_x + target_box_w <= 1.001
        and target_box_y + target_box_h <= 1.001
    )
    # Is there enough label context to describe the target, OR just the
    # visual rectangle? Both are strong enough on their own to steer the
    # model; together they're ideal.
    effective_target_label = (target_label or person_to_replace_label or "").strip()

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
        # Always send the clean, un-annotated YouTube thumbnail. We used to
        # paint a bright magenta rectangle to mark the target region, but
        # Gemini 3 Pro Image treats source images as faithful references and
        # was rendering the rectangle AND its "TARGET: …" label directly
        # into the final output. Instead we rely on (1) a cropped zoom of
        # the region sent as an additional input, and (2) exact percentage
        # coordinates in the text prompt.
        gemini_contents.append(
            types.Part.from_bytes(data=yt_bytes, mime_type="image/jpeg")
        )
        first_ref_bytes = yt_bytes
        first_ref_mime = "image/jpeg"
        logger.info(f"Recreate: seeded YouTube thumbnail for {video_id} ({len(yt_bytes)} bytes)")

        # When the user drew/clicked a target region, attach a zoomed crop
        # of that region as a SECOND image. The text prompt then references
        # "the second image" as a region-of-interest preview that tells the
        # model what to edit without any paint leaking into the output.
        if has_target_box and mode == "recreate":
            try:
                crop_bytes = crop_region(
                    yt_bytes,
                    target_box_x,  # type: ignore[arg-type]
                    target_box_y,  # type: ignore[arg-type]
                    target_box_w,  # type: ignore[arg-type]
                    target_box_h,  # type: ignore[arg-type]
                )
                if crop_bytes:
                    gemini_contents.append(
                        types.Part.from_bytes(data=crop_bytes, mime_type="image/png")
                    )
                    logger.info(
                        f"Recreate: attached region crop "
                        f"({target_box_x:.2f},{target_box_y:.2f},"
                        f"{target_box_w:.2f},{target_box_h:.2f})"
                    )
            except Exception as e:
                logger.warning(f"Recreate crop_region failed: {e}")

    # 2. User-uploaded references (character, style, or source image for edit).
    # Track the FIRST uploaded file separately so we can append a region
    # crop right after it when the user marked a target in edit mode —
    # the crop needs to come before any character refs so the prompt's
    # "second image is the region of interest" wording stays accurate.
    edit_source_bytes: Optional[bytes] = None
    if files:
        for idx, f in enumerate(files):
            data = await f.read()
            if not data:
                continue
            mime = f.content_type or "image/png"
            # Always send the raw source — we no longer paint anything on
            # it. Gemini 3 Pro Image was rendering the magenta rectangle
            # and its TARGET label straight into the output, which was
            # horrible UX. Region hints now come from a separate crop +
            # text coordinates.
            gemini_contents.append(types.Part.from_bytes(data=data, mime_type=mime))
            if mode == "edit" and idx == 0:
                edit_source_bytes = data
                # Append the region-of-interest crop right after the source.
                if has_target_box:
                    try:
                        crop_bytes = crop_region(
                            data,
                            target_box_x,  # type: ignore[arg-type]
                            target_box_y,  # type: ignore[arg-type]
                            target_box_w,  # type: ignore[arg-type]
                            target_box_h,  # type: ignore[arg-type]
                        )
                        if crop_bytes:
                            gemini_contents.append(
                                types.Part.from_bytes(
                                    data=crop_bytes, mime_type="image/png"
                                )
                            )
                            logger.info(
                                f"Edit: attached region crop "
                                f"({target_box_x:.2f},{target_box_y:.2f},"
                                f"{target_box_w:.2f},{target_box_h:.2f})"
                            )
                    except Exception as e:
                        logger.warning(f"Edit crop_region failed: {e}")
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
    # Count uploaded files only, ignoring any region-of-interest crop we
    # added ourselves: for recreate, all uploaded files are character refs;
    # for edit, the first file is the source and anything beyond that is
    # character refs; for prompt, all uploaded files are character refs.
    uploaded_count = len(files) if files else 0
    if mode == "edit":
        has_character_refs = uploaded_count > 1
    else:
        has_character_refs = uploaded_count > 0

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
        effective_target = effective_target_label

        # Build the targeting clause using crop + text coordinates.
        # No annotation is painted on the source image (that caused the
        # model to render the marker rectangle in the output). Instead:
        # • A zoomed crop of the region is sent as image 2 in gemini_contents
        # • The text prompt describes the region with spatial percentages
        # • The label (if any) names the subject in plain language
        if has_target_box:
            pos = describe_box_position(
                target_box_x, target_box_y,  # type: ignore[arg-type]
                target_box_w, target_box_h,  # type: ignore[arg-type]
            )
            label_part = f" (described as: \"{effective_target}\")" if effective_target else ""
            target_clause = (
                f"TARGET REGION: The second image is a zoomed-in preview of the "
                f"specific area to edit{label_part}. This area is located at the "
                f"{pos} of the first image. "
                "Use the second image ONLY to identify WHERE and WHAT to edit — "
                "do NOT reproduce the crop image as a standalone element in the output, "
                "do NOT include any rectangles, borders or overlays. "
                + (
                    "Swap the subject shown in the second image with the "
                    "referenced person(s), matching their position, pose, scale and lighting. "
                    if has_character_refs
                    else
                    "Apply the requested change ONLY to that region. "
                    "Keep every other part of the composition — faces, text, background, "
                    "colours, framing — pixel-identical to the first image. "
                )
            )
        elif effective_target and has_character_refs:
            target_clause = (
                f"The region to replace is described as: \"{effective_target}\". "
                "Swap THAT specific subject/element (matching its position, "
                "pose, scale, and lighting) for the referenced person/content. "
                "Do not touch any other people or elements in the frame. "
            )
        elif effective_target:
            target_clause = (
                f"The region to modify is described as: \"{effective_target}\". "
                "Apply the requested change ONLY to that specific element. "
                "Do not modify anything else in the frame. "
            )
        else:
            target_clause = ""

        # Describe image ordering explicitly so the model knows which slot
        # carries which role (source / region-crop / character refs).
        if has_target_box and has_character_refs:
            img_roles = (
                "IMAGE ROLES — Image 1: original YouTube thumbnail (composition reference). "
                "Image 2: zoomed crop showing the region to edit (targeting aid only — "
                "never reproduce this as an output element). "
                "Images 3+: character reference photos — reproduce their face and "
                "identity EXACTLY, do NOT alter, beautify, or idealize facial features. "
            )
        elif has_target_box:
            img_roles = (
                "IMAGE ROLES — Image 1: original YouTube thumbnail (composition reference). "
                "Image 2: zoomed crop showing the region to edit (targeting aid only — "
                "never reproduce this as an output element). "
            )
        elif has_character_refs:
            img_roles = (
                "IMAGE ROLES — Image 1: original YouTube thumbnail (composition reference). "
                "Remaining images: character reference photos — reproduce their face and "
                "identity EXACTLY, do NOT alter, beautify, or idealize facial features. "
            )
        else:
            img_roles = "Image 1 is the ORIGINAL YouTube thumbnail — use it as the reference. "

        full_prompt = (
            f"{img_roles}"
            f"{target_clause}"
            + (
                "If the prompt asks you to replace someone, swap the target region "
                "so the referenced person occupies that position, matching the original's "
                "pose, lighting, and expression. Keep everything else identical. "
                if has_character_refs
                else
                "Keep the overall composition, lighting, and subject framing. "
                "Apply the requested change literally — the user's instructions "
                "take priority over preserving minor details. "
            )
            + f"{base_style} "
            + f"Change to apply: {prompt}"
        )
    elif mode == "edit":
        effective_target = effective_target_label

        # Same crop-based approach as recreate — no annotation on the image.
        # Image ordering in gemini_contents for edit mode:
        #   [0] clean source thumbnail
        #   [1] region crop (if has_target_box)
        #   [2+] character refs (if any)
        if has_target_box:
            pos = describe_box_position(
                target_box_x, target_box_y,  # type: ignore[arg-type]
                target_box_w, target_box_h,  # type: ignore[arg-type]
            )
            label_part = f" (described as: \"{effective_target}\")" if effective_target else ""
            target_clause = (
                f"TARGET REGION: The second image is a zoomed-in preview of the "
                f"specific area to edit{label_part}. This area is located at the "
                f"{pos} of the first image. "
                "Use the second image ONLY to identify WHERE and WHAT to edit — "
                "do NOT reproduce the crop as a standalone element, do NOT include "
                "any rectangles, borders or overlays in the output. "
                + (
                    "Swap the subject shown in the second image with the referenced "
                    "person(s), matching their position, pose, scale and lighting. "
                    if has_character_refs
                    else
                    "Apply the requested change ONLY to that region. "
                    "Keep every other part — faces, text, background, colours, framing — "
                    "pixel-identical to the first image. "
                )
            )
        elif effective_target and has_character_refs:
            target_clause = (
                f"The region to replace is described as: \"{effective_target}\". "
                "Swap THAT specific subject/element (matching its position, "
                "pose, scale, and lighting) for the referenced person/content. "
                "Do not touch any other people or elements in the frame. "
            )
        elif effective_target:
            target_clause = (
                f"The region to modify is described as: \"{effective_target}\". "
                "Apply the requested edit ONLY to that specific element. "
                "Do not modify anything else in the frame. "
            )
        else:
            target_clause = ""

        if has_target_box and has_character_refs:
            img_roles = (
                "IMAGE ROLES — Image 1: source thumbnail (composition reference, do not alter). "
                "Image 2: zoomed crop showing the region to edit (targeting aid only — "
                "never reproduce as an output element). "
                "Images 3+: character references — reproduce their face and identity "
                "EXACTLY, do NOT alter, beautify, or idealize facial features. "
            )
        elif has_target_box:
            img_roles = (
                "IMAGE ROLES — Image 1: source thumbnail (composition reference). "
                "Image 2: zoomed crop showing the region to edit (targeting aid only — "
                "never reproduce as an output element). "
            )
        elif has_character_refs:
            img_roles = (
                "IMAGE ROLES — Image 1: source thumbnail (composition reference). "
                "Remaining images: character references — reproduce their face and "
                "identity EXACTLY, do NOT alter, beautify, or idealize facial features. "
            )
        else:
            img_roles = "The first uploaded image is the source thumbnail. "

        full_prompt = (
            f"{img_roles}"
            "Keep its composition, lighting and overall look, then apply the "
            "requested edit literally. "
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


# ──────────────────────────────────────────────────────────────────────────────
# POST /thumbnail/describe-youtube-thumbnail
# Given a YouTube URL, fetch the video's thumbnail image and ask Gemini to
# describe it in rich detail — composition, subject, lighting, colour palette,
# text overlays, mood. The frontend pipes this description straight back into
# the prompt textarea whenever a user pastes a YouTube link, so the prompt
# becomes "make me a thumbnail that looks like this" without the user having
# to type anything themselves.
#
# Free endpoint (no credits deducted) — this is purely a helper that makes
# the prompt UX nicer.
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/describe-youtube-thumbnail")
async def describe_youtube_thumbnail(
    current_user: Annotated[User, Depends(get_current_user)],
    url: str = Form(..., description="Any YouTube URL — watch, shorts, youtu.be, embed"),
):
    video_id = extract_youtube_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Not a valid YouTube URL.")

    img_bytes = await fetch_youtube_thumbnail(video_id)
    if not img_bytes:
        raise HTTPException(
            status_code=404,
            detail="Couldn't fetch a thumbnail for that video.",
        )

    # YouTube thumbnails are always JPEG.
    mime = "image/jpeg"
    if img_bytes[:8].startswith(b"\x89PNG"):
        mime = "image/png"

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY is not set!")
        raise HTTPException(status_code=500, detail="AI service not configured.")

    client = genai.Client(api_key=api_key)

    # Prompt tuned for YouTube-thumbnail semantics: we want the description
    # to be rich enough to feed directly into Nano Banana Pro as a
    # standalone prompt. Emphasise the elements that matter for YouTube
    # CTR: composition, subject pose/expression, colour palette, lighting,
    # any visible text, overall mood. Output stays paragraph-form (not a
    # bulleted list) because it slots into the prompt textarea as-is.
    #
    # IMPORTANT — people are described GENERICALLY. The user will plug in
    # their own avatar via @mention, so we must NOT lock in the original
    # person's physical attributes (beard, hair colour, eye colour, skin
    # tone, age, specific clothing). Otherwise those details conflict with
    # the avatar at generation time. Stick to role + pose + expression.
    prompt_text = (
        "Describe this YouTube thumbnail in precise detail so that an AI image "
        "generator could recreate the SCENE (not the specific people). "
        "Format: one paragraph, 3-5 sentences, no bullet points. Cover: "
        "(1) composition and 16:9 framing, "
        "(2) any people present — but ONLY their role/archetype, pose, gesture, "
        "facial expression and rough placement in the frame. Use generic "
        "references like 'a man', 'a woman', 'a person', 'two people'. "
        "DO NOT describe physical features (no beard, no hair colour or style, "
        "no eye colour, no skin tone, no age, no ethnicity). "
        "DO NOT describe their specific clothing (no brand, no colour of shirt, "
        "no outfit details) — just mention clothing type only if it's essential "
        "to the scene (e.g. 'in sports gear', 'in formal attire'). "
        "(3) non-human subjects and props — these CAN be described in full "
        "detail (cars, food, logos, screens, etc.), "
        "(4) colour palette and lighting style of the overall image "
        "(saturated/moody/high-contrast/etc.), "
        "(5) any text overlay including exact wording, font style and colour, "
        "(6) overall mood and visual style (cinematic, cartoonish, "
        "MrBeast-style, photorealistic, etc.). "
        "Be specific and vivid about the scene, composition, objects and "
        "atmosphere — but keep people deliberately vague so the user can "
        "substitute their own character. Do not add any preamble like "
        "'Here is the description'; just write the description directly."
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=img_bytes, mime_type=mime),
                prompt_text,
            ],
        )
        description = ""
        if response and response.text:
            description = response.text.strip()
        if not description:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty description.",
            )

        # Scrub any leading boilerplate the model sometimes still adds despite
        # the instruction ("Here's a description:", "This thumbnail shows…").
        # We keep the rest of the paragraph intact.
        description = re.sub(
            r"^(?:here(?:'s| is)?(?: a| the)?\s+description[:.]?\s*|"
            r"this (?:youtube )?thumbnail (?:shows|depicts|features)\s+)",
            "",
            description,
            flags=re.IGNORECASE,
        ).strip()

        return {
            "description": description,
            "video_id": video_id,
        }
    except HTTPException:
        raise
    except APIError as e:
        logger.error(f"Gemini describe-youtube-thumbnail failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"AI description failed: {e}",
        )
    except Exception as e:
        logger.error(f"describe-youtube-thumbnail unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Describe failed: {str(e)}")


# ──────────────────────────────────────────────────────────────────────────────
# POST /thumbnail/describe-region
# Given a source image (YouTube URL, arbitrary URL, or uploaded file) and a
# fractional bounding box, return a short label describing what's inside it.
# The frontend calls this whenever the user draws a CUSTOM rectangle on the
# source thumbnail so the box's default "Custom selection" label is replaced
# with something meaningful like "blue t-shirt" or "red coffee mug". That
# label then feeds into /thumbnail/generate as `target_label` so the AI
# actually knows what the rectangle covers.
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/describe-region")
async def describe_region(
    current_user: Annotated[User, Depends(get_current_user)],
    box_x: float = Form(..., description="Fractional left edge (0-1)"),
    box_y: float = Form(..., description="Fractional top edge (0-1)"),
    box_w: float = Form(..., description="Fractional width (0-1)"),
    box_h: float = Form(..., description="Fractional height (0-1)"),
    youtube_url: Optional[str] = Form(None, description="YouTube URL — we'll fetch the video's thumbnail"),
    image_url: Optional[str] = Form(None, description="Direct image URL"),
    files: List[UploadFile] = File(default=[], description="Uploaded source image"),
):
    # Validate the box rectangle first so bogus inputs fail fast.
    if not (
        0.0 <= box_x <= 1.0
        and 0.0 <= box_y <= 1.0
        and box_w > 0.005
        and box_h > 0.005
        and box_x + box_w <= 1.001
        and box_y + box_h <= 1.001
    ):
        raise HTTPException(
            status_code=400,
            detail="Box coordinates must be fractions in [0,1] with width/height > 0.005.",
        )

    # Resolve the source image to bytes. We support three inputs — the same
    # set the /detect-people endpoint accepts — so the frontend can reuse
    # whatever it has on hand.
    img_bytes: Optional[bytes] = None
    real_files = [f for f in files if f.filename and f.size and f.size > 0]
    if real_files:
        img_bytes = await real_files[0].read()
    elif youtube_url:
        vid = extract_youtube_id(youtube_url)
        if not vid:
            raise HTTPException(status_code=400, detail="Not a valid YouTube URL.")
        img_bytes = await fetch_youtube_thumbnail(vid)
        if not img_bytes:
            raise HTTPException(
                status_code=404,
                detail="Couldn't fetch that video's thumbnail.",
            )
    elif image_url:
        try:
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.get(image_url)
            if r.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail=f"Couldn't fetch image (HTTP {r.status_code}).",
                )
            img_bytes = r.content
        except httpx.RequestError as e:
            raise HTTPException(status_code=400, detail=f"Fetch failed: {e}")
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide a YouTube URL, image URL, or uploaded file.",
        )

    if not img_bytes or len(img_bytes) < 500:
        raise HTTPException(status_code=400, detail="Source image is empty.")

    # Crop to the box (with a small padding for context).
    crop_bytes = crop_region(img_bytes, box_x, box_y, box_w, box_h)
    if not crop_bytes:
        raise HTTPException(
            status_code=400,
            detail="Couldn't crop the selected region.",
        )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured.")

    client = genai.Client(api_key=api_key)
    # Short, concrete label — this plugs straight into target_label so it
    # needs to read like a noun phrase, not a sentence. Examples we
    # optimise for: "blue cotton t-shirt", "red coffee mug", "bold white
    # title text", "subject's face".
    prompt_text = (
        "Describe the main object visible in this cropped image as a short "
        "noun phrase (3-8 words max). Focus on colour, material, and the "
        "single most salient object — not the whole scene. Do not include "
        "any preamble; output only the noun phrase. Examples of the "
        "desired style: 'blue cotton t-shirt', 'red coffee mug on desk', "
        "'bold yellow title text', 'blond man's face'."
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=crop_bytes, mime_type="image/png"),
                prompt_text,
            ],
        )
        label = ""
        if response and response.text:
            label = response.text.strip()
        # Strip obvious boilerplate + trailing punctuation.
        label = re.sub(r"^(?:the\s+)?", "", label, flags=re.IGNORECASE).strip(" .\"'")
        # Cap the length defensively — models occasionally produce a whole
        # paragraph despite the instruction. Taking the first sentence is
        # almost always the noun phrase we asked for.
        if len(label) > 80:
            label = label.split(".")[0].strip()
        if not label:
            label = "selected region"
        return {"label": label}
    except APIError as e:
        logger.error(f"describe-region Gemini error: {e}")
        raise HTTPException(status_code=502, detail=f"AI description failed: {e}")
    except Exception as e:
        logger.error(f"describe-region unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Describe failed: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# GET /thumbnail/inspiration
# Returns top-performing YouTube thumbnails for a given niche so creators can
# browse real examples before generating their own. Results are cached in
# memory for 24 hours to avoid burning YouTube quota on every page load.
# ──────────────────────────────────────────────────────────────────────────────
def _niches_metadata() -> list[dict]:
    """Return a compact list of niche metadata for the frontend pill row."""
    return [
        {"key": key, "label": v["label"], "emoji": v["emoji"]}
        for key, v in INSPIRATION_NICHES.items()
    ]


@router.get("/inspiration")
async def get_inspiration(
    current_user: Annotated[User, Depends(get_current_user)],
    niche: str = "business",
    limit: int = 12,
):
    """
    Return top-performing YouTube thumbnails for the requested niche.

    Quality filters applied automatically:
    - Long-format only (videoDuration=long, i.e. >20 min) — eliminates all Shorts
    - English-language results (relevanceLanguage=en)
    - Western region (regionCode=US)
    - Channels with ≥ 5 000 subscribers (secondary channel API call)

    If no YOUTUBE_API_KEY is configured the endpoint returns 200 with
    `needs_api_key: True` so the frontend shows a friendly setup screen.
    """
    niches_meta = _niches_metadata()

    api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        return {
            "needs_api_key": True,
            "niches": niches_meta,
            "videos": [],
        }

    if niche not in INSPIRATION_NICHES:
        niche = "business"

    limit = max(1, min(limit, 50))
    # v5 prefix busts old cache entries (Shorts filter + new queries).
    cache_key = f"v5_{niche}_{limit}"
    _CACHE_TTL = 86400  # 24 hours

    cached = _inspiration_cache.get(cache_key)
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL:
        return {
            "needs_api_key": False,
            "niche": niche,
            "niches": niches_meta,
            "videos": cached["videos"],
        }

    niche_cfg = INSPIRATION_NICHES[niche]
    videos: list[dict] = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Search for the most-viewed English-language videos for this niche.
            # videoDuration=medium (4-20 min) eliminates Shorts without
            # the excessive restrictions that previously caused 0 results.
            # We no longer use regionCode (too restrictive) or a subscriber
            # count filter (caused empty niches). safeSearch blocks bad content.
            search_resp = await client.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "snippet",
                    "q": niche_cfg["query"],
                    "type": "video",
                    "maxResults": min(limit * 2 + 5, 50),  # buffer for Shorts slip-through
                    "order": "viewCount",
                    "videoEmbeddable": "true",
                    "videoDuration": "medium",   # 4–20 min: eliminates Shorts
                    "relevanceLanguage": "en",   # English results only
                    "safeSearch": "moderate",
                    "key": api_key,
                },
            )

            if search_resp.status_code != 200:
                logger.warning(
                    f"YouTube search API returned {search_resp.status_code} "
                    f"for niche={niche}: {search_resp.text[:200]}"
                )
            else:
                _SHORTS_RE = re.compile(r"#shorts?", re.IGNORECASE)
                items = search_resp.json().get("items", [])

                for item in items:
                    vid_id = item.get("id", {}).get("videoId")
                    snippet = item.get("snippet", {})
                    title = snippet.get("title", "")

                    if not vid_id:
                        continue

                    # Secondary guard: skip anything with #Shorts in the title
                    # in case a Short slips through the duration filter.
                    if _SHORTS_RE.search(title):
                        continue

                    # Use API-provided thumbnail URLs (guaranteed to exist).
                    thumbs = snippet.get("thumbnails", {})
                    thumb_url = (
                        thumbs.get("maxres", {}).get("url")
                        or thumbs.get("standard", {}).get("url")
                        or thumbs.get("high", {}).get("url")
                        or f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
                    )

                    videos.append(
                        {
                            "video_id": vid_id,
                            "title": title,
                            "channel": snippet.get("channelTitle", ""),
                            "thumbnail_url": thumb_url,
                            "youtube_url": f"https://www.youtube.com/watch?v={vid_id}",
                        }
                    )

                    if len(videos) >= limit:
                        break

    except httpx.HTTPError as e:
        logger.error(f"inspiration YouTube fetch error for niche={niche}: {e}")

    # Cache even an empty result to avoid hammering the API on quota exceeded.
    _inspiration_cache[cache_key] = {"ts": time.time(), "videos": videos}

    return {
        "needs_api_key": False,
        "niche": niche,
        "niches": niches_meta,
        "videos": videos,
    }


# ──────────────────────────────────────────────────────────────────────────────
# POST /thumbnail/smart-prompt  (v4)
# Exact three-step pipeline that replicates what the user does manually:
#   1. Ask Gemini to convert niche + title + description → short YouTube query
#   2. Search YouTube with that query → pick the most-viewed relevant video
#   3. Describe that video's thumbnail with the EXACT same Gemini call used by
#      /describe-youtube-thumbnail — guaranteed same quality as pasting a URL
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/smart-prompt")
async def generate_smart_prompt(
    current_user: Annotated[User, Depends(get_current_user)],
    niche: str = Form(...),
    video_title: str = Form(...),
    video_description: str = Form(""),
):
    """
    v5 — Multi-source random-sampled synthesis:
    Step 1: Gemini generates a YouTube search query from the creator's inputs.
    Step 2: Run 2 YouTube searches (topic + niche-boost) → collect up to 15 unique
            candidate videos → randomly sample 3 for diversity (different result
            every call, no repetition).
    Step 3: Describe each of the 3 thumbnails INDIVIDUALLY with the exact same
            Gemini call as /describe-youtube-thumbnail.
    Step 4: Synthesise a COMPLETELY ORIGINAL scene description (min 100 words)
            that MIXES elements from all 3 references into something new —
            never a copy of any single thumbnail.
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not gemini_key:
        raise HTTPException(status_code=500, detail="AI service not configured.")
    youtube_key = os.getenv("YOUTUBE_API_KEY", "").strip()

    gemini_client = genai.Client(api_key=gemini_key)

    _BOILERPLATE_RE = re.compile(
        r"^(?:here(?:'s| is)?(?: a| the)?\s+description[:.]?\s*|"
        r"this (?:youtube )?thumbnail (?:shows|depicts|features)\s+)",
        re.IGNORECASE,
    )

    # ── Step 1: Gemini converts creator inputs → YouTube search query ─────────
    desc_extra = f"\n- What the video is about: {video_description}" if video_description.strip() else ""
    query_instruction = (
        f"A YouTube creator has this video concept:\n"
        f"- Niche: {niche}\n"
        f"- Title: {video_title}{desc_extra}\n\n"
        "Generate a short YouTube search query (5-8 English words) that someone "
        "would actually type in the YouTube search bar to find videos about this "
        "exact topic. The query must be in English regardless of the input language. "
        "Focus on the core topic. Return ONLY the search query, no quotes."
    )
    search_query = f"{niche} {video_title}"
    try:
        q_resp = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Part.from_text(text=query_instruction)],
            config=types.GenerateContentConfig(temperature=0.3, max_output_tokens=40),
        )
        q = (q_resp.text or "").strip().strip('"').strip("'")
        if q:
            search_query = q
        logger.info(f"smart_prompt: search query → '{search_query}'")
    except Exception as e:
        logger.warning(f"smart_prompt: query generation failed: {e}")

    # Niche-boost query for a second search pass (proven high-CTR channels)
    _NICHE_BOOST: dict[str, str] = {
        "business":       "iman gadzhi yomi denzel make money online",
        "entrepreneurship": "iman gadzhi yomi denzel side hustle income",
        "finance":        "graham stephan andrei jikh passive income investing",
        "money":          "iman gadzhi yomi denzel make money online",
        "ecommerce":      "dropshipping shopify make money ecommerce results",
        "fitness":        "athlean-x jeff nippard workout transformation before after",
        "gaming":         "markiplier unspeakable gaming challenge best moments",
        "entertainment":  "mrbeast viral challenge experiment",
        "tech":           "mkbhd linus tech tips review unboxing",
        "travel":         "travel vlog adventure viral challenge explore",
        "food":           "viral food challenge cooking recipe best",
        "saas":           "build saas ai tool income results",
        "software":       "build saas tool passive income results",
    }
    niche_lower = niche.lower()
    boost_query = next(
        (v for k, v in _NICHE_BOOST.items() if k in niche_lower),
        f"{niche} viral income results",
    )

    # ── Step 2: Two YouTube searches → collect up to 15 unique candidates ─────
    candidates: list[tuple[str, str]] = []   # (video_id, title)
    seen_ids: set[str] = set()

    if youtube_key:
        for q in [search_query, boost_query]:
            try:
                async with httpx.AsyncClient(timeout=12.0) as yt:
                    resp = await yt.get(
                        "https://www.googleapis.com/youtube/v3/search",
                        params={
                            "part": "snippet",
                            "q": q,
                            "type": "video",
                            "maxResults": 10,
                            "order": "viewCount",
                            "relevanceLanguage": "en",
                            "safeSearch": "moderate",
                            "key": youtube_key,
                        },
                    )
                if resp.status_code != 200:
                    continue
                for item in resp.json().get("items", []):
                    vid_id = item.get("id", {}).get("videoId")
                    if not vid_id or vid_id in seen_ids:
                        continue
                    title = item.get("snippet", {}).get("title", "")
                    if re.search(r"#shorts?|official (music|video|mv|audio)", title, re.IGNORECASE):
                        continue
                    seen_ids.add(vid_id)
                    candidates.append((vid_id, title))
            except Exception as e:
                logger.warning(f"smart_prompt: YouTube search failed for '{q}': {e}")
    else:
        logger.warning("smart_prompt: YOUTUBE_API_KEY not set")

    # Randomly sample 3 from the pool → different result every call
    pool = candidates[:15]
    random.shuffle(pool)
    selected = pool[:3]
    logger.info(f"smart_prompt: selected {len(selected)} videos from {len(candidates)} candidates")

    # ── Step 3: Describe each thumbnail individually (exact describe-youtube) ──
    _DESCRIBE_PROMPT = (
        "Describe this YouTube thumbnail in precise detail so that an AI image "
        "generator could recreate the SCENE (not the specific people). "
        "Format: one paragraph, 4-6 sentences, no bullet points. Cover: "
        "(1) composition and 16:9 framing, "
        "(2) any people present — ONLY their role/archetype, pose, gesture, "
        "facial expression and placement. Use 'a man', 'a woman', 'a person'. "
        "NO physical features, NO clothing colour or brand. "
        "(3) non-human subjects and props in FULL detail "
        "(money, cars, phones, screens, food, logos — name every object explicitly), "
        "(4) colour palette and lighting style, "
        "(5) any text overlay — exact wording, font style, colour and placement, "
        "(6) overall mood and visual style (MrBeast-style, cinematic, etc.). "
        "Be extremely specific and vivid. Do not add any preamble."
    )

    ref_descriptions: list[tuple[str, str]] = []   # (title, description)
    for vid_id, title in selected:
        img_bytes = await fetch_youtube_thumbnail(vid_id)
        if not img_bytes:
            continue
        mime = "image/png" if img_bytes[:4] == b"\x89PNG" else "image/jpeg"
        try:
            d_resp = gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type=mime),
                    types.Part.from_text(text=_DESCRIBE_PROMPT),
                ],
            )
            desc = _BOILERPLATE_RE.sub("", (d_resp.text or "").strip()).strip()
            if desc and len(desc) > 60:
                ref_descriptions.append((title, desc))
                logger.info(f"smart_prompt: described '{title[:50]}' ({len(desc)} chars)")
        except Exception as e:
            logger.warning(f"smart_prompt: describe failed for {vid_id}: {e}")

    # ── Step 4: Synthesise a COMPLETELY ORIGINAL scene from the 3 descriptions ─
    # Pure-text call — no images. Gemini mixes elements from 3 real thumbnails
    # into something new, adapted to the creator's video concept.
    # Guaranteed minimum length: 100 words, all 6 required elements.

    if ref_descriptions:
        refs_block = "\n\n".join(
            f"THUMBNAIL {i+1} (from \"{t}\"):\n{d}"
            for i, (t, d) in enumerate(ref_descriptions)
        )
        synthesis_prompt = (
            "You are a creative director specialised in viral YouTube thumbnails.\n\n"
            f"A creator needs a thumbnail for their video:\n"
            f"- Niche: {niche}\n"
            f"- Title: {video_title}{desc_extra}\n\n"
            f"Here are {len(ref_descriptions)} real thumbnail descriptions from "
            f"top YouTube videos in this niche:\n\n"
            f"{refs_block}\n\n"
            "TASK: Create a COMPLETELY ORIGINAL scene description for the creator's "
            "video by MIXING elements from all the thumbnails above. "
            "Do NOT copy any single thumbnail — take:\n"
            "• The composition style (person position, split/single/before-after) from one\n"
            "• The specific prop types and scene setting from another\n"
            "• The text overlay style and wording approach from another\n"
            "Then ADAPT and INVENT new details specific to the creator's video concept.\n\n"
            "STRICT RULES:\n"
            "✗ Do NOT start with 'A 16:9 thumbnail', 'This thumbnail', 'Here is'\n"
            "✗ Do NOT use: viral, engaging, compelling, CTR, dynamic, strategic\n"
            "✗ Do NOT copy any sentence from the references above\n"
            "✓ Start: 'A man / A woman / A person, [exact position], [what they do], [expression].'\n"
            "✓ Name EVERY prop explicitly: not 'money' → 'a thick stack of €50 bills'; "
            "not 'a laptop' → 'an open MacBook Pro showing a Stripe dashboard with €3,200'; "
            "not 'a car' → 'a matte black Lamborghini Urus'\n"
            "✓ Person: role + pose + hand gesture + exact facial expression + position only. "
            "NO hair, NO skin tone, NO clothing colour.\n"
            "✓ Include exact text overlay wording (ALL CAPS YouTube style matching the video topic)\n\n"
            "FORMAT: ONE flowing paragraph, minimum 100 words, 5-7 sentences. "
            "Cover: person → hands/objects → foreground props → background → "
            "lighting/colours → text overlay → visual style.\n\n"
            "Return ONLY the scene description. No preamble. No explanation."
        )
        try:
            s_resp = gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[types.Part.from_text(text=synthesis_prompt)],
                config=types.GenerateContentConfig(temperature=0.9),
            )
            generated = _BOILERPLATE_RE.sub("", (s_resp.text or "").strip()).strip()
            if generated and len(generated) > 80:
                logger.info(f"smart_prompt: synthesis done ({len(generated)} chars, {len(generated.split())} words)")
                return {
                    "prompt": generated,
                    "references_used": len(ref_descriptions),
                    "search_query": search_query,
                }
        except Exception as e:
            logger.error(f"smart_prompt: synthesis failed: {e}")

    # ── Fallback: no references available → pure creative generation ──────────
    logger.warning("smart_prompt: no references, using creative fallback")
    fallback_prompt = (
        f"You are a YouTube thumbnail creative director.\n"
        f"Write a vivid, photorealistic scene description for a thumbnail about:\n"
        f"- Niche: {niche}\n"
        f"- Video: {video_title}{desc_extra}\n\n"
        "ONE paragraph, minimum 100 words, 5-7 sentences. "
        "Cover: person (role+pose+expression, no appearance), specific named props, "
        "exact background, lighting, text overlay with exact wording. "
        "Start with the person. No preamble."
    )
    try:
        fb = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Part.from_text(text=fallback_prompt)],
            config=types.GenerateContentConfig(temperature=0.9),
        )
        generated = _BOILERPLATE_RE.sub("", (fb.text or "").strip()).strip()
        if not generated:
            raise HTTPException(status_code=502, detail="Could not generate a prompt.")
        return {"prompt": generated, "references_used": 0, "search_query": search_query}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"smart_prompt: fallback failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate prompt.")


# ──────────────────────────────────────────────────────────────────────────────
# App Store Screenshot Studio
#
# Three endpoints:
#   POST /thumbnail/appstore-brief    — strategist: context → 5-screen JSON
#   POST /thumbnail/generate-appstore — generator: brief → 5 PNGs in storage
#   GET  /thumbnail/appstore-scrape   — optional iTunes lookup pre-fill
#
# The frontend's flow is brief → human edit → generate, so the brief endpoint
# is intentionally cheap and idempotent (no credits, no DB write). All credit
# spend happens at generation time.
# ──────────────────────────────────────────────────────────────────────────────

APPSTORE_FORMATS = {
    "iphone67": {"label": 'iPhone 6.7"', "w": 1290, "h": 2796},
    "iphone69": {"label": 'iPhone 6.9"', "w": 1320, "h": 2868},
    "android":  {"label": "Android Phone", "w": 1242, "h": 2208},
}
APPSTORE_DEFAULT_FORMAT = "iphone67"

# Gemini 3 Pro Image accepts a fixed set of aspect ratios; "9:16" is the
# closest portrait-phone ratio it natively supports. iPhone 6.7"/6.9"
# screenshots are slightly more elongated than 9:16 but the difference
# is invisible at App Store scale and avoids generating black bars.
APPSTORE_GEMINI_RATIO = "9:16"

MAX_REAL_SCREENSHOTS = 8     # cap to keep token spend reasonable
MAX_PACK_SIZE = 5            # always 5 screenshots in a pack


@router.post("/appstore-brief")
async def appstore_brief(
    current_user: Annotated[User, Depends(get_current_user)],
    app_name: str = Form(..., description="The app's name as it will appear"),
    what_it_does: str = Form(..., description="2-5 sentences describing the product"),
    who_for: str = Form(..., description="1-2 sentences describing the target audience"),
    vertical: Optional[str] = Form(None, description="Hint: ai | productivity | social | utility | lifestyle | …"),
    tone: Optional[str] = Form(None, description="Hint: playful | premium | professional | energetic | calm | spiritual"),
    color_primary: Optional[str] = Form(None, description="Hex like #FF6B35"),
    color_secondary: Optional[str] = Form(None, description="Hex like #1A1A1A"),
    social_proof: Optional[str] = Form(None, description="Comma-separated, e.g. '★ 4.8, 100k users'"),
    real_screenshots: List[UploadFile] = File(default=[], description="Optional real app screens to ground the AI"),
):
    """
    Stage 1: feed raw context to the strategist, get a structured 5-screen
    narrative back. The user can edit this before triggering generation.
    """
    if not app_name.strip() or not what_it_does.strip() or not who_for.strip():
        raise HTTPException(status_code=400, detail="app_name, what_it_does and who_for are required.")

    if len(real_screenshots) > MAX_REAL_SCREENSHOTS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_REAL_SCREENSHOTS} real screenshots allowed.",
        )

    # Read uploaded reference screenshots into bytes.
    screen_bytes: list[bytes] = []
    for f in real_screenshots:
        data = await f.read()
        if data:
            screen_bytes.append(data)

    # Pick a style anchor from our curated library for the strategist to
    # draw inspiration from. Falls back to keyword heuristic when the
    # vertical isn't a 1:1 match.
    style_anchor = niche_loader.pick_pack_for(
        vertical=vertical,
        description=f"{app_name} {what_it_does} {who_for}",
    )

    proof_list = (
        [s.strip() for s in social_proof.split(",") if s.strip()]
        if social_proof
        else None
    )

    brief = await design_appstore_brief(
        app_name=app_name.strip(),
        what_it_does=what_it_does.strip(),
        who_for=who_for.strip(),
        vertical_hint=vertical,
        tone_pref=tone,
        color_primary=color_primary,
        color_secondary=color_secondary,
        social_proof=proof_list,
        real_screenshots=screen_bytes or None,
        style_anchor_pack=style_anchor,
    )

    if not brief:
        raise HTTPException(
            status_code=502,
            detail="The strategist failed to produce a usable brief. Try again — usually a temporary upstream issue.",
        )

    return {
        "status": "ok",
        "brief": brief,
        "style_anchor": (
            {
                "name": style_anchor["name"],
                "vertical": style_anchor["vertical"],
                "slug": style_anchor["slug"],
                "palette": style_anchor.get("palette", []),
            }
            if style_anchor
            else None
        ),
        "credit_cost_to_generate": CREDIT_COST_APPSTORE_PACK,
    }


def _compose_appstore_screen_prompt(
    *,
    screen: dict,
    app_name: str,
    color_primary: Optional[str],
    color_secondary: Optional[str],
    has_real_ui: bool,
    has_brand_logo: bool,
    style_anchor_summary: Optional[str],
) -> str:
    """Build the Gemini text prompt for one screenshot."""

    palette = ", ".join(screen.get("palette_hex", [])[:4]) or "(infer)"
    headline = screen["headline"]
    sub = screen.get("subheadline") or ""
    treatment = screen.get("mockup_treatment", "tilted-phone")
    visual = screen.get("visual_direction", "")

    parts: list[str] = [
        f"Design App Store screenshot {screen['screen']} of 5 for the app named \"{app_name}\".",
        f"This screenshot's role in the conversion funnel: {screen['purpose'].upper()}.",
        f"Aspect: vertical mobile (9:16). Output is a single still image, not a multi-image grid.",
        "",
        f"HEADLINE (render exactly, large, bold, sharp, perfectly legible at App Store scale): \"{headline}\"",
    ]
    if sub:
        parts.append(f"SUBHEADLINE (smaller, secondary weight, beneath the headline): \"{sub}\"")
    parts += [
        "",
        f"PALETTE: {palette}.",
        f"PRIMARY brand colour (use as dominant): {color_primary or '(use palette)'}.",
        f"SECONDARY brand colour: {color_secondary or '(use palette)'}.",
        "",
        f"VISUAL DIRECTION: {visual}",
        f"MOCKUP TREATMENT: {treatment}.",
    ]
    if style_anchor_summary:
        parts += ["", f"STYLE ANCHOR (use as inspiration for typography rhythm, mockup vibe, callout shapes): {style_anchor_summary}"]

    if has_real_ui:
        parts += [
            "",
            "REAL UI REFERENCE: the user provided actual screenshots of their app. "
            "When you render any device mockup, the screen content MUST reflect their real UI "
            "(layout, colours, components shown). Do NOT invent fake UI screens.",
        ]
    else:
        parts += [
            "",
            "NO REAL UI PROVIDED: do not render specific app interface details inside any "
            "device mockup — keep mockup screens abstract (gradient, blur, brand-coloured fill, "
            "or a single iconic illustration). Treatments like text-only, illustration-led, "
            "or mascot-led are preferred over fake UI.",
        ]

    if has_brand_logo:
        parts += [
            "",
            "BRAND ICON REFERENCE: the user provided their app icon. If your composition uses an "
            "app-icon element, reproduce theirs faithfully. Do not redesign it.",
        ]

    parts += [
        "",
        "HARD RULES:",
        "- Render the headline EXACTLY as written above. No paraphrasing, no abbreviating, no extra punctuation.",
        "- The headline must be the dominant typographic element. Highest contrast. Legible at thumb size.",
        "- No mock device clock, no fake battery/signal indicators outside an actual phone status bar.",
        "- No watermarks, no Apple/Google logos, no App Store badges.",
        "- The output is a SINGLE flat composition — never a grid of mini-screenshots.",
        "- Match the colour palette tightly. Do not introduce off-palette colours.",
        f"- Tone consistency check: this screen must read as part of the same series as the other 4. The shared mood is set by the brief's `tone_used` field.",
    ]
    return "\n".join(parts)


@router.post("/generate-appstore")
async def generate_appstore_pack(
    current_user: Annotated[User, Depends(get_current_user)],
    brief: str = Form(..., description="JSON-encoded brief from /appstore-brief (possibly user-edited)"),
    app_name: str = Form(...),
    color_primary: Optional[str] = Form(None),
    color_secondary: Optional[str] = Form(None),
    format: str = Form(APPSTORE_DEFAULT_FORMAT, description="iphone67 | iphone69 | android"),
    vertical: Optional[str] = Form(None, description="Used to load style-anchor refs"),
    style_anchor_slug: Optional[str] = Form(None, description="Specific niche pack slug (else auto)"),
    icon: Optional[UploadFile] = File(None, description="App icon (square)"),
    real_screenshots: List[UploadFile] = File(default=[], description="Real screens of the app"),
):
    """
    Stage 2: render the 5 screenshots from a brief.

    Costs CREDIT_COST_APPSTORE_PACK credits. Each screen lands in
    `generated_images` so they show up in the user's gallery and history.
    """
    fmt = APPSTORE_FORMATS.get(format)
    if not fmt:
        raise HTTPException(status_code=400, detail=f"Unknown format '{format}'. Use one of: {list(APPSTORE_FORMATS)}")

    try:
        brief_data = json.loads(brief)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="`brief` must be valid JSON.")
    screens = brief_data.get("screens") if isinstance(brief_data, dict) else None
    if not isinstance(screens, list) or len(screens) != MAX_PACK_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"`brief.screens` must be a list of exactly {MAX_PACK_SIZE} items.",
        )
    for s in screens:
        if not isinstance(s, dict) or not (s.get("headline") or "").strip():
            raise HTTPException(status_code=400, detail="Every screen must have a headline.")

    # Credit gate (admins free).
    if not is_admin(current_user):
        balance = get_balance(current_user["id"])
        if balance < CREDIT_COST_APPSTORE_PACK:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "INSUFFICIENT_CREDITS",
                    "message": f"You need {CREDIT_COST_APPSTORE_PACK} credit(s). Current balance: {balance}",
                },
            )

    pack_id = str(uuid.uuid4())
    logger.info(f"App Store pack {pack_id} for user {current_user['id']} ({format})")

    # Read brand assets.
    icon_bytes: Optional[bytes] = None
    icon_mime: str = "image/png"
    if icon is not None:
        icon_bytes = await icon.read()
        icon_mime = icon.content_type or "image/png"

    real_ui_bytes: list[tuple[bytes, str]] = []
    for f in real_screenshots[:MAX_REAL_SCREENSHOTS]:
        data = await f.read()
        if data:
            real_ui_bytes.append((data, f.content_type or "image/png"))

    # Load style anchor (the curated reference pack).
    anchor = (
        niche_loader.load_pack(vertical, style_anchor_slug)
        if vertical
        else niche_loader.pick_pack_for(
            vertical=brief_data.get("vertical_used"),
            description=app_name,
        )
    )
    anchor_summary = niche_loader.style_profile_summary(anchor) if anchor else None
    anchor_ref_bytes: list[bytes] = []
    if anchor:
        # Two screens from the anchor pack as visual style references — enough
        # to teach the model the rhythm without flooding token budget.
        for path in anchor["screen_paths"][:2]:
            data = niche_loader.read_reference_bytes(path)
            if data:
                anchor_ref_bytes.append(data)

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    generated_urls: list[str] = []
    failed_screens: list[int] = []

    for idx, screen in enumerate(screens, start=1):
        try:
            prompt = _compose_appstore_screen_prompt(
                screen=screen,
                app_name=app_name,
                color_primary=color_primary,
                color_secondary=color_secondary,
                has_real_ui=bool(real_ui_bytes),
                has_brand_logo=icon_bytes is not None,
                style_anchor_summary=anchor_summary,
            )

            contents: list = []
            # Order matters: anchor refs first (style), brand assets next
            # (identity), real UI last (content). Image numbering in the
            # prompt isn't critical because we describe roles by content,
            # not by index.
            for ref in anchor_ref_bytes:
                contents.append(types.Part.from_bytes(data=ref, mime_type="image/jpeg"))
            if icon_bytes:
                contents.append(types.Part.from_bytes(data=icon_bytes, mime_type=icon_mime))
            for data, mime in real_ui_bytes[:3]:  # cap per screen
                contents.append(types.Part.from_bytes(data=data, mime_type=mime))
            contents.append(prompt)

            response = client.models.generate_content(
                model="gemini-3-pro-image-preview",
                contents=contents,
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"],
                    image_config=types.ImageConfig(
                        aspect_ratio=APPSTORE_GEMINI_RATIO,
                        image_size="2K",
                    ),
                ),
            )

            if not response.candidates or not response.candidates[0].content:
                failed_screens.append(idx)
                generated_urls.append("")
                continue
            cand = response.candidates[0]
            img_bytes: Optional[bytes] = None
            for part in cand.content.parts or []:
                if part.inline_data:
                    img_bytes = part.inline_data.data
                    break
            if not img_bytes:
                failed_screens.append(idx)
                generated_urls.append("")
                continue

            # Persist to storage.
            screen_id = f"{pack_id}-{idx}"
            storage_path = f"thumbnails/{current_user['id']}/{screen_id}.png"
            supabase.storage.from_("avatars").upload(
                path=storage_path,
                file=img_bytes,
                file_options={"content-type": "image/png", "x-upsert": "true"},
            )
            url = supabase.storage.from_("avatars").get_public_url(storage_path)
            generated_urls.append(url)

            # History row — re-uses the existing thumbnail prefix scheme so
            # the gallery picks them up. Mode "appstore" is new but harmless
            # (the parser treats unknown modes as opaque labels).
            try:
                prefix = encode_thumbnail_prefix(
                    f"appstore-{idx}",
                    APPSTORE_GEMINI_RATIO,
                )
                supabase.table("generated_images").insert({
                    "id": screen_id,
                    "user_id": current_user["id"],
                    "avatar_id": None,
                    "prompt": f"{prefix} [pack:{pack_id}] {screen['headline']}",
                    "image_url": url,
                    "storage_path": storage_path,
                }).execute()
            except Exception as db_err:
                logger.error(f"history insert failed for {screen_id}: {db_err}")

        except APIError as api_err:
            logger.error(f"Gemini API error on screen {idx}: {api_err}")
            failed_screens.append(idx)
            generated_urls.append("")
        except Exception as e:
            logger.error(f"screen {idx} failed: {e}")
            failed_screens.append(idx)
            generated_urls.append("")

    successful = sum(1 for u in generated_urls if u)
    if successful == 0:
        raise HTTPException(
            status_code=502,
            detail="All 5 screen generations failed. No credits charged.",
        )

    # Charge proportionally when partial. Always charge full when all 5 ship.
    if not is_admin(current_user):
        if successful == MAX_PACK_SIZE:
            charge = CREDIT_COST_APPSTORE_PACK
        else:
            charge = successful * CREDIT_COST_APPSTORE_PER_SCREEN
        deduct_credits(
            current_user["id"],
            charge,
            "appstore_pack",
            f"App Store pack ({successful}/{MAX_PACK_SIZE}): {app_name[:40]}",
        )

    return {
        "status": "ok",
        "pack_id": pack_id,
        "app_name": app_name,
        "format": format,
        "format_dimensions": fmt,
        "generated": [
            {
                "screen": i + 1,
                "image_url": url,
                "headline": screens[i].get("headline"),
                "purpose": screens[i].get("purpose"),
            }
            for i, url in enumerate(generated_urls)
            if url
        ],
        "failed_screens": failed_screens,
        "successful_count": successful,
        "credits_charged": (
            0 if is_admin(current_user)
            else (CREDIT_COST_APPSTORE_PACK if successful == MAX_PACK_SIZE
                  else successful * CREDIT_COST_APPSTORE_PER_SCREEN)
        ),
        "engine": "gemini-3-pro-image-preview",
    }


# ── App Store URL pre-fill (optional, free) ──────────────────────────────────

_APPSTORE_URL_RE = re.compile(
    r"apps\.apple\.com/[a-z]{2}/app/(?:[^/]+/)?id(\d+)"
)


@router.get("/appstore-scrape")
async def appstore_scrape(url: str):
    """
    Pull metadata from the iTunes Search API for a given App Store URL.
    Lets the frontend pre-fill app_name / what_it_does / icon / screenshots
    automatically when the user already has a live app.

    Free endpoint (uses Apple's public lookup API, no auth, no credits).
    """
    m = _APPSTORE_URL_RE.search(url or "")
    if not m:
        raise HTTPException(
            status_code=400,
            detail="Couldn't parse an App Store ID from that URL.",
        )
    app_id = m.group(1)
    lookup = f"https://itunes.apple.com/lookup?id={app_id}&country=us&entity=software"
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            r = await http.get(lookup)
            r.raise_for_status()
            payload = r.json()
    except Exception as e:
        logger.warning(f"appstore lookup failed: {e}")
        raise HTTPException(status_code=502, detail=f"iTunes lookup failed: {e}")

    if not payload.get("results"):
        # Try fr if us came back empty (some apps are region-locked).
        try:
            async with httpx.AsyncClient(timeout=10.0) as http:
                r = await http.get(lookup.replace("country=us", "country=fr"))
                r.raise_for_status()
                payload = r.json()
        except Exception:
            pass
    if not payload.get("results"):
        raise HTTPException(status_code=404, detail="No App Store record found for that ID.")

    rec = payload["results"][0]
    return {
        "app_id": app_id,
        "app_name": rec.get("trackName"),
        "subtitle": rec.get("subtitle") or rec.get("trackCensoredName"),
        "description": rec.get("description") or "",
        "icon_url": rec.get("artworkUrl512") or rec.get("artworkUrl100"),
        "screenshots": rec.get("screenshotUrls") or [],
        "ipad_screenshots": rec.get("ipadScreenshotUrls") or [],
        "category": rec.get("primaryGenreName"),
        "rating_avg": rec.get("averageUserRating"),
        "rating_count": rec.get("userRatingCount"),
        "developer": rec.get("artistName"),
        "bundle_id": rec.get("bundleId"),
        "appstore_url": rec.get("trackViewUrl"),
    }


@router.get("/appstore-niches")
async def appstore_niches():
    """List the curated reference packs available in the niche library."""
    return {
        "verticals": niche_loader.list_verticals(),
        "packs_by_vertical": {v: niche_loader.list_packs(v) for v in niche_loader.list_verticals()},
    }


# ── Direct single-screen generation ───────────────────────────────────────────
# Lightweight path used by the "old design" form: one Gemini 3 Pro Image call
# from raw form fields, no strategist hop. Same niche anchor + brand assets
# pipeline, just no JSON brief in between. Charges per-screen so the user can
# iterate "next" without committing to a 5-pack upfront.

_APPSTORE_VARIANT_ANGLES = [
    "Hero benefit, headline-first, phone mockup tilted lower-right",
    "Feature close-up, large UI element framed by brand-colour bg",
    "Mascot / illustration-led, headline as caption",
    "Photo-bg with phone overlay, lifestyle mood",
    "Bold all-caps stack of headlines, minimal mockup",
    "Split-screen: before/after or feature comparison",
    "Floating sticker / emoji collage around centred mockup",
    "Full-bleed gradient + single oversized headline + phone at bottom",
]


@router.post("/generate-appstore-direct")
async def generate_appstore_direct(
    current_user: Annotated[User, Depends(get_current_user)],
    app_name: str = Form(...),
    headline: str = Form(..., description="Big text rendered on the visual"),
    subtitle: Optional[str] = Form(None, description="Optional smaller text under the headline"),
    app_description: Optional[str] = Form(None, description="One-line description of what the app does — gives the AI context to pick the right visual mood and props"),
    vertical: Optional[str] = Form(None, description="Drives style anchor pack"),
    color_primary: Optional[str] = Form(None),
    format: str = Form(APPSTORE_DEFAULT_FORMAT),
    variant_index: int = Form(0, description="0..N — picks a different visual angle so 'next' looks different"),
    files: List[UploadFile] = File(default=[], description="Optional brand refs (icon, real screens)"),
):
    """
    Render ONE App Store screenshot from raw form inputs.

    This is the lighter-weight sibling of /generate-appstore — no strategist
    pass, no JSON brief, no narrative arc. Just: pick a curated vertical
    anchor, compose a prompt, ship 1 image. Each call charges
    CREDIT_COST_APPSTORE_PER_SCREEN so users can iterate "next" cheaply.
    """
    fmt = APPSTORE_FORMATS.get(format)
    if not fmt:
        raise HTTPException(status_code=400, detail=f"Unknown format '{format}'.")
    if not app_name.strip() or not headline.strip():
        raise HTTPException(status_code=400, detail="app_name and headline are required.")

    cost = CREDIT_COST_APPSTORE_PER_SCREEN
    if not is_admin(current_user):
        balance = get_balance(current_user["id"])
        if balance < cost:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "INSUFFICIENT_CREDITS",
                    "message": f"You need {cost} credit(s). Current balance: {balance}",
                },
            )

    screen_id = str(uuid.uuid4())
    logger.info(f"App Store direct shot {screen_id} for user {current_user['id']}")

    # Pick the niche anchor for style references. Include the user's
    # description in the matching keywords so heuristic vertical inference
    # picks the closest pack ("coach IA réseaux" → social/ai).
    anchor = niche_loader.pick_pack_for(
        vertical=vertical,
        description=f"{app_name} {headline} {subtitle or ''} {app_description or ''}",
    )
    anchor_summary = niche_loader.style_profile_summary(anchor) if anchor else None
    anchor_ref_bytes: list[bytes] = []
    if anchor:
        for path in anchor["screen_paths"][:2]:
            data = niche_loader.read_reference_bytes(path)
            if data:
                anchor_ref_bytes.append(data)

    # Read user-uploaded refs.
    user_refs: list[tuple[bytes, str]] = []
    for f in files[:5]:
        data = await f.read()
        if data:
            user_refs.append((data, f.content_type or "image/png"))

    angle = _APPSTORE_VARIANT_ANGLES[variant_index % len(_APPSTORE_VARIANT_ANGLES)]
    prompt_parts = [
        f"Design a single App Store screenshot for the app named \"{app_name}\".",
    ]
    if app_description and app_description.strip():
        # Plug the app's purpose in early so Gemini frames mood, props, and
        # mockup choices around what the app actually does — not just the
        # headline string.
        prompt_parts.append(
            f"WHAT THE APP DOES: {app_description.strip()} "
            "Use this to inform the visual mood, props, and any UI suggestion in the mockup."
        )
    prompt_parts += [
        f"Aspect: vertical mobile (9:16). Output is ONE flat composition, never a grid.",
        "",
        f"HEADLINE (render exactly, large, bold, sharp, perfectly legible at App Store thumb size): \"{headline.strip()}\"",
    ]
    if subtitle and subtitle.strip():
        prompt_parts.append(f"SUBHEADLINE (smaller, under the headline): \"{subtitle.strip()}\"")
    prompt_parts += [
        "",
        f"VARIANT ANGLE: {angle}",
        f"PRIMARY brand colour: {color_primary or '(infer from references)'}.",
    ]
    if anchor_summary:
        prompt_parts += ["", f"STYLE ANCHOR (inspiration only — do NOT copy headlines from it): {anchor_summary}"]
    if user_refs:
        prompt_parts += [
            "",
            "USER REFERENCES: real assets of THIS app (icon and/or real UI). When a phone "
            "mockup appears in the composition, reflect this real UI faithfully — do not "
            "invent fake interface details.",
        ]
    else:
        prompt_parts += [
            "",
            "No real UI provided — keep any phone mockup abstract (gradient or single iconic "
            "illustration). Prefer text-led, illustration-led or mascot-led treatments over "
            "fake UI.",
        ]
    prompt_parts += [
        "",
        "HARD RULES:",
        "- Render the HEADLINE exactly as written. No paraphrasing, no extra punctuation.",
        "- Headline is the dominant typographic element. Highest contrast.",
        "- No mock device clock, no fake battery indicators outside an actual phone status bar.",
        "- No watermarks, no Apple/Google logos, no App Store badges.",
        "- Single flat composition, never a grid of mini-screenshots.",
    ]
    prompt = "\n".join(prompt_parts)

    contents: list = []
    for ref in anchor_ref_bytes:
        contents.append(types.Part.from_bytes(data=ref, mime_type="image/jpeg"))
    for data, mime in user_refs:
        contents.append(types.Part.from_bytes(data=data, mime_type=mime))
    contents.append(prompt)

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    try:
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio=APPSTORE_GEMINI_RATIO,
                    image_size="2K",
                ),
            ),
        )
    except APIError as api_err:
        logger.error(f"Gemini API error: {api_err}")
        raise HTTPException(status_code=400, detail=f"AI provider error: {api_err}")
    except Exception as e:
        logger.error(f"Gemini call failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI provider error: {e}")

    if not response.candidates or not response.candidates[0].content:
        raise HTTPException(status_code=502, detail="Gemini returned no candidates.")
    img_bytes: Optional[bytes] = None
    for part in response.candidates[0].content.parts or []:
        if part.inline_data:
            img_bytes = part.inline_data.data
            break
    if not img_bytes:
        raise HTTPException(status_code=502, detail="Gemini returned no image.")

    storage_path = f"thumbnails/{current_user['id']}/{screen_id}.png"
    supabase.storage.from_("avatars").upload(
        path=storage_path,
        file=img_bytes,
        file_options={"content-type": "image/png", "x-upsert": "true"},
    )
    image_url = supabase.storage.from_("avatars").get_public_url(storage_path)

    try:
        prefix = encode_thumbnail_prefix("appstore-direct", APPSTORE_GEMINI_RATIO)
        supabase.table("generated_images").insert({
            "id": screen_id,
            "user_id": current_user["id"],
            "avatar_id": None,
            "prompt": f"{prefix} [v{variant_index}] {headline.strip()}",
            "image_url": image_url,
            "storage_path": storage_path,
        }).execute()
    except Exception as db_err:
        logger.error(f"history insert failed for {screen_id}: {db_err}")

    if not is_admin(current_user):
        deduct_credits(
            current_user["id"],
            cost,
            "appstore_direct",
            f"App Store shot {variant_index + 1}: {headline[:40]}",
        )

    return {
        "status": "ok",
        "screen_id": screen_id,
        "image_url": image_url,
        "variant_index": variant_index,
        "format": format,
        "format_dimensions": fmt,
        "credits_charged": 0 if is_admin(current_user) else cost,
        "engine": "gemini-3-pro-image-preview",
    }
