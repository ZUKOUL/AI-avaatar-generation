import os
import io
import uuid
import time
import logging
from typing import Annotated, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Body
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types
from app.core.auth import get_current_user
from app.core.pricing import COST_GEMINI_FLASH_IMAGE, CREDIT_COST_IMAGE
from app.core.supabase import supabase
from app.models.user import User
from app.services.credit_service import deduct_credits, get_balance

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

MAX_REFERENCE_IMAGES = 3

router = APIRouter()


@router.post("/Upload Reference")
async def lock_identity(
    current_user: Annotated[User, Depends(get_current_user)],
    files: List[UploadFile] = File(...),
):
    if len(files) > MAX_REFERENCE_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_REFERENCE_IMAGES} reference images allowed. You uploaded {len(files)}.",
        )

    char_uuid = str(uuid.uuid4())
    logger.info(f"Locking new identity for user {current_user['id']}: {char_uuid}")

    try:
        saved_paths = []
        for i, file in enumerate(files):
            file_content = await file.read()
            file_path = f"master_faces/{char_uuid}/ref_{i}.png"
            supabase.storage.from_("avatars").upload(
                path=file_path,
                file=file_content,
                file_options={"content-type": "image/png", "x-upsert": "true"},
            )
            saved_paths.append(file_path)

        data = {
            "id": char_uuid,
            "user_id": current_user["id"],
            "image_paths": saved_paths,
            "name": None,
        }
        supabase.table("characters").upsert(data).execute()

        logger.info(f"Identity locked. UUID: {char_uuid}")
        
        # 4. Return the UUID to the Frontend
        return {
            "status": "Success", 
            "character_id": char_uuid, 
            "message": "Identity locked. Use this ID for generation."
        }

    except Exception as e:
        logger.error(f"Failed to lock identity: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-scene")
async def generate_scene(
    current_user: Annotated[User, Depends(get_current_user)],
    character_id: str = Form(...),
    prompt: str = Form(...),
):
    logger.info(f"Generation request for character {character_id} by user {current_user['id']}")

    # Credit check
    balance = get_balance(current_user["id"])
    if balance < CREDIT_COST_IMAGE:
        raise HTTPException(
            status_code=402,
            detail={"error": "INSUFFICIENT_CREDITS", "message": f"You need {CREDIT_COST_IMAGE} credit(s). Current balance: {balance}"},
        )

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    try:
        res = (
            supabase.table("characters")
            .select("image_paths, user_id")
            .eq("id", character_id)
            .single()
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Identity not found. Please upload reference images first.")
        if str(res.data.get("user_id")) != current_user["id"]:
            raise HTTPException(status_code=404, detail="Identity not found.")
        
        # 2. Download reference images (cap to MAX_REFERENCE_IMAGES)
        image_paths = res.data['image_paths'][:MAX_REFERENCE_IMAGES]
        gemini_contents = []
        for path in image_paths:
            img_bytes = supabase.storage.from_("avatars").download(path)
            gemini_contents.append(types.Part.from_bytes(data=img_bytes, mime_type="image/png"))

        # 3. Build a detailed, descriptive prompt for character consistency
        #    Per Nano Banana docs: "Describe the scene, don't just list keywords"
        #    and "Be Hyper-Specific" for best identity preservation
        identity_prompt = (
f"Maintain 1:1 facial identity. Scene: {prompt}"
        )
        gemini_contents.append(identity_prompt)

        # 4. Call Gemini with TEXT+IMAGE modalities for better reasoning
        logger.info(f"Sending {len(image_paths)} reference(s) to Gemini...")
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="9:16")
            )
        )

        # 5. Process & Save Result (handle both TEXT and IMAGE parts)
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                # Log any text reasoning the model returns
                if part.text:
                    logger.info(f"Gemini reasoning: {part.text[:200]}")
                elif part.inline_data:
                    generated_bytes = part.inline_data.data
                    
                    # Save result in a folder named after the UUID
                    filename = f"gen_{int(time.time())}.png"
                    storage_path = f"generated_scenes/{character_id}/{filename}"
                    
                    supabase.storage.from_("avatars").upload(path=storage_path, file=generated_bytes)

                    # Deduct credits after successful generation
                    deduct_credits(current_user["id"], CREDIT_COST_IMAGE, "image_generation", f"Scene generation for character {character_id}")
                    
                    return StreamingResponse(
                        io.BytesIO(generated_bytes), 
                        media_type="image/png",
                        headers={
                            "X-Generation-Cost": str(COST_GEMINI_FLASH_IMAGE),
                            "X-Generation-Engine": "gemini-2.5-flash-image",
                            "X-Generation-Type": "image",
                        }
                    )
        
        raise HTTPException(status_code=500, detail="Gemini returned empty response")

    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.put("/characters/{character_id}/nickname")
