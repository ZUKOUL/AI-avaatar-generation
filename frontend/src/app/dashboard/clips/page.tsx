"use client";

/**
 * Auto-Clip page
 *
 * Paste a long-form URL (YouTube / Vimeo / TikTok / X), the backend
 * downloads it, picks the N most viral-ready moments, cuts them, reframes
 * to 9:16 (face-tracked when Sieve is configured), burns karaoke subtitles,
 * and returns N downloadable vertical shorts.
 *
 * UX flow:
 *   1. User pastes URL → picks count / aspect / subtitle style → submits.
 *   2. We fire `/clips/from-url`, prepend an in-flight job card.
 *   3. Polling loop refreshes every non-terminal job every 5s until done.
 *   4. Completed clips appear in the gallery below with play + download.
 *
 * The button stays clickable while jobs are running (you can queue
 * multiple in parallel, same pattern we shipped for the Ads page).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import { clipsAPI } from "@/lib/api";
import {
  Spinner,
  Scissors,
  Download,
  Play,
  Trash,
  XIcon,
  LinkIcon,
  Info,
} from "@/components/Icons";

/* ─── Types ───────────────────────────────────────────────────────── */

type JobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "detecting"
  | "cutting"
  | "completed"
  | "failed";

const TERMINAL_STATUSES: JobStatus[] = ["completed", "failed"];

const STATUS_COPY: Record<JobStatus, string> = {
  queued: "Queued",
  downloading: "Downloading source",
  transcribing: "Transcribing audio",
  detecting: "Picking viral moments",
  cutting: "Rendering clips",
  completed: "Done",
  failed: "Failed",
};

interface ClipJob {
  id: string;
  source_url: string;
  source_title: string | null;
  source_duration: number | null;
  language: string | null;
  requested_count: number;
  aspect_ratio: string;
  subtitle_style: string;
  status: JobStatus;
  progress: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface GeneratedClip {
  id: string;
  job_id: string;
  title: string | null;
  transcript: string | null;
  virality_score: number | null;
  reason: string | null;
  aspect_ratio: string;
  video_url: string;
  thumbnail_url: string | null;
  start_seconds: number;
  end_seconds: number;
  created_at: string;
}

const ASPECT_RATIOS = [
  { id: "9:16", label: "9:16 — Shorts / Reels / TikTok" },
  { id: "1:1", label: "1:1 — Square" },
  { id: "4:5", label: "4:5 — Instagram feed" },
];

const SUBTITLE_STYLES = [
  { id: "karaoke", label: "Karaoke (word-by-word)" },
  { id: "block", label: "Block (phrase-by-phrase)" },
  { id: "off", label: "None" },
];

/* ─── Page ────────────────────────────────────────────────────────── */

export default function ClipsPage() {
  // Form state -----------------------------------------------------------
  const [sourceUrl, setSourceUrl] = useState("");
  const [requestedCount, setRequestedCount] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [subtitleStyle, setSubtitleStyle] = useState("karaoke");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Data -----------------------------------------------------------------
  const [jobs, setJobs] = useState<ClipJob[]>([]);
  const [clipsByJob, setClipsByJob] = useState<Record<string, GeneratedClip[]>>({});
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Video player modal --------------------------------------------------
  const [playingClip, setPlayingClip] = useState<GeneratedClip | null>(null);

  // Polling -------------------------------------------------------------
  // We poll jobs that aren't terminal yet every 5s. A single interval
  // keeps things simple; when every job is done we stop it.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeJobs = useMemo(
    () => jobs.filter((j) => !TERMINAL_STATUSES.includes(j.status)),
    [jobs]
  );

  /* ─── Data loading ─── */

