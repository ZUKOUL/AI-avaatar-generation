"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearAuth, getStoredUser } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import Logo from "@/components/Logo";
import {
  House,
  UserCircle,
  ImageSquare,
  VideoCamera,
  CreditCard,
  Settings,
  SignOut,
  Sun,
  Moon,
  XIcon,
  MagicWand,
  PlaySquare,
  Megaphone,
  Scissors,
  SparkleIcon,
} from "@/components/Icons";

type NavDef = {
  href: string;
  label: string;
  icon: React.FC<{ size?: number; color?: string }>;
};

const NAV_MAIN: NavDef[] = [
  { href: "/dashboard", label: "Home", icon: House },
];

const NAV_TOOLS: NavDef[] = [
  { href: "/dashboard/characters", label: "Characters", icon: UserCircle },
  { href: "/dashboard/avatars", label: "Avatar Creator", icon: MagicWand },
  { href: "/dashboard/images", label: "Image Generator", icon: ImageSquare },
  { href: "/dashboard/thumbnails", label: "Thumbnails", icon: PlaySquare },
  { href: "/dashboard/ads", label: "Ads", icon: Megaphone },
  { href: "/dashboard/videos", label: "Video Generator", icon: VideoCamera },
  { href: "/dashboard/clips", label: "Auto-Clip", icon: Scissors },
  { href: "/dashboard/ai-videos", label: "AI Video", icon: SparkleIcon },
];

const NAV_ACCOUNT: NavDef[] = [
  { href: "/dashboard/credits", label: "Subscription", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/**
 * Sidebar toggle glyph — two-pane rectangle with the active pane highlighted.
 * Kept inline so it can flip direction cleanly via `flipped`.
 */
function PanelToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ transition: "transform 0.25s ease" }}
    >
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <line
        x1={collapsed ? "6" : "6"}
        y1="3"
        x2={collapsed ? "6" : "6"}
        y2="13"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/**
 * NavSection — renders one group of nav items either as a segmented toggle
 * (expanded) or as a stack of icon-only buttons (collapsed). The animated
 * active-indicator pill is only meaningful in expanded mode, so collapsed
 * mode renders a simpler per-item active state.
 */
