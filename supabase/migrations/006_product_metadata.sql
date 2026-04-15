-- Adds optional AI-extracted metadata to the products table so the Ads
-- generator can feed richer context (what the product does, key features,
-- category) into the scene prompt.
-- Run this in Supabase Dashboard → SQL Editor after 005_products_and_ads.sql.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_url   text,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS features     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price        text;

COMMENT ON COLUMN public.products.source_url  IS 'Original product URL (AliExpress, Amazon, Shopify, etc.) supplied by the user.';
COMMENT ON COLUMN public.products.description IS 'AI-extracted 2-3 sentence description of what the product does.';
COMMENT ON COLUMN public.products.features    IS 'AI-extracted bullet list of key product features.';
COMMENT ON COLUMN public.products.price       IS 'AI-extracted price string when visible on the page.';
