import os
import time
import logging
import asyncio
import requests
import replicate
from fastapi import APIRouter, Form, HTTPException, BackgroundTasks
from supabase import create_client, Client
from google import genai
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from app.core.config import settings
from app.services.video_engine import get_video_engine

logger = logging.getLogger(__name__)
router = APIRouter()

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

@router.post("/animate-avatar")
async def animate_avatar(
    background_tasks: BackgroundTasks,
    character_name: str = Form(...), 
    motion_prompt: str = Form(...),
    engine_choice: str = Form("veo")
):
    
    supabase = get_supabase()
    
    system_instruction = "Cinematic lighting, high resolution, 4k, natural movement, keep face consistent with reference."
    final_prompt = f"{system_instruction}. Action: {motion_prompt}"
    
    # 1. Fetch character data
    res = supabase.table("characters").select("id").eq("name", character_name).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Character not found")
    char_uuid = res.data['id']

    # 2. Get Image from Folder (The Scanner Fix)
    folder_path = f"generated_scenes/{char_uuid}"
    files = supabase.storage.from_("avatars").list(folder_path, {"limit": 1, "sortBy": {"column": "created_at", "order": "desc"}})
    if not files:
        raise HTTPException(status_code=404, detail="No generated scenes found.")
    
    latest_file_name = files[0]['name']
    full_storage_path = f"{folder_path}/{latest_file_name}"
    image_url = supabase.storage.from_("avatars").get_public_url(full_storage_path)
    
    # 3. Generate
    engine = get_video_engine(engine_choice)
    try:
        operation_id = await engine.generate(image_url, motion_prompt)
        
        # 4. Insert Job
        supabase.table("video_jobs").insert({
            "character_id": char_uuid,
            "operation_id": str(operation_id),
            "status": "processing",
            "engine": engine_choice,
            "source_url": image_url,
            "motion_prompt": f"[{engine_choice.upper()}] {motion_prompt}"
        }).execute()

        # FIX 1: Correct Argument Order (operation_id FIRST, then char_uuid)
        background_tasks.add_task(process_video_task, operation_id, char_uuid, engine_choice)

        return {"status": "Job Started", "operation_id": operation_id, "engine": engine_choice}
        
    except Exception as e:
        logger.error(f"Video Init Failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def process_video_task(operation_id: str, char_uuid: str, engine: str):
    # FIX 2: Define supabase OUTSIDE the try block so 'except' can use it
    supabase = get_supabase()
    
    try:
        final_video_url = None
        
        if engine == "veo":
            client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
            while True:
                op = client.operations.get(operation_id)
                if op.done:
                    # Extract bytes from Veo
                    video_bytes = op.response.generated_videos[0].video.data
                    # Upload bytes to storage
                    file_name = f"video_{int(time.time())}.mp4"
                    path = f"generated_videos/{char_uuid}/{file_name}"
                    supabase.storage.from_("avatars").upload(path, video_bytes, {"content-type": "video/mp4"})
                    final_video_url = supabase.storage.from_("avatars").get_public_url(path)
                    break
                await asyncio.sleep(20)

        elif engine == "kling":
            # 1. Wait for success
            prediction = replicate.predictions.get(operation_id)
            while prediction.status not in ["succeeded", "failed", "canceled"]:
                await asyncio.sleep(5)
                prediction.reload()
            
            if prediction.status == "succeeded":
                # Get the temporary URL
                temp_url = prediction.output[0] if isinstance(prediction.output, list) else prediction.output
                
                # FIX: ROBUST DOWNLOADER
                # Create a session with retry logic
                session = requests.Session()
                retry_strategy = Retry(
                    total=3,  # Try 3 times
                    backoff_factor=1,  # Wait 1s, 2s, 4s between retries
                    status_forcelist=[429, 500, 502, 503, 504]
                )
                session.mount("https://", HTTPAdapter(max_retries=retry_strategy))
                
                try:
                    # Set a generous timeout (30 seconds to connect, 60 seconds to read)
                    response = session.get(temp_url, timeout=(30, 300), stream=True) 
                    response.raise_for_status()
                    video_bytes = response.content
                except requests.exceptions.RequestException as e:
                    raise Exception(f"Failed to download video from Replicate after retries: {e}")

                # 2. Upload to Supabase
                file_name = f"video_{int(time.time())}.mp4"
                path = f"generated_videos/{char_uuid}/{file_name}"
                supabase.storage.from_("avatars").upload(path, video_bytes, {"content-type": "video/mp4"})
                final_video_url = supabase.storage.from_("avatars").get_public_url(path)
                
            else:
                raise Exception(f"Replicate failed: {prediction.error}")

        # Update DB on success
        if final_video_url:
            supabase.table("video_jobs").update({
                "status": "completed", 
                "video_url": final_video_url
            }).eq("operation_id", operation_id).execute()

    except Exception as e:
        logger.error(f"Background Task Failed: {e}")
        # Now 'supabase' is defined, so this line won't crash
        supabase.table("video_jobs").update({"status": "failed"}).eq("operation_id", operation_id).execute()

@router.get("/video-status/{operation_id:path}")
async def get_video_status(operation_id: str):
    """
    Optional: If the user wants to check status manually via API
    """
    supabase = get_supabase()
    # Find the job to know which engine it used
    job = supabase.table("video_jobs").select("*").eq("operation_id", operation_id).single().execute()
    
    if not job.data:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.data['status'] == "completed":
        return {"status": "completed", "video_url": job.data['video_url']}
    
    return {"status": job.data['status'], "message": "Processing..."}