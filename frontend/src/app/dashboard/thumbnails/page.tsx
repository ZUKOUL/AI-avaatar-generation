"use client";

/**
 * Thumbnail Studio — Pikzels-style YouTube thumbnail generator.
 *
 * Four modes share the same canvas:
 *   • Prompt    – generate from scratch (text → image).
 *   • Recreate  – paste a YouTube URL, we scrape the existing thumbnail and
 *                 use it as a reference for the remix.
 *   • Edit      – upload an existing thumbnail and modify it.
 *   • Title     – generate with baked-in title text overlay.
 *
 * All modes accept optional character reference images so the subject stays
 * recognizable across remixes. Generated thumbnails stream into a history
 * grid grouped by date (same pattern as the Image Generator).
 */

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import SegmentToggle from "@/components/SegmentToggle";
import { thumbnailAPI } from "@/lib/api";
import {
  Download,
  LinkIcon,
  MagicWand,
  PlaySquare,
  Pencil,
  Spinner,
  Type,
  Upload,
  XIcon,
} from "@/components/Icons";

type Mode = "prompt" | "recreate" | "edit" | "title";
type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

interface GeneratedThumbnail {
  thumbnail_id: string;
  image_url: string;
  mode: Mode;
  aspect_ratio: AspectRatio;
  prompt: string;
  created_at: string; // local ISO; history is session-scoped for now
  source_thumbnail_url?: string | null;
  youtube_video_id?: string | null;
}

const MODE_ITEMS: { key: Mode; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { key: "prompt", label: "Prompt", Icon: MagicWand },
  { key: "recreate", label: "Recreate", Icon: LinkIcon },
  { key: "edit", label: "Edit", Icon: Pencil },
  { key: "title", label: "Title", Icon: Type },
];

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "16:9", label: "YouTube" },
  { value: "9:16", label: "Shorts" },
  { value: "1:1", label: "Square" },
  { value: "4:3", label: "Classic" },
  { value: "3:4", label: "Portrait" },
];

const SAMPLE_PROMPTS: Record<Mode, string[]> = {
  prompt: [
    "A surprised creator pointing at a giant glowing dollar sign",
    "Side-by-side comparison of two iPhones with explosive neon lighting",
    "A minimalist gym thumbnail: single dumbbell, sharp shadow, bold mood",
  ],
  recreate: [
    "Make the expression angrier and add smoke behind the subject",
    "Swap the background for a clean white studio",
    "Add a huge red arrow pointing at the product",
  ],
  edit: [
    "Remove the channel logo and clean up the background",
    "Brighten the subject and increase contrast",
    "Replace the sky with a dramatic sunset",
  ],
  title: [
    "MrBeast-style giant text with a shocked reaction",
    "Minimal serif title, subject centered, soft lighting",
    "Bold 3D-looking text with a drop shadow — clean layout",
  ],
};

