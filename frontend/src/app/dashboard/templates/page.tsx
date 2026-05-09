"use client";

/**
 * Templates page — single landing surface that aggregates the three
 * curated template libraries shipped with Horpen :
 *   - YouTube miniatures      (~569 templates, 8 styles)
 *   - App Store inspirations  (~230 templates, 7 styles)
 *   - Bento card templates    (~176 templates, 8 styles)
 *
 * The user lands here from the sidebar's "Template" entry (INSPIRE
 * section) and picks a category at the top. Each card surfaces a
 * "Recreate" hover overlay; clicking opens the standard MediaDetailView
 * slide-bar with a `Recréer` primary CTA — same drawer-on-click
 * pattern used everywhere else in the app.
 *
 * Click "Recréer" → navigates to the appropriate studio with the
 * template URL passed as a query param so the studio's own
 * gallery-pin flow loads it as the next-gen anchor.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import MediaDetailView from "@/components/MediaDetailView";
import { thumbnailAPI } from "@/lib/api";

type CategoryKey = "youtube" | "appstore" | "bento";

interface TemplateItem {
  slug: string;
  url: string;
  bytes?: number;
  /** Style bucket the template belongs to (e.g. "text_dominant" for
   *  YouTube, "phone_mockup" for App Store). Used as a sub-filter
   *  pill row above the grid. */
  bucket: string;
}

interface CategoryMeta {
  key: CategoryKey;
  label: string;
  /** Human-friendly description shown under the category label. */
  description: string;
  /** Card aspect ratio — YouTube = 16:9, App Store = 4:3 mosaic,
   *  Bento = 16:10 landscape tiles. */
  aspect: string;
  /** Studio route to navigate to when the user clicks "Recréer".
   *  We append `?ref=<encodedUrl>` to it so the studio knows which
   *  template to pin as the next-gen anchor. */
  studioPath: string;
  /** Friendlier bucket labels (snake_case → display name). */
  bucketLabels: Record<string, string>;
}

