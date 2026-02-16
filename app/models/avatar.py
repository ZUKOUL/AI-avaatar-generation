# app/models/avatar.py
from pydantic import BaseModel
from typing import Optional

class AvatarRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "1:1"