"""
AI Video Generator pipeline (Phase 2).

Turns a user phrase like "un ananas qui parle des vitamines" into a
fully rendered vertical short. Each function here is an isolated stage
so we can test / swap them independently. The orchestrator in
`ai_video_generator.py` wires them together and keeps the
`ai_video_jobs` + `ai_video_scenes` tables in sync.

Stage map:
    1. generate_script         → Gemini 2.5 Pro, writes script + hook + CTA
    2. generate_storyboard     → Gemini 2.5 Pro, splits script into scenes
    3. generate_keyframe       → Gemini 3 Pro Image, one keyframe per scene
    4. animate_scene           → two paths:
         - slideshow: ffmpeg Ken Burns pan/zoom (cheap)
         - motion:    Kling 2.1 via Replicate (premium)
    5. generate_voiceover      → ElevenLabs TTS over the full script
    6. build_subtitles         → word-level karaoke via Whisper align
                                  (falls back to estimated timings)
    7. assemble_video          → ffmpeg concat of scenes + overlay voice +
                                  burn subs + mux
    8. upload_to_storage       → Supabase Storage

We reuse a few helpers from `video_pipeline` (storage upload, ffmpeg runner,
karaoke subtitle renderer) so there's only one implementation of each.
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import re
import tempfile
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from app.core.config import settings
from app.services.video_pipeline import (
    Transcript,
    Word,
    _extract_json,
    _coerce_float,
    _parse_ratio,
    _run_ffmpeg,
    render_karaoke_subs,
    upload_to_storage,
)

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────
# Public data shapes
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class Script:
    """Outcome of stage 1."""
    language: str                     # ISO-639-1 we used
    hook: str                         # opening 3s attention grabber
    full_text: str                    # the complete narrated script
    cta: str = ""                     # optional closing line
    tone: str = ""                    # descriptor the LLM picked


@dataclass
class Scene:
    """One storyboard beat. Exactly one keyframe + one voice line per scene."""
    index: int
    duration_seconds: float
    image_prompt: str                 # what Gemini 3 Pro Image should draw
    motion_prompt: str                # what should happen when we animate
    voiceover_text: str               # the line of the script for this scene
    text_overlay: str = ""            # optional big-caps headline


@dataclass
class Storyboard:
    """Outcome of stage 2 — ordered list of scenes."""
    scenes: list[Scene] = field(default_factory=list)
    total_duration: float = 0.0


# ──────────────────────────────────────────────────────────────────────────
# Stage 1 — generate the script (Gemini 2.5 Pro)
# ──────────────────────────────────────────────────────────────────────────

async def generate_script(
    prompt: str,
    duration_seconds: int = 30,
    language: str = "auto",
    tone: str | None = None,
    style_instructions: str | None = None,
) -> Script:
    """
    Turn the user's one-liner into a timed script. We ask Gemini to match
    a TikTok/Reels short-form structure:
        Hook (0-3s) → Payoff (3-70 %) → CTA (final ~10 %)
    and to pace it for roughly `duration_seconds` of spoken audio at a
    natural ~150 WPM rate.

    `style_instructions` is optional niche-specific guidance (narrative
    voice, structure rules, forbidden clichés) injected verbatim into the
    LLM prompt. Used by the niche registry to lock channel identity.

    Returns a Script with a non-empty `full_text`. Never raises — if
    GEMINI_API_KEY is missing it returns a stub script so the rest of
    the pipeline can still exercise (useful for local dev + tests).
    """
    if not os.getenv("GEMINI_API_KEY"):
        logger.warning("GEMINI_API_KEY missing — returning stub script.")
        return Script(
            language="en" if language == "auto" else language,
            hook=prompt,
            full_text=prompt,
            cta="",
            tone=tone or "energetic",
        )

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    # ~150 WPM spoken English → `duration_seconds * 2.5` words target.
    target_words = max(20, int(duration_seconds * 2.5))

    lang_clause = (
        "Write the script in the user's language (autodetect from the prompt). "
        "Return the detected ISO-639-1 code in the `language` field."
        if language == "auto"
        else f"Write the script in {language}."
    )

    tone_clause = (
        f"Tone/style: {tone}."
        if tone else
        "Pick the tone that best matches the prompt (energetic, "
        "storytelling, educational, dramatic, playful, etc.)."
    )

    style_clause = (
        f"\nSTYLE INSTRUCTIONS (the channel's identity — obey these over "
        f"generic short-form advice):\n{style_instructions.strip()}\n"
        if style_instructions and style_instructions.strip()
        else ""
    )

    prompt_text = f"""You are a viral short-form video scriptwriter (TikTok, Reels, YouTube Shorts).

