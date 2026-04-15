"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStoredUser, clearAuth } from "@/lib/auth";
import { Zap, Settings, CreditCard, SignOut, SparkleIcon } from "@/components/Icons";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
  };

  return (
    <header
      className="h-14 flex items-center justify-between px-4 md:px-6 shrink-0"
      style={{ borderBottom: "1px solid var(--border-color)" }}
    >
      <div className="pl-10 md:pl-0">
        <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] mt-0.5 hidden md:block" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/credits"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-color)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#555")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
        >
          <Zap size={14} />
          <span className="hidden sm:inline">Credits</span>
        </Link>

        {/* Profile avatar + dropdown */}
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold uppercase transition-all cursor-pointer"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                border: showDropdown ? "2px solid var(--text-muted)" : "2px solid transparent",
              }}
            >
              {user.email?.charAt(0)}
            </button>

            {showDropdown && (
              <div
                className="absolute right-0 top-full mt-2 w-52 rounded-xl py-1.5 z-50 animate-fadeIn"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1)",
                }}
              >
                {/* User info */}
                <div className="px-3 py-2 mb-1" style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {user.email}
                  </p>
                </div>

                {/* Menu items */}
                <DropdownItem
                  icon={<SparkleIcon size={16} />}
                  label="Saved Thumbnails"
                  onClick={() => { setShowDropdown(false); router.push("/dashboard/thumbnails/saved"); }}
                />
                <DropdownItem
                  icon={<Settings size={16} />}
                  label="Settings"
                  onClick={() => { setShowDropdown(false); router.push("/dashboard/settings"); }}
                />
                <DropdownItem
                  icon={<CreditCard size={16} />}
                  label="Subscription"
                  onClick={() => { setShowDropdown(false); router.push("/dashboard/settings?tab=subscription"); }}
                />

                <div className="my-1" style={{ borderTop: "1px solid var(--border-color)" }} />

                <DropdownItem
                  icon={<SignOut size={16} />}
                  label="Sign out"
                  onClick={handleLogout}
                  danger
                />
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function DropdownItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors text-left"
      style={{ color: danger ? "var(--error)" : "var(--text-secondary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      {label}
    </button>
  );
}
