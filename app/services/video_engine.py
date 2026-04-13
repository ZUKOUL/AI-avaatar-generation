import os
import replicate
import requests
from google import genai
from google.genai import types
from app.core.config import settings


class VideoProvider:
    async def generate(self, image_url_or_bytes, prompt: str, *, audio: bool = False):
        raise NotImplementedError

class VeoProvider(VideoProvider):
    async def generate(self, image_url: str, prompt: str, *, audio: bool = False):
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        # Build config — reference image is optional
        config_kwargs = {"duration_seconds": 8}

        if image_url:
            # Download the image from the URL
            response = requests.get(image_url)
            if response.status_code != 200:
                raise Exception(f"Failed to fetch image from URL: {image_url}")
            img_bytes = response.content

            reference_image = types.VideoGenerationReferenceImage(
                image=types.Image(image_bytes=img_bytes, mime_type="image/png")
            )
            config_kwargs["reference_images"] = [reference_image]

        operation = client.models.generate_videos(
            model="veo-3.1-fast-generate-preview",
            prompt=prompt,
            config=types.GenerateVideosConfig(**config_kwargs)
        )

        return operation.name

class ReplicateKlingProvider(VideoProvider):
    async def generate(self, image_url: str, prompt: str, *, audio: bool = False) -> str:
        input_data = {
            "prompt": prompt,
            "duration": 5,
        }
        # Reference image is optional
        if image_url:
            input_data["start_image"] = image_url

        if audio:
            input_data["audio"] = True
            prediction = replicate.predictions.create(
                model="kwaivgi/kling-v2.6",
                input=input_data,
            )
        else:
            prediction = replicate.predictions.create(
                model="kwaivgi/kling-v2.5-turbo-pro",
                input=input_data,
            )
        return prediction.id
    
def get_video_engine(engine_type: str = None):

    if not engine_type:
        engine_type = os.getenv("VIDEO_ENGINE", "veo").lower()
    
    if engine_type == "replicate_kling" or engine_type == "kling":
        return ReplicateKlingProvider()
    return VeoProvider()