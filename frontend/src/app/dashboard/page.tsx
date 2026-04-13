"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { avatarAPI, videoAPI } from "@/lib/api";
import {
  UserCircle,
  ImageSquare,
  VideoCamera,
  ArrowRight,
  Plus,
  Clock,
} from "@/components/Icons";

interface Avatar {
  avatar_id: string;
  name: string;
  thumbnail: string;
  created_at: string;
}
interface GeneratedImage {
  image_id: string;
  image_url: string;
  prompt: string;
  created_at: string;
}
interface VideoJob {
  job_id: string;
  video_url?: string;
  motion_prompt?: string;
  status: string;
  engine?: string;
  created_at: string;
}

type RecentItem = {
  id: string;
  type: "avatar" | "image" | "video";
  thumbnail: string;
  label: string;
  date: string;
  href: string;
};

const TOOLS = [
  {
    href: "/dashboard/avatars",
    icon: UserCircle,
    label: "Avatar",
    accent: false,
  },
  {
    href: "/dashboard/images",
    icon: ImageSquare,
    label: "Image",
    accent: false,
  },
  {
    href: "/dashboard/videos",
    icon: VideoCamera,
    label: "Video",
    accent: false,
  },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DashboardHome() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecent();
  }, []);

  const loadRecent = async () => {
    try {
      const [avatarRes, imageRes, videoRes] = await Promise.all([
        avatarAPI.list(),
        avatarAPI.getImages(undefined, 8),
        videoAPI.history(undefined, 8),
      ]);

      const avatars: RecentItem[] = (avatarRes.data.avatars || []).map(
        (a: Avatar) => ({
          id: a.avatar_id,
          type: "avatar" as const,
          thumbnail: a.thumbnail || "",
          label: a.name,
          date: a.created_at,
          href: "/dashboard/avatars",
        })
      );

      const images: RecentItem[] = (imageRes.data.images || []).map(
        (i: GeneratedImage) => ({
          id: i.image_id,
          type: "image" as const,
          thumbnail: i.image_url || "",
          label: i.prompt?.slice(0, 40) || "Image",
          date: i.created_at,
          href: "/dashboard/images",
        })
      );

      const videos: RecentItem[] = (videoRes.data.videos || [])
        .filter((v: VideoJob) => v.status === "completed" && v.video_url)
        .map((v: VideoJob) => ({
          id: v.job_id,
          type: "video" as const,
          thumbnail: "",
          label: v.motion_prompt?.slice(0, 40) || "Video",
          date: v.created_at,
          href: "/dashboard/videos",
        }));

      const all = [...avatars, ...images, ...videos]
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        .slice(0, 12);

      setRecentItems(all);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  };

  const handlePromptSubmit = () => {
    if (!prompt.trim()) return;
    router.push(`/dashboard/avatars`);
  };

  return (
    <>
      <Header title="Dashboard" />
      <div className="flex-1 overflow-y-auto">
        {/* Centered hero section */}
        <div className="flex flex-col items-center justify-center px-4 md:px-6 pt-10 md:pt-16 pb-8 md:pb-10">
          {/* Title */}
          <h1
            className="text-[22px] md:text-[28px] font-semibold mb-2 flex items-center gap-2.5"
            style={{
              color: "var(--text-primary)",
              letterSpacing: "-0.03em",
            }}
          >
            Create with
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <span
                className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                }}
              >
                H
              </span>
              Horpen
            </span>
          </h1>
          <p
            className="text-[15px] mb-8"
            style={{ color: "var(--text-muted)" }}
          >
            Generate AI avatars, scenes, and video ads that convert
          </p>

          {/* Prompt bar */}
          <div
            className="w-full max-w-[600px] rounded-xl md:rounded-2xl overflow-hidden"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              boxShadow:
                "0 1px 3px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
            }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handlePromptSubmit();
                }
              }}
              placeholder="Describe your avatar, image, or video ad..."
              rows={2}
              className="w-full px-4 pt-4 pb-2 text-[14px] resize-none bg-transparent"
              style={{
                color: "var(--text-primary)",
                outline: "none",
                border: "none",
              }}
            />
            <div
              className="flex items-center justify-between px-3 pb-3"
            >
              <div className="flex items-center gap-1">
                <button
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePromptSubmit}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{
                    color: prompt.trim()
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    background: prompt.trim()
                      ? "var(--bg-hover)"
                      : "transparent",
                  }}
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Tool pills */}
          <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all"
                  style={{
                    border: "1px solid var(--border-color)",
                    color: "var(--text-secondary)",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--text-muted)";
                    e.currentTarget.style.color = "var(--text-primary)";
                    e.currentTarget.style.background = "var(--bg-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-color)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon size={14} />
                  {tool.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent creations */}
        <div className="px-4 md:px-6 pb-8">
          <h3
            className="text-[15px] font-semibold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Recent Creations
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {/* New creation card */}
              <Link
                href="/dashboard/avatars"
                className="group flex flex-col items-center justify-center rounded-xl aspect-[4/3] transition-all"
                style={{
                  border: "1.5px dashed var(--border-color)",
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
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Plus size={24} />
                </div>
                <span
                  className="text-[13px] font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  New Creation
                </span>
              </Link>

              {/* Recent items */}
              {recentItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "var(--text-muted)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = "var(--border-color)")
                  }
                >
                  {item.thumbnail ? (
                    <div className="aspect-[4/3] overflow-hidden">
                      <img
                        src={item.thumbnail}
                        alt={item.label}
                        className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    </div>
                  ) : (
                    <div
                      className="aspect-[4/3] flex items-center justify-center"
                      style={{ background: "var(--bg-tertiary)" }}
                    >
                      {item.type === "avatar" && (
                        <UserCircle
                          size={28}
                          color="var(--text-muted)"
                        />
                      )}
                      {item.type === "image" && (
                        <ImageSquare
                          size={28}
                          color="var(--text-muted)"
                        />
                      )}
                      {item.type === "video" && (
                        <VideoCamera
                          size={28}
                          color="var(--text-muted)"
                        />
                      )}
                    </div>
                  )}
                  <div className="px-3 py-2">
                    <p
                      className="text-[12px] font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.label}
                    </p>
                    <div
                      className="flex items-center gap-1 mt-0.5"
                    >
                      <Clock size={10} color="var(--text-muted)" />
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {formatDate(item.date)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}

              {/* Empty state if no recent items */}
              {!loading && recentItems.length === 0 && (
                <>
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="rounded-xl aspect-[4/3]"
                      style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        opacity: 0.5,
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
