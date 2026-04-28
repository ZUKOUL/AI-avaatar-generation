"use client";

/**
 * BentoTemplatesGallery — embeddable templates view for the Bento Card
 * Studio's "Templates" sub-tab. Sister of MiniatureTemplatesGallery
 * (YouTube) and AppstoreInspoGallery (App Store): same shell, same
 * tab-group-pill bucket selector, same `onPick(url)` callback so the
 * parent can open a MediaDetailView preview drawer with a "Recréer"
 * primary CTA.
 *
 * Reads `/thumbnail/bento-templates` (the curated, deduped,
 * Flash-categorised library at `app/services/niche_assets/bento/`).
 * Cards render at native ~16:10 aspect — bento landing-page tiles are
 * landscape-leaning, never portrait.
 */

import { useEffect, useState } from "react";
import { thumbnailAPI } from "@/lib/api";

interface TemplateItem {
  slug: string;
  path: string;
  url: string;
  bytes?: number;
}

interface TemplatesResponse {
  version: number;
  styles: Record<string, string>;
  counts: Record<string, number>;
  total: number;
  buckets: Record<string, TemplateItem[]>;
}

const STYLE_LABELS: Record<string, string> = {
  minimal_light: "Minimal light",
  dark_tech: "Dark tech",
  illustration: "Illustration",
  dashboard_mockup: "Dashboard",
  split: "Split",
  colorful_playful: "Colorful",
  editorial_text: "Editorial",
  collage: "Collage",
  uncategorised: "Other",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface BentoTemplatesGalleryProps {
  /** Called with the absolute image URL when the user clicks a card.
   *  The parent typically opens a MediaDetailView slide-bar with the
   *  picked image so the "click an image → drawer" pattern stays
   *  consistent across all three studios. */
  onPick?: (url: string) => void;
  /** Active anchor URL — drives the highlighted "is-pinned" border on
   *  the matching card. */
  pinnedAnchorUrl?: string | null;
}

export default function BentoTemplatesGallery({
  onPick,
  pinnedAnchorUrl,
}: BentoTemplatesGalleryProps = {}) {
  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStyle, setActiveStyle] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await thumbnailAPI.bentoTemplates();
        if (cancelled) return;
        const payload = res.data as TemplatesResponse;
        setData(payload);
        const buckets = payload.buckets || {};
        // Default tab: the bucket with the most items so the first
        // paint feels rich (post-strict-curation, dashboard_mockup
        // dominates with ~76 entries).
        const richest = Object.entries(buckets).sort(
          ([, a], [, b]) => b.length - a.length
        )[0]?.[0];
        if (richest) setActiveStyle(richest);
      } catch (err) {
        console.error("bento templates fetch failed", err);
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl animate-pulse"
            style={{
              aspectRatio: "16 / 10",
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
          Bibliothèque de templates bento bientôt prête
        </div>
        <div style={{ fontSize: 12.5, maxWidth: 480, lineHeight: 1.5 }}>
          La curation tourne côté serveur. Recharge dans 1-2 min ; en
          attendant tu peux décrire ton produit dans le composer
          ci-dessus.
        </div>
      </div>
    );
  }

  const items = activeStyle ? buckets[activeStyle] || [] : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Style bucket tabs — same tab-group-pill capsule as the YouTube
          and App Store galleries. Bento active uses the kargul-spec
          mint accent (btn-premium-bento). */}
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
                  (active ? "btn-premium-bento" : "tab-pill-rest")
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

      {/* Hint banner — same pattern as the other galleries. */}
      <div
        className="rounded-lg px-3 py-2 text-center"
        style={{
          background: "color-mix(in srgb, var(--text-primary) 4%, transparent)",
          border: "1px solid var(--composer-border, var(--border-color))",
          color: "var(--text-secondary)",
          fontSize: 11.5,
        }}
      >
        ✨ Clique sur un template pour le prévisualiser — &quot;Recréer&quot;
        le pin comme style anchor sur la prochaine génération.
      </div>

      {/* Card grid — 16:10 landscape, matching the native bento card
          aspect (most are landing-page tiles, not portrait phones). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((it) => {
          const fullUrl = it.url.startsWith("http")
            ? it.url
            : `${API_BASE}${it.url}`;
          const isPinned = pinnedAnchorUrl === fullUrl;
          return (
            <button
              key={it.slug}
              type="button"
              onClick={() => onPick?.(fullUrl)}
              aria-pressed={isPinned}
              className="rounded-xl overflow-hidden text-left transition-all relative"
              style={{
                aspectRatio: "16 / 10",
                background: "var(--bg-secondary)",
                border: isPinned
                  ? "2px solid var(--text-primary)"
                  : "1px solid var(--border-color)",
                cursor: onPick ? "pointer" : "default",
                padding: 0,
                boxShadow: isPinned
                  ? "0 0 0 4px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.18)"
                  : "none",
              }}
              onMouseEnter={(e) => {
                if (!onPick) return;
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
                  ✓ Style ancré
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
