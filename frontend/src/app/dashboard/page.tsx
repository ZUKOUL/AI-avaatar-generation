"use client";

/**
 * Horpen Home — landing dashboard.
 *
 * Layout (Magnific/Freepik DNA, but built from Horpen's own products):
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │ <time-aware greeting>, start creating!                          │
 *  │ ┌────────────── Search ⌘K ──────────────┐                       │
 *  │ [trackify] [canvas] [avatar] [adlab] [thumbs] [clipsy]          │
 *  ├─────────────┬───────────────────────────────┬──────────────────┤
 *  │ Projects    │ Spaces                        │ Tools            │
 *  │ (workspaces)│ (recent creations as cards)   │ (deep-link nav)  │
 *  └─────────────┴───────────────────────────────┴──────────────────┘
 *  ┌──────────────────── My work > ────────────────────┐
 *  │ [What's new] [Templates] [Academy]    [Search]    │
 *  │ ┌─────┐ ┌─────┐ ┌─────┐                            │
 *  │ │     │ │     │ │     │   (mix of YT miniatures,   │
 *  │ │     │ │     │ │     │    App Store inspos,       │
 *  │ └─────┘ └─────┘ └─────┘    Bento templates)        │
 *  └────────────────────────────────────────────────────┘
 *
 * Design note: every section is data-driven where possible — the
 * 6 category icons come from the shared PRODUCTS array, the Tools
 * sidebar from APP_SUB_ROUTES, the Spaces from /thumbnail/history +
 * /image-history, and the bottom Templates grid is a shuffled mix
 * of the three curated libraries (miniatures + appstore_inspo +
 * bento). Nothing about the layout is hard-coded to a fixed list,
 * so adding a 7th product later is a one-line change in shared.tsx.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import {
  Search,
  Plus,
  Star,
  ChevronRight,
  ImageSquare,
  VideoCamera,
  ArrowRight,
  Sun,
  Moon,
  SparkleIcon,
} from "@/components/Icons";
import {
  PRODUCTS,
  Product3DLogo,
  PRODUCT_APP_ROUTES,
  APP_SUB_ROUTES,
} from "@/components/landing/shared";
import { thumbnailAPI, avatarAPI, videoAPI } from "@/lib/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SpaceCard {
  id: string;
  title: string;
  thumbnail: string;
  age: string;
  href: string;
}

interface TemplateCard {
  id: string;
  url: string;
  category: "Thumbnail" | "App Store" | "Bento";
  /** Sort priority — bigger means show earlier. */
  rank: number;
}

interface BucketResp {
  buckets?: Record<string, { slug: string; url: string; bytes?: number }[]>;
}

/* Sample N URL items from a category-bucket payload. We pull the
 * top items by file size (proxy for visual fidelity) so the home
 * grid feels premium even when the underlying library is mixed. */
function sampleFromBuckets(
  resp: BucketResp,
  n: number,
  category: TemplateCard["category"],
): TemplateCard[] {
  const flat: { slug: string; url: string; bytes: number }[] = [];
  const buckets = resp.buckets || {};
  for (const items of Object.values(buckets)) {
    for (const it of items) {
      flat.push({ slug: it.slug, url: it.url, bytes: it.bytes ?? 0 });
    }
  }
  flat.sort((a, b) => b.bytes - a.bytes);
  return flat.slice(0, n).map((it, i) => ({
    id: `${category}-${it.slug}`,
    url: it.url.startsWith("http") ? it.url : `${API_BASE}${it.url}`,
    category,
    // Higher rank for earlier items so the shuffle still respects size.
    rank: n - i,
  }));
}

function timeAwareGreeting(): { text: string; icon: React.ReactNode } {
  const hour = new Date().getHours();
  if (hour < 6 || hour >= 22) {
    return { text: "Bonsoir, lance la création", icon: <Moon size={20} /> };
  }
  if (hour < 12) {
    return { text: "Bon matin, lance la création", icon: <Sun size={20} /> };
  }
  if (hour < 18) {
    return { text: "Bon après-midi, lance la création", icon: <Sun size={20} /> };
  }
  return { text: "Bonsoir, lance la création", icon: <Moon size={20} /> };
}

