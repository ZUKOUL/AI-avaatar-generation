"use client";

/**
 * AI Video Generator page
 *
 * Type a phrase ("un ananas qui parle des vitamines"), pick duration /
 * mode / voice, and get back a fully rendered vertical short.
 *
 * Two modes (priced differently in the backend):
 *   - Slideshow: keyframe → Ken Burns pan/zoom → voice + subs
 *   - Motion:    keyframe → Kling image-to-video per scene → voice + subs
 *
 * The page is non-blocking: the button stays clickable while jobs run,
 * each job renders a card with live progress, per-scene thumbnails as
 * they come in, and the final video when the pipeline finishes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import { aiVideosAPI } from "@/lib/api";
import {
  Spinner,
  SparkleIcon,
  Download,
  Play,
  Trash,
  XIcon,
  Info,
  Zap,
  MagicWand,
  ChevronDown,
  Check,
} from "@/components/Icons";

/* ─── Types ─────────────────────────────────────────────────────── */

type JobStatus =
  | "queued"
  | "scripting"
  | "storyboarding"
  | "rendering_images"
  | "animating"
  | "voicing"
  | "assembling"
  | "completed"
  | "failed";

const TERMINAL: JobStatus[] = ["completed", "failed"];

const STATUS_COPY: Record<JobStatus, string> = {
  queued: "Queued",
  scripting: "Writing the script",
  storyboarding: "Designing the storyboard",
  rendering_images: "Rendering keyframes",
  animating: "Animating scenes",
  voicing: "Recording voice-over",
  assembling: "Final assembly",
  completed: "Done",
  failed: "Failed",
};