USER PROMPT: {prompt}
TARGET LENGTH: ~{duration_seconds} seconds spoken at ~150 WPM (≈ {target_words} words).

Write a single-voice narration script that:
- Starts with a HOOK in the first 3 seconds (question, bold claim, surprising fact)
- Delivers on the promise with concrete payoff
- Ends with a call-to-action or a satisfying button
- Uses short punchy sentences — this is meant to be spoken over motion
- Contains NO stage directions, scene headings, or speaker labels

{lang_clause}
{tone_clause}
{style_clause}
Return STRICT JSON with this shape:
{{
  "language": "<iso-639-1>",
  "hook":     "<≤ 15 word opening line>",
  "full_text":"<the complete narration, ~{target_words} words, plain text only>",
  "cta":      "<the closing call-to-action, or empty string>",
  "tone":     "<descriptor you picked>"
}}
"""

    try:
        resp = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-pro",
            contents=prompt_text,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.8,
            ),
        )
        data = _extract_json(resp.text or "{}")
    except Exception as e:
        logger.warning(f"Script generation failed, returning stub: {e}")
        return Script(
            language="en" if language == "auto" else language,
            hook=prompt,
            full_text=prompt,
            cta="",
            tone=tone or "energetic",
        )

    return Script(
        language=(data.get("language") or ("en" if language == "auto" else language)).lower()[:5],
        hook=(data.get("hook") or prompt).strip()[:300],
        full_text=(data.get("full_text") or prompt).strip()[:5000],
        cta=(data.get("cta") or "").strip()[:300],
        tone=(data.get("tone") or tone or "energetic").strip()[:100],
    )


# ──────────────────────────────────────────────────────────────────────────
# Stage 2 — break the script into a storyboard
# ──────────────────────────────────────────────────────────────────────────

async def generate_storyboard(
    script: Script,
    prompt: str,
    total_seconds: float,
    aspect_ratio: str = "9:16",
    scene_count: int | None = None,
    visual_style: str | None = None,
    style_instructions: str | None = None,
) -> Storyboard:
    """
    Ask Gemini to chop the narration into N scenes, each with:
      - a visual prompt suitable for Gemini 3 Pro Image
      - a motion prompt (what should happen if we animate)
      - the specific line(s) of narration that play over this scene
      - an optional big-type overlay word

    `scene_count` defaults to one scene per ~5 seconds, clamped 3-10.

    `visual_style` (niche preset) is APPENDED to every scene's image_prompt
    after generation so every keyframe shares the same lighting / palette
    / subject vocabulary. This is what gives a niche its unmistakable
    visual signature across videos.

    `style_instructions` is extra niche guidance injected into the LLM
    prompt so the storyboard naturally matches the channel's aesthetic.
    """
    if scene_count is None:
        # Longer videos need MORE scenes so Ken Burns stays visually fresh
        # (6-7 scenes is ideal for a 60s talking-head piece).
        scene_count = max(3, min(12, int(round(total_seconds / 5.0))))

    if not os.getenv("GEMINI_API_KEY"):
        # Stub fallback: evenly-split the script into N scenes with a
        # stock image prompt. Enough to exercise the rendering path.
        return _stub_storyboard(script, prompt, total_seconds, scene_count, aspect_ratio, visual_style)

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    style_clause = (
        f"\nNICHE STYLE INSTRUCTIONS (obey these over generic rules):\n"
        f"{style_instructions.strip()}\n"
        if style_instructions and style_instructions.strip()
        else ""
    )

    visual_style_hint = (
        f"\nNICHE VISUAL STYLE — the image_prompts you produce should "
        f"implicitly describe scenes that fit this aesthetic (the renderer "
        f"will ALSO append the style suffix to each prompt automatically, "
        f"so you can stay concise about lighting/palette but match the "
        f"subject vocabulary listed here):\n{visual_style.strip()}\n"
        if visual_style and visual_style.strip()
        else ""
    )

    prompt_text = f"""You are a senior short-form video storyboard artist + director
breaking a voice-over narration into production-grade image prompts. You
are writing for Gemini 3 Pro Image — the prompts must be specific enough
that the model produces a coherent VISUAL STORY, not 6 unrelated stock
photos.

