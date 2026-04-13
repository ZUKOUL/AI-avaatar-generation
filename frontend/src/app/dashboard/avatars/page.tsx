"use client";

import { useState, useRef, useEffect } from "react";
import Header from "@/components/Header";
import { avatarAPI } from "@/lib/api";
import { Upload, SparkleIcon, XIcon, Spinner, ImageSquare, UserCircle } from "@/components/Icons";

interface Avatar {
  avatar_id: string;
  name: string;
  thumbnail: string;
  created_at: string;
}

export default function AvatarCreator() {
  const [prompt, setPrompt] = useState("");
  const [nickname, setNickname] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ image_url: string; nickname: string } | null>(null);
  const [error, setError] = useState("");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loadingAvatars, setLoadingAvatars] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAvatars(); }, []);

  const loadAvatars = async () => {
    try { const res = await avatarAPI.list(); setAvatars(res.data.avatars || []); }
    catch { /* silently fail */ }
    finally { setLoadingAvatars(false); }
  };

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles).slice(0, 5 - files.length);
    const updated = [...files, ...arr];
    setFiles(updated);
    setPreviews(updated.map((f) => URL.createObjectURL(f)));
  };

  const removeFile = (idx: number) => {
    const updated = files.filter((_, i) => i !== idx);
    setFiles(updated);
    setPreviews(updated.map((f) => URL.createObjectURL(f)));
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !nickname.trim()) return;
    setLoading(true); setError(""); setResult(null);
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("nickname", nickname);
    files.forEach((f) => formData.append("files", f));
    try {
      const res = await avatarAPI.generate(formData);
      setResult({ image_url: res.data.image_url, nickname: res.data.nickname });
      setPrompt(""); setNickname(""); setFiles([]); setPreviews([]);
      loadAvatars();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string | { message?: string } } } };
      const detail = e.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else if (detail && typeof detail === "object" && "message" in detail) setError(detail.message || "Generation failed");
      else setError("Generation failed. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <>
      <Header title="Avatar Creator" subtitle="Create photorealistic AI avatars" />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col md:flex-row h-full">
          {/* Left panel */}
          <div className="split-panel-left w-full md:w-[380px] shrink-0 p-4 md:p-5 overflow-y-auto flex flex-col gap-5">
            {/* Model tag */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
              <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "var(--text-primary)" }}>
                <SparkleIcon size={12} color="#000" />
              </div>
              <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Gemini 3 Pro Image</span>
            </div>

            {/* Reference images */}
            <div>
              <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-muted)" }}>References · {files.length}/5</label>
              <div className="flex gap-2 flex-wrap">
                {previews.map((url, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeFile(i)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <XIcon size={14} color="white" />
                    </button>
                  </div>
                ))}
                {files.length < 5 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors"
                    style={{ border: "1.5px dashed var(--border-color)", color: "var(--text-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#555")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                  >
                    <Upload size={16} /><span className="text-[10px]">Add</span>
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </div>

            {/* Nickname */}
            <div>
              <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-muted)" }}>Nickname</label>
              <input
                type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. Sarah, Product Expert..."
                maxLength={100}
                className="w-full px-3 py-2.5 rounded-lg text-[14px] transition-colors"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
              />
            </div>

            {/* Prompt */}
            <div className="flex-1">
              <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-muted)" }}>Prompt</label>
              <textarea
                value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your avatar... e.g. A professional woman in her 30s with a warm smile, wearing a navy blazer"
                rows={5}
                className="w-full px-3 py-2.5 rounded-lg text-[14px] resize-none transition-colors"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
              />
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>{error}</div>
            )}

            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim() || !nickname.trim()}
              className="w-full py-3 rounded-lg font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--text-primary)", color: "#000" }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = "0.9"; }}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {loading ? <><Spinner size={16} /> Generating...</> : <>Generate Avatar · 4 credits</>}
            </button>
          </div>

          {/* Right panel */}
          <div className="flex-1 p-4 md:p-6 overflow-y-auto">
            {result && (
              <div className="mb-8 animate-fadeIn">
                <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Just generated</span>
                <div className="inline-block rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-color)" }}>
                  <img src={result.image_url} alt={result.nickname} className="w-64 h-64 object-cover" />
                  <div className="px-3 py-2" style={{ background: "var(--bg-secondary)" }}>
                    <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{result.nickname}</span>
                  </div>
                </div>
              </div>
            )}

            <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Your Avatars</span>
            {loadingAvatars ? (
              <div className="flex items-center justify-center py-12"><div className="spinner" /></div>
            ) : avatars.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
                  <ImageSquare size={24} style={{ color: "var(--text-muted)" }} />
                </div>
                <p className="font-medium text-[14px] mb-1" style={{ color: "var(--text-secondary)" }}>No avatars yet</p>
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Create your first avatar using the panel on the left</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {avatars.map((avatar) => (
                  <div key={avatar.avatar_id} className="rounded-xl overflow-hidden group cursor-pointer transition-all hover:-translate-y-0.5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
                    {avatar.thumbnail ? (
                      <img src={avatar.thumbnail} alt={avatar.name} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center" style={{ background: "var(--bg-tertiary)" }}>
                        <UserCircle size={32} style={{ color: "var(--text-muted)" }} />
                      </div>
                    )}
                    <div className="px-3 py-2">
                      <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{avatar.name}</p>
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
