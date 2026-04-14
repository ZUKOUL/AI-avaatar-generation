"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearAuth, getStoredUser } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
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
  { href: "/dashboard/avatars", label: "Avatar Creator", icon: UserCircle },
  { href: "/dashboard/images", label: "Image Generator", icon: ImageSquare },
  { href: "/dashboard/videos", label: "Video Generator", icon: VideoCamera },
];

const NAV_ACCOUNT: NavDef[] = [
  { href: "/dashboard/credits", label: "Subscription", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavSection({
  items,
  activeHref,
  pathname,
}: {
  items: NavDef[];
  activeHref: string | null;
  pathname: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  });

  const activeIdx = items.findIndex((i) => i.href === activeHref);

  useEffect(() => {
    const update = () => {
      if (activeIdx < 0) {
        setIndicator((s) => ({ ...s, visible: false }));
        return;
      }
      const el = itemRefs.current[activeIdx];
      const container = containerRef.current;
      if (!el || !container) return;
      const elRect = el.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      setIndicator({
        top: elRect.top - cRect.top,
        height: elRect.height,
        visible: true,
      });
    };
    update();
    const t = setTimeout(update, 60);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", update);
    };
  }, [activeIdx, pathname]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl p-1"
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
            transition: "top 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
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
            className="relative z-[1] flex items-center gap-3 px-2.5 py-[8px] rounded-lg text-[13px]"
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
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
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

  const sidebarContent = (
    <>
      {/* Logo */}
      <div
        className="flex items-center justify-between px-4 h-[52px] shrink-0"
        style={{ borderBottom: "1px solid var(--border-color)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: theme === "dark" ? "#fff" : "#1a1a1a" }}
          >
            <span
              className="text-[12px] font-bold"
              style={{ color: theme === "dark" ? "#000" : "#fff" }}
            >
              H
            </span>
          </div>
          <span className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Horpen.ai
          </span>
        </div>
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <XIcon size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 pt-3">
        <NavSection items={NAV_MAIN} activeHref={activeHref} pathname={pathname} />

        <div className="mt-5 mb-1.5 px-3">
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Tools
          </span>
        </div>
        <NavSection items={NAV_TOOLS} activeHref={activeHref} pathname={pathname} />

        <div className="mt-5 mb-1.5 px-3">
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Account
          </span>
        </div>
        <NavSection items={NAV_ACCOUNT} activeHref={activeHref} pathname={pathname} />
      </nav>

      {/* Bottom bar */}
      <div
        className="px-3 py-3 shrink-0 space-y-2"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-[8px] rounded-xl text-[13px]"
          style={{
            color: "var(--text-secondary)",
            border: "1px solid transparent",
            transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease",
          }}
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
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>

        <div className="flex items-center justify-between">
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

  // Desktop: fixed sidebar
  return (
    <aside
      className="fixed left-0 top-0 h-full z-40 flex flex-col"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
      }}
    >
      {sidebarContent}
    </aside>
  );
}
