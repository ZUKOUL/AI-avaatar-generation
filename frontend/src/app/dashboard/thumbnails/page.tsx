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
import Header from "@/components/Header";
import SegmentToggle from "@/components/SegmentToggle";
import { avatarAPI, thumbnailAPI } from "@/lib/api";
import {
  Download,
  LinkIcon,
  MagicWand,
  PlaySquare,
  Pencil,
  Plus,
  Search,
  Spinner,
  Type,
  Upload,
  UserCircle,
  XIcon,
} from "@/components/Icons";

type Mode = "prompt" | "recreate" | "edit" | "title";
type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

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
  youtube_video_id?: string | null;
}

/**
 * A person detected by Gemini 2.5 Flash in the source thumbnail. Box is in
 * fractional coordinates (0-1) relative to the rendered image — we multiply
 * by 100 to position the overlay with CSS percents.
 */
interface DetectedPerson {
  id: string;
  label: string;
  is_main: boolean;
  box: { x: number; y: number; w: number; h: number };
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

const ASPECT_ITEMS: { key: AspectRatio; icon: React.ReactNode }[] = [
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
  const [mode, setMode] = useState<Mode>("prompt");
  const [prompt, setPrompt] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [titleText, setTitleText] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [refs, setRefs] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedThumbnail[]>([]);
  const [lightbox, setLightbox] = useState<GeneratedThumbnail | null>(null);

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

  /* ─── Person detection on the source thumbnail ───
   * When a YouTube URL is validated or a source image is uploaded we ship
   * the bytes to Gemini 2.5 Flash, get back bounding boxes, and let the user
   * click the human they want to replace. That click becomes the
   * `person_to_replace_label` hint on the generation call. */
  const [detectedPeople, setDetectedPeople] = useState<DetectedPerson[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  // Which source image hash has already been detected — avoids re-running on
  // every render. Keyed by youtube videoId or object URL.
  const lastDetectedKey = useRef<string | null>(null);

  const refInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  const mentionFiltered =
    mentionQuery !== null
      ? avatars
          .filter((a) => a.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6)
      : [];

  /* ─── Load avatars on mount ─── */
  useEffect(() => {
    avatarAPI
      .list()
      .then((res) => setAvatars(res.data.avatars || []))
      .catch(() => setAvatars([]));
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
  };
  const clearSource = () => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setSourceFile(null);
    setSourcePreview(null);
  };

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

  const selectMention = (avatar: Avatar) => {
    const start = mentionStartRef.current;
    if (start === null) return;
    const before = prompt.slice(0, start);
    const cursor = textareaRef.current?.selectionStart || prompt.length;
    const after = prompt.slice(cursor);
    setPrompt(`${before}@${avatar.name}  ${after}`);
    // Track the mentioned avatar so we can attach its photo at submit time.
    setMentionedAvatarIds((prev) =>
      prev.includes(avatar.avatar_id) ? prev : [...prev, avatar.avatar_id],
    );
    setMentionQuery(null);
    mentionStartRef.current = null;
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        const pos = before.length + avatar.name.length + 3;
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

  // Render prompt with highlighted @name chips as an overlay. The raw text
  // layer above (textarea) stays transparent, caret preserved.
  const renderHighlightedPrompt = (text: string) => {
    if (!text) return null;
    const names = avatars.map((a) => a.name).sort((a, b) => b.length - a.length);
    if (!names.length) return <span style={{ color: "var(--text-primary)" }}>{text}</span>;
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(@(?:${names.map(esc).join("|")}))(?=\\s|$)`,
      "gi",
    );
    const parts = text.split(pattern);
    return parts.map((part, i) => {
      const m = part.match(/^@(.+)$/);
      if (m) {
        const av = avatars.find((a) => a.name.toLowerCase() === m[1].toLowerCase());
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
      return;
    }
    if (!youtubeUrl.trim()) {
      setYtPreview(null);
      return;
    }
    if (ytDebounceRef.current) window.clearTimeout(ytDebounceRef.current);
    ytDebounceRef.current = window.setTimeout(async () => {
      try {
        const res = await thumbnailAPI.youtubePreview(youtubeUrl.trim());
        setYtPreview({
          videoId: res.data.video_id,
          url: res.data.thumbnail_urls.maxres,
        });
        setError(null);
      } catch {
        setYtPreview(null);
      }
    }, 350);
    return () => {
      if (ytDebounceRef.current) window.clearTimeout(ytDebounceRef.current);
    };
  }, [youtubeUrl, mode]);

  /* ─── Detect people in the source thumbnail ───
   * Fires whenever we have a new YouTube preview (recreate) or a newly
   * uploaded source file (edit). Each source is keyed so switching back and
   * forth doesn't re-burn credits. */
  useEffect(() => {
    let key: string | null = null;
    let run: (() => Promise<void>) | null = null;

    if (mode === "recreate" && ytPreview?.videoId) {
      key = `yt:${ytPreview.videoId}`;
      run = async () => {
        const fd = new FormData();
        fd.append("youtube_url", youtubeUrl.trim());
        const res = await thumbnailAPI.detectPeople(fd);
        setDetectedPeople(res.data.people || []);
      };
    } else if (mode === "edit" && sourceFile) {
      key = `edit:${sourceFile.name}:${sourceFile.size}:${sourceFile.lastModified}`;
      run = async () => {
        const fd = new FormData();
        fd.append("file", sourceFile);
        const res = await thumbnailAPI.detectPeople(fd);
        setDetectedPeople(res.data.people || []);
      };
    } else {
      setDetectedPeople([]);
      setSelectedPersonId(null);
      lastDetectedKey.current = null;
      return;
    }

    if (key === lastDetectedKey.current) return;
    lastDetectedKey.current = key;
    setSelectedPersonId(null);
    setDetectedPeople([]);
    setDetecting(true);

    let cancelled = false;
    (async () => {
      try {
        await run!();
      } catch {
        if (!cancelled) setDetectedPeople([]);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ytPreview, sourceFile, youtubeUrl]);

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
      form.append("prompt", prompt.trim() || "Recreate with the same theme but a fresh take.");
      form.append("aspect_ratio", aspectRatio);
      if (mode === "recreate" && youtubeUrl.trim()) {
        form.append("youtube_url", youtubeUrl.trim());
      }
      if (mode === "title") {
        form.append("title_text", titleText.trim());
      }
      // When the user clicked a detected person, pass its label so the
      // backend can pin the face-swap to exactly that subject.
      if (selectedPersonId && (mode === "recreate" || mode === "edit")) {
        const picked = detectedPeople.find((p) => p.id === selectedPersonId);
        if (picked) form.append("person_to_replace_label", picked.label);
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
  }, [mode, prompt, aspectRatio, youtubeUrl, titleText, sourceFile, refs, mentionedAvatarIds, avatars, selectedPersonId, detectedPeople]);

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

  /* ─── Derived UI values ─── */
  const filteredLibrary = avatars.filter((a) =>
    a.name.toLowerCase().includes(librarySearch.toLowerCase()),
  );
  const mentionedAvatars = mentionedAvatarIds
    .map((id) => avatars.find((a) => a.avatar_id === id))
    .filter((a): a is Avatar => !!a);

  /**
   * Clickable boxes that sit on top of the source thumbnail image. The parent
   * wrapper must be `position: relative` and sized — the boxes position
   * themselves with percent-based left/top/width/height so they stay aligned
   * when the wrapper resizes.
   */
  const renderPeopleOverlay = () => {
    if (detecting) {
      return (
        <div
          className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-medium pointer-events-none"
          style={{
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            backdropFilter: "blur(6px)",
          }}
        >
          <Spinner size={10} />
          Detecting people…
        </div>
      );
    }
    if (detectedPeople.length === 0) return null;
    return (
      <>
        {detectedPeople.map((p) => {
          const selected = selectedPersonId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPersonId((prev) => (prev === p.id ? null : p.id));
              }}
              className="absolute group"
              style={{
                left: `${p.box.x * 100}%`,
                top: `${p.box.y * 100}%`,
                width: `${p.box.w * 100}%`,
                height: `${p.box.h * 100}%`,
                border: selected
                  ? "2.5px solid #3b82f6"
                  : "2px solid rgba(255,255,255,0.85)",
                borderRadius: 8,
                background: selected ? "rgba(59,130,246,0.18)" : "transparent",
                boxShadow: selected
                  ? "0 0 0 2px rgba(59,130,246,0.25), 0 2px 8px rgba(0,0,0,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.35)",
                transition: "background 0.15s ease, border-color 0.15s ease",
                cursor: "pointer",
              }}
              aria-label={`Select ${p.label}`}
              title={p.label}
            >
              <span
                className="absolute left-0 -top-6 px-1.5 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap max-w-[180px] truncate"
                style={{
                  background: selected ? "#3b82f6" : "rgba(0,0,0,0.7)",
                  color: "#fff",
                  backdropFilter: "blur(6px)",
                }}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </>
    );
  };

  return (
    <>
      <Header title="Thumbnails" subtitle="Generate viral YouTube thumbnails with Nano Banana Pro" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10">
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

          {/* Mode tabs */}
          <div className="flex justify-center mb-6">
            <SegmentToggle
              selected={mode}
              onSelect={(k) => {
                setMode(k as Mode);
                setError(null);
              }}
              items={MODE_ITEMS.map((m) => ({
                key: m.key,
                label: m.label,
                icon: <m.Icon size={14} />,
              }))}
            />
          </div>

          {/* Input card */}
          <div
            className="rounded-2xl mb-5 relative"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            {mode === "recreate" && (
              <div className="p-5 pb-0">
                <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>
                  YouTube URL
                </label>
                <div
                  className="flex items-center gap-2 rounded-xl px-3"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
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
                </div>
                {ytPreview && (
                  <div className="mt-4">
                    <div
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
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (el.src.includes("maxresdefault")) {
                            el.src = el.src.replace("maxresdefault", "hqdefault");
                          } else if (el.src.includes("hqdefault")) {
                            el.src = el.src.replace("hqdefault", "mqdefault");
                          }
                        }}
                      />
                      {renderPeopleOverlay()}
                    </div>
                    <p className="text-[11.5px] mt-2" style={{ color: "var(--text-muted)" }}>
                      {detectedPeople.length > 0
                        ? selectedPersonId
                          ? "Person selected — add a character below and generate to swap."
                          : "Click a highlighted person to target them for replacement."
                        : "We'll remix this thumbnail based on your prompt below."}
                    </p>
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
                      className="relative rounded-xl overflow-hidden"
                      style={{
                        aspectRatio: "16 / 9",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sourcePreview} alt="Source thumbnail" className="w-full h-full object-cover" />
                      {renderPeopleOverlay()}
                      <button
                        onClick={clearSource}
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
                    {detectedPeople.length > 0 && (
                      <p className="text-[11.5px] mt-2" style={{ color: "var(--text-muted)" }}>
                        {selectedPersonId
                          ? "Person selected — add a character below and generate to swap."
                          : "Click a highlighted person to target them for replacement."}
                      </p>
                    )}
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
              <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>
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
              <div
                className="relative rounded-xl overflow-hidden"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={handlePromptChange}
                  onKeyDown={handlePromptKeyDown}
                  onScroll={handleTextareaScroll}
                  placeholder={
                    mode === "recreate"
                      ? "Make it more dramatic, add neon lighting…"
                      : mode === "edit"
                        ? "Remove the logo, brighten the subject…"
                        : "Describe the thumbnail you want to create…"
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
                    {mentionFiltered.map((a, i) => (
                      <button
                        key={a.avatar_id}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
                        style={{
                          background: i === mentionIndex ? "var(--bg-tertiary)" : "transparent",
                        }}
                        onMouseEnter={() => setMentionIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectMention(a);
                        }}
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
                            style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
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
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Chip switch dropdown — click an @name chip to swap it */}
              {chipDropdown && (
                <div
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

              {/* Sample prompts */}
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
            </div>

            {/* Controls row */}
            <div
              className="flex flex-wrap items-center gap-4 px-5 py-3"
              style={{ borderTop: "1px solid var(--border-color)" }}
            >
              {/* Aspect ratio with animated sliding pill */}
              <div className="flex items-center gap-2">
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Aspect
                </span>
                <SegmentToggle
                  size="sm"
                  selected={aspectRatio}
                  onSelect={(k) => setAspectRatio(k as AspectRatio)}
                  items={ASPECT_ITEMS}
                />
              </div>

              {/* Reference images (manual upload, still supported) */}
              <div className="flex items-center gap-2">
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Refs
                </span>
                <div className="flex items-center gap-1.5">
                  {refPreviews.map((src, i) => (
                    <div
                      key={i}
                      className="relative w-8 h-8 rounded-md overflow-hidden group"
                      style={{ border: "1px solid var(--border-color)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeRef(i)}
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
                        style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
                        aria-label="Remove reference"
                      >
                        <XIcon size={10} />
                      </button>
                    </div>
                  ))}
                  {refs.length < 5 && (
                    <button
                      type="button"
                      onClick={() => refInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={onDropRefs}
                      className="w-8 h-8 rounded-md flex items-center justify-center"
                      style={{
                        background: "var(--bg-primary)",
                        border: "1px dashed var(--border-color)",
                        color: "var(--text-muted)",
                      }}
                      aria-label="Add reference image"
                    >
                      <Upload size={12} />
                    </button>
                  )}
                </div>
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
              </div>

              {/* "Add character" button — bottom-right */}
              <div className="relative ml-auto" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setCharPickerOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-medium"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  <UserCircle size={14} />
                  Add character
                  <Plus size={13} />
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
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold disabled:cursor-not-allowed"
              style={{
                background: canSubmit() ? "var(--text-primary)" : "var(--bg-tertiary)",
                color: canSubmit() ? "var(--bg-primary)" : "var(--text-muted)",
                boxShadow: canSubmit()
                  ? "0 1px 2px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.12)"
                  : "none",
                opacity: canSubmit() ? 1 : 0.6,
                transition: "box-shadow 0.2s ease, opacity 0.2s ease",
                minWidth: 200,
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

          {/* History */}
          {history.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Your thumbnails
                </h3>
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {history.length} generated this session
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map((t) => (
                  <button
                    key={t.thumbnail_id}
                    onClick={() => setLightbox(t)}
                    className="group relative rounded-xl overflow-hidden text-left"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
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
                      <img src={t.image_url} alt={t.prompt} className="w-full h-full object-cover" />
                      <div
                        className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10.5px] font-medium uppercase tracking-wide"
                        style={{
                          background: "rgba(0,0,0,0.55)",
                          color: "#fff",
                          backdropFilter: "blur(6px)",
                        }}
                      >
                        {t.mode}
                      </div>
                    </div>
                    <div className="px-3 py-2.5">
                      <p
                        className="text-[12px] leading-snug line-clamp-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t.prompt}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {history.length === 0 && !loading && (
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
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)" }}
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative rounded-2xl overflow-hidden flex flex-col"
            style={{
              // Keep the lightbox compact so the generated image is always
              // visible in full without scrolling — users were complaining the
              // previous 1100px wide panel filled their screen.
              width: "min(88vw, 680px)",
              maxHeight: "78vh",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 h-12 shrink-0"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-md"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  {lightbox.mode}
                </span>
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {lightbox.aspect_ratio}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDownload(lightbox)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px]"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  <Download size={14} />
                  Download
                </button>
                <button
                  onClick={() => setLightbox(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Close"
                >
                  <XIcon size={16} />
                </button>
              </div>
            </div>
            <div
              className="flex-1 flex items-center justify-center p-4 overflow-hidden"
              style={{ background: "var(--bg-primary)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.image_url}
                alt={lightbox.prompt}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
            <div className="px-5 py-3 shrink-0" style={{ borderTop: "1px solid var(--border-color)" }}>
              <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                {lightbox.prompt}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
