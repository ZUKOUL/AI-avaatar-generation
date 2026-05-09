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
          {/* ─── 1. HERO — big centered title à la OpenArt.
                Le mot "créer" est rendu avec un gradient fuchsia→
                cyan qui matche l'énergie de la home OpenArt sans la
                copier mot pour mot. L'emoji curseur est placé après
                le point d'interrogation pour finir l'élan visuel. ─── */}
          <div className="flex flex-col items-center text-center mb-10 md:mb-14 mt-4 md:mt-8">
            <h1
              className="font-extrabold leading-[1.05] tracking-tight"
              style={{
                color: "var(--text-primary)",
                fontSize: "clamp(36px, 6vw, 64px)",
                letterSpacing: "-0.035em",
                maxWidth: 920,
              }}
            >
              Que veux-tu{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #ff7ad9 0%, #b65aff 45%, #6dd0ff 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                créer
              </span>{" "}
              aujourd&apos;hui ?{" "}
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  transform: "translateY(0.06em)",
                  marginLeft: 4,
                }}
              >
                🖱️
              </span>
            </h1>
          </div>

          {/* ─── 2. MODE PILL BAR — capsule with the 6 studios.
                Click → land in that studio. Replaces the previous
                3×6 icon grid with a tight inline pill bar exactly
                like OpenArt's Story / Video / Image / Character /
                World / Audio row, but mapped to Horpen's products. ─── */}
          <div className="flex justify-center mb-12 md:mb-14">
            <div
              className="rounded-full inline-flex items-center gap-1 max-w-full overflow-x-auto"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                padding: 6,
                boxShadow: "var(--shadow-elev)",
              }}
            >
              {PRODUCTS.map((p) => {
                const route = PRODUCT_APP_ROUTES[p.slug];
                return (
                  <Link
                    key={p.slug}
                    href={route.href}
                    className="rounded-full inline-flex items-center gap-2 transition-colors shrink-0"
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Product3DLogo product={p} size={20} glow={false} />
                    <span>{p.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ─── 3. PROMO CARDS — 4 cards en row, image bg + title
                overlay, comme OpenArt. Première card = upgrade promo
                avec compteur, les 3 suivantes = highlights produit. ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-12 md:mb-14">
            <PromoCard
              href="/dashboard/settings?section=plan"
              title="Passe au plan supérieur"
              cover={spaces[0]?.thumbnail}
              gradient="linear-gradient(135deg, #f97316 0%, #db2777 50%, #6366f1 100%)"
              badge="OFFRE LIMITÉE"
              ctaLabel="Voir le plan"
            />
            <PromoCard
              href="/dashboard/thumbnails/appstore"
              title="App Store screenshots"
              subtitle="Triptyque iOS prêt en 30 s"
              cover={spaces[1]?.thumbnail}
              gradient="linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)"
            />
            <PromoCard
              href="/dashboard/ai-videos"
              title="Smart Shot — AI Video"
              subtitle="Un prompt → cinematic short"
              cover={spaces[2]?.thumbnail}
              gradient="linear-gradient(135deg, #064e3b 0%, #047857 100%)"
            />
            <PromoCard
              href="/dashboard/thumbnails/bento"
              title="Bento Cards"
              subtitle="Landing tiles instant"
              cover={spaces[3]?.thumbnail}
              gradient="linear-gradient(135deg, #312e81 0%, #581c87 100%)"
            />
          </div>

          {/* ─── 4. HORPEN SUITE — feature cards, 3 across.
                Mêmes proportions que la "OpenArt Suite" : titre +
                sous-titre + image preview à droite. Click → land
                dans l'outil. ─── */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                }}
              >
                Horpen Suite
              </h2>
              <Link
                href="/dashboard/images"
                className="inline-flex items-center gap-1 transition-colors"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                Plus
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <SuiteCard
                href="/dashboard/thumbnails"
                title="Thumbsy"
                subtitle="Miniatures YouTube qui font cliquer"
                accentBorder="#ef4444"
                preview={
                  templates.find((t) => t.category === "Thumbnail")?.url
                }
              />
              <SuiteCard
                href="/dashboard/thumbnails/appstore"
                title="App Store Pack"
                subtitle="Triptyque iOS portrait, prompt to render"
                accentBorder="#3b82f6"
                preview={
                  templates.find((t) => t.category === "App Store")?.url
                }
              />
              <SuiteCard
                href="/dashboard/thumbnails/bento"
                title="Bento Studio"
                subtitle="Landing-page tiles signature SaaS"
                accentBorder="#10b981"
                preview={
                  templates.find((t) => t.category === "Bento")?.url
                }
              />
            </div>
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

/* Promotional card — image bg with title overlay, optional badge.
   Used in the 4-row promo strip just under the pill bar. Clicks
   land on the linked surface. Reuses the spaces[i] thumbnails so
   each card feels live + branded with the user's own work, with
   a tasteful gradient fallback when no thumbnail is available. */
function PromoCard({
  href,
  title,
  subtitle,
  cover,
  gradient,
  badge,
  ctaLabel,
}: {
  href: string;
  title: string;
  subtitle?: string;
  cover?: string;
  gradient: string;
  badge?: string;
  ctaLabel?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative rounded-2xl overflow-hidden block transition-all"
      style={{
        aspectRatio: "1 / 1.05",
        background: cover ? "var(--bg-secondary)" : gradient,
        backgroundImage: cover ? `url(${cover})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        border: "1px solid var(--border-color)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Gradient overlay always — keeps text readable when a
          backgroundImage is set, and provides the brand color
          identity when not. */}
      <div
        className="absolute inset-0"
        style={{
          background: cover
            ? `${gradient}, linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.65) 100%)`
            : gradient,
          opacity: cover ? 0.55 : 1,
          mixBlendMode: cover ? "multiply" : "normal",
        }}
      />
      <div
        className="absolute inset-0 flex flex-col justify-end p-4"
        style={{ color: "#fff" }}
      >
        {badge && (
          <span
            className="self-start mb-auto rounded-full px-2.5 py-1"
            style={{
              background: "rgba(0,0,0,0.45)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              backdropFilter: "blur(6px)",
            }}
          >
            {badge}
          </span>
        )}
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.85)",
              marginTop: 4,
              lineHeight: 1.35,
            }}
          >
            {subtitle}
          </div>
        )}
        {ctaLabel && (
          <span
            className="self-start mt-3 inline-flex items-center gap-1 rounded-full px-3 py-1"
            style={{
              background: "rgba(255,255,255,0.92)",
              color: "#0a0a0c",
              fontSize: 11.5,
              fontWeight: 700,
            }}
          >
            {ctaLabel}
            <ArrowRight size={12} />
          </span>
        )}
      </div>
    </Link>
  );
}

/* Suite card — feature highlight in the "Horpen Suite" section.
   Two-column layout : left = title + subtitle, right = image
   preview. Accent border kicks in on hover so the card feels
   tactile. */
function SuiteCard({
  href,
  title,
  subtitle,
  accentBorder,
  preview,
}: {
  href: string;
  title: string;
  subtitle: string;
  accentBorder: string;
  preview?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl overflow-hidden flex transition-all"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        minHeight: 120,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accentBorder;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-color)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div className="flex-1 min-w-0 p-4 flex flex-col justify-between">
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>
      {preview && (
        <div
          className="shrink-0"
          style={{
            width: 120,
            backgroundImage: `url(${preview})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderLeft: "1px solid var(--border-color)",
          }}
        />
      )}
    </Link>
  );
}

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
