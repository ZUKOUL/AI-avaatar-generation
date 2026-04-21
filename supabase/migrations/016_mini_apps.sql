-- 016_mini_apps.sql — User-created mini apps ("New App" wizard).
--
-- A mini-app is a saved configuration on top of the 6 native Horpen
-- tools (canvas, avatar, adlab, thumbs, clipsy, trackify). The wizard
-- (Claude-powered) asks the user structured questions and compiles a
-- `spec` JSON that describes :
--
--   • which Horpen tool to call
--   • a system prompt with {variable} placeholders
--   • a short list of input fields the mini-app form should render
--   • default values / reference assets
--
-- When the user triggers a run, the backend substitutes the form
-- values into the prompt and calls the existing Horpen endpoint for
-- the underlying tool. No custom backend per mini-app — it's just a
-- saved configuration + a wizard.
--
-- Everything is scoped by (user_id, workspace_id) so mini-apps live
-- inside the workspace where they were created.
--
-- Additive & idempotent.

CREATE TABLE IF NOT EXISTS public.mini_apps (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    workspace_id uuid        REFERENCES public.workspaces(id) ON DELETE SET NULL,

    -- Display
    name         text        NOT NULL,
    slug         text        NOT NULL,
    description  text,
    logo_url     text,        -- Nano Banana output, same DA as the 6 native logos
    accent       text        NOT NULL DEFAULT '#3b82f6',

    -- The tool backing this mini-app : one of canvas / avatar / adlab /
    -- thumbs / clipsy / trackify. Kept as text (not FK) so we don't
    -- couple the schema to a tool enum.
    tool         text        NOT NULL,

    -- The compiled spec JSON (fields, prompt, defaults). See
    -- app/api/mini_apps.py MiniAppSpec for the schema.
    spec         jsonb       NOT NULL,

    -- Telemetry
    run_count    integer     NOT NULL DEFAULT 0,
    last_run_at  timestamptz,

    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mini_apps_user_workspace_idx
    ON public.mini_apps (user_id, workspace_id, created_at DESC);

-- Per-user slug uniqueness so /dashboard/apps/<slug> resolves cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS mini_apps_user_slug_uniq
    ON public.mini_apps (user_id, slug);


-- ── Wizard sessions ──
-- Persist the back-and-forth so the user can close and resume the
-- wizard. `messages` is a jsonb array of { role, content } turns.

CREATE TABLE IF NOT EXISTS public.mini_app_wizard_sessions (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    workspace_id uuid        REFERENCES public.workspaces(id) ON DELETE SET NULL,
    messages     jsonb       NOT NULL DEFAULT '[]'::jsonb,
    -- The final compiled spec once the wizard concludes ; null while
    -- the conversation is still in progress.
    draft_spec   jsonb,
    status       text        NOT NULL DEFAULT 'in_progress',  -- in_progress | ready | abandoned
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mini_app_wizard_user_idx
    ON public.mini_app_wizard_sessions (user_id, created_at DESC);
