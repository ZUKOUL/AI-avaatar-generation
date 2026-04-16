-- AI Video Generator (Phase 2) — phrase → vertical video.
-- Input is a single sentence from the user ("un ananas qui parle des
-- vitamines", "timelapse construction maison", etc.) and we return a
-- fully-rendered short with scene images, voice-over, subtitles, and
-- optional image-to-video motion.
-- Run this in Supabase Dashboard → SQL Editor after 008_video_clips.sql
-- (auto-migration runner will pick it up on the next EC2 boot).

-- ─── Table: ai_video_jobs ──────────────────────────────────────────────────
-- One row per "generate a video from this phrase" request. Status machine:
--   queued → scripting → storyboarding → rendering_images →
--   animating → voicing → assembling → completed | failed
CREATE TABLE IF NOT EXISTS public.ai_video_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- User input --------------------------------------------------------------
  prompt          text NOT NULL,                        -- the one-liner from the user
  mode            text NOT NULL DEFAULT 'slideshow'     -- 'slideshow' | 'motion'
                  CHECK (mode IN ('slideshow', 'motion')),
  duration_seconds integer NOT NULL DEFAULT 30
                  CHECK (duration_seconds BETWEEN 10 AND 90),
  aspect_ratio    text NOT NULL DEFAULT '9:16'
                  CHECK (aspect_ratio IN ('9:16', '1:1', '16:9', '4:5')),
  language        text NOT NULL DEFAULT 'auto',         -- 'auto' | ISO-639-1
  voice_enabled   boolean NOT NULL DEFAULT true,
  voice_id        text,                                 -- ElevenLabs voice id (optional override)
  subtitle_style  text NOT NULL DEFAULT 'karaoke'       -- 'karaoke' | 'block' | 'off'
                  CHECK (subtitle_style IN ('karaoke', 'block', 'off')),
  tone            text,                                 -- 'energetic' | 'storytelling' | 'educational' | ...

  -- Script / storyboard (filled in as the pipeline progresses) -----------
  script_text     text,
  hook            text,                                 -- the opening 3-second attention grabber
  scene_count     integer,
  detected_lang   text,                                 -- what we actually used (from 'auto')

  -- Output links (final artefacts) --------------------------------------
  video_url       text,
  storage_path    text,
  thumbnail_url   text,
  thumbnail_path  text,

  -- Status machine + bookkeeping ----------------------------------------
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','scripting','storyboarding',
                                    'rendering_images','animating','voicing',
                                    'assembling','completed','failed')),
  progress        integer NOT NULL DEFAULT 0,           -- 0..100 for the UI
  error_message   text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_user_id ON public.ai_video_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_status  ON public.ai_video_jobs (status);
CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_created ON public.ai_video_jobs (created_at DESC);

COMMENT ON TABLE public.ai_video_jobs IS
  'AI Video Generator jobs: one phrase → fully-rendered short video.';

-- Reuses set_updated_at() created by 001_initial_schema.
DROP TRIGGER IF EXISTS ai_video_jobs_updated_at ON public.ai_video_jobs;
CREATE TRIGGER ai_video_jobs_updated_at
  BEFORE UPDATE ON public.ai_video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── Table: ai_video_scenes ────────────────────────────────────────────────
-- Per-scene artefacts. One row per storyboard scene. Lets the UI stream
-- previews as each image / animation finishes instead of hiding everything
-- until the final video is assembled.
CREATE TABLE IF NOT EXISTS public.ai_video_scenes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES public.ai_video_jobs(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  scene_index     integer NOT NULL,                    -- 0-based order
  duration_seconds numeric NOT NULL,                   -- how long this scene plays
  image_prompt    text NOT NULL,                       -- prompt fed to Gemini 3 Pro Image
  motion_prompt   text,                                -- optional; what motion should happen
  voiceover_text  text,                                -- the script line spoken over this scene
  text_overlay    text,                                -- optional headline on the image

  -- Artefacts ---------------------------------------------------------------
  image_url       text,
  image_path      text,                                -- storage path inside the bucket
  clip_url        text,                                -- animated segment (if motion mode)
  clip_path       text,

  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','rendering_image','animating','done','failed')),
  error_message   text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_video_scenes_job_id  ON public.ai_video_scenes (job_id);
CREATE INDEX IF NOT EXISTS idx_ai_video_scenes_user_id ON public.ai_video_scenes (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_video_scenes_job_idx ON public.ai_video_scenes (job_id, scene_index);

COMMENT ON TABLE public.ai_video_scenes IS
  'Per-scene artefacts (image + optional animated clip) for AI video jobs.';

DROP TRIGGER IF EXISTS ai_video_scenes_updated_at ON public.ai_video_scenes;
CREATE TRIGGER ai_video_scenes_updated_at
  BEFORE UPDATE ON public.ai_video_scenes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
