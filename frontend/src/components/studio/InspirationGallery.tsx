"use client";

/**
 * InspirationGallery — embeddable templates view.
 *
 * Originally lived at /dashboard/thumbnails/inspiration as a standalone
 * page. Pulled here so it can be rendered inline as the "Templates"
 * sub-tab on the main Thumbnail Studio page (no extra navigation
 * needed). The page route stays around for back-compat.
 *
 * Behaviour:
 *   • Niche pills along the top — pick a category, fetch top videos
 *     via `thumbnailAPI.inspiration(niche)`.
 *   • 4-up grid of thumbnail cards with bookmark heart.
 *   • Click a card → modal with two CTAs: "Recreate from prompt"
 *     (redirects to ?ytDescribe=) or "Edit this image" (?ref=).
 *   • Skeleton + empty + API-key-needed states.
 *
 * The component takes no required props — it self-contains all state.
 * Pages that want extra wiring (e.g. preselecting a niche) can pass
 * an `initialNiche`.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { thumbnailAPI } from "@/lib/api";
import { LinkIcon, Pencil, SparkleIcon, XIcon } from "@/components/Icons";
import {
  getSavedThumbnails,
  saveThumbnail,
  unsaveThumbnail,
  type SavedThumbnail,
} from "@/lib/saved-thumbnails";

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

const DEFAULT_NICHES: NicheMeta[] = [
  { key: "business", label: "Business", emoji: "💼" },
  { key: "tech", label: "Tech", emoji: "💻" },
  { key: "fitness", label: "Fitness", emoji: "💪" },
  { key: "gaming", label: "Gaming", emoji: "🎮" },
  { key: "education", label: "Education", emoji: "🎓" },
  { key: "food", label: "Food", emoji: "🍳" },
  { key: "travel", label: "Travel", emoji: "✈️" },
  { key: "music", label: "Music", emoji: "🎵" },
];

interface InspirationGalleryProps {
  initialNiche?: string;
}

export default function InspirationGallery({
  initialNiche = "business",
}: InspirationGalleryProps) {
  const router = useRouter();
  const [activeNiche, setActiveNiche] = useState(initialNiche);
  const [niches, setNiches] = useState<NicheMeta[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

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
      e.stopPropagation();
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

  const handleRecreateFromPrompt = (youtubeUrl: string) => {
    router.push(
      `/dashboard/thumbnails?ytDescribe=${encodeURIComponent(youtubeUrl)}`
    );
  };

  const handleEditImage = (thumbnailUrl: string) => {
    router.push(
      `/dashboard/thumbnails?ref=${encodeURIComponent(thumbnailUrl)}`
    );
  };

  const displayNiches = niches.length > 0 ? niches : DEFAULT_NICHES;

  return (
    <>
      {/* Niche pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {displayNiches.map((n) => {
          const active = n.key === activeNiche;
          return (
            <button
              key={n.key}
              onClick={() => setActiveNiche(n.key)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all"
              style={{
                background: active ? "var(--accent)" : "var(--bg-secondary)",
                color: active ? "var(--btn-text)" : "var(--text-primary)",
                border: `1px solid ${active ? "transparent" : "var(--border-color)"}`,
              }}
              onMouseEnter={(e) => {
                if (!active)
                  e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  e.currentTarget.style.borderColor = "var(--border-color)";
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
        <ApiKeySetup />
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 text-center"
          style={{ color: "var(--text-muted)" }}
        >
          <p
            className="text-[15px] font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Aucune vidéo trouvée pour cette catégorie
          </p>
          <p className="text-[13px]">Essaye une autre catégorie.</p>
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

      {/* Recreate modal */}
      {selectedVideo && (
        <RecreateModal
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onRecreateFromPrompt={() =>
            handleRecreateFromPrompt(selectedVideo.youtube_url)
          }
          onEditImage={() => handleEditImage(selectedVideo.thumbnail_url)}
        />
      )}
    </>
  );
}

