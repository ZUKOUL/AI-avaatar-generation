-- 013_spyder.sql — Spyder product (tracker concurrents 24/7).
--
-- Tables :
--   - spyder_brands : chaque brand (page Meta Ads Library / profil
--     TikTok / chaîne YouTube) qu'un user veut tracker. Statut suit la
--     dernière tentative de scan du worker.
--   - spyder_ads   : archives individuelles de chaque creative scrapé
--     — une row par ad, avec l'IA-extraction (hook / angle / score).
--
-- Relations : user_id → users.id, brand_id → spyder_brands.id.
-- Le worker scanner (implémenté séparément) ajoute les rows à
-- spyder_ads ; les endpoints de lecture agrègent pour l'UI.

-- ── Brands trackées par user ──
CREATE TABLE IF NOT EXISTS public.spyder_brands (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- Platform : "meta" | "tiktok" | "instagram" | "youtube" | "web"
    platform     text        NOT NULL,
    -- URL source : page Meta Ads Library, profil handle, etc.
    source_url   text        NOT NULL,
    -- Nom affiché dans l'UI (déduit du scan initial, éditable).
    display_name text        NOT NULL,
    -- URL de l'avatar / logo de la brand, rempli par le scanner.
    avatar_url   text,
    -- Statut : "pending" | "scanning" | "active" | "error"
    status       text        NOT NULL DEFAULT 'pending',
    -- Dernier scan réussi — utilisé par le worker pour décider l'ordre
    -- de scan (plus ancien = prioritaire).
    last_scan_at timestamptz,
    -- Détails erreur si status=error.
    error_detail text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spyder_brands_user_idx
    ON public.spyder_brands (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS spyder_brands_user_source_uniq
    ON public.spyder_brands (user_id, source_url);

-- ── Ads archivés ──
CREATE TABLE IF NOT EXISTS public.spyder_ads (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          uuid        NOT NULL REFERENCES public.spyder_brands(id) ON DELETE CASCADE,
    user_id           uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- ID de la source (ex. Meta Ad ID, TikTok post ID). Permet au
    -- scanner d'éviter les doublons lors des refresh.
    external_id       text,
    platform          text        NOT NULL,
    -- Type : "image" | "video" | "carousel"
    ad_type           text        NOT NULL DEFAULT 'image',
    media_url         text,
    thumbnail_url     text,
    caption           text,
    landing_url       text,
    -- Métadonnées plateforme (date de première diffusion, pays, etc.)
    platform_metadata jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- IA-extraction : hook, angle, émotion, persona, CTA, score.
    -- Rempli par spyder_service.analyze_ad() après l'archivage.
    ai_analysis       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- Score IA de performance estimée (0-100), null si pas encore scoré.
    perf_score        smallint,
    -- Quand le scanner a détecté ou archivé cette ad.
    first_seen_at     timestamptz NOT NULL DEFAULT now(),
    last_seen_at      timestamptz NOT NULL DEFAULT now(),
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spyder_ads_brand_idx
    ON public.spyder_ads (brand_id, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS spyder_ads_user_feed_idx
    ON public.spyder_ads (user_id, first_seen_at DESC);

-- Uniqueness : une ad externe par brand (empêche les doublons de scan).
CREATE UNIQUE INDEX IF NOT EXISTS spyder_ads_brand_external_uniq
    ON public.spyder_ads (brand_id, external_id)
    WHERE external_id IS NOT NULL;
