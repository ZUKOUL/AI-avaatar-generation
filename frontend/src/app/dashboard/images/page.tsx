"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { avatarAPI, videoAPI } from "@/lib/api";
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
  Download,
  Grid,
  LayoutGrid,
  CaretLeft,
  ChevronDown,
  Search,
  Maximize,
} from "@/components/Icons";

/* ─── Types ─── */
interface Avatar { avatar_id: string; name: string; thumbnail: string; }
interface GeneratedImage { image_id: string; avatar_id?: string; prompt: string; image_url: string; created_at: string; }

type ActiveTab = "image" | "video";
type GridSize = "small" | "medium" | "large";

interface RatioOption { value: string; label: string; icon: string; }
const RATIOS: RatioOption[] = [
  { value: "1:1", label: "Square", icon: "□" },
  { value: "21:9", label: "Ultrawide", icon: "▬" },
  { value: "16:9", label: "Widescreen", icon: "▭" },
  { value: "9:16", label: "Social story", icon: "▯" },
  { value: "4:3", label: "Classic", icon: "▭" },
  { value: "4:5", label: "Social post", icon: "▯" },
  { value: "5:4", label: "Landscape", icon: "▭" },
  { value: "3:4", label: "Traditional", icon: "▯" },
  { value: "3:2", label: "Standard", icon: "▭" },
  { value: "2:3", label: "Portrait", icon: "▯" },
];

interface QualityOption { value: string; time: string; seamless?: boolean; }
const QUALITIES: QualityOption[] = [
  { value: "1K", time: "~39s" },
  { value: "2K", time: "~1m 9s", seamless: true },
  { value: "4K", time: "~1m 52s" },
];

const IMAGE_MODELS = [
  { id: "gemini-3-pro", name: "Gemini 3 Pro Image", icon: "G" },
  { id: "nano-banana-pro", name: "Google Nano Banana Pro", icon: "G" },
];
const VIDEO_MODELS = [
  { id: "kling", name: "Kling", icon: "K" },
  { id: "veo3", name: "Veo 3", icon: "V" },
];

const GRID_COLS: Record<GridSize, string> = {
  small: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5",
  medium: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
  large: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
};

function groupByDate(images: GeneratedImage[]) {
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
    else label = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(img);
  }
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

