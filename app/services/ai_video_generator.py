"""
AI Video Generator orchestrator.

Drives the full "phrase → rendered vertical video" pipeline. Called as a
FastAPI BackgroundTask from `/ai-videos/generate`, writes progress to the
`ai_video_jobs` and `ai_video_scenes` tables so the frontend can stream
state in.

Pipeline timing (typical 30s output):
    scripting        (~2s)    Gemini 2.5 Pro
    storyboarding    (~4s)    Gemini 2.5 Pro
    rendering_images (~30s)   6× Gemini 3 Pro Image (parallel)
    animating        slideshow mode: ~10s    (ffmpeg Ken Burns)
                     motion mode:    ~120s   (6× Kling 2.1)
    voicing          (~8s)    ElevenLabs TTS
    assembling       (~5s)    ffmpeg concat + mux + subs
    TOTAL            slideshow ≈ 60-70s       motion ≈ 2-3 min

Design choices:
    - Per-scene rows are inserted up-front in status=pending so the UI
      can render skeleton tiles before any image is ready.
    - Images are generated in PARALLEL (asyncio.gather) — that's where
      most of the time savings come from. If one scene fails we keep
      going; the scene gets marked failed, the rest still produce output.
    - Animation (slideshow OR motion) is sequential for motion mode so we
      don't burn a big burst of Replicate credits on a failing job. For
      slideshow it's trivially fast so we also keep it sequential.
    - Voice-over runs on the FULL script once, not per scene, because
      TTS prosody across sentence boundaries is much better that way.
    - Final subtitle burn happens AFTER voice is muxed so the subtitle
      track aligns with the real audio.
"""
from __future__ import annotations

import asyncio
import time
import logging
import os
import shutil
import tempfile
import traceback
import uuid
from typing import Any, Optional

from app.core.supabase import supabase
from app.services.ai_video_pipeline import (
    Scene,
    Script,
    Storyboard,
    align_scenes_to_audio,
    animate_scene_motion,
    animate_scene_slideshow,
    assemble_video,
    build_transcript_from_voice,
    burn_final_subtitles,
    generate_keyframe,
    generate_script,
    generate_storyboard,
    generate_voiceover,
)
from app.services.niche_registry import effective_reference_sources, get_niche
from app.services.video_pipeline import extract_thumbnail, upload_to_storage

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────
# DB helpers — thin wrappers so the status machine stays legible below.
# ──────────────────────────────────────────────────────────────────────────

def _mark_job(job_id: str, **fields) -> None:
    if not fields:
        return
    try:
        supabase.table("ai_video_jobs").update(fields).eq("id", job_id).execute()
    except Exception as e:
        logger.warning(f"ai_video_jobs update failed for {job_id}: {e}")


def _mark_scene(scene_id: str, **fields) -> None:
    if not fields:
        return
    try:
        supabase.table("ai_video_scenes").update(fields).eq("id", scene_id).execute()
    except Exception as e:
        logger.warning(f"ai_video_scenes update failed for {scene_id}: {e}")


def _fail_job(job_id: str, message: str) -> None:
    logger.error(f"ai_video_job {job_id} failed: {message}")
    _mark_job(job_id, status="failed", error_message=message[:1000], progress=100)


# ──────────────────────────────────────────────────────────────────────────
# Public entry point
# ──────────────────────────────────────────────────────────────────────────