  const loadHistory = useCallback(async () => {
    try {
      const res = await clipsAPI.listJobs(50);
      const fetched: ClipJob[] = res.data?.jobs ?? [];
      setJobs(fetched);
      // For completed jobs (or anything that already has clips), fetch
      // their clip rows so we can show the gallery on reload.
      const activeIds = fetched.map((j) => j.id);
      const clipRes = await clipsAPI.listClips(200);
      const allClips: GeneratedClip[] = clipRes.data?.clips ?? [];
      const byJob: Record<string, GeneratedClip[]> = {};
      for (const c of allClips) {
        if (!activeIds.includes(c.job_id)) continue;
        (byJob[c.job_id] ??= []).push(c);
      }
      setClipsByJob(byJob);
    } catch (e) {
      console.error("Failed to load clip history:", e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /* ─── Polling loop ─── */

  const refreshActiveJobs = useCallback(async () => {
    if (activeJobs.length === 0) return;
    try {
      // Pull the full job+clips payload for each active job in parallel.
      const results = await Promise.all(
        activeJobs.map((j) => clipsAPI.getJob(j.id).then((r) => r.data).catch(() => null))
      );
      const updatedJobs = new Map(jobs.map((j) => [j.id, j]));
      const updatedClips = { ...clipsByJob };

      for (const r of results) {
        if (!r?.job) continue;
        updatedJobs.set(r.job.id, r.job as ClipJob);
        updatedClips[r.job.id] = (r.clips ?? []) as GeneratedClip[];
      }
      setJobs(Array.from(updatedJobs.values()));
      setClipsByJob(updatedClips);
    } catch (e) {
      console.error("Polling refresh failed:", e);
    }
  }, [activeJobs, jobs, clipsByJob]);

  useEffect(() => {
    if (activeJobs.length === 0) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    if (!pollTimer.current) {
      pollTimer.current = setInterval(() => {
        refreshActiveJobs();
      }, 5000);
    }
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [activeJobs.length, refreshActiveJobs]);

  /* ─── Submit ─── */

  const handleSubmit = async () => {
    setError("");
    setInfo("");
    const url = sourceUrl.trim();
    if (!url) {
      setError("Paste a YouTube / Vimeo / TikTok / X URL to clip.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("source_url", url);
      formData.append("requested_count", String(requestedCount));
      formData.append("aspect_ratio", aspectRatio);
      formData.append("subtitle_style", subtitleStyle);

      const res = await clipsAPI.fromUrl(formData);
      const jobId = res.data?.job_id as string | undefined;
      if (!jobId) throw new Error("Server didn't return a job id.");

      // Optimistic: prepend a minimal job card so the user sees instant feedback.
      const newJob: ClipJob = {
        id: jobId,
        source_url: url,
        source_title: null,
        source_duration: null,
        language: null,
        requested_count: requestedCount,
        aspect_ratio: aspectRatio,
        subtitle_style: subtitleStyle,
        status: "queued",
        progress: 0,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setJobs((prev) => [newJob, ...prev]);
      setClipsByJob((prev) => ({ ...prev, [jobId]: [] }));
      setSourceUrl("");
      setInfo(
        `Queued — ${requestedCount} clip${requestedCount > 1 ? "s" : ""} will appear below in 1-3 min.`
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

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm("Delete this clipping job and all of its clips?")) return;
    const snapshotJobs = jobs;
    const snapshotClips = clipsByJob;
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    setClipsByJob((prev) => {
      const copy = { ...prev };
      delete copy[jobId];
      return copy;
    });
    try {
      await clipsAPI.deleteJob(jobId);
    } catch (e) {
      console.error("Delete failed, rolling back:", e);
      setJobs(snapshotJobs);
      setClipsByJob(snapshotClips);
      setError("Delete failed. Try again.");
    }
  };

  const handleDeleteClip = async (clipId: string, jobId: string) => {
    if (!confirm("Delete this clip?")) return;
    const snapshot = clipsByJob[jobId] ?? [];
    setClipsByJob((prev) => ({
      ...prev,
      [jobId]: snapshot.filter((c) => c.id !== clipId),
    }));
    try {
      await clipsAPI.deleteClip(clipId);
    } catch (e) {
      console.error("Clip delete failed:", e);
      setClipsByJob((prev) => ({ ...prev, [jobId]: snapshot }));
      setError("Delete failed. Try again.");
    }
  };

  /* ─── Render ─── */

  return (
    <>
      <Header
        title="Auto-Clip"
        subtitle="Paste a long video, get viral shorts with subtitles"
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-6 md:py-10">
          {/* ── URL input form ────────────────────────────────────────── */}
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
              Source video URL
            </label>
            <div className="flex items-center gap-2 mb-4">
              <LinkIcon size={18} color="var(--text-muted)" />
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="flex-1 bg-transparent border-none outline-none text-base"
                style={{ color: "var(--text-primary)" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !submitting) handleSubmit();
                }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Count */}
              <div>
                <div
                  className="text-xs font-medium mb-1 tracking-wide uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clips
                </div>
                <select
                  value={requestedCount}
                  onChange={(e) => setRequestedCount(Number(e.target.value))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  {[1, 2, 3, 5, 7, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} clip{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {/* Aspect */}
              <div>
                <div
                  className="text-xs font-medium mb-1 tracking-wide uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Aspect ratio
                </div>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  {ASPECT_RATIOS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Subtitle style */}
              <div>
                <div
                  className="text-xs font-medium mb-1 tracking-wide uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Subtitles
                </div>
                <select
                  value={subtitleStyle}
                  onChange={(e) => setSubtitleStyle(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  {SUBTITLE_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Submit */}
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !sourceUrl.trim()}
                  className="w-full rounded-lg px-4 py-2 text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "var(--accent)",
                    color: "var(--bg-primary)",
                  }}
                >
                  {submitting ? (
                    <Spinner size={16} />
                  ) : (
                    <>
                      <Scissors size={16} color="currentColor" />
                      {activeJobs.length > 0
                        ? `Queue another (${activeJobs.length} running)`
                        : "Generate clips"}
                    </>
                  )}
                </button>
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

          {/* ── Job + clip list ────────────────────────────────────────── */}
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
                  clips={clipsByJob[job.id] ?? []}
                  onDeleteJob={() => handleDeleteJob(job.id)}
                  onDeleteClip={(clipId) => handleDeleteClip(clipId, job.id)}
                  onPlay={(clip) => setPlayingClip(clip)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Playback modal ─────────────────────────────────────────── */}
      {playingClip && (
        <ClipPlayerModal
          clip={playingClip}
          onClose={() => setPlayingClip(null)}
        />
      )}
    </>
  );
}

/* ─── Components ──────────────────────────────────────────────────── */

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
      <Scissors size={28} color="currentColor" />
      <p className="mt-3 text-sm">
        Paste any YouTube, Vimeo, TikTok or X URL above to generate your
        first batch of shorts.
      </p>
      <p className="mt-1 text-xs opacity-80">
        Each clip typically takes 1-3 minutes to produce.
      </p>
    </div>
  );
}

function JobCard({
  job,
  clips,
  onDeleteJob,
  onDeleteClip,
  onPlay,
}: {
  job: ClipJob;
  clips: GeneratedClip[];
  onDeleteJob: () => void;
  onDeleteClip: (clipId: string) => void;
  onPlay: (clip: GeneratedClip) => void;
}) {
  const isTerminal = TERMINAL_STATUSES.includes(job.status);
  const statusColor =
    job.status === "failed"
      ? "#f87171"
      : job.status === "completed"
        ? "#22c55e"
        : "var(--accent)";

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {/* Header row: source title + status + delete */}
      <div className="flex items-start justify-between gap-3 p-4 md:p-5">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {job.source_title || job.source_url}
          </div>
          <div
            className="text-xs mt-0.5 truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {job.source_url}
          </div>
          <div
            className="text-xs mt-1 flex items-center gap-3 flex-wrap"
            style={{ color: "var(--text-muted)" }}
          >
            <span>
              {job.requested_count} × {job.aspect_ratio}
            </span>
            {job.source_duration ? (
              <span>{Math.round(job.source_duration / 60)} min source</span>
            ) : null}
            {job.language ? <span>· {job.language.toUpperCase()}</span> : null}
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
            onClick={onDeleteJob}
            className="p-1.5 rounded-md transition hover:opacity-100 opacity-70"
            style={{ color: "var(--text-muted)" }}
            aria-label="Delete job"
          >
            <Trash size={16} color="currentColor" />
          </button>
        </div>
      </div>

      {/* Progress bar (only while running) */}
      {!isTerminal && (
        <div
          className="h-1 w-full"
          style={{ background: "var(--bg-primary)" }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.max(3, Math.min(100, job.progress))}%`,
              background: "var(--accent)",
            }}
          />
        </div>
      )}

      {/* Failure message */}
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

      {/* Clip grid */}
      {clips.length > 0 && (
        <div className="px-4 md:px-5 pb-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
            {clips.map((clip) => (
              <ClipTile
                key={clip.id}
                clip={clip}
                onPlay={() => onPlay(clip)}
                onDelete={() => onDeleteClip(clip.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Skeletons while we're still rendering */}
      {!isTerminal && clips.length < job.requested_count && (
        <div className="px-4 md:px-5 pb-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
            {Array.from({ length: Math.max(0, job.requested_count - clips.length) }).map(
              (_, i) => (
                <ClipSkeleton key={i} aspect={job.aspect_ratio} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ClipTile({
  clip,
  onPlay,
  onDelete,
}: {
  clip: GeneratedClip;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const aspect = aspectToTailwind(clip.aspect_ratio);
  return (
    <div
      className="group relative rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
      }}
    >
      <div className={`relative w-full ${aspect} bg-black`}>
        {clip.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clip.thumbnail_url}
            alt={clip.title || "Clip thumbnail"}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs">
            No preview
          </div>
        )}
        <button
          type="button"
          onClick={onPlay}
          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition"
          aria-label="Play clip"
        >
          <div className="opacity-0 group-hover:opacity-100 transition">
            <div
              className="rounded-full p-3"
              style={{ background: "rgba(255,255,255,0.9)" }}
            >
              <Play size={18} color="#000" />
            </div>
          </div>
        </button>
        {typeof clip.virality_score === "number" && (
          <div
            className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
            }}
          >
            {clip.virality_score}% 🔥
          </div>
        )}
      </div>

      <div className="p-3">
        <div
          className="text-xs font-medium line-clamp-2"
          style={{ color: "var(--text-primary)" }}
        >
          {clip.title || "Untitled clip"}
        </div>
        <div
          className="text-[10px] mt-1"
          style={{ color: "var(--text-muted)" }}
        >
          {formatSeconds(clip.start_seconds)} → {formatSeconds(clip.end_seconds)}
        </div>
        <div className="flex items-center justify-between mt-2">
          <a
            href={clip.video_url}
            download
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: "var(--accent)" }}
          >
            <Download size={12} color="currentColor" />
            Download
          </a>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 opacity-60 hover:opacity-100 transition"
            style={{ color: "var(--text-muted)" }}
            aria-label="Delete clip"
          >
            <Trash size={13} color="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ClipSkeleton({ aspect }: { aspect: string }) {
  return (
    <div
      className="rounded-lg overflow-hidden animate-pulse"
      style={{
        background: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
      }}
    >
      <div
        className={`w-full ${aspectToTailwind(aspect)}`}
        style={{ background: "var(--bg-secondary)" }}
      />
      <div className="p-3 space-y-2">
        <div
          className="h-3 w-3/4 rounded"
          style={{ background: "var(--bg-secondary)" }}
        />
        <div
          className="h-2 w-1/2 rounded"
          style={{ background: "var(--bg-secondary)" }}
        />
      </div>
    </div>
  );
}

function ClipPlayerModal({
  clip,
  onClose,
}: {
  clip: GeneratedClip;
  onClose: () => void;
}) {
  // Close on Escape — standard lightbox ergonomics.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)" }}
      onClick={onClose}
    >
      <div
        className="relative max-w-[480px] w-full"
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
        <video
          src={clip.video_url}
          controls
          autoPlay
          playsInline
          className="w-full rounded-xl bg-black"
        />
        {clip.title && (
          <div className="mt-3 text-sm text-white">{clip.title}</div>
        )}
        {clip.reason && (
          <div className="mt-1 text-xs text-white/70">{clip.reason}</div>
        )}
      </div>
    </div>
  );
}

/* ─── Utilities ───────────────────────────────────────────────────── */

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

function formatSeconds(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
