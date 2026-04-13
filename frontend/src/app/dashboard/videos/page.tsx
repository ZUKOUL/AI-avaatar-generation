"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { avatarAPI, videoAPI } from "@/lib/api";
import {
  Spinner,
  Video as VideoIcon,
  VideoCamera,
  Upload,
  XIcon,
  CaretLeft,
  ChevronDown,
  ImageSquare,
  Play,
  Grid,
  LayoutGrid,
  Download,
} from "@/components/Icons";

/* ─── Types ─── */
interface GeneratedImage { image_id: string; image_url: string; prompt: string; created_at: string; }
interface VideoJob { job_id: string; avatar_id?: string; operation_id: string; status: string; video_url?: string; motion_prompt?: string; engine?: string; created_at: string; }

interface Avatar { avatar_id: string; name: string; thumbnail: string; }
type GridSize = "small" | "medium" | "large";
type GalleryFilter = "all" | "images" | "videos";

const VIDEO_MODELS = [
  { id: "veo", name: "Veo 3.1", duration: "8s", icon: "V" },
  { id: "kling", name: "Kling", duration: "5s", icon: "K" },
];

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];

const GRID_COLS: Record<GridSize, string> = {
  small: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5",
  medium: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
  large: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
};

/* ─── RatioIcon ─── */
function RatioIcon({ ratio }: { ratio: string }) {
  const dims: Record<string, [number, number]> = {
    "16:9": [16, 9], "9:16": [9, 16], "1:1": [12, 12], "4:3": [14, 10], "3:4": [10, 14],
  };
  const [w, h] = dims[ratio] || [12, 12];
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <rect x={(18 - w) / 2} y={(18 - h) / 2} width={w} height={h} rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export default function VideoGenerator() {
  /* ─── State ─── */
  const [motionPrompt, setMotionPrompt] = useState("");
  const [engine, setEngine] = useState(VIDEO_MODELS[0].id);
  const [audio, setAudio] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Start / End image refs
  const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
  const [startImageFile, setStartImageFile] = useState<File | null>(null);
  const [endImageUrl, setEndImageUrl] = useState<string | null>(null);
  const [endImageFile, setEndImageFile] = useState<File | null>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  // Gallery data
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [videos, setVideos] = useState<VideoJob[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [gridSize, setGridSize] = useState<GridSize>("medium");

  // Dropdowns
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);

  // Image picker from gallery
  const [pickingFor, setPickingFor] = useState<"start" | "end" | null>(null);

  // Avatars for @mention
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const mentionStartRef = useRef<number | null>(null);
  const [chipDropdown, setChipDropdown] = useState<{ avatarId: string; pos: { top: number; left: number } } | null>(null);

  const mentionFiltered = mentionQuery !== null
    ? avatars.filter((a) => a.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  // Drag & drop (custom pointer-based, not HTML5 drag)
  const [draggingUrl, setDraggingUrl] = useState<string | null>(null);
  const [draggingThumb, setDraggingThumb] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOverZone, setDragOverZone] = useState<"start" | "end" | "prompt" | null>(null);
  const [describing, setDescribing] = useState(false);
  const startZoneRef = useRef<HTMLDivElement>(null);
  const endZoneRef = useRef<HTMLDivElement>(null);
  const promptZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => { setShowModelDropdown(false); setShowRatioDropdown(false); };
    if (showModelDropdown || showRatioDropdown) {
      setTimeout(() => document.addEventListener("click", handler, { once: true }), 0);
    }
  }, [showModelDropdown, showRatioDropdown]);

  const loadData = async () => {
    try {
      const [imageRes, videoRes, avatarRes] = await Promise.all([
        avatarAPI.getImages(undefined, 50),
        videoAPI.history(),
        avatarAPI.list(),
      ]);
      setImages(imageRes.data.images || []);
      setVideos(videoRes.data.videos || []);
      setAvatars(avatarRes.data.avatars || []);
    } catch { /* silently fail */ }
    finally { setLoadingGallery(false); }
  };

  const currentModel = VIDEO_MODELS.find((m) => m.id === engine) || VIDEO_MODELS[0];
  const creditCost = engine === "kling" ? (audio ? 12 : 8) : 15;

  const handleStartImage = (file: File) => {
    setStartImageFile(file);
    setStartImageUrl(URL.createObjectURL(file));
  };
  const handleEndImage = (file: File) => {
    setEndImageFile(file);
    setEndImageUrl(URL.createObjectURL(file));
  };

  const selectGalleryImage = (url: string) => {
    if (pickingFor === "start") {
      setStartImageUrl(url);
      setStartImageFile(null); // URL from gallery, no file
    } else if (pickingFor === "end") {
      setEndImageUrl(url);
      setEndImageFile(null);
    }
    setPickingFor(null);
  };

  /* ─── Custom drag system: hold 150ms to start, normal click stays normal ─── */
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);

  const hitTest = (x: number, y: number): "start" | "end" | "prompt" | null => {
    for (const [ref, zone] of [[startZoneRef, "start"], [endZoneRef, "end"], [promptZoneRef, "prompt"]] as const) {
      const el = ref.current;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return zone;
    }
    return null;
  };

  const onPointerDownImage = (e: React.PointerEvent, url: string, thumb: string) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    isDraggingRef.current = false;

    const startDrag = () => {
      isDraggingRef.current = true;
      setDraggingUrl(url);
      setDraggingThumb(thumb);
      setDragPos({ x: startX, y: startY });
      document.body.style.cursor = "grabbing";
    };

    // Start drag after 150ms hold
    holdTimerRef.current = setTimeout(startDrag, 150);

    const onMove = (ev: PointerEvent) => {
      // If moved more than 5px before timer, start drag immediately
      if (!isDraggingRef.current && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        startDrag();
      }
      if (isDraggingRef.current) {
        setDragPos({ x: ev.clientX, y: ev.clientY });
        setDragOverZone(hitTest(ev.clientX, ev.clientY));
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      document.body.style.cursor = "";

      if (isDraggingRef.current) {
        // Was dragging — drop on zone
        const zone = hitTest(ev.clientX, ev.clientY);
        if (zone === "start") { setStartImageUrl(url); setStartImageFile(null); }
        else if (zone === "end") { setEndImageUrl(url); setEndImageFile(null); }
        else if (zone === "prompt") {
          setDescribing(true);
          avatarAPI.describeImage(url)
            .then((res) => {
              const desc = res.data?.description || "";
              if (desc) {
                setMotionPrompt((prev) => prev ? `${prev}\n${desc}` : desc);
              } else {
                console.warn("describe-image returned empty description", res.data);
                setMotionPrompt((prev) => prev ? `${prev}\n[Image reference]` : "[Image reference]");
              }
            })
            .catch((err) => {
              console.error("describe-image failed:", err?.response?.status, err?.response?.data || err.message);
              setMotionPrompt((prev) => prev ? `${prev}\n[Image reference]` : "[Image reference]");
            })
            .finally(() => setDescribing(false));
        }
      }
      // else: was a quick click — do nothing (future: open image detail)

      setDraggingUrl(null);
      setDraggingThumb(null);
      setDragOverZone(null);
      isDraggingRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ─── Download helper ─── */
  const handleDownload = async (url: string, filename: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  /* ─── @mention system ─── */
  // Sync selectedAvatar when @mention is deleted from prompt
  useEffect(() => {
    if (selectedAvatar) {
      const av = avatars.find((a) => a.avatar_id === selectedAvatar);
      if (av && !motionPrompt.match(new RegExp(`@${av.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i"))) {
        setSelectedAvatar(null);
      }
    }
  }, [motionPrompt, avatars, selectedAvatar]);

  // Close chip dropdown on outside click
  useEffect(() => {
    if (!chipDropdown) return;
    const handler = () => setChipDropdown(null);
    setTimeout(() => document.addEventListener("click", handler, { once: true }), 0);
    return () => document.removeEventListener("click", handler);
  }, [chipDropdown]);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart || 0;
    setMotionPrompt(val);

    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@([^\s@]*)$/);
    if (atMatch) {
      mentionStartRef.current = cursor - atMatch[1].length - 1;
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
      const ta = textareaRef.current;
      if (ta) {
        const rect = ta.getBoundingClientRect();
        const lines = textBefore.split("\n");
        const lineHeight = 20;
        const charWidth = 8;
        setMentionPos({
          top: rect.top + Math.min((lines.length - 1) * lineHeight, rect.height - 10) + lineHeight + 4,
          left: rect.left + Math.min(lines[lines.length - 1].length * charWidth, rect.width - 200) + 12,
        });
      }
    } else {
      setMentionQuery(null);
      mentionStartRef.current = null;
    }
  };

  const selectMention = (avatar: Avatar) => {
    const start = mentionStartRef.current;
    if (start === null) return;
    const before = motionPrompt.slice(0, start);
    const cursor = textareaRef.current?.selectionStart || motionPrompt.length;
    const after = motionPrompt.slice(cursor);
    setMotionPrompt(`${before}@${avatar.name} ${after}`);
    setSelectedAvatar(avatar.avatar_id);
    setMentionQuery(null);
    mentionStartRef.current = null;
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) { const pos = before.length + avatar.name.length + 2; ta.focus(); ta.setSelectionRange(pos, pos); }
    }, 0);
  };

  const switchMention = (oldId: string, newAvatar: Avatar) => {
    const old = avatars.find((a) => a.avatar_id === oldId);
    if (!old) return;
    setMotionPrompt((p) => p.replace(new RegExp(`@${old.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), `@${newAvatar.name}`));
    setSelectedAvatar(newAvatar.avatar_id);
    setChipDropdown(null);
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionFiltered.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionFiltered.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectMention(mentionFiltered[mentionIndex]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleGenerate(); }
  };

  const handleTextareaScroll = () => {
    if (textareaRef.current && overlayRef.current) overlayRef.current.scrollTop = textareaRef.current.scrollTop;
  };

  const renderHighlightedPrompt = (text: string) => {
    if (!text) return null;
    const names = avatars.map((a) => a.name).sort((a, b) => b.length - a.length);
    if (!names.length) return <span style={{ color: "var(--text-primary)" }}>{text}</span>;
    const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))(?=\\s|$)`, "gi");
    const parts = text.split(pattern);
    return parts.map((part, i) => {
      const m = part.match(/^@(.+)$/);
      if (m) {
        const av = avatars.find((a) => a.name.toLowerCase() === m[1].toLowerCase());
        if (av) {
          return (
            <span
              key={i}
              className="relative rounded-[5px] pointer-events-auto cursor-pointer select-none"
              style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6", fontWeight: 600, padding: "1px 14px 1px 3px", marginRight: "-11px" }}
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                setChipDropdown({ avatarId: av.avatar_id, pos: { top: r.bottom + 4, left: r.left } });
              }}
            >
              {part}
              <svg className="absolute top-1/2 -translate-y-1/2" style={{ right: 3 }} width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M2 3L4 5L6 3" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          );
        }
      }
      return <span key={i} style={{ color: "var(--text-primary)" }}>{part}</span>;
    });
  };

  const selectedAvatarData = avatars.find((a) => a.avatar_id === selectedAvatar);

  const handleGenerate = async () => {
    if (!motionPrompt.trim()) return;
    setLoading(true); setError(""); setSuccess("");
    const formData = new FormData();
    formData.append("motion_prompt", motionPrompt);
    formData.append("engine_choice", engine);
    formData.append("audio", audio.toString());
    if (selectedAvatar) formData.append("avatar_id", selectedAvatar);
    if (startImageFile) formData.append("files", startImageFile);
    if (endImageFile) formData.append("files", endImageFile);
    // If using gallery image URL (no file), pass as param
    if (startImageUrl && !startImageFile) formData.append("start_image_url", startImageUrl);
    if (endImageUrl && !endImageFile) formData.append("end_image_url", endImageUrl);
    try {
      const res = await videoAPI.animate(formData);
      setSuccess(`Video generation started! Operation: ${res.data.operation_id}`);
      setMotionPrompt("");
      loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string | { message?: string } } } };
      const detail = e.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else if (detail && typeof detail === "object" && "message" in detail) setError(detail.message || "Generation failed");
      else setError("Video generation failed. Please try again.");
    } finally { setLoading(false); }
  };

  /* ─── Gallery items ─── */
  type GalleryItem = { type: "image"; data: GeneratedImage } | { type: "video"; data: VideoJob };
  const galleryItems: GalleryItem[] = [
    ...(galleryFilter !== "videos" ? images.map((img) => ({ type: "image" as const, data: img })) : []),
    ...(galleryFilter !== "images" ? videos.map((v) => ({ type: "video" as const, data: v })) : []),
  ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime());

  return (
    <>
      <Header title="Video Generator" />
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col md:flex-row h-full">

          {/* ═══ Left Panel ═══ */}
          <div className="split-panel-left w-full md:w-[380px] shrink-0 overflow-y-auto flex flex-col" style={{ background: "var(--bg-primary)" }}>

            {/* Tabs — Image | Video */}
            <div className="px-4 pt-4 pb-1">
              <div className="flex items-center rounded-lg p-0.5" style={{ background: "var(--bg-secondary)" }}>
                {([
                  { href: "/dashboard/images", icon: ImageSquare, label: "Image", active: false },
                  { href: "/dashboard/videos", icon: VideoCamera, label: "Video", active: true },
                ]).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <Link
                      key={tab.label}
                      href={tab.href}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[13px] font-medium transition-all"
                      style={{
                        background: tab.active ? "var(--bg-tertiary)" : "transparent",
                        color: tab.active ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      <Icon size={14} />
                      {tab.label}
                    </Link>
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
                Video Generator
              </h2>
            </div>

            {/* Model dropdown */}
            <div className="px-4 pt-3 pb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>Model</span>
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowModelDropdown(!showModelDropdown); setShowRatioDropdown(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                >
                  <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: "#3b82f6", color: "#fff" }}>
                    {currentModel.icon}
                  </span>
                  <span className="flex-1 text-left">{currentModel.name} · {currentModel.duration}</span>
                  <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
                </button>
                {showModelDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-30" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                    {VIDEO_MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setEngine(m.id); setShowModelDropdown(false); if (m.id === "veo") setAudio(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium transition-colors text-left"
                        style={{ background: engine === m.id ? "var(--bg-tertiary)" : "transparent", color: "var(--text-primary)" }}
                        onMouseEnter={(e) => { if (engine !== m.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                        onMouseLeave={(e) => { if (engine !== m.id) e.currentTarget.style.background = "transparent"; }}
                      >
                        <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: "#3b82f6", color: "#fff" }}>{m.icon}</span>
                        {m.name} · {m.duration}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* References — Start image + End image */}
            <div className="px-4 pb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>References</span>
              <div className="flex items-start gap-2">
                {/* Start image — drop zone */}
                <div ref={startZoneRef}>
                  {startImageUrl ? (
                    <div className="relative">
                      <div className="w-[72px] h-[72px] rounded-xl overflow-hidden" style={{ border: `1.5px solid ${dragOverZone === "start" ? "#22c55e" : "#3b82f6"}`, boxShadow: dragOverZone === "start" ? "0 0 0 3px rgba(34,197,94,0.2)" : "none" }}>
                        <img src={startImageUrl} alt="Start" className="w-full h-full object-cover" />
                      </div>
                      <button onClick={() => { setStartImageUrl(null); setStartImageFile(null); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
                        <XIcon size={10} />
                      </button>
                      <span className="block text-center text-[10px] mt-1 truncate w-[72px]" style={{ color: "var(--text-muted)" }}>Start image</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => startInputRef.current?.click()}
                      className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-xl transition-all"
                      style={{ border: `1.5px dashed ${dragOverZone === "start" ? "#22c55e" : "var(--border-color)"}`, color: dragOverZone === "start" ? "#22c55e" : "var(--text-muted)", background: dragOverZone === "start" ? "rgba(34,197,94,0.08)" : "transparent" }}
                    >
                      <Upload size={16} />
                      <span className="text-[10px] mt-1">Start image</span>
                    </button>
                  )}
                </div>
                <input ref={startInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleStartImage(f); }} />

                {/* End image — drop zone */}
                <div ref={endZoneRef}>
                  {endImageUrl ? (
                    <div className="relative">
                      <div className="w-[72px] h-[72px] rounded-xl overflow-hidden" style={{ border: `1.5px solid ${dragOverZone === "end" ? "#22c55e" : "#3b82f6"}`, boxShadow: dragOverZone === "end" ? "0 0 0 3px rgba(34,197,94,0.2)" : "none" }}>
                        <img src={endImageUrl} alt="End" className="w-full h-full object-cover" />
                      </div>
                      <button onClick={() => { setEndImageUrl(null); setEndImageFile(null); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
                        <XIcon size={10} />
                      </button>
                      <span className="block text-center text-[10px] mt-1 truncate w-[72px]" style={{ color: "var(--text-muted)" }}>End image</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => endInputRef.current?.click()}
                      className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-xl transition-all"
                      style={{ border: `1.5px dashed ${dragOverZone === "end" ? "#22c55e" : "var(--border-color)"}`, color: dragOverZone === "end" ? "#22c55e" : "var(--text-muted)", background: dragOverZone === "end" ? "rgba(34,197,94,0.08)" : "transparent" }}
                    >
                      <Upload size={16} />
                      <span className="text-[10px] mt-1">End image</span>
                    </button>
                  )}
                </div>
                <input ref={endInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEndImage(f); }} />
              </div>

              {/* Pick from gallery buttons */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setPickingFor(pickingFor === "start" ? null : "start")}
                  className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors"
                  style={{
                    background: pickingFor === "start" ? "#3b82f6" : "var(--bg-secondary)",
                    color: pickingFor === "start" ? "#fff" : "var(--text-muted)",
                    border: `1px solid ${pickingFor === "start" ? "#3b82f6" : "var(--border-color)"}`,
                  }}
                >
                  {pickingFor === "start" ? "Picking start…" : "Gallery → Start"}
                </button>
                <button
                  onClick={() => setPickingFor(pickingFor === "end" ? null : "end")}
                  className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors"
                  style={{
                    background: pickingFor === "end" ? "#3b82f6" : "var(--bg-secondary)",
                    color: pickingFor === "end" ? "#fff" : "var(--text-muted)",
                    border: `1px solid ${pickingFor === "end" ? "#3b82f6" : "var(--border-color)"}`,
                  }}
                >
                  {pickingFor === "end" ? "Picking end…" : "Gallery → End"}
                </button>
              </div>
            </div>

            {/* Audio toggle (kling only) */}
            {engine === "kling" && (
              <div className="px-4 pb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <button onClick={() => setAudio(!audio)} className="relative w-9 h-5 rounded-full transition-colors shrink-0" style={{ background: audio ? "#3b82f6" : "var(--bg-tertiary)" }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{ background: "#fff", left: audio ? "18px" : "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </button>
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Audio (v2.6, +4 credits)</span>
                </label>
              </div>
            )}

            {/* Prompt — drop zone (auto-describes image) */}
            <div ref={promptZoneRef} className="flex-1 px-4 pb-3 flex flex-col min-h-0">
              <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>
                Shot {describing && <span className="ml-1 text-[10px] normal-case" style={{ color: "#3b82f6" }}>— Describing image…</span>}
              </span>
              <div
                className="relative flex-1 min-h-0 rounded-xl overflow-hidden transition-colors"
                style={{ border: `1.5px solid ${dragOverZone === "prompt" ? "#3b82f6" : "var(--border-color)"}`, background: "var(--bg-secondary)", boxShadow: dragOverZone === "prompt" ? "0 0 0 3px rgba(59,130,246,0.15)" : "none" }}
              >
                <textarea
                  ref={textareaRef}
                  value={motionPrompt}
                  onChange={handlePromptChange}
                  placeholder="Describe the motion — type @ to mention a character"
                  className="relative w-full px-3 py-3 text-[14px] resize-none h-full min-h-[100px] bg-transparent border-none outline-none"
                  style={{ color: "transparent", caretColor: "var(--text-primary)", lineHeight: "1.6", zIndex: 1 }}
                  onKeyDown={handlePromptKeyDown}
                  onScroll={handleTextareaScroll}
                />
                {/* Overlay on top — pointer-events-none except on chips */}
                <div
                  ref={overlayRef}
                  className="absolute inset-0 px-3 py-3 text-[14px] pointer-events-none whitespace-pre-wrap break-words overflow-hidden"
                  style={{ lineHeight: "1.6", zIndex: 2 }}
                >
                  {renderHighlightedPrompt(motionPrompt)}
                </div>
                {/* @mention autocomplete dropdown */}
                {mentionQuery !== null && mentionFiltered.length > 0 && mentionPos && (
                  <div
                    className="fixed z-[9999] rounded-xl py-1 overflow-hidden"
                    style={{ top: mentionPos.top, left: mentionPos.left, background: "var(--bg-primary)", border: "1px solid var(--border-color)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", minWidth: 220, maxWidth: 300 }}
                  >
                    {mentionFiltered.map((a, i) => (
                      <button
                        key={a.avatar_id}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                        style={{ background: i === mentionIndex ? "var(--bg-tertiary)" : "transparent" }}
                        onMouseEnter={() => setMentionIndex(i)}
                        onMouseDown={(e) => { e.preventDefault(); selectMention(a); }}
                      >
                        {a.thumbnail ? (
                          <img src={a.thumbnail} className="w-7 h-7 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                            {a.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{a.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Chip switch dropdown */}
              {chipDropdown && (
                <div
                  className="fixed z-[9999] rounded-xl py-1 overflow-hidden"
                  style={{ top: chipDropdown.pos.top, left: chipDropdown.pos.left, background: "var(--bg-primary)", border: "1px solid var(--border-color)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", minWidth: 220, maxWidth: 300 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Switch character</div>
                  {avatars.map((a) => (
                    <button
                      key={a.avatar_id}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                      style={{ background: a.avatar_id === chipDropdown.avatarId ? "var(--bg-tertiary)" : "transparent" }}
                      onClick={() => switchMention(chipDropdown.avatarId, a)}
                    >
                      {a.thumbnail ? (
                        <img src={a.thumbnail} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{a.name}</span>
                      {a.avatar_id === chipDropdown.avatarId && (
                        <svg className="ml-auto shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="mx-4 mb-3 px-3 py-2 rounded-lg text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>{error}</div>}
            {success && <div className="mx-4 mb-3 px-3 py-2 rounded-lg text-[13px]" style={{ background: "rgba(34,197,94,0.1)", color: "var(--success)" }}>{success}</div>}

            {/* Bottom controls */}
            <div className="shrink-0">
              <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid var(--border-color)" }}>
                {/* Duration */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium" style={{ border: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  {currentModel.duration}
                </div>

                {/* Aspect ratio dropdown */}
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowRatioDropdown(!showRatioDropdown); setShowModelDropdown(false); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                    style={{ border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                  >
                    <RatioIcon ratio={aspectRatio} />
                    {aspectRatio}
                  </button>
                  {showRatioDropdown && (
                    <div className="absolute bottom-full mb-1 left-0 w-[160px] rounded-xl overflow-hidden z-30" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                      {ASPECT_RATIOS.map((r) => (
                        <button
                          key={r}
                          onClick={() => { setAspectRatio(r); setShowRatioDropdown(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-left"
                          style={{ background: aspectRatio === r ? "var(--bg-tertiary)" : "transparent", color: "var(--text-primary)" }}
                          onMouseEnter={(e) => { if (aspectRatio !== r) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { if (aspectRatio !== r) e.currentTarget.style.background = "transparent"; }}
                        >
                          <RatioIcon ratio={r} />
                          <span className="font-medium">{r}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Audio indicator */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium" style={{ border: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />{audio ? <><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></> : <line x1="23" y1="9" x2="17" y2="15" />}</svg>
                  {audio ? "ON" : "OFF"}
                </div>
              </div>

              {/* Generate */}
              <div className="px-4 pb-4 pt-1">
                <button
                  onClick={handleGenerate}
                  disabled={loading || !motionPrompt.trim()}
                  className="w-full py-2.5 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#3b82f6", color: "#fff" }}
                >
                  {loading ? <><Spinner size={16} /> Generating...</> : `Generate · ${creditCost} credits`}
                </button>
              </div>
            </div>
          </div>

          {/* ═══ Right Panel (Gallery — Images + Videos) ═══ */}
          <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
            {/* Gallery header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 sticky top-0 z-10" style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border-color)" }}>
              <div className="flex items-center gap-3">
                {(["all", "images", "videos"] as GalleryFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setGalleryFilter(f)}
                    className="text-[13px] font-medium transition-colors capitalize"
                    style={{ color: galleryFilter === f ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {f === "all" ? "All" : f === "images" ? "Images" : "Videos"}
                  </button>
                ))}
                {pickingFor && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "#3b82f6", color: "#fff" }}>
                    Click an image to set as {pickingFor} image
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>{galleryItems.length} items</span>
                <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-color)" }}>
                  {([{ key: "small" as GridSize, icon: <Grid size={13} /> }, { key: "medium" as GridSize, icon: <LayoutGrid size={13} /> }, { key: "large" as GridSize, icon: <ImageSquare size={13} /> }]).map(({ key, icon }) => (
                    <button key={key} onClick={() => setGridSize(key)} className="px-2 py-1.5 transition-colors" style={{ background: gridSize === key ? "var(--bg-tertiary)" : "transparent", color: gridSize === key ? "var(--text-primary)" : "var(--text-muted)", borderRight: key !== "large" ? "1px solid var(--border-color)" : undefined }}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Gallery grid */}
            <div className="px-4 md:px-6 py-4">
              {loadingGallery ? (
                <div className="flex items-center justify-center py-16"><div className="spinner" /></div>
              ) : galleryItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
                    <VideoIcon size={24} style={{ color: "var(--text-muted)" }} />
                  </div>
                  <p className="font-medium text-[14px] mb-1" style={{ color: "var(--text-secondary)" }}>No content yet</p>
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Generate images or videos to see them here</p>
                </div>
              ) : (
                <div className={`grid gap-2 ${GRID_COLS[gridSize]}`}>
                  {galleryItems.map((item) => {
                    if (item.type === "image") {
                      const img = item.data;
                      const isPickable = pickingFor !== null;
                      return (
                        <div
                          key={`img-${img.image_id}`}
                          onPointerDown={(e) => onPointerDownImage(e, img.image_url, img.image_url)}
                          className={`rounded-xl overflow-hidden group relative cursor-pointer select-none ${isPickable ? "ring-2 ring-transparent hover:ring-blue-500" : ""}`}
                          onClick={() => { if (isPickable) selectGalleryImage(img.image_url); }}
                        >
                          <div className="aspect-square overflow-hidden">
                            <img src={img.image_url} alt={img.prompt} className="w-full h-full object-cover transition-transform group-hover:scale-[1.03] pointer-events-none" draggable={false} />
                          </div>
                          {/* Badges */}
                          <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 p-2">
                            <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>G</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                              <ImageSquare size={10} /> 2K
                            </span>
                          </div>
                          {/* Pick overlay */}
                          {isPickable && (
                            <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="px-3 py-1.5 rounded-lg text-[12px] font-medium" style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
                                Use as {pickingFor} image
                              </span>
                            </div>
                          )}
                          {/* Download */}
                          {!isPickable && (
                            <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-all flex items-start justify-end p-2 opacity-0 group-hover:opacity-100">
                              <button className="p-1.5 rounded-lg bg-black/60 text-white transition-colors hover:bg-black/80" onClick={(e) => { e.stopPropagation(); handleDownload(img.image_url, `horpen-${img.image_id}.png`); }}>
                                <Download size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      const v = item.data;
                      return (
                        <div key={`vid-${v.job_id}`} className="rounded-xl overflow-hidden group relative cursor-pointer">
                          {v.status === "completed" && v.video_url ? (
                            <div className="aspect-square overflow-hidden relative">
                              <video src={v.video_url} className="w-full h-full object-cover" muted />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-black/50 text-white group-hover:bg-black/70 transition-colors">
                                  <Play size={18} />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-square flex flex-col items-center justify-center gap-2" style={{ background: "var(--bg-secondary)" }}>
                              {v.status === "processing" ? (
                                <><Spinner size={20} /><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Processing...</span></>
                              ) : (
                                <span className="text-[11px]" style={{ color: "var(--error)" }}>Failed</span>
                              )}
                            </div>
                          )}
                          {/* Badges */}
                          <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 p-2">
                            <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>{(v.engine || "V")[0].toUpperCase()}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                              <Play size={8} /> {v.engine === "kling" ? "0:05" : "0:08"}
                            </span>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Floating drag ghost — "1 item" badge like Freepik ═══ */}
      {draggingUrl && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: dragPos.x, top: dragPos.y, transform: "translate(-50%, -110%)" }}
        >
          <div className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl" style={{ background: "#22c55e", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
            {draggingThumb && (
              <img src={draggingThumb} alt="" className="w-10 h-10 rounded-lg object-cover" draggable={false} />
            )}
            <span className="text-[13px] font-semibold text-white whitespace-nowrap">1 item</span>
          </div>
          {/* Zone indicator */}
          {dragOverZone && (
            <div className="text-center mt-1">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
                {dragOverZone === "start" ? "→ Start image" : dragOverZone === "end" ? "→ End image" : "→ Describe in prompt"}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
