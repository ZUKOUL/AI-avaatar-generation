"""
Auto-Clip pipeline helpers.

Each function in here is a single stage of the "long-form URL → N viral
vertical shorts" pipeline. The orchestrator in `video_clipper.py` wires
them together and writes progress to the `clip_jobs` table.

Stages:
    1. download_source       → yt-dlp, pulls the source video locally
    2. transcribe_audio      → Whisper via Replicate, with fallback to Gemini
    3. detect_viral_moments  → Gemini 2.5 Pro, picks the N best segments
    4. cut_segment           → ffmpeg, lossless slice of a time range
    5. reframe_to_vertical   → Sieve face-aware OR ffmpeg centre-crop fallback
    6. render_karaoke_subs   → ASS subtitle file + ffmpeg burn-in
    7. extract_thumbnail     → ffmpeg frame grab at the hook timestamp
    8. upload_to_storage     → Supabase Storage (switch to R2 later)

Every stage is designed to be runnable in isolation so individual pieces
can be tested or swapped. Environment keys are read lazily (inside each
function) so importing this module never requires them to be present —
the service can boot even when only some keys are configured.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shlex
import shutil
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.core.supabase import supabase

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────
# Public data shapes
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class SourceVideo:
    """Outcome of stage 1 (download)."""
    path: str                      # local filesystem path to the .mp4
    title: str
    duration_seconds: float
    width: int
    height: int


@dataclass
class Word:
    """A single spoken word with millisecond-accurate timing."""
    text: str
    start: float                   # seconds
    end: float                     # seconds


@dataclass
class Transcript:
    """Outcome of stage 2."""
    language: str                  # ISO-639-1 best guess
    words: list[Word] = field(default_factory=list)
    full_text: str = ""


@dataclass
class ViralMoment:
    """Outcome of stage 3 — one candidate clip."""
    start: float                   # seconds, inclusive
    end: float                     # seconds, exclusive
    title: str                     # punchy headline for the clip
    reason: str                    # why the LLM picked it
    virality_score: int            # 0..100


# ──────────────────────────────────────────────────────────────────────────
# Stage 1 — download source video with yt-dlp
# ──────────────────────────────────────────────────────────────────────────

def download_source(url: str, workdir: str) -> SourceVideo:
    """
    Pull the source video to disk. We ask yt-dlp for a merged mp4 at ≤1080p
    because anything bigger just wastes bandwidth for short-form output.

    Raises `RuntimeError` on failure so the orchestrator can mark the job
    as failed with a useful error message.
    """
    try:
        import yt_dlp  # lazy import so a missing dep doesn't block app boot
    except ImportError as e:
        raise RuntimeError(
            "yt-dlp is not installed — run `pip install yt-dlp`. "
            f"Original error: {e}"
        )

    # Use a deterministic local path so the caller knows where to find it.
    out_path = os.path.join(workdir, f"source_{uuid.uuid4().hex}.mp4")

    opts = {
        "format": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]",
        "outtmpl": out_path,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        # Don't download a whole YouTube playlist if the URL has &list=…
        "noplaylist": True,
        # Be polite-ish. We keep a tight timeout so a stuck download doesn't
        # hold a worker forever.
        "socket_timeout": 60,
        # YouTube occasionally serves fragmented streams; let yt-dlp merge.
        "concurrent_fragment_downloads": 4,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as e:
        raise RuntimeError(f"Failed to download source video: {e}")

    if not os.path.isfile(out_path):
        # yt-dlp can silently pick a different extension if merging fell back
        # to something other than mp4. Glob the workdir for the newest file
        # it just wrote and use that instead.
        candidates = [
            os.path.join(workdir, f)
            for f in os.listdir(workdir)
            if f.startswith(os.path.basename(out_path).split(".")[0])
        ]
        if not candidates:
            raise RuntimeError("yt-dlp finished but no output file was created.")
        out_path = max(candidates, key=os.path.getmtime)

    # Probe the actual dimensions + duration (don't trust yt-dlp's info dict,
    # it's occasionally off by a few seconds on shorts). ffprobe is bundled
    # with ffmpeg.
    width, height, duration = _ffprobe_dimensions_and_duration(out_path)

    return SourceVideo(
        path=out_path,
        title=(info or {}).get("title") or "Untitled",
        duration_seconds=duration,
        width=width,
        height=height,
    )


def _ffprobe_dimensions_and_duration(path: str) -> tuple[int, int, float]:
    """Return (width, height, duration_seconds). Uses ffprobe JSON output."""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height:format=duration",
        "-of", "json",
        path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr.strip()}")
    data = json.loads(result.stdout or "{}")
    stream = (data.get("streams") or [{}])[0]
    fmt = data.get("format") or {}
    return (
        int(stream.get("width") or 0),
        int(stream.get("height") or 0),
        float(fmt.get("duration") or 0.0),
    )


# ──────────────────────────────────────────────────────────────────────────
# Stage 2 — transcribe audio (Whisper via Replicate, Gemini fallback)
# ──────────────────────────────────────────────────────────────────────────

async def transcribe_audio(video_path: str) -> Transcript:
    """
    Produce a word-level transcript. Tries Replicate's Whisper-large-v3
    first (best quality + word timings for free). If the Replicate key is
    missing, falls back to Gemini 1.5 audio understanding which gives
    reasonable sentence-level timing but not word-level — good enough for
    block-style subtitles.

    Never raises: always returns a Transcript, possibly empty. The caller
    should check `transcript.words` before assuming karaoke subs are
    possible.
    """
    if settings.REPLICATE_API_TOKEN:
        try:
            return await _transcribe_with_replicate(video_path)
        except Exception as e:
            logger.warning(f"Replicate transcription failed, falling back: {e}")

    if os.getenv("GEMINI_API_KEY"):
        try:
            return await _transcribe_with_gemini(video_path)
        except Exception as e:
            logger.warning(f"Gemini transcription fallback failed: {e}")

    logger.error("No transcription provider configured (Replicate + Gemini both unavailable).")
    return Transcript(language="en", words=[], full_text="")


async def _transcribe_with_replicate(video_path: str) -> Transcript:
    """Replicate Whisper-large-v3 gives us per-word timings out of the box."""
    import replicate

    # Replicate needs a publicly reachable URL OR a file handle. We open the
    # file and hand the client a stream. The client uploads it for us.
    with open(video_path, "rb") as fh:
        # Use the turbo model — ~5× faster than large-v3 on the same audio
        # and the accuracy delta is small for clean YouTube audio.
        prediction_input = {
            "audio": fh,
            "task": "transcribe",
            "language": "None",           # autodetect
            "batch_size": 64,
            "timestamp": "word",          # critical: request word-level
        }
        output = await asyncio.to_thread(
            replicate.run,
            "victor-upmeet/whisperx:84d2ad2d6194fe98a17d2b60bef1c7f910c46b2f6fd38996ca457afd9c8abfcb",
            input=prediction_input,
        )

    words: list[Word] = []
    full_text_parts: list[str] = []
    language = "en"

    # WhisperX output shape: {"segments": [...], "word_segments": [...], "detected_language": "en"}
    if isinstance(output, dict):
        language = output.get("detected_language") or "en"
        # Prefer word_segments if present — those are the millisecond-accurate ones.
        for w in (output.get("word_segments") or []):
            start = _coerce_float(w.get("start"))
            end = _coerce_float(w.get("end"))
            text = (w.get("word") or "").strip()
            if text and start is not None and end is not None and end > start:
                words.append(Word(text=text, start=start, end=end))
        # Build full text from segments for readability.
        for seg in (output.get("segments") or []):
            t = (seg.get("text") or "").strip()
            if t:
                full_text_parts.append(t)

    return Transcript(
        language=language,
        words=words,
        full_text=" ".join(full_text_parts).strip(),
    )


async def _transcribe_with_gemini(video_path: str) -> Transcript:
    """
    Fallback: Gemini 1.5 Flash audio transcription. No word timings, but
    sentence-level timings are usually good enough for block subtitles.
    """
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    # Upload the video to the Gemini File API. We could send bytes inline
    # but long-form videos bust the inline-data size cap.
    uploaded = await asyncio.to_thread(client.files.upload, file=video_path)

    # Wait for processing (Gemini needs a moment to index the audio track).
    for _ in range(30):
        info = await asyncio.to_thread(client.files.get, name=uploaded.name)
        if info.state and info.state.name == "ACTIVE":
            break
        await asyncio.sleep(2)

    prompt = (
        "Transcribe this video's speech. Return strict JSON with shape "
        '{"language": "<iso-639-1>", "segments": [{"start": <sec>, "end": <sec>, "text": "..."}]}. '
        "Keep each segment to a single sentence. Do not include any other keys."
    )

    resp = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash",
        contents=[uploaded, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    raw = resp.text or "{}"
    data = _extract_json(raw)
    language = data.get("language") or "en"
    words: list[Word] = []
    full_text_parts: list[str] = []
    for seg in (data.get("segments") or []):
        text = (seg.get("text") or "").strip()
        start = _coerce_float(seg.get("start"))
        end = _coerce_float(seg.get("end"))
        if text:
            full_text_parts.append(text)
        if text and start is not None and end is not None and end > start:
            # Approximate word-level timings by linear interpolation across
            # the sentence. Not perfect, but better than nothing for the
            # karaoke path.
            tokens = [t for t in text.split() if t]
            if tokens:
                span = (end - start) / len(tokens)
                for i, tok in enumerate(tokens):
                    words.append(Word(
                        text=tok,
                        start=start + i * span,
                        end=start + (i + 1) * span,
                    ))

    return Transcript(
        language=language,
        words=words,
        full_text=" ".join(full_text_parts).strip(),
    )


# ──────────────────────────────────────────────────────────────────────────
# Stage 3 — moment detection (Gemini 2.5 Pro picks the N best segments)
# ──────────────────────────────────────────────────────────────────────────

async def detect_viral_moments(
    transcript: Transcript,
    source_duration: float,
    count: int = 5,
) -> list[ViralMoment]:
    """
    Ask Gemini 2.5 Pro to read the transcript and pick the N most shareable
    moments. Return them ordered by score desc.

    Gemini is great at this because it has internalised the whole TikTok
    viral playbook from its training data — it knows what a hook sounds
    like, what pattern interrupts trigger algorithmic amplification, etc.

    If Gemini isn't available, returns an empty list — the caller should
    fall back to evenly-spaced time-based cuts.
    """
    if not os.getenv("GEMINI_API_KEY"):
        logger.warning("GEMINI_API_KEY missing — moment detection disabled.")
        return []

    if not transcript.full_text and not transcript.words:
        logger.warning("Transcript is empty — moment detection impossible.")
        return []

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    # We feed Gemini a timestamped transcript (every ~15s chunk tagged with
    # its seconds offset). The LLM responds with start/end ranges and a
    # score. The chunk tagging is what lets the LLM cite actual timestamps
    # rather than inventing them.
    tagged = _timestamp_tag_transcript(transcript, source_duration)

    prompt = f"""You are a short-form video producer evaluating a long-form video
