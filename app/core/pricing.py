"""
SaaS Pricing Configuration
All costs are in USD, based on current API pricing (Feb 2026).
Update these values if your API plan or provider pricing changes.
"""

# ─── Image Generation (Gemini 2.5 Flash Image / Nano Banana) ───
# ~1,290 output tokens per 1024x1024 image × $30.00 / 1M tokens
COST_GEMINI_FLASH_IMAGE = 0.039  # USD per generated image

# ─── Video Generation: Veo 3.1 Fast (no audio) ───
COST_VEO_PER_SECOND = 0.10       # USD per second of video
VEO_DURATION_SECONDS = 8         # configured duration in video_engine.py
COST_VEO_VIDEO = round(COST_VEO_PER_SECOND * VEO_DURATION_SECONDS, 3)  # $0.80

# ─── Video Generation: Kling v2.5 Turbo Pro (via Replicate) ───
COST_KLING_PER_SECOND = 0.07    # USD per second of video
KLING_DURATION_SECONDS = 5      # configured duration in video_engine.py
COST_KLING_VIDEO = round(COST_KLING_PER_SECOND * KLING_DURATION_SECONDS, 3)  # $0.35


def get_video_cost(engine: str) -> float:
    """Return the estimated cost for a video generation based on engine choice."""
    if engine in ("kling", "replicate_kling"):
        return COST_KLING_VIDEO
    return COST_VEO_VIDEO
