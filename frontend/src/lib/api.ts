import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("horpen_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
  list: () => api.get("/avatar/avatars"),
  getImages: (avatarId?: string, limit = 50) =>
    api.get("/avatar/images", { params: { avatar_id: avatarId, limit } }),
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
  /** Available ElevenLabs voices (for the voice picker). */
  voices: () => api.get("/ai-videos/voices"),
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

export default api;