for viral short-form potential (YouTube Shorts, TikTok, Instagram Reels).

SOURCE DURATION: {int(source_duration)} seconds.
CLIPS REQUESTED: {count}.

Read the timestamped transcript below and pick the {count} most shareable
moments. A great moment:
- Starts with a HOOK (question, bold claim, surprising fact) — the opening
  3 seconds must grab attention without context.
- Is self-contained (someone watching ONLY this clip understands it).
- Runs 20-60 seconds long (sweet spot for algorithm retention).
- Triggers an emotion: surprise, outrage, curiosity, aspiration, humour.
- Avoids dead air, filler, and rambling.

Return STRICT JSON ONLY with this shape:
{{
  "clips": [
    {{
      "start": <float seconds>,
      "end": <float seconds>,
      "title": "<≤ 60-char punchy hook>",
      "reason": "<one sentence why this is share-worthy>",
      "virality_score": <integer 0-100>
    }}
  ]
}}

Rules:
- Clips MUST NOT overlap each other.
- Clip length = end - start must be between 15 and 75 seconds.
- start/end MUST align to the closest word boundary in the transcript.
- Order by virality_score DESC.

TRANSCRIPT:
{tagged}
"""

    resp = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-pro",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.4,
        ),
    )

    data = _extract_json(resp.text or "{}")
    moments: list[ViralMoment] = []
    for clip in (data.get("clips") or []):
        start = _coerce_float(clip.get("start"))
        end = _coerce_float(clip.get("end"))
        title = (clip.get("title") or "").strip() or "Untitled moment"
        reason = (clip.get("reason") or "").strip()
        score = int(clip.get("virality_score") or 0)
        if start is None or end is None or end <= start:
            continue
        # Clamp to source duration and sane clip length.
        start = max(0.0, start)
        end = min(source_duration, end)
        if end - start < 10:       # too short to be useful
            continue
        if end - start > 90:       # too long, LLM got sloppy
            end = start + 90
        moments.append(ViralMoment(
            start=start, end=end,
            title=title[:120], reason=reason,
            virality_score=max(0, min(100, score)),
        ))

    # Sort descending and clip to requested count.
    moments.sort(key=lambda m: -m.virality_score)
    return moments[:count]


def _timestamp_tag_transcript(transcript: Transcript, source_duration: float) -> str:
    """Turn the transcript into chunks labelled by their start second so the
    LLM can cite real timestamps. Falls back to sentence-level chunks when
    no word timings are available."""
    if transcript.words:
        # 15-second bins, one line each.
        bins: dict[int, list[str]] = {}
        for w in transcript.words:
            bin_key = int(w.start // 15) * 15
            bins.setdefault(bin_key, []).append(w.text)
        lines = [f"[{k}s] {' '.join(tokens)}" for k, tokens in sorted(bins.items())]
        return "\n".join(lines)
    # No word timings — fall back to the full text with a single header.
    return f"[0s] {transcript.full_text}"


# ──────────────────────────────────────────────────────────────────────────
# Stage 4 — cut a segment with ffmpeg (lossless re-encode for frame accuracy)
# ──────────────────────────────────────────────────────────────────────────

def cut_segment(source_path: str, start: float, end: float, out_path: str) -> str:
    """
    Extract [start, end) from source into `out_path`. We do a full re-encode
    (not stream-copy) because stream-copy snaps to the nearest keyframe and
    we need frame accuracy for good hook timing.

    Returns the output path on success, raises on ffmpeg failure.
    """
    duration = max(0.1, end - start)
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start:.3f}",
        "-i", source_path,
        "-t", f"{duration:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        out_path,
    ]
    _run_ffmpeg(cmd, f"cut_segment({start:.1f}-{end:.1f})")
    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Stage 5 — reframe to vertical (9:16, 1:1, or 4:5)
# ──────────────────────────────────────────────────────────────────────────

async def reframe_to_vertical(
    clip_path: str,
    out_path: str,
    aspect_ratio: str = "9:16",
) -> str:
    """
    Convert a horizontal clip into the target aspect ratio. When
    SIEVE_API_KEY is set we offload to Sieve's face-aware reframer which
    tracks the subject; otherwise we do a dumb centre-crop with ffmpeg,
    which still produces usable output for most talking-head content.
    """
    if settings.SIEVE_API_KEY:
        try:
            return await _reframe_with_sieve(clip_path, out_path, aspect_ratio)
        except Exception as e:
            logger.warning(f"Sieve reframe failed, falling back to centre-crop: {e}")

    return _reframe_with_ffmpeg(clip_path, out_path, aspect_ratio)


def _reframe_with_ffmpeg(clip_path: str, out_path: str, aspect_ratio: str) -> str:
    """
    Dumb but dependable: crop the middle to the target ratio.
    Works well for centred talking heads, less so for wide shots where
    the subject is off-centre — Sieve's tracker is the upgrade path.
    """
    target_w_ratio, target_h_ratio = _parse_ratio(aspect_ratio)
    # Use ffmpeg's filter language: scale + crop with expression that picks
    # the largest centred rectangle matching the ratio.
    # ih*tw/th clamped against iw handles both horizontal (normal) and
    # vertical source videos without tripping on weird dimensions.
    crop_expr = (
        f"crop=w='min(iw,ih*{target_w_ratio}/{target_h_ratio})':"
        f"h='min(ih,iw*{target_h_ratio}/{target_w_ratio})'"
    )
    # Then scale to a standard output size for each ratio.
    out_size = {
        (9, 16): "1080:1920",
        (1, 1): "1080:1080",
        (4, 5): "1080:1350",
    }.get((target_w_ratio, target_h_ratio), "1080:1920")

    cmd = [
        "ffmpeg", "-y",
        "-i", clip_path,
        "-vf", f"{crop_expr},scale={out_size},setsar=1",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "copy",
        "-movflags", "+faststart",
        out_path,
    ]
    _run_ffmpeg(cmd, f"reframe_centre({aspect_ratio})")
    return out_path


async def _reframe_with_sieve(clip_path: str, out_path: str, aspect_ratio: str) -> str:
    """
    Call Sieve's face-aware reframe function. Sieve is an async pipeline
    service — we push a job, poll until done, download the result.

    Docs: https://docs.sievedata.com/reference/functions
    This targets their `autocrop` function (name may evolve — the fallback
    keeps us safe either way).
    """
    import httpx as _httpx
    api_key = settings.SIEVE_API_KEY
    headers = {"X-API-Key": api_key}

    async with _httpx.AsyncClient(timeout=_httpx.Timeout(60.0, connect=10.0)) as client:
        # 1. Upload the file. Sieve expects multipart upload to /upload/.
        with open(clip_path, "rb") as fh:
            upload = await client.post(
                "https://mango.sievedata.com/v2/upload",
                headers=headers,
                files={"file": (os.path.basename(clip_path), fh, "video/mp4")},
            )
        upload.raise_for_status()
        file_url = upload.json().get("url") or upload.json().get("file", {}).get("url")
        if not file_url:
            raise RuntimeError(f"Sieve upload returned no URL: {upload.text}")

        # 2. Launch the autocrop job.
        job = await client.post(
            "https://mango.sievedata.com/v2/push",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "function": "sieve/autocrop",
                "inputs": {
                    "file": {"url": file_url},
                    "aspect_ratio": aspect_ratio,
                },
            },
        )
        job.raise_for_status()
        job_id = job.json().get("id")
        if not job_id:
            raise RuntimeError(f"Sieve push returned no job id: {job.text}")

        # 3. Poll.
        result_url: Optional[str] = None
        deadline = time.time() + 600  # 10 min cap
        while time.time() < deadline:
            poll = await client.get(
                f"https://mango.sievedata.com/v2/jobs/{job_id}",
                headers=headers,
            )
            poll.raise_for_status()
            status = poll.json().get("status")
            if status == "finished":
                outputs = poll.json().get("outputs") or []
                if outputs and outputs[0].get("data", {}).get("url"):
                    result_url = outputs[0]["data"]["url"]
                    break
                raise RuntimeError(f"Sieve finished but no output URL: {poll.text}")
            if status in ("error", "failed", "cancelled"):
                raise RuntimeError(f"Sieve job {status}: {poll.text}")
            await asyncio.sleep(3)
        if not result_url:
            raise RuntimeError("Sieve reframe timed out after 10 minutes.")

        # 4. Download the reframed file.
        async with client.stream("GET", result_url) as r:
            r.raise_for_status()
            with open(out_path, "wb") as out:
                async for chunk in r.aiter_bytes():
                    out.write(chunk)

    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Stage 6 — render word-level karaoke captions and burn them in
# ──────────────────────────────────────────────────────────────────────────

def render_karaoke_subs(
    clip_path: str,
    transcript: Transcript,
    clip_start: float,
    clip_end: float,
    out_path: str,
    style: str = "karaoke",
) -> str:
    """
    Burn word-by-word karaoke-style subtitles onto the clip. We generate
    an ASS subtitle file with per-word timing (highlight advances one word
    at a time) and let ffmpeg's libass renderer do the typography.

    `style`:
        - "karaoke" → one word highlighted at a time, 3-5 words visible
        - "block"   → full phrase displayed on each line, no highlight
        - "off"     → skip burn-in entirely, return clip_path unchanged
    """
    if style == "off":
        # Nothing to do — caller should treat clip_path as the final artefact.
        shutil.copyfile(clip_path, out_path)
        return out_path

    # Filter transcript words down to the ones that fall inside the clip
    # window and shift their timings to be relative to the clip.
    local_words: list[Word] = []
    for w in transcript.words:
        if w.end <= clip_start or w.start >= clip_end:
            continue
        local_words.append(Word(
            text=w.text,
            start=max(0.0, w.start - clip_start),
            end=min(clip_end - clip_start, w.end - clip_start),
        ))

    if not local_words:
        # No word data available for this clip window. Either the transcript
        # was empty or the fallback only gave us coarse timings that didn't
        # overlap. Skip burn-in, return the original.
        shutil.copyfile(clip_path, out_path)
        return out_path

    # Build the ASS subtitle file.
    ass_path = out_path + ".ass"
    ass_content = _build_ass_file(local_words, style=style)
    with open(ass_path, "w", encoding="utf-8") as fh:
        fh.write(ass_content)

    # Burn subtitles in with ffmpeg. We use the `ass` filter so we get
    # full-quality libass rendering (smooth highlight transitions, proper
    # font kerning). The trailing comma+escape is important — ffmpeg
    # filter paths need forward slashes escaped on certain platforms.
    safe_ass = ass_path.replace(":", r"\:")
    cmd = [
        "ffmpeg", "-y",
        "-i", clip_path,
        "-vf", f"ass='{safe_ass}'",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "copy",
        "-movflags", "+faststart",
        out_path,
    ]
    try:
        _run_ffmpeg(cmd, "burn_subs")
    finally:
        # Clean the ASS file — it's been baked into the video now.
        try:
            os.remove(ass_path)
        except OSError:
            pass
    return out_path


def _build_ass_file(words: list[Word], style: str) -> str:
    """
    Emit an .ass file with one dialogue line per visible phrase. For
    karaoke style we group words into 3-word windows and emit a line per
    window; within the line we use {\\k} tags so libass highlights one
    word at a time.
    """
    # Header + style. The style values are tuned for 1080x1920 output —
    # readable on mobile, bold, centred bottom-third.
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,78,&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,5,2,2,80,80,320,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    lines: list[str] = [header]

    if style == "block":
        # Chunk into phrases of ~6 words each and show as a static line per chunk.
        chunk_size = 6
        for i in range(0, len(words), chunk_size):
            chunk = words[i:i + chunk_size]
            if not chunk:
                continue
            start_ts = _format_ass_time(chunk[0].start)
            end_ts = _format_ass_time(chunk[-1].end)
            text = " ".join(_ass_escape(w.text) for w in chunk)
            lines.append(
                f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,0,,{text}\n"
            )
        return "".join(lines)

    # Karaoke: group words into rolling windows of 3-4 words. For each
    # window, emit one dialogue line covering the span of those words, with
    # {\k<cs>} tags per word so the highlight advances word-by-word.
    window = 3
    i = 0
    while i < len(words):
        chunk = words[i:i + window]
        if not chunk:
            break
        start_ts = _format_ass_time(chunk[0].start)
        end_ts = _format_ass_time(chunk[-1].end)

        text_parts: list[str] = []
        for w in chunk:
            duration_cs = max(1, int(round((w.end - w.start) * 100)))  # centiseconds
            text_parts.append(f"{{\\k{duration_cs}}}{_ass_escape(w.text)}")
        text = " ".join(text_parts)

        lines.append(
            f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,0,,{text}\n"
        )
        i += window
    return "".join(lines)


def _format_ass_time(seconds: float) -> str:
    """Convert seconds to ASS timecode: h:mm:ss.cs (centiseconds, not ms)."""
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs == 100:  # rounding edge case
        cs = 0
        s += 1
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_escape(text: str) -> str:
    """Escape characters libass treats specially inside a Dialogue text."""
    # Braces and backslashes need escaping; most other punctuation is fine.
    return (
        text.replace("\\", "\\\\")
            .replace("{", "\\{")
            .replace("}", "\\}")
            .replace("\n", " ")
    )


# ──────────────────────────────────────────────────────────────────────────
# Stage 7 — extract a poster-frame thumbnail
# ──────────────────────────────────────────────────────────────────────────

def extract_thumbnail(clip_path: str, out_path: str, offset_seconds: float = 0.5) -> str:
    """
    Grab a frame from near the start of the clip to use as the preview
    thumbnail in the UI. Offset a bit past zero so we don't get a black
    flash frame.
    """
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{offset_seconds:.3f}",
        "-i", clip_path,
        "-frames:v", "1",
        "-q:v", "2",
        out_path,
    ]
    _run_ffmpeg(cmd, "extract_thumbnail")
    return out_path


# ──────────────────────────────────────────────────────────────────────────
# Stage 8 — upload outputs to Supabase Storage
# ──────────────────────────────────────────────────────────────────────────

def upload_to_storage(
    local_path: str,
    remote_path: str,
    content_type: str,
    bucket: str = "avatars",
) -> str:
    """
    Upload a local file to Supabase Storage under `remote_path` in the
    given bucket, and return the public URL.

    We keep using the `avatars` bucket for now to match the rest of the
    app's convention. If/when we migrate to Cloudflare R2 this function
    is the one we swap — everything else just passes paths around.
    """
    with open(local_path, "rb") as fh:
        data = fh.read()
    supabase.storage.from_(bucket).upload(
        remote_path,
        data,
        {"content-type": content_type, "upsert": "true"},
    )
    return supabase.storage.from_(bucket).get_public_url(remote_path)


# ──────────────────────────────────────────────────────────────────────────
# Shared utilities
# ──────────────────────────────────────────────────────────────────────────

def _run_ffmpeg(cmd: list[str], label: str) -> None:
    """Execute an ffmpeg command and raise on non-zero exit with useful log."""
    logger.debug(f"ffmpeg [{label}]: {shlex.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1200)
    if result.returncode != 0:
        # ffmpeg logs useful detail to stderr; surface the tail so the
        # orchestrator can persist it on the job row.
        tail = "\n".join((result.stderr or "").splitlines()[-20:])
        raise RuntimeError(f"ffmpeg {label} failed: {tail}")


def _parse_ratio(aspect: str) -> tuple[int, int]:
    """Turn '9:16' into (9, 16). Defaults to 9:16 on bad input."""
    m = re.match(r"^\s*(\d+)\s*:\s*(\d+)\s*$", aspect or "")
    if not m:
        return (9, 16)
    return (int(m.group(1)), int(m.group(2)))


def _coerce_float(v: Any) -> Optional[float]:
    """Best-effort float conversion — returns None when the value can't be parsed."""
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _extract_json(text: str) -> dict:
    """
    Parse JSON from an LLM response that might be wrapped in markdown
    fences or have trailing prose. Never raises — returns {} on failure.
    """
    if not text:
        return {}
    # Fast path.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip markdown fences.
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Pluck the first {...} block.
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {}
