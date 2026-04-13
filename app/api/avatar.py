import os
import io
import uuid
import time
import logging
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, Body
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types
from google.genai.errors import APIError
from app.core.auth import get_current_user
from app.core.pricing import COST_GEMINI_FLASH_IMAGE, CREDIT_COST_IMAGE
from app.core.supabase import supabase
from app.models.user import User
from app.services.credit_service import deduct_credits, get_balance, is_admin

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

MAX_REFERENCE_IMAGES = 5

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# 1. GENERATE AVATAR  –  Create an avatar and store it in the library
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/generate-avatar")
async def generate_avatar(
    current_user: Annotated[User, Depends(get_current_user)],
    prompt: str = Form(..., description="Describe the avatar you want to generate"),
    nickname: str = Form(..., max_length=100, description="A unique nickname for this avatar"),
    files: List[UploadFile] = File(default=[], description="Optional reference images (max 3)"),
):
    """
    Generate an AI avatar and store it in the avatar library (characters table).
    - prompt (required): Describe the avatar style/look
    - nickname (required): A unique name for this avatar
    - files (optional): Upload up to 3 reference images for identity guidance
    """
    # Validate file count
    if files and len(files) > MAX_REFERENCE_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_REFERENCE_IMAGES} reference images allowed. You uploaded {len(files)}.",
        )

    # Credit check (skip for administrators)
    if not is_admin(current_user):
        balance = get_balance(current_user["id"])
        if balance < CREDIT_COST_IMAGE:
            raise HTTPException(
                status_code=402,
                detail={"error": "INSUFFICIENT_CREDITS", "message": f"You need {CREDIT_COST_IMAGE} credit(s). Current balance: {balance}"},
            )

    avatar_id = str(uuid.uuid4())
    logger.info(f"Generating avatar '{nickname}' for user {current_user['id']}: {avatar_id}")

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    try:
        # Build Gemini contents: optional reference images + prompt
        gemini_contents = []

        # Add reference images if provided
        if files:
            for file in files:
                file_content = await file.read()
                if not file_content:
                    continue
                gemini_contents.append(
                    types.Part.from_bytes(data=file_content, mime_type="image/png")
                )
            if gemini_contents:
                logger.info(f"Using {len(gemini_contents)} reference image(s) for avatar generation")

        # Build the avatar generation prompt — photorealistic cinematic headshot style
        base_style = (
            "Photorealistic portrait photograph of a person. "
            "Shot on a 85mm f/1.4 lens with shallow depth of field and natural bokeh background. "
            "Soft, warm cinematic lighting with natural skin tones and visible skin texture. "
            "Head and shoulders framing, eye-level angle. "
            "The subject has a natural, relaxed expression. "
            "Ultra high detail, 8K quality, no text, no watermark, no artifacts."
        )

        if gemini_contents:
            # With references: hyper-strict identity lock
            avatar_prompt = (
                f"This is a reference photo of a specific person. "
                f"Generate a NEW photorealistic portrait of THIS EXACT SAME PERSON. "
                f"ABSOLUTE REQUIREMENT — the generated face must be identical to the reference:"
                f"DO NOT alter, beautify, or idealize ANY facial feature. "
                f"{base_style} "
                f"Additional style direction: {prompt}"
            )
        else:
            avatar_prompt = (
                f"Generate an original photorealistic character portrait of a unique person. "
                f"{base_style} "
                f"Character description: {prompt}"
            )

        gemini_contents.append(avatar_prompt)

        # Call Gemini
        try:
            response = client.models.generate_content(
                model="gemini-3-pro-image-preview",
                contents=gemini_contents,
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K")
                )
            )
        except APIError as api_err:
            logger.error(f"Gemini API Error: {api_err}")
            raise HTTPException(status_code=400, detail=f"AI provider error: {api_err.message if hasattr(api_err, 'message') else str(api_err)}")
        except Exception as e:
            logger.error(f"Unexpected error calling Gemini: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to communicate with AI provider: {str(e)}")

        # Process response
        if not response.candidates:
            raise HTTPException(status_code=500, detail="Gemini returned no candidates.")
            
        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
            finish_reason = getattr(candidate, "finish_reason", "UNKNOWN")
            raise HTTPException(
                status_code=400, 
                detail=f"Image generation failed or was blocked by safety filters"
            )
            
        for part in candidate.content.parts:
                if part.text:
                    logger.info(f"Gemini reasoning: {part.text[:200]}")
                elif part.inline_data:
                    generated_bytes = part.inline_data.data

                    # Save generated avatar to storage
                    storage_path = f"avatars_library/{avatar_id}/avatar.png"
                    supabase.storage.from_("avatars").upload(
                        path=storage_path,
                        file=generated_bytes,
                        file_options={"content-type": "image/png", "x-upsert": "true"},
                    )

                    # Insert into characters table (avatar library)
                    nickname_clean = nickname.strip()
                    data = {
                        "id": avatar_id,
                        "user_id": current_user["id"],
                        "image_paths": [storage_path],
                        "name": nickname_clean if nickname_clean else None,
                    }

                    try:
                        supabase.table("characters").insert(data).execute()
                    except Exception as db_err:
                        err_msg = str(db_err)
                        if "unique" in err_msg.lower() or "duplicate" in err_msg.lower():
                            raise HTTPException(
                                status_code=409,
                                detail={"error": "NICKNAME_TAKEN", "message": f"The nickname '{nickname_clean}' is already taken. Please choose another."},
                            )
                        raise

                    # Deduct credits (skip for administrators)
                    if not is_admin(current_user):
                        deduct_credits(current_user["id"], CREDIT_COST_IMAGE, "image_generation", f"Avatar generation: {nickname_clean}")

                    logger.info(f"Avatar generated. ID: {avatar_id}, Nickname: {nickname_clean}")

                    # Return JSON with avatar details
                    image_url = supabase.storage.from_("avatars").get_public_url(storage_path)

                    return {
                        "status": "Success",
                        "avatar_id": avatar_id,
                        "nickname": nickname_clean,
                        "image_url": image_url,
                        "cost_usd": COST_GEMINI_FLASH_IMAGE,
                        "engine": "gemini-3-pro-image-preview",
                    }

        raise HTTPException(status_code=500, detail="Gemini returned empty response")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Avatar generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# 2. GENERATE IMAGE  –  Create images and store in generated_images table
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/generate-image")
async def generate_image(
    current_user: Annotated[User, Depends(get_current_user)],
    prompt: str = Form(..., description="Describe the scene you want to generate"),
    avatar_id: Optional[str] = Form(None, description="Optional: Select an avatar from your library"),
    files: List[UploadFile] = File(default=[], description="Optional: Upload reference images (max 3)"),
):
    """
    Generate a scene/image and store it in the generated_images table.
    Flexible — use any combination:
    - prompt only → generates from imagination
    - avatar_id + prompt → uses avatar from library as identity reference
    - files + prompt → uses uploaded images as references
    - avatar_id + files + prompt → uses both
    """
    if avatar_id is not None and avatar_id.strip().lower() in ("string", "", "null", "none"):
        avatar_id = None

    logger.info(f"Image generation request by user {current_user['id']}, avatar_id={avatar_id}")

    # Filter out empty file uploads (Swagger may send empty entries)
    valid_files = []
    if files:
        for f in files:
            content = await f.read()
            if content and len(content) > 100:
                valid_files.append(content)

    if len(valid_files) > MAX_REFERENCE_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_REFERENCE_IMAGES} reference images allowed. You uploaded {len(valid_files)}.",
        )

    # Credit check (skip for administrators)
    if not is_admin(current_user):
        balance = get_balance(current_user["id"])
        if balance < CREDIT_COST_IMAGE:
            raise HTTPException(
                status_code=402,
                detail={"error": "INSUFFICIENT_CREDITS", "message": f"You need {CREDIT_COST_IMAGE} credit(s). Current balance: {balance}"},
            )

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    try:
        gemini_contents = []

        # 1. Load avatar from library if avatar_id is provided
        if avatar_id:
            res = (
                supabase.table("characters")
                .select("image_paths, user_id")
                .eq("id", avatar_id)
                .single()
                .execute()
            )
            if not res.data:
                raise HTTPException(status_code=404, detail="Avatar not found in your library.")
            if str(res.data.get("user_id")) != current_user["id"]:
                raise HTTPException(status_code=404, detail="Avatar not found in your library.")

            image_paths = res.data["image_paths"][:MAX_REFERENCE_IMAGES]
            for path in image_paths:
                img_bytes = supabase.storage.from_("avatars").download(path)
                gemini_contents.append(
                    types.Part.from_bytes(data=img_bytes, mime_type="image/png")
                )
            logger.info(f"Loaded {len(image_paths)} avatar image(s) from library")

        # 2. Add uploaded reference images if provided
        for file_bytes in valid_files:
            gemini_contents.append(
                types.Part.from_bytes(data=file_bytes, mime_type="image/png")
            )
        if valid_files:
            logger.info(f"Added {len(valid_files)} uploaded reference images")

        # 3. Build the generation prompt
        if gemini_contents:
            # Hyper-strict identity lock for scene generation
            identity_prompt = (
                f"The reference image(s) show a specific person. "
                f"Generate a scene featuring THIS EXACT SAME PERSON. "
                f"The face MUST be identical "
                f"DO NOT alter or beautify any facial feature. "
                f"Scene description: {prompt}"
            )
        else:
            identity_prompt = prompt

        gemini_contents.append(identity_prompt)

        # 4. Call Gemini
        logger.info(f"Sending {len(gemini_contents) - 1} reference(s) to Gemini...")
        try:
            response = client.models.generate_content(
                model="gemini-3-pro-image-preview",
                contents=gemini_contents,
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio="9:16", image_size="1K")
                )
            )
        except APIError as api_err:
            logger.error(f"Gemini API Error: {api_err}")
            raise HTTPException(status_code=400, detail=f"AI provider error: {api_err.message if hasattr(api_err, 'message') else str(api_err)}")
        except Exception as e:
            logger.error(f"Unexpected error calling Gemini: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to communicate with AI provider: {str(e)}")

        # 5. Process & Save Result
        if not response.candidates:
            raise HTTPException(status_code=500, detail="Gemini returned no candidates.")
            
        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
            finish_reason = getattr(candidate, "finish_reason", "UNKNOWN")
            raise HTTPException(
                status_code=400, 
                detail=f"Image generation failed or was blocked by safety filters. Finish reason: {finish_reason}"
            )
            
        for part in candidate.content.parts:
                if part.text:
                    logger.info(f"Gemini reasoning: {part.text[:200]}")
                elif part.inline_data:
                    generated_bytes = part.inline_data.data

                    # Generate a unique image ID
                    image_id = str(uuid.uuid4())

                    # Upload to storage
                    filename = f"gen_{int(time.time())}.png"
                    folder = avatar_id if avatar_id else "freestyle"
                    storage_path = f"generated_images/{folder}/{filename}"

                    supabase.storage.from_("avatars").upload(
                        path=storage_path, file=generated_bytes,
                        file_options={"content-type": "image/png"},
                    )

                    # Get public URL
                    image_url = supabase.storage.from_("avatars").get_public_url(storage_path)

                    # Insert into generated_images table
                    supabase.table("generated_images").insert({
                        "id": image_id,
                        "user_id": current_user["id"],
                        "avatar_id": avatar_id,
                        "prompt": prompt,
                        "image_url": image_url,
                        "storage_path": storage_path,
                    }).execute()

                    # Deduct credits (skip for administrators)
                    if not is_admin(current_user):
                        desc = f"Image generation"
                        if avatar_id:
                            desc += f" with avatar {avatar_id}"
                        deduct_credits(current_user["id"], CREDIT_COST_IMAGE, "image_generation", desc)

                    logger.info(f"Image generated. ID: {image_id}, Avatar: {avatar_id or 'freestyle'}")

                    return {
                        "status": "Success",
                        "image_id": image_id,
                        "avatar_id": avatar_id,
                        "prompt": prompt,
                        "image_url": image_url,
                        "cost_usd": COST_GEMINI_FLASH_IMAGE,
                        "engine": "gemini-3-pro-image-preview",
                    }

        raise HTTPException(status_code=500, detail="Gemini returned empty response")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# 3. AVATAR MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────
