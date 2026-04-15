"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { LinkIcon, Pencil, SparkleIcon, XIcon } from "@/components/Icons";
import {
  getSavedThumbnails,
  saveThumbnail,
  unsaveThumbnail,
  fetchVideoMeta,
  type SavedThumbnail,
} from "@/lib/saved-thumbnails";

// ── Heart icon ─────────────────────────────────────────────────────────────

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

// ── Thumbnail card (same click-to-modal as inspiration) ───────────────────

function SavedCard({
  item,
  onSelect,
  onUnsave,
}: {
  item: SavedThumbnail;
  onSelect: () => void;
  onUnsave: (e: React.MouseEvent) => void;
}) {
  const [imgSrc, setImgSrc] = useState(item.thumbnail_url);
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
      <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={item.title}
          onError={() => {
            if (!imgSrc.includes("hqdefault")) {
              setImgSrc(`https://img.youtube.com/vi/${item.video_id}/hqdefault.jpg`);
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

        {/* Unsave button */}
        <button
          onClick={onUnsave}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full transition-all z-10"
          style={{ background: "var(--accent)", color: "var(--btn-text)" }}
          title="Remove from saved"
        >
          <HeartIcon filled />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-[13px] font-medium leading-snug line-clamp-2" style={{ color: "var(--text-primary)" }}>
          {item.title}
        </p>
        <p className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>
          {item.channel}
        </p>
      </div>
    </div>
  );
}

// ── Recreate modal (same as inspiration) ──────────────────────────────────

function RecreateModal({
  item,
  onClose,
  onRecreateFromPrompt,
  onEditImage,
}: {
  item: SavedThumbnail;
  onClose: () => void;
  onRecreateFromPrompt: () => void;
  onEditImage: () => void;
}) {
  const [imgSrc, setImgSrc] = useState(item.thumbnail_url);

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
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={item.title}
            onError={() => {
              if (!imgSrc.includes("hqdefault")) {
                setImgSrc(`https://img.youtube.com/vi/${item.video_id}/hqdefault.jpg`);
              }
            }}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <button onClick={onClose} className="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
            <XIcon size={14} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-[13px] font-semibold leading-snug line-clamp-2 mb-0.5" style={{ color: "var(--text-primary)" }}>{item.title}</p>
          <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>{item.channel}</p>

          <p className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>How do you want to recreate this?</p>

          <div className="flex flex-col gap-2.5">
            <button onClick={onRecreateFromPrompt} className="flex items-start gap-3 p-3.5 rounded-xl text-left w-full transition-all" style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; }}>
              <span style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }}><LinkIcon size={16} /></span>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Recreate from prompt</p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>The thumbnail is described automatically — refine and generate</p>
              </div>
            </button>

            <button onClick={onEditImage} className="flex items-start gap-3 p-3.5 rounded-xl text-left w-full transition-all" style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; }}>
              <span style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }}><Pencil size={16} /></span>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Edit this image</p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Start from the thumbnail and modify it with AI</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add via URL row ────────────────────────────────────────────────────────

function AddByUrl({ onAdded }: { onAdded: (item: SavedThumbnail) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      const meta = await fetchVideoMeta(trimmed);
      if (!meta) {
        setError("Could not fetch video info — check the URL and try again.");
        return;
      }
      saveThumbnail(meta);
      onAdded({ ...meta, added_at: new Date().toISOString() });
      setUrl("");
    } catch {
      setError("Something went wrong. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
    <div className="mb-8">
      <p className="text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
        Add a thumbnail by YouTube URL
      </p>
      <div
        className="flex items-center gap-2 px-3.5 rounded-xl"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          height: 42,
        }}
      >
        <SparkleIcon size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          onKeyDown={handleKey}
          placeholder="https://www.youtube.com/watch?v=…"
          className="flex-1 bg-transparent outline-none text-[13px]"
          style={{ color: "var(--text-primary)" }}
        />
        <button
          onClick={handleAdd}
          disabled={loading || !url.trim()}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-opacity disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--btn-text)", flexShrink: 0 }}
        >
          {loading ? "…" : "Save"}
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--error)" }}>{error}</p>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function SavedThumbnailsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedThumbnail[]>([]);
  const [selectedItem, setSelectedItem] = useState<SavedThumbnail | null>(null);

  useEffect(() => {
    setItems(getSavedThumbnails());
  }, []);

  const handleUnsave = (e: React.MouseEvent, videoId: string) => {
    e.stopPropagation();
    unsaveThumbnail(videoId);
    setItems((prev) => prev.filter((i) => i.video_id !== videoId));
    if (selectedItem?.video_id === videoId) setSelectedItem(null);
  };

  const handleAdded = (item: SavedThumbnail) => {
    setItems((prev) => {
      if (prev.some((i) => i.video_id === item.video_id)) return prev;
      return [item, ...prev];
    });
  };

  const handleRecreateFromPrompt = (youtubeUrl: string) => {
    router.push(`/dashboard/thumbnails?ytDescribe=${encodeURIComponent(youtubeUrl)}`);
  };

  const handleEditImage = (thumbnailUrl: string) => {
    router.push(`/dashboard/thumbnails?ref=${encodeURIComponent(thumbnailUrl)}`);
  };

  return (
    <>
      <Header title="Saved" subtitle="Thumbnails you've bookmarked" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">

          {/* Back button */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/dashboard/thumbnails/inspiration"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-all"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Inspiration
            </Link>
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {items.length} saved
            </span>
          </div>

          {/* Add via URL */}
          <AddByUrl onAdded={handleAdded} />

          {/* Grid */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3" style={{ color: "var(--text-muted)" }}>
                <HeartIcon filled={false} />
              </div>
              <p className="text-[15px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                No saved thumbnails yet
              </p>
              <p className="text-[13px] mb-4" style={{ color: "var(--text-muted)" }}>
                Bookmark thumbnails from Inspiration or paste a YouTube URL above.
              </p>
              <Link
                href="/dashboard/thumbnails/inspiration"
                className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-opacity"
                style={{ background: "var(--accent)", color: "var(--btn-text)" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Browse Inspiration →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((item) => (
                <SavedCard
                  key={item.video_id}
                  item={item}
                  onSelect={() => setSelectedItem(item)}
                  onUnsave={(e) => handleUnsave(e, item.video_id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedItem && (
        <RecreateModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onRecreateFromPrompt={() => handleRecreateFromPrompt(selectedItem.youtube_url)}
          onEditImage={() => handleEditImage(selectedItem.thumbnail_url)}
        />
      )}
    </>
  );
}