/* ─── Sub-components (lifted from the standalone inspiration page) ─── */

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      <div
        className="w-full animate-pulse"
        style={{ paddingTop: "56.25%", background: "var(--bg-hover)" }}
      />
      <div className="p-3 space-y-2">
        <div
          className="h-3.5 rounded animate-pulse"
          style={{ background: "var(--bg-hover)", width: "80%" }}
        />
        <div
          className="h-3 rounded animate-pulse"
          style={{ background: "var(--bg-hover)", width: "50%" }}
        />
      </div>
    </div>
  );
}

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
      <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={video.title}
          onError={() => {
            if (!imgSrc.includes("hqdefault")) {
              setImgSrc(
                `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`
              );
            }
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
          style={{
            background: "rgba(0,0,0,0.52)",
            opacity: hovered ? 1 : 0,
            pointerEvents: "none",
          }}
        >
          <span
            className="px-4 py-2 rounded-lg text-[13px] font-semibold"
            style={{ background: "var(--accent)", color: "var(--btn-text)" }}
          >
            Recreate →
          </span>
        </div>
        <button
          onClick={onToggleSave}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full transition-all z-10"
          style={{
            background: saved ? "var(--accent)" : "rgba(0,0,0,0.55)",
            color: saved ? "var(--btn-text)" : "#fff",
            border: "none",
          }}
          title={saved ? "Retirer des favoris" : "Sauvegarder"}
        >
          <HeartIcon filled={saved} />
        </button>
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p
          className="text-[13px] font-medium leading-snug line-clamp-2"
          style={{ color: "var(--text-primary)" }}
        >
          {video.title}
        </p>
        <p
          className="text-[12px] truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {video.channel}
        </p>
      </div>
    </div>
  );
}

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
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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
            alt={video.title}
            onError={() => {
              if (!imgSrc.includes("hqdefault")) {
                setImgSrc(
                  `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`
                );
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
        <div className="p-4">
          <p
            className="text-[13px] font-semibold leading-snug line-clamp-2 mb-0.5"
            style={{ color: "var(--text-primary)" }}
          >
            {video.title}
          </p>
          <p
            className="text-[12px] mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            {video.channel}
          </p>
          <p
            className="text-[11px] font-medium uppercase tracking-wider mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Comment veux-tu la recréer ?
          </p>
          <div className="flex flex-col gap-2.5">
            <button
              onClick={onRecreateFromPrompt}
              className="flex items-start gap-3 p-3.5 rounded-xl text-left w-full transition-all"
              style={{
                background: "var(--bg-hover)",
                border: "1px solid var(--border-color)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
              }}
            >
              <span
                style={{
                  color: "var(--accent)",
                  marginTop: 2,
                  flexShrink: 0,
                }}
              >
                <LinkIcon size={16} />
              </span>
              <div>
                <p
                  className="text-[13px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Recréer depuis un prompt
                </p>
                <p
                  className="text-[12px] mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  La miniature est décrite automatiquement — affine le prompt et génère
                </p>
              </div>
            </button>
            <button
              onClick={onEditImage}
              className="flex items-start gap-3 p-3.5 rounded-xl text-left w-full transition-all"
              style={{
                background: "var(--bg-hover)",
                border: "1px solid var(--border-color)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
              }}
            >
              <span
                style={{
                  color: "var(--accent)",
                  marginTop: 2,
                  flexShrink: 0,
                }}
              >
                <Pencil size={16} />
              </span>
              <div>
                <p
                  className="text-[13px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Éditer cette image
                </p>
                <p
                  className="text-[12px] mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Pars directement de la miniature et modifie-la avec l&apos;IA
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiKeySetup() {
  return (
    <div className="flex flex-col items-center py-16 px-4">
      <div
        className="w-full max-w-lg rounded-2xl p-8 text-center"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <div className="flex justify-center mb-4" style={{ color: "var(--accent)" }}>
          <SparkleIcon size={32} />
        </div>
        <h3
          className="text-[18px] font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Clé API YouTube requise
        </h3>
        <p
          className="text-[13px] leading-relaxed mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          Pour afficher les vraies miniatures top-performantes, cette feature
          utilise YouTube Data API v3.
        </p>
      </div>
    </div>
  );
}
