"use client";

/**
 * Bento Card Studio — Thumbs sub-mode for landing-page bento cells.
 *
 * Same UX shell as the App Store sibling: simple form on the left, live
 * mock-up of the card on the right that updates as the user types.
 * Click Generate → backend hits Gemini 3 Pro Image once → result lands
 * in the carousel. Click again with a different angle → another variant.
 *
 * The output is a single self-contained card (NOT a full bento grid),
 * because most landing pages assemble their own grid from individual
 * card images. We give them one card at a time.
 */

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import ThumbsModeTabs from "@/components/ThumbsModeTabs";
import {
  Grid,
  LayoutGrid,
  Lock,
  Settings,
  Upload,
  XIcon,
} from "@/components/Icons";
import { thumbnailAPI } from "@/lib/api";
import Composer, { ComposerTool } from "@/components/studio/Composer";
import HeroExamples, { ExampleCard } from "@/components/studio/HeroExamples";
import ResultsGrid from "@/components/studio/ResultsGrid";

// Same env-var fallback chain as `lib/api.ts` so static template paths
// resolve identically across dev / preview / prod.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type LayoutKind =
  | "icon-led"
  | "text-led"
  | "split"
  | "ui-mockup"
  | "illustration";

const LAYOUTS: { key: LayoutKind; label: string; example: string }[] = [
  { key: "icon-led",     label: "Icon-led",      example: "Big icon top, headline below — Apple iCloud style" },
  { key: "text-led",     label: "Text-led",      example: "Oversized headline carries the card — Linear, Vercel" },
  { key: "split",        label: "Split layout",  example: "Text left, visual right — Stripe Press style" },
  { key: "ui-mockup",    label: "UI mockup",     example: "Headline + product screenshot — Notion landing" },
  { key: "illustration", label: "Illustration",  example: "3D / painterly illustration — Loom, Linear hero" },
];

const ASPECT_PRESETS = [
  { key: "square",     label: "Square",        ratio: "1:1",  w: 1, h: 1 },
  { key: "landscape",  label: "Landscape",     ratio: "4:3",  w: 4, h: 3 },
  { key: "wide",       label: "Wide hero",     ratio: "16:9", w: 16, h: 9 },
  { key: "tall",       label: "Tall feature",  ratio: "3:4",  w: 3, h: 4 },
];

interface Generated {
  url: string;
  variantIndex: number;
}

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

// Friendly labels for the template gallery tabs.
const STYLE_LABELS: Record<string, string> = {
  minimal_light: "Minimal light",
  dark_tech: "Dark tech",
  illustration: "Illustration",
  dashboard_mockup: "Dashboard mockup",
  split: "Split",
  colorful_playful: "Colorful playful",
  editorial_text: "Editorial text",
  collage: "Collage",
  uncategorised: "Other",
};

const VARIANT_COUNTS = [1, 3, 5] as const;
type VariantCount = (typeof VARIANT_COUNTS)[number];

