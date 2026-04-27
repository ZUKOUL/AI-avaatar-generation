"use client";

/**
 * Thumbnail Studio — Pikzels-style YouTube thumbnail generator.
 *
 * Four modes share the same canvas:
 *   • Prompt    – generate from scratch (text → image).
 *   • Recreate  – paste a YouTube URL, we scrape the existing thumbnail and
 *                 use it as a reference for the remix.
 *   • Edit      – upload an existing thumbnail and modify it.
 *   • Title     – generate with baked-in title text overlay.
 *
 * Characters can be "mentioned" with @name or added via the corner picker —
 * the picker exposes both the user's avatar library and an inline upload
 * path so a new face can be injected without leaving the page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import ThumbsModeTabs from "@/components/ThumbsModeTabs";
import SegmentToggle from "@/components/SegmentToggle";
import MediaDetailView, { MediaDetailItem } from "@/components/MediaDetailView";
import InspirationGallery from "@/components/studio/InspirationGallery";
import { avatarAPI, thumbnailAPI } from "@/lib/api";
import {
  Download,
  Eye,
  EyeSlash,
  ImageSquare,
  LinkIcon,
  MagicWand,
  Maximize,
  PlaySquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SparkleIcon,
  Spinner,
  Trash,
  Type,
  Upload,
  UserCircle,
  XIcon,
} from "@/components/Icons";

type Mode = "prompt" | "recreate" | "edit" | "title";
type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
type AspectChoice = AspectRatio | "auto";

/** Supported ratios ordered by descending w/h — used to snap an arbitrary
 *  source ratio to the closest supported value when "auto" is selected. */
const SUPPORTED_RATIOS: AspectRatio[] = ["16:9", "4:3", "1:1", "3:4", "9:16"];

function ratioValue(r: AspectRatio): number {
  const [w, h] = r.split(":").map(Number);
  return w / h;
}

/** Pick the supported ratio closest to a measured width/height pair. */
function closestRatio(width: number, height: number): AspectRatio {
  if (!width || !height) return "16:9";
  const target = width / height;
  let best: AspectRatio = "16:9";
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const r of SUPPORTED_RATIOS) {
    const delta = Math.abs(Math.log(ratioValue(r)) - Math.log(target));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = r;
    }
  }
  return best;
}

interface Avatar {
  avatar_id: string;
  name: string;
  thumbnail: string;
}

interface GeneratedThumbnail {
  thumbnail_id: string;
  image_url: string;
  mode: Mode;
  aspect_ratio: AspectRatio;
  prompt: string;
  created_at: string;
  source_thumbnail_url?: string | null;
  /**
   * Stable Supabase-hosted copy of the reference image (YouTube frame
   * for recreate mode, uploaded source for edit mode). Preferred over
   * `source_thumbnail_url` when present because the latter points at
   * the YouTube CDN which can rot.
   */
  reference_image_url?: string | null;
  /** Original YouTube URL — renders as a "Watch on YouTube" link. */
  source_url?: string | null;
  youtube_video_id?: string | null;
}

/**
 * A subject detected by Gemini 2.5 Flash (or drawn manually) in the source
 * thumbnail. Box is in fractional coordinates (0-1) relative to the rendered
 * image — we multiply by 100 to position the overlay with CSS percents.
 * `kind` is one of person/object/text/other for AI detections, or "custom"
 * for user-drawn rectangles.
 *
 * `mention_name` is a short, stable handle like "person1", "text2", "object3"
 * that the user can reference inside the prompt via `@person1`. Clicking a
 * box inserts its mention_name at the cursor; typing `@person1` highlights
 * the matching box. The label (full AI description) is what gets sent to
 * the model as `target_label` when the prompt contains the mention.
 */
interface DetectedSubject {
  id: string;
  label: string;
  mention_name: string;
  kind: "person" | "object" | "text" | "other" | "custom";
  is_main: boolean;
  box: { x: number; y: number; w: number; h: number };
}

/**
 * Assign a stable `mention_name` to every subject that doesn't have one yet.
 * Existing names are preserved (so a user-mentioned `@person1` keeps pointing
 * to the same box even after deletions). New ones get the next free number
 * per kind: `person1, person2, object1, text1, custom1…`.
 */
function assignMentionNames(subjects: DetectedSubject[]): DetectedSubject[] {
  const usedByKind: Record<string, Set<number>> = {};
  for (const s of subjects) {
    if (!s.mention_name) continue;
    const m = s.mention_name.match(/^([a-z]+)(\d+)$/i);
    if (!m) continue;
    const kind = m[1].toLowerCase();
    const n = parseInt(m[2], 10);
    usedByKind[kind] = usedByKind[kind] || new Set();
    usedByKind[kind].add(n);
  }
  const nextFree = (prefix: string): number => {
    const used = usedByKind[prefix] || new Set();
    let n = 1;
    while (used.has(n)) n++;
    used.add(n);
    usedByKind[prefix] = used;
    return n;
  };
  const prefixFor = (kind: DetectedSubject["kind"]): string => {
    if (kind === "person") return "person";
    if (kind === "object") return "object";
    if (kind === "text") return "text";
    if (kind === "custom") return "custom";
    return "item";
  };
  return subjects.map((s) => {
    if (s.mention_name) return s;
    const prefix = prefixFor(s.kind);
    const n = nextFree(prefix);
    return { ...s, mention_name: `${prefix}${n}` };
  });
}

const MODE_ITEMS: { key: Mode; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { key: "prompt", label: "Prompt", Icon: MagicWand },
  { key: "recreate", label: "Recreate", Icon: LinkIcon },
  { key: "edit", label: "Edit", Icon: Pencil },
  { key: "title", label: "Title", Icon: Type },
];

/* ─── Small SVG glyphs for each aspect ratio ─────────────────────────────────
 * A filled rectangle sized to the ratio, centered in an 18×18 viewBox. Gives
 * the user an immediate visual of what "16:9" actually looks like vs "9:16"
 * without eating horizontal space. */
