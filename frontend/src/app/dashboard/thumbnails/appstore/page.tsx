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
  headline: string;
  subheadline: string;
  purpose: string;
  screen: number;
}

const VARIANT_COUNTS = [1, 3, 5] as const;
type VariantCount = (typeof VARIANT_COUNTS)[number];

export default function AppStoreScreenshotStudio() {
  const [appName, setAppName] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [headlineHint, setHeadlineHint] = useState("");
  const [vertical, setVertical] = useState<Vertical>("utility");
  const [accent, setAccent] = useState("#FF6B35");
  const [formatKey, setFormatKey] = useState<string>("iphone67");
  const [numVariants, setNumVariants] = useState<VariantCount>(5);
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
    if (!appName.trim() || !appDescription.trim()) {
      setError("Le nom de l'app et la description sont requis — ils nourrissent l'IA copywriter.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("app_name", appName.trim());
      fd.append("app_description", appDescription.trim());
      if (headlineHint.trim()) fd.append("headline_hint", headlineHint.trim());
      fd.append("vertical", vertical);
      fd.append("color_primary", accent);
      fd.append("format", formatKey);
      fd.append("num_variants", String(numVariants));
      refs.forEach((f) => fd.append("files", f));

      const { data } = await thumbnailAPI.appstoreGeneratePack(fd);
      const newOnes: Generated[] = (data.generated || []).map(
        (g: { image_url: string; headline: string; subheadline: string; purpose: string; screen: number }) => ({
          url: g.image_url,
          headline: g.headline,
          subheadline: g.subheadline,
          purpose: g.purpose,
          screen: g.screen,
        })
      );
      setGenerated((prev) => {
        const out = [...prev, ...newOnes];
        setCurrentIdx(prev.length); // jump to first new variant
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

              <Field label="Décris ton app — ce qu'elle fait et pour qui (l'IA écrit les titres à partir de ça)">
                <textarea
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  placeholder="ex : Coach IA de viralité pour les créateurs débutants. Analyse ta niche, te dit quoi poster cette semaine, et corrige tes hooks en temps réel."
                  style={{ ...inputStyle, minHeight: 96, resize: "vertical", lineHeight: 1.5 }}
                  maxLength={600}
                />
              </Field>

              <Field label="Une idée de headline ? (optionnel — l'IA va le polir, jamais le coller tel quel)">
                <input
                  type="text"
                  value={headlineHint}
                  onChange={(e) => setHeadlineHint(e.target.value)}
                  placeholder="ex : ton coach IA qui te fait percer sur les réseaux"
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
                        {n} {n === 1 ? "visuel" : "visuels"}
                        <div style={{ fontSize: 10.5, color: "var(--text-tertiary, #9ca3af)", fontWeight: 500, marginTop: 1 }}>
                          {n * 6} crédits
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
                disabled={submitting || !appName.trim() || !appDescription.trim()}
                className="rounded-full px-5 py-3 inline-flex items-center justify-center gap-2 font-semibold transition-all"
                style={{
                  background:
                    submitting || !appName.trim() || !appDescription.trim()
                      ? "var(--bg-tertiary, #f3f4f6)"
                      : accent,
                  color:
                    submitting || !appName.trim() || !appDescription.trim()
                      ? "var(--text-tertiary, #9ca3af)"
                      : "#ffffff",
                  border: "none",
                  cursor:
                    submitting || !appName.trim() || !appDescription.trim()
                      ? "not-allowed"
                      : "pointer",
                  fontSize: 14,
                  boxShadow:
                    submitting || !appName.trim() || !appDescription.trim()
                      ? "none"
                      : `0 4px 14px ${accent}55`,
                }}
              >
                {submitting
                  ? `L'IA travaille sur ${numVariants} ${numVariants === 1 ? "visuel" : "visuels"}…`
                  : showingGenerated
                  ? `Générer ${numVariants} de plus — ${numVariants * 6} crédits`
                  : `Générer ${numVariants} ${numVariants === 1 ? "visuel" : "visuels"} — ${numVariants * 6} crédits`}
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
                {/* Visual layer — gets blurred during generation. Filter ramps
                    up over ~1.4 s so the user sees the preview "dissolving"
                    into the loading state, not a snap. */}
                <div
                  className="w-full flex flex-col items-center gap-3"
                  style={{
                    filter: submitting ? "blur(18px)" : "blur(0px)",
                    transform: submitting ? "scale(1.03)" : "scale(1)",
                    transition: "filter 1.4s cubic-bezier(0.4, 0, 0.2, 1), transform 1.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  {!showingGenerated ? (
                    <PreviewMockup
                      appName={appName || "Mealy"}
                      headline={headlineHint || "L'IA va écrire ton headline ✨"}
                      tagline={appDescription || "Scan ton frigo, l'IA te propose le menu"}
                      accent={accent}
                      format={format}
                    />
                  ) : (
                    <>
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
                          alt={current!.headline}
                          style={{ height: "100%", display: "block" }}
                        />
                      </div>

                      {/* Headline + purpose label for the current variant */}
                      <div
                        className="text-center"
                        style={{
                          maxWidth: 360,
                          opacity: submitting ? 0.35 : 1,
                          transition: "opacity 0.3s ease-out",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--text-tertiary, #9ca3af)",
                          }}
                        >
                          {current!.purpose ? current!.purpose.replace(/_/g, " ") : `Variant ${currentIdx + 1}`}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginTop: 2, lineHeight: 1.35 }}>
                          {current!.headline}
                        </div>
                      </div>

                      {/* Carousel nav — fades during gen but stays mounted to keep layout stable */}
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

                {/* Shimmer overlay — only mounted while generating. The wave
                    sweeps left → right via the shimmerSweep keyframe defined
                    in globals.css, plus a subtle "Génération…" pill so the
                    user knows we're alive. */}
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
