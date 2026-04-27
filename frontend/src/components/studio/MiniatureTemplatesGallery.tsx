"use client";

/**
 * MiniatureTemplatesGallery — embeddable templates view for the
 * Thumbnail Studio's "Templates" sub-tab.
 *
 * Reads `/thumbnail/youtube-templates` (the curated, deduped, Gemini-
 * Flash-categorised library at `app/services/niche_assets/miniatures/`)
 * and renders a tabbed grid: pick a style bucket on top, click a
 * thumbnail to pin it as the AI's style anchor for the next
 * generation.
 *
 * Same UX shell as the bento templates picker (`TemplatesModal` in
 * dashboard/thumbnails/bento/page.tsx) for consistency: rounded
 * tab-group-pill capsule, kargul-spec coral active tab, hover-zoom
 * cards.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  face_reaction: "Face / reaction",
  dual_split: "Split / vs",
  text_dominant: "Text-led",
  mockup_focus: "Mockup",
  dark_dramatic: "Dark",
  bright_colorful: "Colorful",
  tutorial_callout: "Tutorial",
  mascot_3d: "Mascot 3D",
  uncategorised: "Other",
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function MiniatureTemplatesGallery() {
  const router = useRouter();
  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStyle, setActiveStyle] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await thumbnailAPI.youtubeTemplates();
        if (cancelled) return;
        const payload = res.data as TemplatesResponse;
        setData(payload);
        const buckets = payload.buckets || {};
        // Default tab: the bucket with the most items, so the first
        // paint feels rich.
        const richest = Object.entries(buckets).sort(
          ([, a], [, b]) => b.length - a.length
        )[0]?.[0];
        if (richest) setActiveStyle(richest);
      } catch (err) {
        console.error("youtube templates fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePick = (item: TemplateItem) => {
    // Drop the user back into the composer with the picked template
    // pre-loaded as the style anchor. Same `?ref=` query-param the
    // existing inspiration flow uses, so receiving handlers in the
    // main page already know how to load it.
    const fullUrl = `${API_BASE}${item.url}`;
    router.push(`/dashboard/thumbnails?ref=${encodeURIComponent(fullUrl)}`);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl animate-pulse"
            style={{
              aspectRatio: "16 / 9",
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
          Bibliothèque de templates miniatures bientôt prête
        </div>
        <div style={{ fontSize: 12.5, maxWidth: 480, lineHeight: 1.5 }}>
          La curation est en cours côté serveur. Recharge dans 1-2 min ;
          en attendant tu peux remixer une miniature existante via le
          mode <strong>Recreate</strong> en collant une URL YouTube.
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
                  (active ? "btn-premium-yt" : "tab-pill-rest")
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

      {/* Thumbnail grid — 16:9 cards. Click → pins as style anchor in
          Edit mode (?ref=...) so the existing handler picks it up. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((it) => (
          <button
            key={it.slug}
            type="button"
            onClick={() => handlePick(it)}
            className="rounded-xl overflow-hidden text-left transition-all"
            style={{
              aspectRatio: "16 / 9",
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
    </div>
  );
}
