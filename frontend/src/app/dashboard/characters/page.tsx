"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { avatarAPI } from "@/lib/api";
import {
  Check,
  Plus,
  SparkleIcon,
  Spinner,
  Upload,
  UserCircle,
  XIcon,
} from "@/components/Icons";

interface Character {
  avatar_id: string;
  name: string;
  thumbnail: string;
  created_at: string;
}

/* ═══════════════════════════════════════════════════════════════════
   Characters — Higgsfield-style landing: hero, CTA, gallery.
   The actual training UI is in a modal so the landing stays clean.
   ═══════════════════════════════════════════════════════════════════ */

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreator, setShowCreator] = useState(false);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      const res = await avatarAPI.list();
      setCharacters(res.data.avatars || []);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  };

  // Top-row hero cards: sample up to 4 existing thumbnails so the page
  // feels populated for returning users. New users see placeholder cards.
  const heroSamples = characters.slice(0, 4);

  return (
    <>
      <Header
        title="Characters"
        subtitle="Train reusable characters from reference photos"
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-14">
          {/* Hero */}
          <section className="flex flex-col items-center text-center">
            <HeroStack samples={heroSamples} />

            <h1
              className="text-[30px] md:text-[44px] font-bold tracking-tight mt-8"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
            >
              Make your own character
            </h1>
            <p
              className="text-[14px] md:text-[15px] max-w-[480px] mt-3"
              style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}
            >
              Upload photos from multiple angles to train your character.
              <br className="hidden sm:block" />
              Then use the same consistent character across new images and videos.
            </p>

            <button
              type="button"
              onClick={() => setShowCreator(true)}
              className="mt-7 px-6 py-3 rounded-xl text-[14px] font-semibold flex items-center gap-2 transition-transform"
              style={{
                background: "var(--text-primary)",
                color: "var(--bg-primary)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              Create character
              <SparkleIcon size={16} />
            </button>
          </section>

          {/* Gallery */}
          <section className="mt-14 md:mt-20">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size={22} />
              </div>
            ) : characters.length === 0 ? (
              <div
                className="text-center py-12 rounded-2xl"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px dashed var(--border-color)",
                }}
              >
                <UserCircle
                  size={36}
                  style={{ color: "var(--text-muted)", margin: "0 auto 10px" }}
                />
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  No characters yet. Train your first one above.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-4 px-1">
                  <h2
                    className="text-[13px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Your characters
                  </h2>
                  <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {characters.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                  {characters.map((c) => (
                    <CharacterCard key={c.avatar_id} character={c} />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {showCreator && (
        <CreateCharacterModal
          onClose={() => setShowCreator(false)}
          onCreated={loadCharacters}
        />
      )}
    </>
  );
}

/* ─── Hero stack: 4 overlapping rotated cards ─── */

function HeroStack({ samples }: { samples: Character[] }) {
  // Four slots — fill with real thumbnails where available, otherwise
  // render a soft gradient placeholder so the stack always looks balanced.
  const slots = Array.from({ length: 4 }).map((_, i) => samples[i] ?? null);
  const rotations = [-8, -3, 3, 8];
  const offsets = [0, 6, 0, 6];

  return (
    <div className="relative h-[180px] w-[340px] md:h-[200px] md:w-[400px]">
      {slots.map((c, i) => {
        const leftPct = i * 25;
        return (
          <div
            key={i}
            className="absolute rounded-2xl overflow-hidden"
            style={{
              left: `${leftPct}%`,
              top: offsets[i],
              width: "42%",
              height: "92%",
              transform: `rotate(${rotations[i]}deg)`,
              border: "4px solid var(--bg-primary)",
              boxShadow: "0 10px 32px rgba(0,0,0,0.25)",
              zIndex: i === 1 || i === 2 ? 2 : 1,
            }}
          >
            {c?.thumbnail ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={c.thumbnail}
                alt={c.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, var(--bg-tertiary), var(--bg-hover))",
                }}
              >
                <UserCircle size={36} style={{ color: "var(--text-muted)" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Character card in the gallery ─── */

function CharacterCard({ character }: { character: Character }) {
  return (
    <div
      className="relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {character.thumbnail ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={character.thumbnail}
          alt={character.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <UserCircle size={40} style={{ color: "var(--text-muted)" }} />
        </div>
      )}
      <div
        className="absolute inset-x-0 bottom-0 p-3"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)",
        }}
      >
        <p className="text-white text-[13px] font-semibold truncate drop-shadow-sm">
          {character.name}
        </p>
      </div>
    </div>
  );
}

/* ─── Create-character modal: upload + name + train ─── */

function CreateCharacterModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const next = [...files, ...Array.from(incoming)];
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };
  const removeFile = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const hasPhotos = files.length > 0;
  const meetsMinimum = files.length >= 3;
  const recommended = files.length >= 20;
  const canTrain = meetsMinimum && name.trim().length > 0 && !isTraining;

  const handleTrain = async () => {
    if (!canTrain) return;
    setIsTraining(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      files.forEach((f) => formData.append("files", f));
      await avatarAPI.trainCharacter(formData);
      onCreated();
      onClose();
    } catch (err: unknown) {
      const e = err as {
        response?: {
          status?: number;
          data?: { detail?: string | { message?: string; error?: string } };
        };
        message?: string;
      };
      const detail = e.response?.data?.detail;
      const status = e.response?.status;
      let msg = "";
      if (typeof detail === "string") msg = detail;
      else if (detail && typeof detail === "object")
        msg = detail.message || detail.error || JSON.stringify(detail);
      else if (e.message) msg = e.message;
      else msg = "Training failed";
      setError(`[${status || "?"}] ${msg}`);
      console.error("Character training error:", { status, detail, raw: err });
    } finally {
      setIsTraining(false);
    }
  };

  // Close on Escape (not while training — avoid losing work)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isTraining) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTraining, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={() => {
        if (!isTraining) onClose();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
          style={{
            background: "var(--bg-primary)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div>
            <h3
              className="text-[16px] font-semibold"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
            >
              New character
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Upload reference photos so the same face can appear in every generation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isTraining}
            className="p-1.5 rounded-lg transition-colors shrink-0 ml-3"
            style={{
              color: "var(--text-muted)",
              opacity: isTraining ? 0.3 : 1,
              cursor: isTraining ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!isTraining) e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            aria-label="Close"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-5 py-5 space-y-5">
          {/* Upload zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className="relative rounded-xl cursor-pointer overflow-hidden"
            style={{
              background: "var(--bg-secondary)",
              border: `1.5px dashed ${dragging ? "var(--text-primary)" : "var(--border-color)"}`,
              minHeight: hasPhotos ? "auto" : 200,
              transition: "border-color 0.2s ease, background 0.2s ease",
            }}
          >
            {!hasPhotos ? (
              <div className="flex flex-col items-center justify-center text-center px-4 py-10">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold"
                  style={{
                    background: "var(--text-primary)",
                    color: "var(--bg-primary)",
                  }}
                >
                  <Upload size={15} />
                  Upload photos
                </div>
                <p className="text-[12px] mt-3" style={{ color: "var(--text-muted)" }}>
                  Drop files here or click to browse — 20+ photos recommended
                </p>
              </div>
            ) : (
              <div className="p-2.5">
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                  {previews.map((src, i) => (
                    <div
                      key={i}
                      className="relative aspect-square rounded-md overflow-hidden group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                        aria-label="Remove photo"
                      >
                        <XIcon size={10} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      inputRef.current?.click();
                    }}
                    className="aspect-square rounded-md flex items-center justify-center"
                    style={{
                      border: "1.5px dashed var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                    aria-label="Add more"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2.5 px-1">
                  <span
                    className="text-[12px]"
                    style={{
                      color: recommended
                        ? "var(--success)"
                        : meetsMinimum
                          ? "var(--text-secondary)"
                          : "var(--text-muted)",
                    }}
                  >
                    {files.length} photo{files.length === 1 ? "" : "s"}
                    {recommended ? " · great" : meetsMinimum ? " · ok" : " · need 3+"}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles([]);
                      setPreviews([]);
                    }}
                    className="text-[12px] hover:underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {/* Name */}
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Character name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emma Rodriguez"
              maxLength={60}
              className="w-full px-3 py-2.5 rounded-lg text-[13px]"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Guidelines */}
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                style={{ background: "var(--success)", color: "#fff" }}
              >
                <Check size={12} />
              </div>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  20+ photos recommended:
                </span>{" "}
                one person, clear face, multiple angles.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <div
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                style={{ background: "var(--error)", color: "#fff" }}
              >
                <XIcon size={12} />
              </div>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  Avoid:
                </span>{" "}
                duplicates, group shots, filters, face coverings (masks, sunglasses).
              </p>
            </div>
          </div>

          {error && (
            <div
              className="px-3 py-2 rounded-lg text-[12px]"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "var(--error)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 sticky bottom-0"
          style={{
            background: "var(--bg-primary)",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isTraining}
            className="px-4 py-2 rounded-lg text-[13px] font-medium"
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              opacity: isTraining ? 0.5 : 1,
              cursor: isTraining ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTrain}
            disabled={!canTrain}
            className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5"
            style={{
              background: canTrain ? "var(--text-primary)" : "var(--bg-secondary)",
              color: canTrain ? "var(--bg-primary)" : "var(--text-muted)",
              border: canTrain ? "none" : "1px solid var(--border-color)",
              opacity: canTrain ? 1 : 0.7,
              cursor: canTrain ? "pointer" : "not-allowed",
            }}
          >
            {isTraining ? (
              <>
                <Spinner size={14} />
                Training…
              </>
            ) : (
              <>
                <SparkleIcon size={14} />
                Train character
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
