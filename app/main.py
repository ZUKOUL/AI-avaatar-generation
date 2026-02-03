import os
from dotenv import load_dotenv

# 1. Load Environment Variables IMMEDIATELY
# This ensures GEMINI_API_KEY is available before any other modules try to use it.
load_dotenv()

from fastapi import FastAPI
from app.api.avatar import router as avatar_router

# 2. Initialize FastAPI
app = FastAPI(
    title="AI Avatar Generator",
    description="An API to generate futuristic digital avatars using Gemini 2.5 Flash Image",
    version="1.0.0"
)

# 3. Include Routers
# The prefix "/avatar" means your endpoint will be at http://127.0.0.1:8000/avatar/generate
app.include_router(avatar_router, prefix="/avatar", tags=["Avatar Generation"])

# 4. Health Check / Root Endpoint
@app.get("/", tags=["System"])
async def root():
    return {
        "message": "AI Avatar API is Online",
        "status": "Ready",
        "model_engine": "Gemini 2.5 Flash Image"
    }