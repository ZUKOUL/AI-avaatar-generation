import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

/** localStorage key where the active workspace id is persisted.
 *  Exported so the Sidebar + WorkspaceContext can read/write in sync. */
export const WORKSPACE_STORAGE_KEY = "horpen_active_workspace_id";

// Attach JWT token + active workspace header to every request. The
// backend's resolve_workspace_id dependency reads X-Workspace-Id,
// falls back to the user's primary workspace when missing.
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("horpen_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const workspaceId = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (workspaceId) {
      config.headers["X-Workspace-Id"] = workspaceId;
    }
  }
  return config;
});

// Handle 401 → redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("horpen_token");
      localStorage.removeItem("horpen_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Public showcase (used by the marketing landing page, no auth) ──
export const showcaseAPI = {
  /**
   * Returns a curated feed of real generations (thumbnails, avatars,
   * images, ads, videos) produced by administrator accounts, so the
   * landing page can show actual content instead of gradient
   * placeholders. Safe to call from anonymous visitors — already
   * filtered server-side to admin-only content.
   */
  featured: () => api.get("/showcase/featured"),
};

// ── Auth ──
export const authAPI = {
  signup: (email: string, password: string) =>
    api.post("/auth/signup", { email, password }),
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  forgotPassword: (email: string) =>
    api.post("/auth/forgot-password", { email }),
  resetPassword: (token: string, new_password: string) =>
    api.post("/auth/reset-password", { token, new_password }),
};

// ── Avatar ──
export const avatarAPI = {
  generate: (formData: FormData) =>
    api.post("/avatar/generate-avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  generateImage: (formData: FormData) =>
    api.post("/avatar/generate-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  trainCharacter: (formData: FormData) =>
    api.post("/avatar/train-character", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  list: (opts: { allWorkspaces?: boolean } = {}) =>
    api.get("/avatar/avatars", {
      params: opts.allWorkspaces ? { all_workspaces: true } : undefined,
    }),
  /**
   * List the user's generated images (also covers thumbnails since
   * everything lives in the shared `generated_images` table). The
   * default limit was 50 — that capped the gallery counter at "50
   * images" for any user with more than 50 generations. Bumped to
   * 500 so the displayed count matches reality.
   */
  getImages: (avatarId?: string, limit = 500, opts: { allWorkspaces?: boolean } = {}) =>
    api.get("/avatar/images", {
      params: {
        avatar_id: avatarId,
        limit,
        ...(opts.allWorkspaces ? { all_workspaces: true } : {}),
      },
    }),
  getImage: (imageId: string) => api.get(`/avatar/images/${imageId}`),
  updateNickname: (characterId: string, nickname: string) =>
    api.put(`/avatar/characters/${characterId}/nickname`, { nickname }),
  deleteCharacter: (characterId: string) =>
    api.delete(`/avatar/characters/${characterId}`),
  describeImage: (imageUrl: string) => {
    const formData = new FormData();
    formData.append("image_url", imageUrl);
    return api.post("/avatar/describe-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ── Thumbnail ──
export const thumbnailAPI = {
  generate: (formData: FormData) =>
    api.post("/thumbnail/generate", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  youtubePreview: (url: string) =>
    api.get("/thumbnail/youtube-preview", { params: { url } }),
  /**
   * Detect subjects (people, objects, text) in a source thumbnail so the UI
   * can show clickable/editable bounding boxes. Pass one of: `file`
   * (uploaded image), `youtube_url`, or `image_url`.
   */
  detectPeople: (formData: FormData) =>
    api.post("/thumbnail/detect-people", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /**
   * Fetch the user's past thumbnails, most recent first.
   *
   * The backend caps at 1000 rows. Bump the default so the gallery shows
   * the full catalogue instead of just the 60 most recent generations.
   */
  list: (limit = 500) =>
    api.get("/thumbnail/history", { params: { limit } }),
  /** Delete a single thumbnail (row + storage artefacts) — used by bulk delete. */
  delete: (thumbId: string) => api.delete(`/thumbnail/${thumbId}`),
  /**
   * Fetch a rich description of the YouTube video's thumbnail so we can
   * turn a pasted URL into a ready-to-generate prompt. Backend grabs the
   * image from img.youtube.com and runs it through Gemini 2.5 Flash.
   */
  describeYoutube: (url: string) => {
    const formData = new FormData();
    formData.append("url", url);
    return api.post("/thumbnail/describe-youtube-thumbnail", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  /**
   * Ask the backend to describe what's inside a fractional bounding box on
   * a source thumbnail. Used right after the user draws a custom rectangle
   * so the "Custom selection" placeholder gets replaced with a meaningful
   * noun phrase (e.g. "blue cotton t-shirt") — which then flows into the
   * generator as `target_label`.
   */
  describeRegion: (formData: FormData) =>
    api.post("/thumbnail/describe-region", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  inspiration: (niche = "business", limit = 12) =>
    api.get("/thumbnail/inspiration", { params: { niche, limit } }),
  /**
   * AI-powered prompt generator: pass the creator's niche + video title
   * (+ optional description) and the backend searches YouTube for top
   * thumbnails in that space, analyses them with Gemini, and returns a
   * ready-to-use generation prompt personalised to the video concept.
   */
  smartPrompt: (formData: FormData) =>
    api.post("/thumbnail/smart-prompt", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /**
   * App Store Screenshot Studio — stage 1: feed raw context to the
   * strategist (Gemini 2.5 Pro) and get a 5-screen narrative brief
   * back. The user can edit headlines before triggering generation.
   * No credits are charged at this stage.
   */
  appstoreBrief: (formData: FormData) =>
    api.post("/thumbnail/appstore-brief", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /**
   * Stage 2: render the 5 App Store screenshots from the brief +
   * brand assets. Charges CREDIT_COST_APPSTORE_PACK on success
   * (or per-screen if some shots failed).
   */
  appstoreGenerate: (formData: FormData) =>
    api.post("/thumbnail/generate-appstore", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Pre-fill app metadata from a public App Store URL (free, iTunes API). */
  appstoreScrape: (url: string) =>
    api.get("/thumbnail/appstore-scrape", { params: { url } }),
  /** List the curated reference packs the AI can draw style from. */
  appstoreNiches: () => api.get("/thumbnail/appstore-niches"),
  /**
   * Curated App Store reference packs grouped by vertical, with public
   * thumbnail + icon URLs ready to drop into <img src=...>. Used by
   * the "Browse templates" picker on the App Store screenshot page.
   */
  appstoreTemplates: () => api.get("/thumbnail/appstore-templates"),
  /**
   * Single-shot App Store screenshot generation. Light path used by the
   * simple form: one image per call, 6 credits. The user clicks "Next"
   * to render another variant — the strategist runs invisibly on the
   * backend, no brief preview, no narrative-arc UI.
   */
  appstoreGenerateDirect: (formData: FormData) =>
    api.post("/thumbnail/generate-appstore-direct", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /**
   * Smart bento card generation — strategist (Gemini 2.5 Pro) writes
   * the headline / sub / layout / mood from the user's product
   * description, then Gemini 3 Pro Image renders it. Supports an
   * optional `locked_style_url` so a series of bentos can inherit the
   * same DNA (palette, icons, typography) and look like sister cells
   * on the same landing page.
   *
   * Required form field: product_description.
   * Optional: product_name, audience, tone_pref, color_primary,
   * aspect_ratio, template_url, template_slug, locked_style_url, files.
   */
  bentoGenerateSmart: (formData: FormData) =>
    api.post("/thumbnail/generate-bento-smart", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /**
   * Single-shot Bento card generation — the legacy direct path that
   * requires the user to fill the headline themselves. Kept for
   * back-compat with any flows that need full manual control. New code
   * should prefer `bentoGenerateSmart` which lets the strategist
   * write the copy.
   */
  bentoGenerateDirect: (formData: FormData) =>
    api.post("/thumbnail/generate-bento-direct", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /**
   * Curated YouTube thumbnail templates — ~500 AI-generated faceless-
   * character thumbnails grouped by style (face_reaction, dual_split,
   * text_dominant, mockup_focus, dark_dramatic, bright_colorful,
   * tutorial_callout, mascot_3d). Used by the "Templates" sub-tab on
   * the YouTube thumbnail page so the user can pin a specific style
   * anchor instead of scrolling YouTube's top-100 inspiration feed.
   */
  youtubeTemplates: () => api.get("/thumbnail/youtube-templates"),
  /**
   * Curated App Store screenshot inspirations — ~280 high-quality
   * screenshot designs grouped by style (headline_first, phone_mockup,
   * lifestyle_photo, illustration_led, feature_callout, social_proof,
   * before_after, minimal_text). Used by the "Inspirations" sub-tab
   * on the App Store page; also auto-injected as house-style anchors
   * into every `generate-appstore-direct` call.
   */
  appstoreInspoTemplates: () => api.get("/thumbnail/appstore-inspo-templates"),
  /**
   * Curated bento templates gallery — a couple hundred reference cards
   * grouped by visual style (minimal_light / dark_tech / illustration /
   * dashboard_mockup / split / colorful_playful / editorial_text /
   * collage). Each item has a `url` pointing at the static-served
   * preview JPEG. Public, no auth needed (these are reference visuals
   * we want users to browse before signing up too).
   */
  bentoTemplates: () => api.get("/thumbnail/bento-templates"),
  /**
   * Smart pack: hand over context, get N polished screenshots back. The
   * strategist writes the headlines, the image model renders. All five
   * frames in the conversion arc come back distinct — never N reskins
   * of the same idea. num_variants ∈ {1, 3, 5}; charges 6 × successful.
   */
  appstoreGeneratePack: (formData: FormData) =>
    api.post("/thumbnail/generate-appstore-pack", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      // Strategist + N parallel Gemini Image calls — typically ~30-60 s
      // for 5 variants. Default axios timeout is 0 (no timeout) but we
      // bump explicitly so a slower upstream doesn't 504 us at 30 s.
      timeout: 180_000,
    }),
  /**
   * Universal URL → thumbnail description. Works for YouTube (uses the
   * existing CDN path) AND any other social URL — Twitter/X, Instagram,
   * TikTok, LinkedIn, blogs — by scraping the og:image / twitter:image
   * meta tag from the page HTML and running the resulting image through
   * Gemini Flash. Returns `{ description, source, video_id?, ... }`.
   */
  describeUrl: (url: string) => {
    const formData = new FormData();
    formData.append("url", url);
    return api.post("/thumbnail/describe-url", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  /**
   * Direct image → description. Called when the user pastes or drops
   * an image into the prompt textarea. Same Gemini Flash describe
   * prompt as describeUrl, just no scrape hop.
   */
  describeImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/thumbnail/describe-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ── Ads (product training + ad creative generation) ──
export const adsAPI = {
  /** Train a new product from 3-20 reference photos. */
  trainProduct: (formData: FormData) =>
    api.post("/ads/train-product", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** List all products trained by the current user. */
  listProducts: () => api.get("/ads/products"),
  /** Delete a product (row + storage files). */
  deleteProduct: (productId: string) =>
    api.delete(`/ads/products/${productId}`),
  /** Generate a static ad creative using a trained product + template. */
  generate: (formData: FormData) =>
    api.post("/ads/generate", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Fetch the static list of supported ad templates + aspect ratios. */
  templates: () => api.get("/ads/templates"),
  /** List generated ads (optionally filtered by product). */
  history: (productId?: string, limit = 100) =>
    api.get("/ads/history", { params: { product_id: productId, limit } }),
  /** Delete a single generated ad creative. */
  delete: (adId: string) => api.delete(`/ads/${adId}`),
};

// ── AI Video Generator (phrase → rendered vertical short) ──
export const aiVideosAPI = {
  /**
   * Kick off a generation job. FormData fields:
   *   prompt              (string, required)
   *   mode                'slideshow' | 'motion'       (default: slideshow)
   *   duration_seconds    10..90                       (default: 30)
   *   aspect_ratio        '9:16' | '1:1' | '16:9' | '4:5'
   *   language            'auto' | ISO-639-1           (default: auto)
   *   tone                optional free-text
   *   voice_enabled       'true' | 'false'             (default: true)
   *   voice_id            optional ElevenLabs voice id
   *   subtitle_style      'karaoke' | 'block' | 'off'  (default: karaoke)
   */
  generate: (formData: FormData) =>
    api.post("/ai-videos/generate", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Summary list of the user's AI video jobs. */
  list: (limit = 50) =>
    api.get("/ai-videos", { params: { limit } }),
  /** Job + per-scene details (use this for the detail view / polling). */
  getJob: (jobId: string) => api.get(`/ai-videos/jobs/${jobId}`),
  /** Remove job + scenes + storage. */
  deleteJob: (jobId: string) => api.delete(`/ai-videos/jobs/${jobId}`),
  /**
   * Cancel an in-flight or zombie job — marks it failed and refunds the
   * user's credits. Completed jobs cannot be cancelled (delete them
   * instead).
   */
  cancelJob: (jobId: string) =>
    api.post(`/ai-videos/jobs/${jobId}/cancel`),
  /** Available ElevenLabs voices (for the voice picker). */
  voices: () => api.get("/ai-videos/voices"),
  /**
   * List the image-to-video providers this server can dispatch to
   * (Kling / Veo / Hailuo / …). Includes live credit prices so the
   * picker in the UI stays in sync with the backend tariff.
   */
  listMotionProviders: () => api.get("/ai-videos/motion-providers"),
  /** List the channel-style niche presets (e.g. @humain.penseur). */
  listNiches: () => api.get("/ai-videos/niches"),
  /** Fetch N AI-generated topic ideas tuned to the niche. */
  nicheTopicIdeas: (slug: string, count = 6) =>
    api.get(`/ai-videos/niches/${slug}/topic-ideas`, { params: { count } }),
  /**
   * List every visual-reference image currently feeding a niche —
   * both code-defined PNGs (type="static") and user-uploaded ones
   * (type="uploaded"). The pipeline conditions Gemini 3 Pro Image on
   * all of them when rendering keyframes.
   */
  listNicheReferences: (slug: string) =>
    api.get(`/ai-videos/niches/${slug}/references`),
  /**
   * Upload 1-10 images at once. Each file becomes an additional
   * reference the next generation conditions on.
   */
  uploadNicheReferences: (slug: string, formData: FormData) =>
    api.post(`/ai-videos/niches/${slug}/references`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** Remove a user-uploaded reference. Static refs can't be removed
   *  this way — they're committed in the repo. */
  deleteNicheReference: (slug: string, refId: string) =>
    api.delete(`/ai-videos/niches/${slug}/references/${encodeURIComponent(refId)}`),
  /**
   * One-click generate: optional `topic` and optional overrides (duration,
   * mode) — everything else is locked to the niche's defaults so the
   * output stays on-brand.
   */
  generateFromNiche: (formData: FormData) =>
    api.post("/ai-videos/generate-from-niche", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};

// ── Auto-Clip (long-form URL → N vertical shorts) ──
export const clipsAPI = {
  /**
   * Kick off a clipping job. Returns `{ job_id, status: "queued", ... }`.
   * The caller polls `getJob(job_id)` until status is "completed" or "failed".
   */
  fromUrl: (formData: FormData) =>
    api.post("/clips/from-url", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  /** List recent clipping jobs for the current user (summary only). */
  listJobs: (limit = 50) =>
    api.get("/clips/jobs", { params: { limit } }),
  /** Fetch a single job + every clip it has produced so far. */
  getJob: (jobId: string) => api.get(`/clips/jobs/${jobId}`),
  /** Remove a job + every clip (storage + DB rows). */
  deleteJob: (jobId: string) => api.delete(`/clips/jobs/${jobId}`),
  /** Flat feed across all jobs (for gallery views). */
  listClips: (limit = 100) =>
    api.get("/clips", { params: { limit } }),
  /** Delete a single clip. */
  deleteClip: (clipId: string) => api.delete(`/clips/${clipId}`),
};

// ── Video ──
export const videoAPI = {
  animate: (formData: FormData) =>
    api.post("/video/animate", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  status: (operationId: string) =>
    api.get(`/video/video-status/${operationId}`),
  history: (avatarId?: string, limit = 50) =>
    api.get("/video/video-history", { params: { avatar_id: avatarId, limit } }),
};

// ── Credits ──
export const creditsAPI = {
  balance: () => api.get("/credits/balance"),
  history: (limit = 50) => api.get("/credits/history", { params: { limit } }),
};

// ── Trackify (competitor tracking) ──
export const trackifyAPI = {
  listBrands: () => api.get("/trackify/brands"),
  addBrand: (payload: { source_url: string; platform: string; display_name?: string }) =>
    api.post("/trackify/brands", payload),
  deleteBrand: (brandId: string) => api.delete(`/trackify/brands/${brandId}`),
  feed: (params?: { limit?: number; offset?: number; brand_id?: string; platform?: string }) =>
    api.get("/trackify/feed", { params }),
  getAd: (adId: string) => api.get(`/trackify/ads/${adId}`),
  recreate: (adId: string) => api.post(`/trackify/recreate/${adId}`),
  stats: () => api.get("/trackify/stats"),
};

// ── Team (collaboration + tasks) ──
export const teamAPI = {
  listTeams: () => api.get("/team/teams"),
  createTeam: (name: string) => api.post("/team/teams", { name }),
  getTeam: (teamId: string) => api.get(`/team/teams/${teamId}`),
  deleteTeam: (teamId: string) => api.delete(`/team/teams/${teamId}`),
  listMembers: (teamId: string) => api.get(`/team/teams/${teamId}/members`),
  removeMember: (teamId: string, userId: string) =>
    api.delete(`/team/teams/${teamId}/members/${userId}`),
  invite: (teamId: string, email: string, role = "creative") =>
    api.post(`/team/teams/${teamId}/invite`, { email, role }),
  acceptInvite: (token: string) => api.post("/team/invites/accept", { token }),
  listTasks: (teamId: string) => api.get(`/team/teams/${teamId}/tasks`),
  createTask: (
    teamId: string,
    payload: {
      title: string;
      description?: string;
      category?: string;
      product_slug?: string;
      assignee_id?: string;
      due_at?: string;
    }
  ) => api.post(`/team/teams/${teamId}/tasks`, payload),
  updateTask: (
    taskId: string,
    payload: {
      status?: string;
      title?: string;
      description?: string;
      assignee_id?: string;
      due_at?: string;
    }
  ) => api.patch(`/team/tasks/${taskId}`, payload),
};

// ── Payments ──
export const paymentsAPI = {
  tiers: () => api.get("/payments/tiers"),
  checkout: (tier: string) =>
    api.post("/payments/create-checkout-session", { tier }),
};

// ── User / Profile ──
export const userAPI = {
  getProfile: () => api.get("/auth/profile"),
  updateProfile: (data: { username?: string }) =>
    api.patch("/auth/profile", data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  adminAddCredits: (amount: number) =>
    api.post("/credits/admin/add", { amount, description: "Admin self-grant" }),
};

// ── Workspaces (personal isolated spaces) ──
export interface Workspace {
  id: string;
  name: string;
  color: string;
  is_primary: boolean;
  created_at: string;
}

export const workspacesAPI = {
  list: () => api.get<Workspace[]>("/workspaces"),
  create: (name: string, color?: string) =>
    api.post<Workspace>("/workspaces", { name, color }),
  update: (id: string, data: { name?: string; color?: string }) =>
    api.patch<Workspace>(`/workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
};

// ── Mini Apps ("New App" wizard) ──
export interface MiniAppSpec {
  name: string;
  description?: string;
  tool: "canvas" | "avatar" | "adlab" | "thumbs" | "clipsy" | "trackify";
  accent?: string;
  logo_prompt?: string;
  system_prompt: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "textarea" | "select" | "number";
    options?: string[];
    default?: string | number;
  }>;
}

export interface MiniApp {
  id: string;
  slug: string;
  name: string;
  description?: string;
  logo_url?: string;
  accent: string;
  tool: string;
  spec: MiniAppSpec;
  run_count?: number;
  last_run_at?: string;
  created_at: string;
}

export type WizardReply =
  | { type: "question"; text: string; hint?: string }
  | { type: "spec"; spec: MiniAppSpec }
  | { type: "out_of_scope"; reason: string; suggestion?: string };

export const miniAppsAPI = {
  list: () => api.get<MiniApp[]>("/mini-apps"),
  get: (slug: string) => api.get<MiniApp>(`/mini-apps/${slug}`),
  delete: (id: string) => api.delete(`/mini-apps/${id}`),
  run: (slug: string, field_values: Record<string, unknown>) =>
    api.post<{ tool: string; composed_prompt: string; accent: string; name: string }>(
      `/mini-apps/${slug}/run`,
      { field_values }
    ),

  wizardStart: (initial_intent: string) =>
    api.post<{ session_id: string; reply: WizardReply }>(
      "/mini-apps/wizard/start",
      { initial_intent }
    ),
  wizardMessage: (session_id: string, user_message: string) =>
    api.post<{ reply: WizardReply; status: string }>(
      "/mini-apps/wizard/message",
      { session_id, user_message }
    ),
  create: (session_id: string) =>
    api.post<MiniApp>("/mini-apps", { session_id }),
};

export default api;