async def update_character_nickname(
    current_user: Annotated[User, Depends(get_current_user)],
    character_id: str,
    nickname: str = Body(..., embed=True, max_length=100),
):
    """Update a character's nickname. Only the owner can update it."""
    try:
        # Verify character exists and belongs to user
        ch = (
            supabase.table("characters")
            .select("id, name")
            .eq("id", character_id)
            .eq("user_id", current_user["id"])
            .single()
            .execute()
        )
        if not ch.data:
            raise HTTPException(status_code=404, detail="Character not found.")

        # Update nickname (trim whitespace, allow empty string to clear nickname)
        nickname_clean = nickname.strip() if nickname else None
        supabase.table("characters").update({"name": nickname_clean}).eq("id", character_id).execute()

        logger.info(f"Updated nickname for character {character_id} by user {current_user['id']}: {nickname_clean}")

        return {
            "status": "Success",
            "character_id": character_id,
            "nickname": nickname_clean,
            "message": "Nickname updated successfully.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update nickname: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/characters")
async def get_characters(current_user: Annotated[User, Depends(get_current_user)]):
    try:
        res = (
            supabase.table("characters")
            .select("id, name, image_paths")
            .eq("user_id", current_user["id"])
            .execute()
        )
        char_list = []
        for char in res.data:
            # 1. Get Thumbnail (First image in the array)
            thumb_url = None
            if char.get("image_paths") and len(char["image_paths"]) > 0:
                thumb_url = supabase.storage.from_("avatars").get_public_url(char["image_paths"][0])
            
            # 2. Handle "Anonymous" characters
            display_name = char["name"] if char["name"] else f"Session-{char['id'][:4]}"

            char_list.append({
                "id": char["id"],         # <--- FRONTEND USES THIS ID
                "name": display_name,     # Label for the UI
                "thumbnail": thumb_url    # Image for the circle/square
            })
            
        return char_list
    except Exception as e:
        logger.error(f"Failed to fetch characters: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_history(
    current_user: Annotated[User, Depends(get_current_user)],
    character_id: str | None = None,
):
    try:
        history_items = []

        if character_id:
            # Ensure character belongs to user
            ch = (
                supabase.table("characters")
                .select("id")
                .eq("id", character_id)
                .eq("user_id", current_user["id"])
                .single()
                .execute()
            )
            if not ch.data:
                return []
            folder_path = f"generated_scenes/{character_id}"
            files = supabase.storage.from_("avatars").list(
                folder_path, {"limit": 50, "sortBy": {"column": "created_at", "order": "desc"}}
            )
            if files:
                for f in files:
                    if f["name"] == ".emptyFolderPlaceholder":
                        continue
                    full_path = f"{folder_path}/{f['name']}"
                    public_url = supabase.storage.from_("avatars").get_public_url(full_path)
                    history_items.append({
                        "filename": f["name"],
                        "url": public_url,
                        "created_at": f.get("created_at"),
                    })
        else:
            # Only this user's characters
            res = (
                supabase.table("characters")
                .select("id")
                .eq("user_id", current_user["id"])
                .execute()
            )
            char_ids = [r["id"] for r in (res.data or [])]
            for cid in char_ids:
                folder_path = f"generated_scenes/{cid}"
                files = supabase.storage.from_("avatars").list(
                    folder_path, {"limit": 50, "sortBy": {"column": "created_at", "order": "desc"}}
                )
                if files:
                    for f in files:
                        if f["name"] == ".emptyFolderPlaceholder":
                            continue
                        full_path = f"{folder_path}/{f['name']}"
                        public_url = supabase.storage.from_("avatars").get_public_url(full_path)
                        history_items.append({
                            "filename": f["name"],
                            "url": public_url,
                            "created_at": f.get("created_at"),
                        })
            history_items.sort(key=lambda x: x.get("created_at") or "", reverse=True)

        return history_items

    except Exception as e:
        logger.error(f"Failed to fetch history: {e}")
        return []