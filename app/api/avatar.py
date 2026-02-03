import os
import io
import uuid 
from typing import List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from supabase import create_client, Client
from google import genai
from google.genai import types

router = APIRouter()

def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    return create_client(url, key)

@router.post("/lock-identity")
async def lock_identity(name: str = Form(...), files: List[UploadFile] = File(...)):
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Gemini supports a maximum of 5 human references.")
    
    supabase = get_supabase()
    char_id = str(uuid.uuid4()) # Create a unique ID for this character
    saved_paths = []

    try:
        for i, file in enumerate(files):
            file_content = await file.read()
            # File path includes the unique ID and an index (e.g., master_faces/char_123/ref_0.png)
            file_path = f"master_faces/{char_id}/ref_{i}.png"
            
            supabase.storage.from_("avatars").upload(
                path=file_path,
                file=file_content,
                file_options={"content-type": "image/png", "x-upsert": "true"}
            )
            saved_paths.append(file_path)

        # Save to DB with the unique ID and the list of paths
        db_res = supabase.table("characters").upsert({
            "id": char_id,
            "name": name,
            "image_paths": saved_paths
        }, on_conflict="name").execute()

        return {
            "status": "Success",
            "character_id": char_id,
            "name": name,
            "images_saved": len(saved_paths)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-scene")
async def generate_scene(character_name: str = Form(...), prompt: str = Form(...)):
    supabase = get_supabase()
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    try:
        # 1. Fetch character data
        res = supabase.table("characters").select("image_paths").eq("name", character_name).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Character not found.")
        
        # 2. Download ALL reference images
        gemini_contents = []
        for path in res.data['image_paths']:
            img_bytes = supabase.storage.from_("avatars").download(path)
            # Add each image as a separate Part for Gemini
            gemini_contents.append(types.Part.from_bytes(data=img_bytes, mime_type="image/png"))

        # 3. Add the prompt at the end
        gemini_contents.append(f"Using these reference images to maintain 100% facial identity, generate: {prompt}")

        # 4. Generate
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="9:16")
            )
        )

        # ... (Return streaming response logic as before)
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    return StreamingResponse(io.BytesIO(part.inline_data.data), media_type="image/png")
        
        raise HTTPException(status_code=500, detail="Generation failed.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/gallery/{character_id}")
async def get_character_gallery(character_id: str):
    supabase = get_supabase()
    
    try:
        # Fetch all history for this specific UUID, newest first
        res = supabase.table("generation_history") \
            .select("prompt, public_url, created_at") \
            .eq("character_id", character_id) \
            .order("created_at", desc=True) \
            .execute()
            
        return {
            "character_id": character_id,
            "total_images": len(res.data),
            "images": res.data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))