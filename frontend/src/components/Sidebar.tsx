"use client";

/**
 * Sidebar — dark, product-centric, inspired by modern SaaS dashboards.
 *
 * Layout :
 *   - Header     : Horpen logo + collapse toggle
 *   - Products   : single horizontal row of 6 product 3D tiles
 *   - Active pill: small chip below the tiles with the active product
 *                  name and its keyboard shortcut
 *   - Main nav   : Home / Search / Starred (compact rows)
 *   - Upgrade    : subtle trial/upgrade card
 *   - Bottom     : user button → UserMenuPopover → SettingsModal
 *
 * The whole sidebar is always dark regardless of app theme. A radial
 * gradient tint based on the active product colour washes the header
 * area so the bar breathes colour as you navigate.
 *
 * Keyboard shortcuts : ⌘/Ctrl + S/C/A/D/T/L jumps to each product.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getStoredUser } from "@/lib/auth";
import Logo from "@/components/Logo";
import { SettingsModal, UserMenuPopover } from "@/components/settings";
import {
  PRODUCTS,
  Product3DLogo,
  ProductSlug,
  PRODUCT_APP_ROUTES,
} from "@/components/landing/shared";
import { House, Search, Star, XIcon } from "@/components/Icons";

/* Collapse toggle glyph. */
function PanelToggleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <line x1="6" y1="3" x2="6" y2="13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