const CATEGORIES: CategoryMeta[] = [
  {
    key: "youtube",
    label: "Miniatures YouTube",
    description:
      "569 thumbnails curées. Pick celle qui matche ta niche et l'IA reproduit le format.",
    aspect: "16 / 9",
    studioPath: "/dashboard/thumbnails",
    bucketLabels: {
      face_reaction: "Face / reaction",
      dual_split: "Split / vs",
      text_dominant: "Text-led",
      mockup_focus: "Mockup",
      dark_dramatic: "Dark",
      bright_colorful: "Colorful",
      tutorial_callout: "Tutorial",
      mascot_3d: "Mascot 3D",
      uncategorised: "Other",
    },
  },
  {
    key: "appstore",
    label: "Screenshots App Store",
    description:
      "230 triptyques iOS curés. Click → l'IA copie le format pour ton app.",
    aspect: "4 / 3",
    studioPath: "/dashboard/thumbnails/appstore",
    bucketLabels: {
      headline_first: "Headline-first",
      phone_mockup: "Phone mockup",
      lifestyle_photo: "Lifestyle photo",
      illustration_led: "Illustration",
      feature_callout: "Feature callout",
      social_proof: "Social proof",
      before_after: "Before / after",
      minimal_text: "Minimal",
      uncategorised: "Other",
    },
  },
  {
    key: "bento",
    label: "Cards Bento",
    description:
      "176 tiles SaaS landing-page curées. Linear / Notion / Vercel DNA.",
    aspect: "16 / 10",
    studioPath: "/dashboard/thumbnails/bento",
    bucketLabels: {
      minimal_light: "Minimal light",
      dark_tech: "Dark tech",
      illustration: "Illustration",
      dashboard_mockup: "Dashboard",
      split: "Split",
      colorful_playful: "Colorful",
      editorial_text: "Editorial",
      collage: "Collage",
      uncategorised: "Other",
    },
  },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface BucketResponse {
  buckets?: Record<
    string,
    { slug: string; url: string; bytes?: number }[]
  >;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("youtube");
  /** Templates indexed per category — fetched once on mount, cached
   *  in component state so switching tabs is instant. */
  const [templatesByCategory, setTemplatesByCategory] = useState<
    Record<CategoryKey, TemplateItem[]>
  >({ youtube: [], appstore: [], bento: [] });
  const [loading, setLoading] = useState(true);
  /** Bucket sub-filter inside the active category. "all" = no filter. */
  const [activeBucket, setActiveBucket] = useState<string>("all");
  /** Preview drawer state — opens when a template card is clicked. */
  const [previewedTemplate, setPreviewedTemplate] = useState<{
    url: string;
    slug: string;
    category: CategoryKey;
  } | null>(null);

  // Fetch all 3 libraries in parallel on mount. The buckets are
  // already curated server-side (see scripts/*_curate.py), so we
  // just flatten them into a single per-category list and keep
  // the bucket key around for the sub-filter pill row.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [yt, as, bento] = await Promise.all([
          thumbnailAPI.youtubeTemplates().catch(() => ({
            data: { buckets: {} } as BucketResponse,
          })),
          thumbnailAPI.appstoreInspoTemplates().catch(() => ({
            data: { buckets: {} } as BucketResponse,
          })),
          thumbnailAPI.bentoTemplates().catch(() => ({
            data: { buckets: {} } as BucketResponse,
          })),
        ]);
        if (cancelled) return;
        setTemplatesByCategory({
          youtube: flattenBuckets(yt.data as BucketResponse),
          appstore: flattenBuckets(as.data as BucketResponse),
          bento: flattenBuckets(bento.data as BucketResponse),
        });
      } catch (err) {
        console.error("templates fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset bucket filter when category changes — sub-filters don't
  // make sense across categories.
  useEffect(() => {
    setActiveBucket("all");
  }, [activeCategory]);

  const meta = CATEGORIES.find((c) => c.key === activeCategory)!;
  const all = templatesByCategory[activeCategory];
  const items = activeBucket === "all"
    ? all
    : all.filter((t) => t.bucket === activeBucket);

  // Buckets present in the active category, ordered by item count
  // desc so the richest bucket is the user's first sub-filter option.
  const buckets = Array.from(new Set(all.map((t) => t.bucket)));
  buckets.sort((a, b) => {
    const ca = all.filter((t) => t.bucket === a).length;
    const cb = all.filter((t) => t.bucket === b).length;
    return cb - ca;
  });

  const handleRecreate = (url: string) => {
    // Navigate to the studio with the template URL pre-filled. The
    // studio's existing query-param hydration loads it as the
    // next-gen anchor (matches the ?ref= pattern used elsewhere).
    router.push(`${meta.studioPath}?ref=${encodeURIComponent(url)}`);
  };

  return (
    <>
      <Header
        title="Templates"
        subtitle="3 bibliothèques curées — clique pour remixer"
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-10">
          {/* Category tabs — pill capsule à la Thumbsy / AppStore Studio */}
          <div className="flex justify-center mb-6">
            <div
              className="rounded-full inline-flex items-center gap-1 max-w-full"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                padding: 6,
                boxShadow: "var(--shadow-elev)",
              }}
            >
              {CATEGORIES.map((c) => {
                const active = c.key === activeCategory;
                const count = templatesByCategory[c.key].length;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setActiveCategory(c.key)}
                    aria-pressed={active}
                    className="rounded-full inline-flex items-center gap-2 transition-colors shrink-0"
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: active ? "var(--accent)" : "transparent",
                      color: active
                        ? "var(--bg-primary)"
                        : "var(--text-primary)",
                      whiteSpace: "nowrap",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {c.label}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        opacity: 0.75,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description sous les tabs */}
          <div
            className="text-center mb-6"
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              maxWidth: 640,
              margin: "0 auto 24px",
              lineHeight: 1.5,
            }}
          >
            {meta.description}
          </div>

          {/* Bucket sub-filter — only when there's > 1 bucket */}
          {buckets.length > 1 && (
            <div className="flex justify-center mb-6">
              <div
                className="flex flex-wrap items-center gap-1.5 max-w-full"
                style={{ justifyContent: "center" }}
              >
                <button
                  type="button"
                  onClick={() => setActiveBucket("all")}
                  className="rounded-full transition-colors"
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    background:
                      activeBucket === "all"
                        ? "var(--text-primary)"
                        : "var(--bg-secondary)",
                    color:
                      activeBucket === "all"
                        ? "var(--bg-primary)"
                        : "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Tout
                  <span
                    style={{ fontSize: 10.5, marginLeft: 6, opacity: 0.7 }}
                  >
                    {all.length}
                  </span>
                </button>
                {buckets.map((b) => {
                  const active = activeBucket === b;
                  const count = all.filter((t) => t.bucket === b).length;
                  const label = meta.bucketLabels[b] || b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setActiveBucket(b)}
                      className="rounded-full transition-colors"
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        background: active
                          ? "var(--text-primary)"
                          : "var(--bg-secondary)",
                        color: active
                          ? "var(--bg-primary)"
                          : "var(--text-primary)",
                        border: "1px solid var(--border-color)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                      <span
                        style={{ fontSize: 10.5, marginLeft: 6, opacity: 0.7 }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(260px, 1fr))",
              }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl animate-pulse"
                  style={{
                    aspectRatio: meta.aspect,
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && (
            <div
              className="rounded-2xl px-6 py-14 text-center flex flex-col items-center gap-3"
              style={{
                background: "var(--bg-secondary)",
                border: "1px dashed var(--border-color)",
                color: "var(--text-secondary)",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                Bibliothèque pas encore curée
              </div>
              <div style={{ fontSize: 12.5, maxWidth: 480, lineHeight: 1.5 }}>
                Ce template set sera généré côté serveur. Reviens dans
                quelques minutes.
              </div>
            </div>
          )}

          {/* Templates grid — auto-fill avec min 260px par card,
              hover-overlay "Recréer" + click → drawer preview. */}
          {!loading && items.length > 0 && (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(260px, 1fr))",
              }}
            >
              {items.map((t) => {
                const fullUrl = t.url.startsWith("http")
                  ? t.url
                  : `${API_BASE}${t.url}`;
                return (
                  <button
                    key={`${activeCategory}-${t.slug}`}
                    type="button"
                    onClick={() =>
                      setPreviewedTemplate({
                        url: fullUrl,
                        slug: t.slug,
                        category: activeCategory,
                      })
                    }
                    className="group relative rounded-xl overflow-hidden text-left transition-all"
                    style={{
                      aspectRatio: meta.aspect,
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.borderColor =
                        "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.borderColor =
                        "var(--border-color)";
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fullUrl}
                      alt={t.slug}
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                    {/* Hover scrim + Recréer pill — n'apparaît
                        qu'au hover via group-hover. */}
                    <div
                      className="absolute inset-0 flex items-end justify-center transition-opacity opacity-0 group-hover:opacity-100"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.65) 100%)",
                        padding: 14,
                      }}
                    >
                      <span
                        className="rounded-full px-3.5 py-1.5"
                        style={{
                          background: "rgba(255,255,255,0.95)",
                          color: "#0a0a0c",
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: "-0.005em",
                        }}
                      >
                        Recréer →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Preview drawer — pattern uniforme avec le reste de l'app.
          Click "Recréer" → navigue vers le studio avec le template
          en query param. */}
      {previewedTemplate && (
        <MediaDetailView
          item={{
            id: previewedTemplate.slug,
            type: "image",
            url: previewedTemplate.url,
            prompt: "",
            created_at: "",
            source_label: meta.label,
          }}
          primaryActionLabel="Recréer"
          onClose={() => setPreviewedTemplate(null)}
          onDownload={() => {
            const a = document.createElement("a");
            a.href = previewedTemplate.url;
            a.download = `${previewedTemplate.slug}.jpg`;
            a.click();
          }}
          onReusePrompt={() => {
            handleRecreate(previewedTemplate.url);
            setPreviewedTemplate(null);
          }}
        />
      )}
    </>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */

/** Flatten the per-bucket dict from the curate index into a single
 *  list, attaching the bucket key as `bucket` on each item. */
function flattenBuckets(payload: BucketResponse): TemplateItem[] {
  const buckets = payload.buckets || {};
  const out: TemplateItem[] = [];
  for (const [bucket, items] of Object.entries(buckets)) {
    for (const it of items) {
      out.push({ slug: it.slug, url: it.url, bytes: it.bytes, bucket });
    }
  }
  // Sort by file size desc — proxy for visual fidelity, so the
  // richest templates surface first.
  out.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  return out;
}
