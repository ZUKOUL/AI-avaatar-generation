from pydantic import BaseModel
from typing import Optional

class VideoMetadata(BaseModel):
    video_id: str
    character_id: str
    source_image_url: str
    motion_prompt: str
    video_url: Optional[str] = None
    status: str  # "pending", "completed", "failed"