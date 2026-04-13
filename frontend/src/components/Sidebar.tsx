"use client";

import { useState, useEffect } from "react";
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
  SignOut,
  Sun,
  Moon,
  XIcon,
} from "@/components/Icons";

const NAV_MAIN = [
  { href: "/dashboard", label: "Home", icon: House },
];

const NAV_TOOLS = [
  { href: "/dashboard/avatars", label: "Avatar Creator", icon: UserCircle },
  { href: "/dashboard/images", label: "Image Generator", icon: ImageSquare },
  { href: "/dashboard/videos", label: "Video Generator", icon: VideoCamera },
];

const NAV_ACCOUNT = [
  { href: "/dashboard/credits", label: "Credits", icon: CreditCard },
];

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

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));

  const NavItem = ({
    href,
    label,
    icon: Icon,
  }: {
    href: string;
    label: string;
    icon: React.FC<{ size?: number; color?: string }>;
  }) => (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-[7px] rounded-lg text-[13px] transition-colors"
      style={{
        color: isActive(href) ? "var(--text-primary)" : "var(--text-secondary)",
        background: isActive(href) ? "var(--bg-hover)" : undefined,
        fontWeight: isActive(href) ? 600 : 400,
      }}
      onMouseEnter={(e) => {
        if (!isActive(href)) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isActive(href)) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon size={20} />
      <span>{label}</span>
    </Link>
  );

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
        <div className="space-y-0.5">
          {NAV_MAIN.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>

        <div className="mt-5 mb-1.5 px-3">
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Tools
          </span>
        </div>
        <div className="space-y-0.5">
          {NAV_TOOLS.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>

        <div className="mt-5 mb-1.5 px-3">
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Account
          </span>
        </div>
        <div className="space-y-0.5">
          {NAV_ACCOUNT.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>
      </nav>

      {/* Bottom bar */}
      <div
        className="px-3 py-3 shrink-0 space-y-2"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-[7px] rounded-lg text-[13px] transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
