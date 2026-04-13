import os
import time
import uuid
import logging
import asyncio
import requests
import replicate
from typing import Annotated, Optional, List
from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException, BackgroundTasks
from google import genai
from google.genai import types
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.core.auth import get_current_user
from app.core.pricing import get_video_cost, get_credit_cost
from app.core.supabase import supabase
from app.models.user import User
from app.services.credit_service import deduct_credits, get_balance, is_admin
from app.services.video_engine import get_video_engine

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/animate")
async def animate(
    current_user: Annotated[User, Depends(get_current_user)],
    background_tasks: BackgroundTasks,
    motion_prompt: str = Form(..., description="Describe the motion/action for the video"),
    avatar_id: Optional[str] = Form(None, description="Use an avatar from your library"),
    image_id: Optional[str] = Form(None, description="Use a generated image by its ID"),
    start_image_url: Optional[str] = Form(None, description="Direct URL of a start image from gallery"),
    engine_choice: str = Form("veo", description="Video engine: 'veo' or 'kling'"),
    audio: bool = Form(False, description="Enable audio (Kling only)"),
    files: List[UploadFile] = File(default=[], description="Upload image files directly (first = start image)"),
):
    """
    Generate a video from an image source.
    Provide ONE of:
    - files → upload an image directly from your device
    - start_image_url → use a gallery image URL
    - avatar_id → uses the avatar's portrait from your library
    - image_id → uses a specific generated image
    """
    # Sanitize: Swagger may send placeholder text like "string"
    if avatar_id is not None and avatar_id.strip().lower() in ("string", "", "null", "none"):
        avatar_id = None
    if image_id is not None and image_id.strip().lower() in ("string", "", "null", "none"):
        image_id = None
    if start_image_url is not None and start_image_url.strip().lower() in ("string", "", "null", "none"):
        start_image_url = None

    # Filter out empty files (browsers may send empty file parts)
    real_files = [f for f in files if f.filename and f.size and f.size > 0]

    # Resolve the source image URL
    image_url = None
    source_label = ""

    # Priority: uploaded file > gallery URL > image_id > avatar_id
    if real_files:
        # Upload the first file to Supabase storage and get a public URL
        file = real_files[0]
        file_content = await file.read()
        if not file_content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        file_ext = (file.filename or "image.png").split(".")[-1] or "png"
        storage_path = f"video_sources/{current_user['id']}/{uuid.uuid4()}.{file_ext}"

        content_type = file.content_type or "image/png"
        supabase.storage.from_("avatars").upload(storage_path, file_content, {"content-type": content_type})
        image_url = supabase.storage.from_("avatars").get_public_url(storage_path)
        source_label = f"uploaded file ({file.filename})"

    elif start_image_url:
        # Direct URL from gallery (already a public URL)
        image_url = start_image_url
        source_label = "gallery image"

    elif image_id:
        # Get image from generated_images table
        img = (
            supabase.table("generated_images")
            .select("image_url, user_id")
            .eq("id", image_id)
            .single()
            .execute()
        )
        if not img.data:
            raise HTTPException(status_code=404, detail="Generated image not found.")
        if str(img.data.get("user_id")) != current_user["id"]:
            raise HTTPException(status_code=404, detail="Generated image not found.")
        image_url = img.data["image_url"]
        source_label = f"image {image_id}"

    elif avatar_id:
        # Get avatar from characters table
        ch = (
            supabase.table("characters")
            .select("id, image_paths, user_id")
            .eq("id", avatar_id)
            .eq("user_id", current_user["id"])
            .single()
            .execute()
        )
        if not ch.data:
            raise HTTPException(status_code=404, detail="Avatar not found.")
        if not ch.data.get("image_paths") or len(ch.data["image_paths"]) == 0:
            raise HTTPException(status_code=404, detail="Avatar has no image. Please regenerate it.")
        image_url = supabase.storage.from_("avatars").get_public_url(ch.data["image_paths"][0])
        source_label = f"avatar {avatar_id}"

    if not image_url:
        raise HTTPException(
            status_code=400,
            detail="Please provide a source image: upload a file, select from gallery, or choose an avatar.",
        )

    logger.info(f"Video generation from {source_label} by user {current_user['id']}")

    # Kling with audio uses v2.6
    engine_for_db = "kling_audio" if (engine_choice == "kling" and audio) else engine_choice

    # Credit check (skip for administrators)
    credit_cost = get_credit_cost(engine_for_db)
    if not is_admin(current_user):
        balance = get_balance(current_user["id"])
        if balance < credit_cost:
            raise HTTPException(
                status_code=402,
                detail={"error": "INSUFFICIENT_CREDITS", "message": f"You need {credit_cost} credit(s). Current balance: {balance}"},
            )
        deduct_credits(current_user["id"], credit_cost, "video_generation", f"{engine_for_db} video from {source_label}")

    engine = get_video_engine(engine_choice)
    try:
        operation_id = await engine.generate(image_url, motion_prompt, audio=audio)
        estimated_cost = get_video_cost(engine_for_db)

        # Store the job — character_id references avatar if used
        supabase.table("video_jobs").insert({
            "character_id": avatar_id,
            "user_id": current_user["id"],
            "operation_id": str(operation_id),
            "status": "processing",
            "engine": engine_for_db,
            "source_url": image_url,
            "motion_prompt": f"[{engine_choice.upper()}] {motion_prompt}",
        }).execute()

        # Use avatar_id, image_id, or user_id as folder name for storage
        folder_id = avatar_id or image_id or current_user["id"]
        background_tasks.add_task(process_video_task, operation_id, folder_id, engine_for_db)

        return {
            "status": "Job Started",
            "operation_id": operation_id,
            "avatar_id": avatar_id,
            "image_id": image_id,
            "engine": engine_for_db,
            "estimated_cost_usd": estimated_cost,
            "audio": audio,
        }
        
    except Exception as e:
        logger.error(f"Video Init Failed: {e}")
        err_msg = str(e)
        if "ReplicateError" in type(e).__name__ or "503" in err_msg or "Service Unavailable" in err_msg:
            raise HTTPException(
                status_code=503,
                detail="Video service (Kling) is temporarily unavailable. Try again later or use engine_choice=veo.",
            )
        raise HTTPException(status_code=500, detail=err_msg)