export default function BentoCardStudio() {
  // Smart-mode primary input: the user describes the product, the AI
  // strategist (Gemini 2.5 Pro) writes the headline + sub + layout + mood.
  const [productDescription, setProductDescription] = useState("");
  // Optional hints — the strategist polishes when given, ignores when blank.
  const [productName, setProductName] = useState("");
  const [headline, setHeadline] = useState("");
  const [supporting, setSupporting] = useState("");
  const [layout, setLayout] = useState<LayoutKind>("icon-led");
  const [accent, setAccent] = useState("#1A1A1A");
  const [bgTone, setBgTone] = useState<"light" | "dark">("light");
  const [aspectKey, setAspectKey] = useState<string>("landscape");
  const [numVariants, setNumVariants] = useState<VariantCount>(3);
  const [refs, setRefs] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);
  // Lock-in style: the URL of a previously-generated bento the user
  // accepted. When set, the strategist + renderer treat it as a sister
  // card on the same landing page and inherit its DNA (palette, icons,
  // typography, layout). Lets the user produce a coherent series of
  // bentos for different benefits without having to re-pick a template
  // each time.
  const [lockedStyleUrl, setLockedStyleUrl] = useState<string | null>(null);
  // Settings overlay — opens the advanced controls (aspect, accent,
  // bg tone, layout, manual headline/sub) only on demand. The form
  // stays minimal by default; the IA stratège fills the gaps.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Hero examples — random sampling of curated templates that the
  // user sees on first paint as inspiration. Click one to pin it as
  // the style anchor and seed the composer with a starter prompt.
  const [heroExamples, setHeroExamples] = useState<ExampleCard[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Generated[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  // Templates gallery state — fetched lazily the first time the user
  // opens the modal. selectedTemplate is the user's pinned style anchor
  // (the AI uses this image as the primary visual reference).
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplatesResponse | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [activeStyleTab, setActiveStyleTab] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);

  const aspect = ASPECT_PRESETS.find((a) => a.key === aspectKey)!;

  const openGallery = async () => {
    setGalleryOpen(true);
    if (templates || loadingTemplates) return;
    setLoadingTemplates(true);
    try {
      const { data } = await thumbnailAPI.bentoTemplates();
      setTemplates(data as TemplatesResponse);
      // Default tab: the bucket with the most items — keeps the modal
      // feeling rich on first open.
      const buckets = (data as TemplatesResponse).buckets || {};
      const richest = Object.entries(buckets).sort(
        ([, a], [, b]) => b.length - a.length
      )[0]?.[0];
      if (richest) setActiveStyleTab(richest);
    } catch (err) {
      console.warn("bentoTemplates failed", err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const onPickRefs = (files: FileList | null) => {
    if (!files) return;
    const next = [...refs, ...Array.from(files)].slice(0, 5);
    setRefs(next);
    setRefPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const removeRef = (idx: number) => {
    const next = refs.filter((_, i) => i !== idx);
    setRefs(next);
    setRefPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  useEffect(() => {
    return () => {
      refPreviews.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch a random sample of curated bento templates on first paint
  // — they double as inspiration AND template entry points (the
  // "Wayfinder" pattern: the gallery IS the onboarding).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await thumbnailAPI.bentoTemplates();
        if (cancelled) return;
        const buckets = (data as TemplatesResponse).buckets || {};
        // Build a flat pool then shuffle so the user sees a different
        // mix on each visit. Bias toward visually rich buckets first
        // so the empty state never looks dull.
        const richPool: TemplateItem[] = [];
        const orderedBuckets = [
          "collage",
          "illustration",
          "dashboard_mockup",
          "dark_tech",
          "colorful_playful",
          "split",
          "editorial_text",
          "minimal_light",
        ];
        for (const b of orderedBuckets) {
          const items = buckets[b] || [];
          richPool.push(...items);
        }
        const shuffled = richPool.sort(() => Math.random() - 0.5).slice(0, 8);
        const cards: ExampleCard[] = shuffled.map((it) => ({
          id: it.slug,
          url: `${API_BASE}${it.url}`,
          label: it.slug,
        }));
        setHeroExamples(cards);
      } catch (err) {
        console.warn("hero examples fetch failed", err);
      } finally {
        if (!cancelled) setHeroLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = async () => {
    if (!productDescription.trim()) {
      setError("Décris ton produit pour que l'IA puisse réfléchir à la bonne accroche.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const startIdx = generated.length;
      const tasks = Array.from({ length: numVariants }, () => {
        const fd = new FormData();

        // Compose the description seen by the strategist. We append the
        // optional manual hints as labelled blocks so the model treats
        // them as a copywriter brief, not as the product description
        // itself. Empty fields are skipped — the strategist fills the
        // gaps.
        let enriched = productDescription.trim();
        if (headline.trim()) {
          enriched += `\n\nHeadline angle préféré (à polir, pas à copier-coller verbatim): "${headline.trim()}"`;
        }
        if (supporting.trim()) {
          enriched += `\n\nSous-message à intégrer si possible: "${supporting.trim()}"`;
        }
        fd.append("product_description", enriched);

        if (productName.trim()) fd.append("product_name", productName.trim());

        // Map the legacy layout/bg_tone hints into a single tone_pref
        // string the strategist understands. The strategist may override
        // when the chosen layout doesn't fit the actual product.
        const toneHints: string[] = [];
        if (layout) toneHints.push(`layout favorisé: ${layout}`);
        if (bgTone) toneHints.push(`fond ${bgTone}`);
        if (toneHints.length) fd.append("tone_pref", toneHints.join(", "));

        if (accent) fd.append("color_primary", accent);
        fd.append("aspect_ratio", aspect.ratio);

        if (selectedTemplate) {
          fd.append("template_url", selectedTemplate.url);
          fd.append("template_slug", selectedTemplate.slug);
        }
        // Lock-in: the strategist treats this as a sister-card anchor,
        // the renderer inherits palette/icons/typography. Empty when
        // the user hasn't locked anything yet.
        if (lockedStyleUrl) {
          fd.append("locked_style_url", lockedStyleUrl);
        }

        refs.forEach((f) => fd.append("files", f));
        return thumbnailAPI.bentoGenerateSmart(fd);
      });
      const results = await Promise.allSettled(tasks);
      const newOnes: Generated[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          const d = r.value.data;
          newOnes.push({ url: d.image_url, variantIndex: startIdx + i });
        }
      });
      if (newOnes.length === 0) {
        throw new Error("La génération a échoué pour toutes les variantes.");
      }
      setGenerated((prev) => {
        const out = [...prev, ...newOnes];
        setCurrentIdx(prev.length);
        return out;
      });
    } catch (err: unknown) {
      const r = (err as { response?: { data?: { detail?: unknown } } })?.response;
      const detail = r?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : detail && typeof detail === "object" && "message" in detail
            ? (detail as { message: string }).message
            : err instanceof Error
              ? err.message
              : "La génération a échoué.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const showingGenerated = generated.length > 0;
  const current = showingGenerated ? generated[currentIdx] : null;
  const canSubmit = useMemo(
    () => Boolean(productDescription.trim()),
    [productDescription]
  );
  // (Locked state is now displayed inline by ResultsGrid via the
  // `lockedUrl` prop — no separate flag needed at this level.)

  // Compose tools row for the bottom dock — icons-only, with badges
  // surfacing state (selected template, locked style, variant count).
  const composerTools: ComposerTool[] = [
    {
      key: "templates",
      icon: <LayoutGrid size={16} />,
      label: "Templates",
      hint: selectedTemplate
        ? `Style ancré sur "${selectedTemplate.slug}". Click pour changer.`
        : "Browse 477 curated templates",
      onClick: openGallery,
      active: !!selectedTemplate,
      badge: selectedTemplate ? "Pinned" : undefined,
    },
    {
      key: "lock",
      icon: <Lock size={16} />,
      label: "Style verrouillé",
      hint: lockedStyleUrl
        ? "Les prochaines cards reproduisent cette palette / icônes / typo."
        : "Verrouille un résultat pour que les prochaines en héritent (sister cards).",
      onClick: () => {
        if (lockedStyleUrl) {
          setLockedStyleUrl(null);
        } else if (current) {
          setLockedStyleUrl(current.url);
        }
      },
      active: !!lockedStyleUrl,
      badge: lockedStyleUrl ? "Locked" : undefined,
    },
    {
      key: "variants",
      icon: <Grid size={16} />,
      label: `${numVariants} variants`,
      hint: "Combien de cards générer en parallèle (1, 3 ou 5).",
      onClick: () => {
        const order = VARIANT_COUNTS;
        const next = order[(order.indexOf(numVariants) + 1) % order.length];
        setNumVariants(next);
      },
      active: numVariants > 1,
      badge: `${numVariants}×`,
    },
    {
      key: "settings",
      icon: <Settings size={16} />,
      label: "Réglages avancés",
      hint: "Format, couleur d'accent, headline manuel, refs…",
      onClick: () => setAdvancedOpen((v) => !v),
      active: advancedOpen,
    },
  ];

  return (
    <>
      <Header title="Thumbs" subtitle="Bento cards qui convertissent — Linear / Vercel / Notion DNA" />
      <div className="flex-1 overflow-y-auto studio-dot-grid studio-mint-glow glow-bento">
        <div
          className="studio-content max-w-[1100px] mx-auto px-4 md:px-6 py-6 md:py-10 flex flex-col"
          style={{ minHeight: "calc(100vh - 56px)" }}
        >
          <ThumbsModeTabs />

          {/* Hero / Results — single focal area. The empty state shows
              examples from the curated library; once the user generates,
              the same area becomes the results grid. */}
          <div className="mt-4 mb-6 flex-1">
            {showingGenerated || submitting ? (
              <ResultsGrid
                items={generated.map((g, i) => ({
                  url: g.url,
                  id: `${g.url}-${g.variantIndex}-${i}`,
                }))}
                aspectRatio={`${aspect.w} / ${aspect.h}`}
                lockedUrl={lockedStyleUrl}
                onToggleLock={(item) =>
                  setLockedStyleUrl(lockedStyleUrl === item.url ? null : item.url)
                }
                pendingCount={submitting ? numVariants : 0}
              />
            ) : (
              <HeroExamples
                examples={heroExamples}
                aspectRatio={`${aspect.w} / ${aspect.h}`}
                kicker="Inspirations"
                title="Pickez un style ou décrivez votre produit ↓"
                loading={heroLoading}
                onPick={(card) => {
                  // Click → pin as template anchor. The user only has
                  // to type their product description in the composer
                  // below; the AI strategist + this anchor do the rest.
                  const tpl: TemplateItem = {
                    slug: card.id,
                    path: card.id,
                    url: card.url.startsWith(API_BASE)
                      ? card.url.slice(API_BASE.length)
                      : card.url,
                  };
                  setSelectedTemplate(tpl);
                }}
              />
            )}
          </div>

          {/* Selected template chip — visible only on the empty state
              (the result grid already shows the anchor implicitly). */}
          {selectedTemplate && !showingGenerated && (
            <div
              className="mb-3 flex items-center gap-2 self-start rounded-full"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                padding: "4px 10px 4px 4px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  selectedTemplate.url.startsWith("http")
                    ? selectedTemplate.url
                    : `${API_BASE}${selectedTemplate.url}`
                }
                alt={selectedTemplate.slug}
                style={{
                  width: 24,
                  height: 24,
                  objectFit: "cover",
                  borderRadius: 999,
                }}
              />
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Style ancré
              </span>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                aria-label="Retirer l'anchor"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  display: "inline-flex",
                  padding: 2,
                }}
              >
                <XIcon size={12} />
              </button>
            </div>
          )}

          {error && (
            <div
              className="mb-3 rounded-lg p-3"
              style={{
                background: "color-mix(in srgb, var(--error) 12%, transparent)",
                border:
                  "1px solid color-mix(in srgb, var(--error) 35%, transparent)",
                color: "var(--error)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Composer dock — sticky to the bottom of the viewport so
              the CTA is always reachable without scrolling. */}
          <div style={{ position: "sticky", bottom: 16, zIndex: 5 }}>
            <Composer
              value={productDescription}
              onChange={setProductDescription}
              onSubmit={handleGenerate}
              placeholder="Décris ton produit. Ex : « Outil de scheduling pour devs solo qui en ont marre de jongler entre Linear, Calendar et Slack. Une seule timeline, drag-and-drop, focus mode auto le matin. »"
              submitting={submitting}
              canSubmit={canSubmit}
              kicker={
                lockedStyleUrl ? "STYLE VERROUILLÉ — sister card" : "DÉCRIS TON PRODUIT"
              }
              tools={composerTools}
              maxLength={800}
            />
          </div>
        </div>
      </div>

      {/* Advanced settings drawer — opens on demand. Holds the legacy
          fields (manual headline, supporting text, layout, accent, bg
          tone, refs upload) for users who want to override the
          strategist's defaults. */}
      {advancedOpen && (
        <AdvancedDrawer
          productName={productName}
          setProductName={setProductName}
          headline={headline}
          setHeadline={setHeadline}
          supporting={supporting}
          setSupporting={setSupporting}
          layout={layout}
          setLayout={setLayout}
          accent={accent}
          setAccent={setAccent}
          bgTone={bgTone}
          setBgTone={setBgTone}
          aspectKey={aspectKey}
          setAspectKey={setAspectKey}
          refPreviews={refPreviews}
          onPickRefs={onPickRefs}
          removeRef={removeRef}
          onClose={() => setAdvancedOpen(false)}
        />
      )}

      {galleryOpen && (
        <TemplatesModal
          templates={templates}
          loading={loadingTemplates}
          activeStyleTab={activeStyleTab}
          onTabChange={setActiveStyleTab}
          onPick={(t) => {
            setSelectedTemplate(t);
            setGalleryOpen(false);
          }}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </>
  );
}

/* ─── Advanced settings drawer ─────────────────────────────────────── */
/* Right-side sheet exposing the legacy override controls. Hidden by
   default — opened from the composer's settings tool. The user keeps
   the result canvas visible while toggling options. */

interface AdvancedDrawerProps {
  productName: string;
  setProductName: (v: string) => void;
  headline: string;
  setHeadline: (v: string) => void;
  supporting: string;
  setSupporting: (v: string) => void;
  layout: LayoutKind;
  setLayout: (v: LayoutKind) => void;
  accent: string;
  setAccent: (v: string) => void;
  bgTone: "light" | "dark";
  setBgTone: (v: "light" | "dark") => void;
  aspectKey: string;
  setAspectKey: (v: string) => void;
  refPreviews: string[];
  onPickRefs: (files: FileList | null) => void;
  removeRef: (idx: number) => void;
  onClose: () => void;
}

function AdvancedDrawer({
  productName,
  setProductName,
  headline,
  setHeadline,
  supporting,
  setSupporting,
  layout,
  setLayout,
  accent,
  setAccent,
  bgTone,
  setBgTone,
  aspectKey,
  setAspectKey,
  refPreviews,
  onPickRefs,
  removeRef,
  onClose,
}: AdvancedDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(6px)",
        zIndex: 30,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)",
          height: "100%",
          background: "var(--bg-primary)",
          borderLeft: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              Réglages avancés
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              Tout est optionnel — l&apos;IA stratège fait le boulot par défaut.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "transparent",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              padding: 6,
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <XIcon size={14} />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <DrawerField label="Format de la card">
            <div className="flex gap-1.5 flex-wrap">
              {ASPECT_PRESETS.map((a) => {
                const active = aspectKey === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setAspectKey(a.key)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border:
                        "1px solid " +
                        (active ? "var(--text-primary)" : "var(--border-color)"),
                      background: active
                        ? "var(--text-primary)"
                        : "var(--bg-secondary)",
                      color: active ? "var(--bg-primary)" : "var(--text-primary)",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {a.label}{" "}
                    <span style={{ opacity: 0.6, marginLeft: 4 }}>{a.ratio}</span>
                  </button>
                );
              })}
            </div>
          </DrawerField>

          <DrawerField label="Tonalité du fond">
            <div className="flex gap-1.5">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBgTone(t)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border:
                      "1px solid " +
                      (bgTone === t ? "var(--text-primary)" : "var(--border-color)"),
                    background:
                      bgTone === t ? "var(--text-primary)" : "var(--bg-secondary)",
                    color: bgTone === t ? "var(--bg-primary)" : "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {t === "light" ? "Clair" : "Sombre"}
                </button>
              ))}
            </div>
          </DrawerField>

          <DrawerField label="Couleur d'accent (hint)">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                style={{
                  width: 36,
                  height: 36,
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  background: "var(--bg-secondary)",
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  outline: "none",
                }}
              />
            </div>
          </DrawerField>

          <DrawerField label="Layout favorisé (l'IA peut override)">
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as LayoutKind)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            >
              {LAYOUTS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label} — {l.example}
                </option>
              ))}
            </select>
          </DrawerField>

          <DrawerField label="Nom du produit (overline)">
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="ex: Linear, Notion, Roby"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </DrawerField>

          <DrawerField label="Headline souhaité">
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="laisse vide pour que l'IA invente"
              maxLength={80}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </DrawerField>

          <DrawerField label="Texte de soutien">
            <input
              type="text"
              value={supporting}
              onChange={(e) => setSupporting(e.target.value)}
              placeholder="laisse vide si tu veux que l'IA décide"
              maxLength={140}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </DrawerField>

          <DrawerField label="Captures / refs (jusqu'à 5)">
            <label
              htmlFor="refs-upload"
              className="rounded-lg flex items-center justify-center gap-2 cursor-pointer"
              style={{
                padding: 12,
                border: "1px dashed var(--border-color)",
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                fontSize: 12,
              }}
            >
              <Upload size={14} />
              Cliquer pour uploader
            </label>
            <input
              id="refs-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onPickRefs(e.target.files)}
              style={{ display: "none" }}
            />
            {refPreviews.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {refPreviews.map((url, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid var(--border-color)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removeRef(i)}
                      aria-label="Retirer"
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-secondary)",
                        padding: 0,
                      }}
                    >
                      <XIcon size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </DrawerField>
        </div>
      </div>
    </div>
  );
}

function DrawerField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-secondary)",
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/* ─── Templates gallery modal ─────────────────────────────────────── */