interface SidebarProps {
  open: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function Sidebar({ open, onClose, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const user = typeof window !== "undefined" ? getStoredUser() : null;
  const [isMobile, setIsMobile] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hovered, setHovered] = useState<ProductSlug | null>(null);
  /** When collapsed, hovering the top-left Horpen logo swaps it for a
   *  clickable "expand sidebar" toggle icon. Reverts on mouse leave. */
  const [logoHover, setLogoHover] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close drawer on navigation (mobile).
  useEffect(() => {
    if (isMobile && onClose) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);



  // Active product detection checks every path that counts as
  // "belonging" to a product (Canvas = /videos + /images, Avatar =
  // /avatars + /characters, etc. — see PRODUCT_APP_ROUTES).
  const activeProduct = PRODUCTS.find((p) =>
    PRODUCT_APP_ROUTES[p.slug].paths.some((path) =>
      pathname === path || pathname?.startsWith(`${path}/`)
    )
  );
  const hoveredProduct = hovered
    ? PRODUCTS.find((p) => p.slug === hovered)
    : null;
  const shownProduct = hoveredProduct ?? activeProduct;
  const tintColor = shownProduct?.color ?? activeProduct?.color ?? "#3b82f6";

  const handleSidebarClick = () => {
    if (collapsed && onToggleCollapsed) onToggleCollapsed();
  };

  const NAV_ROWS: { href: string; label: string; icon: React.FC<{ size?: number }>; action?: () => void }[] = [
    { href: "/dashboard", label: "Home", icon: House },
    { href: "/dashboard/search", label: "Search…", icon: Search },
    { href: "/dashboard/starred", label: "Starred", icon: Star },
  ];

  const sidebarContent = (
    <>
      {/* ── Header ──
            Collapsed : Horpen logo crossfades on hover to a clickable
            toggle icon, so the user always has a one-click way to
            re-expand the sidebar even if they don't realise empty
            space also works. */}
      <div
        className="flex items-center px-4 h-14 shrink-0"
        style={{
          justifyContent: collapsed ? "center" : "space-between",
        }}
      >
        {!collapsed ? (
          <>
            <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
              <Logo size={26} />
              <span style={{ fontSize: 15, fontWeight: 600, color: "#f3f4f6", letterSpacing: "-0.01em" }}>
                Horpen
              </span>
            </Link>
            {!isMobile && onToggleCollapsed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapsed();
                }}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: "#6b7280" }}
                title="Collapse sidebar"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "#e5e7eb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#6b7280";
                }}
              >
                <PanelToggleIcon />
              </button>
            )}
            {isMobile && onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 rounded-md"
                style={{ color: "#6b7280" }}
              >
                <XIcon size={16} />
              </button>
            )}
          </>
        ) : (
          <div
            className="relative"
            style={{ width: 30, height: 30 }}
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
          >
            {/* Horpen logo (default) */}
            <Link
              href="/dashboard"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: logoHover && onToggleCollapsed ? 0 : 1,
                transition: "opacity 0.18s ease",
                pointerEvents: logoHover && onToggleCollapsed ? "none" : "auto",
              }}
            >
              <Logo size={26} />
            </Link>
            {/* Expand-sidebar toggle (appears on hover) */}
            {onToggleCollapsed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapsed();
                }}
                title="Ouvrir la sidebar"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.06)",
                  color: "#e5e7eb",
                  opacity: logoHover ? 1 : 0,
                  transition: "opacity 0.18s ease",
                  pointerEvents: logoHover ? "auto" : "none",
                  cursor: "pointer",
                }}
              >
                <PanelToggleIcon />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Product tiles : single horizontal row in expanded mode,
            stacked vertically when collapsed. Empty space between tiles
            intentionally lets clicks bubble up so the collapsed
            sidebar can reopen — interactive children stop propagation
            individually. ── */}
      <div className={collapsed ? "px-2 pb-3" : "px-4 pb-1"}>
        <div
          style={{
            display: "flex",
            flexDirection: collapsed ? "column" : "row",
            alignItems: "center",
            gap: collapsed ? 8 : 6,
            flexWrap: collapsed ? "nowrap" : "nowrap",
          }}
        >
          {PRODUCTS.map((p) => {
            const routes = PRODUCT_APP_ROUTES[p.slug];
            const isActive = routes.paths.some(
              (path) => pathname === path || pathname?.startsWith(`${path}/`)
            );
            return (
              <Link
                key={p.slug}
                href={routes.href}
                title={p.name}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setHovered(p.slug)}
                onMouseLeave={() => setHovered(null)}
                className="relative flex items-center justify-center rounded-xl transition-all"
                style={{
                  width: collapsed ? 40 : "100%",
                  aspectRatio: "1",
                  flex: collapsed ? undefined : "1 1 0",
                  background: isActive
                    ? `linear-gradient(145deg, ${p.color}22, ${p.color}08)`
                    : "rgba(255,255,255,0.02)",
                  border: isActive
                    ? `1.5px solid ${p.color}70`
                    : "1px solid rgba(255,255,255,0.05)",
                  boxShadow: isActive
                    ? `0 0 22px ${p.color}38, inset 0 1px 0 rgba(255,255,255,0.08)`
                    : "none",
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "scale(0.96)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <Product3DLogo
                  product={p}
                  size={collapsed ? 28 : 30}
                  glow={false}
                />
              </Link>
            );
          })}
        </div>

        {/* Active / hovered chip — just the product name, no shortcut */}
        {!collapsed && shownProduct && (
          <div
            key={shownProduct.slug /* re-render per product to restart fade */}
            className="mt-3 mx-auto inline-flex items-center px-2.5 py-1.5 rounded-lg"
            style={{
              background: "rgba(15,15,20,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
              animation: "sidebar-chip-in 0.25s ease-out forwards",
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#f3f4f6", letterSpacing: "-0.01em" }}>
              {shownProduct.name}
            </span>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes sidebar-chip-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Main nav ── */}
      <nav
        className={collapsed ? "flex-1 overflow-y-auto px-2 py-2" : "flex-1 overflow-y-auto px-3 py-3"}
      >
        <div className="flex flex-col gap-0.5">
          {NAV_ROWS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.action) {
                    e.preventDefault();
                    item.action();
                  }
                }}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors"
                style={{
                  color: isActive ? "#f3f4f6" : "#9ca3af",
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  justifyContent: collapsed ? "center" : "flex-start",
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.color = "#e5e7eb";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#9ca3af";
                  }
                }}
              >
                <Icon size={16} />
                {!collapsed && <span className="flex-1">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Upgrade card ── */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <div
            className="rounded-xl p-3.5"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f3f4f6", marginBottom: 4 }}>
              Passe au plan supérieur
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.45, marginBottom: 12 }}>
              Plus de crédits, 4K, A/B tests illimités, toute la suite.
            </div>
            <Link
              href="/dashboard/credits"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg"
              style={{
                padding: "8px 10px",
                background: "#ffffff",
                color: "#0a0a0a",
                fontSize: 12.5,
                fontWeight: 600,
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
              Upgrade Horpen
            </Link>
          </div>
        </div>
      )}

      {/* ── User row ── */}
      <div
        className="shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {collapsed ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setUserMenuOpen(true);
            }}
            className="w-full h-14 flex items-center justify-center"
            title={user?.email ?? "Compte"}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold uppercase"
              style={{
                background: "linear-gradient(135deg, #3b82f6, #1e40af)",
                color: "#ffffff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
              }}
            >
              {user?.email?.charAt(0) || "?"}
            </div>
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setUserMenuOpen(true);
            }}
            className="w-full flex items-center justify-between px-3 h-14 transition-colors"
            style={{
              background: userMenuOpen ? "rgba(255,255,255,0.04)" : "transparent",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            onMouseLeave={(e) => {
              if (!userMenuOpen) e.currentTarget.style.background = "transparent";
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold uppercase shrink-0"
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #1e40af)",
                  color: "#ffffff",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                }}
              >
                {user?.email?.charAt(0) || "?"}
              </div>
              <div className="min-w-0 text-left">
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#f3f4f6",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.email?.split("@")[0] || "Utilisateur"}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.email || ""}
                </div>
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#6b7280", flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      <UserMenuPopover
        open={userMenuOpen}
        onClose={() => setUserMenuOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );

  // Dark theme + radial tint driven by the active / hovered product.
  const darkBg: React.CSSProperties = {
    background: `
      radial-gradient(140% 45% at 50% 0%, ${tintColor}1c 0%, transparent 55%),
      linear-gradient(180deg, #0a0b14 0%, #070810 50%, #040510 100%)
    `,
    color: "#e5e7eb",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    transition: "background 0.5s ease, width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  };

  if (isMobile) {
    return (
      <>
        {open && (
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
            onClick={onClose}
          />
        )}
        <aside
          className="fixed left-0 top-0 h-full z-50 flex flex-col"
          style={{
            width: "280px",
            transform: open ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            ...darkBg,
          }}
        >
          {sidebarContent}
        </aside>
      </>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full z-40 flex flex-col"
      style={{
        width: "var(--sidebar-width)",
        cursor: collapsed ? "pointer" : "default",
        ...darkBg,
      }}
      onClick={handleSidebarClick}
    >
      {sidebarContent}
    </aside>
  );
}
