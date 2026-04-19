from dotenv import load_dotenv
import os

load_dotenv()

class Settings:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_KEY")
    # Direct Postgres connection string used by the auto-migration runner
    # on startup. Grab it from Supabase Dashboard → Settings → Database →
    # Connection String → "URI" (use the Session pooler URL for long-lived
    # app connections). Optional: if unset, auto-migrations are skipped
    # and the app boots normally — migrations can still be run manually
    # via the SQL Editor.
    SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")
    JWT_SECRET = os.getenv("JWT_SECRET", "")
    JWT_EXPIRE_SECONDS = int(os.getenv("JWT_EXPIRE_SECONDS", "604800"))  # 7 days
    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRETE_KEY", "")
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_PRICE_ID_CREATOR  = os.getenv("STRIPE_PRICE_ID_CREATOR", "price_1T6Pd6BnAnTuqTl3BBYJxdJ8")
    STRIPE_PRICE_ID_STUDIO   = os.getenv("STRIPE_PRICE_ID_STUDIO", "price_1TLuKfBnAnTuqTl3IEwp4EBF")
    RESEND_API_KEY           = os.getenv("RESEND_API_KEY", "")
    FRONTEND_URL             = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # ─── Auto-Clip (Phase 1 video feature) ──────────────────────────────────
    # Replicate powers Whisper transcription (and later Kling motion). The
    # key may already be set because the avatar→video pipeline uses it;
    # we just read it explicitly here so the clip service can fall back
    # gracefully when it's missing.
    REPLICATE_API_TOKEN      = os.getenv("REPLICATE_API_TOKEN", "")

    # Sieve's `face-aware-reframe` (or equivalent) turns a 16:9 clip into a
    # subject-tracked 9:16 short. Optional — if absent we fall back to a
    # dumb centre-crop so the pipeline still works.
    SIEVE_API_KEY            = os.getenv("SIEVE_API_KEY", "")

    # Grok (xAI) image→video provider — 4th motion option. The user named
    # the env var `REPLICATE_API_TOKEN_GROK` for naming consistency even
    # though Grok is actually xAI's proprietary API, not Replicate.
    # We read both names so whichever one is set works.
    XAI_GROK_API_KEY         = (
        os.getenv("REPLICATE_API_TOKEN_GROK")
        or os.getenv("XAI_API_KEY")
        or os.getenv("GROK_API_KEY")
        or ""
    )

    # ─── AI Video Generator (Phase 2) ───────────────────────────────────────
    # ElevenLabs powers the voice-over step. Optional — when the key is
    # absent the pipeline simply produces a silent video (user can still
    # disable voice manually too via the form).
    ELEVENLABS_API_KEY       = os.getenv("ELEVENLABS_API_KEY", "")
    # Default multilingual voice id used when the user doesn't pick one.
    # "Rachel" is the ElevenLabs stock voice that handles en/fr/es/de well.
    ELEVENLABS_DEFAULT_VOICE = os.getenv("ELEVENLABS_DEFAULT_VOICE", "21m00Tcm4TlvDq8ikWAM")

settings = Settings()
