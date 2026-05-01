"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import {
  applyPreset,
  DEFAULT_PRESET_ID,
  THEME_PRESETS,
} from "./themePresets";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  /** Currently active preset id (e.g. "linear", "notion", "horpen"). */
  preset: string;
  /** Set + persist a preset by id. Validated against THEME_PRESETS. */
  setPreset: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
  preset: DEFAULT_PRESET_ID,
  setPreset: () => {},
});

const PRESET_STORAGE_KEY = "horpen-theme-preset";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [preset, setPresetState] = useState<string>(DEFAULT_PRESET_ID);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Read saved theme from localStorage
    const savedTheme = localStorage.getItem("horpen-theme") as Theme | null;
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = prefersDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.setAttribute("data-theme", initial);
    }

    // Read saved preset from localStorage. The inline script in
    // layout.tsx already applied it before React mounted, but we
    // still hydrate React state so the settings UI reflects the
    // active value when the user opens the picker.
    const savedPreset = localStorage.getItem(PRESET_STORAGE_KEY);
    const validId =
      savedPreset && THEME_PRESETS.some((p) => p.id === savedPreset)
        ? savedPreset
        : DEFAULT_PRESET_ID;
    setPresetState(validId);
    // Re-apply just to be safe — handles cases where the inline
    // script ran before localStorage was readable (rare race).
    applyPreset(validId);

    setMounted(true);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("horpen-theme", next);
      return next;
    });
  }, []);

  const setPreset = useCallback((id: string) => {
    if (!THEME_PRESETS.some((p) => p.id === id)) return;
    setPresetState(id);
    applyPreset(id);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, id);
    } catch {
      /* localStorage might be blocked — non-fatal, the apply above
         still re-skinned the live page; only persistence is lost. */
    }
  }, []);

  // Prevent flash of wrong theme. We render children either way so
  // the page is interactive — the inline <head> script already set
  // the right attributes on <html> so the visual match is in place.
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, preset, setPreset }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
