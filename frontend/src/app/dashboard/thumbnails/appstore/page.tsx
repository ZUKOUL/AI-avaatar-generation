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

// Template gallery — surfaces the curated reference packs from
// /thumbnail/appstore-templates so the user can pin a specific style
// anchor instead of relying on the heuristic vertical match.
interface TemplatePack {
  slug: string;
  name: string;
  vertical: string;
  screen_count: number;
  palette?: string[];
  thumbnail_url: string;
  icon_url: string;
}

interface AppstoreTemplatesResponse {
  version: number;
  verticals: string[];
  packs_by_vertical: Record<string, TemplatePack[]>;
  total: number;
}

const VERTICAL_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  VERTICALS.map((v) => [v.key, v.label])
);

// API base URL for absolute <img src> on template thumbnails. The
// backend serves them via a static mount that returns relative paths
// like `/niche-assets/appstore/...`. Mirror the same env var used by
// `lib/api.ts` so we resolve identically in dev / preview / prod.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

  // Template picker — a user-pinned anchor pack overrides the heuristic
  // vertical match. We lazy-load templates the first time the modal opens
  // so the page boot stays light when the user doesn't care about styles.
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [templates, setTemplates] = useState<AppstoreTemplatesResponse | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [activeVerticalTab, setActiveVerticalTab] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<TemplatePack | null>(null);

  // Sub-tabs that switch the bottom section between the user's project
  // archive ("Galerie") and the curated reference packs ("Templates").
  // Mirrors the same pattern on the YouTube page so the three studios
  // share a unified design.
  const [bottomSubTab, setBottomSubTab] = useState<"gallery" | "templates">(
    "gallery",
  );

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

  const openGallery = async () => {
    setGalleryOpen(true);
    if (templates) return; // already loaded — no refetch
    setLoadingTemplates(true);
    try {
      const { data } = await thumbnailAPI.appstoreTemplates();
      setTemplates(data as AppstoreTemplatesResponse);
      const firstTab = (data as AppstoreTemplatesResponse).verticals?.[0] || null;
      setActiveVerticalTab(firstTab);
    } catch (err) {
      console.error("appstore templates fetch failed", err);
    } finally {
      setLoadingTemplates(false);
    }
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
    setSelectedPack(null);
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
      // User-pinned style anchor pack always wins over the heuristic
      // vertical match on the backend. No-op when nothing is selected.
      if (selectedPack) fd.append("template_pack_slug", selectedPack.slug);
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

          {/* Two-column layout : form left, preview right. Form panel
              uses the Pikzels-style `composer-panel` shell — same dark
              surface + soft mint focus halo as the Bento composer, so
              the three studios feel like the same app. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            {/* ── Form ── */}
            <div className="composer-panel flex flex-col gap-5" style={{ padding: 22 }}>
              <Field label="Style anchor (optionnel — l'IA reproduit la cohérence visuelle de cet app)">
                {selectedPack ? (
                  <div
                    className="flex items-center gap-3 p-2 pr-3 rounded-lg"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <img
                      src={`${API_BASE}${selectedPack.thumbnail_url}`}
                      alt={selectedPack.name}
                      style={{
                        width: 48,
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
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {selectedPack.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          textTransform: "capitalize",
                        }}
                      >
                        {VERTICAL_LABEL_BY_KEY[selectedPack.vertical] || selectedPack.vertical} · {selectedPack.screen_count} écrans
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openGallery}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                        background: "transparent",
                        border: "1px solid var(--border-color)",
                        padding: "4px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Changer
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPack(null)}
                      aria-label="Retirer le template"
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
                ) : (
                  <button
                    type="button"
                    onClick={openGallery}
                    className="btn-premium"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "var(--bg-primary)",
                      border: "1px dashed var(--border-color)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <MagicWand className="w-4 h-4" />
                    Parcourir les templates
                  </button>
                )}
              </Field>

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

          {/* TEMPLATES VIEW — opens the gallery picker inline so the
              user can browse the 5 curated reference packs (avatar_pro,
              smart_reminders, faith_assistant, clip_to_pay, chef_ai)
              without going through the modal. Click → pin as anchor. */}
          {bottomSubTab === "templates" && (
            <div className="mb-8">
              <button
                type="button"
                onClick={openGallery}
                className="rounded-xl px-6 py-10 w-full text-center flex flex-col items-center gap-3 transition-all"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px dashed var(--border-color)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--text-primary)";
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-color)";
                  e.currentTarget.style.background = "var(--bg-secondary)";
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-primary)",
                  }}
                >
                  <MagicWand size={20} />
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {selectedPack
                    ? `Style ancré — ${selectedPack.name}`
                    : "Parcourir les packs de référence"}
                </div>
                <div style={{ fontSize: 12.5, maxWidth: 480, lineHeight: 1.5 }}>
                  5 packs curés (avatar_pro, smart_reminders, faith_assistant,
                  clip_to_pay, chef_ai) groupés par niche. L&apos;IA reproduit
                  la cohérence visuelle du pack pinné.
                </div>
              </button>
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

      {galleryOpen && (
        <AppstoreTemplatesModal
          templates={templates}
          loading={loadingTemplates}
          activeTab={activeVerticalTab}
          onTabChange={setActiveVerticalTab}
          onPick={(pack) => {
            setSelectedPack(pack);
            setGalleryOpen(false);
          }}
          onClose={() => setGalleryOpen(false)}
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

/* ─── Templates gallery modal ─────────────────────────────────────
 * Lazy-rendered (only mounted when `galleryOpen`). Backdrop blur,
 * tabs per vertical (ai / productivity / lifestyle / social /
 * utility), responsive grid of pack cards. Click a card → pin it as
 * the style anchor and close.
 *
 * Dismissal: Esc key (Mac users press Escape with one hand) or
 * clicking the dimmed backdrop. Clicks inside the panel don't bubble.
 */
function AppstoreTemplatesModal({
  templates,
  loading,
  activeTab,
  onTabChange,
  onPick,
  onClose,
}: {
  templates: AppstoreTemplatesResponse | null;
  loading: boolean;
  activeTab: string | null;
  onTabChange: (tab: string) => void;
  onPick: (pack: TemplatePack) => void;
  onClose: () => void;
}) {
  // Esc-to-close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const verticals = templates?.verticals || [];
  const packs = (activeTab && templates?.packs_by_vertical[activeTab]) || [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 16,
          width: "min(1100px, 100%)",
          maxHeight: "min(90vh, 800px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              Choisis un style anchor
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              L'IA reproduit la palette, la typographie et le rythme de l'app pickée — pas son contenu.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "transparent",
              border: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 8,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        {verticals.length > 0 && (
          <div
            style={{
              padding: "10px 20px",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              gap: 6,
              overflowX: "auto",
              flexWrap: "nowrap",
            }}
          >
            {verticals.map((v) => {
              const isActive = v === activeTab;
              const count = templates?.packs_by_vertical[v]?.length || 0;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onTabChange(v)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    fontSize: 12.5,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    border: "1px solid var(--border-color)",
                    background: isActive ? "var(--text-primary)" : "transparent",
                    color: isActive ? "var(--bg-primary)" : "var(--text-secondary)",
                    transition: "background 120ms, color 120ms",
                  }}
                >
                  {VERTICAL_LABEL_BY_KEY[v] || v} <span style={{ opacity: 0.6 }}>· {count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
          }}
        >
          {loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 200,
                color: "var(--text-secondary)",
                fontSize: 13,
              }}
            >
              Chargement des templates…
            </div>
          )}

          {!loading && verticals.length === 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 200,
                color: "var(--text-secondary)",
                fontSize: 13,
              }}
            >
              Aucun template disponible pour l'instant.
            </div>
          )}

          {!loading && packs.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              {packs.map((pack) => (
                <button
                  key={`${pack.vertical}-${pack.slug}`}
                  type="button"
                  onClick={() => onPick(pack)}
                  style={{
                    textAlign: "left",
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    padding: 0,
                    overflow: "hidden",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    transition: "transform 120ms, border-color 120ms",
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
                  <div
                    style={{
                      aspectRatio: "9 / 16",
                      background: "var(--bg-secondary)",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <img
                      src={`${API_BASE}${pack.thumbnail_url}`}
                      alt={pack.name}
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                  <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {pack.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {pack.screen_count} écrans
                    </div>
                    {pack.palette && pack.palette.length > 0 && (
                      <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                        {pack.palette.slice(0, 5).map((c, i) => (
                          <span
                            key={i}
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 3,
                              background: c,
                              border: "1px solid rgba(0,0,0,0.08)",
                              flexShrink: 0,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
