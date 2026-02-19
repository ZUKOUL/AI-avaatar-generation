import os
import time
import logging
import asyncio
import requests
import replicate
from fastapi import APIRouter, Form, HTTPException, BackgroundTasks
from supabase import create_client, Client
from google import genai
from google.genai import types
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from app.core.config import settings
from app.services.video_engine import get_video_engine
from app.core.pricing import get_video_cost

logger = logging.getLogger(__name__)
router = APIRouter()

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

@router.post("/animate-avatar")
async def animate_avatar(
    background_tasks: BackgroundTasks,
    character_id: str = Form(...),  # <--- CHANGED: Accept ID directly
    motion_prompt: str = Form(...),
    engine_choice: str = Form("veo")
):
    supabase = get_supabase()
    
    system_instruction = "maintain exact facial identity and features from reference image, consistent"
    final_prompt = f"{system_instruction}. Action: {motion_prompt}"
    
    # 1. Validate ID exists (Optional but good safety)
    # We can skip the DB lookup since we have the ID, just check storage.
    char_uuid = character_id 

    # 2. Get Image from Folder
    folder_path = f"generated_scenes/{char_uuid}"
    files = supabase.storage.from_("avatars").list(folder_path, {"limit": 1, "sortBy": {"column": "created_at", "order": "desc"}})
    
    if not files or len(files) == 0:
        # Fallback: Check if it's a "Stock" character (hardcoded ID)
        if "stock" in char_uuid:
             # You might want to handle stock characters differently or assume the ID *is* the URL
             pass
        else:
             raise HTTPException(status_code=404, detail="No generated scenes found for this character. Please generate an image first.")
    
    latest_file_name = files[0]['name']
    full_storage_path = f"{folder_path}/{latest_file_name}"
    image_url = supabase.storage.from_("avatars").get_public_url(full_storage_path)
    
    # 3. Generate
    engine = get_video_engine(engine_choice)
    try:
        operation_id = await engine.generate(image_url, motion_prompt)
        
        # 4. Calculate cost & Insert Job
        estimated_cost = get_video_cost(engine_choice)
        
        supabase.table("video_jobs").insert({
            "character_id": char_uuid,
            "operation_id": str(operation_id),
            "status": "processing",
            "engine": engine_choice,
            "source_url": image_url,
            "motion_prompt": f"[{engine_choice.upper()}] {motion_prompt}"
        }).execute()

        background_tasks.add_task(process_video_task, operation_id, char_uuid, engine_choice)

        return {
            "status": "Job Started", 
            "operation_id": operation_id, 
            "engine": engine_choice,
            "estimated_cost_usd": estimated_cost
        }
        
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
                op = client.operations.get(types.GenerateVideosOperation(name=operation_id))
                if op.done:
                    # Check for errors first
                    if hasattr(op, 'error') and op.error:
                        raise Exception(f"Veo generation failed: {op.error}")
                    
                    if not op.response or not op.response.generated_videos:
                        raise Exception(f"Veo returned no videos. Full response: {op.response}")
                    
                    video_obj = op.response.generated_videos[0].video
                    
                    if video_obj.uri:
                        # Download from the URI
                        # FIX: Add API Key to headers for authentication
                        api_key = os.getenv("GEMINI_API_KEY")
                        headers = {"x-goog-api-key": api_key} if api_key else {}
                        
                        resp = requests.get(video_obj.uri, headers=headers)
                        resp.raise_for_status()
                        video_bytes = resp.content
                    elif hasattr(video_obj, 'video_bytes') and video_obj.video_bytes:
                         video_bytes = video_obj.video_bytes
                    else:
                         # Fallback for some SDK versions or if attribute name differs
                         raise ValueError(f"No video content found in response. Available attributes: {dir(video_obj)}")
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
        import traceback
        traceback.print_exc()
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

    engine = job.data.get('engine', 'veo')
    cost = get_video_cost(engine)
    
    if job.data['status'] == "completed":
        return {
            "status": "completed", 
            "video_url": job.data['video_url'],
            "cost_usd": cost,
            "engine": engine
        }
    
    return {
        "status": job.data['status'], 
        "message": "Processing...",
        "estimated_cost_usd": cost,
        "engine": engine
    }

@router.get("/video-history")
async def get_video_history(character_id: str = None):
    supabase = get_supabase()
    try:
        video_items = []

        if character_id:
            folder_path = f"generated_videos/{character_id}"
            files = supabase.storage.from_("avatars").list(folder_path, {
                "limit": 50, 
                "sortBy": {"column": "created_at", "order": "desc"}
            })
            if files:
                for f in files:
                    if f['name'].startswith("."): continue
                    full_path = f"{folder_path}/{f['name']}"
                    public_url = supabase.storage.from_("avatars").get_public_url(full_path)
                    video_items.append({
                        "filename": f['name'],
                        "url": public_url,
                        "created_at": f.get('created_at')
                    })
        else:
            # Fetch ALL video history across all characters
            folders = supabase.storage.from_("avatars").list("generated_videos", {
                "limit": 100
            })
            if folders:
                for folder in folders:
                    if folder['name'].startswith("."): continue
                    folder_path = f"generated_videos/{folder['name']}"
                    files = supabase.storage.from_("avatars").list(folder_path, {
                        "limit": 50,
                        "sortBy": {"column": "created_at", "order": "desc"}
                    })
                    if files:
                        for f in files:
                            if f['name'].startswith("."): continue
                            full_path = f"{folder_path}/{f['name']}"
                            public_url = supabase.storage.from_("avatars").get_public_url(full_path)
                            video_items.append({
                                "filename": f['name'],
                                "url": public_url,
                                "created_at": f.get('created_at')
                            })
            video_items.sort(key=lambda x: x.get('created_at') or '', reverse=True)

        return video_items

    except Exception as e:
        logger.error(f"Failed to fetch video history: {e}")
        return []