function shortAgo(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!t) return "";
  const sec = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}j`;
  const wk = Math.floor(day / 7);
  return `${wk}sem`;
}

export default function DashboardHome() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [spaces, setSpaces] = useState<SpaceCard[]>([]);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [bottomTab, setBottomTab] = useState<"news" | "templates" | "academy">(
    "templates",
  );
  const [templatesQuery, setTemplatesQuery] = useState("");

  const greeting = useMemo(timeAwareGreeting, []);

  /* ─── Spaces (recent work) ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [thumbsRes, imagesRes, videosRes] = await Promise.all([
          thumbnailAPI.list(8).catch(() => ({ data: { thumbnails: [] } })),
          avatarAPI.getImages(undefined, 6).catch(() => ({ data: { images: [] } })),
          videoAPI.history(undefined, 4).catch(() => ({ data: { videos: [] } })),
        ]);
        if (cancelled) return;

        const out: SpaceCard[] = [];
        for (const t of (thumbsRes.data?.thumbnails || []).slice(0, 4)) {
          if (!t.image_url) continue;
          out.push({
            id: `t-${t.thumbnail_id}`,
            title: (t.prompt || "Thumbnail").slice(0, 36),
            thumbnail: t.image_url,
            age: shortAgo(t.created_at),
            href: "/dashboard/thumbnails",
          });
        }
        for (const i of (imagesRes.data?.images || []).slice(0, 4)) {
          if (!i.image_url) continue;
          out.push({
            id: `i-${i.image_id}`,
            title: (i.prompt || "Image").slice(0, 36),
            thumbnail: i.image_url,
            age: shortAgo(i.created_at),
            href: "/dashboard/images",
          });
        }
        for (const v of (videosRes.data?.videos || []).slice(0, 2)) {
          if (v.status !== "completed" || !v.video_url) continue;
          out.push({
            id: `v-${v.job_id}`,
            title: (v.motion_prompt || "Video").slice(0, 36),
            thumbnail: "", // video → fallback gradient
            age: shortAgo(v.created_at),
            href: "/dashboard/videos",
          });
        }
        out.sort((a, b) => (b.age < a.age ? -1 : 1));
        setSpaces(out.slice(0, 6));
      } catch {
        /* silent fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ─── Templates (mix of 3 curated libraries) ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [yt, appstore, bento] = await Promise.all([
          thumbnailAPI.youtubeTemplates().catch(() => ({ data: {} })),
          thumbnailAPI.appstoreInspoTemplates().catch(() => ({ data: {} })),
          thumbnailAPI.bentoTemplates().catch(() => ({ data: {} })),
        ]);
        if (cancelled) return;

        const cards = [
          ...sampleFromBuckets(yt.data as BucketResp, 5, "Thumbnail"),
          ...sampleFromBuckets(appstore.data as BucketResp, 4, "App Store"),
          ...sampleFromBuckets(bento.data as BucketResp, 5, "Bento"),
        ];
        // Interleave categories so the grid alternates visually.
        const byCat: Record<string, TemplateCard[]> = {};
        for (const c of cards) {
          (byCat[c.category] ||= []).push(c);
        }
        const merged: TemplateCard[] = [];
        let i = 0;
        while (
          merged.length < cards.length &&
          (byCat["Thumbnail"]?.length ||
            byCat["App Store"]?.length ||
            byCat["Bento"]?.length)
        ) {
          for (const cat of ["Thumbnail", "App Store", "Bento"] as const) {
            const next = byCat[cat]?.shift();
            if (next) merged.push(next);
          }
          i++;
          if (i > 50) break; // belt-and-braces against an infinite loop
        }
        setTemplates(merged);
      } catch {
        /* silent fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // Default search → drop into the Image studio with the prompt
    // pre-filled. Most users start there; the other studios are one
    // click away from the category row above.
    router.push(`/dashboard/images?prompt=${encodeURIComponent(q)}`);
  };

  const visibleTemplates = useMemo(() => {
    const q = templatesQuery.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) => t.id.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
    );
  }, [templates, templatesQuery]);

  return (
    <>
      <Header title="Home" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 pt-10 md:pt-14 pb-12">
          {/* ─── 1. GREETING + SEARCH ─────────────────────────── */}
          <div className="flex flex-col items-center gap-5 mb-8">
            <h1
              className="text-[26px] md:text-[34px] font-semibold tracking-tight flex items-center gap-3"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.025em" }}
            >
              {greeting.icon}
              {greeting.text}&nbsp;!
            </h1>

            <form
              onSubmit={onSubmitSearch}
              className="w-full max-w-[640px] flex items-center gap-2 rounded-full px-4 py-3"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <Search size={18} style={{ color: "var(--text-tertiary, #9ca3af)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Décris ce que tu veux créer (image, vidéo, miniature…)"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-primary)",
                  fontSize: 14,
                }}
              />
              <span
                className="hidden md:inline-flex items-center gap-1 text-[11px] font-mono"
                style={{
                  color: "var(--text-tertiary, #9ca3af)",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                ⌘K
              </span>
            </form>
          </div>

          {/* ─── 2. CATEGORY ROW (6 product icons) ────────────── */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-12">
            {PRODUCTS.map((p) => {
              const route = PRODUCT_APP_ROUTES[p.slug];
              return (
                <Link
                  key={p.slug}
                  href={route.href}
                  className="rounded-2xl flex flex-col items-center gap-3 p-4 transition-all"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
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
                  <Product3DLogo product={p} size={48} glow={false} />
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {p.name}
                    </span>
                    <span
                      className="text-center"
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary, #9ca3af)",
                        lineHeight: 1.3,
                      }}
                    >
                      {p.tagline}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* ─── 3. PROJECTS / SPACES / TOOLS — three columns ─── */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-10">
            {/* Projects (left, narrow) */}
            <div
              className="md:col-span-3 rounded-2xl p-4"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  Projets
                </span>
                <ChevronRight size={14} style={{ color: "var(--text-tertiary, #9ca3af)" }} />
              </div>
              <div className="flex flex-col gap-1">
                <ProjectRow color="#fb923c" label="Personnel" locked />
                <ProjectRow
                  color="#3b82f6"
                  label="Team project"
                  badge="UPGRADE"
                />
                <ProjectRow color="#f472b6" label="Brand kit" locked />
              </div>
            </div>

            {/* Spaces (centre, wide) */}
            <div
              className="md:col-span-6 rounded-2xl p-4"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  Spaces
                </span>
                <Link
                  href="/dashboard/images"
                  className="rounded-full w-7 h-7 flex items-center justify-center transition-colors"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  aria-label="Nouvel espace"
                >
                  <Plus size={14} />
                </Link>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {spaces.length > 0 ? (
                  spaces.map((s) => (
                    <Link
                      key={s.id}
                      href={s.href}
                      className="shrink-0 rounded-xl overflow-hidden transition-transform"
                      style={{
                        width: 168,
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: "16 / 10",
                          background: s.thumbnail
                            ? `var(--bg-secondary)`
                            : "linear-gradient(135deg, #1f2937, #111827)",
                          backgroundImage: s.thumbnail
                            ? `url(${s.thumbnail})`
                            : undefined,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                      <div className="px-3 py-2">
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s.title || "Untitled space"}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "var(--text-tertiary, #9ca3af)",
                            marginTop: 1,
                          }}
                        >
                          il y a {s.age}
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <EmptySpaces />
                )}
              </div>
            </div>

            {/* Tools (right, narrow) */}
            <div
              className="md:col-span-3 rounded-2xl p-4"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  Outils
                </span>
                <ChevronRight size={14} style={{ color: "var(--text-tertiary, #9ca3af)" }} />
              </div>
              <div className="flex flex-col gap-1">
                {PRODUCTS.flatMap((p) =>
                  (APP_SUB_ROUTES[p.slug] || []).slice(0, 1).map((sub) => ({
                    product: p,
                    sub,
                  })),
                )
                  .slice(0, 5)
                  .map(({ product, sub }) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
                      style={{ color: "var(--text-primary)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--bg-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <Product3DLogo product={product} size={26} glow={false} />
                      <span style={{ fontSize: 12.5, fontWeight: 500 }}>
                        {sub.label}
                      </span>
                    </Link>
                  ))}
              </div>
            </div>
          </div>

          {/* ─── 4. MY WORK link ──────────────────────────────── */}
          <div className="flex justify-center mb-6">
            <Link
              href="/dashboard/images"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold transition-colors"
              style={{ color: "var(--text-primary)" }}
            >
              Mon travail
              <ChevronRight size={16} />
            </Link>
          </div>

          {/* ─── 5. TEMPLATES TABS + GRID ─────────────────────── */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-1">
              {(
                [
                  { key: "news", label: "Nouveautés" },
                  { key: "templates", label: "Templates" },
                  { key: "academy", label: "Academy" },
                ] as const
              ).map((t) => {
                const active = bottomTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setBottomTab(t.key)}
                    aria-pressed={active}
                    className="rounded-full transition-colors"
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: active
                        ? "var(--bg-secondary)"
                        : "transparent",
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                      border: active
                        ? "1px solid var(--border-color)"
                        : "1px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <Search size={14} style={{ color: "var(--text-tertiary, #9ca3af)" }} />
                <input
                  value={templatesQuery}
                  onChange={(e) => setTemplatesQuery(e.target.value)}
                  placeholder="Search templates"
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary)",
                    fontSize: 12.5,
                    width: 160,
                  }}
                />
              </div>
              <button
                type="button"
                className="rounded-full inline-flex items-center gap-1.5 transition-colors"
                style={{
                  padding: "6px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <Star size={13} />
                Pour toi
              </button>
            </div>
          </div>

          {bottomTab === "templates" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleTemplates.length === 0 ? (
                <div className="col-span-full">
                  <EmptyTemplates />
                </div>
              ) : (
                visibleTemplates.map((tpl) => (
                  <TemplateGridCard
                    key={tpl.id}
                    tpl={tpl}
                    onClick={() => {
                      // Each category routes to its native studio with
                      // the URL passed as `?ref=`. Each studio's
                      // hydration effect picks it up on mount.
                      const dest =
                        tpl.category === "Thumbnail"
                          ? "/dashboard/thumbnails"
                          : tpl.category === "App Store"
                            ? "/dashboard/thumbnails/appstore"
                            : "/dashboard/thumbnails/bento";
                      router.push(`${dest}?ref=${encodeURIComponent(tpl.url)}`);
                    }}
                  />
                ))
              )}
            </div>
          )}

          {bottomTab === "news" && (
            <div
              className="rounded-2xl p-10 text-center"
              style={{
                background: "var(--bg-secondary)",
                border: "1px dashed var(--border-color)",
                color: "var(--text-secondary)",
              }}
            >
              <SparkleIcon
                size={28}
                style={{ color: "var(--text-tertiary, #9ca3af)" }}
              />
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 8,
                  color: "var(--text-primary)",
                }}
              >
                Du nouveau arrive bientôt
              </div>
              <div
                style={{ fontSize: 12.5, maxWidth: 480, margin: "6px auto 0" }}
              >
                Le changelog Horpen va s&apos;afficher ici. En attendant
                tu peux explorer la bibliothèque de Templates.
              </div>
            </div>
          )}

          {bottomTab === "academy" && (
            <div
              className="rounded-2xl p-10 text-center"
              style={{
                background: "var(--bg-secondary)",
                border: "1px dashed var(--border-color)",
                color: "var(--text-secondary)",
              }}
            >
              <ImageSquare
                size={28}
                style={{ color: "var(--text-tertiary, #9ca3af)" }}
              />
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 8,
                  color: "var(--text-primary)",
                }}
              >
                Academy en préparation
              </div>
              <div
                style={{ fontSize: 12.5, maxWidth: 480, margin: "6px auto 0" }}
              >
                Tutoriels vidéo + bonnes pratiques. On travaille dessus.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function ProjectRow({
  color,
  label,
  locked,
  badge,
}: {
  color: string;
  label: string;
  locked?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      className="flex items-center justify-between rounded-lg px-2 py-2 transition-colors"
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--text-primary)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-primary)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            background: `linear-gradient(135deg, ${color}, ${color}aa)`,
          }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</span>
      </span>
      <span className="flex items-center gap-1.5">
        {badge && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 5px",
              borderRadius: 3,
              background: "color-mix(in srgb, #ec4899 20%, transparent)",
              color: "#ec4899",
            }}
          >
            {badge}
          </span>
        )}
        {locked && (
          <span
            aria-hidden
            style={{
              fontSize: 11,
              color: "var(--text-tertiary, #9ca3af)",
            }}
          >
            🔒
          </span>
        )}
      </span>
    </button>
  );
}

function EmptySpaces() {
  return (
    <div
      className="flex-1 rounded-xl flex flex-col items-center justify-center gap-2 py-10 text-center"
      style={{
        border: "1px dashed var(--border-color)",
        color: "var(--text-secondary)",
      }}
    >
      <ImageSquare
        size={20}
        style={{ color: "var(--text-tertiary, #9ca3af)" }}
      />
      <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>
        Aucun espace pour le moment
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
        Tes créations récentes apparaîtront ici.
      </div>
    </div>
  );
}

function EmptyTemplates() {
  return (
    <div
      className="rounded-2xl p-10 text-center"
      style={{
        background: "var(--bg-secondary)",
        border: "1px dashed var(--border-color)",
        color: "var(--text-secondary)",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
        Bibliothèque en cours d&apos;hydratation
      </div>
      <div
        style={{
          fontSize: 12.5,
          maxWidth: 480,
          margin: "6px auto 0",
          lineHeight: 1.5,
        }}
      >
        Recharge dans 1-2 min, ou démarre direct depuis les boutons
        de catégorie en haut.
      </div>
    </div>
  );
}

function TemplateGridCard({
  tpl,
  onClick,
}: {
  tpl: TemplateCard;
  onClick: () => void;
}) {
  // Aspect ratio per category — bento + thumbnail are 16:10/16:9, app
  // store inspos are 4:3. Mixing aspects keeps the grid lively without
  // forcing forced-crop on the source images.
  const aspect =
    tpl.category === "App Store"
      ? "4 / 3"
      : tpl.category === "Thumbnail"
        ? "16 / 9"
        : "16 / 10";
  const badgeColor =
    tpl.category === "Thumbnail"
      ? "#fb923c"
      : tpl.category === "App Store"
        ? "#3b82f6"
        : "#10b981";

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl overflow-hidden text-left transition-all relative group"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        cursor: "pointer",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.borderColor = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "var(--border-color)";
      }}
    >
      <div style={{ aspectRatio: aspect, position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tpl.url}
          alt={tpl.id}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
        <span
          className="absolute top-3 left-3 rounded-md px-2 py-1"
          style={{
            background: `color-mix(in srgb, ${badgeColor} 22%, var(--bg-primary))`,
            color: badgeColor,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            border: `1px solid color-mix(in srgb, ${badgeColor} 35%, transparent)`,
            backdropFilter: "blur(6px)",
          }}
        >
          {tpl.category}
        </span>
        <span
          className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition-opacity"
          style={{
            background: "rgba(255,255,255,0.95)",
            color: "#0a0a0c",
            fontSize: 11.5,
            fontWeight: 700,
            opacity: 0,
            transitionDuration: "0.15s",
          }}
        >
          Use
          <ArrowRight size={12} />
        </span>
      </div>

      <style jsx>{`
        button:hover span:last-of-type {
          opacity: 1 !important;
        }
      `}</style>
    </button>
  );
}
