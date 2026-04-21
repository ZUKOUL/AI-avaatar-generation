"use client";

/**
 * Sidebar — dark, product-centric, Foreplay-grade.
 *
 * Layout :
 *   - Header    : Horpen logo + collapse toggle
 *   - Products  : 3x2 grid of 3D product logos, tinted by active
 *   - Main nav  : Home / Subscription / Settings (dark list)
 *   - Upgrade   : subtle card linking to /dashboard/credits
 *   - Bottom    : user button that opens UserMenuPopover → SettingsModal
 *
 * DA choices :
 *   - Background is radial-gradient tinted by the active product color
 *     at very low opacity, so the sidebar breathes color as the user
 *     navigates between products.
 *   - Sidebar always renders dark regardless of the app theme — keeps
 *     the product brand consistent like Linear / Foreplay / Discord.
 *   - CSS vars (--bg-hover etc.) are scoped locally to the aside, so
 *     the rest of the app's light/dark theme is untouched.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getStoredUser } from "@/lib/auth";
import Logo from "@/components/Logo";
import { SettingsModal, UserMenuPopover } from "@/components/settings";
import { PRODUCTS, Product3DLogo } from "@/components/landing/shared";
import { House, CreditCard, Settings, XIcon } from "@/components/Icons";

/* ─── Main nav (non-product rows) ─── */

type NavDef = {
  href: string;
  label: string;
  icon: React.FC<{ size?: number }>;
};

const NAV_MAIN: NavDef[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/dashboard/credits", label: "Subscription", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/* ─── Collapse toggle icon ─── */

function PanelToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <line x1="6" y1="3" x2="6" y2="13" stroke="currentColor" strokeWidth="1.4" />
      {collapsed && <rect x="2.5" y="3.5" width="3" height="9" rx="1" fill="currentColor" opacity="0.5" />}
    </svg>
  );
}

