"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { avatarAPI, videoAPI } from "@/lib/api";
import { SparkleIcon, Spinner, Video as VideoIcon, UserCircle, Play } from "@/components/Icons";

interface Avatar { avatar_id: string; name: string; thumbnail: string; }
interface GeneratedImage { image_id: string; image_url: string; prompt: string; }
interface VideoJob { job_id: string; avatar_id?: string; operation_id: string; status: string; video_url?: string; motion_prompt?: string; engine?: string; created_at: string; }

export default function VideoGenerator() {
  const [motionPrompt, setMotionPrompt] = useState("");
  const [engine, setEngine] = useState<"veo" | "kling">("veo");
  const [audio, setAudio] = useState(false);
  const [sourceType, setSourceType] = useState<"avatar" | "image">("avatar");
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [videos, setVideos] = useState<VideoJob[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [avatarRes, imageRes, videoRes] = await Promise.all([avatarAPI.list(), avatarAPI.getImages(undefined, 20), videoAPI.history()]);
      setAvatars(avatarRes.data.avatars || []);
      setImages(imageRes.data.images || []);
      setVideos(videoRes.data.videos || []);
    } catch { /* silently fail */ }
    finally { setLoadingVideos(false); }
  };

  const creditCost = engine === "kling" ? (audio ? 12 : 8) : 15;

  const handleGenerate = async () => {
    if (!motionPrompt.trim()) return;
    if (sourceType === "avatar" && !selectedAvatar) { setError("Please select an avatar."); return; }
    if (sourceType === "image" && !selectedImage) { setError("Please select an image."); return; }
    setLoading(true); setError(""); setSuccess("");
    const formData = new FormData();
    formData.append("motion_prompt", motionPrompt);
    formData.append("engine_choice", engine);
    formData.append("audio", audio.toString());
    if (sourceType === "avatar" && selectedAvatar) formData.append("avatar_id", selectedAvatar);
    if (sourceType === "image" && selectedImage) formData.append("image_id", selectedImage);
    try {
      const res = await videoAPI.animate(formData);
      setSuccess(`Video generation started! Operation: ${res.data.operation_id}. It may take 1-3 minutes.`);
      setMotionPrompt(""); loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string | { message?: string } } } };
      const detail = e.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else if (detail && typeof detail === "object" && "message" in detail) setError(detail.message || "Generation failed");
      else setError("Video generation failed. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <>
      <Header title="Video Generator" subtitle="Animate your avatars into videos" />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col md:flex-row h-full">
          <div className="split-panel-left w-full md:w-[380px] shrink-0 p-4 md:p-5 overflow-y-auto flex flex-col gap-5">
            <div>
              <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-muted)" }}>Engine</label>
              <div className="flex gap-2">
                {(["veo", "kling"] as const).map((e) => (
                  <button key={e} onClick={() => { setEngine(e); if (e === "veo") setAudio(false); }}
                    className="flex-1 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all"
                    style={{
                      background: engine === e ? "var(--text-primary)" : "var(--bg-tertiary)",
                      color: engine === e ? "#000" : "var(--text-secondary)",
                      border: `1px solid ${engine === e ? "var(--text-primary)" : "var(--border-color)"}`,
                    }}
                  >
                    {e === "veo" ? "Veo 3.1 · 8s" : "Kling · 5s"}
                  </button>
                ))}
              </div>
              {engine === "kling" && (
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} className="accent-white w-4 h-4" />
                  <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Enable audio (v2.6, +4 credits)</span>
                </label>
              )}
            </div>

            <div>
              <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-muted)" }}>Source</label>
              <div className="flex gap-2">
                {(["avatar", "image"] as const).map((s) => (
                  <button key={s} onClick={() => setSourceType(s)}
                    className="flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-all"
                    style={{
                      background: sourceType === s ? "var(--bg-hover)" : "var(--bg-tertiary)",
                      color: sourceType === s ? "var(--text-primary)" : "var(--text-secondary)",
                      border: `1px solid ${sourceType === s ? "var(--text-primary)" : "var(--border-color)"}`,
                    }}
                  >
                    {s === "avatar" ? "From Avatar" : "From Image"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-muted)" }}>{sourceType === "avatar" ? "Select Avatar" : "Select Image"}</label>
              <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto">
                {sourceType === "avatar"
                  ? avatars.map((a) => (
                      <button key={a.avatar_id} onClick={() => setSelectedAvatar(a.avatar_id)}
                        className="w-12 h-12 rounded-lg overflow-hidden transition-all"
                        style={{ border: `1.5px solid ${selectedAvatar === a.avatar_id ? "var(--text-primary)" : "var(--border-color)"}` }}
                        title={a.name}
                      >
                        {a.thumbnail ? <img src={a.thumbnail} alt={a.name} className="w-full h-full object-cover" /> : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-tertiary)" }}>
                            <UserCircle size={16} style={{ color: "var(--text-muted)" }} />
                          </div>
                        )}
                      </button>
                    ))
                  : images.map((img) => (
                      <button key={img.image_id} onClick={() => setSelectedImage(img.image_id)}
                        className="w-12 h-12 rounded-lg overflow-hidden transition-all"
                        style={{ border: `1.5px solid ${selectedImage === img.image_id ? "var(--text-primary)" : "var(--border-color)"}` }}
                      >
                        <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
              </div>
            </div>

            <div className="flex-1">
              <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-muted)" }}>Motion Prompt</label>
              <textarea value={motionPrompt} onChange={(e) => setMotionPrompt(e.target.value)}
                placeholder="Describe the action... e.g. The person turns to the camera and smiles"
                rows={4} className="w-full px-3 py-2.5 rounded-lg text-[14px] resize-none transition-colors"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
              />
            </div>

            {error && <div className="px-3 py-2 rounded-lg text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>{error}</div>}
            {success && <div className="px-3 py-2 rounded-lg text-[13px]" style={{ background: "rgba(34,197,94,0.1)", color: "var(--success)" }}>{success}</div>}

            <button onClick={handleGenerate} disabled={loading || !motionPrompt.trim()}
              className="w-full py-3 rounded-lg font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#3b82f6", color: "#fff" }}
            >
              {loading ? <><Spinner size={16} /> Starting...</> : <>Generate Video · {creditCost} credits</>}
            </button>
          </div>

          <div className="flex-1 p-4 md:p-6 overflow-y-auto">
            <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Your Videos</span>
            {loadingVideos ? (
              <div className="flex items-center justify-center py-12"><div className="spinner" /></div>
            ) : videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
                  <VideoIcon size={24} style={{ color: "var(--text-muted)" }} />
                </div>
                <p className="font-medium text-[14px] mb-1" style={{ color: "var(--text-secondary)" }}>No videos yet</p>
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Generate your first video using the panel on the left</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {videos.map((v) => (
                  <div key={v.job_id} className="rounded-xl overflow-hidden" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
                    {v.status === "completed" && v.video_url ? (
                      <video src={v.video_url} controls className="w-full aspect-video" />
                    ) : (
                      <div className="w-full aspect-video flex flex-col items-center justify-center gap-2" style={{ background: "var(--bg-tertiary)" }}>
                        {v.status === "processing" ? <><div className="spinner" /><span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Processing...</span></> : <span className="text-[12px]" style={{ color: "var(--error)" }}>Failed</span>}
                      </div>
                    )}
                    <div className="px-3 py-2 flex items-center justify-between">
                      <p className="text-[12px] truncate flex-1" style={{ color: "var(--text-secondary)" }}>{v.motion_prompt}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full ml-2 shrink-0"
                        style={{
                          background: v.status === "completed" ? "rgba(34,197,94,0.1)" : v.status === "processing" ? "rgba(255,255,255,0.05)" : "rgba(239,68,68,0.1)",
                          color: v.status === "completed" ? "var(--success)" : v.status === "processing" ? "var(--text-muted)" : "var(--error)",
                        }}
                      >
                        {v.engine} · {v.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
