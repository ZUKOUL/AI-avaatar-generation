"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import { avatarAPI } from "@/lib/api";
import {
  Upload,
  XIcon,
  Spinner,
  ImageSquare,
  UserCircle,
  VideoCamera,
  Plus,
  Minus,
  MagicWand,
  Brush,
  Download,
  Grid,
  LayoutGrid,
} from "@/components/Icons";

interface Avatar {
  avatar_id: string;
  name: string;
  thumbnail: string;
}
interface GeneratedImage {
  image_id: string;
  avatar_id?: string;
  prompt: string;
  image_url: string;
  created_at: string;
}

type AspectRatio = "1:1" | "16:9" | "9:16";
type GridSize = "small" | "medium" | "large";

const TABS = [
  { href: "/dashboard/avatars", icon: UserCircle, label: "Avatar" },
  { href: "/dashboard/images", icon: ImageSquare, label: "Image" },
  { href: "/dashboard/videos", icon: VideoCamera, label: "Video" },
];

function groupByDate(images: GeneratedImage[]): { label: string; items: GeneratedImage[] }[] {
  const groups: Record<string, GeneratedImage[]> = {};
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  for (const img of images) {
    const d = new Date(img.created_at);
    const ds = d.toDateString();
    let label: string;
    if (ds === today) label = "Today";
    else if (ds === yesterday) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(img);
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

const GRID_COLS: Record<GridSize, string> = {
  small: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5",
  medium: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
  large: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
};

export default function ImageGenerator() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [imageCount, setImageCount] = useState(1);
  const [aiPrompt, setAiPrompt] = useState(false);
  const [gridSize, setGridSize] = useState<GridSize>("medium");
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  const [stylePreview, setStylePreview] = useState<string | null>(null);
  const [styleFile, setStyleFile] = useState<File | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [avatarRes, imageRes] = await Promise.all([avatarAPI.list(), avatarAPI.getImages()]);
      setAvatars(avatarRes.data.avatars || []);
      setImages(imageRes.data.images || []);
    } catch { /* silently fail */ }
    finally { setLoadingImages(false); }
  };

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles).slice(0, 3 - files.length);
    const updated = [...files, ...arr];
    setFiles(updated);
    setPreviews(updated.map((f) => URL.createObjectURL(f)));
  };

  const removeFile = (idx: number) => {
    const updated = files.filter((_, i) => i !== idx);
    setFiles(updated);
    setPreviews(updated.map((f) => URL.createObjectURL(f)));
  };

  const handleStyleFile = (fileList: FileList | null) => {
    if (!fileList || !fileList[0]) return;
    const f = fileList[0];
    setStyleFile(f);
    setStylePreview(URL.createObjectURL(f));
  };

  const removeStyle = () => {
    setStyleFile(null);
    setStylePreview(null);
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("prompt", prompt);
    if (selectedAvatar) formData.append("avatar_id", selectedAvatar);
    files.forEach((f) => formData.append("files", f));
    if (styleFile) formData.append("files", styleFile);
    try {
      await avatarAPI.generateImage(formData);
      setPrompt("");
      setFiles([]);
      setPreviews([]);
      setStyleFile(null);
      setStylePreview(null);
      loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string | { message?: string } } } };
      const detail = e.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else if (detail && typeof detail === "object" && "message" in detail) setError(detail.message || "Generation failed");
      else setError("Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [prompt, selectedAvatar, files, styleFile]);

  const selectedAvatarData = avatars.find((a) => a.avatar_id === selectedAvatar);
  const dateGroups = groupByDate(images);

  return (
    <>
      <Header title="Image Generator" />
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col md:flex-row h-full">
          {/* ─── Left Panel ─── */}
          <div
            className="split-panel-left w-full md:w-[380px] shrink-0 overflow-y-auto flex flex-col"
            style={{ background: "var(--bg-primary)" }}
          >
            {/* Tool tabs */}
            <div
              className="flex items-center gap-0.5 px-4 pt-4 pb-2"
            >
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all"
                    style={{
                      background: active ? "var(--bg-tertiary)" : "transparent",
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            {/* Model badge */}
            <div className="px-4 pb-3">
              <div
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-secondary)",
                }}
              >
                <div
                  className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold"
                  style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
                >
                  G
                </div>
                Gemini 3 Pro Image
              </div>
            </div>

            {/* References section */}
            <div className="px-4 pb-3">
              <span
                className="text-[11px] font-medium uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                References
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Style reference */}
                {stylePreview ? (
                  <div
                    className="relative flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
                  >
                    <img src={stylePreview} alt="Style" className="w-7 h-7 rounded object-cover" />
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Style</span>
                    <button
                      onClick={removeStyle}
                      className="ml-1 rounded-full p-0.5 transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                      <XIcon size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => styleInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                    style={{
                      border: "1px dashed var(--border-color)",
                      color: "var(--text-muted)",
                      background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--text-muted)";
                      e.currentTarget.style.background = "var(--bg-secondary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-color)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Brush size={13} />
                    Style
                  </button>
                )}
                <input ref={styleInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleStyleFile(e.target.files)} />

                {/* Character reference */}
                {selectedAvatarData ? (
                  <div
                    className="relative flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
                  >
                    {selectedAvatarData.thumbnail ? (
                      <img src={selectedAvatarData.thumbnail} alt={selectedAvatarData.name} className="w-7 h-7 rounded object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: "var(--bg-tertiary)" }}>
                        <UserCircle size={14} style={{ color: "var(--text-muted)" }} />
                      </div>
                    )}
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {selectedAvatarData.name}
                    </span>
                    <button
                      onClick={() => setSelectedAvatar(null)}
                      className="ml-1 rounded-full p-0.5 transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                      <XIcon size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCharacterPicker(!showCharacterPicker)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                    style={{
                      border: "1px dashed var(--border-color)",
                      color: "var(--text-muted)",
                      background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--text-muted)";
                      e.currentTarget.style.background = "var(--bg-secondary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-color)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <UserCircle size={13} />
                    Character
                  </button>
                )}

                {/* Add reference files */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                  style={{
                    border: "1px dashed var(--border-color)",
                    color: "var(--text-muted)",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--text-muted)";
                    e.currentTarget.style.background = "var(--bg-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-color)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Plus size={13} />
                </button>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </div>

              {/* Character picker dropdown */}
              {showCharacterPicker && avatars.length > 0 && (
                <div
                  className="mt-2 p-2 rounded-lg"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div className="flex gap-2 flex-wrap">
                    {avatars.map((a) => (
                      <button
                        key={a.avatar_id}
                        onClick={() => {
                          setSelectedAvatar(a.avatar_id);
                          setShowCharacterPicker(false);
                        }}
                        className="w-11 h-11 rounded-lg overflow-hidden transition-all"
                        style={{
                          border: `1.5px solid ${selectedAvatar === a.avatar_id ? "var(--text-primary)" : "var(--border-color)"}`,
                        }}
                        title={a.name}
                      >
                        {a.thumbnail ? (
                          <img src={a.thumbnail} alt={a.name} className="w-full h-full object-cover" />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center"
                            style={{ background: "var(--bg-tertiary)" }}
                          >
                            <UserCircle size={14} style={{ color: "var(--text-muted)" }} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reference file previews */}
              {previews.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {previews.map((url, i) => (
                    <div key={i} className="relative w-11 h-11 rounded-lg overflow-hidden group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XIcon size={12} color="white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Prompt area */}
            <div className="flex-1 px-4 pb-3 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Prompt
                </span>
                <button
                  onClick={() => setAiPrompt(!aiPrompt)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all"
                  style={{
                    background: aiPrompt ? "rgba(139,92,246,0.15)" : "transparent",
                    color: aiPrompt ? "#a78bfa" : "var(--text-muted)",
                    border: `1px solid ${aiPrompt ? "rgba(139,92,246,0.3)" : "var(--border-color)"}`,
                  }}
                >
                  <MagicWand size={11} />
                  AI prompt
                </button>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to create..."
                rows={4}
                className="w-full px-3 py-2.5 rounded-lg text-[14px] resize-none flex-1 min-h-[100px]"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="mx-4 mb-3 px-3 py-2 rounded-lg text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>
                {error}
              </div>
            )}

            {/* Bottom controls */}
            <div
              className="px-4 py-3 flex items-center gap-3 flex-wrap"
              style={{ borderTop: "1px solid var(--border-color)" }}
            >
              {/* Image count */}
              <div
                className="flex items-center rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--border-color)" }}
              >
                <button
                  onClick={() => setImageCount(Math.max(1, imageCount - 1))}
                  className="px-2 py-1.5 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  disabled={imageCount <= 1}
                >
                  <Minus size={13} />
                </button>
                <span
                  className="px-2.5 py-1.5 text-[12px] font-medium min-w-[28px] text-center"
                  style={{ color: "var(--text-primary)", borderLeft: "1px solid var(--border-color)", borderRight: "1px solid var(--border-color)" }}
                >
                  {imageCount}
                </span>
                <button
                  onClick={() => setImageCount(Math.min(4, imageCount + 1))}
                  className="px-2 py-1.5 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  disabled={imageCount >= 4}
                >
                  <Plus size={13} />
                </button>
              </div>

              {/* Aspect ratio */}
              <div
                className="flex items-center rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--border-color)" }}
              >
                {(["1:1", "16:9", "9:16"] as AspectRatio[]).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className="px-2.5 py-1.5 text-[11px] font-medium transition-colors"
                    style={{
                      background: aspectRatio === ratio ? "var(--bg-tertiary)" : "transparent",
                      color: aspectRatio === ratio ? "var(--text-primary)" : "var(--text-muted)",
                      borderRight: ratio !== "9:16" ? "1px solid var(--border-color)" : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (aspectRatio !== ratio) e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (aspectRatio !== ratio) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {ratio}
                  </button>
                ))}
              </div>

              {/* Quality badge */}
              <div
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{
                  border: "1px solid var(--border-color)",
                  color: "var(--text-secondary)",
                }}
              >
                2K
              </div>
            </div>

            {/* Generate button */}
            <div className="px-4 pb-4 pt-1">
              <button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="w-full py-2.5 rounded-lg font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
              >
                {loading ? (
                  <>
                    <Spinner size={16} /> Generating...
                  </>
                ) : (
                  <>Generate &middot; 4 credits</>
                )}
              </button>
            </div>
          </div>

          {/* ─── Right Panel (Gallery) ─── */}
          <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
            {/* Gallery header */}
            <div
              className="flex items-center justify-between px-4 md:px-6 py-3 sticky top-0 z-10"
              style={{
                background: "var(--bg-primary)",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
                {images.length} image{images.length !== 1 ? "s" : ""}
              </span>
              <div
                className="flex items-center rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--border-color)" }}
              >
                {([
                  { key: "small" as GridSize, icon: <Grid size={13} /> },
                  { key: "medium" as GridSize, icon: <LayoutGrid size={13} /> },
                  { key: "large" as GridSize, icon: <ImageSquare size={13} /> },
                ]).map(({ key, icon }) => (
                  <button
                    key={key}
                    onClick={() => setGridSize(key)}
                    className="px-2 py-1.5 transition-colors"
                    style={{
                      background: gridSize === key ? "var(--bg-tertiary)" : "transparent",
                      color: gridSize === key ? "var(--text-primary)" : "var(--text-muted)",
                      borderRight: key !== "large" ? "1px solid var(--border-color)" : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (gridSize !== key) e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (gridSize !== key) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 md:px-6 py-4">
              {loadingImages ? (
                <div className="flex items-center justify-center py-16">
                  <div className="spinner" />
                </div>
              ) : images.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
                  >
                    <ImageSquare size={24} style={{ color: "var(--text-muted)" }} />
                  </div>
                  <p className="font-medium text-[14px] mb-1" style={{ color: "var(--text-secondary)" }}>
                    No images yet
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                    Write a prompt and hit Generate to create your first image
                  </p>
                </div>
              ) : (
                dateGroups.map((group) => (
                  <div key={group.label} className="mb-6">
                    <span
                      className="text-[11px] font-medium uppercase tracking-wider block mb-3"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {group.label}
                    </span>
                    <div className={`grid gap-2.5 ${GRID_COLS[gridSize]}`}>
                      {group.items.map((img) => (
                        <div
                          key={img.image_id}
                          className="rounded-xl overflow-hidden group relative cursor-pointer transition-all"
                          style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--text-muted)")}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                        >
                          <div className="aspect-square overflow-hidden">
                            <img
                              src={img.image_url}
                              alt={img.prompt}
                              className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                            />
                          </div>
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white font-medium"
                            >
                              2K
                            </span>
                            <div className="flex items-center gap-1">
                              <a
                                href={img.image_url}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg bg-black/60 text-white transition-colors hover:bg-black/80"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download size={13} />
                              </a>
                            </div>
                          </div>
                          {/* Prompt label below image */}
                          <div className="px-2.5 py-2">
                            <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                              {img.prompt}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
