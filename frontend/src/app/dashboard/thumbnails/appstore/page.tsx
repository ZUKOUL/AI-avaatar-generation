"use client";

/**
 * App Store Screenshot Studio — Thumbs sub-mode for mobile-app
 * marketing visuals (iOS App Store + Play Store posters).
 *
 * Same shell as the YouTube thumbnail page (header + ThumbsModeTabs)
 * so users feel they're inside a single feature with two flavors.
 *
 * The form captures the inputs the AI prompt builder needs :
 *   • App name + tagline (the headline shown on the screenshot)
 *   • Vertical (utility / social / ai / fitness / productivity / game)
 *     — drives which curated reference set + style profile to inject
 *   • Brand color (accent / background)
 *   • Optional brand logo + screen mockups
 *
 * The actual AI pipeline (curated references, prompt template,
 * Gemini 3 Pro Image call at 1290×2796) lives in the backend at
 * POST /thumbnail/generate-appstore — wired in a follow-up commit.
 */

import { useState } from "react";
import Header from "@/components/Header";
import ThumbsModeTabs from "@/components/ThumbsModeTabs";
import { ArrowRight, MagicWand, Upload, XIcon } from "@/components/Icons";

type Vertical =
  | "utility"
  | "social"
  | "ai"
  | "fitness"
  | "productivity"
  | "game"
  | "ecommerce"
  | "finance";

const VERTICALS: { key: Vertical; label: string; example: string }[] = [
  { key: "utility",      label: "Utility",       example: "Mealy, Calculator, Translate" },
  { key: "social",       label: "Social",        example: "Zulachat, BeReal-style" },
  { key: "ai",           label: "AI / Assistant", example: "Claude, ChatGPT app" },
  { key: "fitness",      label: "Fitness",       example: "Strava, Apple Fitness" },
  { key: "productivity", label: "Productivity",  example: "Notion, Linear, Things" },
  { key: "game",         label: "Game",          example: "Mobile games" },
  { key: "ecommerce",    label: "E-commerce",    example: "Shopify-style" },
  { key: "finance",      label: "Finance",       example: "Revolut, Cash App" },
];

const FORMAT_PRESETS = [
  { key: "iphone67", label: "iPhone 6.7\"", w: 1290, h: 2796 },
  { key: "iphone69", label: "iPhone 6.9\"", w: 1320, h: 2868 },
  { key: "android",  label: "Android Phone", w: 1242, h: 2208 },
];

export default function AppStoreScreenshotStudio() {
  const [appName, setAppName] = useState("");
  const [tagline, setTagline] = useState("");
  const [vertical, setVertical] = useState<Vertical>("utility");
  const [accent, setAccent] = useState("#FF6B35");
  const [headline, setHeadline] = useState("");
  const [variantCount, setVariantCount] = useState(5);
  const [formatKey, setFormatKey] = useState<string>("iphone67");
  const [refs, setRefs] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string[]>([]);

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

  const handleGenerate = async () => {
    if (!appName.trim() || !headline.trim()) {
      setError("Le nom de l'app et le headline sont requis.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // TODO : wire to backend /thumbnail/generate-appstore once the
      // server-side prompt template + Gemini 3 Pro Image call are
      // shipped. For now we just preview the resolved spec so the
      // user can validate the form ergonomics.
      await new Promise((r) => setTimeout(r, 600));
      setGenerated([]);
      setError(
        "Le moteur de génération App Store est en cours de fine-tuning sur sa bibliothèque de références. Tes inputs sont sauvegardés — tu pourras lancer la génération dès que c'est en ligne."
      );
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "La génération a échoué.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

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

              <Field label="Catégorie (drive le style + références)">
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

              <Field label="Nombre de variantes">
                <div className="flex gap-2">
                  {[3, 5, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setVariantCount(n)}
                      className="rounded-lg px-4 py-2 text-center transition-colors"
                      style={{
                        background:
                          variantCount === n
                            ? "var(--bg-tertiary, #f3f4f6)"
                            : "var(--bg-primary)",
                        border:
                          variantCount === n
                            ? "1.5px solid var(--text-primary)"
                            : "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        fontWeight: 600,
                        flex: 1,
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
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
                    submitting || !appName.trim() || !headline.trim() ? "not-allowed" : "pointer",
                  fontSize: 14,
                  boxShadow:
                    submitting || !appName.trim() || !headline.trim()
                      ? "none"
                      : `0 4px 14px ${accent}55`,
                }}
              >
                {submitting ? "Génération…" : `Générer ${variantCount} visuels`}
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
                {generated.length === 0 ? (
                  <PreviewMockup
                    appName={appName || "Mealy"}
                    headline={headline || "YOUR PERSONAL AI MEAL PLANNER"}
                    tagline={tagline || "Scan your pantry, get the perfect recipe"}
                    accent={accent}
                    format={format}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3 w-full">
                    {generated.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt=""
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid var(--border-color)",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div
                className="rounded-2xl p-4"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--text-tertiary, #9ca3af)",
                    marginBottom: 8,
                  }}
                >
                  Comment l'IA contextualise
                </div>
                <ul
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: "var(--text-secondary)",
                    paddingLeft: 16,
                    margin: 0,
                  }}
                >
                  <li>
                    Détecte la <strong>catégorie</strong> ({VERTICALS.find((v) => v.key === vertical)?.label}) et charge 3-5 références gagnantes du même vertical.
                  </li>
                  <li>
                    Compose un prompt Gemini 3 Pro Image avec le style profile du vertical (typographie, mockup, couleurs).
                  </li>
                  <li>
                    Génère au format <strong>{format.w}×{format.h}</strong> (spec App Store officielle).
                  </li>
                  <li>
                    Itère sur 3-5 variants avec différents angles (mascot / mockup centered / split-screen).
                  </li>
                </ul>
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
