"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { thumbnailAPI } from "@/lib/api";
import { LinkIcon, Pencil, SparkleIcon, XIcon } from "@/components/Icons";
import {
  getSavedThumbnails,
  saveThumbnail,
  unsaveThumbnail,
  type SavedThumbnail,
} from "@/lib/saved-thumbnails";

// ── Types ──────────────────────────────────────────────────────────────────

interface NicheMeta {
  key: string;
  label: string;
  emoji: string;
}

interface VideoItem {
  video_id: string;
  title: string;
  channel: string;
  thumbnail_url: string;
  youtube_url: string;
}

interface InspirationResponse {
  needs_api_key: boolean;
  niche?: string;
  niches: NicheMeta[];
  videos: VideoItem[];
}

// ── Bookmark heart icon ────────────────────────────────────────────────────

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

// ── Skeleton card ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
    >
      <div className="w-full animate-pulse" style={{ paddingTop: "56.25%", background: "var(--bg-hover)" }} />
      <div className="p-3 space-y-2">
        <div className="h-3.5 rounded animate-pulse" style={{ background: "var(--bg-hover)", width: "80%" }} />
        <div className="h-3 rounded animate-pulse" style={{ background: "var(--bg-hover)", width: "50%" }} />
      </div>
    </div>
  );
}

// ── Thumbnail card ─────────────────────────────────────────────────────────

function ThumbnailCard({
  video,
  saved,
  onSelect,
  onToggleSave,
}: {
  video: VideoItem;
  saved: boolean;
  onSelect: () => void;
  onToggleSave: (e: React.MouseEvent) => void;
}) {
  const [imgSrc, setImgSrc] = useState(video.thumbnail_url);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col cursor-pointer relative"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.22)" : "none",
        transform: hovered ? "translateY(-3px)" : "none",
      }}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail — 16:9 */}
      <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={video.title}
          onError={() => {
            if (!imgSrc.includes("hqdefault")) {
              setImgSrc(`https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`);
            }
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
          style={{ background: "rgba(0,0,0,0.52)", opacity: hovered ? 1 : 0, pointerEvents: "none" }}
        >
          <span className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--accent)", color: "var(--btn-text)" }}>
            Recreate →
          </span>
        </div>

        {/* Bookmark button — top-right, always visible */}
        <button
          onClick={onToggleSave}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full transition-all z-10"
          style={{
            background: saved ? "var(--accent)" : "rgba(0,0,0,0.55)",
            color: saved ? "var(--btn-text)" : "#fff",
            border: "none",
          }}
          title={saved ? "Remove from saved" : "Save"}
        >
          <HeartIcon filled={saved} />
        </button>
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-[13px] font-medium leading-snug line-clamp-2" style={{ color: "var(--text-primary)" }}>
          {video.title}
        </p>
        <p className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>
          {video.channel}
        </p>
      </div>
    </div>
  );
}

// ── Recreate modal ─────────────────────────────────────────────────────────

function RecreateModal({
  video,
  onClose,
  onRecreateFromPrompt,
  onEditImage,
}: {
  video: VideoItem;
  onClose: () => void;
  onRecreateFromPrompt: () => void;
  onEditImage: () => void;
}) {
  const [imgSrc, setImgSrc] = useState(video.thumbnail_url);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Thumbnail preview */}
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={video.title}
            onError={() => {
              if (!imgSrc.includes("hqdefault")) {
                setImgSrc(`https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`);
              }
            }}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <button
            onClick={onClose}
            className="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
          >
            <XIcon size={14} />
          </button>
        </div>

        {/* Info + actions */}
        <div className="p-4">
          <p className="text-[13px] font-semibold leading-snug line-clamp-2 mb-0.5" style={{ color: "var(--text-primary)" }}>
            {video.title}
          </p>
          <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
            {video.channel}
          </p>

          <p className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
            How do you want to recreate this?
          </p>

          <div className="flex flex-col gap-2.5">
            {/* Option 1 — Auto-describe in prompt mode */}
            <button
              onClick={onRecreateFromPrompt}
              className="flex items-start gap-3 p-3.5 rounded-xl text-left w-full transition-all"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; }}
            >
              <span style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }}>
                <LinkIcon size={16} />
              </span>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Recreate from prompt
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  The thumbnail is described automatically — refine the prompt and generate
                </p>
              </div>
            </button>

            {/* Option 2 — Edit the image directly */}
            <button
              onClick={onEditImage}
              className="flex items-start gap-3 p-3.5 rounded-xl text-left w-full transition-all"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; }}
            >
              <span style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }}>
                <Pencil size={16} />
              </span>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Edit this image
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Start directly from the thumbnail and modify it with AI
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── API key setup screen ───────────────────────────────────────────────────