SOURCE PROMPT: {prompt}
SCRIPT (full narration):
{script.full_text}

TARGET
- {scene_count} scenes
- {aspect_ratio} aspect ratio
- total duration ≈ {int(total_seconds)} seconds
- scene durations should sum to the total and each last 3-10 seconds
- language of scene prompts: ENGLISH (for the image model) — the voiceover
  stays in whatever language the script is
{style_clause}{visual_style_hint}
⚡ CRITICAL — AUDIO/VISUAL LITERAL ALIGNMENT ⚡
The viewer will see each image_prompt rendered AT THE EXACT MOMENT the
narrator speaks that scene's voiceover_text. Every image MUST literally
depict WHAT THE VOICE IS SAYING during that window. This is the #1 rule.
A generic "mood" shot that doesn't show the specific idea being spoken
RIGHT NOW breaks the whole video.

  ✗ BAD alignment:
    voiceover_text: "Quand un enfant se retrouve seul, abandonné par
    ses parents qui ferment la porte derrière eux"
    image_prompt: "A lonely figure in an empty room. Cinematic."
    (wrong — doesn't show the parents, doesn't show the door, doesn't
    show the abandonment happening NOW)

  ✓ GOOD alignment:
    voiceover_text: "Quand un enfant se retrouve seul, abandonné par
    ses parents qui ferment la porte derrière eux"
    image_prompt: "Medium wide shot, eye level. A small matte-white
    child figure sits cross-legged on the floor of a dim minimalist
    room, facing the camera. Behind them, two adult figures walk
    through an open doorway into harsh white light, the door half-shut,
    their hands at their sides and heads forward. The child looks up
    toward the closing door, shoulders slightly hunched. Cold teal
    shadow floods the room, a single amber key light catches the
    child's cheek. Shallow depth of field, 50mm lens."

Every image_prompt must be LITERAL to what its voiceover_text says.
If the voiceover mentions specific subjects (a child, the parents,
a door, a table, a window) → those specific subjects MUST appear in
the frame. If the voiceover names an action (leaving, crying, looking
away, reaching out) → that action MUST be visible.

QUALITY BAR for each scene's `image_prompt` (mandatory components):

  1. Shot size + angle (wide / medium / close-up / over-shoulder / top-
     down / low angle, etc.)
  2. Subject staging — WHO is in frame, WHERE they are, WHAT they're
     doing that matches the voiceover line
  3. Environment + key props that make the voiceover's metaphor
     concrete (not just "a room")
  4. Lighting direction, colour temperature, contrast ratio
  5. Lens feel (focal length, depth of field)
  6. One or two small symbolic details that pay off the voiceover
     (an object, a gesture, a reflection, a metaphor)
  7. NO text inside the image, NO brand logos, NO identifiable real
     people's faces unless the prompt explicitly calls for a historical
     figure as b-roll

For EACH scene produce:
- image_prompt:     follow the QUALITY BAR above, 40-80 words
- motion_prompt:    one sentence describing the motion if this still were
                    animated (camera move + subject micro-action, e.g.
                    "slow push-in while the figure slightly turns")
- voiceover_text:   the exact substring of the script that plays over this
                    scene — use wording from the script verbatim
- text_overlay:     optional 1-4 word ALL-CAPS keyword pulled from the
                    voiceover to burn on-screen ("ATTACHEMENT", "VIDE",
                    "TROP CLAIR"); empty string if not useful
- duration_seconds: float, how long this scene plays

CONTINUITY RULES
- Same subject type across scenes. If scene 1 shows "a lone woman silhouetted
  from behind", scene 3 should not introduce a cartoon character.
- Keep a consistent visual palette (the NICHE VISUAL STYLE block above
  defines this — follow it strictly).
