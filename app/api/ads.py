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
from app.services.product_analyzer import analyze_product_url, format_product_context
from app.services.product_image_scraper import scrape_product_images
from app.services.ad_concept_designer import (
    design_ad_concept,
    design_marketing_brief,
    concept_to_prompt,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Product training bounds — products need fewer refs than faces (3-12 angles
# is enough for object identity; a face needs many more variations).
MIN_PRODUCT_IMAGES = 3
MAX_PRODUCT_IMAGES = 20
MAX_REFERENCE_IMAGES = 5  # forwarded to Gemini per generation

# Aspect ratios the ad generator supports (Facebook/Instagram/TikTok friendly)
SUPPORTED_RATIOS = {"1:1", "4:5", "9:16", "16:9", "3:4"}

# Static prompt templates — each is a FACEBOOK/INSTAGRAM AD BRIEF, not a
# catalogue product photo. Every template aims for scroll-stopping, ad-native
# composition: people in frame where it makes sense, room for headline text,
# emotional hook, problem/solution framing.
# The product identity lock is prepended before sending to Gemini so the
# generated image preserves the exact product.
TEMPLATES: dict[str, dict] = {
    "auto": {
        "label": "Auto — AI finds winning concept",
        # Sentinel: when this template is picked we call the ad_concept_designer
        # service to research + design a custom brief instead of using a static
        # prompt. See generate_ad() below.
        "prompt": "",
        "auto": True,
    },
    "studio_white": {
        "label": "Clean White Ad",
        "prompt": (
            "High-end static Facebook ad creative on a pure white seamless "
            "background. The product is hero-placed with deliberate negative "
            "space on one side for headline text overlay. Soft studio lighting "
            "with a subtle contact shadow, minimalist ad-style composition "
            "(not a catalogue listing), premium DTC brand feel. Render a bold, "
            "short sans-serif headline text in the negative-space area that "
            "pitches a benefit. 8K, commercial, ad-native."
        ),
    },
    "lifestyle": {
        "label": "Lifestyle In-Use",
        "prompt": (
            "Static Facebook/Instagram ad showing a real person (hands, arms, "
            "or partial body in frame) actively USING the product in an "
            "aspirational everyday environment — home, kitchen, bedroom, "
            "outdoors or gym, whichever suits it. Feels candid and natural, "
            "soft window light, warm editorial tones, shallow depth of field. "
            "Composition leaves clear space on one edge for ad headline text "
            "overlay. Scroll-stopping, magazine-ad quality, not a catalogue shot."
        ),
    },
    "ugc": {
        "label": "UGC Review",
        "prompt": (
            "Authentic user-generated-content style Facebook ad: shot from the "
            "perspective of a real customer on an iPhone, slightly imperfect "
            "framing, natural ambient light, a visible hand or selfie-style "
            "view holding or using the product in a cozy real-life setting. "
            "Soft grain, honest real-world vibe, zero studio polish. Bottom "
            "or top leaves room for a short testimonial-style overlay quote. "
            "Feels like a true customer review post, not a staged photo."
        ),
    },
    "premium": {
        "label": "Luxury Hero",
        "prompt": (
            "Cinematic static ad creative: dramatic directional lighting with "
            "specular highlights on the product against a rich dark backdrop "
            "(polished marble, brushed metal, matte velvet, or deep gradient). "
            "Magazine-ad composition with bold negative space for a luxury "
            "headline. Deep blacks, refined colour grade, Vogue/Apple-ad feel. "
            "Render elegant serif or clean sans-serif headline text overlay. "
            "High-end DTC brand aesthetic, 8K ultra-detailed."
        ),
    },
    "social_story": {
        "label": "Bold Gradient Story",
        "prompt": (
            "Vertical-friendly static ad creative for Instagram Stories/Reels "
            "placement. Product centred on a punchy modern gradient or flat "
            "bright colour block, dynamic diagonal composition, generous "
            "negative space top and bottom. Render a short bold sans-serif "
            "headline text above the product and a small CTA-style subhead "
            "below, styled like a high-energy DTC social ad. Vibrant, "
            "thumb-stopping, native to feed."
        ),
    },
    "outdoor": {
        "label": "Golden Hour In-Use",
        "prompt": (
            "Cinematic outdoor Facebook ad during golden hour: a real person "
            "(hands, body, or lifestyle framing) using the product in a "
            "beautiful warm sunset setting — beach, park, rooftop, street, "
            "or nature depending on context. Warm backlight and lens flare, "
            "rich editorial colour grade, soft natural bokeh. Composition "
            "leaves clear space on one side for short headline text overlay. "
            "Feels aspirational, ad-native, scroll-stopping."
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
        .select(
            "id, name, image_paths, user_id, "
            "description, features, category, price, source_url"
        )
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
    source_url: str = Form("", max_length=2048, description="Optional product URL (AliExpress, Amazon, …) — analysed for extra context"),
    files: Optional[List[UploadFile]] = File(
        None,
        description=(
            f"{MIN_PRODUCT_IMAGES}–{MAX_PRODUCT_IMAGES} photos, different angles. "
            f"Optional when source_url is provided — the AI will scrape the photos."
        ),
    ),
):
    """Ingest product reference photos (or scrape them from `source_url`) and
    generate a clean catalogue thumbnail.

    Two supported flows:
      1. **Upload flow** — user uploads 3–20 photos directly.
      2. **URL-only flow** — user provides `source_url` and skips the upload.
         We fetch the page, extract the product gallery (JSON-LD / OpenGraph
         / `<img>` tags), and feed those bytes into the same training path as
         if they'd been uploaded.

    If both are supplied, uploads take priority and the URL is only used for
    the metadata extraction (description, features, price).
    """
    name_clean = name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Product name is required.")

    source_url_clean = (source_url or "").strip() or None

    # ── Read uploaded bytes first ──────────────────────────────────────────
    uploaded_files: List[UploadFile] = files or []
    if len(uploaded_files) > MAX_PRODUCT_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_PRODUCT_IMAGES} photos allowed. You uploaded {len(uploaded_files)}.",
        )

    file_bytes_list: List[bytes] = []
    for f in uploaded_files:
        content = await f.read()
        if content and len(content) > 100:
            file_bytes_list.append(content)

    # ── URL-only fallback: scrape the product page if user skipped uploads ─
    # Fires when:
    #   - user provided < MIN_PRODUCT_IMAGES usable uploads, AND
    #   - they gave us a source_url to work from.
    # We only scrape up to the MAX so we never exceed what uploads would.
    scraped_from_url = False
    if len(file_bytes_list) < MIN_PRODUCT_IMAGES and source_url_clean:
        try:
            logger.info(f"URL-only training — scraping photos from {source_url_clean}")
            scraped = await scrape_product_images(
                source_url_clean,
                max_images=MAX_PRODUCT_IMAGES - len(file_bytes_list),
            )
            if scraped:
                file_bytes_list.extend(scraped)
                scraped_from_url = True
                logger.info(f"Scraped {len(scraped)} product photos from {source_url_clean}")
        except Exception as e:
            # Never let a scrape failure kill training — user gets a clear
            # error below if we still don't have enough photos.
            logger.warning(f"Product image scrape failed (ignored): {e}")

    # Validation threshold depends on how we got here:
    #   - Pure upload flow → keep the strict MIN_PRODUCT_IMAGES (3) rule.
    #   - URL-only flow → accept any non-empty scrape result. Gemini 3
    #     Pro Image locks product identity well from a single clean hero
    #     shot, and many sites (AliExpress, Amazon) only surface the
    #     `og:image` in their static HTML — forcing 3 would push the
    #     feature back to "upload manually" which defeats the point.
    url_only_flow = not uploaded_files and source_url_clean
    min_required = 1 if url_only_flow else MIN_PRODUCT_IMAGES

    if len(file_bytes_list) < min_required:
        if source_url_clean and not scraped_from_url:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Couldn't fetch product photos from that link. The page "
                    "may be JavaScript-rendered or blocked. Please upload "
                    f"at least {MIN_PRODUCT_IMAGES} photos manually."
                ),
            )
        raise HTTPException(
            status_code=400,
            detail=(
                f"At least {MIN_PRODUCT_IMAGES} valid photos required. "
                f"Either upload them or provide a product URL so we can fetch them."
            ),
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

    # ── 3. Analyse the product URL (best-effort — never blocks training) ──
    analysis: Optional[dict] = None
    if source_url_clean:
        try:
            analysis = await analyze_product_url(source_url_clean)
            if analysis:
                logger.info(
                    f"Extracted metadata for {product_id}: "
                    f"category='{analysis.get('category')}', "
                    f"features={len(analysis.get('features') or [])}"
                )
            else:
                logger.info(f"No extractable metadata for {source_url_clean}")
        except Exception as e:
            logger.warning(f"Product URL analysis failed (ignored): {e}")

    # ── 4. Persist product row — thumbnail FIRST so it's the display image ──
    category_clean = (category or "").strip() or None
    # URL-extracted category wins only if the user didn't set one explicitly
    if analysis and not category_clean and analysis.get("category"):
        category_clean = analysis["category"]

    row = {
        "id": product_id,
        "user_id": current_user["id"],
        "name": name_clean,
        "category": category_clean,
        "image_paths": [thumbnail_path] + ref_paths,
        "source_url": source_url_clean,
        "description": (analysis or {}).get("description") or None,
        "features": (analysis or {}).get("features") or [],
        "price": (analysis or {}).get("price") or None,
    }
    try:
        supabase.table("products").insert(row).execute()
    except Exception as db_err:
        _rollback_paths([thumbnail_path] + ref_paths)
        raise HTTPException(status_code=500, detail=f"Failed to save product: {db_err}")

    # ── 5. Deduct credits (admin bypass) ───────────────────────────────────
    if not is_admin(current_user):
        deduct_credits(
            current_user["id"],
            CREDIT_COST_IMAGE,
            "product_training",
            f"Product training: {name_clean}",
        )

    thumbnail_url = supabase.storage.from_("avatars").get_public_url(thumbnail_path)
    logger.info(
        f"Product trained. ID: {product_id}, Name: {name_clean}, "
        f"Refs: {len(ref_paths)}, Scraped: {scraped_from_url}"
    )
    return {
        "status": "Success",
        "product_id": product_id,
        "name": name_clean,
        "category": category_clean,
        "thumbnail": thumbnail_url,
        "reference_count": len(ref_paths),
        "source_url": source_url_clean,
        "description": row.get("description"),
        "features": row.get("features") or [],
        "price": row.get("price"),
        "scraped_from_url": scraped_from_url,
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
            .select(
                "id, name, category, image_paths, created_at, "
                "source_url, description, features, price"
            )
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
                "source_url": p.get("source_url"),
                "description": p.get("description"),
                "features": p.get("features") or [],
                "price": p.get("price"),
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
    template: str = Form("auto", description="One of the predefined templates, or 'auto' for AI research"),
    custom_prompt: str = Form("", description="Optional extra scene instructions"),
    aspect_ratio: str = Form("1:1"),
):
    """Generate a static ad creative using a trained product + template.

    When template == 'auto' we research the niche via Gemini 2.5 Pro with
    Google Search grounding, design a bespoke ad concept, then render it.
    """
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

    # Build a fused prompt — identity lock first, then product context (if we
    # extracted any from the source URL), then template + custom extras.
    tpl = TEMPLATES[template]
    extra = (custom_prompt or "").strip()
    extra_block = f" Additional direction: {extra}" if extra else ""

    # Re-assemble the analysis dict from the DB columns so we can reuse the
    # formatter that already handles empties gracefully.
    product_analysis = {
        "description": product.get("description"),
        "features": product.get("features") or [],
        "category": product.get("category"),
    }
    context_block = format_product_context(product["name"], product_analysis)
    context_line = f" {context_block}" if context_block else ""

    # Auto mode: chain-of-thought in two stages.
    #   Stage 1 — design_marketing_brief(): the model steps into the shoes
    #     of an e-commerce strategist and answers the foundational questions
    #     (problem solved, audience, benefit, objection, emotional angle…).
    #   Stage 2 — design_ad_concept(): with that brief in hand, the model
    #     researches top-performing ads in the niche and synthesises a
    #     visual concept that EXECUTES on the brief.
    # Either stage can fail independently. If the concept fails, we fall
    # back gracefully to a lifestyle template so the user still gets an
    # ad-style image rather than a 500.
    concept: Optional[dict] = None
    brief: Optional[dict] = None
    ad_brief: str
    if tpl.get("auto"):
        brief = await design_marketing_brief(
            name=product["name"],
            category=product.get("category"),
            description=product.get("description"),
            features=product.get("features") or [],
            price=product.get("price"),
        )
        if brief:
            logger.info(
                f"Marketing brief ready — key_benefit='{brief.get('key_benefit')}', "
                f"emotion='{brief.get('emotional_angle')}'"
            )
        else:
            logger.info("Marketing brief empty — concept stage will work from product info only.")

        concept = await design_ad_concept(
            name=product["name"],
            category=product.get("category"),
            description=product.get("description"),
            features=product.get("features") or [],
            brief=brief,
        )
        if concept:
            ad_brief = concept_to_prompt(concept)
            logger.info(
                f"Auto ad concept: '{concept.get('concept_name')}' — "
                f"hook={concept.get('hook_overlay_text') or '(none)'}"
            )
        else:
            logger.warning("Auto concept design failed — falling back to Lifestyle In-Use.")
            ad_brief = TEMPLATES["lifestyle"]["prompt"]
    else:
        ad_brief = tpl["prompt"]

    identity_prompt = (
        "The reference images show a specific physical product. "
        "Generate a NEW photograph featuring THIS EXACT SAME PRODUCT. "
        "ABSOLUTE REQUIREMENT — the product must be identical: same exact shape, "
        "colour, materials, branding, logos, text, proportions. "
        "Do NOT alter, redesign, or improve any detail of the product."
        f"{context_line} "
        f"Scene and style: {ad_brief}{extra_block}"
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

            # Record a useful human label for the history card. If auto
            # produced a concept name we surface it there.
            if concept and concept.get("concept_name"):
                history_prompt = f"Auto: {concept['concept_name']}"
                if extra:
                    history_prompt = f"{history_prompt} — {extra}"
            else:
                history_prompt = extra or tpl["label"]

            # Persist the chain-of-thought artefacts (brief + concept) so the
            # lightbox can replay the strategic reasoning later. Null for
            # non-auto templates — no need to bloat the row.
            metadata_payload: Optional[dict] = None
            if brief or concept:
                metadata_payload = {
                    "brief": brief,
                    "concept": concept,
                }

            supabase.table("generated_ads").insert({
                "id": ad_id,
                "user_id": current_user["id"],
                "product_id": product_id,
                "template": template,
                "prompt": history_prompt,
                "aspect_ratio": aspect_ratio,
                "image_url": image_url,
                "storage_path": storage_path,
                "metadata": metadata_payload,
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
                # Surface the chain-of-thought so the UI can show both the
                # strategic brief AND the visual concept the AI landed on.
                "brief": brief,
                "concept": concept,
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
            {
                "id": tpl_id,
                "label": tpl["label"],
                "auto": bool(tpl.get("auto")),
            }
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
            .select(
                "id, product_id, template, prompt, aspect_ratio, "
                "image_url, metadata, created_at"
            )
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
