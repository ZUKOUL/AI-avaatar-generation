-- AI Video Generator — multi-model motion support.
-- Lets users pick a specific image-to-video provider (Kling / Veo /
-- Hailuo / …) for motion-mode jobs. Slideshow-mode jobs ignore this
-- field.
--
-- The column is intentionally free-form text with no CHECK constraint
-- so new providers can land via a code change alone — see
-- `app/services/motion_providers.py` for the registry.
--
-- Run order: after 011_credit_refund_flag.sql.

ALTER TABLE public.ai_video_jobs
  ADD COLUMN IF NOT EXISTS motion_model text;

COMMENT ON COLUMN public.ai_video_jobs.motion_model IS
  'Slug of the motion provider used for this job (kling, veo_fast, hailuo, …). '
  'Null for slideshow-mode jobs. See app/services/motion_providers.py for '
  'the registry of supported values.';
