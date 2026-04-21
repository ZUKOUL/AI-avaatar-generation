-- 014_teams.sql — Team collaboration.
--
-- Tables :
--   - teams         : un workspace partagé (owner + nom)
--   - team_members  : appartenance + rôle (admin / creative / analyst)
--   - team_invites  : invitations pending par email, avec token
--   - team_tasks    : tâches assignées aux membres
--
-- Pattern : l'owner est aussi inséré dans team_members avec
-- role='admin' lors de la création — garde les queries simples
-- (toujours passer par team_members pour savoir qui a accès).

-- ── Teams ──
CREATE TABLE IF NOT EXISTS public.teams (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text        NOT NULL,
    owner_id   uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- Slug dérivé du nom — utilisé dans les URLs team (/team/<slug>).
    slug       text        NOT NULL,
    avatar_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_slug_uniq ON public.teams (slug);

-- ── Members ──
CREATE TABLE IF NOT EXISTS public.team_members (
    id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id   uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id   uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- Rôle : "admin" | "creative" | "analyst"
    role      text        NOT NULL DEFAULT 'creative',
    joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_user_uniq
    ON public.team_members (team_id, user_id);

CREATE INDEX IF NOT EXISTS team_members_user_idx
    ON public.team_members (user_id);

-- ── Invites ──
CREATE TABLE IF NOT EXISTS public.team_invites (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    email       text        NOT NULL,
    role        text        NOT NULL DEFAULT 'creative',
    token       text        NOT NULL,
    invited_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    -- Statut : "pending" | "accepted" | "revoked" | "expired"
    status      text        NOT NULL DEFAULT 'pending',
    expires_at  timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
    accepted_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_invites_token_uniq
    ON public.team_invites (token);

CREATE INDEX IF NOT EXISTS team_invites_team_status_idx
    ON public.team_invites (team_id, status);

-- ── Tasks ──
CREATE TABLE IF NOT EXISTS public.team_tasks (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id      uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    title        text        NOT NULL,
    description  text,
    -- Catégorie : "generation" | "tracking" | "analytics" | "other"
    category     text        NOT NULL DEFAULT 'generation',
    -- Produit ciblé (optionnel) : "canvas" | "avatar" | "spyder" |
    -- "adlab" | "thumbs" | "autoclip"
    product_slug text,
    assignee_id  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    created_by   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    -- Statut : "todo" | "in_progress" | "done" | "cancelled"
    status       text        NOT NULL DEFAULT 'todo',
    due_at       timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_tasks_team_idx
    ON public.team_tasks (team_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS team_tasks_assignee_idx
    ON public.team_tasks (assignee_id, status);
