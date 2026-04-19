-- Niche presets for the AI Video Generator — lets users one-click a
-- fully-branded 60s video in a specific TikTok channel's style
-- (e.g. @humain.penseur philosophical shorts).
--
-- Niche definitions live in code (app/services/niche_registry.py) so we
-- can tune prompts on every PR without a migration. These columns just
-- store the resolved style applied to each job so the record is self-
-- contained even if we later rename / retire a niche slug in code.
--
-- Run order: after 009_ai_videos.sql.

ALTER TABLE public.ai_video_jobs
  -- Slug of the niche the job was generated from (nullable for manual jobs).
  ADD COLUMN IF NOT EXISTS niche_slug text,
  -- Snapshot of the style instructions injected into the LLM prompt.
  -- Stored so we can reproduce the job and so audits show exactly what
  -- steered the generation even after the niche definition evolves.
  ADD COLUMN IF NOT EXISTS style_instructions text,
  -- Snapshot of the visual-style suffix appended to every keyframe prompt.
  ADD COLUMN IF NOT EXISTS visual_style text;

CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_niche
  ON public.ai_video_jobs (niche_slug);

COMMENT ON COLUMN public.ai_video_jobs.niche_slug IS
  'Niche preset slug (see app/services/niche_registry.py). Null for manual prompts.';
COMMENT ON COLUMN public.ai_video_jobs.style_instructions IS
  'Snapshot of the niche style instructions used to steer the LLM at generation time.';
COMMENT ON COLUMN public.ai_video_jobs.visual_style IS
  'Snapshot of the visual-style suffix appended to every keyframe prompt.';
