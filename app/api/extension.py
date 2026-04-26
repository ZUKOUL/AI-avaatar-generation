"""
Extension API — endpoints used by the Chrome extension.

The extension lets users right-click any image on the web (Pinterest,
Instagram, ad libraries, anywhere) and recreate it via Horpen with their
trained character or product injected. This module exposes a single
generation endpoint that:

  1. Downloads the source image from the URL the extension passes us
     (with a browser User-Agent to bypass scraper-blocking on social
     CDNs — same trick as /thumbnail/describe-url).
  2. Loads up to MAX_REF reference images for the chosen character (face
     identity lock) OR product (object identity lock).
  3. Composes a Gemini 3 Pro Image prompt that uses the source as a
     composition reference and the character/product refs as identity
     anchors.
  4. Returns the generated image URL — the extension swaps it into its
     floating preview.

Charges CREDIT_COST_IMAGE × 2 per call (same cost as a thumbnail
recreate — comparable Gemini spend).
"""
import logging
import os
import uuid
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from google import genai
from google.genai import types
from google.genai.errors import APIError

from app.core.auth import get_current_user
from app.core.pricing import CREDIT_COST_IMAGE
from app.core.supabase import supabase
from app.models.user import User
from app.services.credit_service import deduct_credits, get_balance, is_admin

logger = logging.getLogger(__name__)
router = APIRouter()

# Same as the /thumbnail/describe-url scraper — many sites block the
# default httpx UA (Twitter/X, Instagram, some Cloudflare-fronted CDNs).
_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_BROWSER_HEADERS = {
    "User-Agent": _BROWSER_UA,
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}

# Cap how many character/product reference images we send into Gemini.
# More refs = stronger identity lock, but also more tokens + slower.
# 3 is the sweet spot for face/product identity from past experiments.
MAX_REF = 3

# Aspect ratios Gemini 3 Pro Image accepts.
_GEMINI_RATIOS = {"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"}

# Recreation costs the same as a thumbnail (1 Gemini Pro Image call,
# moderate context). Adjust here when API pricing shifts.
CREDIT_COST_EXTENSION_RECREATE = CREDIT_COST_IMAGE * 2


async def _fetch_image_bytes(url: str) -> tuple[bytes, str]:
    """Download an image with a browser UA + minimal sniffing for mime."""
    if url.startswith("data:"):
        # Direct data URL — extract mime + bytes.
        try:
            head, b64 = url.split(",", 1)
            mime = head.split(";")[0].replace("data:", "") or "image/png"
            import base64
            return base64.b64decode(b64), mime
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid data URL: {e}")

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
            follow_redirects=True,
            headers=_BROWSER_HEADERS,
        ) as http:
            resp = await http.get(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Couldn't fetch source image: {e}")
    if resp.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail=f"Source image returned HTTP {resp.status_code}.",
        )
    if len(resp.content) < 500:
        raise HTTPException(status_code=400, detail="Source image is empty / too small.")

    mime = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip().lower()
    if not mime.startswith("image/"):
        head = resp.content[:12]
        if head.startswith(b"\x89PNG"):
            mime = "image/png"
        elif head.startswith(b"\xff\xd8"):
            mime = "image/jpeg"
        elif head[:6] in (b"GIF87a", b"GIF89a"):
            mime = "image/gif"
        elif head[:4] == b"RIFF" and head[8:12] == b"WEBP":
            mime = "image/webp"
        else:
            mime = "image/jpeg"
    return resp.content, mime


