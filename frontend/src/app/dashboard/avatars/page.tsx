"use client";

/**
 * Avatar Creator — Higgsfield-style studio layout.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Header                                                              │
 * ├──────────────┬──────────────────────────────────┬───────────────────┤
 * │              │                                  │  Builder │ Prompt │
 * │  + New       │        [ preview canvas ]        │  ──────────────── │
 * │  ─────       │                                  │  ▸ Character Type │
 * │  avatar      │                                  │  ▾ Gender         │
 * │  history     │        [ tag chips row ]         │      [ tiles ]    │
 * │              │        [ Generate button ]       │  ▸ Ethnicity      │
 * │              │                                  │  ▸ Skin Color     │
 * │              │                                  │  ▸ Hair, …        │
 * └──────────────┴──────────────────────────────────┴───────────────────┘
 *
 * Goals (from design feedback):
 *   - No wall of text; all choices are tiles, icons, or swatches.
 *   - Right panel collapses sections so only the one you're editing is open.
 *   - Left panel is the avatar "library" — click a card to load it as the
 *     current preview; the form stays where it is so you can iterate on a
 *     variation and Generate again.
 *   - Generate action lives at the bottom of the canvas so the eye follows
 *     Pick options → See preview → Generate.
 */

import { useState, useRef, useEffect } from "react";
import Header from "@/components/Header";
import { avatarAPI } from "@/lib/api";
import {
  XIcon,
  Spinner,
  UserCircle,
  ChevronDown,
  Plus,
  Download,
  MagicWand,
  SparkleIcon,
  RefreshCw,
  Check,
  Upload,
  Globe,
  Palette,
  Eye,
  Scissors,
  Droplets,
  Brush,
  Calendar,
  User,
  FaceSmile,
  ImageSquare,
  Camera,
  Heart,
} from "@/components/Icons";

type IconComp = React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;

/* ═══════════════════════════════════════════════════════════════════
   Option catalogues
   ═══════════════════════════════════════════════════════════════════ */

interface Avatar {
  avatar_id: string;
  name: string;
  thumbnail: string;
  created_at: string;
}

type RightTab = "builder" | "prompt";

interface IconTile {
  value: string;
  label: string;
  glyph: string; // Unicode or short symbol
}

interface PortraitTile {
  value: string;
  label: string;
  imageUrl: string; // Unsplash portrait URL
  gradient: string; // Fallback gradient if image fails to load
}

interface SwatchTile {
  value: string;
  color: string;
}

const CHARACTER_TYPES: IconTile[] = [
  { value: "human", label: "Human", glyph: "🧑" },
  { value: "stylized", label: "Stylized", glyph: "✨" },
];

const GENDERS: IconTile[] = [
  { value: "female", label: "Female", glyph: "♀" },
  { value: "male", label: "Male", glyph: "♂" },
  { value: "non-binary", label: "Non-binary", glyph: "⚪" },
];

const AGE_RANGES: IconTile[] = [
  { value: "20s", label: "20s", glyph: "" },
  { value: "30s", label: "30s", glyph: "" },
  { value: "40s", label: "40s", glyph: "" },
  { value: "50s", label: "50s", glyph: "" },
  { value: "60s+", label: "60s+", glyph: "" },
];

