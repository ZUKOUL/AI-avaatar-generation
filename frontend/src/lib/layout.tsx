"use client";

/**
 * Layout mode — sidebar (default, vertical rail on the left) vs
 * header (horizontal top bar; the rail is hidden so the canvas fills
 * the viewport). Persisted in localStorage so the user's choice
 * survives reload.
 *
 * Mirror of the BrandSearch / Notion / Arc "switch to header mode"
 * affordance: power users on small screens or those who don't need
 * the rail open all the time can swap to a tighter header.
 *
 * Shape mirrors ThemeProvider for consistency — same `mounted` flag
 * to prevent hydration flash, same `localStorage` key prefix
 * (`horpen-…`), same hook ergonomics.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Layout = "sidebar" | "header";

interface LayoutContextType {
  layout: Layout;
  toggleLayout: () => void;
  setLayout: (l: Layout) => void;
}

const LayoutContext = createContext<LayoutContextType>({
  layout: "sidebar",
  toggleLayout: () => {},
  setLayout: () => {},
});

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayoutState] = useState<Layout>("sidebar");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("horpen-layout") as Layout | null;
    if (saved === "sidebar" || saved === "header") {
      setLayoutState(saved);
    }
    setMounted(true);
  }, []);

  const persist = (next: Layout) => {
    setLayoutState(next);
    try {
      localStorage.setItem("horpen-layout", next);
    } catch {
      // localStorage may be disabled in private mode — fail silently,
      // the in-memory state still works for the session.
    }
  };

  const toggleLayout = () => {
    persist(layout === "sidebar" ? "header" : "sidebar");
  };

  // Defer rendering until we've read localStorage so the first paint
  // matches the persisted choice. Without this we'd flash sidebar
  // mode for users who picked header.
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <LayoutContext.Provider
      value={{ layout, toggleLayout, setLayout: persist }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
