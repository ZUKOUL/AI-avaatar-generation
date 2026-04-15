"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { thumbnailAPI } from "@/lib/api";

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

// ── Skeleton card ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
    >
      {/* 16:9 placeholder */}
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

// ── Thumbnail card ─────────────────────────────────────────────────────────

function ThumbnailCard({ video, onRecreate }: { video: VideoItem; onRecreate: () => void }) {
  const [imgSrc, setImgSrc] = useState(video.thumbnail_url);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col cursor-default"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.18)" : "none",
        transform: hovered ? "translateY(-2px)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail image — 16:9 */}
      <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={video.title}
          onError={() => {
            // Fallback from maxresdefault → hqdefault
            if (!imgSrc.includes("hqdefault")) {
              setImgSrc(
                `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`
              );
            }
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Hover overlay with Recreate button */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
          style={{
            background: "rgba(0,0,0,0.55)",
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? "auto" : "none",
          }}
        >
          <button
            onClick={onRecreate}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
            style={{
              background: "var(--accent)",
              color: "#fff",
              boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.88";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            Recreate →
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p
          className="text-[13px] font-medium leading-snug line-clamp-2"
          style={{ color: "var(--text-primary)" }}
        >
          {video.title}
        </p>
        <p className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>
          {video.channel}
        </p>
        <div className="mt-auto pt-2">
          <button
            onClick={onRecreate}
            className="w-full py-1.5 rounded-lg text-[12px] font-medium transition-all"
            style={{
              background: "var(--bg-hover)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-color)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent)";
              e.currentTarget.style.color = "#fff";
              e.currentTarget.style.borderColor = "transparent";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-secondary)";
              e.currentTarget.style.borderColor = "var(--border-color)";
            }}
          >
            Recreate →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── API key setup screen ───────────────────────────────────────────────────

function ApiKeySetup({ niches }: { niches: NicheMeta[] }) {
  return (
    <div className="flex flex-col items-center py-16 px-4">
      <div
        className="w-full max-w-lg rounded-2xl p-8 text-center"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <div className="text-4xl mb-4">🔑</div>
        <h3
          className="text-[18px] font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          YouTube API key required
        </h3>
        <p
          className="text-[13px] leading-relaxed mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          To show real top-performing thumbnails, this feature uses the YouTube
          Data API v3. Set it up in under 2 minutes:
        </p>

        <ol
          className="text-left space-y-3 mb-8"
          style={{ color: "var(--text-secondary)" }}
        >
          {[
            <>
              Go to{" "}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                console.cloud.google.com
              </a>{" "}
              and create or open a project.
            </>,
            <>Enable the <strong style={{ color: "var(--text-primary)" }}>YouTube Data API v3</strong> in the API Library.</>,
            <>Go to <strong style={{ color: "var(--text-primary)" }}>Credentials</strong> and create an API key.</>,
            <>
              Add{" "}
              <code
                className="px-1.5 py-0.5 rounded text-[12px]"
                style={{
                  background: "var(--bg-hover)",
                  color: "var(--text-primary)",
                }}
              >
                YOUTUBE_API_KEY=your_key_here
              </code>{" "}
              to your server&apos;s <code className="px-1 py-0.5 rounded text-[12px]" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>.env</code> and restart the backend.
            </>,
          ].map((step, i) => (
            <li key={i} className="flex gap-3 items-start text-[13px]">
              <span
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                }}
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <a
          href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity"
          style={{
            background: "var(--accent)",
            color: "#fff",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Set up YouTube API →
        </a>

        {niches.length > 0 && (
          <p className="mt-6 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Available niches once configured:{" "}
            {niches.map((n) => `${n.emoji} ${n.label}`).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function InspirationPage() {
  const router = useRouter();
  const [activeNiche, setActiveNiche] = useState("business");
  const [niches, setNiches] = useState<NicheMeta[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsApiKey, setNeedsApiKey] = useState(false);

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

  const handleRecreate = (youtubeUrl: string) => {
    router.push(
      `/dashboard/thumbnails?mode=recreate&url=${encodeURIComponent(youtubeUrl)}`
    );
  };

  return (
    <>
      <Header
        title="Inspiration"
        subtitle="Top-performing YouTube thumbnails by niche"
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">

          {/* Niche pills */}
          <div className="flex flex-wrap gap-2 mb-8">
            {(niches.length > 0
              ? niches
              : [
                  { key: "business", label: "Business & Finance", emoji: "💼" },
                  { key: "sport", label: "Sport & Fitness", emoji: "💪" },
                  { key: "entertainment", label: "Entertainment", emoji: "🎭" },
                  { key: "mrbeast", label: "MrBeast Style", emoji: "🏆" },
                  { key: "gaming", label: "Gaming & Tech", emoji: "🎮" },
                ]
            ).map((n) => {
              const active = n.key === activeNiche;
              return (
                <button
                  key={n.key}
                  onClick={() => setActiveNiche(n.key)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all"
                  style={{
                    background: active ? "var(--accent)" : "var(--bg-secondary)",
                    color: active ? "#fff" : "var(--text-secondary)",
                    border: `1px solid ${active ? "transparent" : "var(--border-color)"}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "var(--bg-secondary)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }
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
            <ApiKeySetup niches={niches} />
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
                  onRecreate={() => handleRecreate(v.youtube_url)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