def _load_character_refs(character_id: str, user_id: str) -> list[bytes]:
    """Pull the first N reference photos for a character from storage."""
    try:
        res = (
            supabase.table("characters")
            .select("id, name, image_paths")
            .eq("id", character_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.warning(f"character {character_id} not found: {e}")
        return []
    paths = (res.data or {}).get("image_paths") or []
    bucket = supabase.storage.from_("avatars")
    refs: list[bytes] = []
    for p in paths[:MAX_REF]:
        try:
            data = bucket.download(p)
            if data:
                refs.append(data)
        except Exception as e:
            logger.warning(f"download character ref {p} failed: {e}")
    return refs


def _load_product_refs(product_id: str, user_id: str) -> tuple[list[bytes], dict]:
    """Pull the first N reference photos for a product + its meta dict."""
    try:
        res = (
            supabase.table("products")
            .select("id, name, image_paths, description, features, category")
            .eq("id", product_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.warning(f"product {product_id} not found: {e}")
        return [], {}
    row = res.data or {}
    paths = row.get("image_paths") or []
    bucket = supabase.storage.from_("avatars")
    refs: list[bytes] = []
    for p in paths[:MAX_REF]:
        try:
            data = bucket.download(p)
            if data:
                refs.append(data)
        except Exception as e:
            logger.warning(f"download product ref {p} failed: {e}")
    return refs, row


@router.get("/me")
async def me(current_user: Annotated[User, Depends(get_current_user)]):
    """Lightweight auth-check + profile snapshot for the extension popup."""
    return {
        "id": current_user["id"],
        "email": current_user.get("email"),
        "role": current_user.get("role", "user"),
        "credit_balance": current_user.get("credit_balance", 0),
    }


@router.post("/recreate")
async def recreate_image(
    current_user: Annotated[User, Depends(get_current_user)],
    source_image_url: str = Form(..., description="URL of the image the user right-clicked / dropped"),
    character_id: Optional[str] = Form(None, description="Inject this character's identity into the recreated image"),
    product_id: Optional[str] = Form(None, description="Inject this product's identity into the recreated image"),
    aspect_ratio: str = Form("9:16", description="Output ratio — 1:1, 9:16, 16:9, etc."),
    extra_prompt: Optional[str] = Form(None, description="Optional user note to refine the recreation"),
    source_page_url: Optional[str] = Form(None, description="The page the image came from — helps explain context to the model"),
):
    """
    Recreate an arbitrary web image with the user's character or product
    swapped in. Single Gemini 3 Pro Image call, charged like a thumbnail.
    """
    if not source_image_url:
        raise HTTPException(status_code=400, detail="source_image_url is required.")
    if aspect_ratio not in _GEMINI_RATIOS:
        # Map common UI aspects to the closest supported one rather than
        # erroring — the UI lets the user pick anything.
        aspect_ratio = "9:16" if aspect_ratio in {"3:5", "9:19.5", "9:21"} else "1:1"

    if not is_admin(current_user):
        balance = get_balance(current_user["id"])
        if balance < CREDIT_COST_EXTENSION_RECREATE:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "INSUFFICIENT_CREDITS",
                    "message": f"You need {CREDIT_COST_EXTENSION_RECREATE} credit(s). Current balance: {balance}",
                },
            )

    # 1. Download source image.
    source_bytes, source_mime = await _fetch_image_bytes(source_image_url)
    logger.info(f"Extension recreate: downloaded source ({len(source_bytes)} bytes, {source_mime})")

    # 2. Load identity refs.
    char_refs: list[bytes] = []
    product_refs: list[bytes] = []
    product_meta: dict = {}
    if character_id:
        char_refs = _load_character_refs(character_id, current_user["id"])
        if not char_refs:
            raise HTTPException(status_code=404, detail="That character has no reference images. Train it again on horpen.ai.")
    if product_id:
        product_refs, product_meta = _load_product_refs(product_id, current_user["id"])
        if not product_refs:
            raise HTTPException(status_code=404, detail="That product has no reference images. Train it again on horpen.ai.")

    # 3. Compose the prompt.
    parts: list[str] = [
        "Image 1 is the SOURCE composition reference — recreate this exact scene, framing, lighting and mood.",
    ]
    if char_refs:
        parts.append(
            f"Images 2{'+' if len(char_refs) > 1 else ''} are the CHARACTER identity reference — "
            "if a person appears in image 1, swap their identity for this character. "
            "Reproduce the character's face EXACTLY (same eyes, nose, mouth, jawline, skin tone, hair). "
            "Do NOT alter, beautify or idealize. Match the source's pose and expression."
        )
    if product_refs:
        idx_start = 2 + (len(char_refs) if char_refs else 0)
        parts.append(
            f"Images {idx_start}{'+' if len(product_refs) > 1 else ''} are the PRODUCT identity reference — "
            "if a product / object appears in image 1, swap it for this product. "
            "Match the product faithfully (shape, colour, branding, proportions). "
            "Keep the rest of the composition (background, framing, lighting) identical to image 1."
        )
        if product_meta.get("name"):
            parts.append(f"Product name: \"{product_meta['name']}\".")
    if not char_refs and not product_refs:
        parts.append(
            "Recreate the image as faithfully as possible while keeping it suitable for ad / marketing use. "
            "Do not invent watermarks, brand logos that aren't in the source, or App Store badges."
        )
    if extra_prompt and extra_prompt.strip():
        parts.append(f"Additional creative direction from the user: {extra_prompt.strip()}")
    if source_page_url:
        parts.append(f"(Source context: image was found on {source_page_url}.)")
    parts.append(
        "Output: a single high-quality image at the requested aspect ratio. "
        "No watermarks, no UI chrome, no text overlay unless the source clearly has one — and if it does, render it cleanly."
    )
    prompt = "\n\n".join(parts)

    # 4. Build Gemini contents (source first, then refs in order).
    contents: list = [types.Part.from_bytes(data=source_bytes, mime_type=source_mime)]
    for ref in char_refs:
        contents.append(types.Part.from_bytes(data=ref, mime_type="image/jpeg"))
    for ref in product_refs:
        contents.append(types.Part.from_bytes(data=ref, mime_type="image/jpeg"))
    contents.append(prompt)

    # 5. Call Gemini.
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured.")
    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio,
                    image_size="2K",
                ),
            ),
        )
    except APIError as api_err:
        logger.error(f"Extension Gemini API error: {api_err}")
        raise HTTPException(status_code=502, detail=f"AI provider error: {api_err}")

    if not response.candidates or not response.candidates[0].content:
        raise HTTPException(status_code=502, detail="Gemini returned no candidates.")
    img_bytes: Optional[bytes] = None
    for part in response.candidates[0].content.parts or []:
        if part.inline_data:
            img_bytes = part.inline_data.data
            break
    if not img_bytes:
        raise HTTPException(status_code=502, detail="Gemini returned no image bytes.")

    # 6. Persist to storage + history.
    gen_id = str(uuid.uuid4())
    storage_path = f"thumbnails/{current_user['id']}/{gen_id}.png"
    supabase.storage.from_("avatars").upload(
        path=storage_path,
        file=img_bytes,
        file_options={"content-type": "image/png", "x-upsert": "true"},
    )
    image_url = supabase.storage.from_("avatars").get_public_url(storage_path)

    try:
        supabase.table("generated_images").insert({
            "id": gen_id,
            "user_id": current_user["id"],
            "avatar_id": character_id,
            "prompt": f"[extension|{aspect_ratio}] {prompt[:500]}",
            "image_url": image_url,
            "storage_path": storage_path,
        }).execute()
    except Exception as db_err:
        logger.error(f"history insert failed for {gen_id}: {db_err}")

    if not is_admin(current_user):
        deduct_credits(
            current_user["id"],
            CREDIT_COST_EXTENSION_RECREATE,
            "extension_recreate",
            f"Extension recreate from {source_image_url[:80]}",
        )

    return {
        "status": "ok",
        "id": gen_id,
        "image_url": image_url,
        "aspect_ratio": aspect_ratio,
        "credits_charged": 0 if is_admin(current_user) else CREDIT_COST_EXTENSION_RECREATE,
        "engine": "gemini-3-pro-image-preview",
    }