async def run_ai_video_job(job_id: str) -> None:
    """
    Run the full pipeline for a single ai_video_jobs row. Called as a
    BackgroundTask from the /ai-videos/generate endpoint.

    Never raises — swallows + persists its own errors.
    """
    try:
        res = (
            supabase.table("ai_video_jobs")
            .select("*")
            .eq("id", job_id)
            .maybe_single()
            .execute()
        )
    except Exception as e:
        logger.error(f"Could not load ai_video_job {job_id}: {e}")
        return
    job = getattr(res, "data", None) if res else None
    if not job:
        logger.error(f"ai_video_job {job_id} not found — aborting pipeline")
        return

    prompt: str = job["prompt"]
    mode: str = job.get("mode") or "slideshow"
    duration_seconds: int = int(job.get("duration_seconds") or 30)
    aspect_ratio: str = job.get("aspect_ratio") or "9:16"
    language: str = job.get("language") or "auto"
    tone: Optional[str] = job.get("tone")
    voice_enabled: bool = bool(job.get("voice_enabled", True))
    voice_id: Optional[str] = job.get("voice_id")
    subtitle_style: str = job.get("subtitle_style") or "karaoke"
    # Motion provider the user picked (only meaningful for mode=motion).
    # Defaults to Kling when the column is null for legacy / slideshow
    # jobs — keeps old rows backward compatible.
    motion_model: str = (job.get("motion_model") or "kling").strip().lower()
    user_id: str = str(job["user_id"])

    # Niche-preset style parameters (nullable — only set for jobs created
    # via /ai-videos/generate-from-niche). They steer the script + image
    # prompts so the output visually + narratively matches a channel's
    # signature.
    style_instructions: Optional[str] = job.get("style_instructions")
    visual_style: Optional[str] = job.get("visual_style")

    # Resolve the niche's reference image list at runtime (not
    # snapshotted on the job row — references are stable per niche and
    # kept light). These directly condition Gemini 3 Pro Image so
    # character design stays locked to the channel's aesthetic — this is
    # what fixes the "stone statue instead of claymation character"
    # drift. Missing / misconfigured references fall back to text-only
    # conditioning with a warning.
    niche_slug_from_job: Optional[str] = job.get("niche_slug")
    niche = get_niche(niche_slug_from_job) if niche_slug_from_job else None
    # Merge code-defined refs + anything the user uploaded via the
    # /niches/{slug}/references dashboard UI. Uploaded images appear
    # after the static ones so code defaults take priority.
    reference_image_sources = (
        effective_reference_sources(niche) if niche else []
    )

    workdir = tempfile.mkdtemp(prefix=f"aivideo_{job_id[:8]}_")

    try:
        # ── Stage 1: script ─────────────────────────────────────────────
        _mark_job(job_id, status="scripting", progress=5)
        script = await generate_script(
            prompt=prompt,
            duration_seconds=duration_seconds,
            language=language,
            tone=tone,
            style_instructions=style_instructions,
        )
        _mark_job(
            job_id,
            script_text=script.full_text[:5000],
            hook=script.hook[:300] if script.hook else None,
            detected_lang=script.language,
            progress=15,
        )

        # ── Stage 2: storyboard ────────────────────────────────────────
        _mark_job(job_id, status="storyboarding", progress=20)
        storyboard = await generate_storyboard(
            script=script,
            prompt=prompt,
            total_seconds=duration_seconds,
            aspect_ratio=aspect_ratio,
            visual_style=visual_style,
            style_instructions=style_instructions,
        )
        if not storyboard.scenes:
            _fail_job(job_id, "Storyboard generation returned no scenes.")
            return

        # Persist per-scene rows so the UI can show skeleton tiles right away.
        scene_rows = []
        for s in storyboard.scenes:
            scene_rows.append({
                "job_id": job_id,
                "user_id": user_id,
                "scene_index": s.index,
                "duration_seconds": round(s.duration_seconds, 2),
                "image_prompt": s.image_prompt[:1500],
                "motion_prompt": s.motion_prompt[:500] if s.motion_prompt else None,
                "voiceover_text": s.voiceover_text[:1000] if s.voiceover_text else None,
                "text_overlay": s.text_overlay[:60] if s.text_overlay else None,
                "status": "pending",
            })
        try:
            ins = supabase.table("ai_video_scenes").insert(scene_rows).execute()
            inserted = ins.data or []
        except Exception as e:
            _fail_job(job_id, f"Could not persist storyboard scenes: {e}")
            return
        _mark_job(job_id, scene_count=len(inserted), progress=30)

        # Map scene_index → row id so we can update per-scene status.
        scene_id_by_index: dict[int, str] = {
            int(r["scene_index"]): str(r["id"]) for r in inserted
        }

        # ── Stage 3: render keyframes (parallel) ───────────────────────
        _mark_job(job_id, status="rendering_images", progress=35)
        keyframe_paths: dict[int, str] = {}
        image_uploads: dict[int, dict[str, str]] = {}

        async def _render_one(scene: Scene) -> None:
            sid = scene_id_by_index.get(scene.index)
            if not sid:
                return
            _mark_scene(sid, status="rendering_image")
            out = os.path.join(workdir, f"scene_{scene.index:02d}_{uuid.uuid4().hex[:6]}.png")
            try:
                await generate_keyframe(
                    scene,
                    aspect_ratio=aspect_ratio,
                    out_path=out,
                    reference_image_sources=reference_image_sources,
                )
            except Exception as e:
                logger.warning(f"Scene {scene.index} keyframe failed: {e}")
                _mark_scene(sid, status="failed", error_message=str(e)[:500])
                return
            keyframe_paths[scene.index] = out

            # Upload the keyframe so the UI can preview it mid-job.
            try:
                remote_path = f"ai_videos/{user_id}/{job_id}/scene_{scene.index:02d}.png"
                url = await asyncio.to_thread(
                    upload_to_storage, out, remote_path, "image/png"
                )
                image_uploads[scene.index] = {"url": url, "path": remote_path}
                _mark_scene(sid, image_url=url, image_path=remote_path)
            except Exception as e:
                # Upload failure isn't fatal — we can still assemble from local.
                logger.warning(f"Scene {scene.index} image upload failed: {e}")

        await asyncio.gather(*(_render_one(s) for s in storyboard.scenes))

        # If EVERY scene's keyframe failed we have no way to produce output.
        if not keyframe_paths:
            _fail_job(job_id, "All keyframes failed to render.")
            return

        # ── Stage 4b: VOICE-OVER FIRST, then alignment ──────────────────
        # The voice is rendered BEFORE animation on purpose. This lets us
        # Whisper-align the real audio back onto the storyboard so each
        # scene's duration matches the exact moment its voiceover line is
        # spoken. Without this, scenes drift out of sync with the audio —
        # the #1 bug in AI-generated shorts (visual shows a child alone
        # while the narrator has already moved on to "the parents leave").
        voice_path: Optional[str] = None
        aligned_transcript = None
        if voice_enabled and script.full_text.strip():
            _mark_job(job_id, status="voicing", progress=58)
            voice_out = os.path.join(workdir, "voice.mp3")
            voice_path = await generate_voiceover(
                script_text=script.full_text,
                out_path=voice_out,
                voice_id=voice_id,
                language=script.language,
            )
            if voice_path is None:
                logger.info(f"Job {job_id} — no voice-over (key missing or TTS failed), continuing silent.")

            # Align every scene's duration to the real spoken audio window.
            # This is what makes A/V sync tight. Returns the transcript so
            # we can reuse it for subtitle burn-in at the end (saves a
            # second Whisper call).
            storyboard, aligned_transcript = await align_scenes_to_audio(
                storyboard, voice_path, script.full_text,
            )
            _mark_job(job_id, progress=65)

        # ── Stage 4c: animate each scene (slideshow or motion) ──────────
        # Scene durations below are the ALIGNED ones when a voice track
        # was produced — so each animated clip plays for exactly the time
        # its voice line is being spoken.
        #
        # Robustness layers (learned the hard way from real Kling hangs):
        #   1. Hard WALL-TIME CAP per scene via asyncio.wait_for. Even
        #      if the underlying Kling poll + download + ffmpeg chain
        #      goes rogue, the coroutine is cancelled at the budget and
        #      the pipeline moves on. 360 s for motion (covers upload +
        #      Kling + download + trim), 120 s for slideshow (trivial).
        #   2. Early abort after N consecutive scene failures — when
        #      Replicate is genuinely down, every scene will fail with
        #      the same symptom. Don't make the user wait 4 × 6 min
        #      only to fail at the end. 2 consecutive misses = job
        #      fails now, remaining scenes skipped.
        #   3. Per-scene elapsed-time logging so we can see in the
        #      container logs WHICH step is slow when things go wrong.
        #
        # Progress still advances per-scene (70 → 85) on both success
        # and failure paths so the UI never sits at a stale %.
        _mark_job(job_id, status="animating", progress=70)
        clip_paths: dict[int, str] = {}
        total_scenes = max(1, len(storyboard.scenes))
        consecutive_failures = 0
        MAX_CONSECUTIVE_FAILURES = 2
        SCENE_TIMEOUT_MOTION_S = 360     # 6 min (incl. all sub-steps)
        SCENE_TIMEOUT_SLIDESHOW_S = 120   # 2 min, ffmpeg-only

        for idx, scene in enumerate(storyboard.scenes):
            kf = keyframe_paths.get(scene.index)
            if not kf:
                continue   # scene's keyframe failed earlier
            sid = scene_id_by_index.get(scene.index)
            if sid:
                _mark_scene(sid, status="animating")
            clip_out = os.path.join(workdir, f"clip_{scene.index:02d}.mp4")

            scene_start_ts = time.time()
            logger.info(
                f"[ai_video {job_id}] scene {scene.index} — animating "
                f"({mode}, target {scene.duration_seconds:.1f}s)"
            )
            scene_failed = False

            try:
                if mode == "motion":
                    await asyncio.wait_for(
                        animate_scene_motion(
                            keyframe_path=kf,
                            motion_prompt=scene.motion_prompt or "subtle camera push-in",
                            duration_seconds=scene.duration_seconds,
                            out_path=clip_out,
                            motion_model=motion_model,
                        ),
                        timeout=SCENE_TIMEOUT_MOTION_S,
                    )
                else:
                    await asyncio.wait_for(
                        asyncio.to_thread(
                            animate_scene_slideshow,
                            kf, scene.duration_seconds, clip_out, aspect_ratio,
                        ),
                        timeout=SCENE_TIMEOUT_SLIDESHOW_S,
                    )
            except asyncio.TimeoutError:
                elapsed = time.time() - scene_start_ts
                msg = (
                    f"Scene animation exceeded the wall-time cap "
                    f"({elapsed:.0f}s, mode={mode}). Likely Replicate / "
                    f"Supabase / ffmpeg hung. Skipping this scene."
                )
                logger.warning(f"[ai_video {job_id}] scene {scene.index}: {msg}")
                if sid:
                    _mark_scene(sid, status="failed", error_message=msg[:500])
                scene_failed = True
            except Exception as e:
                elapsed = time.time() - scene_start_ts
                logger.warning(
                    f"[ai_video {job_id}] scene {scene.index} failed after "
                    f"{elapsed:.0f}s: {e}"
                )
                if sid:
                    _mark_scene(sid, status="failed", error_message=str(e)[:500])
                scene_failed = True

            if scene_failed:
                consecutive_failures += 1
                # Progress still advances so the user doesn't think we hung.
                scene_progress = 70 + int(15 * (idx + 1) / total_scenes)
                _mark_job(job_id, progress=min(85, scene_progress))

                # If several scenes in a row have blown up, the provider
                # is almost certainly broken for this job — bail out
                # instead of wasting the user's time on 4 more timeouts.
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    logger.warning(
                        f"[ai_video {job_id}] aborting after "
                        f"{consecutive_failures} consecutive scene failures "
                        f"— remaining scenes skipped."
                    )
                    break
                continue

            # Upload the animated clip if motion mode — saves render time on
            # re-open and lets the UI show per-scene playback.
            if mode == "motion":
                try:
                    remote_clip_path = f"ai_videos/{user_id}/{job_id}/clip_{scene.index:02d}.mp4"
                    clip_url = await asyncio.to_thread(
                        upload_to_storage, clip_out, remote_clip_path, "video/mp4"
                    )
                    if sid:
                        _mark_scene(sid, clip_url=clip_url, clip_path=remote_clip_path, status="done")
                except Exception as e:
                    logger.warning(f"Scene {scene.index} clip upload failed: {e}")
                    if sid:
                        _mark_scene(sid, status="done")
            else:
                if sid:
                    _mark_scene(sid, status="done")

            clip_paths[scene.index] = clip_out

            # Successful scene → reset the consecutive-failure counter so
            # one stuck scene in the middle of a batch doesn't trigger the
            # fail-fast abort on the next hiccup. Log actual elapsed time
            # so we can tune the timeout budgets from real data.
            consecutive_failures = 0
            elapsed = time.time() - scene_start_ts
            logger.info(
                f"[ai_video {job_id}] scene {scene.index} done in "
                f"{elapsed:.0f}s ({mode})"
            )

            # Bump overall progress so the bar tracks real animation
            # advancement (70 → 85 across the batch).
            scene_progress = 70 + int(15 * (idx + 1) / total_scenes)
            _mark_job(job_id, progress=min(85, scene_progress))

        if not clip_paths:
            _fail_job(job_id, "All scenes failed to animate.")
            return

        # Order clips by scene_index so the concat is in sequence.
        ordered_clips = [clip_paths[i] for i in sorted(clip_paths.keys())]

        # ── Stage 5: assemble ─────────────────────────────────────────
        _mark_job(job_id, status="assembling", progress=85)
        assembled_path = os.path.join(workdir, "assembled.mp4")
        try:
            await asyncio.to_thread(
                assemble_video,
                ordered_clips, voice_path, assembled_path,
            )
        except Exception as e:
            _fail_job(job_id, f"Final assembly failed: {e}")
            return

        # Subtitles (optional) --------------------------------------------------
        # Reuse the Whisper transcript from the alignment step if we have
        # one — otherwise fall back to a fresh call (and ultimately to
        # estimated timings if no Whisper provider is configured).
        final_path = assembled_path
        if subtitle_style != "off":
            try:
                transcript = aligned_transcript or await build_transcript_from_voice(
                    voice_path or "", script.full_text
                )
                subbed_path = os.path.join(workdir, "subbed.mp4")
                await asyncio.to_thread(
                    burn_final_subtitles,
                    assembled_path, transcript,
                    storyboard.total_duration,
                    subbed_path,
                    subtitle_style,
                )
                final_path = subbed_path
            except Exception as e:
                # Subtitle burn is best-effort — keep the video.
                logger.warning(f"Subtitle burn failed, shipping without: {e}")

        # Thumbnail ------------------------------------------------------------
        thumb_path = os.path.join(workdir, "thumb.jpg")
        try:
            await asyncio.to_thread(extract_thumbnail, final_path, thumb_path, 0.5)
        except Exception as e:
            logger.warning(f"Thumbnail extraction failed: {e}")
            thumb_path = ""

        # ── Stage 7: upload final ─────────────────────────────────────
        _mark_job(job_id, progress=95)
        video_remote = f"ai_videos/{user_id}/{job_id}/final.mp4"
        video_url = await asyncio.to_thread(
            upload_to_storage, final_path, video_remote, "video/mp4"
        )
        thumb_url: Optional[str] = None
        thumb_remote: Optional[str] = None
        if thumb_path and os.path.isfile(thumb_path):
            thumb_remote = f"ai_videos/{user_id}/{job_id}/thumb.jpg"
            thumb_url = await asyncio.to_thread(
                upload_to_storage, thumb_path, thumb_remote, "image/jpeg"
            )

        _mark_job(
            job_id,
            status="completed",
            progress=100,
            video_url=video_url,
            storage_path=video_remote,
            thumbnail_url=thumb_url,
            thumbnail_path=thumb_remote,
            error_message=None,
        )

    except Exception as e:
        tb = traceback.format_exc()
        logger.error(f"ai_video_job {job_id} crashed:\n{tb}")
        _fail_job(job_id, f"{type(e).__name__}: {e}")
    finally:
        try:
            shutil.rmtree(workdir, ignore_errors=True)
        except Exception:
            pass
