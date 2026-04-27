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
import { ArrowRight, ImageSquare, XIcon } from "@/components/Icons";
import { thumbnailAPI } from "@/lib/api";
import AppstoreInspoGallery from "@/components/studio/AppstoreInspoGallery";
import MediaDetailView from "@/components/MediaDetailView";

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

interface Project {
  id: string;
  appName: string;
  appDescription: string;
  headlineHint: string;
  vertical: Vertical;
  accent: string;
  formatKey: string;
  generated: Generated[];
  createdAt: number;
  updatedAt: number;
}

const VARIANT_COUNTS = [1, 3, 5] as const;
type VariantCount = (typeof VARIANT_COUNTS)[number];

// API base URL — kept for any future absolute-URL needs but currently
// unused since the inspo gallery handles its own URL composition. We
// leave it here so adding new server-served thumbnails stays a one-line
// change.

const PROJECTS_STORAGE_KEY = "horpen_appstore_projects_v1";
const MAX_PROJECTS = 20;

function genProjectId(): string {
  // Browsers without crypto.randomUUID still need a unique-enough key —
  // collision risk is negligible for a per-user localStorage list.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function relativeTime(ts: number): string {
  const diffSec = (Date.now() - ts) / 1000;
  if (diffSec < 60) return "à l'instant";
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
  return `il y a ${Math.floor(diffSec / 86400)} j`;
}

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

  // Project archive — each app gets its own entry. Persists in localStorage
  // so the user keeps every past pack across reloads. Images stay valid
  // because the URLs point at Supabase storage (we don't blob-cache).
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // User-pinned inspiration screenshot — a single image from the curated
  // ~230-screenshot library inside the Packs tab. When set, the backend
  // uses this exact image as the primary visual reference and skips the
  // random auto-injection. Hidden form chip when null — the gallery's
  // own click-to-pin hint banner does the framing.
  const [selectedInspoUrl, setSelectedInspoUrl] = useState<string | null>(null);

  // Inspiration preview drawer — click on a card opens the standard
  // MediaDetailView slide-bar, same as everywhere else in the app.
  // The drawer's "Recréer" primary CTA pins the inspo as the anchor.
  const [previewedInspoUrl, setPreviewedInspoUrl] = useState<string | null>(null);

  // Drag-overlay flag for the screenshot upload hero block. Toggled by
  // the dropzone's onDragEnter/Leave so we can paint the "drop to add"
  // glow without re-running the file pickers.
  const [isDragging, setIsDragging] = useState(false);

  // Headline-hint is a power-user field — collapsed by default so the
  // form reads as 4 visual blocks (screenshots, app, style, variants)
  // instead of a wall of inputs. The toggle lives below the description.
  const [showHeadline, setShowHeadline] = useState(false);

  // Sub-tabs that switch the bottom section between the user's project
  // archive ("Galerie") and the curated reference packs ("Packs"). The
  // ~230-screenshot inspirations library lives inside the Packs tab too
  // — same place the user goes to pick a style anchor.
  const [bottomSubTab, setBottomSubTab] = useState<"gallery" | "templates">("gallery");

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

  // ── Project archive: load on mount ────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setProjects(parsed.slice(0, MAX_PROJECTS));
    } catch {
      // Corrupt or stale entry — wipe rather than crash.
      localStorage.removeItem(PROJECTS_STORAGE_KEY);
    }
  }, []);

  // Auto-save the current project after each successful generation. We
  // only persist once there's at least 1 image so empty drafts don't
  // pollute the history.
  useEffect(() => {
    if (generated.length === 0) return;
    if (typeof window === "undefined") return;

    const id = currentProjectId || genProjectId();
    const existingIdx = projects.findIndex((p) => p.id === id);
    const existing = existingIdx >= 0 ? projects[existingIdx] : null;
    const project: Project = {
      id,
      appName: appName.trim() || "Sans nom",
      appDescription,
      headlineHint,
      vertical,
      accent,
      formatKey,
      generated,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    const others = projects.filter((p) => p.id !== id);
    const next = [project, ...others].slice(0, MAX_PROJECTS);
    setProjects(next);
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota exceeded (rare — images are URL refs, not blobs). Drop oldest.
      const trimmed = next.slice(0, Math.max(5, Math.floor(MAX_PROJECTS / 2)));
      try {
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        /* give up silently */
      }
    }
    if (!currentProjectId) setCurrentProjectId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated]);

  const startNewProject = () => {
    setCurrentProjectId(null);
    setAppName("");
    setAppDescription("");
    setHeadlineHint("");
    setVertical("utility");
    setAccent("#FF6B35");
    setFormatKey("iphone67");
    setNumVariants(5);
    setRefs([]);
    refPreviews.forEach((u) => URL.revokeObjectURL(u));
    setRefPreviews([]);
    setGenerated([]);
    setCurrentIdx(0);
    setError(null);
    setSelectedInspoUrl(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const loadProject = (p: Project) => {
    setCurrentProjectId(p.id);
    setAppName(p.appName);
    setAppDescription(p.appDescription);
    setHeadlineHint(p.headlineHint);
    setVertical(p.vertical);
    setAccent(p.accent);
    setFormatKey(p.formatKey);
    setRefs([]); // refs aren't serialisable; user re-uploads if they want
    refPreviews.forEach((u) => URL.revokeObjectURL(u));
    setRefPreviews([]);
    setGenerated(p.generated);
    setCurrentIdx(0);
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteProject = (id: string) => {
    const next = projects.filter((p) => p.id !== id);
    setProjects(next);
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (currentProjectId === id) startNewProject();
  };

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
      // User-pinned inspiration screenshot — single absolute URL. The
      // backend resolves it to local bytes and uses it as the primary
      // anchor (overrides the heuristic vertical match and the random
      // auto-inject). When null the backend falls back to its niche
      // heuristic on its own — no extra field needed.
      if (selectedInspoUrl) fd.append("inspo_template_url", selectedInspoUrl);
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
      <div className="flex-1 overflow-y-auto studio-dot-grid studio-mint-glow glow-appstore">
        <div className="studio-content max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">
          <ThumbsModeTabs />

          {/* Two-column layout : form left, preview right. The page
              hero ("App Store Screenshots / portrait visuals…") was
              dropped — the tab pill above already labels the mode and
              the hero just bulked up the form's vertical footprint. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
            {/* ── Form ── */}
            <div className="composer-panel flex flex-col gap-5" style={{ padding: 22 }}>
              {/* Pinned-inspiration chip — only renders when the user
                  picked an image in the Packs tab below. No empty
                  state, no CTA: the gallery is self-explanatory. */}
              {selectedInspoUrl && (
                <Field label="Inspiration épinglée — l'IA reproduit son format">
                  <div
                    className="flex items-center gap-3 p-2 pr-3 rounded-lg"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedInspoUrl}
                      alt="Inspiration épinglée"
                      style={{
                        width: 64,
                        height: 48,
                        objectFit: "cover",
                        borderRadius: 6,
                        flexShrink: 0,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        Template ancré
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary)",
                        }}
                      >
                        L&apos;IA reproduit ce format sur la prochaine génération
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedInspoUrl(null)}
                      aria-label="Retirer l'inspiration"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
                        padding: 4,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                </Field>
              )}

              {/* ─── 1. APP SCREENSHOTS UPLOAD — hero block ─────────
                  Promoted to the top because the user's actual app
                  screens ARE the input. The dropzone is wide, dashed,
                  with a phone-mosaic illustration so the affordance is
                  visual not textual. Drag-and-drop wired so users can
                  drop straight from Finder. */}
              <div
                className="rounded-xl flex flex-col cursor-pointer transition-all"
                style={{
                  background: isDragging
                    ? "color-mix(in srgb, var(--text-primary) 5%, var(--bg-primary))"
                    : "var(--bg-primary)",
                  border: `1.5px dashed ${
                    isDragging ? "var(--text-primary)" : "var(--border-color)"
                  }`,
                  padding: refPreviews.length > 0 ? 14 : 22,
                }}
                onClick={() => document.getElementById("appstore-refs")?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  // Only drop the highlight when the cursor leaves the
                  // outer container — child enter events fire onDragLeave
                  // on the parent otherwise and the glow flickers.
                  if (e.currentTarget === e.target) setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  onPickRefs(e.dataTransfer.files);
                }}
              >
                {refPreviews.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-2">
                    {/* Phone-trio illustration — 3 abstract rectangles
                        suggesting the App Store screenshot triptych
                        without rendering literal phones (text-free). */}
                    <div className="flex items-end gap-1.5" aria-hidden>
                      {[36, 44, 36].map((h, i) => (
                        <div
                          key={i}
                          style={{
                            width: 22,
                            height: h,
                            borderRadius: 5,
                            background: i === 1
                              ? "color-mix(in srgb, var(--text-primary) 18%, transparent)"
                              : "color-mix(in srgb, var(--text-primary) 9%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--text-primary) 14%, transparent)",
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                        Glisse les écrans de ton app
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        Onglets, settings, écran principal — jusqu&apos;à 5
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className="flex items-center gap-2"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}
                      >
                        <ImageSquare size={14} />
                        {refPreviews.length} écran{refPreviews.length > 1 ? "s" : ""}
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary, #9ca3af)" }}>
                        + ajouter
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {refPreviews.map((src, i) => (
                        <div
                          key={i}
                          className="relative rounded-md overflow-hidden"
                          style={{
                            border: "1px solid var(--border-color)",
                            aspectRatio: "9/19.5",
                            background: "var(--bg-secondary)",
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
                              display: "block",
                            }}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRef(i);
                            }}
                            aria-label="Retirer cette capture"
                            style={{
                              position: "absolute",
                              top: 3,
                              right: 3,
                              background: "rgba(0,0,0,0.65)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 999,
                              width: 18,
                              height: 18,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <XIcon size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <input
                  id="appstore-refs"
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => onPickRefs(e.target.files)}
                />
              </div>

              {/* ─── 2. APP IDENTITY — name + description stacked ───
                  No more parentheticals or example sentences in the
                  labels. The placeholder carries the tone, the label
                  carries the meaning. */}
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Nom de l'app"
                  style={{ ...inputStyle, fontSize: 15, fontWeight: 600 }}
                />
                <textarea
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  placeholder="Que fait ton app, et pour qui ? (1-2 phrases — l'IA écrit les titres à partir de ça)"
                  style={{ ...inputStyle, minHeight: 84, resize: "vertical", lineHeight: 1.5 }}
                  maxLength={600}
                />

                {/* Headline-hint toggle — collapsed by default. The form
                    reads cleaner without a third input dangling at the
                    bottom of this block; users who want to steer the
                    headline can pop it open in one click. */}
                {!showHeadline ? (
                  <button
                    type="button"
                    onClick={() => setShowHeadline(true)}
                    className="self-start"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      background: "transparent",
                      border: "none",
                      padding: "2px 0",
                      cursor: "pointer",
                    }}
                  >
                    + Suggère un headline (optionnel)
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={headlineHint}
                      onChange={(e) => setHeadlineHint(e.target.value)}
                      placeholder="Idée de headline — l'IA va le polir"
                      style={{ ...inputStyle, flex: 1 }}
                      maxLength={120}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setHeadlineHint("");
                        setShowHeadline(false);
                      }}
                      aria-label="Retirer le headline"
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border-color)",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
                        padding: 8,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* ─── 3. CATEGORY — single-line chips, wrap to 2 rows ─
                  Examples ("Mealy, Calculator, Translate") moved into
                  a `title` attribute so they surface on hover, not
                  inline. Drops the field's vertical footprint by ~60%. */}
              <div className="flex flex-wrap gap-1.5">
                {VERTICALS.map((v) => {
                  const active = vertical === v.key;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => setVertical(v.key)}
                      title={v.example}
                      className="rounded-full transition-colors"
                      style={{
                        background: active
                          ? "var(--text-primary)"
                          : "var(--bg-primary)",
                        color: active
                          ? "var(--bg-primary)"
                          : "var(--text-primary)",
                        border: active
                          ? "1px solid var(--text-primary)"
                          : "1px solid var(--border-color)",
                        padding: "6px 12px",
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>

              {/* ─── 4. STYLE & FORMAT — accent + format on one row ──
                  Accent shrunk to a single swatch + 4-char hex strip
                  (full input was 80% empty space). Format compressed
                  to label-only chips, dimensions hidden behind hover. */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Color chip — wrapping <label> forwards clicks to the
                    nested color input natively, so the entire pill is
                    a hit target. The actual <input type="color"> is
                    visually hidden (size 0 + opacity 0) but still
                    reachable via the label association. */}
                <label
                  className="flex items-center gap-2 rounded-full"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    padding: "4px 10px 4px 4px",
                    cursor: "pointer",
                  }}
                  title="Couleur d'accent"
                >
                  <input
                    type="color"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    style={{
                      position: "absolute",
                      width: 0,
                      height: 0,
                      opacity: 0,
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: accent,
                      border: "1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      fontFamily: "ui-monospace, monospace",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {accent.toUpperCase()}
                  </span>
                </label>

                <div className="flex gap-1.5 flex-wrap">
                  {FORMAT_PRESETS.map((f) => {
                    const active = formatKey === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFormatKey(f.key)}
                        title={`${f.w}×${f.h}`}
                        className="rounded-full transition-colors"
                        style={{
                          background: active ? "var(--text-primary)" : "var(--bg-primary)",
                          color: active ? "var(--bg-primary)" : "var(--text-primary)",
                          border: active
                            ? "1px solid var(--text-primary)"
                            : "1px solid var(--border-color)",
                          padding: "6px 12px",
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ─── 5. VARIANTS — segmented 3-button with credits ───
                  Compact segmented control. Credits shown only on the
                  selected option's caption to reduce visual noise. */}
              <div className="flex items-center gap-3">
                <div
                  className="flex p-0.5 rounded-full"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  {VARIANT_COUNTS.map((n) => {
                    const active = numVariants === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNumVariants(n)}
                        className="rounded-full transition-colors"
                        style={{
                          background: active ? "var(--text-primary)" : "transparent",
                          color: active ? "var(--bg-primary)" : "var(--text-primary)",
                          border: "none",
                          padding: "6px 18px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          minWidth: 40,
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {numVariants === 1 ? "visuel" : "visuels"} · {numVariants * 6} crédits
                </span>
              </div>

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

              {/* Generate CTA — styled to match the Bento `.composer-submit`
                  pattern: kargul-spec blue depth on active, flat neutral
                  on disabled. The pill stays full-width inside the form
                  so the user can hit it without hunting the cursor. */}
              <button
                onClick={handleGenerate}
                disabled={submitting || !appName.trim() || !appDescription.trim()}
                className={
                  (submitting || !appName.trim() || !appDescription.trim()
                    ? ""
                    : "btn-premium-as ") +
                  "rounded-full px-5 py-3 inline-flex items-center justify-center gap-2 font-semibold"
                }
                style={{
                  fontSize: 14,
                  ...(submitting || !appName.trim() || !appDescription.trim()
                    ? {
                        background: "var(--bg-tertiary, #f3f4f6)",
                        color: "var(--text-tertiary, #9ca3af)",
                        border: "1px solid var(--border-color)",
                        boxShadow: "none",
                        cursor: "not-allowed",
                      }
                    : {}),
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
              {/* Active project header — only when there's something to reset */}
              {(showingGenerated || appName.trim() || appDescription.trim()) && (
                <div
                  className="flex items-center justify-between rounded-xl px-4 py-2.5"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div className="min-w-0">
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--text-tertiary, #9ca3af)",
                      }}
                    >
                      Projet en cours
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginTop: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {appName.trim() || "Sans nom"}{showingGenerated && ` · ${generated.length} ${generated.length > 1 ? "visuels" : "visuel"}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={startNewProject}
                    disabled={submitting}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    + Nouveau projet
                  </button>
                </div>
              )}

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

          {/* Sub-tabs — same segmented capsule pattern as the YouTube
              page. Switches the section below between the user's
              project archive and the curated reference packs. */}
          <div className="flex justify-center mt-12 mb-4">
            <div className="tab-group-pill">
              <button
                type="button"
                onClick={() => setBottomSubTab("gallery")}
                aria-pressed={bottomSubTab === "gallery"}
                className={
                  "flex items-center gap-2 rounded-full " +
                  (bottomSubTab === "gallery" ? "btn-premium-as" : "tab-pill-rest")
                }
                style={{
                  padding: "7px 16px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  border: bottomSubTab === "gallery" ? undefined : "1px solid transparent",
                }}
              >
                Galerie
              </button>
              <button
                type="button"
                onClick={() => setBottomSubTab("templates")}
                aria-pressed={bottomSubTab === "templates"}
                className={
                  "flex items-center gap-2 rounded-full " +
                  (bottomSubTab === "templates" ? "btn-premium-as" : "tab-pill-rest")
                }
                style={{
                  padding: "7px 16px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  border: bottomSubTab === "templates" ? undefined : "1px solid transparent",
                }}
              >
                Packs
              </button>
            </div>
          </div>

          {/* PACKS VIEW — the curated ~230-screenshot inspirations
              library, served grid-style at native 4:3 aspect. Click
              any tile to pin it as the style anchor for the next
              generation. The gallery's own internal style-bucket tabs
              and "click to pin" hint banner cover the framing — no
              extra CTA needed. */}
          {bottomSubTab === "templates" && (
            <div className="mb-8">
              <AppstoreInspoGallery
                onPickAnchor={(url) => {
                  // Open the standard preview drawer instead of pinning
                  // immediately — same "click an image → slide bar"
                  // pattern as the rest of the app. Pinning happens
                  // when the user clicks "Recréer" inside the drawer.
                  setPreviewedInspoUrl(url);
                }}
                pinnedAnchorUrl={selectedInspoUrl}
              />
            </div>
          )}

          {/* ── Project history (Gallery sub-tab) ── */}
          {bottomSubTab === "gallery" && projects.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--text-tertiary, #9ca3af)",
                    }}
                  >
                    Projets
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginTop: 2,
                    }}
                  >
                    Tes packs précédents ({projects.length})
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary, #9ca3af)" }}>
                  Clique pour reprendre
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p) => {
                  const isActive = p.id === currentProjectId;
                  const cover = p.generated[0]?.url;
                  return (
                    <div
                      key={p.id}
                      className="rounded-2xl overflow-hidden flex flex-col"
                      style={{
                        background: "var(--bg-secondary)",
                        border: isActive
                          ? `1.5px solid ${p.accent}`
                          : "1px solid var(--border-color)",
                        boxShadow: isActive ? `0 0 0 4px ${p.accent}22` : "none",
                        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => loadProject(p)}
                        className="text-left flex"
                        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, width: "100%" }}
                      >
                        <div
                          style={{
                            width: 88,
                            aspectRatio: "9 / 19.5",
                            flexShrink: 0,
                            background: cover ? "transparent" : `linear-gradient(160deg, ${p.accent}, ${p.accent}99)`,
                            borderRight: "1px solid var(--border-color)",
                            overflow: "hidden",
                          }}
                        >
                          {cover && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
                              alt={p.appName}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 p-3 flex flex-col justify-between" style={{ minHeight: 110 }}>
                          <div>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: "var(--text-primary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {p.appName || "Sans nom"}
                            </div>
                            <div
                              style={{
                                fontSize: 11.5,
                                color: "var(--text-secondary)",
                                marginTop: 4,
                                lineHeight: 1.4,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {p.appDescription || "(pas de description)"}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div style={{ fontSize: 10.5, color: "var(--text-tertiary, #9ca3af)" }}>
                              {p.generated.length} {p.generated.length > 1 ? "visuels" : "visuel"} · {relativeTime(p.updatedAt)}
                            </div>
                            <div
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 4,
                                background: p.accent,
                                border: "1px solid var(--border-color)",
                              }}
                              title={p.accent}
                            />
                          </div>
                        </div>
                      </button>
                      <div
                        className="flex items-center justify-end px-3 pb-2"
                        style={{ background: "var(--bg-secondary)" }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Supprimer "${p.appName || "ce projet"}" de l'historique ?`)) {
                              deleteProject(p.id);
                            }
                          }}
                          className="text-xs"
                          style={{
                            color: "var(--text-tertiary, #9ca3af)",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: "2px 6px",
                          }}
                          title="Supprimer ce projet"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inspiration preview drawer — universal "click an image →
          slide bar" pattern. The "Recréer" primary CTA pins this
          inspo as the dominant style anchor for the next generation. */}
      {previewedInspoUrl && (
        <MediaDetailView
          item={{
            id: previewedInspoUrl,
            type: "image",
            url: previewedInspoUrl,
            prompt: "",
            created_at: "",
            source_label: "Inspiration App Store",
          }}
          primaryActionLabel="Recréer"
          onClose={() => setPreviewedInspoUrl(null)}
          onDownload={() => {
            const a = document.createElement("a");
            a.href = previewedInspoUrl;
            a.download = "inspiration.jpg";
            a.click();
          }}
          onReusePrompt={() => {
            setSelectedInspoUrl(previewedInspoUrl);
            setPreviewedInspoUrl(null);
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        />
      )}
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
