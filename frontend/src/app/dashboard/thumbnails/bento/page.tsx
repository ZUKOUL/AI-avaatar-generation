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
import { ArrowRight, MagicWand, Upload, XIcon } from "@/components/Icons";
import { thumbnailAPI } from "@/lib/api";

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

  const handleGenerate = async () => {
    if (!productName.trim() || !headline.trim()) {
      setError("Le nom du produit et le headline sont requis.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Fire N parallel single-shot calls so each variant gets a different
      // angle from the backend's variant_index cycle. Cheaper than a
      // strategist hop for this MVP — bento cards are simpler than
      // App Store narrative arcs and don't need polished copy.
      const startIdx = generated.length;
      const tasks = Array.from({ length: numVariants }, (_, i) => {
        const fd = new FormData();
        fd.append("product_name", productName.trim());
        fd.append("headline", headline.trim());
        if (supporting.trim()) fd.append("supporting", supporting.trim());
        fd.append("layout", layout);
        fd.append("accent", accent);
        fd.append("bg_tone", bgTone);
        fd.append("aspect_ratio", aspect.ratio);
        fd.append("variant_index", String(startIdx + i));
        if (selectedTemplate) {
          // The picked template's static URL is sent so the backend
          // can fetch it as the primary style anchor for the render
          // call. Beats hand-coded vertical hints — users see what
          // they're picking instead of guessing from a taxonomy.
          fd.append("template_url", selectedTemplate.url);
          fd.append("template_slug", selectedTemplate.slug);
        }
        refs.forEach((f) => fd.append("files", f));
        return thumbnailAPI.bentoGenerateDirect(fd);
      });
      const results = await Promise.allSettled(tasks);
      const newOnes: Generated[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          const d = r.value.data;
          newOnes.push({ url: d.image_url, variantIndex: d.variant_index ?? startIdx + i });
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
    () => Boolean(productName.trim() && headline.trim()),
    [productName, headline]
  );

  return (
    <>
      <Header
        title="Thumbs"
        subtitle="Visuels qui font cliquer — YouTube + App Store + Bento"
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">
          <ThumbsModeTabs />

          {/* Hero */}
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <MagicWand size={18} />
            </div>
            <div>
              <div
                className="text-[20px] font-semibold leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Bento Cards
              </div>
              <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Cellules de bento grid pour landing pages — feature highlights qui captent l&apos;attention.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            {/* ── Form ── */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-5"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {/* Template anchor — either pinned or "browse the gallery". */}
              <Field label="Style anchor (optionnel)">
                {selectedTemplate ? (
                  <div
                    className="flex items-center gap-3 rounded-lg p-2"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1.5px solid var(--text-primary)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedTemplate.url}
                      alt={selectedTemplate.slug}
                      style={{
                        width: 64,
                        height: 48,
                        objectFit: "cover",
                        borderRadius: 6,
                        flexShrink: 0,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                        Pinné comme référence visuelle
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary, #9ca3af)", marginTop: 1 }}>
                        L&apos;IA s&apos;en sert pour ancrer palette + typo + layout
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTemplate(null)}
                      className="text-xs"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        padding: "4px 8px",
                      }}
                    >
                      Retirer
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openGallery}
                    className="rounded-lg px-3 py-2.5 text-left transition-colors flex items-center gap-3"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px dashed var(--border-color)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "var(--bg-tertiary, #f3f4f6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      ⊞
                    </span>
                    <span className="flex-1 min-w-0">
                      <span style={{ fontSize: 13, fontWeight: 600, display: "block" }}>
                        Browse templates
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary, #9ca3af)" }}>
                        Pick a style anchor → l&apos;IA reproduit son vibe pour ton produit
                      </span>
                    </span>
                  </button>
                )}
              </Field>

              <Field label="Nom du produit / feature">
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="ex : Real-time sync"
                  style={inputStyle}
                />
              </Field>

              <Field label="Headline (gros texte sur la card)">
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="ex : Tout ton monde, partout, instantanément."
                  style={inputStyle}
                  maxLength={80}
                />
              </Field>

              <Field label="Texte de soutien (optionnel)">
                <input
                  type="text"
                  value={supporting}
                  onChange={(e) => setSupporting(e.target.value)}
                  placeholder="ex : Tes fichiers sur tous tes appareils, sans config."
                  style={inputStyle}
                  maxLength={140}
                />
              </Field>

              <Field label="Layout">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {LAYOUTS.map((l) => {
                    const active = layout === l.key;
                    return (
                      <button
                        key={l.key}
                        type="button"
                        onClick={() => setLayout(l.key)}
                        className="rounded-lg px-3 py-2 text-left transition-colors"
                        style={{
                          background: active ? "var(--bg-tertiary, #f3f4f6)" : "var(--bg-primary)",
                          border: active
                            ? "1.5px solid var(--text-primary)"
                            : "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{l.label}</div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "var(--text-tertiary, #9ca3af)",
                            marginTop: 1,
                            lineHeight: 1.35,
                          }}
                        >
                          {l.example}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Couleur d'accent">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      style={{
                        width: 38,
                        height: 36,
                        borderRadius: 8,
                        border: "1px solid var(--border-color)",
                        background: "transparent",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    />
                    <input
                      type="text"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", flex: 1 }}
                    />
                  </div>
                </Field>

                <Field label="Tonalité du fond">
                  <div className="flex gap-2">
                    {(["light", "dark"] as const).map((t) => {
                      const active = bgTone === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setBgTone(t)}
                          className="rounded-lg flex-1 py-2 text-center"
                          style={{
                            background: active ? "var(--bg-tertiary, #f3f4f6)" : "var(--bg-primary)",
                            border: active
                              ? "1.5px solid var(--text-primary)"
                              : "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                            fontSize: 12.5,
                            fontWeight: 600,
                            textTransform: "capitalize",
                          }}
                        >
                          {t === "light" ? "Clair" : "Sombre"}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>

              <Field label="Format de la card">
                <div className="flex gap-2 flex-wrap">
                  {ASPECT_PRESETS.map((a) => {
                    const active = aspectKey === a.key;
                    return (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => setAspectKey(a.key)}
                        className="rounded-lg px-3 py-2 text-left transition-colors"
                        style={{
                          background: active ? "var(--bg-tertiary, #f3f4f6)" : "var(--bg-primary)",
                          border: active ? "1.5px solid var(--text-primary)" : "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.label}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary, #9ca3af)",
                            marginTop: 1,
                            fontFamily: "ui-monospace, monospace",
                          }}
                        >
                          {a.ratio}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Combien de variants ?">
                <div className="flex gap-2">
                  {VARIANT_COUNTS.map((n) => {
                    const active = numVariants === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNumVariants(n)}
                        className="rounded-lg flex-1 py-2 text-center transition-colors"
                        style={{
                          background: active ? "var(--bg-tertiary, #f3f4f6)" : "var(--bg-primary)",
                          border: active ? "1.5px solid var(--text-primary)" : "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {n} {n === 1 ? "card" : "cards"}
                        <div style={{ fontSize: 10.5, color: "var(--text-tertiary, #9ca3af)", fontWeight: 500, marginTop: 1 }}>
                          {n * 6} crédits
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Captures / refs visuelles (optionnel — jusqu'à 5)">
                <div
                  className="rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px dashed var(--border-color)",
                  }}
                  onClick={() => document.getElementById("bento-refs")?.click()}
                >
                  <Upload size={18} style={{ color: "var(--text-tertiary, #9ca3af)" }} />
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    Glisse une capture de ton produit ou un mockup pour l&apos;intégrer
                  </span>
                  <input
                    id="bento-refs"
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => onPickRefs(e.target.files)}
                  />
                </div>
                {refPreviews.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {refPreviews.map((src, i) => (
                      <div
                        key={i}
                        className="relative rounded-lg overflow-hidden"
                        style={{
                          border: "1px solid var(--border-color)",
                          aspectRatio: "1/1",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button
                          onClick={() => removeRef(i)}
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            padding: 3,
                            cursor: "pointer",
                          }}
                        >
                          <XIcon size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>

              {error && (
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: "rgba(248,113,113,0.08)",
                    border: "1px solid rgba(248,113,113,0.2)",
                    color: "#dc2626",
                    fontSize: 12.5,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={submitting || !canSubmit}
                className={
                  (submitting || !canSubmit ? "" : "btn-premium ") +
                  "rounded-full px-5 py-3 inline-flex items-center justify-center gap-2 font-semibold"
                }
                style={{
                  background: submitting || !canSubmit ? "var(--bg-tertiary, #f3f4f6)" : "var(--text-primary)",
                  color: submitting || !canSubmit ? "var(--text-tertiary, #9ca3af)" : "var(--bg-primary)",
                  fontSize: 14,
                }}
              >
                {submitting
                  ? `Génération de ${numVariants} ${numVariants === 1 ? "card" : "cards"}…`
                  : showingGenerated
                    ? `Générer ${numVariants} de plus — ${numVariants * 6} crédits`
                    : `Générer ${numVariants} ${numVariants === 1 ? "card" : "cards"} — ${numVariants * 6} crédits`}
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>

            {/* ── Preview ── */}
            <div className="flex flex-col gap-4">
              <div
                className="rounded-2xl p-5 flex items-center justify-center"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  minHeight: 540,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Visual layer with blur during generation */}
                <div
                  className="w-full flex flex-col items-center gap-3"
                  style={{
                    filter: submitting ? "blur(18px)" : "blur(0px)",
                    transform: submitting ? "scale(1.03)" : "scale(1)",
                    transition:
                      "filter 1.4s cubic-bezier(0.4, 0, 0.2, 1), transform 1.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  {!showingGenerated ? (
                    <BentoMockup
                      productName={productName || "Real-time sync"}
                      headline={headline || "Tout ton monde, partout, instantanément."}
                      supporting={supporting}
                      accent={accent}
                      bgTone={bgTone}
                      aspect={aspect}
                      layout={layout}
                    />
                  ) : (
                    <>
                      <div
                        style={{
                          aspectRatio: `${aspect.w} / ${aspect.h}`,
                          maxHeight: 460,
                          width: "100%",
                          maxWidth: 540,
                          borderRadius: 22,
                          overflow: "hidden",
                          border: "1px solid var(--border-color)",
                          background: "var(--bg-primary)",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={current!.url}
                          alt={`Variant ${currentIdx + 1}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      </div>

                      <div
                        className="flex items-center gap-3"
                        style={{
                          opacity: submitting ? 0.35 : 1,
                          transition: "opacity 0.3s ease-out",
                          pointerEvents: submitting ? "none" : "auto",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                          disabled={currentIdx === 0}
                          className="rounded-full w-9 h-9 flex items-center justify-center"
                          style={{
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                            cursor: currentIdx === 0 ? "not-allowed" : "pointer",
                            opacity: currentIdx === 0 ? 0.4 : 1,
                          }}
                          aria-label="Previous"
                        >
                          ←
                        </button>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 64, textAlign: "center" }}>
                          {currentIdx + 1} / {generated.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentIdx((i) => Math.min(generated.length - 1, i + 1))}
                          disabled={currentIdx >= generated.length - 1}
                          className="rounded-full w-9 h-9 flex items-center justify-center"
                          style={{
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                            cursor: currentIdx >= generated.length - 1 ? "not-allowed" : "pointer",
                            opacity: currentIdx >= generated.length - 1 ? 0.4 : 1,
                          }}
                          aria-label="Next"
                        >
                          →
                        </button>
                        <a
                          href={current!.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="text-xs font-semibold ml-2"
                          style={{
                            color: "var(--text-primary)",
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                            borderRadius: 999,
                            padding: "6px 12px",
                            textDecoration: "none",
                          }}
                        >
                          Télécharger
                        </a>
                      </div>
                    </>
                  )}
                </div>

                {submitting && (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        overflow: "hidden",
                        borderRadius: 16,
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: 0,
                          width: "60%",
                          background:
                            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)",
                          animation: "shimmerSweep 1.8s ease-in-out infinite",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        bottom: 16,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(0,0,0,0.55)",
                        color: "#fff",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        borderRadius: 999,
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        pointerEvents: "none",
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          border: "2px solid rgba(255,255,255,0.3)",
                          borderTopColor: "#fff",
                          animation: "spin 0.8s linear infinite",
                          display: "inline-block",
                        }}
                      />
                      Génération…
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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

/* ─── Helpers ─────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--bg-primary)",
  border: "1px solid var(--border-color)",
  color: "var(--text-primary)",
  fontSize: 14,
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        style={{
          fontSize: 11.5,
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

/** Live mock-up of a bento card — adapts copy, accent, layout to give
 *  the user a concrete sense of what the AI will roughly produce. */
function BentoMockup({
  productName,
  headline,
  supporting,
  accent,
  bgTone,
  aspect,
  layout,
}: {
  productName: string;
  headline: string;
  supporting: string;
  accent: string;
  bgTone: "light" | "dark";
  aspect: { w: number; h: number };
  layout: LayoutKind;
}) {
  const isDark = bgTone === "dark";
  const bg = isDark ? "#0a0a0c" : "#f4f4f6";
  const text = isDark ? "#ffffff" : "#0a0a0c";
  const muted = isDark ? "rgba(255,255,255,0.55)" : "rgba(10,10,12,0.55)";
  const isSplit = layout === "split";
  return (
    <div
      style={{
        aspectRatio: `${aspect.w} / ${aspect.h}`,
        width: "100%",
        maxWidth: 540,
        maxHeight: 460,
        borderRadius: 26,
        background: bg,
        border: `1px solid ${isDark ? "#1c1c20" : "#e5e5e7"}`,
        boxShadow: isDark ? "0 30px 60px -15px rgba(0,0,0,0.6)" : "0 30px 60px -15px rgba(10,10,12,0.15)",
        padding: 28,
        display: "flex",
        flexDirection: isSplit ? "row" : "column",
        gap: 18,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {layout === "icon-led" && (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: accent,
            opacity: 0.95,
            boxShadow: `0 8px 24px ${accent}55`,
            marginBottom: 4,
          }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: muted,
              marginBottom: 8,
            }}
          >
            {productName}
          </div>
          <div
            style={{
              fontSize: layout === "text-led" ? 28 : 22,
              fontWeight: 700,
              color: text,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {headline}
          </div>
          {supporting && (
            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                lineHeight: 1.5,
                color: muted,
                maxWidth: layout === "split" ? "100%" : "85%",
              }}
            >
              {supporting}
            </div>
          )}
        </div>

        {(layout === "ui-mockup" || layout === "split") && (
          <div
            style={{
              marginTop: 18,
              borderRadius: 14,
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(10,10,12,0.04)",
              border: `1px dashed ${isDark ? "rgba(255,255,255,0.12)" : "rgba(10,10,12,0.12)"}`,
              minHeight: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: muted,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            UI mockup
          </div>
        )}

        {layout === "illustration" && (
          <div
            style={{
              marginTop: 18,
              alignSelf: "flex-end",
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: `radial-gradient(circle at 30% 30%, ${accent}, ${accent}66)`,
              boxShadow: `0 18px 36px -10px ${accent}88`,
            }}
          />
        )}
      </div>
    </div>
  );
}
