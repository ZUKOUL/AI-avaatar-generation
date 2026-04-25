"use client";

/**
 * ThumbsModeTabs — segmented switch shared by the Thumbs studio
 * pages. Lets the user flip between "what kind of click-magnet
 * visual" they're producing without leaving the same UX shell :
 *
 *   • YouTube Thumbnail   /dashboard/thumbnails
 *   • App Store Screenshot /dashboard/thumbnails/appstore
 *
 * Same tile style as the rest of the dashboard — light dark border,
 * accent on active, cursor-pointer on hover.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

interface ThumbsMode {
  href: string;
  label: string;
  caption: string;
  icon: React.ReactNode;
  badge?: string;
}

const MODES: ThumbsMode[] = [
  {
    href: "/dashboard/thumbnails",
    label: "YouTube Thumbnail",
    caption: "Miniatures qui font cliquer · 16:9",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/dashboard/thumbnails/appstore",
    label: "App Store Screenshot",
    caption: "Visuels d'app pour iOS / Play Store · 9:19.5",
    badge: "Nouveau",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="2.5" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </svg>
    ),
  },
];

/**
 * Pick the mode whose href is the LONGEST matching prefix of the pathname.
 * Without this, the YouTube href "/dashboard/thumbnails" matches every
 * App Store path "/dashboard/thumbnails/appstore" too — both tabs end up
 * highlighted at the same time.
 */
function pickActiveHref(pathname: string | null): string | null {
  if (!pathname) return null;
  let best: ThumbsMode | null = null;
  for (const m of MODES) {
    const matches = pathname === m.href || pathname.startsWith(`${m.href}/`);
    if (matches && (!best || m.href.length > best.href.length)) {
      best = m;
    }
  }
  return best?.href ?? null;
}

export default function ThumbsModeTabs() {
  const pathname = usePathname();
  const activeHref = pickActiveHref(pathname);
  return (
    <div
      className="flex items-stretch gap-2 mb-6 flex-wrap"
      style={{ rowGap: 8 }}
    >
      {MODES.map((m) => {
        const active = m.href === activeHref;
        return (
          <Link
            key={m.href}
            href={m.href}
            className="rounded-xl px-4 py-3 transition-all flex items-center gap-3 min-w-[260px]"
            style={{
              background: active
                ? "var(--bg-secondary)"
                : "transparent",
              border: active
                ? "1px solid var(--border-color)"
                : "1px solid transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              flex: "1 1 260px",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: active ? "var(--bg-tertiary, #f3f4f6)" : "transparent",
                border: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-primary)",
                flexShrink: 0,
              }}
            >
              {m.icon}
            </div>
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.label}</span>
                {m.badge && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "rgba(59,130,246,0.15)",
                      color: "#3b82f6",
                      border: "1px solid rgba(59,130,246,0.3)",
                    }}
                  >
                    {m.badge}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary, #9ca3af)",
                  marginTop: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.caption}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