- Use varied shot sizes across the video (don't repeat wide-shot 6 times);
  alternate wide / medium / close-up so the edit breathes.
- Never repeat the same exact scene twice — each must add an emotional
  beat.

Return STRICT JSON with this shape:
{{
  "scenes": [
    {{
      "image_prompt": "...",
      "motion_prompt": "...",
      "voiceover_text": "...",
      "text_overlay": "...",
      "duration_seconds": 4.5
    }}
  ]
}}

No markdown, no prose outside the JSON."""

    try:
        resp = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-pro",
            contents=prompt_text,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.5,
            ),
        )
        data = _extract_json(resp.text or "{}")
    except Exception as e:
        logger.warning(f"Storyboard generation failed, falling back to stub: {e}")
        return _stub_storyboard(script, prompt, total_seconds, scene_count, aspect_ratio)

    scenes_raw = data.get("scenes") or []
    scenes: list[Scene] = []
    for i, raw in enumerate(scenes_raw[:scene_count]):
        if not isinstance(raw, dict):
            continue
        dur = _coerce_float(raw.get("duration_seconds")) or (total_seconds / scene_count)
        image_prompt = (raw.get("image_prompt") or prompt).strip()[:1500]
        # Inject the niche visual style at the END so the LLM-written
        # subject stays the priority but lighting/palette/grain are locked.
        if visual_style and visual_style.strip():
            image_prompt = f"{image_prompt}\n\nSTYLE: {visual_style.strip()}"
        scenes.append(Scene(
            index=i,
            duration_seconds=max(2.0, min(12.0, float(dur))),
            image_prompt=image_prompt[:2500],
            motion_prompt=(raw.get("motion_prompt") or "slow push-in").strip()[:500],
            voiceover_text=(raw.get("voiceover_text") or "").strip()[:1000],
            text_overlay=(raw.get("text_overlay") or "").strip()[:60],
        ))

    if not scenes:
        return _stub_storyboard(script, prompt, total_seconds, scene_count, aspect_ratio, visual_style)

    # Normalise durations to hit the total exactly (LLM math is flaky).
    current_total = sum(s.duration_seconds for s in scenes) or 1.0
    scale = total_seconds / current_total
    for s in scenes:
        s.duration_seconds = round(s.duration_seconds * scale, 2)

    return Storyboard(
        scenes=scenes,
        total_duration=sum(s.duration_seconds for s in scenes),
    )


def _stub_storyboard(
    script: Script,
    prompt: str,
    total_seconds: float,
    scene_count: int,
    aspect_ratio: str,
    visual_style: str | None = None,
) -> Storyboard:
    """Degenerate fallback — evenly-split the script into N identical-prompt
    scenes so the renderer can still produce output (useful for local dev
    when Gemini is unavailable)."""
    per = total_seconds / max(1, scene_count)
    words = script.full_text.split()
    per_words = max(1, len(words) // max(1, scene_count))
    scenes: list[Scene] = []
    for i in range(scene_count):
        chunk = " ".join(words[i * per_words : (i + 1) * per_words])
        base = f"{prompt} — cinematic still, photographic, dramatic lighting"
        if visual_style and visual_style.strip():
            base = f"{base}\n\nSTYLE: {visual_style.strip()}"
        scenes.append(Scene(
            index=i,
            duration_seconds=per,
            image_prompt=base,
            motion_prompt="slow push-in",
            voiceover_text=chunk or prompt,
            text_overlay="",
        ))
    return Storyboard(scenes=scenes, total_duration=total_seconds)


# ──────────────────────────────────────────────────────────────────────────
# Stage 3 — generate a keyframe image for a scene (Gemini 3 Pro Image)
# ──────────────────────────────────────────────────────────────────────────

async def generate_keyframe(
    scene: Scene,
    aspect_ratio: str = "9:16",
    out_path: str = "",
) -> str:
    """
    Call Gemini 3 Pro Image (Nano Banana Pro) for this scene's keyframe.
    Writes the PNG bytes to `out_path` and returns that path.

    Raises RuntimeError on terminal failure so the orchestrator can mark
    the scene as failed without aborting the whole job.
    """
    if not os.getenv("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY missing — cannot render keyframes.")
    if not out_path:
        raise ValueError("generate_keyframe needs an explicit out_path.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    contents = [scene.image_prompt]
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-3-pro-image-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio,
                    image_size="1K",
                ),
            ),
        )
    except Exception as e:
        raise RuntimeError(f"Gemini 3 Pro Image call failed: {e}") from e

    if not response.candidates:
        raise RuntimeError("Gemini returned no candidates for keyframe.")
    candidate = response.candidates[0]
    if not candidate.content or not candidate.content.parts:
        raise RuntimeError("Gemini returned empty content (likely safety-blocked).")

    img_bytes: Optional[bytes] = None
    for part in candidate.content.parts:
        if getattr(part, "inline_data", None):
            img_bytes = part.inline_data.data
            break
    if not img_bytes:
        raise RuntimeError("Gemini returned no image bytes.")

    with open(out_path, "wb") as fh:
        fh.write(img_bytes)
    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Stage 4 — animate a scene (slideshow Ken Burns OR motion Kling)
# ──────────────────────────────────────────────────────────────────────────

def animate_scene_slideshow(
    keyframe_path: str,
    duration_seconds: float,
    out_path: str,
    aspect_ratio: str = "9:16",
) -> str:
    """
    Ken Burns effect: slow pan+zoom over the still keyframe so the scene
    feels alive without costing anything. Output resolution is tuned per
    aspect so the final concat doesn't have to rescale.
    """
    out_size = {
        (9, 16): (1080, 1920),
        (1, 1): (1080, 1080),
        (16, 9): (1920, 1080),
        (4, 5): (1080, 1350),
    }.get(_parse_ratio(aspect_ratio), (1080, 1920))

    # Total frames at 30fps
    frames = max(60, int(round(duration_seconds * 30)))

    # zoompan expression: linear zoom from 1.00 → 1.12 over the clip,
    # centred pan. x=iw/2-(iw/zoom/2), y=ih/2-(ih/zoom/2) keeps it middle.
    # We upscale the input 4× so the zoom doesn't produce visible pixels.
    vf = (
        f"scale=iw*4:ih*4,"
        f"zoompan=z='min(zoom+0.0015,1.12)'"
        f":d={frames}"
        f":x='iw/2-(iw/zoom/2)'"
        f":y='ih/2-(ih/zoom/2)'"
        f":s={out_size[0]}x{out_size[1]}"
        f":fps=30,"
        f"format=yuv420p"
    )

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", keyframe_path,
        "-t", f"{duration_seconds:.3f}",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out_path,
    ]
    _run_ffmpeg(cmd, f"ken_burns({duration_seconds:.1f}s)")
    return out_path


async def animate_scene_motion(
    keyframe_path: str,
    motion_prompt: str,
    duration_seconds: float,
    out_path: str,
) -> str:
    """
    Image → video via Kling 2.5 Turbo Pro (Replicate). Uses the same model
    the avatar video endpoint already uses so operations stay uniform.

    Kling outputs 5 seconds by default. For scenes longer than 5s we
    setpts-slow the clip; shorter get ffmpeg-trimmed. Either way the
    orchestrator picks scene durations to fit the spoken audio.

    Bounded by a 4-minute per-scene timeout — Kling 2.5 turbo normally
    finishes in 45-90s, so anything beyond 240s is a hang and we
    cancel + raise rather than letting the whole job stall. A single
    slow scene CANNOT block the pipeline indefinitely anymore.
    """
    if not settings.REPLICATE_API_TOKEN:
        raise RuntimeError("REPLICATE_API_TOKEN missing — motion mode unavailable.")

    import replicate

    # Upload the keyframe somewhere Replicate can fetch it. Easiest + most
    # reliable: push it to Supabase Storage first, grab the public URL,
    # feed that to Replicate.
    remote_path = f"ai_video_sources/{uuid.uuid4().hex}.png"
    image_url = await asyncio.to_thread(
        upload_to_storage, keyframe_path, remote_path, "image/png"
    )

    # ── Fire-and-poll with explicit timeout ──────────────────────────
    # The SDK's `prediction.wait()` blocks with no timeout — if Replicate's
    # queue stalls or a prediction hangs in an error state, the whole job
    # stops. We replace it with an explicit poll loop + deadline so we can
    # surface the failure and keep the rest of the video moving.
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

    MAX_POLL_ATTEMPTS = 48   # 48 × 5s = 240s = 4 minutes budget
    final_status: Optional[str] = None
    for _ in range(MAX_POLL_ATTEMPTS):
        status = getattr(prediction, "status", None)
        if status in ("succeeded", "failed", "canceled"):
            final_status = status
            break
        await asyncio.sleep(5)
        try:
            # SDK's `reload()` mutates in place; run it off the event loop
            # to avoid blocking other coroutines.
            await asyncio.to_thread(prediction.reload)
        except Exception as e:
            logger.warning(f"Kling poll reload failed (continuing): {e}")
            continue

    if final_status != "succeeded":
        # Timeout or terminal non-success. Best-effort cancel to free the
        # compute slot on Replicate's side.
        if final_status is None:
            try:
                await asyncio.to_thread(prediction.cancel)
            except Exception:
                pass
            raise RuntimeError(
                f"Kling prediction timed out after {MAX_POLL_ATTEMPTS * 5}s "
                f"(prediction id: {getattr(prediction, 'id', '?')})"
            )
        err = getattr(prediction, "error", None)
        raise RuntimeError(f"Kling prediction {final_status}: {err}")

    out = prediction.output
    video_url = out[0] if isinstance(out, list) else str(out)

    # Download the clip into out_path.
    import httpx
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
        r = await client.get(video_url)
        r.raise_for_status()
        with open(out_path, "wb") as fh:
            fh.write(r.content)

    # If the scene needs to be shorter than the 5s Kling default, trim.
    if duration_seconds < 4.9:
        trimmed = out_path + ".trim.mp4"
        cmd = [
            "ffmpeg", "-y",
            "-i", out_path,
            "-t", f"{duration_seconds:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-c:a", "copy",
            "-movflags", "+faststart",
            trimmed,
        ]
        _run_ffmpeg(cmd, "kling_trim")
        os.replace(trimmed, out_path)

    # If it needs to be LONGER than 5s we slow it down to fit. Rarely
    # needed because the storyboard cap is 10s and we keep most scenes
    # under 6 — but guarded for correctness.
    elif duration_seconds > 5.1:
        slowed = out_path + ".slow.mp4"
        # setpts=PTS*factor slows video; factor = target/source.
        factor = duration_seconds / 5.0
        cmd = [
            "ffmpeg", "-y",
            "-i", out_path,
            "-filter_complex", f"[0:v]setpts={factor}*PTS[v]",
            "-map", "[v]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-movflags", "+faststart",
            slowed,
        ]
        _run_ffmpeg(cmd, "kling_slow")
        os.replace(slowed, out_path)

    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Stage 5 — voice-over (ElevenLabs TTS)
# ──────────────────────────────────────────────────────────────────────────

async def generate_voiceover(
    script_text: str,
    out_path: str,
    voice_id: str | None = None,
    language: str | None = None,
) -> str | None:
    """
    Render the full script as an mp3 via ElevenLabs. Returns the path on
    success, None if TTS is disabled or the key is missing — callers
    should handle None by producing a silent video.
    """
    api_key = settings.ELEVENLABS_API_KEY
    if not api_key:
        logger.info("ELEVENLABS_API_KEY missing — returning no voice-over.")
        return None
    if not script_text or not script_text.strip():
        return None

    voice = voice_id or settings.ELEVENLABS_DEFAULT_VOICE

    # We call the v1 REST endpoint directly so we don't have to add yet
    # another SDK dependency. Multi-language requires the `eleven_multilingual_v2`
    # model.
    import httpx
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"
    headers = {
        "xi-api-key": api_key,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }
    payload = {
        "text": script_text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.3,
            "use_speaker_boost": True,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            audio_bytes = r.content
    except Exception as e:
        logger.warning(f"ElevenLabs TTS failed: {e}")
        return None

    with open(out_path, "wb") as fh:
        fh.write(audio_bytes)
    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Stage 6 — build subtitles from the voice-over (or from scene text
# directly when we have no voice track)
# ──────────────────────────────────────────────────────────────────────────

async def build_transcript_from_voice(
    voice_path: str,
    script_text: str,
) -> Transcript:
    """
    When we HAVE a voice-over, run Whisper against the audio track to get
    accurate word timings. When we DON'T have a voice track, estimate
    timings from reading speed so the subtitle burn-in still works.

    Returns a `Transcript` shaped exactly like the one from Auto-Clip so
    the karaoke renderer can be reused as-is.
    """
    if voice_path and os.path.isfile(voice_path) and settings.REPLICATE_API_TOKEN:
        try:
            return await _whisper_align(voice_path)
        except Exception as e:
            logger.warning(f"Whisper alignment failed, falling back to estimated timings: {e}")

    return _estimate_transcript_from_text(script_text)


async def _whisper_align(audio_path: str) -> Transcript:
    """Same WhisperX call we use in Auto-Clip. Gets us word timings aligned
    to the actual voice-over the TTS produced."""
    import replicate

    with open(audio_path, "rb") as fh:
        output = await asyncio.to_thread(
            replicate.run,
            "victor-upmeet/whisperx:84d2ad2d6194fe98a17d2b60bef1c7f910c46b2f6fd38996ca457afd9c8abfcb",
            input={
                "audio": fh,
                "task": "transcribe",
                "language": "None",
                "batch_size": 64,
                "timestamp": "word",
            },
        )

    words: list[Word] = []
    full_parts: list[str] = []
    language = "en"
    if isinstance(output, dict):
        language = output.get("detected_language") or "en"
        for w in (output.get("word_segments") or []):
            start = _coerce_float(w.get("start"))
            end = _coerce_float(w.get("end"))
            text = (w.get("word") or "").strip()
            if text and start is not None and end is not None and end > start:
                words.append(Word(text=text, start=start, end=end))
        for seg in (output.get("segments") or []):
            t = (seg.get("text") or "").strip()
            if t:
                full_parts.append(t)
    return Transcript(language=language, words=words, full_text=" ".join(full_parts).strip())


def _estimate_transcript_from_text(script_text: str) -> Transcript:
    """No audio available — estimate timings at a constant ~3 words/sec so
    karaoke subs still advance smoothly."""
    tokens = [t for t in re.split(r"\s+", (script_text or "").strip()) if t]
    words: list[Word] = []
    t = 0.0
    per_word = 1.0 / 3.0  # 3 WPS ≈ 180 WPM — speaks a bit fast but readable
    for tok in tokens:
        end = t + per_word
        words.append(Word(text=tok, start=round(t, 3), end=round(end, 3)))
        t = end
    return Transcript(language="en", words=words, full_text=script_text)


# ──────────────────────────────────────────────────────────────────────────
# Stage 6b — align storyboard scenes to the real spoken audio timings
# ──────────────────────────────────────────────────────────────────────────
#
# This is THE step that makes audio/visual sync tight. Without it, the
# LLM's scene-duration estimates drift relative to the real ElevenLabs
# read (which can be 10-20% faster or slower than target WPM), and the
# viewer sees a child appear on screen AFTER the narrator has already
# moved on to the parents leaving — which kills the whole illusion.
#
# After this runs, every scene's `duration_seconds` is recomputed so the
# scene plays EXACTLY while its voiceover_text is being spoken.

_WORD_TOKEN_RE = re.compile(r"[\w']+", re.UNICODE)


def _normalize_tokens(text: str) -> list[str]:
    """Lower-case word tokeniser used for position-matching between the
    LLM-authored `voiceover_text` and the Whisper word stream.

    Strips punctuation, keeps apostrophes inside words (so "j'ai" stays
    a single token — matches how both the script and Whisper tokenise
    French apostrophe contractions)."""
    return [t.lower() for t in _WORD_TOKEN_RE.findall(text or "")]


async def align_scenes_to_audio(
    storyboard: "Storyboard",
    voice_path: Optional[str],
    script_text: str,
) -> tuple["Storyboard", Transcript]:
    """
    Re-time every scene so its visual window matches the actual spoken
    voice-over. Returns the (possibly-mutated) storyboard and the
    Whisper transcript — the caller should reuse the transcript for
    subtitle rendering so we only pay the Whisper call once.

    Algorithm:
      1. Whisper-align the full voice track → word-level timings.
      2. Tokenise each scene's voiceover_text → positional word windows.
      3. Walk the Whisper stream and assign timings scene-by-scene.
      4. Fall back to proportional allocation when token counts diverge
         (happens when the script has abbreviations, numbers, or
         paraphrasing that Whisper tokenises differently).

    Never raises — if the voice file is missing or Whisper fails, the
    storyboard is returned unchanged (the LLM's estimates are the
    best we've got in that case).
    """
    if not voice_path or not os.path.isfile(voice_path):
        return storyboard, Transcript(
            language="en", words=[], full_text=script_text or ""
        )

    transcript = await build_transcript_from_voice(voice_path, script_text or "")
    whisper_words = transcript.words
    if not whisper_words or not storyboard.scenes:
        return storyboard, transcript

    # ── Build per-scene token windows ────────────────────────────────
    scene_token_counts: list[int] = []
    total_script_tokens = 0
    for scene in storyboard.scenes:
        toks = _normalize_tokens(scene.voiceover_text)
        scene_token_counts.append(len(toks))
        total_script_tokens += len(toks)

    if total_script_tokens == 0:
        # No voice-over text in any scene (unusual). Nothing to align.
        return storyboard, transcript

    audio_end = whisper_words[-1].end
    whisper_count = len(whisper_words)
    drift = abs(whisper_count - total_script_tokens)
    mismatch_ratio = drift / max(1, total_script_tokens)

    # ── Two strategies ───────────────────────────────────────────────
    # A) Tokens roughly match → positional walk (precise, scene-by-scene).
    # B) Counts diverge a lot  → proportional by word-count (safe fallback).
    if mismatch_ratio <= 0.2 and drift <= max(5, whisper_count * 0.2):
        # Strategy A: positional walk.
        cursor = 0
        for i, scene in enumerate(storyboard.scenes):
            n = scene_token_counts[i]
            if n == 0:
                # Silent scene — assign a short fixed breath pause.
                scene.duration_seconds = 1.5
                continue
            start_idx = min(cursor, whisper_count - 1)
            end_idx = min(cursor + n - 1, whisper_count - 1)
            start_time = whisper_words[start_idx].start
            end_time = whisper_words[end_idx].end
            # Last scene: extend to the very end of audio in case Whisper
            # dropped trailing words (common on long pieces).
            if i == len(storyboard.scenes) - 1:
                end_time = max(end_time, audio_end)
            scene.duration_seconds = max(1.5, round(end_time - start_time, 2))
            cursor = end_idx + 1
    else:
        # Strategy B: proportional fallback.
        logger.info(
            f"Scene-alignment: token mismatch "
            f"(script={total_script_tokens} vs whisper={whisper_count}) "
            f"— using proportional allocation."
        )
        for i, scene in enumerate(storyboard.scenes):
            n = scene_token_counts[i]
            if n == 0:
                scene.duration_seconds = 1.5
                continue
            fraction = n / total_script_tokens
            scene.duration_seconds = max(1.5, round(audio_end * fraction, 2))

    storyboard.total_duration = round(
        sum(s.duration_seconds for s in storyboard.scenes), 2
    )
    return storyboard, transcript


# ──────────────────────────────────────────────────────────────────────────
# Stage 7 — assemble the final video
# ──────────────────────────────────────────────────────────────────────────

def assemble_video(
    scene_clip_paths: list[str],
    voice_path: str | None,
    out_path: str,
) -> str:
    """
    Concat the per-scene clips and mix in the voice-over (if any). Uses
    ffmpeg's concat demuxer for frame-accurate joining, then overlays the
    voice track. Each scene clip is assumed to already be the right size
    and framerate — the pipeline keeps them consistent at 1080×1920 @30fps
    (or the equivalent for square / landscape).
    """
    if not scene_clip_paths:
        raise ValueError("assemble_video called with no scene clips.")

    # 1. Concat list for ffmpeg. The demuxer wants a text file with lines
    # like `file 'path.mp4'`. Absolute paths so it doesn't get confused by
    # the tempdir.
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as lf:
        for p in scene_clip_paths:
            # Paths must be escaped; single-quote-safe is enough for our
            # controlled tempdir names (UUID hex).
            lf.write(f"file '{os.path.abspath(p)}'\n")
        concat_list = lf.name

    # 2. Concat without voice first, then mux audio in a second pass.
    # That keeps the concat simple (all inputs are video-only post-Ken-Burns;
    # Kling outputs include silent tracks which we strip and replace).
    silent_path = out_path + ".silent.mp4"
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", concat_list,
        "-an",                                # strip whatever audio came in
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        silent_path,
    ]
    try:
        _run_ffmpeg(cmd, "concat_scenes")
    finally:
        try:
            os.remove(concat_list)
        except OSError:
            pass

    # 3. Mux voice-over (or leave silent).
    if voice_path and os.path.isfile(voice_path):
        cmd = [
            "ffmpeg", "-y",
            "-i", silent_path,
            "-i", voice_path,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            "-movflags", "+faststart",
            out_path,
        ]
        _run_ffmpeg(cmd, "mux_voice")
    else:
        # No voice — just rename.
        os.replace(silent_path, out_path)

    # Best-effort cleanup of the temp silent file.
    try:
        if os.path.isfile(silent_path):
            os.remove(silent_path)
    except OSError:
        pass

    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Stage 8 — burn subs on the final video (optional)
# ──────────────────────────────────────────────────────────────────────────

def burn_final_subtitles(
    video_path: str,
    transcript: Transcript,
    total_duration: float,
    out_path: str,
    style: str = "karaoke",
) -> str:
    """
    Thin wrapper around `render_karaoke_subs` from video_pipeline so we
    reuse the exact same subtitle renderer as Auto-Clip — no duplication.
    """
    # The karaoke renderer expects clip_start / clip_end so it can filter
    # words to a window; for the final assembled video we pass [0, total]
    # so every word is considered in scope.
    return render_karaoke_subs(
        video_path,
        transcript,
        clip_start=0.0,
        clip_end=total_duration,
        out_path=out_path,
        style=style,
    )
