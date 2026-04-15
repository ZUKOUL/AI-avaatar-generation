"""
Ads Generator API — train a product from reference photos and spin up
static ad creatives using Gemini 3 Pro Image. Mirrors the Characters
pipeline but tuned for physical products (dropshipping, e-commerce).

Endpoints:
  POST   /ads/train-product          — ingest refs, save product
  GET    /ads/products               — list user's products
  DELETE /ads/products/{product_id}  — remove a product
  POST   /ads/generate               — generate ad creative from product + template
  GET    /ads/history                — list past generated ads
  DELETE /ads/{ad_id}                — delete a single generated ad
"""
import os
import uuid
import time
import logging
from typing import Annotated, List, Optional

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

# Product training bounds — products need fewer refs than faces (3-12 angles
# is enough for object identity; a face needs many more variations).
MIN_PRODUCT_IMAGES = 3
MAX_PRODUCT_IMAGES = 20
MAX_REFERENCE_IMAGES = 5  # forwarded to Gemini per generation

# Aspect ratios the ad generator supports (Facebook/Instagram/TikTok friendly)
SUPPORTED_RATIOS = {"1:1", "4:5", "9:16", "16:9", "3:4"}

# Static prompt templates — each produces a distinctly different ad style.
# The product identity lock is prepended automatically before sending to
# Gemini so the generated image preserves the exact product.
TEMPLATES: dict[str, dict] = {
    "studio_white": {
        "label": "Studio White",
        "prompt": (
            "Professional e-commerce product photography on a pure white "
            "seamless background (#FFFFFF), soft studio lighting with gentle "
            "drop shadow under the product, sharp focus, crisp details, "
            "color-accurate, commercial product shot, 8K ultra-detailed, "
            "no text, no watermark."
        ),
    },
    "lifestyle": {
        "label": "Lifestyle",
        "prompt": (
            "Lifestyle product photography: the product is the hero, placed "
            "in a natural, aspirational everyday environment. Soft natural "
            "window light, warm tones, shallow depth of field with subtle "
            "bokeh, Instagram-ready editorial aesthetic, 8K, no text."
        ),
    },
    "ugc": {
        "label": "UGC — Hand-held",
        "prompt": (
            "Authentic user-generated-content style photo: a human hand "
            "holding the product up to the camera in a cozy indoor setting, "
            "phone-camera look (slight grain, warm ambient light), casual "
            "composition, feels real and relatable, social-media native."
        ),
    },
    "premium": {
        "label": "Luxury Premium",
        "prompt": (
            "High-end luxury product photography, dramatic directional "
            "lighting with specular highlights and rich deep shadows, dark "
            "textured background (marble, brushed metal, or matte velvet), "
            "cinematic commercial quality, 8K ultra-detailed, editorial."
        ),
    },
    "social_story": {
        "label": "Social Story",
        "prompt": (
            "Vertical 9:16 social-media ad creative: the product centered "
            "with bold negative space, bright modern gradient background "
            "(punchy accent colors), dynamic composition, eye-catching, "
            "thumb-stopping. High energy but clean."
        ),
    },
    "outdoor": {
        "label": "Outdoor Golden Hour",
        "prompt": (
            "Outdoor product photography during golden hour, warm sunset "
            "light wrapping around the product, soft natural bokeh in the "
            "background, rich cinematic color grade, editorial lifestyle, "
            "8K ultra-detailed."
        ),
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _rollback_paths(paths: List[str]) -> None:
    """Best-effort cleanup of storage uploads when a later step fails."""
    if not paths:
        return
    try:
        supabase.storage.from_("avatars").remove(paths)
    except Exception as e:
        logger.warning(f"Failed to rollback product storage paths: {e}")


def _product_or_404(product_id: str, user_id: str) -> dict:
    """Fetch a product owned by `user_id` or raise 404."""
    res = (
        supabase.table("products")
        .select("id, name, image_paths, user_id")
        .eq("id", product_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Product not found.")
    return res.data


# ─────────────────────────────────────────────────────────────────────────────
# 1. TRAIN PRODUCT — store refs + generate a clean thumbnail
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/train-product")
async def train_product(
    current_user: Annotated[User, Depends(get_current_user)],
    name: str = Form(..., max_length=100, description="Product name"),
    category: str = Form("", max_length=60, description="Optional category"),
    files: List[UploadFile] = File(
        ...,
        description=f"{MIN_PRODUCT_IMAGES}–{MAX_PRODUCT_IMAGES} photos, different angles",
    ),
):
    """Ingest product reference photos and generate a clean catalogue thumbnail."""
    name_clean = name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Product name is required.")

    # ── Validate + read file bytes ─────────────────────────────────────────
    if len(files) < MIN_PRODUCT_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"At least {MIN_PRODUCT_IMAGES} photos required. You uploaded {len(files)}.",
        )
    if len(files) > MAX_PRODUCT_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_PRODUCT_IMAGES} photos allowed. You uploaded {len(files)}.",
        )

    file_bytes_list: List[bytes] = []
    for f in files:
        content = await f.read()
        if content and len(content) > 100:
            file_bytes_list.append(content)

    if len(file_bytes_list) < MIN_PRODUCT_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"At least {MIN_PRODUCT_IMAGES} valid photos required.",
        )

    # ── Credit check (admin bypass) ────────────────────────────────────────
    if not is_admin(current_user):
        balance = get_balance(current_user["id"])
        if balance < CREDIT_COST_IMAGE:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "INSUFFICIENT_CREDITS",
                    "message": f"You need {CREDIT_COST_IMAGE} credit(s). Current balance: {balance}",
                },
            )

    product_id = str(uuid.uuid4())
    logger.info(
        f"Training product '{name_clean}' for user {current_user['id']} "
        f"with {len(file_bytes_list)} photos: {product_id}"
    )

    # ── 1. Upload every reference photo to storage ────────────────────────
    ref_paths: List[str] = []
    try:
        for i, data in enumerate(file_bytes_list):
            storage_path = f"products_library/{product_id}/ref_{i:02d}.png"
            supabase.storage.from_("avatars").upload(
                path=storage_path,
                file=data,
                file_options={"content-type": "image/png", "x-upsert": "true"},
            )
            ref_paths.append(storage_path)
    except Exception as e:
        logger.error(f"Failed to upload product reference photos: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload photos: {str(e)}")

    # ── 2. Generate a clean catalogue thumbnail via Gemini ────────────────
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    thumb_refs = file_bytes_list[:MAX_REFERENCE_IMAGES]
    gemini_contents = [
        types.Part.from_bytes(data=b, mime_type="image/png") for b in thumb_refs
    ]
    thumbnail_prompt = (
        "These are reference photos of a specific physical product. "
        "Generate a NEW catalogue-quality photograph of THIS EXACT SAME PRODUCT. "
        "ABSOLUTE REQUIREMENT — the product must be identical to the references: "
        "same exact shape, colour, materials, branding, logos, text, proportions. "
        "Do NOT alter, redesign, restyle, or improve any detail of the product. "
        "Pure white studio background (#FFFFFF), seamless, evenly lit, soft drop "
        "shadow beneath the product, centred composition, product-hero framing. "
        "Shot like a premium e-commerce hero image, ultra high detail, 8K, "
        "no text, no watermark, no logo overlays."
    )
    gemini_contents.append(thumbnail_prompt)

    try:
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"),
            ),
        )
    except APIError as api_err:
        logger.error(f"Gemini API error during product training: {api_err}")
        _rollback_paths(ref_paths)
        raise HTTPException(
            status_code=400,
            detail=f"AI provider error: {getattr(api_err, 'message', str(api_err))}",
        )
    except Exception as e:
        logger.error(f"Unexpected Gemini error during product training: {e}")
        _rollback_paths(ref_paths)
        raise HTTPException(status_code=500, detail=f"Failed to communicate with AI provider: {str(e)}")

    if not response.candidates:
        _rollback_paths(ref_paths)
        raise HTTPException(status_code=500, detail="Gemini returned no candidates.")

    candidate = response.candidates[0]
    if not candidate.content or not candidate.content.parts:
        _rollback_paths(ref_paths)
        raise HTTPException(
            status_code=400,
            detail="Thumbnail generation failed or was blocked by safety filters.",
        )

    thumbnail_path: Optional[str] = None
    for part in candidate.content.parts:
        if getattr(part, "text", None):
            logger.info(f"Gemini reasoning (product training): {part.text[:200]}")
        elif getattr(part, "inline_data", None):
            thumbnail_path = f"products_library/{product_id}/thumbnail.png"
            supabase.storage.from_("avatars").upload(
                path=thumbnail_path,
                file=part.inline_data.data,
                file_options={"content-type": "image/png", "x-upsert": "true"},
            )
            break

    if not thumbnail_path:
        _rollback_paths(ref_paths)
        raise HTTPException(status_code=500, detail="Gemini returned empty response.")

    # ── 3. Persist product row — thumbnail FIRST so it's the display image ──
    category_clean = (category or "").strip() or None
    row = {
        "id": product_id,
        "user_id": current_user["id"],
        "name": name_clean,
        "category": category_clean,
        "image_paths": [thumbnail_path] + ref_paths,
    }
    try:
        supabase.table("products").insert(row).execute()
    except Exception as db_err:
        _rollback_paths([thumbnail_path] + ref_paths)
        raise HTTPException(status_code=500, detail=f"Failed to save product: {db_err}")

    # ── 4. Deduct credits (admin bypass) ───────────────────────────────────
    if not is_admin(current_user):
        deduct_credits(
            current_user["id"],
            CREDIT_COST_IMAGE,
            "product_training",
            f"Product training: {name_clean}",
        )

    thumbnail_url = supabase.storage.from_("avatars").get_public_url(thumbnail_path)
    logger.info(f"Product trained. ID: {product_id}, Name: {name_clean}, Refs: {len(ref_paths)}")
    return {
        "status": "Success",
        "product_id": product_id,
        "name": name_clean,
        "category": category_clean,
        "thumbnail": thumbnail_url,
        "reference_count": len(ref_paths),
        "cost_usd": COST_GEMINI_FLASH_IMAGE,
        "engine": "gemini-3-pro-image-preview",
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. LIST PRODUCTS
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/products")
async def list_products(current_user: Annotated[User, Depends(get_current_user)]):
    """List all trained products for the current user."""
    try:
        res = (
            supabase.table("products")
            .select("id, name, category, image_paths, created_at")
            .eq("user_id", current_user["id"])
            .order("created_at", desc=True)
            .execute()
        )
        products = []
        for p in res.data or []:
            thumb_url = None
            if p.get("image_paths"):
                thumb_url = supabase.storage.from_("avatars").get_public_url(
                    p["image_paths"][0]
                )
            products.append({
                "product_id": p["id"],
                "name": p["name"],
                "category": p.get("category"),
                "thumbnail": thumb_url,
                "created_at": p.get("created_at"),
            })
        return {"products": products}
    except Exception as e:
        logger.error(f"Failed to list products: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# 3. DELETE PRODUCT
# ─────────────────────────────────────────────────────────────────────────────
@router.delete("/products/{product_id}")
async def delete_product(
    current_user: Annotated[User, Depends(get_current_user)],
    product_id: str,
):
    """Delete a product and all its storage files."""
    try:
        product = _product_or_404(product_id, current_user["id"])

        paths = product.get("image_paths") or []
        if paths:
            try:
                supabase.storage.from_("avatars").remove(paths)
            except Exception as e:
                logger.warning(f"Failed to remove product storage for {product_id}: {e}")

        supabase.table("products").delete().eq("id", product_id).execute()
        logger.info(f"Deleted product {product_id} for user {current_user['id']}")
        return {"status": "deleted", "product_id": product_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete product: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# 4. GENERATE AD CREATIVE
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/generate")
async def generate_ad(
    current_user: Annotated[User, Depends(get_current_user)],
    product_id: str = Form(..., description="Trained product to feature"),
    template: str = Form("studio_white", description="One of the predefined templates"),
    custom_prompt: str = Form("", description="Optional extra scene instructions"),
    aspect_ratio: str = Form("1:1"),
):
    """Generate a static ad creative using a trained product + template."""
    if template not in TEMPLATES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template '{template}'. Valid: {', '.join(TEMPLATES.keys())}",
        )
    if aspect_ratio not in SUPPORTED_RATIOS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported aspect ratio '{aspect_ratio}'. Valid: {sorted(SUPPORTED_RATIOS)}",
        )

    # Credit check
    if not is_admin(current_user):
        balance = get_balance(current_user["id"])
        if balance < CREDIT_COST_IMAGE:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "INSUFFICIENT_CREDITS",
                    "message": f"You need {CREDIT_COST_IMAGE} credit(s). Current balance: {balance}",
                },
            )

    product = _product_or_404(product_id, current_user["id"])
    paths = (product.get("image_paths") or [])[:MAX_REFERENCE_IMAGES]
    if not paths:
        raise HTTPException(status_code=400, detail="Product has no reference photos.")

    # Load ref bytes from storage
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    gemini_contents: list = []
    for path in paths:
        try:
            img_bytes = supabase.storage.from_("avatars").download(path)
            gemini_contents.append(types.Part.from_bytes(data=img_bytes, mime_type="image/png"))
        except Exception as e:
            logger.warning(f"Failed to load product ref {path}: {e}")

    if not gemini_contents:
        raise HTTPException(status_code=500, detail="Failed to load product references from storage.")

    # Build a fused prompt — identity lock first, then template + custom extras
    tpl = TEMPLATES[template]
    extra = (custom_prompt or "").strip()
    extra_block = f" Additional direction: {extra}" if extra else ""
    identity_prompt = (
        "The reference images show a specific physical product. "
        "Generate a NEW photograph featuring THIS EXACT SAME PRODUCT. "
        "ABSOLUTE REQUIREMENT — the product must be identical: same exact shape, "
        "colour, materials, branding, logos, text, proportions. "
        "Do NOT alter, redesign, or improve any detail of the product. "
        f"Scene and style: {tpl['prompt']}{extra_block}"
    )
    gemini_contents.append(identity_prompt)

    try:
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio, image_size="1K"),
            ),
        )
    except APIError as api_err:
        logger.error(f"Gemini API error during ad generation: {api_err}")
        raise HTTPException(
            status_code=400,
            detail=f"AI provider error: {getattr(api_err, 'message', str(api_err))}",
        )
    except Exception as e:
        logger.error(f"Unexpected Gemini error during ad generation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to communicate with AI provider: {str(e)}")

    if not response.candidates:
        raise HTTPException(status_code=500, detail="Gemini returned no candidates.")

    candidate = response.candidates[0]
    if not candidate.content or not candidate.content.parts:
        finish_reason = getattr(candidate, "finish_reason", "UNKNOWN")
        raise HTTPException(
            status_code=400,
            detail=f"Ad generation failed or was blocked by safety filters. Finish reason: {finish_reason}",
        )

    for part in candidate.content.parts:
        if getattr(part, "text", None):
            logger.info(f"Gemini reasoning (ad): {part.text[:200]}")
        elif getattr(part, "inline_data", None):
            generated_bytes = part.inline_data.data

            ad_id = str(uuid.uuid4())
            filename = f"ad_{int(time.time())}_{ad_id[:8]}.png"
            storage_path = f"generated_ads/{product_id}/{filename}"
            supabase.storage.from_("avatars").upload(
                path=storage_path,
                file=generated_bytes,
                file_options={"content-type": "image/png"},
            )
            image_url = supabase.storage.from_("avatars").get_public_url(storage_path)

            supabase.table("generated_ads").insert({
                "id": ad_id,
                "user_id": current_user["id"],
                "product_id": product_id,
                "template": template,
                "prompt": extra or tpl["label"],
                "aspect_ratio": aspect_ratio,
                "image_url": image_url,
                "storage_path": storage_path,
            }).execute()

            if not is_admin(current_user):
                deduct_credits(
                    current_user["id"],
                    CREDIT_COST_IMAGE,
                    "ad_generation",
                    f"Ad generation ({template}) for product {product['name']}",
                )

            logger.info(f"Ad generated. ID: {ad_id}, Product: {product_id}, Template: {template}")
            return {
                "status": "Success",
                "ad_id": ad_id,
                "product_id": product_id,
                "template": template,
                "aspect_ratio": aspect_ratio,
                "image_url": image_url,
                "cost_usd": COST_GEMINI_FLASH_IMAGE,
                "engine": "gemini-3-pro-image-preview",
            }

    raise HTTPException(status_code=500, detail="Gemini returned empty response.")


