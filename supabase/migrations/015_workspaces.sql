-- 015_workspaces.sql — Personal workspaces per user.
--
-- Each user can have up to 5 named workspaces (enforced at the app layer
-- via a `COUNT(*)` check on create). Every piece of user-generated content
-- (avatars, images, videos, ads) is stamped with a `workspace_id` so that
-- switching workspace yields a clean slate — the user sees only the
-- content they created within the active workspace.
--
-- Backfill strategy : existing rows keep `workspace_id = NULL`. They are
-- treated as "legacy" and shown in the user's primary/first workspace.
--
-- Additive & idempotent : safe to re-run.

-- ── Workspaces table ──
CREATE TABLE IF NOT EXISTS public.workspaces (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name       text        NOT NULL,
    -- Hex accent color e.g. '#3b82f6', shown as the colored dot in
    -- the sidebar user-menu switcher.
    color      text        NOT NULL DEFAULT '#3b82f6',
    -- Whether this is the first (primary) workspace auto-created on
    -- user signup. Useful for future logic like "cannot delete primary".
    is_primary boolean     NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspaces_user_idx
    ON public.workspaces (user_id, created_at DESC);

-- ── workspace_id on all content tables ──
-- Nullable on purpose : legacy rows keep NULL and we resolve them to the
-- primary workspace on read. New rows should always set workspace_id.

-- Characters = the avatars table in our schema.
ALTER TABLE public.characters
    ADD COLUMN IF NOT EXISTS workspace_id uuid
        REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS characters_workspace_idx
    ON public.characters (user_id, workspace_id);

-- Generated images (Canvas image gen + thumbnails share this table).
ALTER TABLE public.generated_images
    ADD COLUMN IF NOT EXISTS workspace_id uuid
        REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS generated_images_workspace_idx
    ON public.generated_images (user_id, workspace_id);

-- Generated ads (Adlab).
ALTER TABLE public.generated_ads
    ADD COLUMN IF NOT EXISTS workspace_id uuid
        REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS generated_ads_workspace_idx
    ON public.generated_ads (user_id, workspace_id);

-- Video jobs (avatar videos).
ALTER TABLE public.video_jobs
    ADD COLUMN IF NOT EXISTS workspace_id uuid
        REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS video_jobs_workspace_idx
    ON public.video_jobs (user_id, workspace_id);

-- AI video jobs (Clipsy).
ALTER TABLE public.ai_video_jobs
    ADD COLUMN IF NOT EXISTS workspace_id uuid
        REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_video_jobs_workspace_idx
    ON public.ai_video_jobs (user_id, workspace_id);

-- Generated clips (Clipsy clips).
ALTER TABLE public.generated_clips
    ADD COLUMN IF NOT EXISTS workspace_id uuid
        REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS generated_clips_workspace_idx
    ON public.generated_clips (user_id, workspace_id);
