import os
import io
import uuid
import time
import logging  # 1. Import logging
from typing import List
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

router = APIRouter()

def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    return create_client(url, key)

@router.post("/lock-identity")
async def lock_identity(name: str = Form(...), files: List[UploadFile] = File(...)):
    supabase = get_supabase()
    char_id = str(uuid.uuid4()) 
    logger.info(f"Creating new identity: {name} (UUID: {char_id})") # Log start

    try:
        saved_paths = []
        for i, file in enumerate(files):
            file_content = await file.read()
            file_path = f"master_faces/{char_id}/ref_{i}.png"
            
            supabase.storage.from_("avatars").upload(
                path=file_path,
                file=file_content,
                file_options={"content-type": "image/png", "x-upsert": "true"}
            )
            saved_paths.append(file_path)

        supabase.table("characters").upsert({
            "id": char_id,
            "name": name,
            "image_paths": saved_paths
        }, on_conflict="name").execute()

        logger.info(f"Successfully locked identity for {name} with {len(saved_paths)} images.")
        return {"status": "Success", "character_id": char_id, "name": name}
    except Exception as e:
        logger.error(f"Failed to lock identity for {name}: {str(e)}") # Log error
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/generate-scene")
async def generate_scene(character_name: str = Form(...), prompt: str = Form(...)):
    supabase = get_supabase()
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    logger.info(f"Generation request received for: {character_name}")

    try:
        res = supabase.table("characters").select("id, image_paths").eq("name", character_name).single().execute()
        if not res.data:
            logger.warning(f"Generation failed: Character '{character_name}' not found.")
            raise HTTPException(status_code=404, detail="Character not found.")
        
        char_uuid = res.data['id']
        
        # ... (Download Logic) ...
        gemini_contents = []
        for path in res.data['image_paths']:
            img_bytes = supabase.storage.from_("avatars").download(path)
            gemini_contents.append(types.Part.from_bytes(data=img_bytes, mime_type="image/png"))

        gemini_contents.append(f"Maintain 1:1 facial identity. Scene: {prompt}")

        logger.info(f"Sending request to Gemini for UUID: {char_uuid}")
        
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="9:16")
            )
        )

        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    generated_bytes = part.inline_data.data

                    try:
                        filename = f"gen_{int(time.time())}.png"
                        storage_path = f"generated_scenes/{char_uuid}/{filename}"
                        supabase.storage.from_("avatars").upload(path=storage_path, file=generated_bytes)
                        logger.info(f"Image saved to Supabase: {storage_path}")
                    except Exception as storage_err:
                        logger.error(f"Supabase Storage Error for {char_uuid}: {storage_err}")

                    return StreamingResponse(io.BytesIO(generated_bytes), media_type="image/png")
        
        logger.error("Gemini returned an empty response.")
        raise HTTPException(status_code=500, detail="Generation failed.")

    except Exception as e:
        logger.error(f"Unexpected error during generation for {character_name}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")