# ─────────────────────────────────────────────────────────────────────────────
# 5. LIST TEMPLATES (frontend reads this to render the template picker)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/templates")
async def list_templates(current_user: Annotated[User, Depends(get_current_user)]):
    """Static list of supported ad templates with their labels."""
    return {
        "templates": [
            {"id": tpl_id, "label": tpl["label"]}
            for tpl_id, tpl in TEMPLATES.items()
        ],
        "aspect_ratios": sorted(SUPPORTED_RATIOS),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 6. HISTORY — list generated ads for the current user
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/history")
async def list_history(
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 100,
    product_id: Optional[str] = None,
):
    """List generated ads, newest first. Optionally filter by product_id."""
    try:
        q = (
            supabase.table("generated_ads")
            .select("id, product_id, template, prompt, aspect_ratio, image_url, created_at")
            .eq("user_id", current_user["id"])
            .order("created_at", desc=True)
            .limit(max(1, min(limit, 500)))
        )
        if product_id:
            q = q.eq("product_id", product_id)
        res = q.execute()
        return {"ads": res.data or []}
    except Exception as e:
        logger.error(f"Failed to list ad history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# 7. DELETE a single generated ad
# ─────────────────────────────────────────────────────────────────────────────
@router.delete("/{ad_id}")
async def delete_ad(
    current_user: Annotated[User, Depends(get_current_user)],
    ad_id: str,
):
    """Delete a generated ad (row + storage artefact)."""
    try:
        res = (
            supabase.table("generated_ads")
            .select("id, storage_path, user_id")
            .eq("id", ad_id)
            .eq("user_id", current_user["id"])
            .single()
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Ad not found.")

        storage_path = res.data.get("storage_path")
        if storage_path:
            try:
                supabase.storage.from_("avatars").remove([storage_path])
            except Exception as e:
                logger.warning(f"Failed to remove ad storage for {ad_id}: {e}")

        supabase.table("generated_ads").delete().eq("id", ad_id).execute()
        return {"status": "deleted", "ad_id": ad_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete ad: {e}")
        raise HTTPException(status_code=500, detail=str(e))
