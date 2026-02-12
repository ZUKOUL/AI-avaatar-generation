import os
import time
import logging
import asyncio
import requests
import replicate
from fastapi import APIRouter, Depends
from app.auth import verify_api_key
from google.genai import types
from fastapi import APIRouter, Form, HTTPException, BackgroundTasks
from supabase import create_client, Client
from google import genai
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from app.core.config import settings
from app.services.video_engine import get_video_engine

router = APIRouter(dependencies=[Depends(verify_api_key)])

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

@router.post("/animate-avatar")
async def animate_avatar(
    background_tasks: BackgroundTasks,
    character_id: str = Form(...),  # <--- CHANGED: Accept ID directly
    motion_prompt: str = Form(...),
    engine_choice: str = Form("veo"),
    with_audio: bool = Form(False),
    user_id: str = Depends(verify_api_key)
):
    supabase = get_supabase()
    
    system_instruction = "Cinematic lighting, high resolution, 4k, natural movement, keep face consistent with reference."
    final_prompt = f"{system_instruction}. Action: {motion_prompt}"

    model_version=None

    if engine_choice == "kling":

        if with_audio:
            model_version = "kling-v2.6"
            logger.info(f"Audio requested. Switching Kling to model: {model_version}")
        
        else:
            model_version = "kling-v2.5-turbo-pro"

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
        
        # 4. Insert Job
        supabase.table("video_jobs").insert({
            "character_id": char_uuid,
            "operation_id": str(operation_id),
            "status": "processing",
            "engine": engine_choice,
            "source_url": image_url,
            "motion_prompt": f"[{engine_choice.upper()}] {motion_prompt}"
        }).execute()

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
            api_key = os.getenv("GEMINI_API_KEY")
            request_url = f"https://generativelanguage.googleapis.com/v1beta/{operation_id}?key={api_key}"
            
            while True:
                # 1. Direct REST call
                resp = requests.get(request_url)
                if resp.status_code != 200:
                    logger.error(f"Veo Polling Error {resp.status_code}: {resp.text}")
                    raise Exception(f"Polling failed: {resp.text}")
                    
                data = resp.json()
                
                # 2. Check if job is done
                if data.get("done"):
                    # 🔍 DEBUG: PRINT THE FULL JSON TO CONSOLE
                    logger.info(f"Veo Final Response: {data}") 
                    
                    # Check for explicit API errors
                    if "error" in data:
                        raise Exception(f"Veo API Error: {data['error']}")
                        
                    # 3. Extract Video URI
                    # We look in 'response' -> 'generatedVideos'
                    try:
                        # Safety checks for different possible structures
                        gen_response = response_dict.get("generateVideoResponse", {})
                        samples = gen_response.get("generatedSamples", [])
                        # Sometimes it returns result inside 'result' instead of 'response'
                        if not samples:
                            samples = response_dict.get("generatedVideos", [])

                        if not samples:
                            raise Exception("Response parsed, but no video samples found.")
                             
                        if not response_dict:
                            # If we have no response dict, maybe it was a safety block?
                            raise Exception(f"Job done but 'response' field missing. Full Data: {data}")

                        generated_videos = response_dict.get("generatedVideos", [])
                        if not generated_videos:
                            raise Exception("Response exists but 'generatedVideos' list is empty.")
                            
                        video_uri = generated_videos[0].get("video", {}).get("uri")
                        
                        if not video_uri:
                             raise Exception("No video URI found in video object")
                             
                        # 4. Download
                        logger.info(f"Downloading video from: {video_uri}")
                        video_resp = requests.get(video_uri)
                        video_bytes = video_resp.content
                        
                        # 5. Upload to Supabase
                        file_name = f"video_{int(time.time())}.mp4"
                        path = f"generated_videos/{char_uuid}/{file_name}"
                        supabase.storage.from_("avatars").upload(path, video_bytes, {"content-type": "video/mp4"})
                        final_video_url = supabase.storage.from_("avatars").get_public_url(path)
                        break
                        
                    except Exception as parse_err:
                        logger.error(f"Parsing Failed. Data structure was: {data}")
                        raise parse_err
                
                # Wait 10 seconds
                logger.info(f"Veo Job still running... (Operation: {operation_id})")
                await asyncio.sleep(10)

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
    supabase = get_supabase()
    
    # 1. Fetch the list (limit=1) without forcing .single()
    res = supabase.table("video_jobs").select("*").eq("operation_id", operation_id).limit(1).execute()
    
    # 2. Manually check if we got data
    if not res.data or len(res.data) == 0:
        raise HTTPException(status_code=404, detail="Job not found in database")

    # 3. Get the first item safely
    job_data = res.data[0]

    if job_data['status'] == "completed":
        return {"status": "completed", "video_url": job_data['video_url']}
    
    return {"status": job_data['status'], "message": "Processing..."}

@router.get("/video-history")
async def get_video_history(character_id: str):
    supabase = get_supabase()
    try:
        folder_path = f"generated_videos/{character_id}"
        
        files = supabase.storage.from_("avatars").list(folder_path, {
            "limit": 50, 
            "sortBy": {"column": "created_at", "order": "desc"}
        })
        
        if not files:
            return []

        video_items = []
        for f in files:
            if f['name'].startswith("."): continue # Skip system files

            full_path = f"{folder_path}/{f['name']}"
            public_url = supabase.storage.from_("avatars").get_public_url(full_path)
            
            video_items.append({
                "filename": f['name'],
                "url": public_url,
                "created_at": f.get('created_at')
            })
            
        return video_items

    except Exception as e:
        logger.error(f"Failed to fetch video history: {e}")
        return []