"use client";

/**
 * Composer — Pikzels-style focal input panel.
 *
 * Visual reference: app.pikzels.com — a dark rounded panel that holds
 * the textarea + a row of icon-only tools (no labels), with the
 * Generate CTA living BELOW the panel as a separate centred pill.
 *
 * Spatial breakdown (matches the Pikzels reference 1:1):
 *
 *   ┌─────────────────────────────────────────┐  ← panel: rounded-3xl,
 *   │                                         │    dark bg, faint
 *   │   Describe your image…                  │    inner border, mint
 *   │                                         │    glow halo on focus.
 *   │                                         │
 *   │   ◯ ◯ ◯               🎤 ✨            │  ← tools row: left tools
 *   └─────────────────────────────────────────┘    + right tools, all
 *                                                  icon-only, tooltip
 *                                                  on hover.
 *              ┌──────────────────┐
 *              │  ✨ Generate  1× │              ← Generate CTA: lives
 *              └──────────────────┘                BELOW the panel, mint
 *                                                  pill with kargul
 *                                                  depth (.btn-premium).
 *
 * Why icon-only tools:
 *   - Hick's Law: a row of icons is processed ~3-4× faster than the
 *     same row with text labels. Useful when the user comes back to
 *     iterate — they don't need to re-read every option.
 *   - Native tooltip on hover (`title` attribute) restores the label
 *     for users who can't infer the icon.
 *   - When a tool is in an "active" state, the tooltip carries that
 *     status (e.g. "Style verrouillé sur cette image").
 *
 * The component is headless about WHAT the tools do — each studio
 * page supplies `leftTools` (main affordances) and `rightTools`
 * (passive controls like mic / quality). Keeps the shell shared.
 */

import { useEffect, useRef } from "react";
import { Spinner } from "@/components/Icons";

export interface ComposerTool {
  /** Stable key for React. */
  key: string;
  /** Icon node — 16-18px Untitled UI icon. */
  icon: React.ReactNode;
  /** Accessible label (also drives the native tooltip via `title`). */
  label: string;
  /** Optional longer hint that overrides `label` for the tooltip. */
  hint?: string;
  /** Click handler. */
  onClick: () => void;
  /** When true, the tool renders in active state. */
  active?: boolean;
  /** Backwards-compat: callers from the previous icon+label era may
   *  still pass a `badge`. We accept it but no longer render it —
   *  the icon-only tooltip pattern replaces it. */
  badge?: string;
}

interface ComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** Loading state — Generate button shows spinner. */
  submitting?: boolean;
  /** Submit CTA label. Default: "Generate". */
  submitLabel?: string;
  /** Disable submit even with non-empty value. */
  canSubmit?: boolean;
  /** Left-side tools row (main affordances). */
  leftTools?: ComposerTool[];
  /** Right-side tools row (passive controls). */
  rightTools?: ComposerTool[];
  /** Backwards-compat: caller can pass a single `tools` array which is
   *  treated as left tools. */
  tools?: ComposerTool[];
  /** Optional max-length on the textarea. */
  maxLength?: number;
  /** Optional small counter rendered next to "Generate" — e.g. "3×". */
  countLabel?: string;
}

export default function Composer({
  value,
  onChange,
  onSubmit,
  placeholder = "Décris ce que tu veux créer…",
  submitting = false,
  submitLabel = "Generate",
  canSubmit = true,
  leftTools,
  rightTools = [],
  tools,
  maxLength = 1200,
  countLabel,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Backwards-compat: callers that still pass `tools` get them on the
  // left side. New callers should use `leftTools` + `rightTools`.
  const effectiveLeftTools = leftTools ?? tools ?? [];

  // Auto-resize the textarea up to a comfortable cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 240);
    el.style.height = `${Math.max(72, next)}px`;
  }, [value]);

  const handleKey: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    // ⌘+Enter / Ctrl+Enter → submit. Plain Enter still inserts a line
    // break (prose writers' ergonomic stays).
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSubmit && !submitting) onSubmit();
    }
  };

  const disabled = !canSubmit || submitting;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {/* Panel — holds the textarea + tools rows. The Generate button
          sits OUTSIDE this panel, below. Mirrors the Pikzels reference. */}
      <div
        className="composer-panel"
        style={{
          width: "100%",
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          className="composer-textarea"
        />

        <div className="composer-toolbar">
          <div className="composer-tool-row">
            {effectiveLeftTools.map((tool) => (
              <ToolButton key={tool.key} tool={tool} />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div className="composer-tool-row">
            {rightTools.map((tool) => (
              <ToolButton key={tool.key} tool={tool} />
            ))}
            {/* Char counter — surfaces only past 70% so it doesn't
                clutter the toolbar for short prompts. */}
            {value.length > maxLength * 0.7 && (
              <span
                style={{
                  fontSize: 11,
                  color:
                    value.length >= maxLength
                      ? "var(--error)"
                      : "var(--text-muted)",
                  alignSelf: "center",
                  marginLeft: 4,
                }}
              >
                {value.length}/{maxLength}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Generate CTA — separate pill below the panel, centred. */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        title={canSubmit ? `${submitLabel} (⌘↵)` : "Remplis la zone pour activer"}
        className={
          "composer-submit " + (disabled ? "" : "btn-premium-bento")
        }
        style={{
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? (
          <>
            <Spinner size={14} color="currentColor" />
            <span>Génération…</span>
          </>
        ) : (
          <>
            <SparkIcon />
            <span>{submitLabel}</span>
            {countLabel && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(0,0,0,0.18)",
                  padding: "2px 7px",
                  borderRadius: 999,
                  marginLeft: 2,
                }}
              >
                {countLabel}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}

function ToolButton({ tool }: { tool: ComposerTool }) {
  return (
    <button
      type="button"
      onClick={tool.onClick}
      title={tool.hint || tool.label}
      aria-label={tool.label}
      aria-pressed={tool.active}
      className={"composer-tool " + (tool.active ? "is-active" : "")}
    >
      {tool.icon}
    </button>
  );
}

/* Spark icon — used inside the Generate CTA. Tiny inline SVG so we
   don't need a new import + the four-pointed sparkle reads as
   "generate" universally. */
function SparkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2.5l1.7 5.6 5.8 1.7-5.8 1.7L12 17.1l-1.7-5.6-5.8-1.7 5.8-1.7L12 2.5zM18.5 14l.85 2.65L22 17.5l-2.65.85L18.5 21l-.85-2.65L15 17.5l2.65-.85L18.5 14z" />
    </svg>
  );
}
