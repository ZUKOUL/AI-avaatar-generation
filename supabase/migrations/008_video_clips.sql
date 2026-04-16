-- Auto-Clip feature — turn a long-form YouTube/podcast URL into N viral
-- vertical shorts with burned-in word-level subtitles.
-- Run this in Supabase Dashboard → SQL Editor after 007_ad_metadata.sql
-- (auto-migration runner will pick it up on the next EC2 boot).

-- ─── Table: clip_jobs ──────────────────────────────────────────────────────
-- One row per "give me clips from this URL" request. Status flows:
--   queued → downloading → transcribing → detecting → cutting → completed|failed
-- We keep jobs around after completion so the frontend can show progress for
-- polling clients and so failures can be retried/debugged.
CREATE TABLE IF NOT EXISTS public.clip_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_url      text NOT NULL,                         -- original YouTube URL
  source_title    text,                                  -- video title (filled once we have it)
  source_duration integer,                               -- seconds; filled once downloaded
  language        text,                                  -- detected language (ISO-639-1)
  requested_count integer NOT NULL DEFAULT 5,            -- how many clips user asked for
  aspect_ratio    text NOT NULL DEFAULT '9:16',          -- '9:16' | '1:1' | '4:5'
  subtitle_style  text NOT NULL DEFAULT 'karaoke',       -- 'karaoke' | 'block' | 'off'
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','downloading','transcribing',
                                    'detecting','cutting','completed','failed')),
  progress        integer NOT NULL DEFAULT 0,            -- 0..100, for the UI
  error_message   text,                                  -- populated on failure
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clip_jobs_user_id   ON public.clip_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_clip_jobs_status    ON public.clip_jobs (status);
CREATE INDEX IF NOT EXISTS idx_clip_jobs_created   ON public.clip_jobs (created_at DESC);

COMMENT ON TABLE public.clip_jobs IS
  'Auto-Clip jobs: one long-form URL → N vertical shorts. Async pipeline.';

-- Reuse the existing set_updated_at() function created by 001_initial_schema.
DROP TRIGGER IF EXISTS clip_jobs_updated_at ON public.clip_jobs;
CREATE TRIGGER clip_jobs_updated_at
  BEFORE UPDATE ON public.clip_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── Table: generated_clips ────────────────────────────────────────────────
-- One row per *output* clip. A single clip_job produces ~5 of these. Each
-- row has its own public URL so the frontend can show a tile + download.
CREATE TABLE IF NOT EXISTS public.generated_clips (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES public.clip_jobs(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Where in the source the clip came from (for "jump to timestamp" UX).
  start_seconds  numeric NOT NULL,
  end_seconds    numeric NOT NULL,

  -- Pipeline outputs.
  title          text,                                   -- LLM-picked hook/headline
  transcript     text,                                   -- full text of the clip
  virality_score integer,                                -- 0..100 from moment detector
  reason         text,                                   -- why the LLM picked this moment
  aspect_ratio   text NOT NULL DEFAULT '9:16',

  -- Storage.
  video_url      text NOT NULL,                          -- Supabase public URL (or signed)
  storage_path   text NOT NULL,                          -- path inside the bucket
  thumbnail_url  text,                                   -- extracted poster frame
  thumbnail_path text,

  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_clips_job_id     ON public.generated_clips (job_id);
CREATE INDEX IF NOT EXISTS idx_generated_clips_user_id    ON public.generated_clips (user_id);
CREATE INDEX IF NOT EXISTS idx_generated_clips_created_at ON public.generated_clips (created_at DESC);

COMMENT ON TABLE public.generated_clips IS
  'Individual vertical shorts produced by an Auto-Clip job. One job → many clips.';