@router.put("/characters/{character_id}/nickname")
async def update_character_nickname(
    current_user: Annotated[User, Depends(get_current_user)],
    character_id: str,
    nickname: str = Body(..., embed=True, max_length=100),
):
    """Update an avatar's nickname. Only the owner can update it."""
    try:
        ch = (
            supabase.table("characters")
            .select("id, name")
            .eq("id", character_id)
            .eq("user_id", current_user["id"])
            .single()
            .execute()
        )
        if not ch.data:
            raise HTTPException(status_code=404, detail="Avatar not found.")

        nickname_clean = nickname.strip() if nickname else None

        try:
            supabase.table("characters").update({"name": nickname_clean}).eq("id", character_id).execute()
        except Exception as db_err:
            err_msg = str(db_err)
            if "unique" in err_msg.lower() or "duplicate" in err_msg.lower():
                raise HTTPException(
                    status_code=409,
                    detail={"error": "NICKNAME_TAKEN", "message": f"The nickname '{nickname_clean}' is already taken."},
                )
            raise

        logger.info(f"Updated nickname for avatar {character_id}: {nickname_clean}")

        return {
            "status": "Success",
            "avatar_id": character_id,
            "nickname": nickname_clean,
            "message": "Nickname updated successfully.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update nickname: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avatars")