async def process_video_task(operation_id: str, folder_id: str, engine: str):
    
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
                        api_key = os.getenv("GEMINI_API_KEY")
                        headers = {"x-goog-api-key": api_key} if api_key else {}
                        
                        resp = requests.get(video_obj.uri, headers=headers)
                        resp.raise_for_status()
                        video_bytes = resp.content
                    elif hasattr(video_obj, 'video_bytes') and video_obj.video_bytes:
                         video_bytes = video_obj.video_bytes
                    else:
                         raise ValueError(f"No video content found in response. Available attributes: {dir(video_obj)}")
                    # Upload bytes to storage
                    file_name = f"video_{int(time.time())}.mp4"
                    path = f"generated_videos/{folder_id}/{file_name}"
                    supabase.storage.from_("avatars").upload(path, video_bytes, {"content-type": "video/mp4"})
                    final_video_url = supabase.storage.from_("avatars").get_public_url(path)
                    break
                await asyncio.sleep(20)

        elif engine in ("kling", "kling_audio"):
            # 1. Wait for success
            prediction = replicate.predictions.get(operation_id)
            while prediction.status not in ["succeeded", "failed", "canceled"]:
                await asyncio.sleep(5)
                prediction.reload()
            
            if prediction.status == "succeeded":
                # Get the temporary URL
                temp_url = prediction.output[0] if isinstance(prediction.output, list) else prediction.output
                
                # Robust downloader with retry logic
                session = requests.Session()
                retry_strategy = Retry(
                    total=3,
                    backoff_factor=1,
                    status_forcelist=[429, 500, 502, 503, 504]
                )
                session.mount("https://", HTTPAdapter(max_retries=retry_strategy))
                
                try:
                    response = session.get(temp_url, timeout=(30, 300), stream=True) 
                    response.raise_for_status()
                    video_bytes = response.content
                except requests.exceptions.RequestException as e:
                    raise Exception(f"Failed to download video from Replicate after retries: {e}")

                # 2. Upload to Supabase
                file_name = f"video_{int(time.time())}.mp4"
                path = f"generated_videos/{folder_id}/{file_name}"
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
        supabase.table("video_jobs").update({"status": "failed"}).eq("operation_id", operation_id).execute()


@router.get("/video-status/{operation_id:path}")
async def get_video_status(
    current_user: Annotated[User, Depends(get_current_user)],
    operation_id: str,
):
    job = (
        supabase.table("video_jobs")
        .select("*")
        .eq("operation_id", operation_id)
        .eq("user_id", current_user["id"])
        .single()
        .execute()
    )
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
async def get_video_history(
    current_user: Annotated[User, Depends(get_current_user)],
    avatar_id: Optional[str] = None,
    limit: int = 50,
):
    """
    Get video generation history from the database.
    - avatar_id (optional): Filter by avatar
    - limit: Max results (default 50)
    """
    try:
        limit = min(limit, 100)
        
        query = (
            supabase.table("video_jobs")
            .select("id, character_id, operation_id, status, video_url, motion_prompt, engine, source_url, created_at")
            .eq("user_id", current_user["id"])
            .order("created_at", desc=True)
            .limit(limit)
        )

        if avatar_id:
            query = query.eq("character_id", avatar_id)

        res = query.execute()

        return {
            "videos": [
                {
                    "job_id": v["id"],
                    "avatar_id": v.get("character_id"),
                    "operation_id": v["operation_id"],
                    "status": v["status"],
                    "video_url": v.get("video_url"),
                    "motion_prompt": v.get("motion_prompt"),
                    "engine": v.get("engine"),
                    "source_url": v.get("source_url"),
                    "created_at": v.get("created_at"),
                }
                for v in (res.data or [])
            ]
        }

    except Exception as e:
        logger.error(f"Failed to fetch video history: {e}")
        raise HTTPException(status_code=500, detail=str(e))