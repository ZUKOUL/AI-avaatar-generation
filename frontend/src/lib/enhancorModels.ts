/**
 * Enhancor model registry — defines the 6 generation models exposed in
 * the Creator page, with per-model :
 *   - slug      : Enhancor API path segment (becomes /api/{slug}/v1/queue)
 *   - category  : video / image / enhance — drives sidebar grouping
 *   - modes     : list of operating modes the user can pick (text-to-X,
 *                 image-to-X, lip-sync, multi-frame, etc.)
 *   - params    : which generation knobs the form should surface
 *   - webhookField : the JSON key Enhancor expects for the result webhook
 *                 (some models use `webhook_url`, others `webhookUrl`)
 *   - hasStatus : `true` when the model exposes /v1/status for direct
 *                 polling (Nano Banana 2) — frontend skips webhook.site
 *                 polling when true.
 *
 * This file is ported verbatim from videoclaude/static/creator.js with
 * minor TypeScript adjustments (typed enums, optional fields).
 */

import type { EnhancorGenerateBody } from "@/lib/api";

export type EnhancorCategory = "video" | "image" | "enhance";

export interface EnhancorMode {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Help text shown above the prompt textarea when the mode is active. */
  hint: string;
  /** What media uploads this mode supports. `false` = prompt-only.
   *  Otherwise an array of allowed media type slugs from the list:
   *   - "images"      generic image refs
   *   - "videos"      generic video refs
   *   - "audios"      generic audio refs
   *   - "products"    Seedance UGC product shots
   *   - "influencers" Seedance UGC influencer faces
   *   - "frames"      first/last frames for interpolation
   *   - "lipsync"     a single audio for lip-sync mode
   */
  media: false | readonly (
    | "images"
    | "videos"
    | "audios"
    | "products"
    | "influencers"
    | "frames"
    | "lipsync"
  )[];
  /** Multi-frame mode emits a sequence of prompts + durations instead
   *  of a single prompt — the form switches to a list editor. */
  multiframe?: boolean;
}

export interface EnhancorModel {
  /** Internal registry key (used in the picker tabs). */
  key: string;
  name: string;
  /** Enhancor API path segment. */
  slug: string;
  category: EnhancorCategory;
  /** Emoji or single char shown in the picker. */
  icon: string;
  desc: string;
  modes: readonly EnhancorMode[];
  /** Param IDs the form should expose for this model. */
  params: readonly string[];
  /** Webhook field name Enhancor expects in the queue payload. */
  webhookField: string;
  /** Set on models that support direct /v1/status polling. */
  hasStatus?: boolean;
  /** Builds extra body fields from form data — runs at submit time.
   *  Kora needs `img_url` derived from the first uploaded image, etc. */
  extraBody?: (data: Partial<EnhancorGenerateBody>) => Partial<EnhancorGenerateBody>;
  /** Override where uploaded images go in the body (Nano Banana uses
   *  `input_images` instead of `images`). */
  mediaField?: string;
}