// Portrait reference tiles — Higgsfield-style. Each ethnicity shows a real
// portrait photo as a visual anchor (Unsplash stock photography, free license).
// The gradient is a fallback for the brief load window or if an image fails.
const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=300&h=400&fit=crop&auto=format&q=75`;

const ETHNICITIES: PortraitTile[] = [
  {
    value: "African",
    label: "African",
    imageUrl: UNSPLASH("1531123897727-8f129e1688ce"),
    gradient: "linear-gradient(135deg, #5a3a1f, #8b5a2b)",
  },
  {
    value: "Asian",
    label: "Asian",
    imageUrl: UNSPLASH("1507003211169-0a1dd7228f2d"),
    gradient: "linear-gradient(135deg, #e8c79a, #c69b6d)",
  },
  {
    value: "European",
    label: "European",
    imageUrl: UNSPLASH("1494790108377-be9c29b29330"),
    gradient: "linear-gradient(135deg, #f2d3a6, #d9b07e)",
  },
  {
    value: "Hispanic",
    label: "Hispanic",
    imageUrl: UNSPLASH("1617922001439-4a2e6562f328"),
    gradient: "linear-gradient(135deg, #c48a4c, #9a6a36)",
  },
  {
    value: "Middle Eastern",
    label: "Middle Eastern",
    imageUrl: UNSPLASH("1544005313-94ddf0286df2"),
    gradient: "linear-gradient(135deg, #b07b45, #7c5128)",
  },
  {
    value: "South Asian",
    label: "South Asian",
    imageUrl: UNSPLASH("1592621385612-4d7129426394"),
    gradient: "linear-gradient(135deg, #a56a34, #6f4720)",
  },
  {
    value: "Mixed",
    label: "Mixed",
    imageUrl: UNSPLASH("1524504388940-b1c1722653e1"),
    gradient: "linear-gradient(135deg, #c68a5c, #7d4f2b)",
  },
];

const SKIN_TONES: SwatchTile[] = [
  { value: "Fair", color: "#fde7d0" },
  { value: "Light", color: "#f5d0a9" },
  { value: "Medium light", color: "#dba97a" },
  { value: "Medium", color: "#c68642" },
  { value: "Medium dark", color: "#8d5524" },
  { value: "Dark", color: "#5c3310" },
  { value: "Deep", color: "#3b1f0b" },
];

const EYE_COLORS: SwatchTile[] = [
  { value: "Brown", color: "#5a3b22" },
  { value: "Hazel", color: "#8b6a3a" },
  { value: "Green", color: "#2f6b3c" },
  { value: "Blue", color: "#2f6fa8" },
  { value: "Gray", color: "#8b8b8b" },
  { value: "Black", color: "#1b1b1b" },
];

const HAIR_LENGTHS: IconTile[] = [
  { value: "Buzz", label: "Buzz", glyph: "" },
  { value: "Short", label: "Short", glyph: "" },
  { value: "Medium", label: "Medium", glyph: "" },
  { value: "Long", label: "Long", glyph: "" },
  { value: "Bald", label: "Bald", glyph: "" },
];

const HAIR_STYLES: IconTile[] = [
  { value: "Straight", label: "Straight", glyph: "" },
  { value: "Wavy", label: "Wavy", glyph: "" },
  { value: "Curly", label: "Curly", glyph: "" },
  { value: "Braids", label: "Braids", glyph: "" },
  { value: "Ponytail", label: "Ponytail", glyph: "" },
  { value: "Afro", label: "Afro", glyph: "" },
];

const HAIR_COLORS: SwatchTile[] = [
  { value: "Black", color: "#1a1a1a" },
  { value: "Dark Brown", color: "#3d2314" },
  { value: "Brown", color: "#6b3a2a" },
  { value: "Light Brown", color: "#9a6b4c" },
  { value: "Blonde", color: "#d4a853" },
  { value: "Platinum", color: "#e8dcc8" },
  { value: "Red", color: "#8b2500" },
  { value: "Auburn", color: "#a0522d" },
  { value: "Gray", color: "#9e9e9e" },
  { value: "White", color: "#e8e8e8" },
];

const BODY_TYPES: IconTile[] = [
  { value: "Slim", label: "Slim", glyph: "" },
  { value: "Athletic", label: "Athletic", glyph: "" },
  { value: "Average", label: "Average", glyph: "" },
  { value: "Muscular", label: "Muscular", glyph: "" },
  { value: "Plus-size", label: "Plus-size", glyph: "" },
];

const OUTFITS: IconTile[] = [
  { value: "Business suit", label: "Business", glyph: "" },
  { value: "Smart casual", label: "Smart casual", glyph: "" },
  { value: "Casual", label: "Casual", glyph: "" },
  { value: "Sporty", label: "Sporty", glyph: "" },
  { value: "Evening wear", label: "Evening", glyph: "" },
  { value: "Streetwear", label: "Streetwear", glyph: "" },
];

const EXPRESSIONS: IconTile[] = [
  { value: "Smiling", label: "Smiling", glyph: "😊" },
  { value: "Neutral", label: "Neutral", glyph: "😐" },
  { value: "Confident", label: "Confident", glyph: "😎" },
  { value: "Serious", label: "Serious", glyph: "🙂" },
  { value: "Thoughtful", label: "Thoughtful", glyph: "🤔" },
];

const BACKGROUNDS: IconTile[] = [
  { value: "studio-white", label: "Studio White", glyph: "⬜" },
  { value: "studio-gray", label: "Studio Gray", glyph: "◻️" },
  { value: "office", label: "Office", glyph: "🏢" },
  { value: "outdoor-nature", label: "Outdoor", glyph: "🌿" },
  { value: "gradient", label: "Gradient", glyph: "🎨" },
];

const STYLES: IconTile[] = [
  { value: "photorealistic", label: "Photoreal", glyph: "" },
  { value: "cinematic", label: "Cinematic", glyph: "" },
  { value: "corporate", label: "Corporate", glyph: "" },
  { value: "artistic", label: "Artistic", glyph: "" },
];

/* ═══════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════ */

export default function AvatarCreator() {
  /* ─── Selections ─── */
  const [characterType, setCharacterType] = useState("human");
  const [gender, setGender] = useState("female");
  const [age, setAge] = useState("30s");
  const [ethnicity, setEthnicity] = useState("European");
  const [skinTone, setSkinTone] = useState("Medium light");
  const [eyeColor, setEyeColor] = useState("Brown");
  const [hairLength, setHairLength] = useState("Medium");
  const [hairStyle, setHairStyle] = useState("Straight");
  const [hairColor, setHairColor] = useState("Dark Brown");
  const [bodyType, setBodyType] = useState("Athletic");
  const [outfit, setOutfit] = useState("Smart casual");
  const [expression, setExpression] = useState("Confident");
  const [background, setBackground] = useState("studio-white");
  const [style, setStyle] = useState("photorealistic");

  /* ─── UI state ─── */
  const [rightTab, setRightTab] = useState<RightTab>("builder");
  const [openSection, setOpenSection] = useState<string | null>("gender");
  const [nickname, setNickname] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Single preview slot — clicking a library card or generating REPLACES it;
  // there's no queue/carousel. Set to null to return to the empty canvas.
  const [previewAvatar, setPreviewAvatar] = useState<
    { image_url: string; nickname: string } | null
  >(null);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loadingAvatars, setLoadingAvatars] = useState(true);
  const [model, setModel] = useState("gemini-3-pro");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAvatars();
  }, []);

  const loadAvatars = async () => {
    try {
      const res = await avatarAPI.list();
      setAvatars(res.data.avatars || []);
    } catch {
      /* silently fail */
    } finally {
      setLoadingAvatars(false);
    }
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

  /* ─── Prompt synthesis ─── */
  const buildPrompt = () => {
    const styleLabel = STYLES.find((s) => s.value === style)?.label || style;
    const bgLabel = BACKGROUNDS.find((b) => b.value === background)?.label || background;

    const bgPhrase =
      background === "studio-white"
        ? "Pure white studio background (#FFFFFF), seamless, evenly lit, no shadows on the backdrop, passport-photo / ID-card style isolation"
        : `Background: ${bgLabel.toLowerCase()}`;

    let prompt = `${styleLabel.toLowerCase()} portrait of a ${gender} in their ${age}, ${ethnicity} heritage. `;
    prompt += `${hairLength} ${hairStyle.toLowerCase()} ${hairColor.toLowerCase()} hair, ${skinTone.toLowerCase()} skin tone, ${eyeColor.toLowerCase()} eyes, ${bodyType.toLowerCase()} build. `;
    prompt += `Wearing ${outfit.toLowerCase()}. Expression: ${expression.toLowerCase()}. `;
    prompt += `${bgPhrase}. `;
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
      setPreviewAvatar({ image_url: res.data.image_url, nickname: res.data.nickname });
      setNickname("");
      loadAvatars();
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { detail?: string | { message?: string; error?: string } } };
        message?: string;
      };
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

  // Tag chips summarize the current selection for the canvas footer.
  const tagChips = [
    CHARACTER_TYPES.find((c) => c.value === characterType)?.label,
    GENDERS.find((g) => g.value === gender)?.label,
    ethnicity,
    skinTone,
    hairColor,
    age,
  ].filter(Boolean) as string[];

  return (
    <>
      <Header title="Avatar Creator" subtitle="Design photorealistic AI avatars" />
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* ═══ LEFT — Library ═══ */}
          <LibraryPanel
            avatars={avatars}
            loading={loadingAvatars}
            previewAvatar={previewAvatar}
            onSelectAvatar={(av) => {
              // Clicking a library card REPLACES the current preview — no queue.
              setPreviewAvatar({ image_url: av.thumbnail, nickname: av.name });
            }}
          />

          {/* ═══ CENTER — Canvas ═══ */}
          <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--bg-primary)" }}>
            <Canvas
              loading={loading}
              previewAvatar={previewAvatar}
              onClearPreview={() => setPreviewAvatar(null)}
              onDropAvatar={(av) => {
                // Dragged from library → replaces preview, same as click.
                setPreviewAvatar({ image_url: av.thumbnail, nickname: av.name });
              }}
              tags={tagChips}
              onShuffle={() => {
                // Randomize the four most-visual choices to suggest a variation.
                const rand = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
                setGender(rand(GENDERS).value);
                setEthnicity(rand(ETHNICITIES).value);
                setSkinTone(rand(SKIN_TONES).value);
                setHairColor(rand(HAIR_COLORS).value);
              }}
              onGenerate={handleGenerate}
              generateDisabled={loading}
            />

            {error && (
              <div className="px-4 py-2 shrink-0" style={{ background: "rgba(239,68,68,0.1)" }}>
                <p className="text-[12px] font-medium" style={{ color: "var(--error)" }}>
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* ═══ RIGHT — Builder ═══ */}
          <BuilderPanel
            rightTab={rightTab}
            setRightTab={setRightTab}
            openSection={openSection}
            setOpenSection={setOpenSection}
            /* selections */
            characterType={characterType}
            setCharacterType={setCharacterType}
            gender={gender}
            setGender={setGender}
            age={age}
            setAge={setAge}
            ethnicity={ethnicity}
            setEthnicity={setEthnicity}
            skinTone={skinTone}
            setSkinTone={setSkinTone}
            eyeColor={eyeColor}
            setEyeColor={setEyeColor}
            hairLength={hairLength}
            setHairLength={setHairLength}
            hairStyle={hairStyle}
            setHairStyle={setHairStyle}
            hairColor={hairColor}
            setHairColor={setHairColor}
            bodyType={bodyType}
            setBodyType={setBodyType}
            outfit={outfit}
            setOutfit={setOutfit}
            expression={expression}
            setExpression={setExpression}
            background={background}
            setBackground={setBackground}
            style={style}
            setStyle={setStyle}
            /* custom prompt */
            customPrompt={customPrompt}
            setCustomPrompt={setCustomPrompt}
            buildPrompt={buildPrompt}
            /* nickname + refs */
            nickname={nickname}
            setNickname={setNickname}
            previews={previews}
            files={files}
            removeFile={removeFile}
            onAddFilesClick={() => fileInputRef.current?.click()}
            /* model */
            model={model}
            setModel={setModel}
            showModelDropdown={showModelDropdown}
            setShowModelDropdown={setShowModelDropdown}
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Library panel — left rail
   ═══════════════════════════════════════════════════════════════════ */

function LibraryPanel({
  avatars,
  loading,
  previewAvatar,
  onSelectAvatar,
}: {
  avatars: Avatar[];
  loading: boolean;
  previewAvatar: { image_url: string; nickname: string } | null;
  onSelectAvatar: (av: Avatar) => void;
}) {
  return (
    <aside
      className="w-[180px] shrink-0 flex-col overflow-hidden hidden md:flex"
      style={{ borderRight: "1px solid var(--border-color)", background: "var(--bg-secondary)" }}
    >
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <SparkleIcon size={11} />
          AI Influencer Studio
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {/* Create new tile */}
        <button
          onClick={() => {
            // Scroll to top of canvas — the right panel already holds the form.
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="w-full aspect-[3/4] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all"
          style={{
            border: "1.5px dashed var(--border-color)",
            color: "var(--text-secondary)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--text-primary)";
            e.currentTarget.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <Plus size={18} />
          <span className="text-[11px] font-medium">Create new</span>
        </button>

        {/* History */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner size={14} />
          </div>
        ) : avatars.length === 0 ? (
          <p className="text-[10px] text-center mt-3" style={{ color: "var(--text-muted)" }}>
            Your avatars will appear here
          </p>
        ) : (
          avatars.map((av) => (
            <button
              key={av.avatar_id}
              onClick={() => onSelectAvatar(av)}
              draggable
              onDragStart={(e) => {
                // Canvas onDrop reads this payload to load the dragged avatar.
                const payload = JSON.stringify({
                  avatar_id: av.avatar_id,
                  name: av.name,
                  thumbnail: av.thumbnail,
                });
                e.dataTransfer.setData("application/x-horpen-avatar", payload);
                e.dataTransfer.setData("text/plain", av.thumbnail);
                e.dataTransfer.effectAllowed = "copy";
              }}
              title="Click or drag to canvas"
              className="w-full aspect-[3/4] relative rounded-xl overflow-hidden transition-all cursor-grab active:cursor-grabbing"
              style={{
                border:
                  previewAvatar?.image_url === av.thumbnail
                    ? "2px solid var(--text-primary)"
                    : "1px solid var(--border-color)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.18)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {av.thumbnail ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={av.thumbnail} alt={av.name} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <UserCircle size={28} style={{ color: "var(--text-muted)" }} />
                </div>
              )}
              <div
                className="absolute inset-x-0 bottom-0 px-2 py-1.5"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 70%, transparent 100%)",
                }}
              >
                <p className="text-white text-[11px] font-semibold truncate">{av.name}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Canvas — center preview + generate button
   ═══════════════════════════════════════════════════════════════════ */

function Canvas({
  loading,
  previewAvatar,
  onClearPreview,
  onDropAvatar,
  tags,
  onShuffle,
  onGenerate,
  generateDisabled,
}: {
  loading: boolean;
  previewAvatar: { image_url: string; nickname: string } | null;
  onClearPreview: () => void;
  onDropAvatar: (av: Avatar) => void;
  tags: string[];
  onShuffle: () => void;
  onGenerate: () => void;
  generateDisabled: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-horpen-avatar")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear when leaving the drop zone itself, not a child element.
    if (e.currentTarget === e.target) setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const raw = e.dataTransfer.getData("application/x-horpen-avatar");
    if (!raw) return;
    try {
      const av = JSON.parse(raw) as Avatar;
      onDropAvatar(av);
    } catch {
      /* ignore malformed payload */
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Preview canvas */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--bg-secondary) 0%, var(--bg-primary) 100%)",
          // Subtle grid like Higgsfield's studio canvas.
          backgroundImage: `
            linear-gradient(var(--border-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-color) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
          backgroundPosition: "center",
          outline: isDragOver ? "2px dashed var(--text-primary)" : "none",
          outlineOffset: "-8px",
          transition: "outline 0.15s ease",
        }}
      >
        {loading ? (
          <div className="relative w-full max-w-[360px] aspect-[3/4] rounded-2xl overflow-hidden animate-fadeIn mx-4"
            style={{ background: "var(--bg-tertiary)", boxShadow: "0 8px 40px rgba(0,0,0,0.25)" }}>
            <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "linear-gradient(90deg, transparent 25%, var(--skeleton-shimmer) 50%, transparent 75%)", animation: "shimmerSweep 2s ease-in-out infinite" }} />
            <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div className="spinner" />
              <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Generating avatar…</p>
            </div>
          </div>
        ) : previewAvatar ? (
          <div className="relative max-w-[380px] w-full mx-6">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.25)", background: "var(--bg-tertiary)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewAvatar.image_url}
                alt={previewAvatar.nickname}
                className="w-full h-auto object-contain"
              />
            </div>
            {/* Clear (X) — top-left, returns to empty canvas */}
            <button
              onClick={onClearPreview}
              aria-label="Clear preview"
              className="absolute top-3 left-3 p-2 rounded-lg transition-colors"
              style={{ background: "rgba(0,0,0,0.55)", color: "#fff", backdropFilter: "blur(6px)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.75)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.55)")}
            >
              <XIcon size={15} />
            </button>
            {/* Download — top-right */}
            <a
              href={previewAvatar.image_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download"
              className="absolute top-3 right-3 p-2 rounded-lg transition-colors"
              style={{ background: "rgba(0,0,0,0.55)", color: "#fff", backdropFilter: "blur(6px)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.75)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.55)")}
            >
              <Download size={15} />
            </a>
          </div>
        ) : (
          <EmptyState dragActive={isDragOver} />
        )}
      </div>

      {/* Footer: tags + generate */}
      <div
        className="shrink-0 px-6 py-4 flex flex-col items-center gap-3"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        {/* Tag summary */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[640px]">
          {tags.map((t) => (
            <span
              key={t}
              className="text-[11px] px-2.5 py-1 rounded-full"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* Shuffle + Generate */}
        <div className="flex items-center gap-2 w-full max-w-[520px]">
          <button
            onClick={onShuffle}
            className="w-11 h-11 flex items-center justify-center rounded-xl transition-all"
            style={{
              background: "var(--btn-raised-bg)",
              border: "1px solid var(--btn-raised-border)",
              boxShadow: "var(--shadow-btn-raised)",
              color: "var(--text-secondary)",
            }}
            title="Randomize selection"
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)")}
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={onGenerate}
            disabled={generateDisabled}
            className="btn-premium flex-1 h-11 flex items-center justify-center gap-2 rounded-xl text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "var(--text-primary)",
              color: "var(--bg-primary)",
            }}
          >
            Generate Avatar
            <SparkleIcon size={14} />
            <span className="text-[12px] opacity-70">· 5 credits</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ dragActive }: { dragActive: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center px-6 pointer-events-none">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          color: dragActive ? "var(--text-primary)" : "var(--text-muted)",
          transition: "color 0.15s ease",
        }}
      >
        <UserCircle size={32} />
      </div>
      <div>
        <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {dragActive ? "Drop to load avatar" : "Your AI avatar lives here"}
        </p>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
          {dragActive
            ? "Release to use this avatar as the current preview."
            : "Pick options on the right and hit Generate — or drag one in from the library."}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Builder panel — right rail with accordion sections
   ═══════════════════════════════════════════════════════════════════ */

