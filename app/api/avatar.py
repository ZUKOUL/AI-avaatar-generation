import os
import io
import uuid
import time
import logging
from typing import List
from fastapi import APIRouter, Depends
from app.auth import verify_api_key
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from supabase import create_client, Client
from google import genai
from google.genai import types

# 2. Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()] # This prints to your terminal
)
logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_api_key)])

def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    return create_client(url, key)

@router.post("/Upload Reference")
async def lock_identity(files: List[UploadFile] = File(...)):
    supabase = get_supabase()
    
    # 1. Generate the UUID here (Backend Authority)
    char_uuid = str(uuid.uuid4())
    logger.info(f"Locking new anonymous identity: {char_uuid}")

    try:
        saved_paths = []
        # 2. Upload files to a folder named after the UUID
        for i, file in enumerate(files):
            file_content = await file.read()
            file_path = f"master_faces/{char_uuid}/ref_{i}.png"
            
            supabase.storage.from_("avatars").upload(
                path=file_path,
                file=file_content,
                file_options={"content-type": "image/png", "x-upsert": "true"}
            )
            saved_paths.append(file_path)

        # 3. Save to DB (Name is now Optional/None)
        # We use the UUID as the primary key
        data = {
            "id": char_uuid,
            "image_paths": saved_paths,
            "name": None # Or you could set a default like f"User-{char_uuid[:4]}"
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
    character_id: str = Form(...), # <--- Receives UUID now, not Name
    prompt: str = Form(...)
):
    supabase = get_supabase()
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    logger.info(f"Generation request for UUID: {character_id}")

    try:
        # 1. DIRECT FETCH by ID (Faster, no name lookup)
        res = supabase.table("characters").select("image_paths").eq("id", character_id).single().execute()
        
        if not res.data:
            logger.warning(f"Character UUID '{character_id}' not found.")
            raise HTTPException(status_code=404, detail="Identity not found. Please upload reference images first.")
        
        # 2. Download Images
        gemini_contents = []
        for path in res.data['image_paths']:
            img_bytes = supabase.storage.from_("avatars").download(path)
            gemini_contents.append(types.Part.from_bytes(data=img_bytes, mime_type="image/png"))

        gemini_contents.append(f"Maintain 1:1 facial identity. Scene: {prompt}")

        # 3. Call Gemini
        logger.info(f"Sending to Gemini...")
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="9:16")
            )
        )

        # 4. Process & Save Result
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    generated_bytes = part.inline_data.data
                    
                    # Save result in a folder named after the UUID
                    filename = f"gen_{int(time.time())}.png"
                    storage_path = f"generated_scenes/{character_id}/{filename}"
                    
                    supabase.storage.from_("avatars").upload(path=storage_path, file=generated_bytes)
                    
                    return StreamingResponse(io.BytesIO(generated_bytes), media_type="image/png")
        
        raise HTTPException(status_code=500, detail="Gemini returned empty response")

    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/characters")
async def get_characters():
    supabase = get_supabase()
    try:
        # Fetch all characters
        res = supabase.table("characters").select("id, name, image_paths").execute()
        
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
async def get_history(character_id: str):
    supabase = get_supabase()
    try:
        # 1. Validate ID exists (Optional, but good for safety)
        # We assume the ID is valid if the frontend sends it.

        # 2. List files in the specific UUID folder
        folder_path = f"generated_scenes/{character_id}"
        
        files = supabase.storage.from_("avatars").list(folder_path, {
            "limit": 50, 
            "sortBy": {"column": "created_at", "order": "desc"}
        })
        
        if not files:
            return []

        # 3. Convert to Public URLs
        history_items = []
        for f in files:
            # Skip placeholders or empty names
            if f['name'] == ".emptyFolderPlaceholder": 
                continue

            full_path = f"{folder_path}/{f['name']}"
            public_url = supabase.storage.from_("avatars").get_public_url(full_path)
            
            history_items.append({
                "filename": f['name'],
                "url": public_url,
                "created_at": f.get('created_at')
            })
            
        return history_items

    except Exception as e:
        logger.error(f"Failed to fetch history for {character_id}: {e}")
        return []