function NavSection({
  items,
  activeHref,
  pathname,
  collapsed,
}: {
  items: NavDef[];
  activeHref: string | null;
  pathname: string | null;
  collapsed: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ top: number; height: number; visible: boolean; animate: boolean }>({
    top: 0,
    height: 0,
    visible: false,
    animate: false,
  });
  // Track previous collapsed state so we can distinguish "sidebar just
  // expanded" (needs a snap + re-enable cycle) from "user navigated"
  // (should animate the pill directly).
  const prevCollapsedRef = useRef(collapsed);

  const activeIdx = items.findIndex((i) => i.href === activeHref);

  useEffect(() => {
    if (collapsed) {
      setIndicator((s) => ({ ...s, visible: false, animate: false }));
      prevCollapsedRef.current = true;
      return;
    }

    // Did the sidebar just expand from collapsed state?
    const sidebarJustExpanded = prevCollapsedRef.current === true;
    prevCollapsedRef.current = false;

    let cancelled = false;
    const updatePosition = (animate: boolean) => {
      if (cancelled) return;
      if (activeIdx < 0) {
        setIndicator((s) => ({ ...s, visible: false }));
        return;
      }
      const el = itemRefs.current[activeIdx];
      const container = containerRef.current;
      if (!el || !container) return;
      const elRect = el.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      setIndicator({ top: elRect.top - cRect.top, height: elRect.height, visible: true, animate });
    };

    let raf: number;
    let t: ReturnType<typeof setTimeout> | undefined;

    if (sidebarJustExpanded) {
      // Sidebar width is mid-transition: snap the pill to its spot first,
      // then re-enable the slide animation once the transition settles.
      raf = requestAnimationFrame(() => updatePosition(false));
      t = setTimeout(() => { if (!cancelled) updatePosition(true); }, 280);
    } else {
      // Normal navigation: animate the pill sliding to the new active item.
      raf = requestAnimationFrame(() => updatePosition(true));
    }

    const onResize = () => {
      if (activeIdx < 0) return;
      const el = itemRefs.current[activeIdx];
      const container = containerRef.current;
      if (!el || !container) return;
      const elRect = el.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      setIndicator((s) => ({ ...s, top: elRect.top - cRect.top, height: elRect.height }));
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [activeIdx, pathname, collapsed]);

  // Collapsed: icon-only column, no segmented background.
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => e.stopPropagation()}
              title={item.label}
              className="w-10 h-10 flex items-center justify-center rounded-lg"
              style={{
                background: active ? "var(--segment-active-bg)" : "transparent",
                boxShadow: active ? "var(--shadow-segment-active)" : "none",
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                transition: "background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              <Icon size={18} />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl p-1 overflow-hidden"
      style={{
        background: "var(--segment-bg)",
        boxShadow: "var(--shadow-segment-inset)",
      }}
    >
      {indicator.visible && (
        <div
          className="absolute left-1 right-1 rounded-lg pointer-events-none"
          style={{
            top: indicator.top,
            height: indicator.height,
            background: "var(--segment-active-bg)",
            boxShadow: "var(--shadow-segment-active)",
            transition: indicator.animate
              ? "top 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
              : "none",
          }}
        />
      )}
      {items.map((item, i) => {
        const Icon = item.icon;
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            href={item.href}
            onClick={(e) => e.stopPropagation()}
            className="relative z-[1] flex items-center h-9 gap-3 px-2.5 rounded-lg text-[13px] whitespace-nowrap overflow-hidden"
            style={{
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: active ? 600 : 400,
              transition: "color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <Icon size={18} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function Sidebar({ open, onClose, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const user = typeof window !== "undefined" ? getStoredUser() : null;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close drawer on navigation (mobile)
  useEffect(() => {
    if (isMobile && onClose) onClose();
  }, [pathname]);

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
  };

  // Compute active href across all sections
  const allItems = [...NAV_MAIN, ...NAV_TOOLS, ...NAV_ACCOUNT];
  const activeHref =
    allItems.find(
      (i) => pathname === i.href || (i.href !== "/dashboard" && pathname?.startsWith(i.href))
    )?.href ?? null;

  // When collapsed, clicks on empty sidebar area expand it back. Individual
  // buttons/links stop propagation so they don't accidentally trigger this.
  const handleSidebarClick = () => {
    if (collapsed && onToggleCollapsed) onToggleCollapsed();
  };

  const sidebarContent = (
    <>
      {/* Logo + collapse toggle */}
      <div
        className="flex items-center px-4 h-14 shrink-0"
        style={{
          borderBottom: "1px solid var(--border-color)",
          justifyContent: collapsed ? "center" : "space-between",
        }}
        onClick={(e) => {
          // Let children handle their own clicks; ignore header background.
          if (e.target === e.currentTarget) e.stopPropagation();
        }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
            <Logo size={28} />
            <span
              className="text-[15px] font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Horpen
            </span>
          </div>
        )}
        {isMobile && onClose && !collapsed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <XIcon size={18} />
          </button>
        )}
        {!isMobile && onToggleCollapsed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed();
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <PanelToggleIcon collapsed={collapsed} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav
        className={`flex-1 overflow-y-auto pt-3 ${collapsed ? "px-2" : "px-2.5"}`}
      >
        <NavSection
          items={NAV_MAIN}
          activeHref={activeHref}
          pathname={pathname}
          collapsed={collapsed}
        />

        {!collapsed && (
          <div className="mt-5 mb-1.5 px-3">
            <span
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Tools
            </span>
          </div>
        )}
        {collapsed && <div className="mt-4" />}
        <NavSection
          items={NAV_TOOLS}
          activeHref={activeHref}
          pathname={pathname}
          collapsed={collapsed}
        />

        {!collapsed && (
          <div className="mt-5 mb-1.5 px-3">
            <span
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Account
            </span>
          </div>
        )}
        {collapsed && <div className="mt-4" />}
        <NavSection
          items={NAV_ACCOUNT}
          activeHref={activeHref}
          pathname={pathname}
          collapsed={collapsed}
        />
      </nav>

      {/* Bottom bar */}
      <div
        className={`shrink-0 ${collapsed ? "px-2 py-3 space-y-1 flex flex-col items-center" : "px-3 py-3 space-y-2"}`}
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTheme();
          }}
          className={
            collapsed
              ? "w-10 h-10 flex items-center justify-center rounded-lg transition-colors"
              : "w-full flex items-center gap-3 px-3 py-[8px] rounded-xl text-[13px]"
          }
          style={{
            color: "var(--text-secondary)",
            border: "1px solid transparent",
            transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease",
          }}
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>

        {collapsed ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleLogout();
            }}
            className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
            title={user?.email ? `Sign out (${user.email})` : "Sign out"}
            aria-label="Sign out"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <SignOut size={16} />
          </button>
        ) : (
          <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold uppercase shrink-0"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                {user?.email?.charAt(0) || "?"}
              </div>
              <span className="text-[12px] truncate" style={{ color: "var(--text-secondary)" }}>
                {user?.email || ""}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md transition-colors shrink-0"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              <SignOut size={16} />
            </button>
          </div>
        )}
      </div>
    </>
  );

  // Mobile: overlay drawer
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {open && (
          <div
            className="fixed inset-0 z-40 transition-opacity"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={onClose}
          />
        )}
        {/* Drawer */}
        <aside
          className="fixed left-0 top-0 h-full z-50 flex flex-col transition-transform duration-200"
          style={{
            width: "260px",
            background: "var(--bg-secondary)",
            borderRight: "1px solid var(--border-color)",
            transform: open ? "translateX(0)" : "translateX(-100%)",
          }}
        >
          {sidebarContent}
        </aside>
      </>
    );
  }

  // Desktop: fixed sidebar with width bound to the CSS variable set by layout.
  return (
    <aside
      className="fixed left-0 top-0 h-full z-40 flex flex-col"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        cursor: collapsed ? "pointer" : "default",
      }}
      onClick={handleSidebarClick}
    >
      {sidebarContent}
    </aside>
  );
}