async def get_avatars(current_user: Annotated[User, Depends(get_current_user)]):
    """List all avatars in the user's library (from characters table)."""
    try:
        res = (
            supabase.table("characters")
            .select("id, name, image_paths, created_at")
            .eq("user_id", current_user["id"])
            .order("created_at", desc=True)
            .execute()
        )
        avatars = []
        for char in res.data:
            thumb_url = None
            if char.get("image_paths") and len(char["image_paths"]) > 0:
                thumb_url = supabase.storage.from_("avatars").get_public_url(char["image_paths"][0])

            display_name = char["name"] if char["name"] else f"Avatar-{char['id'][:4]}"

            avatars.append({
                "avatar_id": char["id"],
                "name": display_name,
                "thumbnail": thumb_url,
                "created_at": char.get("created_at"),
            })

        return {"avatars": avatars}
    except Exception as e:
        logger.error(f"Failed to fetch avatars: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# 4. IMAGE HISTORY  –  Query from generated_images table
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/images")
async def get_images(
    current_user: Annotated[User, Depends(get_current_user)],
    avatar_id: Optional[str] = None,
    limit: int = 50,
):
    """
    Get generated image history from the database.
    - avatar_id (optional): Filter by avatar
    - limit: Max results (default 50, max 100)
    """
    try:
        limit = min(limit, 100)

        query = (
            supabase.table("generated_images")
            .select("id, avatar_id, prompt, image_url, created_at")
            .eq("user_id", current_user["id"])
            .order("created_at", desc=True)
            .limit(limit)
        )

        if avatar_id:
            query = query.eq("avatar_id", avatar_id)

        res = query.execute()

        return {
            "images": [
                {
                    "image_id": img["id"],
                    "avatar_id": img.get("avatar_id"),
                    "prompt": img.get("prompt"),
                    "image_url": img["image_url"],
                    "created_at": img.get("created_at"),
                }
                for img in (res.data or [])
            ]
        }

    except Exception as e:
        logger.error(f"Failed to fetch image history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/images/{image_id}")
async def get_image_by_id(
    current_user: Annotated[User, Depends(get_current_user)],
    image_id: str,
):
    """Get a single generated image by its ID."""
    try:
        res = (
            supabase.table("generated_images")
            .select("id, avatar_id, prompt, image_url, storage_path, created_at")
            .eq("id", image_id)
            .eq("user_id", current_user["id"])
            .single()
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Image not found.")

        return {
            "image_id": res.data["id"],
            "avatar_id": res.data.get("avatar_id"),
            "prompt": res.data.get("prompt"),
            "image_url": res.data["image_url"],
            "created_at": res.data.get("created_at"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/describe-image")
async def describe_image(
    current_user: Annotated[User, Depends(get_current_user)],
    image_url: str = Form(None, description="URL of the image to describe"),
    files: List[UploadFile] = File(default=[], description="Upload image to describe"),
):
    """
    Describe an image using Gemini — returns a short text description.
    Free endpoint (no credits deducted).
    """
    import requests as req

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    gemini_contents = []

    # Get image bytes from file upload or URL
    real_files = [f for f in files if f.filename and f.size and f.size > 0]
    if real_files:
        file_content = await real_files[0].read()
        gemini_contents.append(types.Part.from_bytes(data=file_content, mime_type="image/png"))
    elif image_url:
        resp = req.get(image_url)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Could not fetch image from URL.")
        gemini_contents.append(types.Part.from_bytes(data=resp.content, mime_type="image/png"))
    else:
        raise HTTPException(status_code=400, detail="Provide an image URL or upload a file.")

    gemini_contents.append(
        "Describe this image in a short, vivid sentence suitable as a video generation prompt. "
        "Focus on the subject, setting, mood, and any notable details. Keep it under 30 words."
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=gemini_contents,
        )
        description = response.text.strip() if response.text else "A person in the image."
        return {"description": description}
    except Exception as e:
        logger.error(f"Describe image failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to describe image.")