/* ─── Sidebar ─── */

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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close mobile drawer on navigation.
  useEffect(() => {
    if (isMobile && onClose) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Figure out which product tab is currently active — drives the
  // background tint + the glow on the corresponding tile.
  const activeProduct = PRODUCTS.find((p) =>
    pathname?.startsWith(`/dashboard/${p.slug}`)
  );
  const tintColor = activeProduct?.color ?? "#3b82f6";

  const handleSidebarClick = () => {
    if (collapsed && onToggleCollapsed) onToggleCollapsed();
  };

  const sidebarContent = (
    <>
      {/* ── Header ── */}
      <div
        className="flex items-center px-3 h-14 shrink-0"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          justifyContent: collapsed ? "center" : "space-between",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.stopPropagation();
        }}
      >
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
            <Logo size={28} />
            <span style={{ fontSize: 15, fontWeight: 600, color: "#f3f4f6", letterSpacing: "-0.01em" }}>
              Horpen
            </span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" onClick={(e) => e.stopPropagation()}>
            <Logo size={28} />
          </Link>
        )}
        {!isMobile && onToggleCollapsed && !collapsed && (
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
            <PanelToggleIcon collapsed={collapsed} />
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
      </div>

      {/* ── Product tiles ── */}
      <div
        className="px-2.5 pt-4 pb-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {!collapsed && (
          <div
            className="px-1 mb-2"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "#4b5563",
              textTransform: "uppercase",
            }}
          >
            Produits
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: collapsed ? "1fr" : "repeat(3, 1fr)",
            gap: 6,
          }}
        >
          {PRODUCTS.map((p) => {
            const isActive = pathname?.startsWith(`/dashboard/${p.slug}`);
            return (
              <Link
                key={p.slug}
                href={`/dashboard/${p.slug}`}
                title={p.name}
                onClick={(e) => e.stopPropagation()}
                className="relative flex items-center justify-center rounded-xl transition-all"
                style={{
                  aspectRatio: "1",
                  background: isActive
                    ? `linear-gradient(145deg, ${p.color}28, ${p.color}0a)`
                    : "rgba(255,255,255,0.025)",
                  border: isActive
                    ? `1.5px solid ${p.color}60`
                    : "1px solid rgba(255,255,255,0.05)",
                  boxShadow: isActive
                    ? `0 0 24px ${p.color}35, inset 0 1px 0 rgba(255,255,255,0.08)`
                    : "none",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.025)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                  }
                }}
              >
                <Product3DLogo
                  product={p}
                  size={collapsed ? 28 : 32}
                  glow={false}
                />
                {isActive && !collapsed && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: -2,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 14,
                      height: 2,
                      borderRadius: 2,
                      background: p.color,
                      boxShadow: `0 0 8px ${p.color}`,
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Active product label — shows below the grid in expanded mode */}
        {!collapsed && activeProduct && (
          <div
            className="mt-3 mx-1 flex items-center justify-between gap-2"
            style={{
              padding: "6px 8px",
              borderRadius: 8,
              background: `linear-gradient(90deg, ${activeProduct.color}12, transparent)`,
              borderLeft: `2px solid ${activeProduct.color}`,
            }}
          >
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Actif
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f3f4f6", letterSpacing: "-0.01em" }}>
                {activeProduct.name}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Main nav ── */}
      <nav
        className="flex-1 px-2.5 py-3 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {!collapsed && (
          <div
            className="px-1 mb-1.5 mt-1"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "#4b5563",
              textTransform: "uppercase",
            }}
          >
            Général
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {NAV_MAIN.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname?.startsWith(item.href));

            // Intercept the "Settings" row so it opens the modal
            // instead of navigating to the legacy /dashboard/settings
            // page.
            const onItemClick = (e: React.MouseEvent) => {
              if (item.label === "Settings") {
                e.preventDefault();
                setSettingsOpen(true);
              }
            };

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors"
                style={{
                  color: isActive ? "#f3f4f6" : "#9ca3af",
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  border: isActive
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid transparent",
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
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Upgrade card — subtle, only when expanded */}
        {!collapsed && (
          <div
            className="mt-5 rounded-xl p-3"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.02))",
              border: "1px solid rgba(59,130,246,0.18)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "#93c5fd", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
              Upgrade
            </div>
            <div style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.4, marginBottom: 10 }}>
              Plus de crédits, 4K, A/B tests illimités.
            </div>
            <Link
              href="/dashboard/credits"
              className="inline-flex items-center gap-1.5 w-full justify-center rounded-lg"
              style={{
                padding: "6px 10px",
                background: "#3b82f6",
                color: "#ffffff",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              Voir les plans →
            </Link>
          </div>
        )}
      </nav>

      {/* ── User button ── */}
      <div
        className="shrink-0 p-2.5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {collapsed ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setUserMenuOpen(true);
            }}
            className="w-10 h-10 flex items-center justify-center rounded-lg mx-auto"
            title={user?.email ?? "Compte"}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold uppercase"
              style={{
                background: "linear-gradient(135deg, #3b82f6, #1e40af)",
                color: "#ffffff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
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
            className="w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors"
            style={{ background: userMenuOpen ? "rgba(255,255,255,0.06)" : "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            onMouseLeave={(e) => {
              if (!userMenuOpen) e.currentTarget.style.background = "transparent";
            }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold uppercase shrink-0"
              style={{
                background: "linear-gradient(135deg, #3b82f6, #1e40af)",
                color: "#ffffff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              }}
            >
              {user?.email?.charAt(0) || "?"}
            </div>
            <div className="flex-1 min-w-0 text-left">
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#6b7280", flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Popovers and modal mounted inside the sidebar so their
          positioning anchors to it. UserMenuPopover has its own
          backdrop for click-to-dismiss. */}
      <UserMenuPopover
        open={userMenuOpen}
        onClose={() => setUserMenuOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );

  // Background : dark base + radial gradient tinted by the active
  // product color at very low opacity. Transitions smoothly between
  // products via the 0.6s background transition.
  const darkBg = {
    background: `
      radial-gradient(140% 60% at 50% -20%, ${tintColor}18 0%, transparent 55%),
      linear-gradient(180deg, #0a0a12 0%, #06060d 50%, #030308 100%)
    `,
    color: "#e5e7eb",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    transition: "background 0.6s ease, width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  } as React.CSSProperties;

  // Mobile: overlay drawer.
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

  // Desktop : fixed sidebar, width driven by --sidebar-width.
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
