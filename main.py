import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.api.avatar import router as avatar_router
from app.api.video import router as video_router
from app.api.auth import router as auth_router
from app.core.auth import get_current_user

app = FastAPI(
    title="AI Avatar Generator",
    description="An API to generate futuristic digital avatars using Gemini 2.5 Flash Image",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "https://saa-s-frontend-six.vercel.app/", "https://saa-s-frontend-six.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Generation-Cost", "X-Generation-Engine", "X-Generation-Type"],
)

# Auth: signup/login (no JWT required)
app.include_router(auth_router, prefix="/auth", tags=["Auth"])

# Avatar and video: require JWT
app.include_router(
    avatar_router,
    prefix="/avatar",
    tags=["Avatar Generation"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    video_router,
    prefix="/video",
    tags=["Video Generation"],
    dependencies=[Depends(get_current_user)],
)

# 3. Health Check / Root Endpoint
@app.get("/", tags=["System"])
async def root():
    return {
        "message": "AI Avatar API is Online",
        "status": "Ready",
        "model_engine": "Gemini 2.5 Flash Image"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)