/**
 * Theme presets — "skinnable Horpen". Each preset re-paints the app to
 * feel like a SaaS the user is already comfortable with (Linear, Notion,
 * Vercel, Stripe, etc.) by overriding a small set of design tokens at
 * runtime via CSS variables on `<html>`.
 *
 * Why this works without rebuilding the app : every styled component
 * that opted in reads `var(--accent)`, `var(--font-theme)`,
 * `var(--radius-md)`, `var(--shadow-elev)`, etc. Switching a preset
 * just rewrites those vars and the live page repaints.
 *
 * Light/dark stays orthogonal — the user picks a preset AND a light/
 * dark mode independently. Preset applies a brand color + font + radius
 * scale + shadow profile that work in both modes.
 */

export interface ThemePreset {
  id: string;
  name: string;
  /** One-line vibe description shown under the name in the picker. */
  description: string;
  /** Primary brand color. Hex. */
  accent: string;
  /** Soft variant for hover backgrounds (8% alpha typically). */
  accentSoft: string;
  /** CSS variable name for the font family OR a literal font stack
   *  string (used for Apple's system font). */
  fontVar: string;
  /** Human-friendly font label shown in the picker. */
  fontLabel: string;
  /** Radius scale — three steps (small chips → medium cards → large
   *  modals). Each preset has its own personality here : Linear is
   *  sharp (4-6-8), Apple generous (10-14-20), Spotify full-pill
   *  (999 everywhere). */
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  /** Single elevation shadow applied to raised elements. Each preset
   *  picks a profile that matches its DNA :
   *    - flat       → barely-there 1px hairline
   *    - subtle     → tight close-shadow (Linear/Notion default)
   *    - lifted     → noticeable drop with depth (Horpen, Stripe)
   *    - soft       → diffuse generous shadow (Apple, Spotify) */
  shadowElev: string;
  /** Default radius applied to pills and buttons (= radiusMd, surfaced
   *  separately because the legacy `--radius-pill` variable already
   *  exists and components rely on it). */
  radius: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "horpen",
    name: "Horpen",
    description: "Le défaut — Plus Jakarta Sans, bleu signature",
    accent: "#3b82f6",
    accentSoft: "rgba(59, 130, 246, 0.10)",
    fontVar: "var(--font-jakarta)",
    fontLabel: "Plus Jakarta Sans",
    radiusSm: "8px",
    radiusMd: "10px",
    radiusLg: "14px",
    shadowElev: "0 4px 16px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)",
    radius: "10px",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Indigo serré, Inter, coins nets, ombres minimalistes",
    accent: "#5e6ad2",
    accentSoft: "rgba(94, 106, 210, 0.10)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
    radiusSm: "4px",
    radiusMd: "6px",
    radiusLg: "8px",
    shadowElev: "0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
    radius: "6px",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Bleu calme, Inter, cosy density, ombres soft",
    accent: "#2383e2",
    accentSoft: "rgba(35, 131, 226, 0.10)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
    radiusSm: "6px",
    radiusMd: "8px",
    radiusLg: "10px",
    shadowElev: "0 2px 6px rgba(0,0,0,0.08)",
    radius: "8px",
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Mono noir, Inter, ultra sharp, zéro ombre",
    accent: "#000000",
    accentSoft: "rgba(0, 0, 0, 0.06)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
    radiusSm: "4px",
    radiusMd: "6px",
    radiusLg: "8px",
    shadowElev: "0 0 0 1px rgba(0,0,0,0.08)",
    radius: "6px",
  },
  {
    id: "apple",
    name: "Apple",
    description: "System SF, bleu macOS, gros radius, ombres soft diffuses",
    accent: "#0066cc",
    accentSoft: "rgba(0, 102, 204, 0.10)",
    fontVar:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif",
    fontLabel: "System (SF Pro)",
    radiusSm: "10px",
    radiusMd: "14px",
    radiusLg: "20px",
    shadowElev: "0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
    radius: "14px",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Indigo/violet, Plus Jakarta, raffiné, ombres mid-elevated",
    accent: "#635bff",
    accentSoft: "rgba(99, 91, 255, 0.10)",
    fontVar: "var(--font-jakarta)",
    fontLabel: "Plus Jakarta Sans",
    radiusSm: "6px",
    radiusMd: "8px",
    radiusLg: "12px",
    shadowElev: "0 6px 20px rgba(99,91,255,0.10), 0 1px 3px rgba(0,0,0,0.08)",
    radius: "8px",
  },
  {
    id: "spotify",
    name: "Spotify",
    description: "Vert forêt, Inter, full-pill, ombres dramatiques",
    accent: "#1db954",
    accentSoft: "rgba(29, 185, 84, 0.10)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
    radiusSm: "999px",
    radiusMd: "999px",
    radiusLg: "16px",
    shadowElev: "0 12px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
    radius: "999px",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    description: "Vert sapin, Inter, off-white, ombres minimal",
    accent: "#10a37f",
    accentSoft: "rgba(16, 163, 127, 0.10)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
    radiusSm: "8px",
    radiusMd: "10px",
    radiusLg: "12px",
    shadowElev: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
    radius: "10px",
  },
];

export const DEFAULT_PRESET_ID = "horpen";

export function getPresetById(id: string): ThemePreset {
  return (
    THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0]
  );
}

/**
 * Apply a preset by writing its tokens onto the `<html>` element. Pure
 * runtime — no rebuild, no remount. The CSS rules in globals.css read
 * these variables, so changes propagate to every component instantly.
 */
export function applyPreset(presetId: string): void {
  if (typeof document === "undefined") return;
  const preset = getPresetById(presetId);
  const root = document.documentElement;
  root.style.setProperty("--accent", preset.accent);
  root.style.setProperty("--accent-soft", preset.accentSoft);
  root.style.setProperty("--font-theme", preset.fontVar);
  root.style.setProperty("--radius-pill", preset.radius);
  root.style.setProperty("--radius-sm", preset.radiusSm);
  root.style.setProperty("--radius-md", preset.radiusMd);
  root.style.setProperty("--radius-lg", preset.radiusLg);
  root.style.setProperty("--shadow-elev", preset.shadowElev);
  root.setAttribute("data-preset", preset.id);
}
