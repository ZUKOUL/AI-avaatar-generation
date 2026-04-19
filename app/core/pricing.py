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

# ─── AI Video Generator: phrase → fully-rendered short ────────────────────
# Two output modes with very different cost profiles — user picks in UI.
#
# SLIDESHOW MODE (Ken Burns pan/zoom — no image-to-video call)
#   6 × Gemini 3 Pro Image    ≈ $0.80
#   1 × ElevenLabs TTS 30s    ≈ $0.10
#   1 × Gemini 2.5 Pro script ≈ $0.01
#   ffmpeg compute            ≈ $0.00
#   → ~$0.95 per 30s video. Price aggressively — slideshow is the
#     accessible tier.
#
# MOTION MODE (Kling 2.1 image→video per scene)
#   6 × Kling 2.1 @5s = $0.70 = $4.20
#   + everything above        ≈ $0.95
#   → ~$5.15 per 30s video.
#   60s version doubles the image-to-video cost → ~$10.
COST_AI_VIDEO_SLIDESHOW_30S = 1.00   # USD worst-case
COST_AI_VIDEO_MOTION_30S    = 5.50   # USD worst-case
COST_AI_VIDEO_MOTION_60S    = 10.50  # USD worst-case (2× animations)

# Credits (1 credit ≈ $0.10 list price on Creator tier).
CREDIT_COST_AI_VIDEO_SLIDESHOW_30S = 20   # ~$2 user price, 2× margin
CREDIT_COST_AI_VIDEO_SLIDESHOW_60S = 30   # ~$3 user price
CREDIT_COST_AI_VIDEO_MOTION_30S    = 40   # ~$4 user price, ~72% margin
CREDIT_COST_AI_VIDEO_MOTION_60S    = 75   # ~$7.50 user price


# ─── Motion-mode per-provider multipliers ──────────────────────────────────
# Each motion provider has a different per-second cost on its backend.
# We keep the Kling-default pricing (CREDIT_COST_AI_VIDEO_MOTION_*) as
# the baseline and multiply it by the per-provider factor below. That way
# adding a new motion model is just one dict entry — the scaling stays
# centralised.
#
# Factors are derived from observed Replicate / Google-GenAI prices
# compared against Kling Turbo ($0.07/s baseline):
#   kling     ×1.0  ($0.07/s  — baseline)
#   veo_fast  ×1.3  ($0.10/s  — Google GenAI)
#   hailuo    ×0.55 ($0.045/s — cheapest)
#
# Missing entries default to 1.0 so a newly-added provider without an
# explicit factor is priced at baseline.
_MOTION_MODEL_MULTIPLIERS: dict[str, float] = {
    "kling":    1.0,
    "veo_fast": 1.3,
    "hailuo":   0.55,
    # Grok pricing is an estimate until xAI publishes official rates —
    # set slightly above Veo as a safe margin. Adjust once the real
    # per-second cost is known from invoices.
    "grok":     1.1,
}


def get_ai_video_credit_cost(
    mode: str,
    duration_seconds: int,
    motion_model: str | None = None,
) -> int:
    """Credit price for an AI-video generation job.

    Pricing inputs:
      - mode: 'slideshow' | 'motion'
      - duration: tier boundary at 30s (≤30s = short, >30s = long)
      - motion_model (motion mode only): scales against the Kling baseline

    Slideshow mode ignores `motion_model` — it never runs image-to-video.
    """
    long_form = duration_seconds > 30
    if mode == "motion":
        base = CREDIT_COST_AI_VIDEO_MOTION_60S if long_form else CREDIT_COST_AI_VIDEO_MOTION_30S
        factor = _MOTION_MODEL_MULTIPLIERS.get((motion_model or "kling").lower(), 1.0)
        # Round UP to ensure margin holds on every job (user's quote
        # shown in the UI matches what we actually charge).
        return max(1, int(round(base * factor + 0.499)))
    # default: slideshow
    return CREDIT_COST_AI_VIDEO_SLIDESHOW_60S if long_form else CREDIT_COST_AI_VIDEO_SLIDESHOW_30S


def get_ai_video_cost_usd(
    mode: str,
    duration_seconds: int,
    motion_model: str | None = None,
) -> float:
    """Worst-case API spend for an AI-video generation job. Used in logs
    + displayed to the user as 'estimated_cost_usd' for transparency."""
    long_form = duration_seconds > 30
    if mode == "motion":
        base = COST_AI_VIDEO_MOTION_60S if long_form else COST_AI_VIDEO_MOTION_30S
        factor = _MOTION_MODEL_MULTIPLIERS.get((motion_model or "kling").lower(), 1.0)
        return round(base * factor, 2)
    return COST_AI_VIDEO_SLIDESHOW_30S if not long_form else round(COST_AI_VIDEO_SLIDESHOW_30S * 1.8, 2)

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
    """Return the credit cost for a generation type.

    AI-video credit cost depends on both mode + duration so callers should
    prefer `get_ai_video_credit_cost(mode, duration_seconds)` — the
    "ai_video_slideshow" / "ai_video_motion" entries below are only used
    for simple lookups where the duration isn't known (logging, admin
    reports, etc.) and assume the cheaper ≤30s tier.
    """
    costs = {
        "image": CREDIT_COST_IMAGE,
        "veo": CREDIT_COST_VEO_VIDEO,
        "kling": CREDIT_COST_KLING_VIDEO,
        "kling_audio": CREDIT_COST_KLING_AUDIO,
        "autoclip": CREDIT_COST_AUTOCLIP,
        "ai_video_slideshow": CREDIT_COST_AI_VIDEO_SLIDESHOW_30S,
        "ai_video_motion": CREDIT_COST_AI_VIDEO_MOTION_30S,
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
