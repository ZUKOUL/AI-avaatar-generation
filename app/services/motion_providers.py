"""
Motion-provider registry for the AI Video Generator.

A "motion provider" is anything that can turn (keyframe, motion prompt,
duration) into an animated video clip on disk. Different providers trade
off quality, price, clip length, and subject fit:

  kling       — Kling 2.5 Turbo Pro via Replicate. Fast, affordable,
                excellent on stylised characters (claymation, anime,
                cartoons). Default.
  veo_fast    — Veo 3.1 Fast via Google GenAI. Slightly pricier per
                second but natively 8 s per clip (vs 5 s for Kling),
                so fewer total calls for long videos. Best for photo-
                real scenes + physical / fluid motion.
  hailuo      — Minimax Hailuo 02 via Replicate. Cheapest option. Good
                for simple scenes; can drift on complex character work.

Adding a new provider is a matter of:
  1. Writing an async `animate(keyframe_path, motion_prompt, duration,
     out_path) -> str` function that writes an MP4 to `out_path` and
     returns the path.
  2. Registering it below with `_register(MotionProvider(...))`.
  3. Wiring a pricing entry in `app/core/pricing.py`.
The dispatcher in `ai_video_pipeline.animate_scene_motion` reads the
registry at runtime, so new models show up in the API + frontend list
without further changes.

Design choices:
  - Each provider implements ONE async function. No abstract base
    class needed; the registry just carries the callable.
  - All providers share the "upload keyframe to Supabase to get a
    public URL, hand that URL to the provider" preamble so we don't
    re-invent it per model.
  - Every provider is expected to honour the outer wall-time cap
    (360 s) enforced by the orchestrator; inner poll limits are the
    provider's business.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────
# Public types
# ──────────────────────────────────────────────────────────────────────────

AnimateFn = Callable[[str, str, float, str], Awaitable[str]]


@dataclass
class MotionProvider:
    """Everything the API + frontend + pipeline need to know about one
    image-to-video model. No provider-internal state lives here — the
    `animate` callable carries the implementation."""

    slug: str                     # URL-safe id, used in form fields + DB
    name: str                     # human-readable label for the UI card
    description: str              # 1-sentence pitch for the UI
    tagline: str                  # super-short tag ("Cheapest", "Premium", etc.)

    # Runtime characteristics
    native_clip_seconds: int      # how long each native clip runs
    estimated_usd_per_60s: float  # worst-case API spend for a 60 s output
    requires_replicate: bool      # needs REPLICATE_API_TOKEN configured
    requires_gemini: bool         # needs GEMINI_API_KEY configured

    # The actual image-to-video implementation. Takes (keyframe_path,
    # motion_prompt, duration_seconds, out_path); returns out_path.
    animate: AnimateFn

    def serialize(self) -> dict:
        """Shape exposed to the frontend via GET /motion-providers. The
        `animate` callable is intentionally dropped — it's implementation
        detail that the client never needs."""
        return {
            "slug": self.slug,
            "name": self.name,
            "description": self.description,
            "tagline": self.tagline,
            "native_clip_seconds": self.native_clip_seconds,
            "estimated_usd_per_60s": self.estimated_usd_per_60s,
            "configured": self.is_configured(),
        }

    def is_configured(self) -> bool:
        """Does the runtime have the API keys this provider needs?
        Feeds into the UI — unconfigured models are shown greyed out
        with a tooltip so the user knows why they can't pick one yet."""
        if self.requires_replicate and not settings.REPLICATE_API_TOKEN:
            return False
        if self.requires_gemini and not os.getenv("GEMINI_API_KEY"):
            return False
        return True


# ──────────────────────────────────────────────────────────────────────────
# Shared helpers
# ──────────────────────────────────────────────────────────────────────────


async def _upload_keyframe_for_remote_provider(keyframe_path: str) -> str:
    """Replicate + some Veo flows need a public URL to fetch the start
    image. Dump the local keyframe to Supabase Storage and return the
    public URL."""
    from app.services.video_pipeline import upload_to_storage

    remote_path = f"ai_video_sources/{uuid.uuid4().hex}.png"
    return await asyncio.to_thread(
        upload_to_storage, keyframe_path, remote_path, "image/png"
    )


async def _poll_replicate(prediction, provider_name: str, max_attempts: int = 36):
    """Shared polling loop for Replicate-based providers. Returns the
    final status string or raises on timeout."""
    final_status: Optional[str] = None
    last_status: Optional[str] = None
    for attempt in range(max_attempts):
        status = getattr(prediction, "status", None)
        if status != last_status:
            logger.info(
                f"{provider_name} prediction {getattr(prediction, 'id', '?')}: "
                f"status={status} (attempt {attempt + 1}/{max_attempts})"
            )
            last_status = status
        if status in ("succeeded", "failed", "canceled"):
            final_status = status
            break
        await asyncio.sleep(5)
        try:
            await asyncio.to_thread(prediction.reload)
        except Exception as e:
            logger.warning(f"{provider_name} poll reload failed (continuing): {e}")
            continue

    if final_status is None:
        # Best-effort cancel so Replicate releases the compute slot.
        try:
            await asyncio.to_thread(prediction.cancel)
        except Exception:
            pass
        raise RuntimeError(
            f"{provider_name} prediction timed out after {max_attempts * 5}s "
            f"(prediction id: {getattr(prediction, 'id', '?')})"
        )
    if final_status != "succeeded":
        err = getattr(prediction, "error", None)
        raise RuntimeError(f"{provider_name} prediction {final_status}: {err}")
    return final_status