interface AIVideoJob {
  id: string;
  prompt: string;
  mode: "slideshow" | "motion";
  duration_seconds: number;
  aspect_ratio: string;
  language: string;
  voice_enabled: boolean;
  subtitle_style: string;
  tone: string | null;
  status: JobStatus;
  progress: number;
  hook: string | null;
  detected_lang: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface AIVideoScene {
  id: string;
  job_id: string;
  scene_index: number;
  duration_seconds: number;
  image_prompt: string;
  motion_prompt: string | null;
  voiceover_text: string | null;
  text_overlay: string | null;
  image_url: string | null;
  clip_url: string | null;
  status: "pending" | "rendering_image" | "animating" | "done" | "failed";
  error_message: string | null;
}

interface VoiceOption {
  voice_id: string;
  name: string;
  preview_url?: string;
  labels?: Record<string, string>;
  category?: string;
}

interface NichePreset {
  slug: string;
  name: string;
  handle: string;
  description: string;
  tagline: string;
  language: string;
  tone?: string;
  default_duration_seconds: number;
  default_mode: "slideshow" | "motion";
  default_aspect_ratio: string;
  default_subtitle_style: string;
  default_voice_enabled: boolean;
  default_voice_id: string | null;
  card_gradient: string;
  accent_color: string;
  recommended_hashtags: string[];
  caption_template: string;
  sample_topics: string[];
}

const MODES = [
  {
    id: "slideshow" as const,
    label: "Slideshow",
    price: "20-30 credits",
    tag: "Cheapest",
    description: "Keyframes + Ken Burns pan/zoom. Fast, affordable.",
  },
  {
    id: "motion" as const,
    label: "Full Motion",
    price: "40-75 credits",
    tag: "Premium",
    description: "Kling image-to-video per scene. Cinematic.",
  },
];

const DURATIONS = [15, 20, 30, 45, 60];
const ASPECTS = [
  { id: "9:16", label: "9:16 Shorts" },
  { id: "1:1", label: "1:1 Square" },
  { id: "4:5", label: "4:5 Feed" },
  { id: "16:9", label: "16:9 Landscape" },
];
const SUB_STYLES = [
  { id: "karaoke", label: "Karaoke" },
  { id: "block", label: "Block" },
  { id: "off", label: "None" },
];
const LANGUAGES = [
  { id: "auto", label: "Auto-detect" },
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
  { id: "de", label: "Deutsch" },
  { id: "it", label: "Italiano" },
  { id: "pt", label: "Português" },
];

/* ─── Page ──────────────────────────────────────────────────────── */

export default function AIVideosPage() {
  // Form state
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"slideshow" | "motion">("slideshow");
  const [duration, setDuration] = useState(30);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [language, setLanguage] = useState("auto");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceId, setVoiceId] = useState<string>("");
  const [subtitleStyle, setSubtitleStyle] = useState("karaoke");
  const [tone, setTone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Data
  const [jobs, setJobs] = useState<AIVideoJob[]>([]);
  const [scenesByJob, setScenesByJob] = useState<Record<string, AIVideoScene[]>>({});
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [niches, setNiches] = useState<NichePreset[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Playback modal
  const [playingJob, setPlayingJob] = useState<AIVideoJob | null>(null);

  // Niche generation modal
  const [activeNiche, setActiveNiche] = useState<NichePreset | null>(null);

  // Polling
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobs = useMemo(
    () => jobs.filter((j) => !TERMINAL.includes(j.status)),
    [jobs]
  );

  /* ─── Data loading ─── */

  const loadHistory = useCallback(async () => {
    try {
      const res = await aiVideosAPI.list(50);
      setJobs(res.data?.jobs ?? []);
    } catch (e) {
      console.error("Failed to load AI video history:", e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadVoices = useCallback(async () => {
    try {
      const res = await aiVideosAPI.voices();
      setVoices(res.data?.voices ?? []);
    } catch (e) {
      console.error("Failed to load voices:", e);
    }
  }, []);

  const loadNiches = useCallback(async () => {
    try {
      const res = await aiVideosAPI.listNiches();
      setNiches(res.data?.niches ?? []);
    } catch (e) {
      console.error("Failed to load niches:", e);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadVoices();
    loadNiches();
  }, [loadHistory, loadVoices, loadNiches]);

  // Called from the niche modal when the user hits "Generate".
  // `overrides` lets the modal pass user-picked voice + subtitle-style
  // choices on top of the niche defaults.
  const handleNicheGenerate = useCallback(
    async (
      niche: NichePreset,
      topic: string,
      overrides: {
        voiceId?: string;
        voiceEnabled?: boolean;
        subtitleStyle?: string;
      } = {}
    ) => {
      setError("");
      setInfo("");
      try {
        const fd = new FormData();
        fd.append("niche_slug", niche.slug);
        if (topic.trim()) fd.append("topic", topic.trim());
        if (overrides.voiceId) fd.append("voice_id", overrides.voiceId);
        if (overrides.voiceEnabled !== undefined)
          fd.append("voice_enabled", overrides.voiceEnabled ? "true" : "false");
        if (overrides.subtitleStyle)
          fd.append("subtitle_style", overrides.subtitleStyle);

        const res = await aiVideosAPI.generateFromNiche(fd);
        const jobId = res.data?.job_id as string | undefined;
        if (!jobId) throw new Error("Server didn't return a job id.");

        const newJob: AIVideoJob = {
          id: jobId,
          prompt: (res.data?.prompt as string) || topic || niche.name,
          mode: niche.default_mode,
          duration_seconds: niche.default_duration_seconds,
          aspect_ratio: niche.default_aspect_ratio,
          language: niche.language,
          voice_enabled:
            overrides.voiceEnabled !== undefined
              ? overrides.voiceEnabled
              : true,
          subtitle_style: overrides.subtitleStyle || "karaoke",
          tone: null,
          status: "queued",
          progress: 0,
          hook: null,
          detected_lang: null,
          video_url: null,
          thumbnail_url: null,
          error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setJobs((prev) => [newJob, ...prev]);
        setActiveNiche(null);
        const credits = res.data?.credits_charged;
        setInfo(
          credits
            ? `Queued ${niche.name} — used ${credits} credits. Ready in ${
                niche.default_mode === "motion" ? "~2-3 min" : "~1 min"
              }.`
            : `Queued ${niche.name}.`
        );
      } catch (e) {
        const err = e as { response?: { status?: number; data?: { detail?: unknown } }; message?: string };
        const detail = err?.response?.data?.detail;
        let msg =
          typeof detail === "string"
            ? detail
            : (detail as { message?: string } | undefined)?.message;
        if (!msg) msg = err?.message || "Could not queue the niche video.";
        if (err?.response?.status) msg = `[${err.response.status}] ${msg}`;
        setError(msg);
      }
    },
    []
  );

  /* ─── Polling ─── */

  const refreshActive = useCallback(async () => {
    if (activeJobs.length === 0) return;
    try {
      const results = await Promise.all(
        activeJobs.map((j) =>
          aiVideosAPI.getJob(j.id).then((r) => r.data).catch(() => null)
        )
      );
      const updatedJobs = new Map(jobs.map((j) => [j.id, j]));
      const updatedScenes = { ...scenesByJob };
      for (const r of results) {
        if (!r?.job) continue;
        updatedJobs.set(r.job.id, r.job as AIVideoJob);
        updatedScenes[r.job.id] = (r.scenes ?? []) as AIVideoScene[];
      }
      setJobs(Array.from(updatedJobs.values()));
      setScenesByJob(updatedScenes);
    } catch (e) {
      console.error("Polling refresh failed:", e);
    }
  }, [activeJobs, jobs, scenesByJob]);

  useEffect(() => {
    if (activeJobs.length === 0) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    if (!pollTimer.current) {
      pollTimer.current = setInterval(() => refreshActive(), 5000);
    }
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [activeJobs.length, refreshActive]);

  /* ─── Submit ─── */

  const handleSubmit = async () => {
    setError("");
    setInfo("");
    const text = prompt.trim();
    if (!text) {
      setError("Type a phrase describing the video you want.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("prompt", text);
      fd.append("mode", mode);
      fd.append("duration_seconds", String(duration));
      fd.append("aspect_ratio", aspectRatio);
      fd.append("language", language);
      fd.append("voice_enabled", voiceEnabled ? "true" : "false");
      if (voiceId) fd.append("voice_id", voiceId);
      fd.append("subtitle_style", subtitleStyle);
      if (tone.trim()) fd.append("tone", tone.trim());

      const res = await aiVideosAPI.generate(fd);
      const jobId = res.data?.job_id as string | undefined;
      if (!jobId) throw new Error("Server didn't return a job id.");

      const newJob: AIVideoJob = {
        id: jobId,
        prompt: text,
        mode,
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        language,
        voice_enabled: voiceEnabled,
        subtitle_style: subtitleStyle,
        tone: tone.trim() || null,
        status: "queued",
        progress: 0,
        hook: null,
        detected_lang: null,
        video_url: null,
        thumbnail_url: null,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setJobs((prev) => [newJob, ...prev]);
      setPrompt("");
      const credits = res.data?.credits_charged;
      setInfo(
        credits
          ? `Queued — used ${credits} credits. Final video in ${
              mode === "motion" ? "~2-3 min" : "~1 min"
            }.`
          : "Queued — polling for progress."
      );
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { detail?: unknown } }; message?: string };
      const detail = err?.response?.data?.detail;
      let msg =
        typeof detail === "string"
          ? detail
          : (detail as { message?: string } | undefined)?.message;
      if (!msg) msg = err?.message || "Could not queue the job.";
      if (err?.response?.status) msg = `[${err.response.status}] ${msg}`;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Delete ─── */

  const handleDelete = async (jobId: string) => {
    if (!confirm("Delete this AI video and everything it produced?")) return;
    const snapshotJobs = jobs;
    const snapshotScenes = scenesByJob;
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    setScenesByJob((prev) => {
      const copy = { ...prev };
      delete copy[jobId];
      return copy;
    });
    try {
      await aiVideosAPI.deleteJob(jobId);
    } catch (e) {
      console.error("Delete failed, rolling back:", e);
      setJobs(snapshotJobs);
      setScenesByJob(snapshotScenes);
      setError("Delete failed. Try again.");
    }
  };

  /* ─── Render ─── */

  return (
    <>
      <Header
        title="AI Video"
        subtitle="Type a phrase, get a finished vertical video"
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-6 md:py-10">
          {/* ── Niche presets (one-click generation) ────────────────── */}
          {niches.length > 0 && (
            <div className="mb-6">
              <div
                className="flex items-center justify-between mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                <div className="text-xs font-medium tracking-wide uppercase">
                  Styles TikTok — génération 1-clic
                </div>
                <div className="text-[10px] opacity-80">
                  Script + visuels + voix + sous-titres, tout fait auto.
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {niches.map((n) => (
                  <NicheCard
                    key={n.slug}
                    niche={n}
                    onClick={() => setActiveNiche(n)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Prompt card ───────────────────────────────────────── */}
          <div
            className="rounded-xl p-5 md:p-6 mb-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <label
              className="text-xs font-medium mb-2 block tracking-wide uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              Describe the video you want
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g. "Un ananas qui explique les vitamines aux enfants" — or "Timelapse d&apos;une maison qui se construit sur un terrain vide"'
              rows={2}
              className="w-full bg-transparent border-none outline-none text-base resize-y min-h-[56px]"
              style={{ color: "var(--text-primary)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !submitting) {
                  handleSubmit();
                }
              }}
            />

            {/* Mode selector */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {MODES.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className="text-left rounded-xl p-3 transition"
                    style={{
                      background: active
                        ? "var(--accent-primary)"
                        : "var(--bg-primary)",
                      color: active ? "var(--bg-primary)" : "var(--text-primary)",
                      border: active
                        ? "1px solid var(--accent-primary)"
                        : "1px solid var(--border-color)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {m.id === "slideshow" ? (
                          <MagicWand size={16} color="currentColor" />
                        ) : (
                          <Zap size={16} color="currentColor" />
                        )}
                        <div className="text-sm font-semibold">{m.label}</div>
                      </div>
                      {/* High-contrast tag chip that stays readable in BOTH
                          states. Previously in active state the tag bg was
                          translucent dark + inherited dark text → invisible
                          on the light accent button. Now active = solid
                          dark pill with accent-coloured text (flashy +
                          readable), inactive = soft neutral pill. */}
                      <div
                        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: active
                            ? "var(--bg-primary)"
                            : "var(--bg-secondary)",
                          color: active
                            ? "var(--accent-primary)"
                            : "var(--text-primary)",
                        }}
                      >
                        {m.tag}
                      </div>
                    </div>
                    {/* No more opacity on the description — it was compounding
                        with low-contrast text in certain themes and making the
                        sub-copy unreadable in active state. */}
                    <div className="text-xs mt-1">{m.description}</div>
                    <div className="text-xs mt-1 font-semibold">{m.price}</div>
                  </button>
                );
              })}
            </div>

            {/* Secondary controls */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <Field label="Duration">
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className={selectCls}
                  style={selectStyle}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}s
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Aspect">
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className={selectCls}
                  style={selectStyle}
                >
                  {ASPECTS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Language">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={selectCls}
                  style={selectStyle}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subtitles">
                <select
                  value={subtitleStyle}
                  onChange={(e) => setSubtitleStyle(e.target.value)}
                  className={selectCls}
                  style={selectStyle}
                >
                  {SUB_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Voice-over">
                <select
                  value={voiceEnabled ? "on" : "off"}
                  onChange={(e) => setVoiceEnabled(e.target.value === "on")}
                  className={selectCls}
                  style={selectStyle}
                >
                  <option value="on">Enabled</option>
                  <option value="off">Silent</option>
                </select>
              </Field>
            </div>

            {/* Tone + voice picker (optional, collapsible vibe) */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Tone (optional)">
                <input
                  type="text"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="energetic · storytelling · educational · dramatic · playful …"
                  className={selectCls}
                  style={selectStyle}
                />
              </Field>
              {voiceEnabled && voices.length > 0 && (
                <Field label="Voice">
                  <VoicePicker
                    voices={voices}
                    value={voiceId}
                    onChange={setVoiceId}
                  />
                </Field>
              )}
            </div>

            {/* Submit */}
            <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !prompt.trim()}
                className="rounded-lg px-6 py-2.5 text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--bg-primary)",
                }}
              >
                {submitting ? (
                  <Spinner size={16} />
                ) : (
                  <>
                    <SparkleIcon size={16} color="currentColor" />
                    {activeJobs.length > 0
                      ? `Queue another (${activeJobs.length} running)`
                      : "Generate video"}
                  </>
                )}
              </button>
              <div
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                ⌘+Enter to submit.
              </div>
            </div>

            {info && (
              <div
                className="mt-3 text-xs flex items-center gap-2"
                style={{ color: "var(--text-muted)" }}
              >
                <Info size={14} color="currentColor" />
                {info}
              </div>
            )}
            {error && (
              <div
                className="mt-3 text-xs rounded-md px-3 py-2"
                style={{
                  background: "rgba(220, 38, 38, 0.08)",
                  color: "#f87171",
                  border: "1px solid rgba(220, 38, 38, 0.25)",
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* ── Job list ───────────────────────────────────────────── */}
          {loadingHistory ? (
            <div className="flex items-center justify-center py-24">
              <Spinner size={28} />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  scenes={scenesByJob[job.id] ?? []}
                  onPlay={() => setPlayingJob(job)}
                  onDelete={() => handleDelete(job.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Playback modal ─────────────────────────────────────── */}
      {playingJob && playingJob.video_url && (
        <VideoModal
          job={playingJob}
          onClose={() => setPlayingJob(null)}
        />
      )}

      {/* ── Niche generation modal ─────────────────────────────── */}
      {activeNiche && (
        <NicheModal
          niche={activeNiche}
          voices={voices}
          onClose={() => setActiveNiche(null)}
          onSubmit={(topic, overrides) =>
            handleNicheGenerate(activeNiche, topic, overrides)
          }
        />
      )}
    </>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

const selectCls =
  "w-full rounded-lg px-3 py-2 text-sm outline-none";
const selectStyle: React.CSSProperties = {
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-xs font-medium mb-1 tracking-wide uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-xl p-10 text-center"
      style={{
        background: "var(--bg-secondary)",
        border: "1px dashed var(--border-color)",
        color: "var(--text-muted)",
      }}
    >
      <SparkleIcon size={28} color="currentColor" />
      <p className="mt-3 text-sm">
        Describe any scene, character, or story and get back a finished
        vertical video with images, animation, voice-over and subtitles.
      </p>
      <p className="mt-1 text-xs opacity-80">
        Slideshow mode renders in ~1 min, Full Motion in 2-3 min.
      </p>
    </div>
  );
}

function JobCard({
  job,
  scenes,
  onPlay,
  onDelete,
}: {
  job: AIVideoJob;
  scenes: AIVideoScene[];
  onPlay: () => void;
  onDelete: () => void;
}) {
  const isTerminal = TERMINAL.includes(job.status);
  const statusColor =
    job.status === "failed"
      ? "#f87171"
      : job.status === "completed"
        ? "#22c55e"
        : "var(--accent-primary)";

  const aspectClass = aspectToTailwind(job.aspect_ratio);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      <div className="flex items-start justify-between gap-3 p-4 md:p-5">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold line-clamp-2"
            style={{ color: "var(--text-primary)" }}
          >
            {job.prompt}
          </div>
          {job.hook && (
            <div
              className="text-xs mt-1 italic"
              style={{ color: "var(--text-muted)" }}
            >
              Hook: {job.hook}
            </div>
          )}
          <div
            className="text-xs mt-1 flex items-center gap-3 flex-wrap"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="uppercase tracking-wide">{job.mode}</span>
            <span>· {job.duration_seconds}s</span>
            <span>· {job.aspect_ratio}</span>
            {job.detected_lang && <span>· {job.detected_lang.toUpperCase()}</span>}
            {job.tone && <span>· {job.tone}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="text-xs rounded-full px-2.5 py-1 font-medium"
            style={{
              background: `${statusColor}22`,
              color: statusColor,
            }}
          >
            {STATUS_COPY[job.status] ?? job.status}
            {!isTerminal ? ` · ${job.progress}%` : ""}
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-md opacity-70 hover:opacity-100 transition"
            style={{ color: "var(--text-muted)" }}
            aria-label="Delete"
          >
            <Trash size={16} color="currentColor" />
          </button>
        </div>
      </div>

      {!isTerminal && (
        <div
          className="h-1 w-full"
          style={{ background: "var(--bg-primary)" }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.max(3, Math.min(100, job.progress))}%`,
              background: "var(--accent-primary)",
            }}
          />
        </div>
      )}

      {job.status === "failed" && job.error_message && (
        <div
          className="px-4 md:px-5 py-3 text-xs"
          style={{
            color: "#f87171",
            background: "rgba(220, 38, 38, 0.06)",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          {job.error_message}
        </div>
      )}

      {/* Final video preview (if completed) */}
      {job.status === "completed" && job.video_url && (
        <div className="px-4 md:px-5 pb-5">
          <div
            className={`relative mx-auto rounded-lg overflow-hidden ${aspectClass} max-w-[320px]`}
            style={{ background: "#000" }}
          >
            {job.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={job.thumbnail_url}
                alt="Final video"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : null}
            <button
              type="button"
              onClick={onPlay}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition"
              aria-label="Play"
            >
              <div
                className="rounded-full p-4"
                style={{ background: "rgba(255,255,255,0.9)" }}
              >
                <Play size={22} color="#000" />
              </div>
            </button>
          </div>
          <div className="flex items-center justify-center gap-4 mt-3">
            <a
              href={job.video_url}
              download
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs"
              style={{ color: "var(--accent-primary)" }}
            >
              <Download size={13} color="currentColor" />
              Download
            </a>
            <button
              type="button"
              onClick={onPlay}
              className="inline-flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <Play size={12} color="currentColor" />
              Play inline
            </button>
          </div>
        </div>
      )}

      {/* Scene thumbnails — show as they come in so users feel progress */}
      {scenes.length > 0 && job.status !== "completed" && (
        <div className="px-4 md:px-5 pb-5">
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-2">
            {scenes.map((s) => (
              <SceneTile key={s.id} scene={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SceneTile({ scene }: { scene: AIVideoScene }) {
  return (
    <div
      className="relative rounded-md overflow-hidden aspect-[9/16]"
      style={{
        background: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {scene.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={scene.image_url}
          alt={`Scene ${scene.scene_index + 1}`}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : scene.status === "rendering_image" || scene.status === "animating" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size={16} />
        </div>
      ) : scene.status === "failed" ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-[10px] px-1 text-center"
          style={{ color: "#f87171" }}
        >
          Failed
        </div>
      ) : (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ background: "var(--bg-secondary)" }}
        />
      )}
      <div
        className="absolute bottom-0 left-0 right-0 text-[10px] px-1.5 py-0.5"
        style={{
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
        }}
      >
        {scene.scene_index + 1} · {scene.duration_seconds.toFixed(1)}s
      </div>
    </div>
  );
}

function VideoModal({ job, onClose }: { job: AIVideoJob; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const max =
    job.aspect_ratio === "16:9" ? "max-w-[800px]" : "max-w-[480px]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <div
        className={`relative ${max} w-full`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 p-1.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
          aria-label="Close"
        >
          <XIcon size={16} color="currentColor" />
        </button>
        {job.video_url && (
          <video
            src={job.video_url}
            controls
            autoPlay
            playsInline
            className="w-full rounded-xl bg-black"
          />
        )}
        <div className="mt-3 text-sm text-white">{job.prompt}</div>
        {job.hook && (
          <div className="mt-1 text-xs text-white/70 italic">
            Hook: {job.hook}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Niche components ─────────────────────────────────────────── */

function NicheCard({
  niche,
  onClick,
}: {
  niche: NichePreset;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative text-left rounded-xl overflow-hidden p-4 transition hover:scale-[1.02] active:scale-[0.99]"
      style={{
        background: niche.card_gradient,
        border: "1px solid var(--border-color)",
        minHeight: 120,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] font-semibold tracking-widest uppercase opacity-80"
            style={{ color: niche.accent_color }}
          >
            {niche.tagline || "Preset"}
          </div>
          <div className="text-base font-semibold text-white mt-0.5 truncate">
            {niche.name}
          </div>
          <div className="text-xs text-white/60 mt-0.5 truncate">
            {niche.handle}
          </div>
        </div>
        <div
          className="rounded-full p-2 transition group-hover:scale-110"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <SparkleIcon size={14} color={niche.accent_color} />
        </div>
      </div>
      <div className="text-xs text-white/80 mt-3 line-clamp-2">
        {niche.description}
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-white/50">
        <span className="uppercase tracking-wide">
          {niche.default_duration_seconds}s
        </span>
        <span>·</span>
        <span className="uppercase">{niche.default_mode}</span>
        <span>·</span>
        <span>{niche.default_aspect_ratio}</span>
        {niche.language !== "auto" && (
          <>
            <span>·</span>
            <span className="uppercase">{niche.language}</span>
          </>
        )}
      </div>
    </button>
  );
}

function NicheModal({
  niche,
  voices,
  onClose,
  onSubmit,
}: {
  niche: NichePreset;
  voices: VoiceOption[];
  onClose: () => void;
  onSubmit: (
    topic: string,
    overrides: {
      voiceId?: string;
      voiceEnabled?: boolean;
      subtitleStyle?: string;
    }
  ) => Promise<void>;
}) {
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [ideasError, setIdeasError] = useState("");

  // User overrides on top of the niche defaults.
  const [voiceId, setVoiceId] = useState<string>(niche.default_voice_id || "");
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(
    niche.default_voice_enabled ?? true
  );
  const [subtitleStyle, setSubtitleStyle] = useState<string>(
    niche.default_subtitle_style || "karaoke"
  );

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleFetchIdeas = async () => {
    setLoadingIdeas(true);
    setIdeasError("");
    try {
      const res = await aiVideosAPI.nicheTopicIdeas(niche.slug, 6);
      setIdeas(res.data?.topics ?? []);
      if (!res.data?.topics?.length) {
        setIdeasError("Aucune idée générée — reessaie dans un instant.");
      }
    } catch (e) {
      console.error(e);
      setIdeasError("L'IA n'a pas pu générer d'idées. Reessaie dans un instant.");
    } finally {
      setLoadingIdeas(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(topic, {
        voiceId: voiceEnabled && voiceId ? voiceId : undefined,
        voiceEnabled,
        subtitleStyle,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[560px] rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div
          className="p-5 flex items-start justify-between gap-3"
          style={{ background: niche.card_gradient }}
        >
          <div className="min-w-0 flex-1">
            <div
              className="text-[10px] font-semibold tracking-widest uppercase"
              style={{ color: niche.accent_color }}
            >
              {niche.tagline || "Preset"}
            </div>
            <div className="text-lg font-semibold text-white mt-0.5">
              {niche.name}
            </div>
            <div className="text-xs text-white/70 mt-0.5">{niche.handle}</div>
            <div className="text-xs text-white/80 mt-2">{niche.description}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md transition"
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
            }}
            aria-label="Close"
          >
            <XIcon size={14} color="currentColor" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <div
            className="text-xs font-medium mb-2 tracking-wide uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Ton thème (ou laisse vide &mdash; l&apos;IA choisit pour toi)
          </div>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={`ex. "l'énergie masculine", "l'ennui quotidien", "pourquoi on procrastine le soir"…`}
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y min-h-[56px]"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
            }}
          />

          {/* "Suggest topics" row */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleFetchIdeas}
              disabled={loadingIdeas}
              className="inline-flex items-center gap-1.5 text-xs rounded-md px-3 py-1.5 transition disabled:opacity-50"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {loadingIdeas ? (
                <Spinner size={12} />
              ) : (
                <MagicWand size={12} color="currentColor" />
              )}
              {ideas.length > 0 ? "Générer d'autres idées" : "Donne-moi 6 idées"}
            </button>
            <div
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Gratuit. Tu ne paies qu&apos;à la génération de la vidéo.
            </div>
          </div>

          {ideasError && (
            <div
              className="mt-2 text-[11px] rounded-md px-2 py-1.5"
              style={{
                background: "rgba(220, 38, 38, 0.08)",
                color: "#f87171",
                border: "1px solid rgba(220, 38, 38, 0.25)",
              }}
            >
              {ideasError}
            </div>
          )}

          {ideas.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-[210px] overflow-y-auto pr-1">
              {ideas.map((idea, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTopic(idea)}
                  className="w-full text-left text-xs rounded-md px-3 py-2 transition hover:opacity-100"
                  style={{
                    background: "var(--bg-primary)",
                    border:
                      topic === idea
                        ? `1px solid ${niche.accent_color}`
                        : "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                    opacity: topic === idea ? 1 : 0.9,
                  }}
                >
                  {idea}
                </button>
              ))}
            </div>
          )}

          {/* ── Voice + subtitle overrides ─────────────────────────
              Same UX as the main form: user can audition voices inline
              with ▶ before picking, and choose their subtitle preference
              without having to leave the modal. Defaults come from the
              niche preset — user overrides win. */}
          <div className="mt-4 grid grid-cols-1 gap-3">
            <div>
              <div
                className="text-xs font-medium mb-1 tracking-wide uppercase flex items-center justify-between"
                style={{ color: "var(--text-muted)" }}
              >
                <span>Voix off</span>
                <label
                  className="flex items-center gap-1.5 text-[10px] normal-case tracking-normal"
                  style={{ color: "var(--text-muted)" }}
                >
                  <input
                    type="checkbox"
                    checked={voiceEnabled}
                    onChange={(e) => setVoiceEnabled(e.target.checked)}
                    className="accent-current"
                  />
                  Activée
                </label>
              </div>
              {voiceEnabled ? (
                voices.length > 0 ? (
                  <VoicePicker
                    voices={voices}
                    value={voiceId}
                    onChange={setVoiceId}
                  />
                ) : (
                  <div
                    className="rounded-lg px-3 py-2 text-[11px]"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Chargement des voix ElevenLabs…
                  </div>
                )
              ) : (
                <div
                  className="rounded-lg px-3 py-2 text-[11px]"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-muted)",
                  }}
                >
                  Vidéo silencieuse (pas de voix).
                </div>
              )}
            </div>

            <div>
              <div
                className="text-xs font-medium mb-1 tracking-wide uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                Sous-titres
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "karaoke", label: "Karaoke", hint: "mot-par-mot" },
                  { id: "block", label: "Bloc", hint: "phrase" },
                  { id: "off", label: "Aucun", hint: "clean" },
                ].map((opt) => {
                  const active = subtitleStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSubtitleStyle(opt.id)}
                      className="rounded-lg px-2 py-1.5 text-xs text-center transition"
                      style={{
                        background: active
                          ? niche.accent_color
                          : "var(--bg-primary)",
                        color: active
                          ? "var(--bg-primary)"
                          : "var(--text-primary)",
                        border: active
                          ? `1px solid ${niche.accent_color}`
                          : "1px solid var(--border-color)",
                      }}
                    >
                      <div className="font-semibold">{opt.label}</div>
                      <div
                        className="text-[9px]"
                        style={{ opacity: active ? 0.8 : 0.7 }}
                      >
                        {opt.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Specs recap */}
          <div
            className="mt-4 rounded-lg p-3 text-[11px] leading-relaxed"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-muted)",
            }}
          >
            <div>
              <span className="opacity-80">Durée : </span>
              <b style={{ color: "var(--text-primary)" }}>
                {niche.default_duration_seconds}s
              </b>
              <span className="mx-2">·</span>
              <span className="opacity-80">Mode : </span>
              <b style={{ color: "var(--text-primary)" }}>
                {niche.default_mode === "motion" ? "Full Motion" : "Slideshow"}
              </b>
              <span className="mx-2">·</span>
              <span className="opacity-80">Format : </span>
              <b style={{ color: "var(--text-primary)" }}>
                {niche.default_aspect_ratio}
              </b>
            </div>
            {niche.recommended_hashtags.length > 0 && (
              <div className="mt-1.5">
                <span className="opacity-80">Hashtags conseillés : </span>
                {niche.recommended_hashtags.slice(0, 6).join(" ")}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-2 rounded-lg transition"
              style={{
                color: "var(--text-muted)",
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="text-xs px-4 py-2 rounded-lg font-medium transition flex items-center gap-1.5 disabled:opacity-50"
              style={{
                background: niche.accent_color,
                color: "var(--bg-primary)",
              }}
            >
              {submitting ? (
                <Spinner size={12} />
              ) : (
                <SparkleIcon size={12} color="currentColor" />
              )}
              {topic.trim() ? "Générer la vidéo" : "Surprise-moi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Voice picker with inline audio preview ──────────────────── */
//
// ElevenLabs' /v1/voices endpoint hands back a `preview_url` (mp3 sample)
// for every voice in the library. We surface that as a ▶ button next to
// each voice so the user can audition without leaving the page —
// exactly the UX elevenlabs.io itself has.
//
// A single <audio> element is shared across rows so starting a new
// preview always cuts off the previous one (no overlapping samples).

function VoicePicker({
  voices,
  value,
  onChange,
}: {
  voices: VoiceOption[];
  value: string;
  onChange: (voiceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Ensure we own exactly one <audio> instance for the component's lifetime.
  useEffect(() => {
    const a = new Audio();
    audioRef.current = a;
    const onEnd = () => setPlayingId(null);
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("ended", onEnd);
      audioRef.current = null;
    };
  }, []);

  // Close the popover when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = voices.find((v) => v.voice_id === value) ?? null;

  const togglePlay = (voice: VoiceOption, ev: React.MouseEvent) => {
    ev.stopPropagation();   // don't let the click also select the row
    const a = audioRef.current;
    if (!a || !voice.preview_url) return;

    if (playingId === voice.voice_id) {
      a.pause();
      setPlayingId(null);
      return;
    }
    // Switching voices — pause whatever was playing + load the new sample.
    a.pause();
    a.src = voice.preview_url;
    a.currentTime = 0;
    a.play().then(() => setPlayingId(voice.voice_id)).catch(() => {
      // Autoplay policies can block on first interaction; best-effort.
      setPlayingId(null);
    });
  };

  const selectVoice = (voiceId: string) => {
    onChange(voiceId);
    setOpen(false);
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none flex items-center justify-between gap-2"
        style={{
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <span className="truncate text-left">
          {selected ? (
            <>
              {selected.name}
              {selected.labels?.language ? (
                <span
                  className="ml-2 text-[10px] opacity-70 uppercase"
                >
                  {selected.labels.language}
                </span>
              ) : null}
            </>
          ) : (
            "Default (multilingual)"
          )}
        </span>
        <ChevronDown size={14} color="currentColor" />
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute left-0 right-0 mt-1 z-20 rounded-lg overflow-hidden"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {/* Default option */}
          <VoiceRow
            label="Default (multilingual)"
            sublabel="System default · Rachel"
            selected={!value}
            canPlay={false}
            playing={false}
            onPlay={() => {}}
            onSelect={() => selectVoice("")}
          />

          {/* Voices list — scrollable, cap height so big libraries fit */}
          <div className="max-h-[260px] overflow-y-auto">
            {voices.map((v) => {
              const subParts: string[] = [];
              if (v.labels?.language) subParts.push(v.labels.language);
              if (v.labels?.accent) subParts.push(v.labels.accent);
              if (v.labels?.gender) subParts.push(v.labels.gender);
              if (v.category) subParts.push(v.category);
              return (
                <VoiceRow
                  key={v.voice_id}
                  label={v.name}
                  sublabel={subParts.join(" · ")}
                  selected={v.voice_id === value}
                  canPlay={Boolean(v.preview_url)}
                  playing={playingId === v.voice_id}
                  onPlay={(ev) => togglePlay(v, ev)}
                  onSelect={() => selectVoice(v.voice_id)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceRow({
  label,
  sublabel,
  selected,
  canPlay,
  playing,
  onPlay,
  onSelect,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  canPlay: boolean;
  playing: boolean;
  onPlay: (ev: React.MouseEvent) => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-2 px-3 py-2 text-left transition"
      style={{
        background: selected ? "var(--bg-primary)" : "transparent",
        borderLeft: selected
          ? "2px solid var(--accent-primary)"
          : "2px solid transparent",
        color: "var(--text-primary)",
      }}
    >
      {/* Play button — on the left so the user can scrub previews without
          having to move their cursor across the row */}
      <span
        onClick={canPlay ? onPlay : undefined}
        role={canPlay ? "button" : undefined}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className="inline-flex items-center justify-center rounded-full w-7 h-7 shrink-0 transition"
        style={{
          background: canPlay
            ? playing
              ? "var(--accent-primary)"
              : "var(--bg-secondary)"
            : "transparent",
          color: playing ? "var(--bg-primary)" : "var(--text-primary)",
          opacity: canPlay ? 1 : 0.3,
          cursor: canPlay ? "pointer" : "default",
          border: "1px solid var(--border-color)",
        }}
      >
        <Play size={11} color="currentColor" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{label}</span>
        {sublabel && (
          <span
            className="block text-[10px] truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {sublabel}
          </span>
        )}
      </span>

      {selected && (
        <Check size={14} color="var(--accent-primary)" />
      )}
    </button>
  );
}

/* ─── Utilities ───────────────────────────────────────────────── */

function aspectToTailwind(ratio: string): string {
  switch (ratio) {
    case "9:16":
      return "aspect-[9/16]";
    case "1:1":
      return "aspect-square";
    case "4:5":
      return "aspect-[4/5]";
    case "16:9":
      return "aspect-[16/9]";
    default:
      return "aspect-[9/16]";
  }
}