function RatioIcon({ ratio }: { ratio: AspectRatio }) {
  const dims: Record<AspectRatio, [number, number]> = {
    "16:9": [16, 9],
    "9:16": [9, 16],
    "1:1": [12, 12],
    "4:3": [14, 10],
    "3:4": [10, 14],
  };
  const [w, h] = dims[ratio];
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect
        x={(18 - w) / 2}
        y={(18 - h) / 2}
        width={w}
        height={h}
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

/** "Auto" icon: two interlocking rectangles suggesting shape-matching. */
function AutoRatioIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2" y="4" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.55" />
      <rect x="7" y="7" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

const ASPECT_ITEMS: { key: AspectChoice; icon: React.ReactNode }[] = [
  { key: "auto", icon: <AutoRatioIcon /> },
  { key: "16:9", icon: <RatioIcon ratio="16:9" /> },
  { key: "9:16", icon: <RatioIcon ratio="9:16" /> },
  { key: "1:1", icon: <RatioIcon ratio="1:1" /> },
  { key: "4:3", icon: <RatioIcon ratio="4:3" /> },
  { key: "3:4", icon: <RatioIcon ratio="3:4" /> },
];

const SAMPLE_PROMPTS: Record<Mode, string[]> = {
  prompt: [
    "A surprised creator pointing at a giant glowing dollar sign",
    "Side-by-side comparison of two iPhones with explosive neon lighting",
    "A minimalist gym thumbnail: single dumbbell, sharp shadow, bold mood",
  ],
  recreate: [
    "Make the expression angrier and add smoke behind the subject",
    "Swap the background for a clean white studio",
    "Add a huge red arrow pointing at the product",
  ],
  edit: [
    "Remove the channel logo and clean up the background",
    "Brighten the subject and increase contrast",
    "Replace the sky with a dramatic sunset",
  ],
  title: [
    "MrBeast-style giant text with a shocked reaction",
    "Minimal serif title, subject centered, soft lighting",
    "Bold text with a drop shadow — clean layout",
  ],
};

export default function ThumbnailStudio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("prompt");
  const [prompt, setPrompt] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [titleText, setTitleText] = useState("");
  /**
   * "auto" = match the source image's ratio at submit time (falls back to 16:9
   * if we don't have a source yet). Anything else is sent verbatim.
   */
  const [aspectRatio, setAspectRatio] = useState<AspectChoice>("auto");
  const [refs, setRefs] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  /** Natural (pixel) dimensions of whatever source image we're showing in the
   *  editor (uploaded file or YouTube preview). Used for the "auto" ratio. */
  const [sourceNaturalSize, setSourceNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedThumbnail[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  /* ─── Gallery selection (mirrors /dashboard/images) ───
   * Checkmark on each tile drops the thumbnail into this Set. The header rail
   * flips into an action bar as soon as something's selected so users can
   * bulk reuse / download / delete without opening each lightbox. */
  const [selectedThumbIds, setSelectedThumbIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Gallery sub-tabs — switches the section below the composer between
  // the user's own thumbnails (history) and the curated templates
  // strip. Defaults to "Galerie" so returning users see their own
  // creations first.
  const [gallerySubTab, setGallerySubTab] = useState<"gallery" | "templates">(
    "gallery",
  );
  // Aspect ratio popover open state. The toolbar shows a single
  // ratio icon (Pikzels pattern); clicking it opens a small menu
  // with all the options instead of stretching them across the row.
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const aspectMenuRef = useRef<HTMLDivElement>(null);

  /* ─── Avatars library + @mentions ─── */
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  // IDs of avatars currently attached (from @mentions or the picker). These
  // get resolved to File objects at submit time by downloading the thumbnail.
  const [mentionedAvatarIds, setMentionedAvatarIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const mentionStartRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Clicking an @name chip in the prompt opens a dropdown to swap it to
  // another avatar without retyping. We anchor the dropdown to the chip's
  // bounding rect so it tracks regardless of scroll/layout.
  const [chipDropdown, setChipDropdown] = useState<
    { avatarId: string; pos: { top: number; left: number } } | null
  >(null);

  /* ─── "Add character" popover ─── */
  const [charPickerOpen, setCharPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"library" | "upload">("library");
  const [librarySearch, setLibrarySearch] = useState("");
  const [newCharName, setNewCharName] = useState("");
  const [newCharFiles, setNewCharFiles] = useState<File[]>([]);
  const [newCharPreviews, setNewCharPreviews] = useState<string[]>([]);
  const [creatingChar, setCreatingChar] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const newCharInputRef = useRef<HTMLInputElement>(null);

  // YouTube preview (debounced)
  const [ytPreview, setYtPreview] = useState<{ videoId: string; url: string } | null>(null);
  const ytDebounceRef = useRef<number | null>(null);
  // Flips true as soon as a YouTube URL is being typed/pasted — stays true
  // through the debounce + fetch so the input shows a loading bar and the
  // user immediately feels that their paste "took".
  const [loadingYtPreview, setLoadingYtPreview] = useState(false);

  /* ─── Auto-describe pasted YouTube URLs ───
   * When the user pastes a YouTube link into the prompt, we call the
   * backend's /describe-youtube-thumbnail endpoint which fetches the
   * video's thumbnail, runs it through Gemini, and returns a rich prompt.
   * We then swap the raw URL in the prompt state with the description —
   * preserving any text before/after the paste. The set tracks which
   * URLs are currently being described so we can show a spinner inline
   * and so a rapid double-paste doesn't fire twice. */
  const [describingYoutubeUrls, setDescribingYoutubeUrls] = useState<Set<string>>(
    new Set(),
  );

  /* ─── Smart Prompt form ───
   * User fills in niche + video title + optional description, backend
   * searches YouTube for top thumbnails in that space, Gemini analyses
   * them and returns a tailored generation prompt. */
  const [smartNiche, setSmartNiche] = useState("");
  const [smartTitle, setSmartTitle] = useState("");
  const [smartDesc, setSmartDesc] = useState("");
  const [generatingSmartPrompt, setGeneratingSmartPrompt] = useState(false);
  const [showSmartPrompt, setShowSmartPrompt] = useState(false);

  /* ─── Subject detection on the source thumbnail ───
   * When a YouTube URL is validated or a source image is uploaded we ship
   * the bytes to Gemini 2.5 Flash, get back bounding boxes for people,
   * objects and text, and let the user click the one they want to replace.
   * The selected label becomes the `target_label` hint on generate.
   *
   * The user can also disable detection entirely (toggle) if their source has
   * no humans/objects worth targeting, or draw their own boxes manually. */
  const [detectionEnabled, setDetectionEnabled] = useState(true);
  const [detectedSubjects, setDetectedSubjects] = useState<DetectedSubject[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  // Which source image hash has already been detected — avoids re-running on
  // every render. Keyed by youtube videoId or object URL.
  const lastDetectedKey = useRef<string | null>(null);

  /* ─── Interactive box editing ───
   * Boxes can be dragged by their body, resized from any of 4 corners, and
   * new custom boxes can be drawn by click-dragging on the empty preview. */
  type DragState =
    | { kind: "move"; id: string; startX: number; startY: number; origBox: DetectedSubject["box"] }
    | { kind: "resize"; id: string; corner: "nw" | "ne" | "sw" | "se"; startX: number; startY: number; origBox: DetectedSubject["box"] }
    | { kind: "draw"; id: string; startX: number; startY: number };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  /* ─── Subject → avatar popover ───
   * Tapping a detection box opens an inline popover anchored to that box so
   * the user can pick an avatar to swap in without ever touching the prompt
   * field. The picked avatar's @mention is wired in right after the
   * subject's @mention so handleGenerate's existing scan turns it into a
   * `target_label` + reference image pair. */
  const [subjectPopoverId, setSubjectPopoverId] = useState<string | null>(null);
  const [subjectPopoverSearch, setSubjectPopoverSearch] = useState("");
  const subjectPopoverRef = useRef<HTMLDivElement | null>(null);
  // Viewport coordinates of the click that opened the popover. Anchoring to
  // the click point (not the box edges) means the popover always appears
  // "where the user just pointed", which matters for tall detection boxes
  // whose top/bottom edges can be far apart — otherwise a click near the
  // bottom of a tall box could spawn a popover anchored near the top edge
  // and end up half-off-screen.
  const clickPosRef = useRef<{ x: number; y: number } | null>(null);
  // Which UI the popover shows: "character" = avatar picker, "describe" =
  // free-form "what should happen with this thing?" input. `null` means
  // "use the default for the box's kind" (person/custom → character,
  // object/text/other → describe). The user can override either way.
  const [subjectPopoverMode, setSubjectPopoverMode] = useState<
    "character" | "describe" | null
  >(null);
  const [subjectDescribeText, setSubjectDescribeText] = useState("");

  /* ─── Popover anchor tracking ───
   * We portalize the subject popover to <body> so it can't be clipped by
   * the preview's `overflow: hidden`, and use `position: fixed` so it
   * renders on top of every layer on the page. That means we have to
   * compute its coordinates ourselves every time the preview moves — on
   * scroll, resize, or when the box changes.
   *
   * `previewRect` is the preview container's viewport-space rect; the
   * popover multiplies this by the subject's fractional box to get
   * pixel-perfect anchor points. Updated via rAF whenever the popover is
   * open so it tracks the box through any scroll container. */
  const [previewRect, setPreviewRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!subjectPopoverId) {
      setPreviewRect(null);
      return;
    }
    let frame = 0;
    const update = () => {
      const el = previewContainerRef.current;
      if (el) setPreviewRect(el.getBoundingClientRect());
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    update();
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [subjectPopoverId]);

  const refInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  /**
   * An @-autocomplete option is either an avatar from the library (resolves
   * to a face ref at submit time) or a subject detected in the source image
   * (resolves to a `target_label` — "replace this thing"). Rendering and
   * handler logic differ so we use a tagged union.
   */
  type MentionOption =
    | { kind: "avatar"; avatar: Avatar }
    | { kind: "subject"; subject: DetectedSubject };

  const mentionFiltered: MentionOption[] =
    mentionQuery !== null
      ? [
          // Detected subjects come first — they're usually what the user just
          // clicked on, and they're contextual to this specific thumbnail.
          ...detectedSubjects
            .filter((s) =>
              s.mention_name.toLowerCase().includes(mentionQuery.toLowerCase()),
            )
            .map((s): MentionOption => ({ kind: "subject", subject: s })),
          ...avatars
            .filter((a) => a.name.toLowerCase().includes(mentionQuery.toLowerCase()))
            .map((a): MentionOption => ({ kind: "avatar", avatar: a })),
        ].slice(0, 8)
      : [];

  /* ─── Load avatars on mount ─── */
  useEffect(() => {
    avatarAPI
      .list()
      .then((res) => setAvatars(res.data.avatars || []))
      .catch(() => setAvatars([]));
  }, []);

  /* ─── Load persistent thumbnail history on mount ───
   * The backend stores every generated thumbnail in the media table; hitting
   * /thumbnail/history returns the user's full catalogue. This replaces the
   * previous session-only state. */
  useEffect(() => {
    setHistoryLoading(true);
    // `500` matches the bumped backend cap — we want the full catalogue in
    // the gallery, not just the most recent generations. Anything older
    // than that can be paginated later if it becomes a concern.
    thumbnailAPI
      .list(500)
      .then((res) => {
        type Row = {
          thumbnail_id: string;
          image_url: string;
          prompt: string;
          mode: Mode;
          aspect_ratio: AspectRatio;
          created_at: string;
          source_thumbnail_url?: string | null;
          reference_image_url?: string | null;
          source_url?: string | null;
          youtube_video_id?: string | null;
        };
        const rows: Row[] = res.data.thumbnails || [];
        setHistory(
          rows.map((r) => ({
            thumbnail_id: r.thumbnail_id,
            image_url: r.image_url,
            prompt: r.prompt || "",
            mode: (r.mode as Mode) || "prompt",
            aspect_ratio: (r.aspect_ratio as AspectRatio) || "16:9",
            created_at: r.created_at,
            source_thumbnail_url: r.source_thumbnail_url ?? null,
            reference_image_url: r.reference_image_url ?? null,
            source_url: r.source_url ?? null,
            youtube_video_id: r.youtube_video_id ?? null,
          })),
        );
      })
      .catch(() => {
        // Swallow — history is additive, not critical.
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  /* ─── Close picker on outside click ─── */
  useEffect(() => {
    if (!charPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setCharPickerOpen(false);
      }
    };
    // defer so the opening click doesn't immediately close it
    const t = window.setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [charPickerOpen]);

  /* ─── Close aspect menu on outside click ─── */
  useEffect(() => {
    if (!aspectMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        aspectMenuRef.current &&
        !aspectMenuRef.current.contains(e.target as Node)
      ) {
        setAspectMenuOpen(false);
      }
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [aspectMenuOpen]);

  /* ─── Close chip dropdown on outside click ─── */
  useEffect(() => {
    if (!chipDropdown) return;
    const handler = () => setChipDropdown(null);
    const t = window.setTimeout(
      () => document.addEventListener("click", handler, { once: true }),
      0,
    );
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("click", handler);
    };
  }, [chipDropdown]);

  /* ─── Close subject popover on outside click / ESC ─── */
  useEffect(() => {
    if (!subjectPopoverId) return;
    const handleClick = (e: MouseEvent) => {
      if (
        subjectPopoverRef.current &&
        !subjectPopoverRef.current.contains(e.target as Node)
      ) {
        setSubjectPopoverId(null);
        setSubjectPopoverSearch("");
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSubjectPopoverId(null);
        setSubjectPopoverSearch("");
      }
    };
    // Defer click handler so the opening mouseup doesn't immediately close it.
    const t = window.setTimeout(
      () => document.addEventListener("mousedown", handleClick),
      0,
    );
    document.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [subjectPopoverId]);

  /* ─── Auto-close the popover if its subject gets deleted ───
   * Prevents a stale popover pointing at a box that no longer exists. */
  useEffect(() => {
    if (
      subjectPopoverId &&
      !detectedSubjects.some((s) => s.id === subjectPopoverId)
    ) {
      setSubjectPopoverId(null);
      setSubjectPopoverSearch("");
    }
  }, [detectedSubjects, subjectPopoverId]);

  /* ─── Reset popover-specific state when we switch boxes ───
   * Otherwise "describe change" text from box A would bleed into box B. */
  useEffect(() => {
    setSubjectPopoverMode(null);
    setSubjectDescribeText("");
  }, [subjectPopoverId]);

  /* ─── Close the CHIP dropdown on scroll (subject popover sticks around) ───
   * The chip dropdown is `position: fixed` so when the user scrolls the main
   * content, the dropdown would otherwise stay glued to the same viewport
   * coordinates instead of following the chip that spawned it — it looks
   * like the menu is chasing the user down the page. Easier to just close it.
   *
   * The subject popover used to close on scroll too, but users found that
   * disruptive: scrolling inside the popover's avatar list or even just
   * nudging the page down would dismiss their edit. It's now portalized
   * and re-positioned against the preview's bounding rect on every scroll
   * (see `popoverAnchor` effect below), so it follows the subject box
   * through any kind of scroll without closing. */
  useEffect(() => {
    if (!chipDropdown) return;
    const onScroll = (e: Event) => {
      // Scroll originated inside the chip dropdown itself → user is
      // navigating the list, not trying to dismiss.
      const target = e.target as Node | null;
      if (target && target instanceof Element) {
        if (target.closest("[data-popover-root]")) return;
      }
      setChipDropdown(null);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [chipDropdown]);

  /* ─── Reference images (manual upload) ─── */
  const handleRefFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 5 - refs.length);
    if (arr.length === 0) return;
    const newPreviews: string[] = arr.map((f) => URL.createObjectURL(f));
    setRefs((prev) => [...prev, ...arr]);
    setRefPreviews((prev) => [...prev, ...newPreviews]);
  };
  const removeRef = (i: number) => {
    setRefs((prev) => prev.filter((_, idx) => idx !== i));
    setRefPreviews((prev) => {
      const [removed] = prev.splice(i, 1);
      if (removed) URL.revokeObjectURL(removed);
      return [...prev];
    });
  };

  /* ─── Source file (edit mode) ─── */
  const handleSourceFile = (file: File) => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setSourceFile(file);
    setSourcePreview(URL.createObjectURL(file));
    setSourceNaturalSize(null);
  };
  const clearSource = () => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setSourceFile(null);
    setSourcePreview(null);
    setSourceNaturalSize(null);
  };

  /* ─── Hydrate from URL params ───
   * When the user clicks "Reuse this source" from the image-gallery
   * lightbox (on /dashboard/images) we navigate here with `?ref=<url>
   * &yt=<url>&prompt=<text>`. Read those once on mount, pre-fill the
   * composer, and strip them off the URL so a refresh doesn't re-apply
   * them. The reused-from-thumbnails flow (the `onReuseSource` wired up
   * in the lightbox here) mutates state directly and doesn't touch the
   * URL — this hook is specifically for the cross-page entry. */
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    const ref = searchParams.get("ref");
    const yt = searchParams.get("yt");
    const seededPrompt = searchParams.get("prompt");
    // ytDescribe: navigate to prompt mode, auto-describe the YouTube thumbnail
    const ytDescribe = searchParams.get("ytDescribe");
    if (!ref && !yt && !seededPrompt && !ytDescribe) return;
    hydratedRef.current = true;

    if (seededPrompt) setPrompt(seededPrompt);

    if (ytDescribe) {
      // Prompt mode — show the YouTube URL immediately, trigger the same
      // describing animation used by manual paste, then replace with AI description.
      setMode("prompt");
      setPrompt(ytDescribe);
      // Adding to describingYoutubeUrls fires the blue shimmer + spinner badge
      // so the user sees something is loading right away.
      setDescribingYoutubeUrls((prev) => new Set(prev).add(ytDescribe));
      thumbnailAPI
        .describeYoutube(ytDescribe)
        .then((res) => {
          const desc = (res.data?.description || "").trim();
          if (desc) setPrompt(desc);
        })
        .catch(() => {
          // Leave the URL as-is if the describe call fails.
        })
        .finally(() => {
          setDescribingYoutubeUrls((prev) => {
            const next = new Set(prev);
            next.delete(ytDescribe);
            return next;
          });
        });
    } else if (yt) {
      // Recreate mode — the backend re-fetches the YouTube frame so we
      // don't need to download `ref` ourselves. Setting the URL triggers
      // the existing preview effect.
      setMode("recreate");
      setYoutubeUrl(yt);
    } else if (ref) {
      // Edit mode — pull the reference bytes and drop them into the
      // source slot so the preview renders immediately.
      setMode("edit");
      fetch(ref)
        .then((r) => r.blob())
        .then((blob) => {
          const f = new File([blob], "reused-source.png", {
            type: blob.type || "image/png",
          });
          handleSourceFile(f);
        })
        .catch(() => {
          // Silent failure — the user still has an empty composer they
          // can fill manually.
        });
    }

    // Strip the params so reloads don't re-hydrate (which would clobber
    // any edits the user made after landing here).
    router.replace("/dashboard/thumbnails");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Auto-describe YouTube URLs pasted into the prompt ───
   * This intercepts paste events *without* preventing them — the raw URL
   * still lands in the textarea so the user sees immediate feedback. Then
   * we fire a background request to the backend that returns a rich
   * description of the video's thumbnail. Once the description comes back,
   * we replace the URL in the prompt with the description, preserving any
   * surrounding text the user typed before/after.
   *
   * Matches every youtube.com / youtu.be / shorts / embed variant — same
   * regex the backend uses so the two are guaranteed to agree on what
   * counts as a "YouTube URL".
   *
   * If the backend call fails (network, quota, private video), we just
   * leave the URL in place — that's strictly better than wiping the
   * paste silently. */
  const YT_URL_RE =
    /(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)[A-Za-z0-9_\-]{11}(?:[^\s]*)?)/g;
  // Generic URL matcher — used to catch Twitter / X / Instagram / TikTok /
  // LinkedIn / blog links that the backend's og:image scraper can handle.
  // Excludes URLs already caught by YT_URL_RE so we don't double-fire.
  const ANY_URL_RE = /(https?:\/\/[^\s<>"']+)/g;

  /**
   * Send an arbitrary image File through the backend describe endpoint
   * and replace the prompt with the returned paragraph. Reuses the same
   * `describingYoutubeUrls` spinner state — the badge label says "URL"
   * but the user only cares that something is loading.
   */
  const describePastedOrDroppedImage = (file: File) => {
    const tag = `image:${file.name || "clipboard"}:${Date.now()}`;
    setDescribingYoutubeUrls((prev) => new Set(prev).add(tag));
    thumbnailAPI
      .describeImage(file)
      .then((res) => {
        const desc = (res.data?.description || "").trim();
        if (!desc) return;
        setPrompt((p) => (p ? p + (p.endsWith(" ") || p.endsWith("\n") ? "" : " ") + desc : desc));
      })
      .catch((err) => {
        console.warn("describeImage failed:", err);
      })
      .finally(() => {
        setDescribingYoutubeUrls((prev) => {
          const next = new Set(prev);
          next.delete(tag);
          return next;
        });
      });
  };

  /**
   * Send a non-YouTube URL through the og:image describe endpoint and
   * splice the description back into the prompt where the URL was.
   */
  const describeAnyUrl = (url: string) => {
    if (describingYoutubeUrls.has(url)) return;
    setDescribingYoutubeUrls((prev) => new Set(prev).add(url));
    thumbnailAPI
      .describeUrl(url)
      .then((res) => {
        const desc = (res.data?.description || "").trim();
        if (!desc) return;
        setPrompt((p) => {
          const idx = p.indexOf(url);
          if (idx === -1) return p;
          return p.slice(0, idx) + desc + p.slice(idx + url.length);
        });
      })
      .catch((err) => {
        // 404 / scraper-blocked → leave the URL in place silently.
        console.warn("describeUrl failed:", err);
      })
      .finally(() => {
        setDescribingYoutubeUrls((prev) => {
          const next = new Set(prev);
          next.delete(url);
          return next;
        });
      });
  };

  const handlePromptPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // 1. Image paste — clipboard contains a copied image (e.g. screenshot
    //    in macOS, "copy image" from a browser, etc.). The describe call
    //    runs the same Gemini Flash prompt as URL paste and appends the
    //    paragraph to the prompt textarea.
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find((it) => it.kind === "file" && it.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault(); // suppress the default "paste raw bytes as text" attempt
        describePastedOrDroppedImage(file);
        return;
      }
    }

    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;

    // 2. YouTube URLs — use the existing rich CDN path (better quality
    //    than scraping the watch page).
    const ytUrls = Array.from(pasted.matchAll(YT_URL_RE), (m) => m[1]);
    const ytSet = new Set(ytUrls.map((u) => u.replace(/[),.;]+$/, "")));
    for (const rawUrl of ytUrls) {
      const url = rawUrl.replace(/[),.;]+$/, "");
      if (describingYoutubeUrls.has(url)) continue;
      setDescribingYoutubeUrls((prev) => new Set(prev).add(url));
      thumbnailAPI
        .describeYoutube(url)
        .then((res) => {
          const desc = (res.data?.description || "").trim();
          if (!desc) return;
          setPrompt((p) => {
            const idx = p.indexOf(url);
            if (idx === -1) return p;
            return p.slice(0, idx) + desc + p.slice(idx + url.length);
          });
        })
        .catch((err) => {
          console.warn("describeYoutube failed:", err);
        })
        .finally(() => {
          setDescribingYoutubeUrls((prev) => {
            const next = new Set(prev);
            next.delete(url);
            return next;
          });
        });
    }

    // 3. Any OTHER URL (Twitter, Instagram, TikTok, LinkedIn, blog, …) —
    //    backend scrapes og:image / twitter:image and describes it.
    const otherUrls = Array.from(pasted.matchAll(ANY_URL_RE), (m) => m[1])
      .map((u) => u.replace(/[),.;]+$/, ""))
      .filter((u) => !ytSet.has(u));
    for (const url of otherUrls) {
      describeAnyUrl(url);
    }
  };

  /**
   * Drop handler for the prompt textarea wrapper. Accepts image files
   * dragged from Finder, browser, etc. Mirrors the paste flow.
   */
  const handlePromptDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
      (f.type || "").startsWith("image/")
    );
    if (files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    files.forEach((f) => describePastedOrDroppedImage(f));
  };

  /* ─── Paste from clipboard button ─── */
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      // If textarea is focused, insert at cursor; otherwise replace the whole value.
      const ta = textareaRef.current;
      if (ta && document.activeElement === ta) {
        const start = ta.selectionStart ?? prompt.length;
        const end = ta.selectionEnd ?? prompt.length;
        const next = prompt.slice(0, start) + text + prompt.slice(end);
        setPrompt(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + text.length;
          ta.focus();
        });
      } else {
        setPrompt(text);
        requestAnimationFrame(() => ta?.focus());
      }
      // Also trigger YouTube URL auto-describe, same as keyboard Ctrl+V paste
      const ytRe = /(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)[A-Za-z0-9_\-]{11}(?:[^\s]*)?)/g;
      const urls = Array.from(text.matchAll(ytRe), (m) => m[1]);
      for (const rawUrl of urls) {
        const url = rawUrl.replace(/[),.;]+$/, "");
        setDescribingYoutubeUrls((prev) => {
          if (prev.has(url)) return prev;
          return new Set(prev).add(url);
        });
        thumbnailAPI
          .describeYoutube(url)
          .then((res) => {
            const desc = (res.data?.description || "").trim();
            if (!desc) return;
            setPrompt((p) => {
              const idx = p.indexOf(url);
              if (idx === -1) return p;
              return p.slice(0, idx) + desc + p.slice(idx + url.length);
            });
          })
          .catch((err) => console.warn("describeYoutube failed:", err))
          .finally(() => {
            setDescribingYoutubeUrls((prev) => {
              const next = new Set(prev);
              next.delete(url);
              return next;
            });
          });
      }
    } catch {
      // Clipboard API not available or permission denied — silently ignore
    }
  }, [prompt]);

  /* ─── Smart Prompt generation ─── */
  const handleSmartPrompt = useCallback(async () => {
    if (!smartNiche.trim() || !smartTitle.trim() || generatingSmartPrompt) return;
    setGeneratingSmartPrompt(true);
    setPrompt(""); // clear any existing text so the form stays visible
    try {
      const form = new FormData();
      form.append("niche", smartNiche.trim());
      form.append("video_title", smartTitle.trim());
      if (smartDesc.trim()) form.append("video_description", smartDesc.trim());
      const res = await thumbnailAPI.smartPrompt(form);
      const generated = (res.data?.prompt || "").trim();
      if (generated) {
        setPrompt(generated);
        setShowSmartPrompt(false); // collapse the form so the prompt is visible
      }
    } catch (err) {
      console.error("Smart prompt generation failed:", err);
    } finally {
      setGeneratingSmartPrompt(false);
    }
  }, [smartNiche, smartTitle, smartDesc, generatingSmartPrompt]);

  /* ─── @mention system ─── */
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart || 0;
    setPrompt(val);

    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@([^\s@]*)$/);
    if (atMatch) {
      mentionStartRef.current = cursor - atMatch[1].length - 1;
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
      const ta = textareaRef.current;
      if (ta) {
        const rect = ta.getBoundingClientRect();
        const lines = textBefore.split("\n");
        const lineHeight = 22;
        const charWidth = 7.5;
        setMentionPos({
          top: rect.top + Math.min((lines.length - 1) * lineHeight, rect.height - 12) + lineHeight + 6,
          left: rect.left + Math.min(lines[lines.length - 1].length * charWidth, rect.width - 220) + 12,
        });
      }
    } else {
      setMentionQuery(null);
      mentionStartRef.current = null;
    }
  };

  const selectMention = (opt: MentionOption) => {
    const start = mentionStartRef.current;
    if (start === null) return;
    const before = prompt.slice(0, start);
    const cursor = textareaRef.current?.selectionStart || prompt.length;
    const after = prompt.slice(cursor);
    const name = opt.kind === "avatar" ? opt.avatar.name : opt.subject.mention_name;
    setPrompt(`${before}@${name}  ${after}`);
    if (opt.kind === "avatar") {
      // Track the mentioned avatar so we can attach its photo at submit time.
      setMentionedAvatarIds((prev) =>
        prev.includes(opt.avatar.avatar_id) ? prev : [...prev, opt.avatar.avatar_id],
      );
    } else {
      // Surfacing the box visually tells the user "this is what got picked".
      setSelectedSubjectId(opt.subject.id);
    }
    setMentionQuery(null);
    mentionStartRef.current = null;
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        const pos = before.length + name.length + 3;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  // Swap an already-mentioned character for a different one in-place. Rewrites
  // the @name in the prompt text and refreshes the tracked avatar IDs so the
  // generate call picks up the new reference image.
  const switchMention = (oldId: string, newAvatar: Avatar) => {
    const old = avatars.find((a) => a.avatar_id === oldId);
    if (!old) return;
    if (old.avatar_id === newAvatar.avatar_id) {
      setChipDropdown(null);
      return;
    }
    const re = new RegExp(
      `@${old.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    );
    setPrompt((p) => p.replace(re, `@${newAvatar.name}`));
    setMentionedAvatarIds((prev) => {
      const next = prev.filter((id) => id !== oldId);
      return next.includes(newAvatar.avatar_id) ? next : [...next, newAvatar.avatar_id];
    });
    setChipDropdown(null);
  };

  // Keep mentionedAvatarIds in sync when user deletes @mention from prompt.
  useEffect(() => {
    setMentionedAvatarIds((ids) =>
      ids.filter((id) => {
        const av = avatars.find((a) => a.avatar_id === id);
        if (!av) return false;
        const re = new RegExp(
          `@${av.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`,
          "i",
        );
        return re.test(prompt);
      }),
    );
  }, [prompt, avatars]);

  /**
   * Toggle a detected subject's `@mention` inside the prompt. If it's already
   * there, remove it and any surrounding whitespace. Otherwise append it at
   * the cursor (or the end of the prompt if the textarea isn't focused).
   * This is called by clicks on the overlay boxes.
   */
  const escReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const toggleSubjectMention = useCallback(
    (subject: DetectedSubject) => {
      const token = `@${subject.mention_name}`;
      const re = new RegExp(`\\s*${escReg(token)}(?=\\s|$)`, "i");
      if (re.test(prompt)) {
        // Remove it.
        setPrompt((p) =>
          p.replace(re, "").replace(/\s{2,}/g, " ").trimStart(),
        );
        if (selectedSubjectId === subject.id) setSelectedSubjectId(null);
        return;
      }
      // Insert at caret position if focused, else append.
      const ta = textareaRef.current;
      let insertion = token;
      if (ta && document.activeElement === ta) {
        const cursor = ta.selectionStart || prompt.length;
        const before = prompt.slice(0, cursor);
        const after = prompt.slice(cursor);
        const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
        const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
        insertion =
          (needsLeadingSpace ? " " : "") +
          token +
          (needsTrailingSpace ? " " : " ");
        const next = before + insertion + after;
        setPrompt(next);
        setTimeout(() => {
          if (!ta) return;
          ta.focus();
          const pos = before.length + insertion.length;
          ta.setSelectionRange(pos, pos);
        }, 0);
      } else {
        const sep = prompt.length > 0 && !/\s$/.test(prompt) ? " " : "";
        setPrompt(`${prompt}${sep}${token} `);
      }
      setSelectedSubjectId(subject.id);
    },
    [prompt, selectedSubjectId],
  );

  // Keep `selectedSubjectId` in sync with whatever subject mentions are
  // present in the prompt. If the user types `@person1` manually or deletes
  // a chip, the overlay selection follows.
  useEffect(() => {
    if (!detectedSubjects.length) return;
    // Find the first subject whose mention is in the prompt.
    const found = detectedSubjects.find((s) => {
      const re = new RegExp(`@${escReg(s.mention_name)}(?=\\s|$)`, "i");
      return re.test(prompt);
    });
    setSelectedSubjectId(found ? found.id : null);
  }, [prompt, detectedSubjects]);

  /**
   * Scan the current prompt for a `@<subject> @<avatar>` pair and return the
   * avatar object. Used to render a small thumbnail badge on the detection
   * box showing who the subject will be replaced by — giving the user visual
   * confirmation of the swap without needing to re-read the prompt.
   */
  const findPairedAvatar = useCallback(
    (subject: DetectedSubject): Avatar | null => {
      if (!avatars.length) return null;
      // Match `@<subject>` followed by whitespace then `@<something>` where
      // <something> is a known avatar name. Case-insensitive.
      const avatarNames = avatars
        .map((a) => a.name)
        .sort((a, b) => b.length - a.length);
      const re = new RegExp(
        `@${escReg(subject.mention_name)}\\s+@(${avatarNames.map(escReg).join("|")})(?=\\s|$)`,
        "i",
      );
      const m = prompt.match(re);
      if (!m) return null;
      return (
        avatars.find((a) => a.name.toLowerCase() === m[1].toLowerCase()) || null
      );
    },
    [prompt, avatars],
  );

  /**
   * Wire a detected subject to an avatar in one click: ensure both mentions
   * exist in the prompt as a `@subject → @avatar` pair, and add the avatar to
   * `mentionedAvatarIds` so its thumbnail is shipped to Gemini as a ref at
   * generate time. If another avatar was previously paired with this subject,
   * it's swapped out (we keep only one pairing per subject).
   *
   * Why the arrow: before we inserted plain `@subject @avatar`, which read
   * like two separate people — users said it looked like TWO people were
   * being selected, not one replacing the other. The `→` makes the
   * transformation intent visually explicit: the subject on the left gets
   * replaced by the avatar on the right. The prompt-scan regex in
   * handleGenerate still picks `@subject` up since the arrow sits between
   * two whitespace-delimited tokens. */
  const pairSubjectWithAvatar = useCallback(
    (subject: DetectedSubject, avatar: Avatar) => {
      const subjectToken = `@${subject.mention_name}`;
      const avatarToken = `@${avatar.name}`;
      // Match either the new `@subject → @avatar` format or the legacy
      // `@subject @avatar` (or a naked `@subject`) so re-picking an avatar
      // replaces the pair cleanly instead of stacking tokens.
      const subjRe = new RegExp(
        `(^|\\s)@${escReg(subject.mention_name)}(?:\\s+→)?(?:\\s+@\\S+)?(?=\\s|$)`,
        "i",
      );
      let next = prompt;

      // Strip any prior occurrences of this avatar elsewhere — we'll reinsert
      // it right after the subject, and we don't want stray duplicates.
      next = next.replace(
        new RegExp(`\\s*${escReg(avatarToken)}(?=\\s|$)`, "gi"),
        "",
      );

      const pairText = `${subjectToken} → ${avatarToken}`;

      if (subjRe.test(next)) {
        // Subject already mentioned — replace whatever follows it (old avatar
        // pairing, or nothing) with the new arrow-pair.
        next = next.replace(subjRe, (_m, lead) => {
          return `${lead}${pairText}`;
        });
      } else {
        // Subject not mentioned yet — append both tokens at the cursor (or
        // at the end if textarea isn't focused).
        const ta = textareaRef.current;
        if (ta && document.activeElement === ta) {
          const cursor = ta.selectionStart || next.length;
          const before = next.slice(0, cursor);
          const after = next.slice(cursor);
          const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
          const trail = after.length > 0 && !/^\s/.test(after) ? " " : " ";
          next = `${before}${lead}${pairText}${trail}${after}`;
        } else {
          const sep = next.length > 0 && !/\s$/.test(next) ? " " : "";
          next = `${next}${sep}${pairText} `;
        }
      }

      // Tidy any accidental double spaces we created.
      next = next.replace(/\s{2,}/g, " ").trimStart();
      setPrompt(next);
      setMentionedAvatarIds((prev) =>
        prev.includes(avatar.avatar_id) ? prev : [...prev, avatar.avatar_id],
      );
      setSelectedSubjectId(subject.id);
      setSubjectPopoverId(null);
      setSubjectPopoverSearch("");
    },
    [prompt],
  );

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionFiltered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionFiltered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(mentionFiltered[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleTextareaScroll = () => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  /**
   * Color palette for subject pills by kind. Same hues as the overlay boxes
   * so a `@person1` chip visually ties back to the highlighted person box.
   */
  const subjectColorFor = (kind: DetectedSubject["kind"]) => {
    switch (kind) {
      case "person":
        return { fg: "#f97316", bg: "rgba(249,115,22,0.14)" }; // orange — stands out from blue avatars
      case "object":
        return { fg: "#a855f7", bg: "rgba(168,85,247,0.14)" };
      case "text":
        return { fg: "#f59e0b", bg: "rgba(245,158,11,0.14)" };
      case "custom":
        return { fg: "#10b981", bg: "rgba(16,185,129,0.14)" };
      default:
        return { fg: "#64748b", bg: "rgba(100,116,139,0.14)" };
    }
  };

  // Render prompt with highlighted @name chips as an overlay. The raw text
  // layer above (textarea) stays transparent, caret preserved. Two kinds of
  // chips can render: avatar mentions (blue, clickable to swap) and subject
  // mentions (colour by kind, clickable to highlight the source-image box).
  // Also: the `→` that `pairSubjectWithAvatar` inserts between the two chips
  // is styled as a muted arrow so users read it as a transformation operator
  // ("this becomes that"), not a random glyph.
  const renderHighlightedPrompt = (text: string) => {
    if (!text) return null;
    const avatarNames = avatars.map((a) => a.name);
    const subjectNames = detectedSubjects.map((s) => s.mention_name);
    const allNames = [...avatarNames, ...subjectNames].sort((a, b) => b.length - a.length);
    // Even with no mentions we still want to style arrows, so we build the
    // pattern to always include the arrow branch.
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mentionAlt = allNames.length
      ? `(@(?:${allNames.map(esc).join("|")}))(?=\\s|$)`
      : null;
    // Match " → " (with surrounding spaces) as a single capturable segment.
    const arrowAlt = `(\\s→\\s)`;
    const pattern = new RegExp(
      mentionAlt ? `${mentionAlt}|${arrowAlt}` : arrowAlt,
      "gi",
    );
    const parts = text.split(pattern).filter((p) => p !== undefined);
    if (!allNames.length && !/\s→\s/.test(text)) {
      return <span style={{ color: "var(--text-primary)" }}>{text}</span>;
    }
    return parts.map((part, i) => {
      if (!part) return null;
      // Styled arrow operator between paired subject ↔ avatar chips.
      if (/^\s→\s$/.test(part)) {
        return (
          <span
            key={i}
            style={{
              color: "var(--text-muted)",
              opacity: 0.75,
              fontWeight: 600,
              padding: "0 1px",
            }}
            aria-label="becomes"
          >
            {part}
          </span>
        );
      }
      const m = part.match(/^@(.+)$/);
      if (m) {
        const name = m[1];
        const av = avatars.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (av) {
          return (
            <span
              key={i}
              className="relative rounded-[4px] pointer-events-auto cursor-pointer select-none"
              style={{
                background: "rgba(59,130,246,0.15)",
                color: "#3b82f6",
                fontWeight: 600,
                padding: "2px 0",
              }}
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                setChipDropdown({
                  avatarId: av.avatar_id,
                  pos: { top: r.bottom + 4, left: r.left },
                });
              }}
            >
              {part}
              <svg
                className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: "calc(100% + 1px)" }}
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2 3L4 5L6 3"
                  stroke="#3b82f6"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          );
        }
        const subj = detectedSubjects.find(
          (s) => s.mention_name.toLowerCase() === name.toLowerCase(),
        );
        if (subj) {
          const { fg, bg } = subjectColorFor(subj.kind);
          return (
            <span
              key={i}
              className="relative rounded-[4px] pointer-events-auto cursor-pointer select-none"
              style={{
                background: bg,
                color: fg,
                fontWeight: 600,
                padding: "2px 0",
              }}
              title={subj.label}
              onClick={(e) => {
                e.stopPropagation();
                // Clicking the chip spotlights the matching box.
                setSelectedSubjectId(subj.id);
              }}
            >
              {part}
            </span>
          );
        }
      }
      return (
        <span key={i} style={{ color: "var(--text-primary)" }}>
          {part}
        </span>
      );
    });
  };

  /* ─── YouTube URL preview ─── */
  useEffect(() => {
    if (mode !== "recreate") {
      setYtPreview(null);
      setSourceNaturalSize(null);
      setLoadingYtPreview(false);
      return;
    }
    if (!youtubeUrl.trim()) {
      setYtPreview(null);
      setSourceNaturalSize(null);
      setLoadingYtPreview(false);
      return;
    }
    // Kick the loading indicator on immediately — the 350ms debounce
    // before the actual fetch would otherwise feel like a dead moment
    // right after a paste.
    setLoadingYtPreview(true);
    if (ytDebounceRef.current) window.clearTimeout(ytDebounceRef.current);
    ytDebounceRef.current = window.setTimeout(async () => {
      try {
        const res = await thumbnailAPI.youtubePreview(youtubeUrl.trim());
        setYtPreview({
          videoId: res.data.video_id,
          url: res.data.thumbnail_urls.maxres,
        });
        setSourceNaturalSize(null);
        setError(null);
      } catch {
        setYtPreview(null);
      } finally {
        setLoadingYtPreview(false);
      }
    }, 350);
    return () => {
      if (ytDebounceRef.current) window.clearTimeout(ytDebounceRef.current);
    };
  }, [youtubeUrl, mode]);

  /* ─── Detect subjects in the source thumbnail ───
   * Fires whenever we have a new YouTube preview (recreate) or a newly
   * uploaded source file (edit). Each source is keyed so switching back and
   * forth doesn't re-burn credits. Respects the detection toggle — skipping
   * the call entirely when the user has opted out. */
  useEffect(() => {
    // If detection is disabled, keep any user-drawn custom boxes but skip the
    // API call. Resetting subjects to [] would wipe user work.
    if (!detectionEnabled) {
      setDetecting(false);
      setDetectedSubjects((prev) => prev.filter((s) => s.kind === "custom"));
      return;
    }

    let key: string | null = null;
    let run: (() => Promise<void>) | null = null;

    const fromDetection = (res: { data: { subjects?: DetectedSubject[]; people?: DetectedSubject[] } }) => {
      // Backend returns both keys for back-compat; prefer `subjects`.
      const raw = (res.data.subjects || res.data.people || []) as DetectedSubject[];
      return assignMentionNames(raw);
    };

    if (mode === "recreate" && ytPreview?.videoId) {
      key = `yt:${ytPreview.videoId}`;
      run = async () => {
        const fd = new FormData();
        fd.append("youtube_url", youtubeUrl.trim());
        const res = await thumbnailAPI.detectPeople(fd);
        setDetectedSubjects(fromDetection(res));
      };
    } else if (mode === "edit" && sourceFile) {
      key = `edit:${sourceFile.name}:${sourceFile.size}:${sourceFile.lastModified}`;
      run = async () => {
        const fd = new FormData();
        fd.append("file", sourceFile);
        const res = await thumbnailAPI.detectPeople(fd);
        setDetectedSubjects(fromDetection(res));
      };
    } else {
      setDetectedSubjects([]);
      setSelectedSubjectId(null);
      lastDetectedKey.current = null;
      return;
    }

    if (key === lastDetectedKey.current) return;
    lastDetectedKey.current = key;
    setSelectedSubjectId(null);
    setDetectedSubjects([]);
    setDetecting(true);

    let cancelled = false;
    (async () => {
      try {
        await run!();
      } catch {
        if (!cancelled) setDetectedSubjects([]);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ytPreview, sourceFile, youtubeUrl, detectionEnabled]);

  /* ─── Auto-describe custom-drawn boxes ───
   * When the user drags a fresh rectangle on the source thumbnail, the
   * box lands in state with the placeholder label "Custom selection" —
   * which tells the downstream generator nothing about what's inside.
   * This effect watches for those placeholders, crops the source image
   * to the box, and asks Gemini for a short noun phrase describing the
   * object (e.g. "blue cotton t-shirt"). The returned label replaces
   * "Custom selection" so the eventual generate call ships a useful
   * `target_label`.
   *
   * Guarded against re-firing mid-drag and against double-requests via
   * a ref-tracked set. If the call fails we leave the placeholder in
   * place so the rectangle still works (just with weaker targeting). */
  const describedCustomIdsRef = useRef<Set<string>>(new Set());
  const [describingCustomIds, setDescribingCustomIds] = useState<Set<string>>(
    new Set(),
  );
  useEffect(() => {
    // Don't fire while a drag is still in progress — the box is still
    // being resized and firing now would describe an intermediate state.
    if (dragState) return;
    const pending = detectedSubjects.filter(
      (s) =>
        s.kind === "custom" &&
        s.label === "Custom selection" &&
        !describedCustomIdsRef.current.has(s.id),
    );
    if (pending.length === 0) return;

    // We need a source image to crop. Recreate → YouTube URL; Edit →
    // uploaded file. In other modes the preview isn't visible anyway.
    const hasRecreateSource = mode === "recreate" && !!ytPreview?.videoId;
    const hasEditSource = mode === "edit" && !!sourceFile;
    if (!hasRecreateSource && !hasEditSource) return;

    for (const s of pending) {
      describedCustomIdsRef.current.add(s.id);
      setDescribingCustomIds((prev) => new Set(prev).add(s.id));

      const fd = new FormData();
      fd.append("box_x", s.box.x.toFixed(4));
      fd.append("box_y", s.box.y.toFixed(4));
      fd.append("box_w", s.box.w.toFixed(4));
      fd.append("box_h", s.box.h.toFixed(4));
      if (hasRecreateSource) {
        fd.append("youtube_url", youtubeUrl.trim());
      } else if (hasEditSource && sourceFile) {
        fd.append("files", sourceFile);
      }

      thumbnailAPI
        .describeRegion(fd)
        .then((res) => {
          const label = (res.data?.label || "").trim();
          if (!label) return;
          setDetectedSubjects((prev) =>
            prev.map((x) => (x.id === s.id ? { ...x, label } : x)),
          );
        })
        .catch((err) => {
          console.warn("describeRegion failed:", err);
          // Roll out of the "already described" set so the user can
          // nudge the box (which bumps it through the effect again)
          // to retry. Otherwise a transient failure would permanently
          // leave "Custom selection" stuck.
          describedCustomIdsRef.current.delete(s.id);
        })
        .finally(() => {
          setDescribingCustomIds((prev) => {
            const next = new Set(prev);
            next.delete(s.id);
            return next;
          });
        });
    }
  }, [detectedSubjects, dragState, mode, ytPreview, sourceFile, youtubeUrl]);

  /* ─── Cleanup object URLs on unmount ─── */
  useEffect(() => {
    return () => {
      refPreviews.forEach((url) => URL.revokeObjectURL(url));
      newCharPreviews.forEach((url) => URL.revokeObjectURL(url));
      if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Drag-drop for source / refs ─── */
  const onDropSource = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleSourceFile(file);
  };
  const onDropRefs = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) handleRefFiles(files);
  };

  /* ─── Character picker actions ─── */
  const pickFromLibrary = (avatar: Avatar) => {
    // Insert @mention into prompt (at caret or end). Also track the ID.
    const at = `@${avatar.name} `;
    // If textarea has focus, insert at caret; otherwise append.
    const ta = textareaRef.current;
    if (ta && document.activeElement === ta) {
      const cursor = ta.selectionStart || prompt.length;
      const before = prompt.slice(0, cursor);
      const after = prompt.slice(cursor);
      // Insert a leading space if we're not at start-of-word
      const sep = before.length > 0 && !/\s$/.test(before) ? " " : "";
      const next = `${before}${sep}${at}${after}`;
      setPrompt(next);
      setTimeout(() => {
        ta.focus();
        const pos = before.length + sep.length + at.length;
        ta.setSelectionRange(pos, pos);
      }, 0);
    } else {
      const sep = prompt.length > 0 && !/\s$/.test(prompt) ? " " : "";
      setPrompt(`${prompt}${sep}${at}`);
    }
    setMentionedAvatarIds((prev) =>
      prev.includes(avatar.avatar_id) ? prev : [...prev, avatar.avatar_id],
    );
    setCharPickerOpen(false);
  };

  const handleNewCharFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 4 - newCharFiles.length);
    const next = [...newCharFiles, ...arr];
    // revoke old previews, then recompute
    newCharPreviews.forEach((u) => URL.revokeObjectURL(u));
    setNewCharFiles(next);
    setNewCharPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const createCharacter = async () => {
    if (!newCharName.trim() || newCharFiles.length === 0) return;
    setCreatingChar(true);
    try {
      const fd = new FormData();
      fd.append("nickname", newCharName.trim());
      fd.append("prompt", `A person named ${newCharName.trim()}`);
      newCharFiles.forEach((f) => fd.append("files", f));
      const res = await avatarAPI.generate(fd);
      const created: Avatar | undefined = res.data?.avatar;
      // Re-fetch list to get fresh thumbnails and canonical IDs.
      const listRes = await avatarAPI.list();
      const list: Avatar[] = listRes.data.avatars || [];
      setAvatars(list);
      // Prefer the just-created avatar; fall back to matching by nickname.
      const picked =
        (created && list.find((a) => a.avatar_id === created.avatar_id)) ||
        list.find((a) => a.name.toLowerCase() === newCharName.trim().toLowerCase());
      if (picked) pickFromLibrary(picked);
      // Reset upload form
      setNewCharName("");
      newCharPreviews.forEach((u) => URL.revokeObjectURL(u));
      setNewCharFiles([]);
      setNewCharPreviews([]);
      setPickerTab("library");
    } catch {
      setError("Failed to create character.");
    } finally {
      setCreatingChar(false);
    }
  };

  /* ─── Generate ─── */
  const canSubmit = (): boolean => {
    if (loading) return false;
    if (!prompt.trim() && mode !== "recreate") return false;
    if (mode === "recreate" && !ytPreview) return false;
    if (mode === "edit" && !sourceFile) return false;
    return true;
  };

  const handleGenerate = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("mode", mode);

      /* ─── Subject mentions → target_label ───
       * Scan the raw prompt for any `@subjectMention` that matches a detected
       * subject. The first match becomes the `target_label` the backend uses
       * to pin the edit. We also rewrite the prompt we send to the model:
       * `@person1` is a UI-only handle; the model should see the subject's
       * human-readable label instead. Avatar `@mentions` are left intact —
       * those names are part of the user's vocabulary for characters. */
      let targetedSubject: DetectedSubject | null = null;
      let promptForModel = prompt.trim();
      for (const s of detectedSubjects) {
        const re = new RegExp(`@${escReg(s.mention_name)}(?=\\s|$)`, "i");
        if (re.test(promptForModel)) {
          if (!targetedSubject) targetedSubject = s;
          // Replace each `@person1` with a human-readable reference so the
          // model isn't confused by the raw token.
          promptForModel = promptForModel.replace(
            new RegExp(`@${escReg(s.mention_name)}(?=\\s|$)`, "gi"),
            `the ${s.label}`,
          );
        }
      }

      form.append(
        "prompt",
        promptForModel || "Recreate with the same theme but a fresh take.",
      );
      // Resolve "auto" to the source image's actual ratio (snapped to the
      // closest supported value). Falls back to 16:9 if we have no source.
      const effectiveRatio: AspectRatio =
        aspectRatio === "auto"
          ? sourceNaturalSize
            ? closestRatio(sourceNaturalSize.w, sourceNaturalSize.h)
            : "16:9"
          : aspectRatio;
      form.append("aspect_ratio", effectiveRatio);
      if (mode === "recreate" && youtubeUrl.trim()) {
        form.append("youtube_url", youtubeUrl.trim());
      }
      if (mode === "title") {
        form.append("title_text", titleText.trim());
      }

      // Prefer the prompt-scan target; fall back to the box click state for
      // users who haven't discovered the mention flow yet.
      const effectiveTarget =
        targetedSubject ||
        (selectedSubjectId
          ? detectedSubjects.find((s) => s.id === selectedSubjectId) || null
          : null);
      if (effectiveTarget && (mode === "recreate" || mode === "edit")) {
        form.append("target_label", effectiveTarget.label);
        // Ship the box coordinates too so the backend can draw a magenta
        // rectangle on the source image before handing it to Gemini.
        // Without this the AI only sees the text label — which is often
        // too generic to locate the region (especially for custom boxes
        // whose default label is "Custom selection"). The visual marker
        // is what makes "change the t-shirt colour" actually change the
        // t-shirt and not some unrelated element.
        form.append("target_box_x", effectiveTarget.box.x.toFixed(4));
        form.append("target_box_y", effectiveTarget.box.y.toFixed(4));
        form.append("target_box_w", effectiveTarget.box.w.toFixed(4));
        form.append("target_box_h", effectiveTarget.box.h.toFixed(4));
      }
      if (mode === "edit" && sourceFile) form.append("files", sourceFile);
      refs.forEach((f) => form.append("files", f));

      // Resolve mentioned avatars → download each thumbnail and attach as ref.
      // Runs in parallel. Failures per-avatar are swallowed so one broken URL
      // doesn't kill the whole generate call.
      if (mentionedAvatarIds.length > 0) {
        const mentioned = mentionedAvatarIds
          .map((id) => avatars.find((a) => a.avatar_id === id))
          .filter((a): a is Avatar => !!a);
        const blobs = await Promise.all(
          mentioned.map(async (a) => {
            try {
              const r = await fetch(a.thumbnail);
              if (!r.ok) return null;
              const b = await r.blob();
              return new File([b], `${a.name}.png`, { type: b.type || "image/png" });
            } catch {
              return null;
            }
          }),
        );
        blobs.forEach((f) => f && form.append("files", f));
      }

      const res = await thumbnailAPI.generate(form);
      const data = res.data;
      const next: GeneratedThumbnail = {
        thumbnail_id: data.thumbnail_id,
        image_url: data.image_url,
        mode: data.mode,
        aspect_ratio: data.aspect_ratio,
        prompt: prompt.trim() || "(recreate)",
        created_at: new Date().toISOString(),
        source_thumbnail_url: data.source_thumbnail_url ?? null,
        reference_image_url:
          data.reference_image_url ?? data.source_thumbnail_url ?? null,
        source_url:
          data.source_url ??
          (mode === "recreate" && youtubeUrl.trim() ? youtubeUrl.trim() : null),
        youtube_video_id: data.youtube_video_id ?? null,
      };
      setHistory((prev) => [next, ...prev]);
      // We used to auto-open the lightbox here, but it was fullscreen noise.
      // The new thumbnail lands at the top of the history grid and the user
      // can click it if they want the close-up.
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string | { message?: string } } } };
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : detail?.message ?? "Generation failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [mode, prompt, aspectRatio, sourceNaturalSize, youtubeUrl, titleText, sourceFile, refs, mentionedAvatarIds, avatars, selectedSubjectId, detectedSubjects]);

  const handleDownload = async (t: GeneratedThumbnail) => {
    try {
      const res = await fetch(t.image_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `horpen-thumbnail-${t.thumbnail_id.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(t.image_url, "_blank");
    }
  };

  /* ─── Gallery selection handlers ─── */
  const toggleThumbSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedThumbIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearThumbSelection = () => setSelectedThumbIds(new Set());

  /**
   * Reuse the first-selected thumbnail's prompt + mode. Mirrors the lightbox's
   * "Reuse prompt" action but skips opening the detail view, which is the
   * faster path when the user already knows what they want to regenerate.
   */
  const handleBulkReuse = () => {
    const first = history.find((t) => selectedThumbIds.has(t.thumbnail_id));
    if (!first) return;
    setPrompt(first.prompt);
    setMode(first.mode);
    if (first.mode === "recreate" && first.source_url) {
      setYoutubeUrl(first.source_url);
    }
    clearThumbSelection();
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  /** Download every selected thumbnail sequentially. */
  const handleBulkDownload = async () => {
    const toDl = history.filter((t) => selectedThumbIds.has(t.thumbnail_id));
    for (const t of toDl) {
      await handleDownload(t);
    }
    clearThumbSelection();
  };

  /**
   * Hit /thumbnail/:id for each selected row, then drop them from state.
   * We fan out the requests with Promise.allSettled so a single transient
   * failure doesn't abandon the rest — the UI still reflects whatever
   * actually made it through.
   */
  const handleBulkDelete = async () => {
    if (!selectedThumbIds.size) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete ${selectedThumbIds.size} thumbnail${selectedThumbIds.size === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    const ids = Array.from(selectedThumbIds);
    const results = await Promise.allSettled(
      ids.map((id) => thumbnailAPI.delete(id)),
    );
    const deleted = new Set<string>();
    results.forEach((r, i) => {
      if (r.status === "fulfilled") deleted.add(ids[i]);
    });
    setHistory((prev) =>
      prev.filter((t) => !deleted.has(t.thumbnail_id)),
    );
    clearThumbSelection();
    setBulkDeleting(false);
  };

  /* ─── Derived UI values ─── */
  const filteredLibrary = avatars.filter((a) =>
    a.name.toLowerCase().includes(librarySearch.toLowerCase()),
  );
  const mentionedAvatars = mentionedAvatarIds
    .map((id) => avatars.find((a) => a.avatar_id === id))
    .filter((a): a is Avatar => !!a);

  /* ─── Draggable / resizable box overlay ───
   * The preview container is the coordinate reference — we capture mouse
   * positions relative to its bounding rect and clamp to [0,1]. Boxes are
   * stored in fractional coordinates so they stay aligned when the container
   * resizes (responsive). */

  // Helper: normalize a mouse event to 0-1 coordinates within the container.
  const mouseToFrac = (e: MouseEvent | React.MouseEvent): { x: number; y: number } => {
    const el = previewContainerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  // Begin dragging (move) a subject's box.
  const startMove = (
    e: React.MouseEvent<HTMLDivElement>,
    subject: DetectedSubject,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = mouseToFrac(e);
    // Remember the raw viewport coordinates of this mousedown. If it turns
    // out to be a tap (no drag), the popover is anchored to the click point
    // rather than the box edges — so clicking low in a tall box opens the
    // popover low, not all the way up at the box's top.
    clickPosRef.current = { x: e.clientX, y: e.clientY };
    setDragState({ kind: "move", id: subject.id, startX: x, startY: y, origBox: subject.box });
    setSelectedSubjectId(subject.id);
  };

  // Begin resizing from a corner handle.
  const startResize = (
    e: React.MouseEvent<HTMLDivElement>,
    subject: DetectedSubject,
    corner: "nw" | "ne" | "sw" | "se",
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = mouseToFrac(e);
    setDragState({ kind: "resize", id: subject.id, corner, startX: x, startY: y, origBox: subject.box });
    setSelectedSubjectId(subject.id);
  };

  // Begin drawing a brand-new custom box. Triggered by mousedown on empty
  // container space (i.e. not on an existing box).
  const startDraw = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Ignore if the click originated inside an existing box — those have
    // their own handlers that stop propagation.
    const { x, y } = mouseToFrac(e);
    const id = `custom-${Date.now()}`;
    const newSubject: DetectedSubject = {
      id,
      label: "Custom selection",
      mention_name: "",
      kind: "custom",
      is_main: false,
      box: { x, y, w: 0.001, h: 0.001 },
    };
    setDetectedSubjects((prev) => assignMentionNames([...prev, newSubject]));
    setSelectedSubjectId(id);
    setDragState({ kind: "draw", id, startX: x, startY: y });
  };

  // Tracks whether the current drag actually moved past a small threshold.
  // If it didn't, we treat mousedown→mouseup as a click and toggle the
  // subject's @mention instead of applying box movement.
  const dragMovedRef = useRef(false);
  // Latest-value refs so the drag effect can read current state without
  // re-subscribing (which would tear down/re-add window listeners on every
  // mousemove).
  const detectedSubjectsRef = useRef(detectedSubjects);
  const toggleSubjectMentionRef = useRef(toggleSubjectMention);
  useEffect(() => {
    detectedSubjectsRef.current = detectedSubjects;
  }, [detectedSubjects]);
  useEffect(() => {
    toggleSubjectMentionRef.current = toggleSubjectMention;
  }, [toggleSubjectMention]);

  // Global mousemove/up handlers while dragging. Use listeners on window so
  // the drag survives leaving the preview area momentarily.
  useEffect(() => {
    if (!dragState) return;
    dragMovedRef.current = false;
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const { x, y } = mouseToFrac(e);
      // Threshold in fractional coords: ~1.5% of the container side is a
      // reliable "user really intended to drag" signal that still feels
      // responsive. Anything smaller, keep the box pristine so a tap still
      // counts as a click.
      if (!dragMovedRef.current) {
        const dx = Math.abs(x - dragState.startX);
        const dy = Math.abs(y - dragState.startY);
        if (dx < 0.015 && dy < 0.015) return;
        dragMovedRef.current = true;
      }
      setDetectedSubjects((prev) =>
        prev.map((s) => {
          if (s.id !== dragState.id) return s;
          if (dragState.kind === "move") {
            const dx = x - dragState.startX;
            const dy = y - dragState.startY;
            const nx = Math.max(0, Math.min(1 - dragState.origBox.w, dragState.origBox.x + dx));
            const ny = Math.max(0, Math.min(1 - dragState.origBox.h, dragState.origBox.y + dy));
            return { ...s, box: { ...s.box, x: nx, y: ny } };
          }
          if (dragState.kind === "resize") {
            const { origBox, corner } = dragState;
            let { x: bx, y: by, w: bw, h: bh } = origBox;
            if (corner === "nw") {
              const nx = Math.min(x, origBox.x + origBox.w - 0.02);
              const ny = Math.min(y, origBox.y + origBox.h - 0.02);
              bw = origBox.x + origBox.w - nx;
              bh = origBox.y + origBox.h - ny;
              bx = nx;
              by = ny;
            } else if (corner === "ne") {
              const nx2 = Math.max(x, origBox.x + 0.02);
              const ny = Math.min(y, origBox.y + origBox.h - 0.02);
              bw = nx2 - origBox.x;
              bh = origBox.y + origBox.h - ny;
              by = ny;
            } else if (corner === "sw") {
              const nx = Math.min(x, origBox.x + origBox.w - 0.02);
              const ny2 = Math.max(y, origBox.y + 0.02);
              bw = origBox.x + origBox.w - nx;
              bh = ny2 - origBox.y;
              bx = nx;
            } else {
              const nx2 = Math.max(x, origBox.x + 0.02);
              const ny2 = Math.max(y, origBox.y + 0.02);
              bw = nx2 - origBox.x;
              bh = ny2 - origBox.y;
            }
            // Clamp inside [0,1]
            bx = Math.max(0, bx);
            by = Math.max(0, by);
            bw = Math.min(1 - bx, bw);
            bh = Math.min(1 - by, bh);
            return { ...s, box: { x: bx, y: by, w: bw, h: bh } };
          }
          if (dragState.kind === "draw") {
            const nx = Math.min(dragState.startX, x);
            const ny = Math.min(dragState.startY, y);
            const nw = Math.abs(x - dragState.startX);
            const nh = Math.abs(y - dragState.startY);
            return { ...s, box: { x: nx, y: ny, w: nw, h: nh } };
          }
          return s;
        }),
      );
    };
    const onUp = () => {
      // No real drag happened — treat mousedown→mouseup as a tap.
      if (!dragMovedRef.current) {
        if (dragState.kind === "move") {
          // Tap on an existing box → open the "replace with…" popover so the
          // user can pick an avatar directly. The old prompt-insertion flow
          // is still available as a "Just mention" option inside the popover.
          const target = detectedSubjectsRef.current.find((s) => s.id === dragState.id);
          if (target) {
            setSubjectPopoverId(target.id);
            setSubjectPopoverSearch("");
          }
        } else if (dragState.kind === "draw") {
          // Tap on empty canvas (no drag) → discard the 1px box we
          // tentatively created on mousedown.
          setDetectedSubjects((prev) => prev.filter((s) => s.id !== dragState.id));
          setSelectedSubjectId(null);
        }
        setDragState(null);
        return;
      }
      // Drew/resized/moved something — finalize. Drop tiny freshly-drawn
      // boxes (the user barely moved the mouse, intent was clearly a tap).
      if (dragState.kind === "draw") {
        setDetectedSubjects((prev) => {
          const drawn = prev.find((s) => s.id === dragState.id);
          if (drawn && (drawn.box.w < 0.02 || drawn.box.h < 0.02)) {
            setSelectedSubjectId(null);
            return prev.filter((s) => s.id !== dragState.id);
          }
          return prev;
        });
      }
      setDragState(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState]);

  /**
   * Toggle strip + status text below the preview. Lets the user disable AI
   * detection entirely (for thumbnails with no humans/objects worth
   * targeting) and summarises what's happening / what to do next.
   */
  const renderDetectionControls = () => {
    const aiSubjects = detectedSubjects.filter((s) => s.kind !== "custom");
    const customSubjects = detectedSubjects.filter((s) => s.kind === "custom");
    const selected = detectedSubjects.find((s) => s.id === selectedSubjectId) || null;

    // Did the user already wire a subject → avatar swap?
    const pairedSubject = detectedSubjects.find((s) => findPairedAvatar(s));
    let status = "";
    if (detecting) {
      status = "Detecting subjects in the source image…";
    } else if (!detectionEnabled && customSubjects.length === 0) {
      status = "AI detection is off. Drag on the image to draw your own target, or just describe your edit below.";
    } else if (pairedSubject) {
      const p = findPairedAvatar(pairedSubject);
      status = `@${pairedSubject.mention_name} will be replaced by @${p?.name ?? "?"}. Click the box to change, or hit Generate.`;
    } else if (selected) {
      status = `@${selected.mention_name} is selected — click it again to pick a character or describe a change.`;
    } else if (aiSubjects.length > 0 || customSubjects.length > 0) {
      // Nudge the user toward both affordances: click an existing box to act
      // on it, and drag-to-draw when the AI missed someone (typical for
      // people in crowd shots, small faces, or stylised art).
      status = "Click a box to swap with a character or describe a change. Missed someone? Drag on the image to draw your own box.";
    } else {
      status = detectionEnabled
        ? "Nothing detected yet — drag on the image to mark a region to edit, or just describe your change below."
        : "We'll remix this thumbnail based on your prompt below.";
    }

    return (
      <div className="mt-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setDetectionEnabled((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 h-7 text-[11.5px] font-medium"
            style={{
              background: detectionEnabled ? "rgba(59,130,246,0.12)" : "var(--bg-primary)",
              border: `1px solid ${detectionEnabled ? "rgba(59,130,246,0.4)" : "var(--border-color)"}`,
              color: detectionEnabled ? "#3b82f6" : "var(--text-secondary)",
            }}
            aria-pressed={detectionEnabled}
            title={detectionEnabled ? "AI detection is on" : "AI detection is off"}
          >
            {detectionEnabled ? <Eye size={12} /> : <EyeSlash size={12} />}
            AI detection {detectionEnabled ? "on" : "off"}
          </button>
          {(aiSubjects.length > 0 || customSubjects.length > 0) && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {aiSubjects.length > 0 && `${aiSubjects.length} detected`}
              {aiSubjects.length > 0 && customSubjects.length > 0 && " · "}
              {customSubjects.length > 0 && `${customSubjects.length} custom`}
            </span>
          )}
          {(aiSubjects.length > 0 || customSubjects.length > 0) && (
            <button
              type="button"
              onClick={() => {
                // Strip every subject @mention from the prompt before dropping
                // the boxes — otherwise the prompt keeps orphan @person3 tags
                // pointing to nothing.
                setPrompt((p) => {
                  let next = p;
                  for (const s of detectedSubjects) {
                    const re = new RegExp(
                      `\\s*@${escReg(s.mention_name)}(?=\\s|$)`,
                      "gi",
                    );
                    next = next.replace(re, "");
                  }
                  return next.replace(/\s{2,}/g, " ").trimStart();
                });
                setDetectedSubjects([]);
                setSelectedSubjectId(null);
              }}
              className="text-[11px] rounded-md px-2 h-6"
              style={{ color: "var(--text-muted)" }}
            >
              Clear all
            </button>
          )}
        </div>
        <p className="text-[11.5px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          {status}
        </p>
      </div>
    );
  };

  const renderSubjectsOverlay = () => {
    return (
      <>
        {/* The empty-canvas draw surface sits behind all existing boxes so
            mousedown on any box goes to that box, and mousedown on empty
            pixels falls through here to start drawing a new one. */}
        <div
          className="absolute inset-0"
          style={{ cursor: detectedSubjects.length === 0 ? "crosshair" : "crosshair" }}
          onMouseDown={startDraw}
        />

        {detecting && (
          <div
            className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-medium pointer-events-none z-10"
            style={{
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              backdropFilter: "blur(6px)",
            }}
          >
            <Spinner size={10} />
            Detecting subjects…
          </div>
        )}

        {detectedSubjects.map((s) => {
          const selected = selectedSubjectId === s.id;
          const { fg: accent } = subjectColorFor(s.kind);
          const paired = findPairedAvatar(s);
          // `mentioned` = this subject's @tag is currently inside the prompt.
          // Visually we tie it together with `selected` — both states render
          // the same way — but we keep the boolean for clarity.
          const mentioned = selected || !!paired;
          const popoverOpen = subjectPopoverId === s.id;
          return (
            <div
              key={s.id}
              className="absolute"
              style={{
                left: `${s.box.x * 100}%`,
                top: `${s.box.y * 100}%`,
                width: `${s.box.w * 100}%`,
                height: `${s.box.h * 100}%`,
                border: popoverOpen || mentioned
                  ? `2.5px solid ${accent}`
                  : `2px solid rgba(255,255,255,0.85)`,
                borderRadius: 8,
                background: popoverOpen
                  ? `${accent}3d`
                  : mentioned
                    ? `${accent}2e` // hex alpha ~0.18
                    : "transparent",
                boxShadow: popoverOpen || mentioned
                  ? `0 0 0 2px ${accent}40, 0 2px 8px rgba(0,0,0,0.3)`
                  : "0 1px 4px rgba(0,0,0,0.35)",
                transition: dragState ? "none" : "background 0.15s ease, border-color 0.15s ease",
                cursor:
                  dragState?.id === s.id && dragState.kind === "move"
                    ? "grabbing"
                    : "pointer",
              }}
              onMouseDown={(e) => startMove(e, s)}
              aria-label={
                paired
                  ? `${s.label} will be replaced by ${paired.name}. Click to change.`
                  : `Click to replace ${s.label}`
              }
              title={
                paired
                  ? `Will be replaced by @${paired.name} — click to change`
                  : `Click to replace — ${s.label}`
              }
            >
              {/* Stacked label: bold `@mentionName` on top, full description
                  below in smaller text. When a swap is wired up we show the
                  paired avatar's thumbnail + name so the user gets a visual
                  confirmation at a glance. */}
              <div
                className="absolute left-0 -top-[38px] flex items-center gap-1 px-1.5 py-0.5 rounded-md max-w-[240px] pointer-events-none"
                style={{
                  background: mentioned ? accent : "rgba(0,0,0,0.78)",
                  color: "#fff",
                  backdropFilter: "blur(6px)",
                }}
              >
                {paired && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={paired.thumbnail}
                    alt={paired.name}
                    className="w-5 h-5 rounded-full object-cover"
                    style={{ border: "1.5px solid #fff" }}
                    draggable={false}
                  />
                )}
                <div className="min-w-0">
                  <div className="text-[10.5px] font-semibold leading-tight truncate">
                    {paired ? `→ @${paired.name}` : `@${s.mention_name}`}
                  </div>
                  <div
                    className="text-[9px] leading-tight truncate flex items-center gap-1"
                    style={{ opacity: 0.82 }}
                  >
                    {/* Tiny inline spinner while describeRegion is in
                        flight so the user can tell the label is about
                        to update — rather than thinking the detection
                        is stuck on "Custom selection". */}
                    {describingCustomIds.has(s.id) && (
                      <span
                        className="inline-block w-2 h-2 rounded-full border animate-spin"
                        style={{
                          borderColor: "rgba(255,255,255,0.4)",
                          borderTopColor: "#fff",
                        }}
                      />
                    )}
                    <span className="truncate">
                      {describingCustomIds.has(s.id)
                        ? "Identifying…"
                        : s.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Delete button — ALWAYS visible so the user can dismiss any
                  unwanted detection (stray text, irrelevant object, etc.)
                  without first having to click/select it. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // Also strip any @mention from the prompt so we don't leave
                  // dangling tokens pointing to a box that no longer exists.
                  const re = new RegExp(
                    `\\s*@${escReg(s.mention_name)}(?=\\s|$)`,
                    "i",
                  );
                  setPrompt((p) => p.replace(re, "").replace(/\s{2,}/g, " ").trimStart());
                  setDetectedSubjects((prev) => prev.filter((x) => x.id !== s.id));
                  if (selectedSubjectId === s.id) setSelectedSubjectId(null);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                style={{
                  background: "rgba(0,0,0,0.85)",
                  color: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                }}
                aria-label={`Remove ${s.mention_name}`}
              >
                <XIcon size={10} />
              </button>

              {/* Corner resize handles (only shown for the currently-mentioned
                  box to keep the canvas uncluttered). */}
              {selected && (
                <>
                  {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                    <div
                      key={corner}
                      onMouseDown={(e) => startResize(e, s, corner)}
                      className="absolute w-3 h-3 rounded-sm"
                      style={{
                        background: "#fff",
                        border: `1.5px solid ${accent}`,
                        top: corner.startsWith("n") ? -6 : "auto",
                        bottom: corner.startsWith("s") ? -6 : "auto",
                        left: corner.endsWith("w") ? -6 : "auto",
                        right: corner.endsWith("e") ? -6 : "auto",
                        cursor: `${corner}-resize`,
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}

        {/* ── Subject action popover ──
            Anchored to the clicked detection box. Opens below when there's
            room, flips above otherwise.

            The popover has TWO modes, toggled via a tab row:
              • "character" → avatar picker. pairSubjectWithAvatar rewrites
                the prompt into the canonical `@person1 @Nathan` pair so
                handleGenerate wires everything up.
              • "describe" → free-form "what should happen with this thing?"
                input. Useful when the box isn't a person (a car, a logo,
                a background element). Appends a targeted directive to the
                prompt like `@object1 change it to neon blue`.

            The default mode is picked from the box's `kind`: person/custom
            start in "character", everything else starts in "describe".
            The user can flip either way — e.g., clicking a car and deciding
            to replace it with a human avatar after all. */}
        {(() => {
          if (!subjectPopoverId) return null;
          const s = detectedSubjects.find((x) => x.id === subjectPopoverId);
          if (!s) return null;
          const { fg: accent } = subjectColorFor(s.kind);
          // Flip above the box when the box's bottom is past 60% of the
          // preview — keeps the popover fully visible without scrolling.
          const flipUp = s.box.y + s.box.h > 0.6;
          // Anchor horizontally to whichever edge of the box gives the
          // popover more room before overflowing the preview. At ~280px
          // the popover consumes roughly 35 % of a 16:9 YouTube thumbnail.
          const anchorRight = s.box.x + s.box.w / 2 > 0.55;
          const q = subjectPopoverSearch.trim().toLowerCase();
          const visibleAvatars = q
            ? avatars.filter((a) => a.name.toLowerCase().includes(q))
            : avatars;
          const paired = findPairedAvatar(s);
          const isPersonLike = s.kind === "person" || s.kind === "custom";
          const activeMode: "character" | "describe" =
            subjectPopoverMode ?? (isPersonLike ? "character" : "describe");

          // Append a directive line to the prompt, separated by a newline
          // so the user can see the boundaries between targeted edits.
          const appendDirective = (line: string) => {
            setPrompt((p) => {
              const trimmed = p.replace(/\s+$/, "");
              if (!trimmed) return line;
              return `${trimmed}\n${line}`;
            });
          };

          const applyDescribe = () => {
            const text = subjectDescribeText.trim();
            if (!text) return;
            appendDirective(`@${s.mention_name} ${text}`);
            setSubjectPopoverId(null);
            setSubjectPopoverSearch("");
            setSubjectDescribeText("");
            setSubjectPopoverMode(null);
          };
          const applyRemove = () => {
            appendDirective(`Remove @${s.mention_name} from the image.`);
            setSubjectPopoverId(null);
            setSubjectPopoverSearch("");
            setSubjectDescribeText("");
            setSubjectPopoverMode(null);
          };

          // Kind-specific suggestions for the describe mode — pre-fill the
          // textarea on click so the user can tweak before applying.
          const describeSuggestions: string[] =
            s.kind === "text"
              ? [
                  "change the text to ",
                  "remove the text",
                  "make the text larger and bolder",
                ]
              : s.kind === "object"
              ? [
                  "change the color to ",
                  "replace it with ",
                  "make it look brand new",
                ]
              : [
                  "change it to ",
                  "remove it from the image",
                  "make it more dramatic",
                ];

          const titleForMode =
            activeMode === "character"
              ? `Replace @${s.mention_name}`
              : `Change @${s.mention_name}`;

          // Compute fixed-viewport coordinates from the preview's bounding
          // rect + the subject's fractional box. Without this the popover
          // would be positioned inside the `overflow: hidden` preview and
          // get clipped the moment it extends past the image bounds (the
          // "list appears behind the dark overlay" bug users reported).
          if (!previewRect || typeof document === "undefined") return null;
          const POPOVER_WIDTH = 280;
          const GAP = 8;
          const VIEWPORT_PAD = 12;
          const boxLeftPx = previewRect.left + s.box.x * previewRect.width;
          const boxRightPx =
            previewRect.left + (s.box.x + s.box.w) * previewRect.width;
          const boxTopPx = previewRect.top + s.box.y * previewRect.height;
          const boxBottomPx =
            previewRect.top + (s.box.y + s.box.h) * previewRect.height;
          // Anchor to the click point if we have one, otherwise fall back to
          // the box's horizontal center / vertical edges. Anchoring to the
          // click matters for tall boxes: clicking low should spawn the
          // popover low, not all the way at the top edge where the user
          // can't see it on short viewports.
          const clickX = clickPosRef.current?.x ?? (boxLeftPx + boxRightPx) / 2;
          const clickY = clickPosRef.current?.y ?? (boxTopPx + boxBottomPx) / 2;
          // Horizontal: bias towards the side of the box with more room, but
          // anchor to the click X so the popover feels attached to the
          // pointer. Clamp inside viewport.
          const rawLeft = anchorRight
            ? clickX - POPOVER_WIDTH + 40
            : clickX - 40;
          const clampedLeft = Math.max(
            VIEWPORT_PAD,
            Math.min(window.innerWidth - POPOVER_WIDTH - VIEWPORT_PAD, rawLeft),
          );
          // Vertical: pick whichever side of the click has more room, cap
          // the popover's maxHeight so it never spills off the viewport, and
          // let the avatar list scroll internally when space is tight. This
          // replaces the old bottom-anchor approach (which could push the
          // top edge above the viewport when the popover was taller than
          // the gap between the box top and the viewport top).
          const spaceBelow =
            window.innerHeight - clickY - VIEWPORT_PAD - GAP;
          const spaceAbove = clickY - VIEWPORT_PAD - GAP;
          // Prefer below the click unless above has noticeably more space —
          // matches how users expect dropdowns to open.
          const placeBelow =
            spaceBelow >= 260 || spaceBelow >= spaceAbove - 40;
          const availableSpace = placeBelow ? spaceBelow : spaceAbove;
          const maxHeightPx = Math.max(
            180,
            Math.min(520, availableSpace),
          );
          const verticalStyle: React.CSSProperties = placeBelow
            ? { top: clickY + GAP, maxHeight: maxHeightPx }
            : {
                bottom: window.innerHeight - clickY + GAP,
                maxHeight: maxHeightPx,
              };
          // Preserve the `flipUp` variable for parts of the UI that still
          // reference it (keeps the edit tight). The new placement flag is
          // what actually drives positioning now.
          void flipUp;

          const popoverNode = (
            <div
              ref={subjectPopoverRef}
              data-popover-root
              style={{
                position: "fixed",
                left: clampedLeft,
                ...verticalStyle,
                // Sit above the dashboard header, skeletons, and any dim
                // overlays. 9999 is the same layer the @mention dropdown
                // and chip switch menu use, so they all stack consistently.
                zIndex: 9999,
                width: POPOVER_WIDTH,
                maxWidth: "92vw",
                background: "var(--bg-secondary)",
                border: `1px solid var(--border-color)`,
                borderRadius: 12,
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.18)",
                overflow: "hidden",
                // Flex column so the avatar list can claim whatever vertical
                // space is left inside the clamped maxHeight and scroll
                // internally. Without this the child `max-h` would stack
                // on top of everything else and blow past the viewport.
                display: "flex",
                flexDirection: "column",
              }}
              onMouseDown={(e) => {
                // Keep the preview-level mousedown (which starts a new draw)
                // from firing when the user clicks inside the popover.
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="px-3 py-2.5 flex items-start gap-2"
                style={{
                  background: `${accent}1f`,
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <div
                  className="w-4 h-4 rounded-full mt-0.5 flex-shrink-0"
                  style={{ background: accent }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[12px] font-semibold leading-tight"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {titleForMode}
                  </div>
                  <div
                    className="text-[11px] leading-tight truncate"
                    style={{ color: "var(--text-secondary)" }}
                    title={s.label}
                  >
                    {s.label}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSubjectPopoverId(null);
                    setSubjectPopoverSearch("");
                  }}
                  className="w-6 h-6 rounded-md flex items-center justify-center hover:opacity-100 transition-opacity"
                  style={{
                    color: "var(--text-muted)",
                    background: "transparent",
                    opacity: 0.85,
                  }}
                  aria-label="Close"
                >
                  <XIcon size={12} />
                </button>
              </div>

              {/* Mode tabs — let the user override the default for this kind.
                  E.g., on a `text` box they can still pick "character" if
                  they want to replace the text with an actual person. */}
              <div
                className="flex"
                style={{ borderBottom: "1px solid var(--border-color)" }}
              >
                {(["character", "describe"] as const).map((m) => {
                  const active = activeMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSubjectPopoverMode(m)}
                      className="flex-1 text-[11.5px] font-medium py-2 transition-colors"
                      style={{
                        color: active ? accent : "var(--text-muted)",
                        background: active
                          ? `${accent}12`
                          : "transparent",
                        borderBottom: `2px solid ${active ? accent : "transparent"}`,
                      }}
                    >
                      {m === "character" ? "Swap character" : "Describe change"}
                    </button>
                  );
                })}
              </div>

              {activeMode === "character" ? (
                <>
                  {/* Paired-avatar banner (if any) — lets the user unpair in
                      one click without having to open the prompt and delete
                      it. */}
                  {paired && (
                    <div
                      className="px-3 py-2 flex items-center gap-2"
                      style={{
                        background: "var(--bg-primary)",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={paired.thumbnail}
                        alt={paired.name}
                        className="w-6 h-6 rounded-full object-cover"
                        style={{ border: "1.5px solid var(--border-color)" }}
                        draggable={false}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[11px] leading-tight"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Currently
                        </div>
                        <div
                          className="text-[12px] font-semibold leading-tight truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          @{paired.name}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          // Strip the avatar mention out; keep the subject
                          // mention so the user can still target the box.
                          const avatarRe = new RegExp(
                            `\\s*@${escReg(paired.name)}(?=\\s|$)`,
                            "gi",
                          );
                          setPrompt((p) =>
                            p
                              .replace(avatarRe, "")
                              .replace(/\s{2,}/g, " ")
                              .trimStart(),
                          );
                          setMentionedAvatarIds((prev) =>
                            prev.filter((id) => id !== paired.avatar_id),
                          );
                        }}
                        className="text-[11px] rounded-md px-2 py-1"
                        style={{
                          color: "var(--text-muted)",
                          background: "transparent",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        Unpair
                      </button>
                    </div>
                  )}

                  {/* Friendly nudge when the user opens "swap character" on
                      a non-person box — the avatar picker still works but
                      the result is less predictable. */}
                  {!isPersonLike && !paired && (
                    <div
                      className="px-3 py-2 text-[11px]"
                      style={{
                        color: "var(--text-muted)",
                        background: "var(--bg-primary)",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      This box isn&apos;t tagged as a person. Picking a character
                      will try to replace it with one — works best on humans.
                    </div>
                  )}

                  {/* Search */}
                  {avatars.length > 3 && (
                    <div
                      className="px-3 pt-2.5 pb-1.5"
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <div
                        className="flex items-center gap-1.5 px-2 rounded-md"
                        style={{
                          background: "var(--bg-primary)",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <Search size={12} />
                        <input
                          autoFocus
                          type="text"
                          value={subjectPopoverSearch}
                          onChange={(e) =>
                            setSubjectPopoverSearch(e.target.value)
                          }
                          placeholder="Search characters…"
                          className="flex-1 py-1.5 bg-transparent outline-none text-[12px]"
                          style={{ color: "var(--text-primary)" }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Avatar list (compact rows, scrollable).
                      flex-1 + minHeight:0 lets this section shrink/grow to
                      fill whatever vertical space is left inside the outer
                      popover's clamped maxHeight — and then its own
                      overflow-y-auto takes over for long lists. This is
                      what keeps the list visible on short viewports where
                      the whole popover would otherwise overflow. */}
                  <div
                    className="overflow-y-auto"
                    style={{ flex: "1 1 auto", minHeight: 0 }}
                  >
                    {avatars.length === 0 ? (
                      <div
                        className="px-3 py-5 text-center text-[12px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        No characters yet. Create one below.
                      </div>
                    ) : visibleAvatars.length === 0 ? (
                      <div
                        className="px-3 py-5 text-center text-[12px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        No match for &quot;{subjectPopoverSearch}&quot;.
                      </div>
                    ) : (
                      visibleAvatars.map((a) => {
                        const active = paired?.avatar_id === a.avatar_id;
                        return (
                          <button
                            key={a.avatar_id}
                            type="button"
                            onClick={() => pairSubjectWithAvatar(s, a)}
                            className="w-full px-3 py-2 flex items-center gap-2.5 text-left hover:opacity-100 transition-opacity"
                            style={{
                              background: active ? `${accent}1f` : "transparent",
                              opacity: active ? 1 : 0.92,
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={a.thumbnail}
                              alt={a.name}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                              style={{
                                border: "1.5px solid var(--border-color)",
                              }}
                              draggable={false}
                            />
                            <div className="min-w-0 flex-1">
                              <div
                                className="text-[12.5px] font-semibold leading-tight truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {a.name}
                              </div>
                              <div
                                className="text-[10.5px] leading-tight truncate"
                                style={{ color: "var(--text-muted)" }}
                              >
                                @{a.name}
                              </div>
                            </div>
                            {active && (
                              <div
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{
                                  background: accent,
                                  color: "#fff",
                                }}
                              >
                                ACTIVE
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Footer actions */}
                  <div
                    className="flex items-stretch gap-0 border-t"
                    style={{ borderColor: "var(--border-color)" }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        // Open the existing "Add character" popover in Upload
                        // mode and close this one — the user can create a new
                        // face and then come back to wire it up.
                        setSubjectPopoverId(null);
                        setSubjectPopoverSearch("");
                        setPickerTab("upload");
                        setCharPickerOpen(true);
                      }}
                      className="flex-1 px-3 py-2.5 flex items-center justify-center gap-1.5 text-[11.5px] font-medium"
                      style={{
                        color: "var(--text-secondary)",
                        background: "transparent",
                      }}
                    >
                      <Plus size={12} />
                      New character
                    </button>
                    <div
                      style={{
                        width: 1,
                        background: "var(--border-color)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        // Fallback: just drop the @subject mention in the
                        // prompt and let the user type the replacement.
                        toggleSubjectMentionRef.current(s);
                        setSubjectPopoverId(null);
                        setSubjectPopoverSearch("");
                      }}
                      className="flex-1 px-3 py-2.5 flex items-center justify-center gap-1.5 text-[11.5px] font-medium"
                      style={{
                        color: "var(--text-secondary)",
                        background: "transparent",
                      }}
                      title="Insert @mention only — type the replacement yourself"
                    >
                      Just mention
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Describe-change body.
                      A small textarea lets the user type what should happen
                      with this region. On Apply we append a targeted
                      directive (`@objectN <text>`) to the main prompt so
                      handleGenerate still crops to this box via target_label
                      — i.e., the AI knows WHERE to make the change, not just
                      WHAT. */}
                  <div className="p-3">
                    <textarea
                      autoFocus
                      value={subjectDescribeText}
                      onChange={(e) => setSubjectDescribeText(e.target.value)}
                      onKeyDown={(e) => {
                        // Cmd/Ctrl+Enter submits — friendlier than hunting
                        // for the Apply button.
                        if (
                          (e.metaKey || e.ctrlKey) &&
                          e.key === "Enter"
                        ) {
                          e.preventDefault();
                          applyDescribe();
                        }
                      }}
                      placeholder={
                        s.kind === "text"
                          ? "e.g., change the text to 'HOT DEAL'"
                          : s.kind === "object"
                          ? "e.g., change the color to neon red"
                          : "e.g., make it look brand new"
                      }
                      rows={3}
                      className="w-full px-2.5 py-2 text-[12.5px] rounded-md resize-none outline-none"
                      style={{
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                    />
                    {/* Quick-fill suggestions — tapping one pre-fills the
                        textarea so the user can tweak and hit Apply. */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {describeSuggestions.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setSubjectDescribeText(sug)}
                          className="text-[10.5px] px-2 py-1 rounded"
                          style={{
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {sug.trim() || "…"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Primary actions */}
                  <div
                    className="flex items-stretch gap-0 border-t"
                    style={{ borderColor: "var(--border-color)" }}
                  >
                    <button
                      type="button"
                      onClick={applyRemove}
                      className="flex-1 px-3 py-2.5 flex items-center justify-center gap-1.5 text-[11.5px] font-medium"
                      style={{
                        color: "var(--text-secondary)",
                        background: "transparent",
                      }}
                      title="Remove this element from the image"
                    >
                      Remove from image
                    </button>
                    <div
                      style={{
                        width: 1,
                        background: "var(--border-color)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={applyDescribe}
                      disabled={!subjectDescribeText.trim()}
                      className="flex-1 px-3 py-2.5 flex items-center justify-center gap-1.5 text-[11.5px] font-semibold"
                      style={{
                        color: subjectDescribeText.trim()
                          ? "#fff"
                          : "var(--text-muted)",
                        background: subjectDescribeText.trim()
                          ? accent
                          : "transparent",
                        opacity: subjectDescribeText.trim() ? 1 : 0.5,
                        cursor: subjectDescribeText.trim()
                          ? "pointer"
                          : "not-allowed",
                      }}
                      title="Apply this change — Cmd/Ctrl+Enter"
                    >
                      Apply
                    </button>
                  </div>

                  {/* Footer: fall back to raw @mention insertion */}
                  <div
                    className="border-t"
                    style={{ borderColor: "var(--border-color)" }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        toggleSubjectMentionRef.current(s);
                        setSubjectPopoverId(null);
                        setSubjectPopoverSearch("");
                      }}
                      className="w-full px-3 py-2 flex items-center justify-center gap-1.5 text-[11px]"
                      style={{
                        color: "var(--text-muted)",
                        background: "transparent",
                      }}
                      title="Insert @mention only — type the replacement yourself"
                    >
                      Just insert @{s.mention_name}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
          return createPortal(popoverNode, document.body);
        })()}
      </>
    );
  };

  return (
    <>
      <Header title="Thumbs" subtitle="Visuels qui font cliquer — YouTube + App Store" />
      {/* Studio shell — Pikzels-style: dot-grid background + mint glow at
          the bottom of the viewport. Both classes wrap the entire content
          area so every page (Prompt / Recreate / Edit / Title) shares the
          identity. studio-content sits above the glow. */}
      <div className="flex-1 overflow-y-auto studio-dot-grid studio-mint-glow glow-thumb">
        <div className="studio-content max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">
          <ThumbsModeTabs />
          {/* Title */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <PlaySquare size={18} />
            </div>
            <div>
              <h2 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Thumbnail Studio
              </h2>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Create from scratch, recreate from a YouTube link, edit an upload, or bake in a title.
              </p>
            </div>
          </div>

          {/* Inspiration link removed — its content is now reachable via
              the "Templates" sub-tab below the composer (no extra
              navigation needed). The standalone /inspiration route
              still exists for back-compat. */}

          {/* Mode tabs */}
          <div className="flex justify-center mb-6">
            <SegmentToggle
              selected={mode}
              onSelect={(k) => {
                setMode(k as Mode);
                setPrompt("");
                setError(null);
              }}
              items={MODE_ITEMS.map((m) => ({
                key: m.key,
                label: m.label,
                icon: <m.Icon size={14} />,
              }))}
            />
          </div>

          {/* Input card — wrapped in the Pikzels-style composer panel
              so the YouTube studio matches the Bento composer's
              identity (dark surface, rounded-3xl, mint focus halo).
              All the existing mode-specific UI (recreate URL field,
              edit upload, title input, prompt textarea, refs, aspect
              ratio, character picker) lives inside without any logic
              change — only the outer chrome is updated. */}
          <div
            className="composer-panel mb-5 relative"
            style={{ padding: 0 }}
          >
            {mode === "recreate" && (
              <div className="p-5 pb-0">
                <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>
                  YouTube URL
                </label>
                <div
                  className="flex items-center gap-2 rounded-xl px-3 relative overflow-hidden"
                  style={{
                    background: "var(--bg-primary)",
                    border: `1px solid ${loadingYtPreview ? "rgba(59,130,246,0.55)" : "var(--border-color)"}`,
                    transition: "border-color 0.2s ease",
                  }}
                >
                  <LinkIcon size={16} />
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="flex-1 bg-transparent outline-none py-3 text-[13px]"
                    style={{ color: "var(--text-primary)" }}
                  />
                  {loadingYtPreview && (
                    <span
                      className="text-[11px] font-medium whitespace-nowrap"
                      style={{ color: "#60a5fa" }}
                    >
                      Fetching preview…
                    </span>
                  )}
                  {youtubeUrl && (
                    <button
                      type="button"
                      onClick={() => setYoutubeUrl("")}
                      className="p-1 rounded-md"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Clear URL"
                    >
                      <XIcon size={14} />
                    </button>
                  )}
                  {/* Glowing blue progress bar that slides left→right while
                      the YouTube thumbnail is being fetched. Purely decorative
                      signal that the paste was registered and is processing. */}
                  {loadingYtPreview && (
                    <span
                      aria-hidden
                      className="absolute left-0 bottom-0 w-full pointer-events-none"
                      style={{ height: 3 }}
                    >
                      <span
                        className="block"
                        style={{
                          height: "100%",
                          width: "35%",
                          borderRadius: 2,
                          background:
                            "linear-gradient(90deg, rgba(59,130,246,0) 0%, rgba(96,165,250,0.9) 40%, #3b82f6 50%, rgba(96,165,250,0.9) 60%, rgba(59,130,246,0) 100%)",
                          boxShadow:
                            "0 0 10px rgba(59,130,246,0.75), 0 0 20px rgba(96,165,250,0.5)",
                          animation: "shimmerSweep 1.15s cubic-bezier(0.4, 0.0, 0.2, 1) infinite",
                        }}
                      />
                    </span>
                  )}
                </div>
                {ytPreview && (
                  <div className="mt-4">
                    <div
                      ref={mode === "recreate" ? previewContainerRef : null}
                      className="relative rounded-xl overflow-hidden"
                      style={{
                        aspectRatio: "16 / 9",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ytPreview.url}
                        alt="YouTube thumbnail preview"
                        className="w-full h-full object-cover pointer-events-none select-none"
                        draggable={false}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          if (img.naturalWidth && img.naturalHeight) {
                            setSourceNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                          }
                        }}
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (el.src.includes("maxresdefault")) {
                            el.src = el.src.replace("maxresdefault", "hqdefault");
                          } else if (el.src.includes("hqdefault")) {
                            el.src = el.src.replace("hqdefault", "mqdefault");
                          }
                        }}
                      />
                      {renderSubjectsOverlay()}
                    </div>
                    {renderDetectionControls()}
                  </div>
                )}
              </div>
            )}

            {mode === "edit" && (
              <div className="p-5 pb-0">
                <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>
                  Source thumbnail
                </label>
                {sourcePreview ? (
                  <>
                    <div
                      ref={mode === "edit" ? previewContainerRef : null}
                      className="relative rounded-xl overflow-hidden"
                      style={{
                        aspectRatio: sourceNaturalSize
                          ? `${sourceNaturalSize.w} / ${sourceNaturalSize.h}`
                          : "16 / 9",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sourcePreview}
                        alt="Source thumbnail"
                        className="w-full h-full object-cover pointer-events-none select-none"
                        draggable={false}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          if (img.naturalWidth && img.naturalHeight) {
                            setSourceNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                          }
                        }}
                      />
                      {renderSubjectsOverlay()}
                      <button
                        onClick={clearSource}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center z-10"
                        style={{
                          background: "rgba(0,0,0,0.55)",
                          color: "#fff",
                          backdropFilter: "blur(8px)",
                        }}
                        aria-label="Remove source"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                    {renderDetectionControls()}
                  </>
                ) : (
                  <div
                    onClick={() => sourceInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDropSource}
                    className="rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer"
                    style={{
                      aspectRatio: "16 / 9",
                      background: "var(--bg-primary)",
                      border: "1px dashed var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <Upload size={20} />
                    <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      Drop an image or click to upload
                    </div>
                    <div className="text-[11.5px]">PNG, JPG up to 10 MB</div>
                  </div>
                )}
                <input
                  ref={sourceInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSourceFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            )}

            {mode === "title" && (
              <div className="p-5 pb-0">
                <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>
                  Title to bake into the image
                  <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                    (optional — we&apos;ll write one if left empty)
                  </span>
                </label>
                <div
                  className="flex items-center gap-2 rounded-xl px-3"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <Type size={16} />
                  <input
                    type="text"
                    placeholder="e.g. I Tried This For 30 Days"
                    value={titleText}
                    onChange={(e) => setTitleText(e.target.value)}
                    maxLength={80}
                    className="flex-1 bg-transparent outline-none py-3 text-[13px]"
                    style={{ color: "var(--text-primary)" }}
                  />
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {titleText.length}/80
                  </span>
                </div>
              </div>
            )}

            {/* Prompt textarea + overlay */}
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {mode === "recreate"
                    ? "What should we change?"
                    : mode === "edit"
                      ? "Edit instructions"
                      : "Thumbnail concept"}
                  {avatars.length > 0 && (
                    <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                      — type <span style={{ fontFamily: "monospace" }}>@</span> to mention a character
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-1">
                  {/* Paste from clipboard */}
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    title="Paste from clipboard"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors"
                    style={{
                      color: "var(--text-muted)",
                      background: "transparent",
                      border: "1px solid var(--border-color)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--text-primary)";
                      e.currentTarget.style.background = "var(--bg-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--text-muted)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {/* Clipboard icon */}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="2" width="6" height="4" rx="1"/>
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                    </svg>
                    Paste
                  </button>
                  {/* Clear — only when there's something to clear */}
                  {prompt.trim() && (
                    <button
                      type="button"
                      onClick={() => { setPrompt(""); textareaRef.current?.focus(); }}
                      title="Clear prompt"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors"
                      style={{
                        color: "var(--text-muted)",
                        background: "transparent",
                        border: "1px solid var(--border-color)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#f87171";
                        e.currentTarget.style.background = "rgba(248,113,113,0.08)";
                        e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-muted)";
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderColor = "var(--border-color)";
                      }}
                    >
                      <XIcon size={10} />
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div
                className="relative rounded-xl overflow-hidden"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                }}
                // Drop a screenshot from Finder / browser onto the
                // prompt area and the backend describes it for you.
                onDragOver={(e) => {
                  if (Array.from(e.dataTransfer?.items || []).some(
                    (it) => it.kind === "file" && it.type.startsWith("image/")
                  )) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDrop={handlePromptDrop}
              >
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={handlePromptChange}
                  onKeyDown={handlePromptKeyDown}
                  onScroll={handleTextareaScroll}
                  onPaste={handlePromptPaste}
                  placeholder={
                    mode === "recreate"
                      ? "Make it more dramatic, add neon lighting…"
                      : mode === "edit"
                        ? "Remove the logo, brighten the subject…"
                        : "Describe the thumbnail you want to create… (tip: paste a YouTube link and we'll describe its thumbnail for you)"
                  }
                  rows={3}
                  className="relative w-full px-4 py-3 text-[13.5px] resize-none outline-none bg-transparent border-0 min-h-[96px]"
                  style={{
                    color: "transparent",
                    caretColor: "var(--text-primary)",
                    lineHeight: "1.6",
                    zIndex: 1,
                  }}
                />
                {/* In-flight indicator for YouTube URL auto-describe.
                    Blue LED shimmer at the bottom (same as the YouTube URL
                    input) + a small badge in the top-right corner. */}
                {(describingYoutubeUrls.size > 0 || generatingSmartPrompt) && (
                  <>
                    {/* Blue glowing sweep at the bottom edge of the textarea */}
                    <span
                      aria-hidden
                      className="absolute left-0 bottom-0 w-full pointer-events-none overflow-hidden rounded-b-xl"
                      style={{ height: 3, zIndex: 3 }}
                    >
                      <span
                        className="block"
                        style={{
                          height: "100%",
                          width: "35%",
                          borderRadius: 2,
                          background:
                            "linear-gradient(90deg, rgba(59,130,246,0) 0%, rgba(96,165,250,0.9) 40%, #3b82f6 50%, rgba(96,165,250,0.9) 60%, rgba(59,130,246,0) 100%)",
                          boxShadow:
                            "0 0 10px rgba(59,130,246,0.75), 0 0 20px rgba(96,165,250,0.5)",
                          animation: "shimmerSweep 1.15s cubic-bezier(0.4, 0.0, 0.2, 1) infinite",
                        }}
                      />
                    </span>
                    {/* Small status badge top-right */}
                    <div
                      className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium"
                      style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid rgba(59,130,246,0.35)",
                        color: "#3b82f6",
                        zIndex: 3,
                      }}
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-full border-2 animate-spin"
                        style={{
                          borderColor: "rgba(59,130,246,0.25)",
                          borderTopColor: "#3b82f6",
                        }}
                      />
                      {generatingSmartPrompt ? "Generating prompt…" : "Describing thumbnail…"}
                    </div>
                  </>
                )}
                <div
                  ref={overlayRef}
                  className="absolute inset-0 px-4 py-3 text-[13.5px] pointer-events-none whitespace-pre-wrap break-words overflow-hidden"
                  style={{ lineHeight: "1.6", zIndex: 2 }}
                >
                  {renderHighlightedPrompt(prompt)}
                </div>

                {/* Mention autocomplete */}
                {mentionQuery !== null && mentionFiltered.length > 0 && mentionPos && (
                  <div
                    className="fixed z-[9999] rounded-xl py-1 overflow-hidden"
                    style={{
                      top: mentionPos.top,
                      left: mentionPos.left,
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                      minWidth: 220,
                      maxWidth: 300,
                    }}
                  >
                    {mentionFiltered.map((opt, i) => {
                      const key =
                        opt.kind === "avatar" ? `a:${opt.avatar.avatar_id}` : `s:${opt.subject.id}`;
                      const name =
                        opt.kind === "avatar" ? opt.avatar.name : opt.subject.mention_name;
                      const thumb = opt.kind === "avatar" ? opt.avatar.thumbnail : null;
                      const subtitle =
                        opt.kind === "subject"
                          ? `${opt.subject.kind} · ${opt.subject.label}`
                          : null;
                      return (
                        <button
                          key={key}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
                          style={{
                            background:
                              i === mentionIndex ? "var(--bg-tertiary)" : "transparent",
                          }}
                          onMouseEnter={() => setMentionIndex(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectMention(opt);
                          }}
                        >
                          {opt.kind === "avatar" && thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt={name}
                              className="w-7 h-7 rounded-full object-cover shrink-0"
                            />
                          ) : opt.kind === "avatar" ? (
                            <div
                              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold"
                              style={{
                                background: "var(--bg-tertiary)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {name.charAt(0).toUpperCase()}
                            </div>
                          ) : (
                            // Subject icon: small colored pill matching the box color
                            <div
                              className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold"
                              style={{
                                background:
                                  opt.subject.kind === "person"
                                    ? "rgba(59,130,246,0.18)"
                                    : opt.subject.kind === "object"
                                      ? "rgba(168,85,247,0.18)"
                                      : opt.subject.kind === "text"
                                        ? "rgba(245,158,11,0.18)"
                                        : "rgba(16,185,129,0.18)",
                                color:
                                  opt.subject.kind === "person"
                                    ? "#3b82f6"
                                    : opt.subject.kind === "object"
                                      ? "#a855f7"
                                      : opt.subject.kind === "text"
                                        ? "#f59e0b"
                                        : "#10b981",
                              }}
                            >
                              {opt.subject.kind === "person"
                                ? "P"
                                : opt.subject.kind === "object"
                                  ? "O"
                                  : opt.subject.kind === "text"
                                    ? "T"
                                    : "•"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-[13px] font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {name}
                            </div>
                            {subtitle && (
                              <div
                                className="text-[10.5px] truncate"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {subtitle}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Chip switch dropdown — click an @name chip to swap it */}
              {chipDropdown && (
                <div
                  data-popover-root
                  className="fixed z-[9999] rounded-xl py-1 overflow-hidden"
                  style={{
                    top: chipDropdown.pos.top,
                    left: chipDropdown.pos.left,
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                    minWidth: 220,
                    maxWidth: 300,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Switch character
                  </div>
                  <div className="max-h-[260px] overflow-y-auto">
                    {avatars.map((a) => (
                      <button
                        key={a.avatar_id}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                        style={{
                          background:
                            a.avatar_id === chipDropdown.avatarId
                              ? "var(--bg-tertiary)"
                              : "transparent",
                        }}
                        onClick={() => switchMention(chipDropdown.avatarId, a)}
                      >
                        {a.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.thumbnail}
                            alt={a.name}
                            className="w-7 h-7 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div
                            className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold"
                            style={{
                              background: "var(--bg-tertiary)",
                              color: "var(--text-muted)",
                            }}
                          >
                            {a.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span
                          className="text-[13px] font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {a.name}
                        </span>
                        {a.avatar_id === chipDropdown.avatarId && (
                          <svg
                            className="ml-auto shrink-0"
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            fill="none"
                            aria-hidden
                          >
                            <path
                              d="M3 7l3 3 5-5"
                              stroke="#3b82f6"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Mentioned chips summary */}
              {mentionedAvatars.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Characters in prompt:
                  </span>
                  {mentionedAvatars.map((a) => (
                    <div
                      key={a.avatar_id}
                      className="flex items-center gap-1.5 rounded-full pr-2 pl-0.5 py-0.5"
                      style={{
                        background: "rgba(59,130,246,0.12)",
                        border: "1px solid rgba(59,130,246,0.3)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.thumbnail}
                        alt={a.name}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                      <span className="text-[11.5px] font-medium" style={{ color: "#3b82f6" }}>
                        @{a.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Smart Prompt toggle (prompt mode) / Sample chips (other modes) */}
              {mode === "prompt" ? (
                <div className="mt-3">
                  {!showSmartPrompt ? (
                    /* Collapsed: just a small trigger button */
                    <button
                      type="button"
                      onClick={() => setShowSmartPrompt(true)}
                      className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-all"
                      style={{
                        background: "var(--bg-hover)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-secondary)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent)";
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border-color)";
                        e.currentTarget.style.color = "var(--text-secondary)";
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                      </svg>
                      Generate from an idea
                    </button>
                  ) : (
                    /* Expanded: full form */
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-hover)",
                      }}
                    >
                      <div className="px-4 pt-3 pb-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
                            ✦ Generate the perfect prompt from your video idea
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowSmartPrompt(false)}
                            className="w-5 h-5 flex items-center justify-center rounded-md"
                            style={{ color: "var(--text-muted)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                          >
                            <XIcon size={10} />
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Your niche (Business, Fitness, Gaming…)"
                          value={smartNiche}
                          onChange={(e) => setSmartNiche(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-[12.5px] bg-transparent outline-none"
                          style={{
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Your video title or main topic"
                          value={smartTitle}
                          onChange={(e) => setSmartTitle(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-[12.5px] bg-transparent outline-none"
                          style={{
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <input
                          type="text"
                          placeholder="What happens in your video? (optional)"
                          value={smartDesc}
                          onChange={(e) => setSmartDesc(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSmartPrompt(); }}
                          className="w-full px-3 py-2 rounded-lg text-[12.5px] bg-transparent outline-none"
                          style={{
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <button
                          onClick={handleSmartPrompt}
                          disabled={!smartNiche.trim() || !smartTitle.trim() || generatingSmartPrompt}
                          className="w-full py-2 rounded-lg text-[12.5px] font-semibold transition-all disabled:opacity-40"
                          style={{ background: "var(--accent)", color: "var(--btn-text)" }}
                        >
                          {generatingSmartPrompt ? "Searching & generating…" : "Generate perfect prompt →"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {SAMPLE_PROMPTS[mode].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPrompt(s)}
                      className="text-[11.5px] px-2.5 py-1 rounded-md"
                      style={{
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Controls row — Pikzels-style icon-only toolbar.
                Sits flush with the textarea (no separator border) so
                the icons feel like they belong INSIDE the same input
                surface. Bottom-LEFT holds the main affordances (Add
                character, Refs, Aspect). Each is 34px circular with
                a native tooltip on hover (`title` attr) — no labels. */}
            <div
              className="flex items-center gap-2 px-4 pt-1 pb-3"
            >
              {/* Add character — bottom-LEFT (was bottom-right) */}
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setCharPickerOpen((v) => !v)}
                  title="Add a character — mention with @"
                  aria-label="Add a character"
                  aria-pressed={charPickerOpen}
                  className={"composer-tool " + (mentionedAvatarIds.length > 0 ? "is-active" : "")}
                >
                  <UserCircle size={16} />
                </button>

                {charPickerOpen && (
                  <div
                    className="absolute right-0 bottom-full mb-2 w-[340px] rounded-xl overflow-hidden"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
                      zIndex: 50,
                    }}
                  >
                    {/* Picker tabs */}
                    <div
                      className="flex p-1 gap-1"
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <SegmentToggle
                        size="sm"
                        className="w-full"
                        selected={pickerTab}
                        onSelect={(k) => setPickerTab(k as "library" | "upload")}
                        items={[
                          { key: "library", label: "My library" },
                          { key: "upload", label: "Upload new" },
                        ]}
                      />
                    </div>

                    {pickerTab === "library" && (
                      <div className="p-3">
                        <div
                          className="flex items-center gap-2 rounded-lg px-2.5 mb-2.5"
                          style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          <Search size={13} />
                          <input
                            type="text"
                            placeholder="Search characters…"
                            value={librarySearch}
                            onChange={(e) => setLibrarySearch(e.target.value)}
                            className="flex-1 bg-transparent outline-none py-2 text-[12.5px]"
                            style={{ color: "var(--text-primary)" }}
                          />
                        </div>
                        <div className="max-h-[260px] overflow-y-auto">
                          {filteredLibrary.length === 0 ? (
                            <p
                              className="text-[12px] text-center py-6"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {avatars.length === 0
                                ? "No characters yet — upload one on the right."
                                : "No matches."}
                            </p>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              {filteredLibrary.map((a) => {
                                const selected = mentionedAvatarIds.includes(a.avatar_id);
                                return (
                                  <button
                                    key={a.avatar_id}
                                    type="button"
                                    onClick={() => pickFromLibrary(a)}
                                    className="group relative rounded-lg overflow-hidden"
                                    style={{
                                      border: selected
                                        ? "2px solid #3b82f6"
                                        : "1px solid var(--border-color)",
                                      aspectRatio: "1 / 1",
                                      background: "var(--bg-secondary)",
                                    }}
                                  >
                                    {a.thumbnail ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={a.thumbnail}
                                        alt={a.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div
                                        className="w-full h-full flex items-center justify-center text-[16px] font-semibold"
                                        style={{
                                          background: "var(--bg-tertiary)",
                                          color: "var(--text-muted)",
                                        }}
                                      >
                                        {a.name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div
                                      className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10.5px] font-medium truncate"
                                      style={{
                                        background:
                                          "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))",
                                        color: "#fff",
                                      }}
                                    >
                                      {a.name}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {pickerTab === "upload" && (
                      <div className="p-3">
                        <label
                          className="text-[11px] font-medium mb-1.5 block"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Name
                        </label>
                        <input
                          type="text"
                          value={newCharName}
                          onChange={(e) => setNewCharName(e.target.value)}
                          placeholder="e.g. Nathan"
                          maxLength={40}
                          className="w-full rounded-lg px-3 py-2 text-[12.5px] outline-none mb-3"
                          style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />

                        <label
                          className="text-[11px] font-medium mb-1.5 block"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Photos <span style={{ color: "var(--text-muted)" }}>(1–4)</span>
                        </label>
                        <div className="grid grid-cols-4 gap-1.5 mb-3">
                          {newCharPreviews.map((src, i) => (
                            <div
                              key={i}
                              className="relative rounded-md overflow-hidden"
                              style={{
                                aspectRatio: "1 / 1",
                                border: "1px solid var(--border-color)",
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt="" className="w-full h-full object-cover" />
                              <button
                                onClick={() => {
                                  const url = newCharPreviews[i];
                                  if (url) URL.revokeObjectURL(url);
                                  setNewCharFiles((fs) => fs.filter((_, idx) => idx !== i));
                                  setNewCharPreviews((ps) => ps.filter((_, idx) => idx !== i));
                                }}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
                                aria-label="Remove"
                              >
                                <XIcon size={10} />
                              </button>
                            </div>
                          ))}
                          {newCharFiles.length < 4 && (
                            <button
                              type="button"
                              onClick={() => newCharInputRef.current?.click()}
                              className="rounded-md flex items-center justify-center"
                              style={{
                                aspectRatio: "1 / 1",
                                background: "var(--bg-secondary)",
                                border: "1px dashed var(--border-color)",
                                color: "var(--text-muted)",
                              }}
                              aria-label="Add photo"
                            >
                              <Upload size={13} />
                            </button>
                          )}
                        </div>
                        <input
                          ref={newCharInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          onChange={(e) => {
                            handleNewCharFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />

                        <button
                          type="button"
                          disabled={
                            !newCharName.trim() || newCharFiles.length === 0 || creatingChar
                          }
                          onClick={createCharacter}
                          className="w-full py-2 rounded-lg text-[12.5px] font-semibold flex items-center justify-center gap-1.5 disabled:cursor-not-allowed"
                          style={{
                            background:
                              newCharName.trim() && newCharFiles.length > 0 && !creatingChar
                                ? "var(--text-primary)"
                                : "var(--bg-tertiary)",
                            color:
                              newCharName.trim() && newCharFiles.length > 0 && !creatingChar
                                ? "var(--bg-primary)"
                                : "var(--text-muted)",
                            opacity:
                              newCharName.trim() && newCharFiles.length > 0 && !creatingChar
                                ? 1
                                : 0.6,
                          }}
                        >
                          {creatingChar ? (
                            <>
                              <Spinner size={13} />
                              Creating…
                            </>
                          ) : (
                            <>
                              <Plus size={13} />
                              Create & add
                            </>
                          )}
                        </button>
                        <p
                          className="text-[10.5px] mt-2 leading-snug"
                          style={{ color: "var(--text-muted)" }}
                        >
                          New character will be saved to your library and inserted into the prompt.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Refs upload — icon-only, tooltip on hover. Click
                  triggers the same hidden file input that already
                  powers drag-and-drop. */}
              <button
                type="button"
                onClick={() => refInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropRefs}
                title={
                  refs.length > 0
                    ? `${refs.length} reference image${refs.length === 1 ? "" : "s"} attached`
                    : "Add reference images (drag & drop or click)"
                }
                aria-label="Add reference image"
                className={"composer-tool " + (refs.length > 0 ? "is-active" : "")}
              >
                <ImageSquare size={16} />
              </button>
              <input
                ref={refInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) handleRefFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              {/* Aspect ratio — icon-only, opens a popover with the
                  full ratio choices. Pikzels pattern: don't stretch
                  5 ratio chips across the row when a single icon does
                  the job. */}
              <div className="relative" ref={aspectMenuRef}>
                <button
                  type="button"
                  onClick={() => setAspectMenuOpen((v) => !v)}
                  title={`Aspect ratio: ${aspectRatio}`}
                  aria-label="Choose aspect ratio"
                  aria-pressed={aspectMenuOpen}
                  className={
                    "composer-tool " + (aspectMenuOpen ? "is-active" : "")
                  }
                >
                  <Maximize size={16} />
                </button>
                {aspectMenuOpen && (
                  <div
                    className="absolute left-0 bottom-full mb-2 rounded-xl p-2 flex items-center gap-1"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      boxShadow: "0 12px 32px rgba(0,0,0,0.30)",
                      zIndex: 50,
                    }}
                  >
                    {ASPECT_ITEMS.map((item) => {
                      const active = aspectRatio === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setAspectRatio(item.key);
                            setAspectMenuOpen(false);
                          }}
                          title={item.key === "auto" ? "Auto (matches source)" : item.key}
                          aria-label={item.key}
                          aria-pressed={active}
                          className="rounded-lg flex items-center justify-center"
                          style={{
                            width: 38,
                            height: 38,
                            background: active
                              ? "var(--text-primary)"
                              : "var(--bg-primary)",
                            color: active
                              ? "var(--bg-primary)"
                              : "var(--text-secondary)",
                            border: `1px solid ${
                              active ? "var(--text-primary)" : "var(--border-color)"
                            }`,
                            cursor: "pointer",
                            transition:
                              "background 120ms, color 120ms, border-color 120ms",
                          }}
                        >
                          {item.icon}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Inline ref previews — small thumbnails right after
                  the toolbar icons. Hover shows the remove "x". */}
              {refPreviews.length > 0 && (
                <div className="flex items-center gap-1.5 ml-1">
                  {refPreviews.map((src, i) => (
                    <div
                      key={i}
                      className="relative w-7 h-7 rounded-md overflow-hidden group"
                      style={{ border: "1px solid var(--border-color)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeRef(i)}
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
                        style={{
                          background: "rgba(0,0,0,0.55)",
                          color: "#fff",
                        }}
                        aria-label="Remove reference"
                      >
                        <XIcon size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Spacer pushes any future right-side tools (mic, etc.)
                  to the bottom-right corner. Empty for now. */}
              <div style={{ flex: 1 }} />
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div
              className="rounded-xl px-4 py-3 mb-5 text-[13px]"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {error}
            </div>
          )}

          {/* Generate button */}
          <div className="flex justify-center mb-10">
            <button
              onClick={handleGenerate}
              disabled={!canSubmit()}
              className={
                (canSubmit() ? "btn-premium-yt " : "") +
                "flex items-center gap-2 px-6 py-3 rounded-full text-[14px] font-semibold disabled:cursor-not-allowed"
              }
              style={{
                ...(canSubmit()
                  ? {}
                  : {
                      background: "var(--bg-tertiary)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-color)",
                      opacity: 0.6,
                    }),
                minWidth: 220,
                justifyContent: "center",
              }}
            >
              {loading ? (
                <>
                  <Spinner size={16} />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <MagicWand size={16} />
                  <span>Generate thumbnail</span>
                </>
              )}
            </button>
          </div>

          {/* Gallery sub-tabs — segmented capsule that swaps the section
              below between the user's own thumbnails (history) and a
              curated Templates view. Centred on the page, same pill
              treatment as the top mode tabs (kargul-spec depth on the
              active state, transparent on the inactive one). */}
          <div className="flex justify-center mt-10 mb-4">
            <div className="tab-group-pill">
              <button
                type="button"
                onClick={() => setGallerySubTab("gallery")}
                aria-pressed={gallerySubTab === "gallery"}
                className={
                  "flex items-center gap-2 rounded-full " +
                  (gallerySubTab === "gallery" ? "btn-premium-yt" : "tab-pill-rest")
                }
                style={{
                  padding: "7px 16px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  border: gallerySubTab === "gallery" ? undefined : "1px solid transparent",
                }}
              >
                <SparkleIcon size={14} />
                Galerie
              </button>
              <button
                type="button"
                onClick={() => setGallerySubTab("templates")}
                aria-pressed={gallerySubTab === "templates"}
                className={
                  "flex items-center gap-2 rounded-full " +
                  (gallerySubTab === "templates" ? "btn-premium-yt" : "tab-pill-rest")
                }
                style={{
                  padding: "7px 16px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  border: gallerySubTab === "templates" ? undefined : "1px solid transparent",
                }}
              >
                <PlaySquare size={14} />
                Templates
              </button>
            </div>
          </div>

          {/* TEMPLATES VIEW — embeds the full Inspiration gallery
              (top-performing YouTube thumbnails by niche, fetched from
              YouTube Data API v3). Click a thumbnail → modal with
              "Recreate from prompt" / "Edit this image" CTAs that
              redirect back to the composer with the source pre-loaded.
              Replaces the standalone /dashboard/thumbnails/inspiration
              page so users no longer have to leave Thumbsy. */}
          {gallerySubTab === "templates" && <InspirationGallery />}

          {/* History — also visible during generation so the skeleton has a
              home to land in. The skeleton occupies the top-left slot (where
              the new thumbnail will appear once it arrives) so the user gets
              a clear "your thumbnail is on its way" signal instead of a
              spinner floating in blank space. */}
          {gallerySubTab === "gallery" && (history.length > 0 || loading) && (
            <>
              {/* Header flips into a bulk-actions bar as soon as the user
                  picks any tile. Mirrors /dashboard/images so the two
                  galleries stay consistent — reuse / download / delete with
                  a dismissal X on the right. */}
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-[14px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {selectedThumbIds.size > 0
                      ? `${selectedThumbIds.size} selected`
                      : "Your thumbnails"}
                  </h3>
                  {selectedThumbIds.size === 0 && (
                    <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      {loading && (
                        <span className="mr-2" style={{ color: "#3b82f6" }}>
                          Generating…
                        </span>
                      )}
                      {history.length} {history.length === 1 ? "thumbnail" : "thumbnails"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedThumbIds.size > 0 ? (
                    <>
                      <button
                        onClick={() => {
                          // "Select all" toggles on when there's a mixed or
                          // partial selection; clicking it again clears.
                          if (selectedThumbIds.size === history.length) {
                            clearThumbSelection();
                          } else {
                            setSelectedThumbIds(
                              new Set(history.map((t) => t.thumbnail_id)),
                            );
                          }
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                        style={{
                          color: "var(--text-primary)",
                          background: "var(--btn-raised-bg)",
                          border: "1px solid var(--btn-raised-border)",
                          boxShadow: "var(--shadow-btn-raised)",
                          transition: "box-shadow 0.25s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)"; }}
                        title={selectedThumbIds.size === history.length ? "Deselect all" : "Select all"}
                      >
                        {selectedThumbIds.size === history.length ? "Deselect all" : "Select all"}
                      </button>
                      <button
                        onClick={handleBulkReuse}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                        style={{
                          color: "var(--text-primary)",
                          background: "var(--btn-raised-bg)",
                          border: "1px solid var(--btn-raised-border)",
                          boxShadow: "var(--shadow-btn-raised)",
                          transition: "box-shadow 0.25s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)"; }}
                        title="Reuse prompt"
                      >
                        <RefreshCw size={13} /> Reuse
                      </button>
                      <button
                        onClick={handleBulkDownload}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                        style={{
                          color: "var(--text-primary)",
                          background: "var(--btn-raised-bg)",
                          border: "1px solid var(--btn-raised-border)",
                          boxShadow: "var(--shadow-btn-raised)",
                          transition: "box-shadow 0.25s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)"; }}
                        title="Download"
                      >
                        <Download size={13} /> Download
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        disabled={bulkDeleting}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-50"
                        style={{
                          color: "#ef4444",
                          background: "var(--btn-raised-bg)",
                          border: "1px solid rgba(239,68,68,0.25)",
                          boxShadow: "var(--shadow-btn-raised)",
                          transition: "box-shadow 0.25s ease, background 0.25s ease",
                        }}
                        onMouseEnter={(e) => { if (!bulkDeleting) { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.boxShadow = "var(--shadow-btn-raised-hover)"; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--btn-raised-bg)"; e.currentTarget.style.boxShadow = "var(--shadow-btn-raised)"; }}
                        title="Delete"
                      >
                        {bulkDeleting ? <Spinner size={13} /> : <Trash size={13} />} Delete
                      </button>
                      <button
                        onClick={clearThumbSelection}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-tertiary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        title="Clear selection"
                      >
                        <XIcon size={14} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* ── Pending skeleton tile ──
                    Rendered while a generate request is in flight. Occupies
                    the same footprint a finished thumbnail will take — same
                    aspect ratio, same caption rail — so when the image pops
                    in there's no layout jump. We resolve "auto" to either
                    the source image's natural ratio or 16:9 so the skeleton
                    is the correct shape. */}
                {loading &&
                  (() => {
                    const pendingRatio: AspectRatio =
                      aspectRatio === "auto"
                        ? sourceNaturalSize
                          ? closestRatio(
                              sourceNaturalSize.w,
                              sourceNaturalSize.h,
                            )
                          : "16:9"
                        : aspectRatio;
                    const ratioCss =
                      pendingRatio === "9:16"
                        ? "9 / 16"
                        : pendingRatio === "1:1"
                          ? "1 / 1"
                          : pendingRatio === "4:3"
                            ? "4 / 3"
                            : pendingRatio === "3:4"
                              ? "3 / 4"
                              : "16 / 9";
                    return (
                      <div
                        key="__pending_skeleton__"
                        className="relative rounded-xl overflow-hidden"
                        style={{
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-color)",
                        }}
                        aria-busy="true"
                        aria-label="Generating thumbnail"
                      >
                        <div
                          className="relative w-full overflow-hidden"
                          style={{
                            aspectRatio: ratioCss,
                            background: "var(--bg-primary)",
                          }}
                        >
                          {/* Animated shimmer sweep — gives the skeleton
                              the "something is happening" texture without
                              needing a separate spinner. Pure CSS. */}
                          <div
                            className="absolute inset-0 animate-pulse"
                            style={{
                              background:
                                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
                            }}
                          />
                          {/* Uses the shared shimmerSweep keyframe from
                              globals.css so the sweep matches the images
                              and videos pages. Blue-tinted so it reads as
                              an in-flight generation, not a passive skeleton. */}
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              zIndex: 10,
                              background:
                                "linear-gradient(90deg, transparent 25%, rgba(59,130,246,0.12) 50%, transparent 75%)",
                              animation: "shimmerSweep 2s ease-in-out infinite",
                            }}
                          />
                          {/* Mode chip (matches the position of the real
                              one so the layout doesn't shift). */}
                          <div
                            className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10.5px] font-medium uppercase tracking-wide flex items-center gap-1.5"
                            style={{
                              background: "rgba(0,0,0,0.55)",
                              color: "#fff",
                              backdropFilter: "blur(6px)",
                            }}
                          >
                            <Spinner size={10} />
                            {mode}
                          </div>
                          {/* Center status */}
                          <div
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <Spinner size={22} />
                              <div className="text-[11px] font-medium">
                                Painting your thumbnail…
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Caption rail skeleton */}
                        <div className="px-3 py-2.5">
                          <div
                            className="h-3 rounded mb-1.5 animate-pulse"
                            style={{
                              width: "88%",
                              background: "var(--bg-primary)",
                            }}
                          />
                          <div
                            className="h-3 rounded animate-pulse"
                            style={{
                              width: "62%",
                              background: "var(--bg-primary)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                {history.map((t, idx) => {
                  const isSelected = selectedThumbIds.has(t.thumbnail_id);
                  // Anything selected puts the grid into "select mode" — a
                  // plain click then toggles selection instead of opening
                  // the lightbox, which matches the image generator's UX.
                  const selectMode = selectedThumbIds.size > 0;
                  return (
                    <div
                      key={t.thumbnail_id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (selectMode) toggleThumbSelect(t.thumbnail_id, e);
                        else setLightboxIndex(idx);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (selectMode) {
                            setSelectedThumbIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.thumbnail_id))
                                next.delete(t.thumbnail_id);
                              else next.add(t.thumbnail_id);
                              return next;
                            });
                          } else {
                            setLightboxIndex(idx);
                          }
                        }
                      }}
                      className="group relative rounded-xl overflow-hidden text-left cursor-pointer select-none"
                      style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        outline: isSelected ? "2px solid #3b82f6" : undefined,
                        outlineOffset: isSelected ? "-2px" : undefined,
                      }}
                    >
                      <div
                        className="relative w-full"
                        style={{
                          aspectRatio:
                            t.aspect_ratio === "9:16"
                              ? "9 / 16"
                              : t.aspect_ratio === "1:1"
                                ? "1 / 1"
                                : t.aspect_ratio === "4:3"
                                  ? "4 / 3"
                                  : t.aspect_ratio === "3:4"
                                    ? "3 / 4"
                                    : "16 / 9",
                          background: "var(--bg-primary)",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.image_url}
                          alt={t.prompt}
                          className="w-full h-full object-cover pointer-events-none"
                          draggable={false}
                        />
                        {/* Mode chip — pushed down to leave the top-left
                            corner for the selection checkmark. */}
                        <div
                          className="absolute left-2 px-2 py-0.5 rounded-md text-[10.5px] font-medium uppercase tracking-wide pointer-events-none"
                          style={{
                            top: 34,
                            background: "rgba(0,0,0,0.55)",
                            color: "#fff",
                            backdropFilter: "blur(6px)",
                          }}
                        >
                          {t.mode}
                        </div>
                        {/* Checkmark — top-left, matches /dashboard/images.
                            Visible on hover + always when something is
                            selected in the grid (select mode). */}
                        <button
                          type="button"
                          onClick={(e) => toggleThumbSelect(t.thumbnail_id, e)}
                          className={`absolute top-2 left-2 w-5 h-5 rounded flex items-center justify-center transition-all ${isSelected || selectMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                          style={{
                            background: isSelected ? "#3b82f6" : "rgba(0,0,0,0.5)",
                            border: isSelected ? "none" : "1.5px solid rgba(255,255,255,0.6)",
                          }}
                          aria-label={isSelected ? "Deselect thumbnail" : "Select thumbnail"}
                        >
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        {/* Download — top-right, hover-reveal. Stops
                            propagation so it never triggers select/open. */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(t);
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.8)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.6)")}
                          aria-label="Download thumbnail"
                          title="Download"
                        >
                          <Download size={14} />
                        </button>
                        {/* Subtle darken on hover mirrors the images page. */}
                        {!isSelected && (
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all pointer-events-none" />
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        <p
                          className="text-[12px] leading-snug line-clamp-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {t.prompt}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {gallerySubTab === "gallery" && history.length === 0 && !loading && !historyLoading && (
            <div
              className="rounded-2xl px-6 py-10 text-center"
              style={{
                background: "var(--bg-secondary)",
                border: "1px dashed var(--border-color)",
              }}
            >
              <div
                className="w-12 h-12 mx-auto mb-3 rounded-lg flex items-center justify-center"
                style={{ background: "var(--bg-primary)" }}
              >
                <PlaySquare size={20} />
              </div>
              <h4 className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                No thumbnails yet
              </h4>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Pick a mode above and hit generate — your thumbnails will land here.
              </p>
            </div>
          )}

          {gallerySubTab === "gallery" && history.length === 0 && historyLoading && (
            <div
              className="rounded-2xl px-6 py-10 text-center flex flex-col items-center gap-2"
              style={{
                background: "var(--bg-secondary)",
                border: "1px dashed var(--border-color)",
                color: "var(--text-muted)",
              }}
            >
              <Spinner size={18} />
              <span className="text-[12.5px]">Loading your thumbnails…</span>
            </div>
          )}
        </div>
      </div>

      {/* Detail view — shared modal component with Copy prompt / Reuse /
          Create video actions, same as the image generator. */}
      {lightboxIndex !== null && history[lightboxIndex] && (() => {
        const t = history[lightboxIndex];
        // Prefer the new Supabase-hosted reference URL (stable) over the
        // legacy source_thumbnail_url (YouTube CDN, can rot). Falls back
        // to the legacy field for rows persisted before the encoding
        // upgrade so older thumbnails still show a reference.
        const heroRef = t.reference_image_url ?? t.source_thumbnail_url ?? null;
        const sourceLabel =
          t.mode === "recreate"
            ? "YouTube thumbnail"
            : t.mode === "edit"
            ? "Original upload"
            : "Source";
        const item: MediaDetailItem = {
          id: t.thumbnail_id,
          type: "image",
          url: t.image_url,
          prompt: t.prompt,
          created_at: t.created_at,
          aspect_ratio: t.aspect_ratio,
          model: "Google Nano Banana Pro",
          source_image_url: heroRef,
          source_link_url: t.source_url ?? null,
          source_label: sourceLabel,
        };
        return (
          <MediaDetailView
            item={item}
            position={{ index: lightboxIndex, total: history.length }}
            onClose={() => setLightboxIndex(null)}
            onPrev={
              lightboxIndex > 0
                ? () => setLightboxIndex((i) => (i !== null ? i - 1 : i))
                : undefined
            }
            onNext={
              lightboxIndex < history.length - 1
                ? () => setLightboxIndex((i) => (i !== null ? i + 1 : i))
                : undefined
            }
            onDownload={() => handleDownload(t)}
            onReusePrompt={() => {
              // Recreate-with-same-prompt flow: prefill the prompt, switch to
              // the same mode, and restore the original YouTube URL when we
              // have it (newer rows carry it, legacy ones fall back to
              // leaving the URL field empty so the user can paste fresh).
              setPrompt(t.prompt);
              setMode(t.mode);
              if (t.mode === "recreate") {
                setYoutubeUrl(t.source_url ?? "");
              }
              setLightboxIndex(null);
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
            onEdit={() => {
              // Load the generated thumbnail into Edit mode so the user can
              // further modify it.
              setMode("edit");
              setPrompt(t.prompt);
              fetch(t.image_url)
                .then((r) => r.blob())
                .then((blob) => {
                  const f = new File([blob], `thumb-${t.thumbnail_id}.png`, {
                    type: blob.type || "image/png",
                  });
                  handleSourceFile(f);
                })
                .catch(() => {});
              setLightboxIndex(null);
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
            onReuseSource={
              heroRef
                ? () => {
                    // User clicked the reference image itself → re-open
                    // the composer from the SAME starting point. For
                    // recreate mode we restore the YouTube URL so the
                    // backend re-fetches the original frame; for edit
                    // mode we fetch the stored reference bytes and drop
                    // them straight into the source slot.
                    setPrompt(t.prompt);
                    if (t.mode === "recreate" && t.source_url) {
                      setMode("recreate");
                      setYoutubeUrl(t.source_url);
                    } else {
                      setMode("edit");
                      fetch(heroRef)
                        .then((r) => r.blob())
                        .then((blob) => {
                          const f = new File(
                            [blob],
                            `source-${t.thumbnail_id}.png`,
                            { type: blob.type || "image/png" },
                          );
                          handleSourceFile(f);
                        })
                        .catch(() => {});
                    }
                    setLightboxIndex(null);
                    setTimeout(() => textareaRef.current?.focus(), 0);
                  }
                : undefined
            }
            onCreateVideo={() => {
              const params = new URLSearchParams();
              params.set("ref", t.image_url);
              if (t.prompt) params.set("prompt", t.prompt);
              setLightboxIndex(null);
              router.push(`/dashboard/videos?${params.toString()}`);
            }}
          />
        );
      })()}
    </>
  );
}
