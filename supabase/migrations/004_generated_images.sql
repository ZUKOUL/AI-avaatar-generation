-- Generated images table: tracks each generated image with its own ID
-- Run after 003 or after your existing tables.

CREATE TABLE IF NOT EXISTS public.generated_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id),
  avatar_id     uuid REFERENCES public.characters(id),  -- NULL if freestyle/prompt-only
  prompt        text NOT NULL,
  image_url     text NOT NULL,
  storage_path  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_images_user_id ON public.generated_images (user_id);
CREATE INDEX IF NOT EXISTS idx_generated_images_avatar_id ON public.generated_images (avatar_id);

COMMENT ON TABLE public.generated_images IS 'AI-generated scene images, each with a unique ID and optional avatar link';