function TemplatesModal({
  templates,
  loading,
  activeStyleTab,
  onTabChange,
  onPick,
  onClose,
}: {
  templates: TemplatesResponse | null;
  loading: boolean;
  activeStyleTab: string;
  onTabChange: (s: string) => void;
  onPick: (t: TemplateItem) => void;
  onClose: () => void;
}) {
  const buckets = templates?.buckets || {};
  const styles = Object.keys(buckets);
  const items = activeStyleTab ? buckets[activeStyleTab] || [] : [];
  const apiBase =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL || "https://api.horpen.ai"
      : "https://api.horpen.ai";

  // Esc closes; click outside the panel closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,12,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          width: "min(1100px, 100%)",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              Templates
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              Click any reference to pin its style as the AI&apos;s anchor.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full w-8 h-8 flex items-center justify-center"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        {styles.length > 0 && (
          <div
            className="flex gap-1 overflow-x-auto"
            style={{
              padding: "10px 20px",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            {styles.map((s) => {
              const active = s === activeStyleTab;
              const count = buckets[s].length;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onTabChange(s)}
                  className="rounded-full px-3 py-1.5 transition-colors"
                  style={{
                    background: active ? "var(--text-primary)" : "var(--bg-secondary)",
                    color: active ? "var(--bg-primary)" : "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  {STYLE_LABELS[s] || s}
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      opacity: 0.7,
                      fontWeight: 500,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: 20 }}>
          {loading && (
            <div className="flex items-center justify-center" style={{ padding: 60 }}>
              <div className="spinner" />
            </div>
          )}

          {!loading && styles.length === 0 && (
            <div
              className="text-center"
              style={{ padding: 40, color: "var(--text-secondary)", fontSize: 13.5 }}
            >
              No templates yet. Run <code>scripts/bento_curate.py</code> to populate the gallery.
            </div>
          )}

          {!loading && items.length > 0 && (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              }}
            >
              {items.map((it) => (
                <button
                  key={it.slug}
                  type="button"
                  onClick={() => onPick(it)}
                  className="rounded-xl overflow-hidden transition-all"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    padding: 0,
                    cursor: "pointer",
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
                    src={`${apiBase}${it.url}`}
                    alt={it.slug}
                    style={{
                      width: "100%",
                      aspectRatio: "4/3",
                      objectFit: "cover",
                      display: "block",
                      background: "var(--bg-primary)",
                    }}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