interface BuilderProps {
  rightTab: RightTab;
  setRightTab: (v: RightTab) => void;
  openSection: string | null;
  setOpenSection: (v: string | null) => void;

  characterType: string;
  setCharacterType: (v: string) => void;
  gender: string;
  setGender: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  ethnicity: string;
  setEthnicity: (v: string) => void;
  skinTone: string;
  setSkinTone: (v: string) => void;
  eyeColor: string;
  setEyeColor: (v: string) => void;
  hairLength: string;
  setHairLength: (v: string) => void;
  hairStyle: string;
  setHairStyle: (v: string) => void;
  hairColor: string;
  setHairColor: (v: string) => void;
  bodyType: string;
  setBodyType: (v: string) => void;
  outfit: string;
  setOutfit: (v: string) => void;
  expression: string;
  setExpression: (v: string) => void;
  background: string;
  setBackground: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;

  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  buildPrompt: () => string;

  nickname: string;
  setNickname: (v: string) => void;
  previews: string[];
  files: File[];
  removeFile: (i: number) => void;
  onAddFilesClick: () => void;

  model: string;
  setModel: (v: string) => void;
  showModelDropdown: boolean;
  setShowModelDropdown: (v: boolean) => void;
}

function BuilderPanel(p: BuilderProps) {
  const toggle = (k: string) => p.setOpenSection(p.openSection === k ? null : k);

  return (
    <aside
      className="w-[340px] shrink-0 flex-col overflow-hidden hidden lg:flex"
      style={{ borderLeft: "1px solid var(--border-color)", background: "var(--bg-secondary)" }}
    >
      {/* Tab toggle + Reset */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-color)" }}
      >
        <div
          className="flex rounded-lg p-0.5"
          style={{ background: "var(--segment-bg)", boxShadow: "var(--shadow-segment-inset)" }}
        >
          {(["builder", "prompt"] as const).map((t) => {
            const active = p.rightTab === t;
            return (
              <button
                key={t}
                onClick={() => p.setRightTab(t)}
                className="px-3 py-1 rounded-md text-[12px] capitalize transition-all"
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

      <div className="flex-1 overflow-y-auto">
        {p.rightTab === "builder" ? (
          <div className="py-1">
            {/* Nickname (always visible, not in an accordion) */}
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-color)" }}>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: "var(--text-muted)" }}>
                Nickname
              </label>
              <input
                type="text"
                value={p.nickname}
                onChange={(e) => p.setNickname(e.target.value)}
                placeholder="e.g. Sarah"
                maxLength={50}
                className="w-full px-3 py-2 rounded-lg text-[12px]"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            <Accordion
              keyName="character-type"
              label="Character Type"
              icon={MagicWand}
              open={p.openSection === "character-type"}
              onToggle={toggle}
              summary={CHARACTER_TYPES.find((c) => c.value === p.characterType)?.label}
            >
              <IconTileGrid
                items={CHARACTER_TYPES}
                selected={p.characterType}
                onSelect={p.setCharacterType}
                cols={2}
              />
            </Accordion>

            <Accordion
              keyName="gender"
              label="Gender"
              icon={Heart}
              open={p.openSection === "gender"}
              onToggle={toggle}
              summary={GENDERS.find((g) => g.value === p.gender)?.label}
            >
              <IconTileGrid items={GENDERS} selected={p.gender} onSelect={p.setGender} cols={3} />
            </Accordion>

            <Accordion
              keyName="ethnicity"
              label="Ethnicity"
              icon={Globe}
              open={p.openSection === "ethnicity"}
              onToggle={toggle}
              summary={p.ethnicity}
            >
              <PortraitTileGrid
                items={ETHNICITIES}
                selected={p.ethnicity}
                onSelect={p.setEthnicity}
              />
            </Accordion>

            <Accordion
              keyName="skin"
              label="Skin Color"
              icon={Palette}
              open={p.openSection === "skin"}
              onToggle={toggle}
              summary={p.skinTone}
            >
              <SwatchGrid items={SKIN_TONES} selected={p.skinTone} onSelect={p.setSkinTone} />
            </Accordion>

            <Accordion
              keyName="eyes"
              label="Eye Color"
              icon={Eye}
              open={p.openSection === "eyes"}
              onToggle={toggle}
              summary={p.eyeColor}
            >
              <SwatchGrid items={EYE_COLORS} selected={p.eyeColor} onSelect={p.setEyeColor} />
            </Accordion>

            <Accordion
              keyName="hair-length"
              label="Hair Length"
              icon={Scissors}
              open={p.openSection === "hair-length"}
              onToggle={toggle}
              summary={p.hairLength}
            >
              <IconTileGrid
                items={HAIR_LENGTHS}
                selected={p.hairLength}
                onSelect={p.setHairLength}
                cols={3}
              />
            </Accordion>

            <Accordion
              keyName="hair-style"
              label="Hair Style"
              icon={Brush}
              open={p.openSection === "hair-style"}
              onToggle={toggle}
              summary={p.hairStyle}
            >
              <IconTileGrid
                items={HAIR_STYLES}
                selected={p.hairStyle}
                onSelect={p.setHairStyle}
                cols={3}
              />
            </Accordion>

            <Accordion
              keyName="hair-color"
              label="Hair Color"
              icon={Droplets}
              open={p.openSection === "hair-color"}
              onToggle={toggle}
              summary={p.hairColor}
            >
              <SwatchGrid items={HAIR_COLORS} selected={p.hairColor} onSelect={p.setHairColor} />
            </Accordion>

            <Accordion
              keyName="age"
              label="Age Range"
              icon={Calendar}
              open={p.openSection === "age"}
              onToggle={toggle}
              summary={p.age}
            >
              <IconTileGrid
                items={AGE_RANGES}
                selected={p.age}
                onSelect={p.setAge}
                cols={5}
              />
            </Accordion>

            <Accordion
              keyName="body"
              label="Body Type"
              icon={User}
              open={p.openSection === "body"}
              onToggle={toggle}
              summary={p.bodyType}
            >
              <IconTileGrid
                items={BODY_TYPES}
                selected={p.bodyType}
                onSelect={p.setBodyType}
                cols={3}
              />
            </Accordion>

            <Accordion
              keyName="outfit"
              label="Outfit"
              icon={SparkleIcon}
              open={p.openSection === "outfit"}
              onToggle={toggle}
              summary={p.outfit}
            >
              <IconTileGrid
                items={OUTFITS}
                selected={p.outfit}
                onSelect={p.setOutfit}
                cols={2}
              />
            </Accordion>

            <Accordion
              keyName="expression"
              label="Expression"
              icon={FaceSmile}
              open={p.openSection === "expression"}
              onToggle={toggle}
              summary={p.expression}
            >
              <IconTileGrid
                items={EXPRESSIONS}
                selected={p.expression}
                onSelect={p.setExpression}
                cols={3}
              />
            </Accordion>

            <Accordion
              keyName="background"
              label="Background"
              icon={ImageSquare}
              open={p.openSection === "background"}
              onToggle={toggle}
              summary={BACKGROUNDS.find((b) => b.value === p.background)?.label}
            >
              <IconTileGrid
                items={BACKGROUNDS}
                selected={p.background}
                onSelect={p.setBackground}
                cols={2}
              />
            </Accordion>

            <Accordion
              keyName="style"
              label="Style"
              icon={Camera}
              open={p.openSection === "style"}
              onToggle={toggle}
              summary={STYLES.find((s) => s.value === p.style)?.label}
            >
              <IconTileGrid items={STYLES} selected={p.style} onSelect={p.setStyle} cols={2} />
            </Accordion>

            <Accordion
              keyName="references"
              label={`References · ${p.files.length}/5`}
              icon={Upload}
              open={p.openSection === "references"}
              onToggle={toggle}
              summary={p.files.length > 0 ? `${p.files.length}` : undefined}
            >
              <div className="flex gap-2 flex-wrap">
                {p.previews.map((url, i) => (
                  <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => p.removeFile(i)}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove reference"
                    >
                      <XIcon size={12} color="white" />
                    </button>
                  </div>
                ))}
                {p.files.length < 5 && (
                  <button
                    onClick={p.onAddFilesClick}
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
            </Accordion>

            {/* Model selector at the bottom */}
            <div className="px-4 py-3 mt-1" style={{ borderTop: "1px solid var(--border-color)" }}>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: "var(--text-muted)" }}>
                Model
              </label>
              <div className="relative">
                <button
                  onClick={() => p.setShowModelDropdown(!p.showModelDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px]"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <MagicWand size={13} />
                    {p.model === "gemini-3-pro" ? "Gemini 3 Pro Image" : "Nano Banana Pro"}
                  </span>
                  <ChevronDown size={12} />
                </button>
                {p.showModelDropdown && (
                  <div
                    className="absolute bottom-full mb-1 left-0 right-0 rounded-lg py-1 z-50"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                    }}
                  >
                    {[
                      { id: "gemini-3-pro", name: "Gemini 3 Pro Image" },
                      { id: "nano-banana-pro", name: "Nano Banana Pro" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          p.setModel(m.id);
                          p.setShowModelDropdown(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-[12px] transition-colors"
                        style={{
                          color: p.model === m.id ? "var(--text-primary)" : "var(--text-secondary)",
                          fontWeight: p.model === m.id ? 600 : 400,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Prompt tab */
          <div className="p-4 space-y-4">
            <div>
              <label
                className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Custom details
              </label>
              <textarea
                value={p.customPrompt}
                onChange={(e) => p.setCustomPrompt(e.target.value)}
                placeholder="Add extra details about your avatar…"
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-[12px] resize-none"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  minHeight: "100px",
                }}
              />
            </div>
            <div>
              <label
                className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Built prompt (read-only)
              </label>
              <div
                className="rounded-lg p-3 text-[11px] leading-relaxed"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-secondary)",
                }}
              >
                {p.buildPrompt()}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Accordion — reveal-on-click section
   ═══════════════════════════════════════════════════════════════════ */

function Accordion({
  keyName,
  label,
  summary,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  keyName: string;
  label: string;
  summary?: string;
  icon?: IconComp;
  open: boolean;
  onToggle: (k: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--border-color)" }}>
      <button
        onClick={() => onToggle(keyName)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors"
        style={{ color: "var(--text-primary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <span
              className="shrink-0 flex items-center justify-center w-5 h-5"
              style={{ color: "var(--text-secondary)" }}
            >
              <Icon size={14} />
            </span>
          )}
          <span className="text-[13px] font-semibold">{label}</span>
          {summary && !open && (
            <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
              {summary}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Tile grids — icon, gradient, swatch
   ═══════════════════════════════════════════════════════════════════ */

function IconTileGrid({
  items,
  selected,
  onSelect,
  cols,
}: {
  items: IconTile[];
  selected: string;
  onSelect: (v: string) => void;
  cols: number;
}) {
  const gridCls =
    cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : cols === 4 ? "grid-cols-4" : "grid-cols-5";

  return (
    <div className={`grid ${gridCls} gap-1.5`}>
      {items.map((it) => {
        const active = selected === it.value;
        return (
          <button
            key={it.value}
            onClick={() => onSelect(it.value)}
            className="flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-lg text-[11px] text-center"
            style={{
              background: active ? "var(--btn-raised-bg)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              border: active ? "1px solid var(--btn-raised-border)" : "1px solid var(--border-color)",
              boxShadow: active ? "var(--shadow-btn-raised)" : "none",
              fontWeight: active ? 600 : 500,
              transition: "background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, color 0.2s ease",
              minHeight: 52,
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
          >
            {it.glyph && <span className="text-[16px] leading-none">{it.glyph}</span>}
            <span className="leading-tight">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PortraitTileGrid({
  items,
  selected,
  onSelect,
}: {
  items: PortraitTile[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((it) => {
        const active = selected === it.value;
        return (
          <button
            key={it.value}
            onClick={() => onSelect(it.value)}
            className="relative aspect-[3/4] rounded-lg overflow-hidden transition-all"
            style={{
              // Gradient is the fallback behind the image — visible during load
              // and if the CDN photo ever breaks.
              background: it.gradient,
              outline: active ? "2px solid var(--text-primary)" : "1px solid var(--border-color)",
              outlineOffset: active ? "1px" : "0",
              transform: active ? "scale(1.02)" : "scale(1)",
              boxShadow: active ? "var(--shadow-btn-raised)" : "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = active ? "scale(1.04)" : "scale(1.02)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = active ? "scale(1.02)" : "scale(1)")}
            title={it.label}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.imageUrl}
              alt={it.label}
              loading="lazy"
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                // Hide the broken image so the gradient fallback shows through.
                e.currentTarget.style.display = "none";
              }}
            />
            <div
              className="absolute inset-x-0 bottom-0 px-1.5 py-1"
              style={{
                background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)",
              }}
            >
              <span className="text-[10px] font-semibold text-white drop-shadow-sm">{it.label}</span>
            </div>
            {active && (
              <div
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
              >
                <Check size={11} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SwatchGrid({
  items,
  selected,
  onSelect,
}: {
  items: SwatchTile[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = selected === it.value;
        return (
          <button
            key={it.value}
            onClick={() => onSelect(it.value)}
            className="w-8 h-8 rounded-full"
            style={{
              background: it.color,
              outline: active ? "2.5px solid var(--text-primary)" : "1px solid var(--border-color)",
              outlineOffset: active ? "2px" : "0px",
              transform: active ? "scale(1.1)" : "scale(1)",
              boxShadow: active ? "var(--shadow-btn-raised)" : "none",
              transition: "transform 0.2s ease, outline 0.2s ease, box-shadow 0.2s ease",
            }}
            title={it.value}
          />
        );
      })}
    </div>
  );
}
