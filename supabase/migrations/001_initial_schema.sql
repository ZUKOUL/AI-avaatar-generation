-- AI Avatar Generation – Initial schema for Supabase
-- Run this in Supabase Dashboard → SQL Editor (or via Supabase CLI)

-- ─── Table: characters ─────────────────────────────────────────────────────
-- Stores identity-locked avatars: reference image paths and optional name.
-- The app uses UUID as primary key (generated in Python).
CREATE TABLE IF NOT EXISTS public.characters (
  id            uuid PRIMARY KEY,
  image_paths   text[] NOT NULL DEFAULT '{}',
  name          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.characters IS 'Avatar identities: reference faces and optional display name';
COMMENT ON COLUMN public.characters.image_paths IS 'Paths in avatars bucket, e.g. master_faces/<id>/ref_0.png';

-- ─── Table: video_jobs ─────────────────────────────────────────────────────
-- Tracks async video generation jobs (Veo or Kling).
CREATE TABLE IF NOT EXISTS public.video_jobs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  character_id  text NOT NULL,
  operation_id  text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  engine        text NOT NULL,
  source_url    text,
  motion_prompt text,
  video_url     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_character_id ON public.video_jobs (character_id);
CREATE INDEX IF NOT EXISTS idx_video_jobs_operation_id ON public.video_jobs (operation_id);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON public.video_jobs (status);

COMMENT ON TABLE public.video_jobs IS 'Async video generation jobs; poll via operation_id';

-- Optional: update updated_at on row change (for video_jobs)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS video_jobs_updated_at ON public.video_jobs;
CREATE TRIGGER video_jobs_updated_at
  BEFORE UPDATE ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
