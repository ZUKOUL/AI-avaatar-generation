import os
import replicate
import requests
from google import genai
from google.genai import types
from app.core.config import settings


class VideoProvider:
    async def generate(self, image_url_or_bytes, prompt: str):
        raise NotImplementedError

class VeoProvider(VideoProvider):
    async def generate(self, image_url: str, prompt: str):
        # 1. Download the image from the Supabase URL
        response = requests.get(image_url)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch image from URL: {image_url}")
            
        img_bytes = response.content # This is the raw binary data Google needs

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        
        # 2. Construct the reference image using the binary bytes
        reference_image = types.VideoGenerationReferenceImage(
            image=types.Image(image_bytes=img_bytes, mime_type="image/png")
        )

        # 3. Start the generation
        operation = client.models.generate_videos(
            model="veo-3.1-fast-generate-preview", 
            prompt=prompt,
            config=types.GenerateVideosConfig(
                reference_images=[reference_image],
                duration_seconds=8
            )
        )

        # Return the operation name string
        return operation.name

class ReplicateKlingProvider(VideoProvider):
    async def generate(self, image_url: str, prompt: str) -> str:
        # We use .create() so we get the ID immediately
        prediction = replicate.predictions.create(
            model="kwaivgi/kling-v2.5-turbo-pro",
            input={
                "start_image": image_url,
                "prompt": prompt,
                "duration": 5
            }
        )
        
        return prediction.id
    
def get_video_engine(engine_type: str = None):

    if not engine_type:
        engine_type = os.getenv("VIDEO_ENGINE", "veo").lower()
    
    if engine_type == "replicate_kling" or engine_type == "kling":
        return ReplicateKlingProvider()
    return VeoProvider()