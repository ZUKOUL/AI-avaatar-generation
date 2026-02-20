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

# ─── Video Generation: Kling v2.5 Turbo Pro (via Replicate, no audio) ───
COST_KLING_PER_SECOND = 0.07    # USD per second of video
KLING_DURATION_SECONDS = 5      # configured duration in video_engine.py
COST_KLING_VIDEO = round(COST_KLING_PER_SECOND * KLING_DURATION_SECONDS, 3)  # $0.35

# ─── Video Generation: Kling v2.6 (via Replicate, with audio) ───
COST_KLING_V26_PER_SECOND = 0.14   # USD per second of video (with audio)
COST_KLING_V26_VIDEO = round(COST_KLING_V26_PER_SECOND * KLING_DURATION_SECONDS, 3)  # $0.70


def get_video_cost(engine: str) -> float:
    """Return the estimated cost for a video generation. Use engine 'kling_audio' when Kling is used with audio (v2.6)."""
    if engine == "kling_audio":
        return COST_KLING_V26_VIDEO
    if engine in ("kling", "replicate_kling"):
        return COST_KLING_VIDEO
    return COST_VEO_VIDEO


# ─── Credit costs per generation type ───
CREDIT_COST_IMAGE = 1        # credits per image generation
CREDIT_COST_VEO_VIDEO = 2    # credits per Veo video
CREDIT_COST_KLING_VIDEO = 1  # credits per Kling video (no audio)
CREDIT_COST_KLING_AUDIO = 2  # credits per Kling video (with audio)

# Default credits per purchase (tied to PRODUCT_PRICE_ID)
CREDITS_PER_PURCHASE = 10


def get_credit_cost(generation_type: str) -> int:
    """Return the credit cost for a generation type."""
    costs = {
        "image": CREDIT_COST_IMAGE,
        "veo": CREDIT_COST_VEO_VIDEO,
        "kling": CREDIT_COST_KLING_VIDEO,
        "kling_audio": CREDIT_COST_KLING_AUDIO,
    }
    return costs.get(generation_type, 1)

