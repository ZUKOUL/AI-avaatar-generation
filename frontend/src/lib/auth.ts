"use client";

export interface User {
  id: string;
  email: string;
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("horpen_user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("horpen_token");
}

export function storeAuth(token: string, user: User) {
  localStorage.setItem("horpen_token", token);
  localStorage.setItem("horpen_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("horpen_token");
  localStorage.removeItem("horpen_user");
}

export function isAuthenticated(): boolean {
  return !!getStoredToken();
}
