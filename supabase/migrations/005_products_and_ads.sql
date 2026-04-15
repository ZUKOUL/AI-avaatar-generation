-- Ads feature — products library + generated ad creatives.
-- Run this in Supabase Dashboard → SQL Editor after 004_generated_images.sql.

-- ─── Table: products ───────────────────────────────────────────────────────
-- Stores trained products: reference photos for ad creative generation.
-- Same structure as `characters` but scoped to physical products so the
-- Characters page stays clean.
CREATE TABLE IF NOT EXISTS public.products (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  category      text,                                   -- e.g. "Electronics", "Fashion"
  image_paths   text[] NOT NULL DEFAULT '{}',           -- first path = thumbnail, rest = refs
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_user_id   ON public.products (user_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products (created_at DESC);

COMMENT ON TABLE public.products IS 'Trained product references used by the Ads generator';
COMMENT ON COLUMN public.products.image_paths IS 'First entry is the clean thumbnail, the rest are training refs';


-- ─── Table: generated_ads ──────────────────────────────────────────────────
-- Persists every ad creative generated via /ads/generate, so users can see
-- their history and re-download past creatives.
CREATE TABLE IF NOT EXISTS public.generated_ads (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES public.products(id) ON DELETE SET NULL,
  template       text,                                  -- e.g. "studio_white", "lifestyle"
  prompt         text NOT NULL,
  aspect_ratio   text NOT NULL DEFAULT '1:1',
  image_url      text NOT NULL,
  storage_path   text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_ads_user_id    ON public.generated_ads (user_id);
CREATE INDEX IF NOT EXISTS idx_generated_ads_product_id ON public.generated_ads (product_id);
CREATE INDEX IF NOT EXISTS idx_generated_ads_created_at ON public.generated_ads (created_at DESC);

COMMENT ON TABLE public.generated_ads IS 'AI-generated static ad creatives — history per user';
