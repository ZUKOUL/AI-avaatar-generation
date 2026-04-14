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