async def _download_clip(video_url: str, out_path: str) -> None:
    """Shared download step — every provider returns an MP4 URL we need
    to fetch and write to disk."""
    import httpx

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(120.0, connect=10.0)
    ) as client:
        r = await client.get(video_url)
        r.raise_for_status()
        with open(out_path, "wb") as fh:
            fh.write(r.content)


async def _fit_clip_duration(
    clip_path: str, target_seconds: float, native_seconds: int
) -> None:
    """Trim or setpts-slow the provider's native clip to match the
    scene's aligned duration. In-place edit of `clip_path`.

    Motion providers output clips of fixed length (Kling 5s, Veo 8s,
    Hailuo 6s). Our scenes are timed to voice windows which are
    rarely an exact native multiple, so we reshape after download."""
    from app.services.video_pipeline import _run_ffmpeg

    if abs(target_seconds - native_seconds) < 0.15:
        # Close enough — skip the re-encode
        return

    # Trim case: target shorter than native output
    if target_seconds < native_seconds - 0.1:
        trimmed = clip_path + ".trim.mp4"
        cmd = [
            "ffmpeg", "-y",
            "-i", clip_path,
            "-t", f"{target_seconds:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-c:a", "copy",
            "-movflags", "+faststart",
            trimmed,
        ]
        _run_ffmpeg(cmd, "fit_clip_trim")
        os.replace(trimmed, clip_path)
        return

    # Slow case: target longer than native output — stretch with setpts
    slowed = clip_path + ".slow.mp4"
    factor = target_seconds / max(0.1, float(native_seconds))
    cmd = [
        "ffmpeg", "-y",
        "-i", clip_path,
        "-filter_complex", f"[0:v]setpts={factor}*PTS[v]",
        "-map", "[v]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-movflags", "+faststart",
        slowed,
    ]
    _run_ffmpeg(cmd, "fit_clip_slow")
    os.replace(slowed, clip_path)


# ──────────────────────────────────────────────────────────────────────────
# Provider: Kling 2.5 Turbo Pro (via Replicate)
# ──────────────────────────────────────────────────────────────────────────
# Previously the only motion option — now one of several. Native 5 s
# clips at ~$0.07/s. Stylised-character champ (claymation, anime, etc.).


async def _animate_kling(
    keyframe_path: str,
    motion_prompt: str,
    duration_seconds: float,
    out_path: str,
) -> str:
    if not settings.REPLICATE_API_TOKEN:
        raise RuntimeError("REPLICATE_API_TOKEN missing — Kling unavailable.")

    import replicate

    image_url = await _upload_keyframe_for_remote_provider(keyframe_path)

    def _create():
        return replicate.predictions.create(
            model="kwaivgi/kling-v2.5-turbo-pro",
            input={
                "prompt": motion_prompt,
                "start_image": image_url,
                "duration": 5,
            },
        )

    try:
        prediction = await asyncio.to_thread(_create)
    except Exception as e:
        raise RuntimeError(f"Kling prediction create failed: {e}") from e

    await _poll_replicate(prediction, "Kling")

    video_url = (
        prediction.output[0]
        if isinstance(prediction.output, list)
        else str(prediction.output)
    )
    await _download_clip(video_url, out_path)
    await _fit_clip_duration(out_path, duration_seconds, native_seconds=5)
    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Provider: Veo 3.1 Fast (via Google GenAI directly)
# ──────────────────────────────────────────────────────────────────────────
# Uses the Gemini-side video API rather than Replicate. Native 8 s
# clips so fewer scenes are needed for the same output duration. Strong
# on photorealism + physical motion; OK on stylised.


