"use client";

/**
 * AppstoreInspoGallery — embeddable "Inspirations" view for the
 * App Store Studio.
 *
 * Sister of `MiniatureTemplatesGallery`. Reads
 * `/thumbnail/appstore-inspo-templates` (the curated, deduped, Gemini-
 * Flash-categorised library at `app/services/niche_assets/appstore_inspo/`)
 * and renders a tabbed grid: pick a style bucket on top, click a
 * screenshot card to scroll the form back into view (the inspo refs
 * are auto-injected on every Generate call already, so clicking is
 * an "OK I've seen the style, generate now" cue).
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

export default function AppstoreInspoGallery() {
  const [data, setData] = useState<InspoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStyle, setActiveStyle] = useState<string>("");
  const [lightbox, setLightbox] = useState<InspoItem | null>(null);

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

  // Esc → close the lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl animate-pulse"
            style={{
              aspectRatio: "9 / 19.5",
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

      {/* Hint banner — explain that inspos are auto-injected, no need
          to click anything to "use" them. */}
      <div
        className="rounded-lg px-3 py-2 text-center"
        style={{
          background: "color-mix(in srgb, var(--text-primary) 4%, transparent)",
          border: "1px solid var(--composer-border, var(--border-color))",
          color: "var(--text-secondary)",
          fontSize: 11.5,
        }}
      >
        ✨ L&apos;IA s&apos;inspire automatiquement de cette bibliothèque sur chaque
        génération — clique sur une image pour la voir en grand.
      </div>

      {/* Portrait grid — 9:19.5 aspect for App Store screens. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((it) => (
          <button
            key={it.slug}
            type="button"
            onClick={() => setLightbox(it)}
            className="rounded-xl overflow-hidden text-left transition-all"
            style={{
              aspectRatio: "9 / 19.5",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              cursor: "pointer",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.borderColor = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "var(--border-color)";
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API_BASE}${it.url}`}
              alt={it.slug}
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </button>
        ))}
      </div>

      {/* Lightbox — full-size view of the picked screenshot. */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${API_BASE}${lightbox.url}`}
            alt={lightbox.slug}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight: "90vh",
              maxWidth: "min(420px, 80vw)",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              cursor: "default",
            }}
          />
        </div>
      )}
    </div>
  );
}
