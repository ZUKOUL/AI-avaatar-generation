"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isAuthenticated } from "@/lib/auth";
import { useLayout } from "@/lib/layout";

/**
 * Dashboard layout.
 *
 * Owns the collapsed-sidebar state and exposes it to children via a CSS
 * custom property `--sidebar-width`. Both the fixed `<Sidebar />` and the
 * `ml-[var(--sidebar-width)]` on the main region read the same variable,
 * so toggling collapsed shifts the layout in one place.
 *
 * Persistence: the preference is saved to localStorage so a refresh keeps
 * the state. SSR-safe default is "expanded".
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Layout mode — sidebar (vertical rail, default) vs header (rail
  // hidden so the canvas takes the full width). User can toggle from
  // the user menu. When `header`, we collapse `--sidebar-width` to 0px
  // so the main region reclaims the entire viewport, and the
  // <Sidebar /> renders with `display: none` driven by the same flag.
  const { layout, toggleLayout } = useLayout();
  const isHeaderMode = layout === "header";

  // Load persisted collapsed preference on mount (client-only).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebarCollapsed") === "true");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [router]);

  const handleToggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebarCollapsed", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={
        {
          background: "var(--bg-primary)",
          // Header mode collapses the sidebar to 0px so the main panel
          // takes the whole viewport. Otherwise it's 64px collapsed
          // (icon-only) or 260px expanded.
          ["--sidebar-width" as string]: isHeaderMode
            ? "0px"
            : collapsed ? "64px" : "260px",
        } as React.CSSProperties
      }
    >
      <div style={{ display: isHeaderMode ? "none" : undefined }}>
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapsed={handleToggleCollapsed}
        />
      </div>

      {/* Mobile hamburger — also serves as the "open sidebar" affordance
          when the user is in header mode and wants to switch back. */}
      <button
        onClick={() => {
          if (isHeaderMode) {
            // In header mode the rail is hidden — clicking the burger
            // returns to sidebar mode rather than just opening a mobile
            // drawer that leads nowhere.
            toggleLayout();
          } else {
            setSidebarOpen(true);
          }
        }}
        className={
          "fixed top-3 left-3 z-30 p-2 rounded-lg transition-colors " +
          (isHeaderMode ? "" : "md:hidden")
        }
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
        title={isHeaderMode ? "Switch to sidebar mode" : "Open sidebar"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/*
        Main panel — inherits the global theme set on <html> by the
        ThemeProvider. The `data-theme="light"` we used to hardcode
        here was the legacy "two-tone shell" (dark sidebar + always-
        light main). Removed so the user's chosen theme propagates
        to the whole app via the toggle in the user menu.
      */}
      <main
        className="flex-1 flex flex-col overflow-hidden md:ml-[var(--sidebar-width)]"
        style={{
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          transition: "margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
