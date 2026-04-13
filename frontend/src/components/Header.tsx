"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStoredUser } from "@/lib/auth";
import { Zap } from "@/components/Icons";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const [user, setUser] = useState<{ email: string } | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

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

        {user && (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold uppercase"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            {user.email?.charAt(0)}
          </div>
        )}
      </div>
    </header>
  );
}