/* ─── Small SVG icons for aspect ratios ─── */
function RatioIcon({ ratio }: { ratio: string }) {
  const dims: Record<string, [number, number]> = {
    "1:1": [12, 12], "21:9": [16, 7], "16:9": [16, 9], "9:16": [9, 16],
    "4:3": [14, 10], "4:5": [11, 14], "5:4": [14, 11], "3:4": [10, 14],
    "3:2": [14, 9], "2:3": [9, 14],
  };
  const [w, h] = dims[ratio] || [12, 12];
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x={(18 - w) / 2} y={(18 - h) / 2} width={w} height={h} rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export default function ImageGenerator() {
  /* ─── State ─── */
  const [activeTab, setActiveTab] = useState<ActiveTab>("image");
  const [prompt, setPrompt] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);

  // Controls
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quality, setQuality] = useState("2K");
  const [imageCount, setImageCount] = useState(1);
  const [aiPrompt, setAiPrompt] = useState(false);
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].id);
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].id);
  const [gridSize, setGridSize] = useState<GridSize>("medium");

  // Video-specific
  const [videoRefPreview, setVideoRefPreview] = useState<string | null>(null);
  const [videoRefFile, setVideoRefFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState("5s");
  const videoRefInputRef = useRef<HTMLInputElement>(null);

  // Dropdowns
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const [showQualityDropdown, setShowQualityDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Character panel
  const [showCharacterPanel, setShowCharacterPanel] = useState(false);
  const [showNewCharacter, setShowNewCharacter] = useState(false);
  const [charSearch, setCharSearch] = useState("");
  const [newCharName, setNewCharName] = useState("");
  const [newCharGender, setNewCharGender] = useState("");
  const [newCharFiles, setNewCharFiles] = useState<File[]>([]);
  const [newCharPreviews, setNewCharPreviews] = useState<string[]>([]);
  const [creatingChar, setCreatingChar] = useState(false);
  const newCharInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadData(); }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => { setShowRatioDropdown(false); setShowQualityDropdown(false); setShowModelDropdown(false); };
    if (showRatioDropdown || showQualityDropdown || showModelDropdown) {
      setTimeout(() => document.addEventListener("click", handler, { once: true }), 0);
    }
  }, [showRatioDropdown, showQualityDropdown, showModelDropdown]);

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

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("prompt", prompt);
    if (selectedAvatar) formData.append("avatar_id", selectedAvatar);
    files.forEach((f) => formData.append("files", f));
    try {
      if (activeTab === "image") {
        await avatarAPI.generateImage(formData);
      } else {
        formData.append("engine_choice", videoModel === "kling" ? "kling" : "veo");
        if (videoRefFile) formData.append("files", videoRefFile);
        await videoAPI.animate(formData);
      }
      setPrompt("");
      setFiles([]);
      setPreviews([]);
      setVideoRefFile(null);
      setVideoRefPreview(null);
      loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string | { message?: string } } } };
      const detail = e.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else if (detail && typeof detail === "object" && "message" in detail) setError(detail.message || "Generation failed");
      else setError("Generation failed. Please try again.");
    } finally { setLoading(false); }
  }, [prompt, selectedAvatar, files, activeTab, videoModel, videoRefFile]);

  const handleCreateCharacter = async () => {
    if (!newCharName.trim() || newCharFiles.length === 0) return;
    setCreatingChar(true);
    const formData = new FormData();
    formData.append("nickname", newCharName);
    formData.append("prompt", `A ${newCharGender || "person"} named ${newCharName}`);
    newCharFiles.forEach((f) => formData.append("files", f));
    try {
      await avatarAPI.generate(formData);
      setNewCharName("");
      setNewCharGender("");
      setNewCharFiles([]);
      setNewCharPreviews([]);
      setShowNewCharacter(false);
      loadData();
    } catch { setError("Failed to create character"); }
    finally { setCreatingChar(false); }
  };

  const selectedAvatarData = avatars.find((a) => a.avatar_id === selectedAvatar);
  const dateGroups = groupByDate(images);
  const currentModels = activeTab === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const currentModelId = activeTab === "image" ? imageModel : videoModel;
  const currentModelName = currentModels.find((m) => m.id === currentModelId)?.name || currentModels[0].name;
  const filteredAvatars = charSearch ? avatars.filter((a) => a.name.toLowerCase().includes(charSearch.toLowerCase())) : avatars;

  return (
    <>
      <Header title={activeTab === "image" ? "Image Generator" : "Video Generator"} />
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col md:flex-row h-full">

          {/* ═══ Left Panel ═══ */}
          <div className="split-panel-left w-full md:w-[380px] shrink-0 overflow-y-auto flex flex-col" style={{ background: "var(--bg-primary)" }}>

            {/* Tabs — Image | Video (stay on same page) */}
            <div className="px-4 pt-4 pb-1">
              <div className="flex items-center rounded-lg p-0.5" style={{ background: "var(--bg-secondary)" }}>
                {([
                  { key: "image" as ActiveTab, icon: ImageSquare, label: "Image" },
                  { key: "video" as ActiveTab, icon: VideoCamera, label: "Video" },
                ]).map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[13px] font-medium transition-all"
                      style={{
                        background: active ? "var(--bg-tertiary)" : "transparent",
                        color: active ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      <Icon size={14} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Back + Title */}
            <div className="px-4 pt-3 pb-1">
              <Link href="/dashboard" className="inline-flex items-center gap-1 text-[12px] font-medium mb-1 transition-colors" style={{ color: "var(--text-muted)" }}>
                <CaretLeft size={12} /> Tools
              </Link>
              <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                {activeTab === "image" ? "Image Generator" : "Video Generator"}
              </h2>
            </div>

            {/* Model dropdown */}
            <div className="px-4 pt-2 pb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>Model</span>
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowModelDropdown(!showModelDropdown); setShowRatioDropdown(false); setShowQualityDropdown(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                >
                  <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
                    {currentModels.find((m) => m.id === currentModelId)?.icon || "G"}
                  </span>
                  <span className="flex-1 text-left">{currentModelName}</span>
                  <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
                </button>
                {showModelDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-30" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                    {currentModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { activeTab === "image" ? setImageModel(m.id) : setVideoModel(m.id); setShowModelDropdown(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium transition-colors text-left"
                        style={{ background: currentModelId === m.id ? "var(--bg-tertiary)" : "transparent", color: "var(--text-primary)" }}
                        onMouseEnter={(e) => { if (currentModelId !== m.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                        onMouseLeave={(e) => { if (currentModelId !== m.id) e.currentTarget.style.background = "transparent"; }}
                      >
                        <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>{m.icon}</span>
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* References — Character + Add (no Style) */}
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>References</span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{(selectedAvatar ? 1 : 0) + files.length}/14</span>
              </div>
              <div className="flex items-start gap-2">
                {/* Character square */}
                {selectedAvatarData ? (
                  <div className="relative">
                    <div className="w-[72px] h-[72px] rounded-xl overflow-hidden" style={{ border: "1.5px solid var(--text-primary)" }}>
                      {selectedAvatarData.thumbnail ? <img src={selectedAvatarData.thumbnail} alt={selectedAvatarData.name} className="w-full h-full object-cover" /> : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-tertiary)" }}><UserCircle size={24} style={{ color: "var(--text-muted)" }} /></div>
                      )}
                    </div>
                    <button onClick={() => setSelectedAvatar(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}><XIcon size={10} /></button>
                    <span className="block text-center text-[11px] mt-1 truncate w-[72px]" style={{ color: "var(--text-muted)" }}>{selectedAvatarData.name}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCharacterPanel(true)}
                    className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-xl transition-all"
                    style={{ border: "1px solid var(--border-color)", color: "var(--text-muted)", background: "transparent" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-secondary)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.background = "transparent"; }}
                  >
                    <UserCircle size={18} />
                    <span className="text-[11px] mt-1">Character</span>
                  </button>
                )}
                {/* Add square */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-xl transition-all"
                  style={{ border: "1px solid var(--border-color)", color: "var(--text-muted)", background: "transparent" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-secondary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.background = "transparent"; }}
                >
                  <Plus size={18} />
                  <span className="text-[11px] mt-1">Add</span>
                </button>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </div>
              {/* Reference file previews */}
              {previews.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {previews.map((url, i) => (
                    <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeFile(i)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><XIcon size={12} color="white" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video reference image (video tab only) */}
            {activeTab === "video" && (
              <div className="px-4 pb-3">
                <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>Reference image</span>
                {videoRefPreview ? (
                  <div className="relative inline-block">
                    <img src={videoRefPreview} alt="" className="w-20 h-20 rounded-xl object-cover" style={{ border: "1.5px solid var(--text-primary)" }} />
                    <button onClick={() => { setVideoRefFile(null); setVideoRefPreview(null); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}><XIcon size={10} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => videoRefInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors"
                    style={{ border: "1px dashed var(--border-color)", color: "var(--text-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Upload size={14} /> Upload reference
                  </button>
                )}
                <input ref={videoRefInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setVideoRefFile(f); setVideoRefPreview(URL.createObjectURL(f)); } }} />
              </div>
            )}

            {/* Prompt */}
            <div className="flex-1 px-4 pb-3 flex flex-col min-h-0">
              <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>Prompt</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={activeTab === "image" ? "Describe your image — try @ to add references" : "Describe the motion or action for your video..."}
                className="w-full px-3 py-3 rounded-xl text-[14px] resize-none flex-1 min-h-[120px]"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleGenerate(); } }}
              />
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => setAiPrompt(!aiPrompt)} className="relative w-9 h-5 rounded-full transition-colors shrink-0" style={{ background: aiPrompt ? "#3b82f6" : "var(--bg-tertiary)" }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{ background: "#fff", left: aiPrompt ? "18px" : "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </button>
                <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>AI prompt</span>
              </div>
            </div>

            {error && <div className="mx-4 mb-3 px-3 py-2 rounded-lg text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>{error}</div>}

            {/* Bottom controls */}
            <div className="shrink-0">
              <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid var(--border-color)" }}>
                {/* Count */}
                {activeTab === "image" && (
                  <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-color)" }}>
                    <button onClick={() => setImageCount(Math.max(1, imageCount - 1))} className="px-2 py-1.5" style={{ color: "var(--text-muted)" }} disabled={imageCount <= 1}><Minus size={13} /></button>
                    <span className="px-2 py-1.5 text-[12px] font-medium min-w-[24px] text-center" style={{ color: "var(--text-primary)", borderLeft: "1px solid var(--border-color)", borderRight: "1px solid var(--border-color)" }}>{imageCount}</span>
                    <button onClick={() => setImageCount(Math.min(4, imageCount + 1))} className="px-2 py-1.5" style={{ color: "var(--text-muted)" }} disabled={imageCount >= 4}><Plus size={13} /></button>
                  </div>
                )}

                {/* Video duration */}
                {activeTab === "video" && (
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                      style={{ border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                    >
                      <select
                        value={videoDuration}
                        onChange={(e) => setVideoDuration(e.target.value)}
                        className="bg-transparent text-[12px] font-medium outline-none cursor-pointer"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <option value="5s">5s</option>
                        <option value="10s">10s</option>
                      </select>
                    </button>
                  </div>
                )}

                {/* Aspect ratio dropdown */}
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowRatioDropdown(!showRatioDropdown); setShowQualityDropdown(false); setShowModelDropdown(false); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                    style={{ border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                  >
                    <RatioIcon ratio={aspectRatio} />
                    {aspectRatio}
                  </button>
                  {showRatioDropdown && (
                    <div className="absolute bottom-full mb-1 left-0 w-[200px] rounded-xl overflow-hidden z-30 max-h-[300px] overflow-y-auto" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                      {RATIOS.map((r) => (
                        <button
                          key={r.value}
                          onClick={() => { setAspectRatio(r.value); setShowRatioDropdown(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-left"
                          style={{ background: aspectRatio === r.value ? "var(--bg-tertiary)" : "transparent", color: "var(--text-primary)" }}
                          onMouseEnter={(e) => { if (aspectRatio !== r.value) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { if (aspectRatio !== r.value) e.currentTarget.style.background = "transparent"; }}
                        >
                          <RatioIcon ratio={r.value} />
                          <span className="font-medium">{r.value}</span>
                          <span style={{ color: "var(--text-muted)" }}>{r.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quality dropdown */}
                {activeTab === "image" && (
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowQualityDropdown(!showQualityDropdown); setShowRatioDropdown(false); setShowModelDropdown(false); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                      style={{ border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                    >
                      <Maximize size={14} />
                      {quality}
                    </button>
                    {showQualityDropdown && (
                      <div className="absolute bottom-full mb-1 left-0 w-[180px] rounded-xl overflow-hidden z-30" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                        {QUALITIES.map((q) => (
                          <button
                            key={q.value}
                            onClick={() => { setQuality(q.value); setShowQualityDropdown(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] transition-colors text-left"
                            style={{ background: quality === q.value ? "var(--bg-tertiary)" : "transparent", color: "var(--text-primary)" }}
                            onMouseEnter={(e) => { if (quality !== q.value) e.currentTarget.style.background = "var(--bg-hover)"; }}
                            onMouseLeave={(e) => { if (quality !== q.value) e.currentTarget.style.background = "transparent"; }}
                          >
                            <span className="font-semibold">{q.value}</span>
                            <span className="flex-1" style={{ color: "var(--text-muted)" }}>{q.time}</span>
                            {q.seamless && <span style={{ color: "var(--text-muted)" }}>∞</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Generate */}
              <div className="px-4 pb-4 pt-1">
                <button onClick={handleGenerate} disabled={loading || !prompt.trim()} className="w-full py-2.5 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
                  {loading ? <><Spinner size={16} /> Generating...</> : "Generate"}
                </button>
              </div>
            </div>
          </div>

          {/* ═══ Right Panel (Gallery) ═══ */}
          <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
            <div className="flex items-center justify-between px-4 md:px-6 py-3 sticky top-0 z-10" style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border-color)" }}>
              <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>{images.length > 0 ? `${images.length} image${images.length !== 1 ? "s" : ""}` : "Gallery"}</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}><ImageSquare size={14} /> Images</div>
                <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-color)" }}>
                  {([{ key: "small" as GridSize, icon: <Grid size={13} /> }, { key: "medium" as GridSize, icon: <LayoutGrid size={13} /> }, { key: "large" as GridSize, icon: <ImageSquare size={13} /> }]).map(({ key, icon }) => (
                    <button key={key} onClick={() => setGridSize(key)} className="px-2 py-1.5 transition-colors" style={{ background: gridSize === key ? "var(--bg-tertiary)" : "transparent", color: gridSize === key ? "var(--text-primary)" : "var(--text-muted)", borderRight: key !== "large" ? "1px solid var(--border-color)" : undefined }}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-4 md:px-6 py-4">
              {loadingImages ? <div className="flex items-center justify-center py-16"><div className="spinner" /></div> : images.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}><ImageSquare size={24} style={{ color: "var(--text-muted)" }} /></div>
                  <p className="font-medium text-[14px] mb-1" style={{ color: "var(--text-secondary)" }}>No images yet</p>
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Write a prompt and hit Generate to create your first image</p>
                </div>
              ) : dateGroups.map((group) => (
                <div key={group.label} className="mb-6">
                  <span className="text-[12px] font-medium block mb-3" style={{ color: "var(--text-muted)" }}>{group.label}</span>
                  <div className={`grid gap-2 ${GRID_COLS[gridSize]}`}>
                    {group.items.map((img) => (
                      <div key={img.image_id} className="rounded-xl overflow-hidden group relative cursor-pointer">
                        <div className="aspect-square overflow-hidden"><img src={img.image_url} alt={img.prompt} className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]" /></div>
                        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 p-2">
                          <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>G</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>2K</span>
                        </div>
                        <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-all flex items-start justify-end p-2 opacity-0 group-hover:opacity-100">
                          <a href={img.image_url} download target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-black/60 text-white transition-colors hover:bg-black/80" onClick={(e) => e.stopPropagation()}><Download size={14} /></a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Character Panel (full overlay) ═══ */}
      {showCharacterPanel && (
        <div className="fixed inset-0 z-50 flex" style={{ background: "var(--bg-primary)" }}>
          {/* Left sidebar */}
          <div className="w-[240px] shrink-0 p-4 overflow-y-auto" style={{ borderRight: "1px solid var(--border-color)" }}>
            <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>All references</span>
            {["Character"].map((item) => (
              <div key={item} className="flex items-center gap-2 px-3 py-2 rounded-lg mb-0.5 text-[13px] font-medium" style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                <UserCircle size={16} /> {item}
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-y-auto">
            {!showNewCharacter ? (
              <div className="p-6">
                {/* Search bar */}
                <div className="max-w-lg mx-auto mb-6">
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
                    <Search size={16} style={{ color: "var(--text-muted)" }} />
                    <input value={charSearch} onChange={(e) => setCharSearch(e.target.value)} placeholder="Search for characters" className="flex-1 bg-transparent text-[14px] outline-none" style={{ color: "var(--text-primary)" }} />
                  </div>
                </div>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>Characters</h2>
                  <button onClick={() => setShowNewCharacter(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-colors" style={{ border: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                    <Plus size={14} /> New character
                  </button>
                </div>
                {/* Tabs */}
                <div className="flex items-center gap-2 mb-6">
                  <span className="px-3 py-1.5 rounded-lg text-[13px] font-medium" style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>All</span>
                  <span className="px-3 py-1.5 rounded-lg text-[13px] font-medium cursor-pointer" style={{ color: "var(--text-muted)" }}>My Characters</span>
                </div>
                {/* Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {filteredAvatars.map((a) => (
                    <button key={a.avatar_id} onClick={() => { setSelectedAvatar(a.avatar_id); setShowCharacterPanel(false); }} className="group text-center">
                      <div className="aspect-square rounded-xl overflow-hidden mb-1 transition-all" style={{ border: `2px solid ${selectedAvatar === a.avatar_id ? "var(--text-primary)" : "transparent"}` }}>
                        {a.thumbnail ? <img src={a.thumbnail} alt={a.name} className="w-full h-full object-cover" /> : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-secondary)" }}><UserCircle size={32} style={{ color: "var(--text-muted)" }} /></div>
                        )}
                      </div>
                      <span className="text-[11px] truncate block" style={{ color: "var(--text-muted)" }}>@{a.name}</span>
                    </button>
                  ))}
                  {filteredAvatars.length === 0 && <p className="col-span-full text-center py-12 text-[14px]" style={{ color: "var(--text-muted)" }}>No characters found</p>}
                </div>
              </div>
            ) : (
              /* ─── New Character Form ─── */
              <div className="p-6 max-w-3xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                  <button onClick={() => setShowNewCharacter(false)} className="p-1 rounded-lg transition-colors" style={{ color: "var(--text-muted)" }}><CaretLeft size={20} /></button>
                  <h2 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>Create Character</h2>
                </div>
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Upload area */}
                  <div className="flex-1">
                    {newCharPreviews.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {newCharPreviews.map((url, i) => (
                          <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button onClick={() => { const f = newCharFiles.filter((_, j) => j !== i); setNewCharFiles(f); setNewCharPreviews(f.map((x) => URL.createObjectURL(x))); }} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><XIcon size={16} color="white" /></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div onClick={() => newCharInputRef.current?.click()} className="flex flex-col items-center justify-center py-16 rounded-xl cursor-pointer transition-colors" style={{ border: "1px dashed var(--border-color)", color: "var(--text-muted)" }}>
                        <Upload size={32} />
                        <p className="text-[14px] mt-3">Drop an image or <span style={{ color: "var(--text-primary)", textDecoration: "underline" }}>select a file</span></p>
                        <button className="flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg text-[13px] font-medium" style={{ border: "1px solid var(--border-color)", color: "var(--text-primary)" }}><Upload size={14} /> Upload</button>
                      </div>
                    )}
                    <input ref={newCharInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { if (!e.target.files) return; const arr = Array.from(e.target.files); const all = [...newCharFiles, ...arr]; setNewCharFiles(all); setNewCharPreviews(all.map((f) => URL.createObjectURL(f))); }} />
                    <p className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>Add 4+ images for better results</p>
                  </div>
                  {/* Form fields */}
                  <div className="w-full md:w-[280px] flex flex-col gap-4">
                    <input value={newCharName} onChange={(e) => setNewCharName(e.target.value)} placeholder="Name" className="px-3 py-2.5 rounded-lg text-[14px]" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }} />
                    <select value={newCharGender} onChange={(e) => setNewCharGender(e.target.value)} className="px-3 py-2.5 rounded-lg text-[14px]" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: newCharGender ? "var(--text-primary)" : "var(--text-muted)" }}>
                      <option value="">Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                    <button onClick={handleCreateCharacter} disabled={creatingChar || !newCharName.trim() || newCharFiles.length === 0} className="w-full py-2.5 rounded-lg font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-40 transition-all" style={{ background: "#3b82f6", color: "#fff" }}>
                      {creatingChar ? <Spinner size={16} /> : "Create your character"}
                    </button>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Your custom character and all your generations are private.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Close button */}
          <button onClick={() => { setShowCharacterPanel(false); setShowNewCharacter(false); }} className="absolute top-4 right-4 p-2 rounded-lg transition-colors z-10" style={{ color: "var(--text-muted)" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
            <XIcon size={20} />
          </button>
        </div>
      )}
    </>
  );
}
