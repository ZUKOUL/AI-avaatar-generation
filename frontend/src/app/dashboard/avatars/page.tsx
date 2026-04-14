"use client";

import { useState, useRef, useEffect } from "react";
import Header from "@/components/Header";
import SegmentToggle from "@/components/SegmentToggle";
import { avatarAPI } from "@/lib/api";
import {
  Upload,
  XIcon,
  Spinner,
  UserCircle,
  SparkleIcon,
  ChevronDown,
  CaretLeft,
  CaretRight,
  Plus,
  ArrowRight,
  Download,
  MagicWand,
} from "@/components/Icons";

/* ═══════════════════════════════════════════════════════════════════
   Constants — Avatar customization options
   ═══════════════════════════════════════════════════════════════════ */

interface Avatar {
  avatar_id: string;
  name: string;
  thumbnail: string;
  created_at: string;
}

type LeftTab = "customize" | "library";
type RightTab = "design" | "details";

const GENDERS = [
  { value: "male", label: "Male", icon: "♂" },
  { value: "female", label: "Female", icon: "♀" },
];

const AGE_RANGES = ["20s", "30s", "40s", "50s", "60s+"];

const ETHNICITIES = [
  "Caucasian", "Black", "Asian", "Hispanic", "Middle Eastern",
  "South Asian", "Mixed", "Other",
];

const HAIR_STYLES = [
  "Short straight", "Short curly", "Medium wavy", "Long straight",
  "Long curly", "Buzz cut", "Bald", "Braids",
  "Ponytail", "Bob", "Afro", "Dreadlocks",
];

const HAIR_COLORS = [
  { label: "Black", color: "#1a1a1a" },
  { label: "Dark Brown", color: "#3d2314" },
  { label: "Brown", color: "#6b3a2a" },
  { label: "Light Brown", color: "#9a6b4c" },
  { label: "Blonde", color: "#d4a853" },
  { label: "Platinum", color: "#e8dcc8" },
  { label: "Red", color: "#8b2500" },
  { label: "Auburn", color: "#a0522d" },
  { label: "Gray", color: "#9e9e9e" },
  { label: "White", color: "#e8e8e8" },
];

const SKIN_TONES = [
  { label: "Fair", color: "#fde7d0" },
  { label: "Light", color: "#f5d0a9" },
  { label: "Medium light", color: "#dba97a" },
  { label: "Medium", color: "#c68642" },
  { label: "Medium dark", color: "#8d5524" },
  { label: "Dark", color: "#5c3310" },
  { label: "Deep", color: "#3b1f0b" },
];

const BODY_TYPES = ["Slim", "Athletic", "Average", "Muscular", "Plus-size"];

const STYLES = [
  { value: "photorealistic", label: "Photorealistic", desc: "Ultra-realistic photo" },
  { value: "cinematic", label: "Cinematic", desc: "Movie poster style" },
  { value: "corporate", label: "Corporate", desc: "Professional headshot" },
  { value: "artistic", label: "Artistic", desc: "Stylized portrait" },
];

const OUTFITS = [
  "Business suit", "Smart casual", "Casual", "Sporty",
  "Lab coat", "Military uniform", "Evening wear", "Streetwear",
];

const EXPRESSIONS = [
  "Smiling", "Neutral", "Serious", "Confident",
  "Friendly", "Thoughtful",
];

const BACKGROUNDS = [
  { value: "studio-white", label: "Studio White" },
  { value: "studio-gray", label: "Studio Gray" },
  { value: "office", label: "Office" },
  { value: "outdoor-nature", label: "Outdoor" },
  { value: "gradient", label: "Gradient" },
  { value: "solid-color", label: "Solid Color" },
];

/* ═══════════════════════════════════════════════════════════════════ */

