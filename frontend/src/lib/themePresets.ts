/**
 * Theme presets — "skinnable Horpen". Each preset re-paints the app to
 * feel like a SaaS the user is already comfortable with (Linear, Notion,
 * Vercel, Stripe, etc.) by overriding three things at runtime via CSS
 * variables on `<html>`:
 *
 *   1. --accent           → primary brand color (CTAs, focus rings, etc.)
 *   2. --font-theme       → font family. Resolves to one of the next/font
 *                            variables loaded in layout.tsx (--font-jakarta,
 *                            --font-inter) OR a literal system stack for
 *                            "Apple"-style preset.
 *   3. --radius-pill      → corner radius scale. Spotify is full-pill,
 *                            Vercel sharp, Apple generous, etc.
 *
 * Light/dark stays orthogonal — the user picks a preset AND a light/dark
 * mode independently. Preset applies a brand color that works in both.
 *
 * For proprietary fonts (Stripe Camphor, Spotify Circular, Apple SF, OpenAI
 * Söhne) we map to the closest open-source equivalent we ship.
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
  /** Corner radius applied to pills, buttons, cards. */
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
    radius: "10px",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Indigo serré, Inter, coins nets",
    accent: "#5e6ad2",
    accentSoft: "rgba(94, 106, 210, 0.10)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
    radius: "6px",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Bleu calme, Inter, cosy density",
    accent: "#2383e2",
    accentSoft: "rgba(35, 131, 226, 0.10)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
    radius: "8px",
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Mono noir, Inter, ultra sharp",
    accent: "#000000",
    accentSoft: "rgba(0, 0, 0, 0.06)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
    radius: "6px",
  },
  {
    id: "apple",
    name: "Apple",
    description: "System font, bleu macOS, gros radius",
    accent: "#0066cc",
    accentSoft: "rgba(0, 102, 204, 0.10)",
    // System font stack — feels like macOS / iOS native UI on the
    // user's machine. Distinct from the loaded web fonts.
    fontVar:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif",
    fontLabel: "System (SF Pro)",
    radius: "14px",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Indigo/violet, raffiné",
    accent: "#635bff",
    accentSoft: "rgba(99, 91, 255, 0.10)",
    fontVar: "var(--font-jakarta)",
    fontLabel: "Plus Jakarta Sans",
    radius: "8px",
  },
  {
    id: "spotify",
    name: "Spotify",
    description: "Vert forêt, full-pill, sound",
    accent: "#1db954",
    accentSoft: "rgba(29, 185, 84, 0.10)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
    radius: "999px",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    description: "Vert sapin, minimal, off-white",
    accent: "#10a37f",
    accentSoft: "rgba(16, 163, 127, 0.10)",
    fontVar: "var(--font-inter)",
    fontLabel: "Inter",
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
  root.setAttribute("data-preset", preset.id);
}