export default function ThumbnailStudio() {
  const [mode, setMode] = useState<Mode>("prompt");
  const [prompt, setPrompt] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [titleText, setTitleText] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [refs, setRefs] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedThumbnail[]>([]);
  const [lightbox, setLightbox] = useState<GeneratedThumbnail | null>(null);

  // YouTube preview (lives behind a URL input — shown as soon as we detect a
  // valid video ID; we let <img onerror> cascade through the quality tiers).
  const [ytPreview, setYtPreview] = useState<{ videoId: string; url: string } | null>(null);
  const ytDebounceRef = useRef<number | null>(null);

  const refInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  /* ─── Character reference images ─── */
  const handleRefFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 5 - refs.length);
    if (arr.length === 0) return;
    const newPreviews: string[] = [];
    arr.forEach((f) => newPreviews.push(URL.createObjectURL(f)));
    setRefs((prev) => [...prev, ...arr]);
    setRefPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeRef = (i: number) => {
    setRefs((prev) => prev.filter((_, idx) => idx !== i));
    setRefPreviews((prev) => {
      const [removed] = prev.splice(i, 1);
      if (removed) URL.revokeObjectURL(removed);
      return [...prev];
    });
  };

  /* ─── Source file (edit mode) ─── */
  const handleSourceFile = (file: File) => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setSourceFile(file);
    setSourcePreview(URL.createObjectURL(file));
  };

  const clearSource = () => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setSourceFile(null);
    setSourcePreview(null);
  };

  /* ─── YouTube URL preview (debounced client-side validation) ─── */
  useEffect(() => {
    if (mode !== "recreate") {
      setYtPreview(null);
      return;
    }
    if (!youtubeUrl.trim()) {
      setYtPreview(null);
      return;
    }
    if (ytDebounceRef.current) window.clearTimeout(ytDebounceRef.current);
    ytDebounceRef.current = window.setTimeout(async () => {
      try {
        const res = await thumbnailAPI.youtubePreview(youtubeUrl.trim());
        setYtPreview({
          videoId: res.data.video_id,
          url: res.data.thumbnail_urls.maxres,
        });
        setError(null);
      } catch {
        setYtPreview(null);
      }
    }, 350);
    return () => {
      if (ytDebounceRef.current) window.clearTimeout(ytDebounceRef.current);
    };
  }, [youtubeUrl, mode]);

  /* ─── Cleanup object URLs on unmount ─── */
  useEffect(() => {
    return () => {
      refPreviews.forEach((url) => URL.revokeObjectURL(url));
      if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Drag-drop for source / refs ─── */
  const onDropSource = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleSourceFile(file);
  };

  const onDropRefs = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) handleRefFiles(files);
  };

  /* ─── Generate ─── */
  const canSubmit = (): boolean => {
    if (loading) return false;
    if (!prompt.trim() && mode !== "recreate") return false;
    if (mode === "recreate" && !ytPreview) return false;
    if (mode === "edit" && !sourceFile) return false;
    return true;
  };

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("mode", mode);
      // Recreate allows an empty prompt (user may just want a faithful remix of
      // a URL). We still require something so Gemini has instructions.
      form.append("prompt", prompt.trim() || "Recreate with the same theme but a fresh take.");
      form.append("aspect_ratio", aspectRatio);
      if (mode === "recreate" && youtubeUrl.trim()) {
        form.append("youtube_url", youtubeUrl.trim());
      }
      if (mode === "title") {
        form.append("title_text", titleText.trim());
      }
      // Edit mode: source file goes as the FIRST ref so the backend prompt
      // logic keys off of position ("first uploaded image is the source").
      if (mode === "edit" && sourceFile) form.append("files", sourceFile);
      refs.forEach((f) => form.append("files", f));

      const res = await thumbnailAPI.generate(form);
      const data = res.data;
      const next: GeneratedThumbnail = {
        thumbnail_id: data.thumbnail_id,
        image_url: data.image_url,
        mode: data.mode,
        aspect_ratio: data.aspect_ratio,
        prompt: prompt.trim() || "(recreate)",
        created_at: new Date().toISOString(),
        source_thumbnail_url: data.source_thumbnail_url ?? null,
        youtube_video_id: data.youtube_video_id ?? null,
      };
      setHistory((prev) => [next, ...prev]);
      setLightbox(next);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string | { message?: string } } } };
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : detail?.message ?? "Generation failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (t: GeneratedThumbnail) => {
    try {
      const res = await fetch(t.image_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `horpen-thumbnail-${t.thumbnail_id.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // fallback: open in new tab
      window.open(t.image_url, "_blank");
    }
  };

  return (
    <>
      <Header title="Thumbnails" subtitle="Generate viral YouTube thumbnails with Nano Banana Pro" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">
          {/* Title */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <PlaySquare size={18} />
            </div>
            <div>
              <h2 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Thumbnail Studio
              </h2>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Create from scratch, recreate from a YouTube link, edit an upload, or bake in a title.
              </p>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex justify-center mb-6">
            <SegmentToggle
              selected={mode}
              onSelect={(k) => {
                setMode(k as Mode);
                setError(null);
              }}
              items={MODE_ITEMS.map((m) => ({
                key: m.key,
                label: m.label,
                icon: <m.Icon size={14} />,
              }))}
            />
          </div>

          {/* Mode-specific input card */}
          <div
            className="rounded-2xl mb-5"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            {mode === "recreate" && (
              <div className="p-5 pb-0">
                <label
                  className="text-[12px] font-medium mb-2 block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  YouTube URL
                </label>
                <div
                  className="flex items-center gap-2 rounded-xl px-3"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <LinkIcon size={16} />
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="flex-1 bg-transparent outline-none py-3 text-[13px]"
                    style={{ color: "var(--text-primary)" }}
                  />
                  {youtubeUrl && (
                    <button
                      type="button"
                      onClick={() => setYoutubeUrl("")}
                      className="p-1 rounded-md"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Clear URL"
                    >
                      <XIcon size={14} />
                    </button>
                  )}
                </div>
                {/* Live 16:9 preview */}
                {ytPreview && (
                  <div className="mt-4">
                    <div
                      className="relative rounded-xl overflow-hidden"
                      style={{
                        aspectRatio: "16 / 9",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ytPreview.url}
                        alt="YouTube thumbnail preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (el.src.includes("maxresdefault")) {
                            el.src = el.src.replace("maxresdefault", "hqdefault");
                          } else if (el.src.includes("hqdefault")) {
                            el.src = el.src.replace("hqdefault", "mqdefault");
                          }
                        }}
                      />
                    </div>
                    <p className="text-[11.5px] mt-2" style={{ color: "var(--text-muted)" }}>
                      We&apos;ll remix this thumbnail based on your prompt below.
                    </p>
                  </div>
                )}
              </div>
            )}

            {mode === "edit" && (
              <div className="p-5 pb-0">
                <label
                  className="text-[12px] font-medium mb-2 block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Source thumbnail
                </label>
                {sourcePreview ? (
                  <div
                    className="relative rounded-xl overflow-hidden"
                    style={{
                      aspectRatio: "16 / 9",
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sourcePreview}
                      alt="Source thumbnail"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={clearSource}
                      className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{
                        background: "rgba(0,0,0,0.55)",
                        color: "#fff",
                        backdropFilter: "blur(8px)",
                      }}
                      aria-label="Remove source"
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => sourceInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDropSource}
                    className="rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer"
                    style={{
                      aspectRatio: "16 / 9",
                      background: "var(--bg-primary)",
                      border: "1px dashed var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <Upload size={20} />
                    <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      Drop an image or click to upload
                    </div>
                    <div className="text-[11.5px]">PNG, JPG up to 10 MB</div>
                  </div>
                )}
                <input
                  ref={sourceInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSourceFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            )}

            {mode === "title" && (
              <div className="p-5 pb-0">
                <label
                  className="text-[12px] font-medium mb-2 block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Title to bake into the image
                  <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                    (optional — we&apos;ll write one if left empty)
                  </span>
                </label>
                <div
                  className="flex items-center gap-2 rounded-xl px-3"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <Type size={16} />
                  <input
                    type="text"
                    placeholder="e.g. I Tried This For 30 Days"
                    value={titleText}
                    onChange={(e) => setTitleText(e.target.value)}
                    maxLength={80}
                    className="flex-1 bg-transparent outline-none py-3 text-[13px]"
                    style={{ color: "var(--text-primary)" }}
                  />
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {titleText.length}/80
                  </span>
                </div>
              </div>
            )}

            {/* Prompt textarea — present in every mode */}
            <div className="p-5">
              <label
                className="text-[12px] font-medium mb-2 block"
                style={{ color: "var(--text-secondary)" }}
              >
                {mode === "recreate"
                  ? "What should we change?"
                  : mode === "edit"
                    ? "Edit instructions"
                    : "Thumbnail concept"}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === "recreate"
                    ? "Make it more dramatic, add neon lighting…"
                    : mode === "edit"
                      ? "Remove the logo, brighten the subject…"
                      : "Describe the thumbnail you want to create…"
                }
                rows={3}
                className="w-full rounded-xl px-4 py-3 text-[13.5px] resize-none outline-none"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />

              {/* Sample prompts */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {SAMPLE_PROMPTS[mode].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPrompt(s)}
                    className="text-[11.5px] px-2.5 py-1 rounded-md"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Controls row */}
            <div
              className="flex flex-wrap items-center gap-3 px-5 py-3"
              style={{ borderTop: "1px solid var(--border-color)" }}
            >
              {/* Aspect ratio picker */}
              <div className="flex items-center gap-2">
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Aspect
                </span>
                <div
                  className="flex rounded-lg p-0.5"
                  style={{
                    background: "var(--segment-bg)",
                    boxShadow: "var(--shadow-segment-inset)",
                  }}
                >
                  {ASPECT_RATIOS.map((r) => {
                    const active = aspectRatio === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setAspectRatio(r.value)}
                        className="px-2.5 py-1 rounded-md text-[11.5px] font-medium whitespace-nowrap"
                        style={{
                          background: active ? "var(--segment-active-bg)" : "transparent",
                          boxShadow: active ? "var(--shadow-segment-active)" : "none",
                          color: active ? "var(--text-primary)" : "var(--text-muted)",
                          transition: "color 0.2s ease, background 0.2s ease",
                        }}
                      >
                        {r.value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reference images — compact row */}
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Character refs
                </span>
                <div className="flex items-center gap-1.5">
                  {refPreviews.map((src, i) => (
                    <div
                      key={i}
                      className="relative w-8 h-8 rounded-md overflow-hidden"
                      style={{ border: "1px solid var(--border-color)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeRef(i)}
                        className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100"
                        style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
                        aria-label="Remove reference"
                      >
                        <XIcon size={10} />
                      </button>
                    </div>
                  ))}
                  {refs.length < 5 && (
                    <button
                      type="button"
                      onClick={() => refInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={onDropRefs}
                      className="w-8 h-8 rounded-md flex items-center justify-center"
                      style={{
                        background: "var(--bg-primary)",
                        border: "1px dashed var(--border-color)",
                        color: "var(--text-muted)",
                      }}
                      aria-label="Add reference image"
                    >
                      <Upload size={12} />
                    </button>
                  )}
                </div>
                <input
                  ref={refInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) handleRefFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div
              className="rounded-xl px-4 py-3 mb-5 text-[13px]"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {error}
            </div>
          )}

          {/* Generate button */}
          <div className="flex justify-center mb-10">
            <button
              onClick={handleGenerate}
              disabled={!canSubmit()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold disabled:cursor-not-allowed"
              style={{
                background: canSubmit() ? "var(--text-primary)" : "var(--bg-tertiary)",
                color: canSubmit() ? "var(--bg-primary)" : "var(--text-muted)",
                boxShadow: canSubmit()
                  ? "0 1px 2px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.12)"
                  : "none",
                opacity: canSubmit() ? 1 : 0.6,
                transition: "box-shadow 0.2s ease, opacity 0.2s ease",
                minWidth: 200,
                justifyContent: "center",
              }}
            >
              {loading ? (
                <>
                  <Spinner size={16} />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <MagicWand size={16} />
                  <span>Generate thumbnail</span>
                </>
              )}
            </button>
          </div>

          {/* History grid */}
          {history.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Your thumbnails
                </h3>
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {history.length} generated this session
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map((t) => (
                  <button
                    key={t.thumbnail_id}
                    onClick={() => setLightbox(t)}
                    className="group relative rounded-xl overflow-hidden text-left"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <div
                      className="relative w-full"
                      style={{
                        aspectRatio:
                          t.aspect_ratio === "9:16"
                            ? "9 / 16"
                            : t.aspect_ratio === "1:1"
                              ? "1 / 1"
                              : t.aspect_ratio === "4:3"
                                ? "4 / 3"
                                : t.aspect_ratio === "3:4"
                                  ? "3 / 4"
                                  : "16 / 9",
                        background: "var(--bg-primary)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.image_url}
                        alt={t.prompt}
                        className="w-full h-full object-cover"
                      />
                      <div
                        className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10.5px] font-medium uppercase tracking-wide"
                        style={{
                          background: "rgba(0,0,0,0.55)",
                          color: "#fff",
                          backdropFilter: "blur(6px)",
                        }}
                      >
                        {t.mode}
                      </div>
                    </div>
                    <div className="px-3 py-2.5">
                      <p
                        className="text-[12px] leading-snug line-clamp-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t.prompt}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {history.length === 0 && !loading && (
            <div
              className="rounded-2xl px-6 py-10 text-center"
              style={{
                background: "var(--bg-secondary)",
                border: "1px dashed var(--border-color)",
              }}
            >
              <div
                className="w-12 h-12 mx-auto mb-3 rounded-lg flex items-center justify-center"
                style={{ background: "var(--bg-primary)" }}
              >
                <PlaySquare size={20} />
              </div>
              <h4 className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                No thumbnails yet
              </h4>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Pick a mode above and hit generate — your thumbnails will land here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)" }}
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-[1100px] w-full max-h-[90vh] rounded-2xl overflow-hidden flex flex-col"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 h-12 shrink-0"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-md"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  {lightbox.mode}
                </span>
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {lightbox.aspect_ratio}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDownload(lightbox)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px]"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  <Download size={14} />
                  Download
                </button>
                <button
                  onClick={() => setLightbox(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Close"
                >
                  <XIcon size={16} />
                </button>
              </div>
            </div>
            <div
              className="flex-1 flex items-center justify-center p-4 overflow-hidden"
              style={{ background: "var(--bg-primary)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.image_url}
                alt={lightbox.prompt}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
            <div className="px-5 py-3 shrink-0" style={{ borderTop: "1px solid var(--border-color)" }}>
              <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                {lightbox.prompt}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