function ApiKeySetup({ niches }: { niches: NicheMeta[] }) {
  return (
    <div className="flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-lg rounded-2xl p-8 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
        <div className="flex justify-center mb-4" style={{ color: "var(--accent)" }}>
          <SparkleIcon size={32} />
        </div>
        <h3 className="text-[18px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          YouTube API key required
        </h3>
        <p className="text-[13px] leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
          To show real top-performing thumbnails, this feature uses the YouTube Data API v3.
        </p>
        <ol className="text-left space-y-3 mb-8" style={{ color: "var(--text-secondary)" }}>
          {[
            <>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent)" }}>console.cloud.google.com</a> and create or open a project.</>,
            <>Enable the <strong style={{ color: "var(--text-primary)" }}>YouTube Data API v3</strong> in the API Library.</>,
            <>Go to <strong style={{ color: "var(--text-primary)" }}>Credentials</strong> and create an API key.</>,
            <>Add <code className="px-1.5 py-0.5 rounded text-[12px]" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>YOUTUBE_API_KEY=your_key</code> to the server <code className="px-1 py-0.5 rounded text-[12px]" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>.env</code>.</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-3 items-start text-[13px]">
              <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5" style={{ background: "var(--accent)", color: "var(--btn-text)" }}>
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity" style={{ background: "var(--accent)", color: "var(--btn-text)" }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
          Set up YouTube API →
        </a>
        {niches.length > 0 && (
          <p className="mt-6 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Niches available once configured: {niches.map((n) => `${n.emoji} ${n.label}`).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const DEFAULT_NICHES: NicheMeta[] = [
  { key: "business",      label: "Business & Finance", emoji: "💼" },
  { key: "sport",         label: "Sport & Fitness",    emoji: "💪" },
  { key: "entertainment", label: "Entertainment",      emoji: "🎭" },
  { key: "mrbeast",       label: "MrBeast Style",      emoji: "🏆" },
  { key: "gaming",        label: "Gaming & Tech",      emoji: "🎮" },
];

export default function InspirationPage() {
  const router = useRouter();
  const [activeNiche, setActiveNiche] = useState("business");
  const [niches, setNiches] = useState<NicheMeta[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  // Set of video_ids the user has saved — drives the heart icon state
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Load saved state from localStorage on mount
  useEffect(() => {
    const saved = getSavedThumbnails();
    setSavedIds(new Set(saved.map((s: SavedThumbnail) => s.video_id)));
  }, []);

  const fetchInspiration = async (niche: string) => {
    setLoading(true);
    try {
      const res = await thumbnailAPI.inspiration(niche, 12);
      const data: InspirationResponse = res.data;
      setNeedsApiKey(data.needs_api_key);
      if (data.niches?.length) setNiches(data.niches);
      setVideos(data.videos || []);
    } catch (err) {
      console.error("Failed to fetch inspiration:", err);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInspiration(activeNiche);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNiche]);

  const handleToggleSave = useCallback(
    (e: React.MouseEvent, video: VideoItem) => {
      e.stopPropagation(); // don't open the modal
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(video.video_id)) {
          unsaveThumbnail(video.video_id);
          next.delete(video.video_id);
        } else {
          saveThumbnail(video);
          next.add(video.video_id);
        }
        return next;
      });
    },
    []
  );

  // "Recreate from prompt": go to Prompt mode, auto-describe via ?ytDescribe=
  const handleRecreateFromPrompt = (youtubeUrl: string) => {
    router.push(`/dashboard/thumbnails?ytDescribe=${encodeURIComponent(youtubeUrl)}`);
  };

  // "Edit this image": go to Edit mode with thumbnail pre-loaded via ?ref=
  const handleEditImage = (thumbnailUrl: string) => {
    router.push(`/dashboard/thumbnails?ref=${encodeURIComponent(thumbnailUrl)}`);
  };

  const displayNiches = niches.length > 0 ? niches : DEFAULT_NICHES;

  return (
    <>
      <Header title="Inspiration" subtitle="Top-performing YouTube thumbnails by niche" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">

          {/* Top bar: back button + saved link */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/dashboard/thumbnails"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-all"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Thumbnails
            </Link>

            <Link
              href="/dashboard/thumbnails/saved"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={{
                background: "var(--bg-hover)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; }}
            >
              <HeartIcon filled={false} />
              <span>Saved ({savedIds.size})</span>
            </Link>
          </div>

          {/* Niche pills */}
          <div className="flex flex-wrap gap-2 mb-8">
            {displayNiches.map((n) => {
              const active = n.key === activeNiche;
              return (
                <button
                  key={n.key}
                  onClick={() => setActiveNiche(n.key)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all"
                  style={{
                    // Active: use --accent bg + --btn-text for text
                    // (in dark mode accent=#ececec + btn-text=#000 → readable)
                    // (in light mode accent=#1a1a1a + btn-text=#fff → readable)
                    background: active ? "var(--accent)" : "var(--bg-hover)",
                    color: active ? "var(--btn-text)" : "var(--text-primary)",
                    border: `1px solid ${active ? "transparent" : "var(--border-color)"}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.borderColor = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.borderColor = "var(--border-color)";
                  }}
                >
                  <span>{n.emoji}</span>
                  <span>{n.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content area */}
          {needsApiKey ? (
            <ApiKeySetup niches={displayNiches} />
          ) : loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: "var(--text-muted)" }}>
              <p className="text-[15px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                No videos found for this niche
              </p>
              <p className="text-[13px]">Try another category or check back later.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {videos.map((v) => (
                <ThumbnailCard
                  key={v.video_id}
                  video={v}
                  saved={savedIds.has(v.video_id)}
                  onSelect={() => setSelectedVideo(v)}
                  onToggleSave={(e) => handleToggleSave(e, v)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recreate modal */}
      {selectedVideo && (
        <RecreateModal
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onRecreateFromPrompt={() => handleRecreateFromPrompt(selectedVideo.youtube_url)}
          onEditImage={() => handleEditImage(selectedVideo.thumbnail_url)}
        />
      )}
    </>
  );
}
