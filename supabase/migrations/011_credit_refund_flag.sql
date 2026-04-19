-- Track whether an AI-video job has already had its credits refunded,
-- so the cancel endpoint + the zombie reaper + the refund-guard wrapper
-- can't all double-refund the same job.
--
-- Background: refunds can now trigger from THREE independent paths:
--   1. `_run_with_refund_guard` after the pipeline completes — refunds if
--      the job failed before producing a video.
--   2. `POST /ai-videos/jobs/{id}/cancel` — user-initiated kill of a
--      stuck job.
--   3. The startup-registered zombie reaper — auto-refunds jobs that
--      haven't had a progress update in >15 min (usually container got
--      restarted mid-pipeline).
-- Each path now checks `credit_refunded` before issuing the credit
-- write, and flips the flag to true on success. No double-refunds.
--
-- Run order: after 010_niche_metadata.sql.

ALTER TABLE public.ai_video_jobs
  ADD COLUMN IF NOT EXISTS credit_refunded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_video_jobs.credit_refunded IS
  'True once any refund path has credited the user for this job. '
  'Guards against double-refund from the refund-guard / cancel endpoint / '
  'zombie reaper all firing on the same job.';
