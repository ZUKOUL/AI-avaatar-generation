"use client";

import { useEffect, useRef, useState } from "react";
import {
  XIcon,
  CaretLeft,
  CaretRight,
  Download,
  Trash,
  Heart,
  FolderPlus,
  Copy,
  Pencil,
  VideoCamera,
  Save,
  Share,
  ChevronDown,
  Check,
} from "@/components/Icons";

export interface MediaDetailItem {
  id: string;
  type: "image" | "video";
  url: string;
  prompt: string;
  created_at: string;
  avatar_id?: string;
  model?: string;
  aspect_ratio?: string;
  quality?: string;
  references?: { url: string; label?: string }[];
}

interface Props {
  item: MediaDetailItem;
  position?: { index: number; total: number };
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDelete?: () => void;
  onDownload: () => void;
  onReusePrompt?: () => void;
  onEdit?: () => void;
  onCreateVideo?: () => void;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const diff = Date.now() - then;
  const sec = Math.max(1, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day > 1 ? "s" : ""} ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk} week${wk > 1 ? "s" : ""} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} month${mo > 1 ? "s" : ""} ago`;
  const yr = Math.floor(day / 365);
  return `${yr} year${yr > 1 ? "s" : ""} ago`;
}

export default function MediaDetailView({
  item,
  position,
  onClose,
  onPrev,
  onNext,
  onDelete,
  onDownload,
  onReusePrompt,
  onEdit,
  onCreateVideo,
}: Props) {
  const [tab, setTab] = useState<"details" | "comments">("details");
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);

  // Escape + arrow keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  // Reset per-item state
  useEffect(() => {
    setCopied(false);
    setDims(null);
  }, [item.id]);

  const copyPrompt = async () => {
    if (!item.prompt) return;
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const modelLabel = item.model || "Google Nano Banana Pro";
  const dimLabel =
    dims && dims.w && dims.h
      ? `${dims.w}×${dims.h} px`
      : item.aspect_ratio
        ? item.aspect_ratio
        : item.type === "video"
          ? "Video"
          : "Image";
  const qualityLabel = item.quality || "Auto";

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fadeIn"
      style={{ background: "rgba(10,10,12,0.92)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      {/* Close — top right of viewport */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2.5 rounded-xl transition-colors z-[61] hover:bg-white/10"
        style={{ color: "rgba(255,255,255,0.65)" }}
        aria-label="Close"
      >
        <XIcon size={22} />
      </button>

      {/* Prev */}
      {onPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full transition-colors z-[61] hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.65)" }}
          aria-label="Previous"
        >
          <CaretLeft size={22} />
        </button>
      )}

      {/* Next */}
      {onNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-[430px] top-1/2 -translate-y-1/2 p-2.5 rounded-full transition-colors z-[61] hover:bg-white/10 hidden md:block"
          style={{ color: "rgba(255,255,255,0.65)" }}
          aria-label="Next"
        >
          <CaretRight size={22} />
        </button>
      )}

      {/* Media area — click on padding/black area closes; only the media itself swallows clicks. */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        {item.type === "video" ? (
          <video
            key={item.id}
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={item.url}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setDims({ w: v.videoWidth, h: v.videoHeight });
            }}
            className="max-w-full max-h-[88vh] rounded-2xl"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
          />
        ) : (
          <img
            key={item.id}
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={item.url}
            alt={item.prompt}
            onClick={(e) => e.stopPropagation()}
            onLoad={(e) => {
              const img = e.currentTarget;
              setDims({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            className="max-w-full max-h-[88vh] object-contain rounded-2xl"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
            draggable={false}
          />
        )}
      </div>

      {/* Side panel */}
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] shrink-0 flex flex-col overflow-hidden"
        style={{
          background: "var(--bg-primary)",
          borderLeft: "1px solid var(--border-color)",
        }}
      >
        {/* Tabs */}
        <div
          className="flex items-center gap-1 px-4 pt-4 pb-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <div
            className="flex-1 flex rounded-xl p-1"
            style={{
              background: "var(--segment-bg)",
              boxShadow: "var(--shadow-segment-inset)",
            }}
          >
            {(["details", "comments"] as const).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-1.5 rounded-lg text-[13px] transition-colors capitalize"
                  style={{
                    background: active ? "var(--segment-active-bg)" : "transparent",
                    boxShadow: active ? "var(--shadow-segment-active)" : "none",
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "details" ? (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Timestamp + quick actions */}
            <div className="flex items-center justify-between">
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {timeAgo(item.created_at)}
                {position ? ` · ${position.index + 1} / ${position.total}` : ""}
              </span>
              <div className="flex items-center gap-1">
                {onDelete && (
                  <IconBtn onClick={onDelete} aria="Delete">
                    <Trash size={16} />
                  </IconBtn>
                )}
                <IconBtn
                  onClick={() => setLiked((v) => !v)}
                  aria={liked ? "Unlike" : "Like"}
                  active={liked}
                >
                  <Heart size={16} color={liked ? "#ef4444" : undefined} />
                </IconBtn>
                <IconBtn onClick={() => {}} aria="Add to folder">
                  <FolderPlus size={16} />
                </IconBtn>
                <IconBtn onClick={onDownload} aria="Download">
                  <Download size={16} />
                </IconBtn>
              </div>
            </div>

            {/* Prompt */}
            {item.prompt && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-[12px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Prompt
                  </span>
                  <button
                    onClick={copyPrompt}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    {copied ? (
                      <>
                        <Check size={12} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy
                      </>
                    )}
                  </button>
                </div>
                <p
                  className="text-[13px] leading-relaxed whitespace-pre-wrap"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {item.prompt}
                </p>
              </div>
            )}

            {/* Settings */}
            <div>
              <span
                className="text-[12px] font-semibold uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Settings
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Chip>{dimLabel}</Chip>
                <Chip>{modelLabel}</Chip>
                <Chip>{qualityLabel}</Chip>
              </div>
            </div>

            {/* References */}
            {item.references && item.references.length > 0 && (
              <div>
                <span
                  className="text-[12px] font-semibold uppercase tracking-wider block mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  References
                </span>
                <div className="flex flex-wrap gap-2">
                  {item.references.map((r, i) => (
                    <div
                      key={i}
                      className="w-14 h-14 rounded-lg overflow-hidden"
                      style={{
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-secondary)",
                      }}
                      title={r.label || ""}
                    >
                      <img
                        src={r.url}
                        alt={r.label || "reference"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-[13px] text-center" style={{ color: "var(--text-muted)" }}>
              Comments are coming soon.
            </p>
          </div>
        )}

        {/* Bottom action buttons */}
        {tab === "details" && (
          <div
            className="shrink-0 px-4 py-4 space-y-2"
            style={{ borderTop: "1px solid var(--border-color)" }}
          >
            {onReusePrompt && (
              <PrimaryBtn onClick={onReusePrompt}>
                <span className="flex items-center gap-2">
                  <CaretRight size={16} />
                  Use image
                </span>
                <ChevronDown size={16} style={{ opacity: 0.6 }} />
              </PrimaryBtn>
            )}
            {onEdit && (
              <SecondaryBtn onClick={onEdit}>
                <Pencil size={16} />
                Edit image
              </SecondaryBtn>
            )}
            {onCreateVideo && item.type === "image" && (
              <SecondaryBtn onClick={onCreateVideo}>
                <VideoCamera size={16} />
                Create video
              </SecondaryBtn>
            )}
            <SecondaryBtn onClick={onDownload}>
              <Save size={16} />
              Save as
              <span style={{ marginLeft: "auto" }}>
                <ChevronDown size={14} style={{ opacity: 0.6 }} />
              </span>
            </SecondaryBtn>
            <SecondaryBtn onClick={async () => {
              const shareUrl = item.url;
              if (navigator.share) {
                try {
                  await navigator.share({ url: shareUrl, title: "Horpen" });
                } catch {}
              } else {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                } catch {}
              }
            }}>
              <Share size={16} />
              Share
            </SecondaryBtn>
          </div>
        )}
      </aside>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  aria,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  aria: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
      style={{
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        background: active ? "var(--bg-hover)" : "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? "var(--bg-hover)" : "transparent";
        e.currentTarget.style.color = active ? "var(--text-primary)" : "var(--text-muted)";
      }}
    >
      {children}
    </button>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[12px] px-2.5 py-1 rounded-lg"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </span>
  );
}

function PrimaryBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
      style={{
        background: "var(--text-primary)",
        color: "var(--bg-primary)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all"
      style={{
        background: "var(--btn-raised-bg)",
        border: "1px solid var(--btn-raised-border)",
        boxShadow: "var(--shadow-btn-raised)",
        color: "var(--text-primary)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)")
      }
    >
      {children}
    </button>
  );
}
