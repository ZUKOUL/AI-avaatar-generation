-- Adds a free-form JSONB metadata column to generated_ads so we can
-- persist the full Auto-mode chain-of-thought artefacts (marketing brief
-- + visual concept) alongside the creative. The lightbox rehydrates
-- this to show the strategic reasoning behind every ad.
-- Run this in Supabase Dashboard → SQL Editor after 006_product_metadata.sql.

ALTER TABLE public.generated_ads
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

COMMENT ON COLUMN public.generated_ads.metadata IS
  'Auto-mode artefacts: { brief: {...}, concept: {...} }. Null for manual-template ads.';
