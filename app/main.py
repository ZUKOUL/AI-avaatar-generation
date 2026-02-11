import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from app.api.avatar import router as avatar_router
from app.api.video import router as video_router

# 1. Initialize FastAPI FIRST
app = FastAPI(
    title="AI Avatar Generator",
    description="An API to generate futuristic digital avatars using Gemini 2.5 Flash Image",
    version="1.0.0"
)

# 2. Include Routers AFTER app is defined
# Note: I moved the video router down here with the avatar router
app.include_router(avatar_router, prefix="/avatar", tags=["Avatar Generation"])
app.include_router(video_router, prefix="/video", tags=["Video Generation"])

# 3. Health Check / Root Endpoint
@app.get("/", tags=["System"])
async def root():
    return {
        "message": "AI Avatar API is Online",
        "status": "Ready",
        "model_engine": "Gemini 2.5 Flash Image"
    }