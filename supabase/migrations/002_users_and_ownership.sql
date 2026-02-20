-- User accounts and ownership: users table + user_id on characters and video_jobs.
-- Run after 001 or after your existing characters/video_jobs tables.

-- ─── Users table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- ─── Characters: add user_id ─────────────────────────────────────────────────
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users (id);

CREATE INDEX IF NOT EXISTS idx_characters_user_id ON public.characters (user_id);

-- Existing rows keep user_id NULL; they will not appear for any logged-in user.
-- New characters get user_id set by the app.

-- ─── Video jobs: add user_id ────────────────────────────────────────────────
ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users (id);

CREATE INDEX IF NOT EXISTS idx_video_jobs_user_id ON public.video_jobs (user_id);

-- Optional: trigger to update users.updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
