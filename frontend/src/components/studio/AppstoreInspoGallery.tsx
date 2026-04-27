"use client";

/**
 * AppstoreInspoGallery — embeddable inspirations grid for the
 * App Store Studio. Lives inside the "Packs" sub-tab beside the 5
 * curated reference packs.
 *
 * Reads `/thumbnail/appstore-inspo-templates` (the curated, deduped,
 * Gemini-Flash-categorised library at
 * `app/services/niche_assets/appstore_inspo/`) and renders the entries
 * grouped by visual style. Click a card → fires the parent's
 * `onPickAnchor(url)` so the next Generate call uses the picked image
 * as the dominant style anchor (overrides the random auto-inject).
 *
 * Aspect ratio is 4:3 (the native source format) — these are mosaics
 * of multiple App Store screens stitched into a landscape row, NOT
 * single portrait phones. Forcing 9:19.5 portrait was cropping the
 * mosaics so users could only see one of the three screens at a time.
 */

import { useEffect, useState } from "react";
import { thumbnailAPI } from "@/lib/api";

interface InspoItem {
  slug: string;
  path: string;
  url: string;
  bytes?: number;
}

interface InspoResponse {
  version: number;
  styles: Record<string, string>;
  counts: Record<string, number>;
  total: number;
  buckets: Record<string, InspoItem[]>;
}

const STYLE_LABELS: Record<string, string> = {
  headline_first: "Headline-first",
  phone_mockup: "Phone mockup",
  lifestyle_photo: "Lifestyle photo",
  illustration_led: "Illustration",
  feature_callout: "Feature callout",
  social_proof: "Social proof",
  before_after: "Before / after",
  minimal_text: "Minimal",
  uncategorised: "Other",
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AppstoreInspoGalleryProps {
  /** Called with the absolute URL of the picked inspo so the parent
   *  can pin it as the template anchor for the next generation. When
   *  not provided the gallery is read-only (lightbox-only). */
  onPickAnchor?: (url: string) => void;
  /** Currently pinned anchor URL — drives the "is-active" highlight. */
  pinnedAnchorUrl?: string | null;
}

export default function AppstoreInspoGallery({
  onPickAnchor,
  pinnedAnchorUrl,
}: AppstoreInspoGalleryProps = {}) {
  const [data, setData] = useState<InspoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStyle, setActiveStyle] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await thumbnailAPI.appstoreInspoTemplates();
        if (cancelled) return;
        const payload = res.data as InspoResponse;
        setData(payload);
        const buckets = payload.buckets || {};
        const richest = Object.entries(buckets).sort(
          ([, a], [, b]) => b.length - a.length
        )[0]?.[0];
        if (richest) setActiveStyle(richest);
      } catch (err) {
        console.error("appstore inspo fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl animate-pulse"
            style={{
              aspectRatio: "4 / 3",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
          />
        ))}
      </div>
    );
  }

  const buckets = data?.buckets || {};
  const styles = Object.keys(buckets);

  if (styles.length === 0) {
    return (
      <div
        className="rounded-2xl px-6 py-14 text-center flex flex-col items-center gap-3"
        style={{
          background: "var(--bg-secondary)",
          border: "1px dashed var(--border-color)",
          color: "var(--text-secondary)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          Bibliothèque d'inspirations bientôt prête
        </div>
        <div style={{ fontSize: 12.5, maxWidth: 480, lineHeight: 1.5 }}>
          La curation tourne côté serveur. Recharge dans 1-2 min.
        </div>
      </div>
    );
  }

  const items = activeStyle ? buckets[activeStyle] || [] : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Style bucket tabs — same tab-group-pill as the rest of Thumbsy. */}
      <div className="flex justify-center">
        <div
          className="tab-group-pill"
          style={{ flexWrap: "wrap", justifyContent: "center" }}
        >
          {styles.map((s) => {
            const active = s === activeStyle;
            const count = buckets[s].length;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActiveStyle(s)}
                aria-pressed={active}
                className={
                  "flex items-center gap-2 rounded-full " +
                  (active ? "btn-premium-as" : "tab-pill-rest")
                }
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  border: active ? undefined : "1px solid transparent",
                }}
              >
                {STYLE_LABELS[s] || s}
                <span style={{ fontSize: 10.5, opacity: 0.7, fontWeight: 500 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hint banner — explain the click-to-pin behaviour. */}
      <div
        className="rounded-lg px-3 py-2 text-center"
        style={{
          background: "color-mix(in srgb, var(--text-primary) 4%, transparent)",
          border: "1px solid var(--composer-border, var(--border-color))",
          color: "var(--text-secondary)",
          fontSize: 11.5,
        }}
      >
        ✨ Clique sur une image pour l&apos;utiliser comme template — l&apos;IA
        reproduira son format sur la prochaine génération.
      </div>

      {/* 4:3 grid — native source aspect (the images are landscape
          mosaics of 3 App Store screens, forcing portrait was cropping
          them down to a single screen). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((it) => {
          const fullUrl = `${API_BASE}${it.url}`;
          const isPinned = pinnedAnchorUrl === fullUrl;
          return (
            <button
              key={it.slug}
              type="button"
              onClick={() => onPickAnchor?.(fullUrl)}
              aria-pressed={isPinned}
              className="rounded-xl overflow-hidden text-left transition-all relative"
              style={{
                aspectRatio: "4 / 3",
                background: "var(--bg-secondary)",
                border: isPinned
                  ? "2px solid var(--text-primary)"
                  : "1px solid var(--border-color)",
                cursor: onPickAnchor ? "pointer" : "default",
                padding: 0,
                boxShadow: isPinned
                  ? "0 0 0 4px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.18)"
                  : "none",
              }}
              onMouseEnter={(e) => {
                if (!onPickAnchor) return;
                e.currentTarget.style.transform = "translateY(-2px)";
                if (!isPinned) {
                  e.currentTarget.style.borderColor = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                if (!isPinned) {
                  e.currentTarget.style.borderColor = "var(--border-color)";
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fullUrl}
                alt={it.slug}
                loading="lazy"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              {isPinned && (
                <span
                  className="absolute top-2 left-2 rounded-full px-2 py-1 text-[10.5px] font-semibold"
                  style={{
                    background: "var(--text-primary)",
                    color: "var(--bg-primary)",
                  }}
                >
                  ✓ Template ancré
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