export default function AvatarCreator() {
  /* ─── Panel tabs ─── */
  const [leftTab, setLeftTab] = useState<LeftTab>("customize");
  const [rightTab, setRightTab] = useState<RightTab>("design");

  /* ─── Character options (left panel) ─── */
  const [gender, setGender] = useState("female");
  const [age, setAge] = useState("30s");
  const [ethnicity, setEthnicity] = useState("Caucasian");
  const [hairStyle, setHairStyle] = useState("Long straight");
  const [hairColor, setHairColor] = useState("Dark Brown");
  const [skinTone, setSkinTone] = useState("Medium light");
  const [bodyType, setBodyType] = useState("Athletic");

  /* ─── Design options (right panel) ─── */
  const [style, setStyle] = useState("photorealistic");
  const [outfit, setOutfit] = useState("Smart casual");
  const [expression, setExpression] = useState("Confident");
  const [background, setBackground] = useState("studio-gray");

  /* ─── Core state ─── */
  const [customPrompt, setCustomPrompt] = useState("");
  const [nickname, setNickname] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedAvatars, setGeneratedAvatars] = useState<{ image_url: string; nickname: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loadingAvatars, setLoadingAvatars] = useState(true);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [model, setModel] = useState("gemini-3-pro");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadAvatars(); }, []);

  const loadAvatars = async () => {
    try {
      const res = await avatarAPI.list();
      setAvatars(res.data.avatars || []);
    } catch { /* silently fail */ }
    finally { setLoadingAvatars(false); }
  };

  /* ─── File handling ─── */
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

  /* ─── Build prompt from selections ─── */
  const buildPrompt = () => {
    const skinLabel = SKIN_TONES.find((s) => s.label === skinTone)?.label || skinTone;
    const styleLabel = STYLES.find((s) => s.value === style)?.desc || style;
    const bgLabel = BACKGROUNDS.find((b) => b.value === background)?.label || background;

    let prompt = `${styleLabel} portrait of a ${gender} in their ${age}, ${ethnicity} heritage. `;
    prompt += `${hairStyle} ${hairColor.toLowerCase()} hair, ${skinLabel.toLowerCase()} skin tone, ${bodyType.toLowerCase()} build. `;
    prompt += `Wearing ${outfit.toLowerCase()}. Expression: ${expression.toLowerCase()}. `;
    prompt += `Background: ${bgLabel.toLowerCase()}. `;
    prompt += `Shot on 85mm f/1.4 lens, shallow depth of field, natural lighting, ultra high detail, 8K quality.`;

    if (customPrompt.trim()) {
      prompt += ` Additional details: ${customPrompt.trim()}`;
    }

    return prompt;
  };

  /* ─── Generate ─── */
  const handleGenerate = async () => {
    const finalNickname = nickname.trim() || `Avatar-${Date.now().toString(36)}`;
    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("prompt", buildPrompt());
    formData.append("nickname", finalNickname);
    files.forEach((f) => formData.append("files", f));
    try {
      const res = await avatarAPI.generate(formData);
      const newAvatar = { image_url: res.data.image_url, nickname: res.data.nickname };
      setGeneratedAvatars((prev) => [newAvatar, ...prev]);
      setCurrentIndex(0);
      setNickname("");
      loadAvatars();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string | { message?: string; error?: string } } }; message?: string };
      const detail = e.response?.data?.detail;
      const status = e.response?.status;
      let msg = "";
      if (typeof detail === "string") msg = detail;
      else if (detail && typeof detail === "object") msg = detail.message || detail.error || JSON.stringify(detail);
      else if (e.message) msg = e.message;
      else msg = "Unknown error";
      setError(`[${status || "?"}] ${msg}`);
      console.error("Avatar generation error:", { status, detail, raw: err });
    } finally {
      setLoading(false);
    }
  };

  const currentAvatar = generatedAvatars[currentIndex] || null;

  /* ═══ Reusable sub-components ═══ */

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>{children}</span>
  );

  const ChipGrid = ({ items, selected, onSelect, cols = "grid-cols-3" }: { items: string[]; selected: string; onSelect: (v: string) => void; cols?: string }) => (
    <div className={`grid ${cols} gap-1.5`}>
      {items.map((item) => {
        const active = selected === item;
        return (
          <button
            key={item}
            onClick={() => onSelect(item)}
            className="px-2 py-1.5 rounded-lg text-[11px] font-medium text-center truncate"
            style={{
              background: active ? "var(--btn-raised-bg)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              border: active ? "1px solid var(--btn-raised-border)" : "1px solid var(--border-color)",
              boxShadow: active ? "var(--shadow-btn-raised)" : "none",
              fontWeight: active ? 600 : 400,
              transition: "background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, color 0.25s ease, transform 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
              } else {
                e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              } else {
                e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)";
              }
            }}
          >
            {item}
          </button>
        );
      })}
    </div>
  );

  const ColorSwatches = ({ items, selected, onSelect }: { items: { label: string; color: string }[]; selected: string; onSelect: (v: string) => void }) => (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = selected === item.label;
        return (
          <button
            key={item.label}
            onClick={() => onSelect(item.label)}
            className="w-7 h-7 rounded-full"
            style={{
              background: item.color,
              outline: active ? "2.5px solid var(--text-primary)" : "1px solid var(--border-color)",
              outlineOffset: active ? "2px" : "0px",
              transform: active ? "scale(1.1)" : "scale(1)",
              boxShadow: active ? "var(--shadow-btn-raised)" : "none",
              transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), outline 0.25s ease, box-shadow 0.25s ease",
            }}
            title={item.label}
          />
        );
      })}
    </div>
  );

  return (
    <>
      <Header title="Avatar Creator" subtitle="Design photorealistic AI avatars" />
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">

          {/* ═══ LEFT PANEL ═══ */}
          <div
            className="w-[280px] shrink-0 flex flex-col overflow-hidden hidden md:flex"
            style={{ borderRight: "1px solid var(--border-color)" }}
          >
            {/* Tab toggle */}
            <div className="px-3 pt-3 pb-2">
              <SegmentToggle
                items={[{ key: "customize", label: "Customize" }, { key: "library", label: "Library" }]}
                selected={leftTab}
                onSelect={(v) => setLeftTab(v as LeftTab)}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {leftTab === "customize" ? (
                <div className="space-y-5 pt-2">

                  {/* Gender */}
                  <div>
                    <SectionLabel>Gender</SectionLabel>
                    <div className="flex gap-2">
                      {GENDERS.map((g) => {
                        const active = gender === g.value;
                        return (
                          <button
                            key={g.value}
                            onClick={() => setGender(g.value)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px]"
                            style={{
                              background: active ? "var(--btn-raised-bg)" : "transparent",
                              color: active ? "var(--text-primary)" : "var(--text-secondary)",
                              border: active ? "1px solid var(--btn-raised-border)" : "1px solid var(--border-color)",
                              boxShadow: active ? "var(--shadow-btn-raised)" : "none",
                              fontWeight: active ? 600 : 400,
                              transition: "background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, color 0.25s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (!active) {
                                e.currentTarget.style.background = "var(--bg-hover)";
                                e.currentTarget.style.color = "var(--text-primary)";
                              } else {
                                e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!active) {
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.color = "var(--text-secondary)";
                              } else {
                                e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)";
                              }
                            }}
                          >
                            <span className="text-[16px]">{g.icon}</span>
                            {g.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Age */}
                  <div>
                    <SectionLabel>Age Range</SectionLabel>
                    <ChipGrid items={AGE_RANGES} selected={age} onSelect={setAge} cols="grid-cols-5" />
                  </div>

                  {/* Ethnicity */}
                  <div>
                    <SectionLabel>Ethnicity</SectionLabel>
                    <ChipGrid items={ETHNICITIES} selected={ethnicity} onSelect={setEthnicity} cols="grid-cols-2" />
                  </div>

                  {/* Hair Style */}
                  <div>
                    <SectionLabel>Hair Style</SectionLabel>
                    <ChipGrid items={HAIR_STYLES} selected={hairStyle} onSelect={setHairStyle} cols="grid-cols-2" />
                  </div>

                  {/* Hair Color */}
                  <div>
                    <SectionLabel>Hair Color</SectionLabel>
                    <ColorSwatches items={HAIR_COLORS} selected={hairColor} onSelect={setHairColor} />
                    <span className="text-[10px] mt-1.5 block" style={{ color: "var(--text-muted)" }}>{hairColor}</span>
                  </div>

                  {/* Skin Tone */}
                  <div>
                    <SectionLabel>Skin Tone</SectionLabel>
                    <ColorSwatches items={SKIN_TONES} selected={skinTone} onSelect={setSkinTone} />
                    <span className="text-[10px] mt-1.5 block" style={{ color: "var(--text-muted)" }}>{skinTone}</span>
                  </div>

                  {/* Body Type */}
                  <div>
                    <SectionLabel>Body Type</SectionLabel>
                    <ChipGrid items={BODY_TYPES} selected={bodyType} onSelect={setBodyType} cols="grid-cols-3" />
                  </div>

                  {/* Reference Images */}
                  <div>
                    <SectionLabel>Reference Photos · {files.length}/5</SectionLabel>
                    <div className="flex gap-2 flex-wrap">
                      {previews.map((url, i) => (
                        <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden group">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => removeFile(i)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <XIcon size={12} color="white" />
                          </button>
                        </div>
                      ))}
                      {files.length < 5 && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-14 h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors"
                          style={{ border: "1.5px dashed var(--border-color)", color: "var(--text-muted)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--text-secondary)")}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                        >
                          <Upload size={14} />
                          <span className="text-[9px]">Add</span>
                        </button>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                  </div>
                </div>
              ) : (
                /* ─── Library tab ─── */
                <div className="pt-2">
                  {loadingAvatars ? (
                    <div className="flex items-center justify-center py-12"><Spinner size={18} /></div>
                  ) : avatars.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <UserCircle size={28} style={{ color: "var(--text-muted)" }} />
                      <p className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>No avatars yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {avatars.map((av) => (
                        <div
                          key={av.avatar_id}
                          className="rounded-xl overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5"
                          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
                        >
                          {av.thumbnail ? (
                            <img src={av.thumbnail} alt={av.name} className="w-full aspect-square object-cover" />
                          ) : (
                            <div className="w-full aspect-square flex items-center justify-center" style={{ background: "var(--bg-tertiary)" }}>
                              <UserCircle size={24} style={{ color: "var(--text-muted)" }} />
                            </div>
                          )}
                          <div className="px-2 py-1.5">
                            <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{av.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══ CENTER PANEL ═══ */}
          <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--bg-primary)" }}>

            {/* Preview area */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden" style={{ background: "var(--bg-secondary)" }}>
              {loading ? (
                <div className="relative w-full h-full flex items-center justify-center p-8">
                  <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden animate-fadeIn" style={{ background: "var(--bg-tertiary)", boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}>
                    <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "linear-gradient(90deg, transparent 25%, var(--skeleton-shimmer) 50%, transparent 75%)", animation: "shimmerSweep 2s ease-in-out infinite" }} />
                    <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "linear-gradient(to top, var(--skeleton-fill-start) 0%, var(--skeleton-fill-mid) 50%, var(--skeleton-fill-end) 90%, transparent 100%)", transform: "translateY(100%)", animation: "fillRise 25s ease-out forwards" }}>
                      <svg style={{ position: "absolute", top: -10, left: 0, width: "200%", height: 20, animation: "waveSlide 3s linear infinite", color: "var(--skeleton-wave)" }} viewBox="0 0 240 20" fill="none" preserveAspectRatio="none">
                        <path d="M0 10 Q15 0 30 10 Q45 20 60 10 Q75 0 90 10 Q105 20 120 10 Q135 0 150 10 Q165 20 180 10 Q195 0 210 10 Q225 20 240 10 L240 20 L0 20Z" fill="currentColor" />
                      </svg>
                    </div>
                    <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                      <div className="spinner" />
                      <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Generating avatar...</p>
                    </div>
                  </div>
                </div>
              ) : currentAvatar ? (
                <div className="relative w-full h-full flex items-center justify-center p-6">
                  <img
                    src={currentAvatar.image_url}
                    alt={currentAvatar.nickname}
                    className="max-w-full max-h-full object-contain rounded-2xl"
                    style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}
                  />
                  {/* Download button */}
                  <a
                    href={currentAvatar.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-4 right-4 p-2 rounded-lg transition-colors"
                    style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}
                  >
                    <Download size={16} />
                  </a>
                </div>
              ) : (
                <div className="relative w-full h-full flex items-end justify-center overflow-hidden">
                  {/* Chrome mannequin placeholder — sits on the bottom line
                      so the bust crops cleanly against the container edge
                      instead of floating centered with a half-cut chest. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/avatar-mannequin.png"
                    alt=""
                    className="max-h-[95%] w-auto object-contain"
                    style={{ filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.35))" }}
                  />
                </div>
              )}

              {/* Navigation dots */}
              {generatedAvatars.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.5)" }}>
                  <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0} className="text-white disabled:opacity-30">
                    <CaretLeft size={14} />
                  </button>
                  {generatedAvatars.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentIndex(i)}
                      className="w-1.5 h-4 rounded-full transition-all"
                      style={{ background: i === currentIndex ? "#fff" : "rgba(255,255,255,0.35)", width: i === currentIndex ? "3px" : "2px" }}
                    />
                  ))}
                  <button onClick={() => setCurrentIndex(Math.min(generatedAvatars.length - 1, currentIndex + 1))} disabled={currentIndex === generatedAvatars.length - 1} className="text-white disabled:opacity-30">
                    <CaretRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-2" style={{ background: "rgba(239,68,68,0.1)" }}>
                <p className="text-[12px] font-medium" style={{ color: "var(--error)" }}>{error}</p>
              </div>
            )}

            {/* Bottom prompt bar */}
            <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border-color)" }}>
              {/* Nickname */}
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Avatar name (e.g. Sarah, Marcus...)"
                  maxLength={50}
                  className="flex-1 px-3 py-2 rounded-lg text-[13px]"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                />
              </div>
              {/* Prompt + actions */}
              <div
                className="flex items-end gap-2 rounded-xl px-3 py-2"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
              >
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-lg shrink-0 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  title="Add reference image"
                >
                  <Plus size={18} />
                </button>
                <textarea
                  ref={promptRef}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
                  }}
                  placeholder="Add custom details about your avatar..."
                  rows={1}
                  className="flex-1 text-[13px] resize-none bg-transparent py-1"
                  style={{ color: "var(--text-primary)", outline: "none", border: "none", minHeight: "24px", maxHeight: "80px" }}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "24px";
                    t.style.height = Math.min(t.scrollHeight, 80) + "px";
                  }}
                />
                {/* Model selector */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}
                  >
                    <MagicWand size={12} />
                    {model === "gemini-3-pro" ? "Gemini 3 Pro" : "Nano Banana"}
                    <ChevronDown size={10} />
                  </button>
                  {showModelDropdown && (
                    <div className="absolute bottom-full mb-1 right-0 w-44 rounded-lg py-1 z-50" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                      {[{ id: "gemini-3-pro", name: "Gemini 3 Pro Image" }, { id: "nano-banana-pro", name: "Nano Banana Pro" }].map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { setModel(m.id); setShowModelDropdown(false); }}
                          className="w-full text-left px-3 py-1.5 text-[12px] transition-colors"
                          style={{ color: model === m.id ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: model === m.id ? 600 : 400 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="p-2 rounded-lg shrink-0 transition-all disabled:opacity-40"
                  style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
                  title="Generate avatar"
                >
                  {loading ? <Spinner size={16} /> : <ArrowRight size={16} />}
                </button>
              </div>
              <p className="text-[10px] mt-1.5 text-center" style={{ color: "var(--text-muted)" }}>
                5 credits per generation
              </p>
            </div>
          </div>

          {/* ═══ RIGHT PANEL ═══ */}
          <div
            className="w-[260px] shrink-0 flex flex-col overflow-hidden hidden lg:flex"
            style={{ borderLeft: "1px solid var(--border-color)" }}
          >
            {/* Tab toggle */}
            <div className="px-3 pt-3 pb-2">
              <SegmentToggle
                items={[{ key: "design", label: "Design" }, { key: "details", label: "Details" }]}
                selected={rightTab}
                onSelect={(v) => setRightTab(v as RightTab)}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {rightTab === "design" ? (
                <div className="space-y-5 pt-2">

                  {/* Style */}
                  <div>
                    <SectionLabel>Style</SectionLabel>
                    <div className="space-y-1.5">
                      {STYLES.map((s) => {
                        const active = style === s.value;
                        return (
                          <button
                            key={s.value}
                            onClick={() => setStyle(s.value)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                            style={{
                              background: active ? "var(--btn-raised-bg)" : "transparent",
                              border: active ? "1px solid var(--btn-raised-border)" : "1px solid var(--border-color)",
                              boxShadow: active ? "var(--shadow-btn-raised)" : "none",
                              transition: "background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (!active) e.currentTarget.style.background = "var(--bg-hover)";
                              else e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)";
                            }}
                            onMouseLeave={(e) => {
                              if (!active) e.currentTarget.style.background = "transparent";
                              else e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)";
                            }}
                          >
                            <div>
                              <span className="text-[12px] block" style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: active ? 600 : 500 }}>{s.label}</span>
                              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.desc}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Outfit */}
                  <div>
                    <SectionLabel>Outfit</SectionLabel>
                    <ChipGrid items={OUTFITS} selected={outfit} onSelect={setOutfit} cols="grid-cols-2" />
                  </div>

                  {/* Expression */}
                  <div>
                    <SectionLabel>Expression</SectionLabel>
                    <ChipGrid items={EXPRESSIONS} selected={expression} onSelect={setExpression} cols="grid-cols-2" />
                  </div>

                  {/* Background */}
                  <div>
                    <SectionLabel>Background</SectionLabel>
                    <div className="grid grid-cols-2 gap-1.5">
                      {BACKGROUNDS.map((bg) => {
                        const active = background === bg.value;
                        return (
                          <button
                            key={bg.value}
                            onClick={() => setBackground(bg.value)}
                            className="px-2 py-1.5 rounded-lg text-[11px] text-center"
                            style={{
                              background: active ? "var(--btn-raised-bg)" : "transparent",
                              color: active ? "var(--text-primary)" : "var(--text-secondary)",
                              border: active ? "1px solid var(--btn-raised-border)" : "1px solid var(--border-color)",
                              boxShadow: active ? "var(--shadow-btn-raised)" : "none",
                              fontWeight: active ? 600 : 400,
                              transition: "background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, color 0.25s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (!active) {
                                e.currentTarget.style.background = "var(--bg-hover)";
                                e.currentTarget.style.color = "var(--text-primary)";
                              } else {
                                e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!active) {
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.color = "var(--text-secondary)";
                              } else {
                                e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)";
                              }
                            }}
                          >
                            {bg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* ─── Details tab ─── */
                <div className="space-y-5 pt-2">
                  {/* Generated prompt preview */}
                  <div>
                    <SectionLabel>Generated Prompt</SectionLabel>
                    <div
                      className="rounded-xl p-3 text-[11px] leading-relaxed"
                      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}
                    >
                      {buildPrompt()}
                    </div>
                  </div>

                  {/* Current selections summary */}
                  <div>
                    <SectionLabel>Current Selections</SectionLabel>
                    <div className="space-y-1.5">
                      {[
                        ["Gender", gender],
                        ["Age", age],
                        ["Ethnicity", ethnicity],
                        ["Hair", `${hairStyle}, ${hairColor}`],
                        ["Skin", skinTone],
                        ["Build", bodyType],
                        ["Style", STYLES.find((s) => s.value === style)?.label || style],
                        ["Outfit", outfit],
                        ["Expression", expression],
                        ["Background", BACKGROUNDS.find((b) => b.value === background)?.label || background],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between px-2 py-1">
                          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</span>
                          <span className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent generations */}
                  {generatedAvatars.length > 0 && (
                    <div>
                      <SectionLabel>Recent Generations</SectionLabel>
                      <div className="grid grid-cols-2 gap-2">
                        {generatedAvatars.slice(0, 6).map((av, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentIndex(i)}
                            className="rounded-lg overflow-hidden transition-all"
                            style={{
                              border: i === currentIndex ? "2px solid var(--text-primary)" : "1px solid var(--border-color)",
                            }}
                          >
                            <img src={av.image_url} alt={av.nickname} className="w-full aspect-square object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
