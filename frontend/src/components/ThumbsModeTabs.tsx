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
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="2.5" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </svg>
    ),
  },
  {
    href: "/dashboard/thumbnails/bento",
    label: "Bento Card",
    caption: "Cards de landing page qui captent l'attention · grid",
    badge: "Nouveau",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
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

// Per-mode accent colour used for the active pill — matches the page's
// bottom-glow tint so the user always feels which sub-tool they're in.
const TINT_BY_HREF: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  "/dashboard/thumbnails": {
    bg: "linear-gradient(180deg, rgba(255,140,120,0.18) 0%, rgba(255,90,80,0.12) 100%)",
    border: "rgba(255, 90, 80, 0.55)",
    text: "#FFB3A8",
    glow: "rgba(255, 90, 80, 0.35)",
  },
  "/dashboard/thumbnails/appstore": {
    bg: "linear-gradient(180deg, rgba(110,170,255,0.18) 0%, rgba(56,138,255,0.12) 100%)",
    border: "rgba(56, 138, 255, 0.55)",
    text: "#9CC2FF",
    glow: "rgba(56, 138, 255, 0.35)",
  },
  "/dashboard/thumbnails/bento": {
    bg: "linear-gradient(180deg, rgba(110,235,200,0.18) 0%, rgba(57,220,180,0.12) 100%)",
    border: "rgba(57, 220, 180, 0.55)",
    text: "#9CECCC",
    glow: "rgba(57, 220, 180, 0.35)",
  },
};

export default function ThumbsModeTabs() {
  const pathname = usePathname();
  const activeHref = pickActiveHref(pathname);
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap" style={{ rowGap: 8 }}>
      {MODES.map((m) => {
        const active = m.href === activeHref;
        const tint = TINT_BY_HREF[m.href];
        return (
          <Link
            key={m.href}
            href={m.href}
            className="transition-all flex items-center gap-2 rounded-full"
            aria-current={active ? "page" : undefined}
            style={{
              padding: "8px 16px 8px 8px",
              background: active
                ? tint?.bg || "var(--bg-secondary)"
                : "var(--bg-secondary)",
              border:
                "1px solid " +
                (active ? tint?.border || "var(--border-color)" : "var(--border-color)"),
              color: active
                ? tint?.text || "var(--text-primary)"
                : "var(--text-secondary)",
              // The "3D pill" — inset highlight + soft outer glow when
              // active. Matches the Pikzels capsule treatment the user
              // referenced. Inactive pills stay flat for contrast.
              boxShadow: active
                ? `inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px ${tint?.glow || "transparent"}, 0 8px 24px -6px ${tint?.glow || "transparent"}`
                : "inset 0 1px 0 rgba(255,255,255,0.04)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: active
                  ? "rgba(0,0,0,0.25)"
                  : "var(--bg-primary)",
                border:
                  "1px solid " +
                  (active ? "rgba(255,255,255,0.15)" : "var(--border-color)"),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: active ? tint?.text || "var(--text-primary)" : "var(--text-primary)",
                flexShrink: 0,
              }}
            >
              {m.icon}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {m.label}
              {m.badge && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(255,255,255,0.08)",
                    color: "currentColor",
                  }}
                >
                  {m.badge}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
