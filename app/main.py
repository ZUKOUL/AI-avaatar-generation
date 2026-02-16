import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.api.avatar import router as avatar_router
from app.api.video import router as video_router
from app.core.security import verify_api_key

# 1. Initialize FastAPI FIRST
app = FastAPI(
    title="AI Avatar Generator",
    description="An API to generate futuristic digital avatars using Gemini 2.5 Flash Image",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,

)

# 1.5 CORS — allow frontend to make requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "https://saa-s-frontend-six.vercel.app/","https://saa-s-frontend-six.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    
)

# 2. Include Routers AFTER app is defined
# Note: I moved the video router down here with the avatar router
app.include_router(
    avatar_router, 
    prefix="/avatar", 
    tags=["Avatar Generation"],
    dependencies=[Depends(verify_api_key)]
)
app.include_router(
    video_router, 
    prefix="/video", 
    tags=["Video Generation"],
    dependencies=[Depends(verify_api_key)]
)

# 3. Health Check / Root Endpoint
@app.get("/", tags=["System"])
async def root():
    return {
        "message": "AI Avatar API is Online",
        "status": "Ready",
        "model_engine": "Gemini 2.5 Flash Image"
    }