export const ENHANCOR_MODELS: EnhancorModel[] = [
  {
    key: "seedance",
    name: "Seedance 2.0",
    slug: "enhancor-ugc-full-access",
    category: "video",
    icon: "🎬",
    desc: "Vidéo IA haute qualité (4-15s)",
    modes: [
      {
        id: "text_to_video",
        name: "Text-to-Video",
        icon: "✍",
        desc: "Prompt texte uniquement",
        hint: "Décris la scène en détail — aucune image requise",
        media: false,
      },
      {
        id: "multi_reference",
        name: "Multi-Référence",
        icon: "🖼",
        desc: "Images de style / personnage",
        hint: "Référence tes images avec @image1, @image2 dans le prompt",
        media: ["images", "videos", "audios"],
      },
      {
        id: "ugc",
        name: "UGC",
        icon: "🎬",
        desc: "Pub produit + influenceur",
        hint: "Référence avec @product_image1, @influencer_image1",
        media: ["products", "influencers"],
      },
      {
        id: "lipsyncing",
        name: "Lip-Sync",
        icon: "🎤",
        desc: "Animer un visage sur audio",
        hint: "Fournis une image/vidéo de visage + un audio",
        media: ["images", "videos", "lipsync"],
      },
      {
        id: "multi_frame",
        name: "Multi-Frame",
        icon: "🎞",
        desc: "Scènes séquentielles",
        hint: "Définis les scènes ci-dessous",
        media: ["images", "videos", "audios"],
        multiframe: true,
      },
      {
        id: "first_n_last_frames",
        name: "First & Last",
        icon: "🔀",
        desc: "Interpolation entre 2 images",
        hint: "Fournis l'image de début et de fin",
        media: ["frames", "videos"],
      },
    ],
    params: ["duration", "resolution", "aspect_ratio", "fast_mode", "full_access"],
    webhookField: "webhook_url",
  },
  {
    key: "kora",
    name: "Kora Pro",
    slug: "kora",
    category: "image",
    icon: "🎨",
    desc: "Génération d'images depuis un prompt",
    modes: [
      {
        id: "text_to_image",
        name: "Text-to-Image",
        icon: "✍",
        desc: "Prompt texte uniquement",
        hint: "Décris l'image souhaitée en détail",
        media: false,
      },
      {
        id: "image_to_image",
        name: "Image-to-Image",
        icon: "🖼",
        desc: "Image de référence + prompt",
        hint: "Fournis une image de référence",
        media: ["images"],
      },
    ],
    params: ["kora_model", "generation_mode", "image_size"],
    webhookField: "webhookUrl",
    extraBody: (data) => ({
      model: data.model || "kora_pro",
      generation_mode: data.generation_mode || "normal",
      image_size: data.image_size || "square",
      ...(data.images && data.images[0] ? { img_url: data.images[0] } : {}),
    }),
  },
  {
    key: "nano_banana",
    name: "Nano Banana 2",
    slug: "nano-banana-2-new",
    category: "image",
    icon: "🍌",
    desc: "Génération & édition d'images (1-14 images, jusqu'à 4K)",
    hasStatus: true,
    modes: [
      {
        id: "text_to_image",
        name: "Text-to-Image",
        icon: "✍",
        desc: "Prompt texte uniquement",
        hint: "Décris l'image souhaitée en détail",
        media: false,
      },
      {
        id: "image_edit",
        name: "Édition",
        icon: "✏️",
        desc: "Modifier 1-14 images",
        hint: "Ajoute des images et décris les modifications",
        media: ["images"],
      },
    ],
    params: ["nb_resolution", "nb_aspect_ratio"],
    webhookField: "webhook_url",
    mediaField: "input_images",
  },
  {
    key: "image_editor",
    name: "Image Editor",
    slug: "enhancor-image-editor-full-access",
    category: "image",
    icon: "✂️",
    desc: "Éditeur d'images IA avancé",
    modes: [
      {
        id: "edit",
        name: "Éditer",
        icon: "✏️",
        desc: "Modifier une image",
        hint: "Fournis une image + décris les modifications",
        media: ["images"],
      },
    ],
    params: ["resolution"],
    webhookField: "webhookUrl",
  },
  {
    key: "skin",
    name: "Realistic Skin",
    slug: "realistic-skin",
    category: "enhance",
    icon: "✨",
    desc: "Retouche peau & portrait",
    modes: [
      {
        id: "enhance",
        name: "Améliorer",
        icon: "✨",
        desc: "Retouche automatique de portrait",
        hint: "Fournis une photo de portrait",
        media: ["images"],
      },
    ],
    params: ["resolution"],
    webhookField: "webhookUrl",
    extraBody: (data) => ({
      img_url: data.images && data.images[0] ? data.images[0] : "",
    }),
  },
  {
    key: "upscaler",
    name: "Upscaler",
    slug: "detailed",
    category: "enhance",
    icon: "🔍",
    desc: "Upscaling + amélioration détaillée",
    modes: [
      {
        id: "upscale",
        name: "Upscaler",
        icon: "🔍",
        desc: "Agrandir et améliorer une image",
        hint: "Fournis une image à upscaler",
        media: ["images"],
      },
    ],
    params: [],
    webhookField: "webhookUrl",
    extraBody: (data) => ({
      img_url: data.images && data.images[0] ? data.images[0] : "",
    }),
  },
];

export function getModel(key: string): EnhancorModel {
  return ENHANCOR_MODELS.find((m) => m.key === key) ?? ENHANCOR_MODELS[0];
}

/** Returns the parsed result URL from an Enhancor status response.
 *  Result can be a plain URL string, or an object {url, urls[]}.
 *  For nano-banana the result is an array of image URLs. */
export function extractResultUrls(
  result: string | { url?: string; urls?: string[] } | null | undefined,
): string[] {
  if (!result) return [];
  if (typeof result === "string") return [result];
  if (Array.isArray(result.urls)) return result.urls;
  if (result.url) return [result.url];
  return [];
}
