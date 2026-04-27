"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isAuthenticated } from "@/lib/auth";

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
          // When collapsed, the fixed sidebar narrows to 64px and the main
          // region reclaims the freed space via its `md:ml-[var(--sidebar-width)]`.
          ["--sidebar-width" as string]: collapsed ? "64px" : "260px",
        } as React.CSSProperties
      }
    >
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={handleToggleCollapsed}
      />

      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-3 left-3 z-30 p-2 rounded-lg md:hidden transition-colors"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
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
