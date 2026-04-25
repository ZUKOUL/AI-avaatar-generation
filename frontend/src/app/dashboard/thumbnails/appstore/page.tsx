"use client";

/**
 * App Store Screenshot Studio — Thumbs sub-mode.
 *
 * Simple form on the left, live phone preview on the right. One click =
 * one rendered screenshot (6 credits). After the first shot lands the
 * preview becomes a navigable carousel — arrows browse prior shots,
 * "Suivant" renders a fresh variant from a different visual angle.
 *
 * Everything strategy-side (vertical anchor pick, prompt composition,
 * niche references) runs invisibly on the backend — the user only sees
 * inputs and rendered images. No "brief", no "narrative arc" surfaced.
 */

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import ThumbsModeTabs from "@/components/ThumbsModeTabs";
import { ArrowRight, MagicWand, Upload, XIcon } from "@/components/Icons";
import { thumbnailAPI } from "@/lib/api";

type Vertical =
  | "utility"
  | "social"
  | "ai"
  | "fitness"
  | "productivity"
  | "lifestyle"
  | "game"
  | "ecommerce"
  | "finance";

const VERTICALS: { key: Vertical; label: string; example: string }[] = [
  { key: "utility",      label: "Utility",       example: "Mealy, Calculator, Translate" },
  { key: "social",       label: "Social",        example: "Zulachat, BeReal-style" },
  { key: "ai",           label: "AI / Assistant", example: "Claude, ChatGPT app" },
  { key: "fitness",      label: "Fitness",       example: "Strava, Apple Fitness" },
  { key: "productivity", label: "Productivity",  example: "Notion, Linear, Things" },
  { key: "lifestyle",    label: "Lifestyle",     example: "Faith, journaling, wellness" },
  { key: "game",         label: "Game",          example: "Mobile games" },
  { key: "ecommerce",    label: "E-commerce",    example: "Shopify-style" },
  { key: "finance",      label: "Finance",       example: "Revolut, Cash App" },
];

const FORMAT_PRESETS = [
  { key: "iphone67", label: "iPhone 6.7\"", w: 1290, h: 2796 },
  { key: "iphone69", label: "iPhone 6.9\"", w: 1320, h: 2868 },
  { key: "android",  label: "Android Phone", w: 1242, h: 2208 },
];

interface Generated {
  url: string;
  variantIndex: number;
}