async def _animate_veo_fast(
    keyframe_path: str,
    motion_prompt: str,
    duration_seconds: float,
    out_path: str,
) -> str:
    if not os.getenv("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY missing — Veo unavailable.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    # Veo accepts the raw image bytes — no need to publish to a URL.
    with open(keyframe_path, "rb") as fh:
        img_bytes = fh.read()

    # Clamp to Veo's supported duration window (4-8s). Scenes outside
    # that range get ffmpeg-trimmed / slowed after download.
    veo_seconds = max(4, min(8, int(round(duration_seconds))))

    config = types.GenerateVideosConfig(
        duration_seconds=veo_seconds,
        reference_images=[
            types.VideoGenerationReferenceImage(
                image=types.Image(image_bytes=img_bytes, mime_type="image/png"),
            )
        ],
    )

    def _kickoff():
        return client.models.generate_videos(
            model="veo-3.1-fast-generate-preview",
            prompt=motion_prompt,
            config=config,
        )

    try:
        operation = await asyncio.to_thread(_kickoff)
    except Exception as e:
        raise RuntimeError(f"Veo generate_videos call failed: {e}") from e

    # Veo is async — poll the operation until done. 3-min cap mirrors
    # the Kling budget so both providers degrade the same way on hangs.
    POLL_INTERVAL_S = 20
    MAX_POLL_SECONDS = 180
    deadline = time.monotonic() + MAX_POLL_SECONDS
    while True:
        await asyncio.sleep(POLL_INTERVAL_S)
        try:
            op = await asyncio.to_thread(
                client.operations.get,
                types.GenerateVideosOperation(name=operation.name),
            )
        except Exception as e:
            logger.warning(f"Veo poll failed (continuing): {e}")
            continue
        if getattr(op, "done", False):
            if getattr(op, "error", None):
                raise RuntimeError(f"Veo generation failed: {op.error}")
            if not op.response or not op.response.generated_videos:
                raise RuntimeError("Veo returned no videos.")
            video_obj = op.response.generated_videos[0].video
            # Veo hands us either a URI (download with API key header) or
            # raw bytes. Handle both.
            if getattr(video_obj, "uri", None):
                import httpx
                headers = {"x-goog-api-key": os.getenv("GEMINI_API_KEY") or ""}
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(120.0, connect=10.0)
                ) as hclient:
                    r = await hclient.get(video_obj.uri, headers=headers)
                    r.raise_for_status()
                    video_bytes = r.content
            elif getattr(video_obj, "video_bytes", None):
                video_bytes = video_obj.video_bytes
            else:
                raise RuntimeError("Veo response has no video data.")
            with open(out_path, "wb") as fh:
                fh.write(video_bytes)
            break
        if time.monotonic() > deadline:
            raise RuntimeError(
                f"Veo operation timed out after {MAX_POLL_SECONDS}s "
                f"(op: {operation.name})"
            )

    await _fit_clip_duration(out_path, duration_seconds, native_seconds=veo_seconds)
    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Provider: Minimax Hailuo 02 (via Replicate)
# ──────────────────────────────────────────────────────────────────────────
# Cheapest option. Native 6 s clips. Fine for simple scenes but can
# drift on complex character consistency — best paired with a strong
# reference-image pipeline on the niche side.


async def _animate_hailuo(
    keyframe_path: str,
    motion_prompt: str,
    duration_seconds: float,
    out_path: str,
) -> str:
    if not settings.REPLICATE_API_TOKEN:
        raise RuntimeError("REPLICATE_API_TOKEN missing — Hailuo unavailable.")

    import replicate

    image_url = await _upload_keyframe_for_remote_provider(keyframe_path)

    def _create():
        return replicate.predictions.create(
            model="minimax/hailuo-02",
            input={
                "prompt": motion_prompt,
                "first_frame_image": image_url,
                "duration": 6,
                "resolution": "768p",
            },
        )

    try:
        prediction = await asyncio.to_thread(_create)
    except Exception as e:
        raise RuntimeError(f"Hailuo prediction create failed: {e}") from e

    await _poll_replicate(prediction, "Hailuo")

    video_url = (
        prediction.output[0]
        if isinstance(prediction.output, list)
        else str(prediction.output)
    )
    await _download_clip(video_url, out_path)
    await _fit_clip_duration(out_path, duration_seconds, native_seconds=6)
    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Registry
# ──────────────────────────────────────────────────────────────────────────

_PROVIDERS: dict[str, MotionProvider] = {}


def _register(provider: MotionProvider) -> None:
    _PROVIDERS[provider.slug] = provider


def get_motion_provider(slug: str) -> Optional[MotionProvider]:
    """Lookup. Returns None for unknown slugs so the API can 400."""
    return _PROVIDERS.get(slug)


def list_motion_providers() -> list[MotionProvider]:
    """Stable insertion-order list. Used by GET /ai-videos/motion-providers."""
    return list(_PROVIDERS.values())


DEFAULT_MOTION_MODEL = "kling"


# ── Register the bundled providers ─────────────────────────────────────
# Adding a new model here is a single entry — no other file needs
# editing (pricing is a separate concern handled in app/core/pricing.py).

_register(MotionProvider(
    slug="kling",
    name="Kling Turbo",
    description="Fast & affordable. Champion on stylised characters (claymation, anime, cartoons).",
    tagline="Balanced",
    native_clip_seconds=5,
    estimated_usd_per_60s=5.5,
    requires_replicate=True,
    requires_gemini=False,
    animate=_animate_kling,
))

_register(MotionProvider(
    slug="veo_fast",
    name="Veo 3.1 Fast",
    description="Google's model. Strongest on photorealism and physical motion.",
    tagline="Photoreal",
    native_clip_seconds=8,
    estimated_usd_per_60s=7.2,
    requires_replicate=False,
    requires_gemini=True,
    animate=_animate_veo_fast,
))

_register(MotionProvider(
    slug="hailuo",
    name="Hailuo 02",
    description="Cheapest option. Decent quality for simple scenes.",
    tagline="Budget",
    native_clip_seconds=6,
    estimated_usd_per_60s=3.0,
    requires_replicate=True,
    requires_gemini=False,
    animate=_animate_hailuo,
))
