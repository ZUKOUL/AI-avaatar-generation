"""
SaaS Pricing Configuration
All costs are in USD, based on current API pricing (Feb 2026).
Update these values if your API plan or provider pricing changes.
"""

# ─── Image Generation (Gemini 2.5 Flash Image / Nano Banana) ───
# ~1,290 output tokens per 1024x1024 image × $30.00 / 1M tokens
COST_GEMINI_FLASH_IMAGE = 0.134  # USD per generated image

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


# ─── Auto-Clip: long-form URL → N vertical shorts ──────────────────────────
# Underlying API costs per 10-minute source video (typical):
#   Whisper large-v3 on Replicate    ≈ $0.04
#   Gemini 2.5 Pro moment detection  ≈ $0.01
#   Sieve face-aware reframe         ≈ $0.05 per output minute
# → Per output clip of 30-60s: ~$0.10-$0.15 in API cost.
# We bill by clip (not by source minute) because that's what the user sees.
COST_AUTOCLIP_PER_CLIP = 0.15   # USD, rounded up for safety
CREDIT_COST_AUTOCLIP = 8        # credits per output clip (~80% margin on Creator tier)

# ─── Credit costs per generation type (optimised for margin) ───
CREDIT_COST_IMAGE = 5         # credits per image generation       (~87 % margin on Creator)
CREDIT_COST_VEO_VIDEO = 20    # credits per Veo video              (~80 % margin on Creator)
CREDIT_COST_KLING_VIDEO = 10  # credits per Kling video (no audio) (~83 % margin on Creator)
CREDIT_COST_KLING_AUDIO = 15  # credits per Kling video (w/ audio) (~77 % margin on Creator)


# ─── Multi-tier pricing plans (~75 % target margin) ───
PRICING_TIERS = {
    "creator": {
        "credits": 200,
        "price_usd": 35.00,
        "stripe_env_key": "STRIPE_PRICE_ID_CREATOR",
    },
    "studio": {
        "credits": 450,
        "price_usd": 85.00,
        "stripe_env_key": "STRIPE_PRICE_ID_STUDIO",
    },
}
DEFAULT_TIER = "creator"


def get_credit_cost(generation_type: str) -> int:
    """Return the credit cost for a generation type."""
    costs = {
        "image": CREDIT_COST_IMAGE,
        "veo": CREDIT_COST_VEO_VIDEO,
        "kling": CREDIT_COST_KLING_VIDEO,
        "kling_audio": CREDIT_COST_KLING_AUDIO,
        "autoclip": CREDIT_COST_AUTOCLIP,
    }
    return costs.get(generation_type, 1)


def get_tier(tier_slug: str) -> dict:
    """Return tier info dict or raise ValueError for unknown tiers."""
    tier = PRICING_TIERS.get(tier_slug)
    if not tier:
        valid = ", ".join(PRICING_TIERS.keys())
        raise ValueError(f"Unknown tier '{tier_slug}'. Valid tiers: {valid}")
    return tier


def get_available_tiers() -> list[dict]:
    """Return list of tiers for the frontend pricing page."""
    return [
        {"slug": slug, "credits": t["credits"], "price_usd": t["price_usd"]}
        for slug, t in PRICING_TIERS.items()
    ]