export default function AppStoreScreenshotStudio() {
  const [appName, setAppName] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [tagline, setTagline] = useState("");
  const [headline, setHeadline] = useState("");
  const [vertical, setVertical] = useState<Vertical>("utility");
  const [accent, setAccent] = useState("#FF6B35");
  const [formatKey, setFormatKey] = useState<string>("iphone67");
  const [refs, setRefs] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Generated[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  const format = FORMAT_PRESETS.find((f) => f.key === formatKey)!;

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

  // Cleanup preview URLs on unmount.
  useEffect(() => {
    return () => {
      refPreviews.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    if (!appName.trim() || !headline.trim()) {
      setError("Le nom de l'app et le headline sont requis.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("app_name", appName.trim());
      fd.append("headline", headline.trim());
      if (tagline.trim()) fd.append("subtitle", tagline.trim());
      if (appDescription.trim()) fd.append("app_description", appDescription.trim());
      fd.append("vertical", vertical);
      fd.append("color_primary", accent);
      fd.append("format", formatKey);
      fd.append("variant_index", String(generated.length));
      refs.forEach((f) => fd.append("files", f));

      const { data } = await thumbnailAPI.appstoreGenerateDirect(fd);
      const next: Generated = {
        url: data.image_url,
        variantIndex: data.variant_index ?? generated.length,
      };
      setGenerated((prev) => {
        const out = [...prev, next];
        setCurrentIdx(out.length - 1);
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
          : "La génération a échoué.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const showingGenerated = generated.length > 0;
  const current = showingGenerated ? generated[currentIdx] : null;

  return (
    <>
      <Header
        title="Thumbs"
        subtitle="Visuels qui font cliquer — YouTube + App Store"
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
                App Store Screenshots
              </div>
              <div
                className="text-[13px]"
                style={{ color: "var(--text-secondary)" }}
              >
                Génère des visuels portrait (iOS + Play Store) qui transforment les
                visiteurs en installs.
              </div>
            </div>
          </div>

          {/* Two-column layout : form left, preview right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            {/* ── Form ── */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-5"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <Field label="Nom de l'app">
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="ex : Mealy"
                  style={inputStyle}
                />
              </Field>

              <Field label="À quoi sert ton app ? (optionnel — aide l'IA à mieux comprendre)">
                <textarea
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  placeholder="ex : Mon app est un coach IA qui t'apprend à percer sur les réseaux."
                  style={{ ...inputStyle, minHeight: 70, resize: "vertical", lineHeight: 1.5 }}
                  maxLength={500}
                />
              </Field>

              <Field label="Headline (gros texte sur le visuel)">
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="ex : YOUR PERSONAL AI MEAL PLANNER"
                  style={inputStyle}
                  maxLength={60}
                />
              </Field>

              <Field label="Sous-titre (optionnel)">
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="ex : Scan ton frigo, l'IA te propose le menu"
                  style={inputStyle}
                  maxLength={120}
                />
              </Field>

              <Field label="Catégorie">
                <div className="grid grid-cols-2 gap-2">
                  {VERTICALS.map((v) => {
                    const active = vertical === v.key;
                    return (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => setVertical(v.key)}
                        className="rounded-lg px-3 py-2 text-left transition-colors"
                        style={{
                          background: active
                            ? "var(--bg-tertiary, #f3f4f6)"
                            : "var(--bg-primary)",
                          border: active
                            ? "1.5px solid var(--text-primary)"
                            : "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{v.label}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary, #9ca3af)",
                            marginTop: 1,
                          }}
                        >
                          {v.example}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Couleur d'accent">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    style={{
                      width: 44,
                      height: 36,
                      borderRadius: 8,
                      border: "1px solid var(--border-color)",
                      background: "transparent",
                      cursor: "pointer",
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

              <Field label="Format de sortie">
                <div className="flex gap-2 flex-wrap">
                  {FORMAT_PRESETS.map((f) => {
                    const active = formatKey === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFormatKey(f.key)}
                        className="rounded-lg px-3 py-2 text-left transition-colors"
                        style={{
                          background: active
                            ? "var(--bg-tertiary, #f3f4f6)"
                            : "var(--bg-primary)",
                          border: active
                            ? "1.5px solid var(--text-primary)"
                            : "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{f.label}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary, #9ca3af)",
                            marginTop: 1,
                            fontFamily: "ui-monospace, monospace",
                          }}
                        >
                          {f.w}×{f.h}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Captures de l'app (optionnel — jusqu'à 5)">
                <div
                  className="rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px dashed var(--border-color)",
                  }}
                  onClick={() => document.getElementById("appstore-refs")?.click()}
                >
                  <Upload size={18} style={{ color: "var(--text-tertiary, #9ca3af)" }} />
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    Glisse des screenshots pour les intégrer dans le visuel
                  </span>
                  <input
                    id="appstore-refs"
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
                          aspectRatio: "9/16",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
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
                disabled={submitting || !appName.trim() || !headline.trim()}
                className="rounded-full px-5 py-3 inline-flex items-center justify-center gap-2 font-semibold transition-all"
                style={{
                  background:
                    submitting || !appName.trim() || !headline.trim()
                      ? "var(--bg-tertiary, #f3f4f6)"
                      : accent,
                  color:
                    submitting || !appName.trim() || !headline.trim()
                      ? "var(--text-tertiary, #9ca3af)"
                      : "#ffffff",
                  border: "none",
                  cursor:
                    submitting || !appName.trim() || !headline.trim()
                      ? "not-allowed"
                      : "pointer",
                  fontSize: 14,
                  boxShadow:
                    submitting || !appName.trim() || !headline.trim()
                      ? "none"
                      : `0 4px 14px ${accent}55`,
                }}
              >
                {submitting
                  ? "Génération…"
                  : showingGenerated
                  ? "Générer un autre — 6 crédits"
                  : "Générer — 6 crédits"}
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
                {!showingGenerated ? (
                  <PreviewMockup
                    appName={appName || "Mealy"}
                    headline={headline || "YOUR PERSONAL AI MEAL PLANNER"}
                    tagline={tagline || "Scan ton frigo, l'IA te propose le menu"}
                    accent={accent}
                    format={format}
                  />
                ) : (
                  <div className="w-full flex flex-col items-center gap-3">
                    <div
                      style={{
                        aspectRatio: `${format.w} / ${format.h}`,
                        maxHeight: 520,
                        borderRadius: 18,
                        overflow: "hidden",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-primary)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={current!.url}
                        alt={`Variant ${currentIdx + 1}`}
                        style={{ height: "100%", display: "block" }}
                      />
                    </div>

                    {/* Carousel nav */}
                    <div className="flex items-center gap-3">
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
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
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

/** Preview mockup — mimics the App Store screenshot composition so
 *  the user sees what the AI will roughly produce based on the form. */
function PreviewMockup({
  appName,
  headline,
  tagline,
  accent,
  format,
}: {
  appName: string;
  headline: string;
  tagline: string;
  accent: string;
  format: { w: number; h: number };
}) {
  const aspect = `${format.w} / ${format.h}`;
  return (
    <div
      style={{
        aspectRatio: aspect,
        height: "100%",
        maxHeight: 520,
        borderRadius: 18,
        background: `linear-gradient(160deg, ${accent} 0%, ${accent}cc 100%)`,
        border: `1px solid ${accent}aa`,
        boxShadow: `0 30px 60px -15px ${accent}55`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "32px 26px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.85)",
            marginBottom: 8,
          }}
        >
          {appName}
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            textShadow: "0 2px 12px rgba(0,0,0,0.18)",
          }}
        >
          {headline}
        </div>
        {tagline && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.4,
              maxWidth: "85%",
            }}
          >
            {tagline}
          </div>
        )}
      </div>

      {/* Phone mockup placeholder */}
      <div
        style={{
          alignSelf: "center",
          width: "65%",
          aspectRatio: "9 / 19.5",
          background: "rgba(0,0,0,0.85)",
          border: "3px solid rgba(255,255,255,0.55)",
          borderRadius: 24,
          boxShadow: "0 24px 48px -16px rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.4)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Mockup app
      </div>

      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.7)",
          textAlign: "center",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Aperçu — {format.w} × {format.h}
      </div>
    </div>
  );
}
