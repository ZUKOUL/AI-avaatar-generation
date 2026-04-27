"use client";

/**
 * Composer — the single focal point of every Thumbs studio page.
 *
 * One prompt input. One Generate CTA. A row of icon-only "tools" that
 * open optional flyouts (template picker, lock, refs, advanced). No
 * forest of fields.
 *
 * Design rationale (from the UX audit + creator-AI references like
 * Higgsfield, Krea, Cursor's chat panel):
 *   • The user's only required decision should be what they want.
 *     Everything else is a refinement, surfaced as an icon, not a label.
 *   • The composer sits at the BOTTOM of the page so the result canvas
 *     gets the eye-line. ChatGPT, Claude, Cursor, Krea — same pattern.
 *   • Tools are icons + tooltips, not labels. Icons are 70% faster to
 *     scan than text (Hick's law applied at the toolbar level).
 *   • The submit button is a clear typographic CTA with one keyboard
 *     hint ("⌘↵") so power users feel at home.
 *
 * The component is intentionally headless about WHAT the tools do —
 * each studio (Bento / App Store / YouTube) supplies its own tool
 * array. Keeps the shell shared while letting each mode keep its
 * specific affordances.
 */

import { useEffect, useRef } from "react";
import { ArrowRight, Spinner } from "@/components/Icons";

export interface ComposerTool {
  /** Stable key for React. */
  key: string;
  /** Icon node — usually a 16-18px Untitled UI icon. */
  icon: React.ReactNode;
  /** Visible label for the button + accessibility name. */
  label: string;
  /** Tooltip / longer hint on hover. */
  hint?: string;
  /** Click handler. */
  onClick: () => void;
  /** When true, the tool renders as "active" — used by Lock-style etc. */
  active?: boolean;
  /** Tiny right-side label (e.g. "Locked", "Verrouillé"). */
  badge?: string;
}

interface ComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** When set, the submit button shows the loading spinner + this label. */
  submitting?: boolean;
  /** Submit CTA label. Default: "Générer". */
  submitLabel?: string;
  /** When false, the button is disabled even with non-empty value. */
  canSubmit?: boolean;
  /** Tool buttons — rendered as icon row left of the CTA. */
  tools?: ComposerTool[];
  /** Optional kicker text rendered above the textarea (small grey). */
  kicker?: string;
  /** Optional max-length the textarea will enforce. */
  maxLength?: number;
}

export default function Composer({
  value,
  onChange,
  onSubmit,
  placeholder = "Décris ce que tu veux créer…",
  submitting = false,
  submitLabel = "Générer",
  canSubmit = true,
  tools = [],
  kicker,
  maxLength = 1200,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea up to a comfortable cap. Beats a fixed
  // height (cramped on long prompts) and a free-grow textarea (jumpy
  // when the user scrolls past).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 240);
    el.style.height = `${Math.max(64, next)}px`;
  }, [value]);

  const handleKey: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    // ⌘+Enter (Mac) or Ctrl+Enter (Windows/Linux) submits without
    // losing the line-break-on-Enter ergonomic for prose writers.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSubmit && !submitting) onSubmit();
    }
  };

  const disabled = !canSubmit || submitting;

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: 18,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 32px rgba(0,0,0,0.18)",
      }}
    >
      {kicker && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.04em",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
          }}
        >
          {kicker}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={2}
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          color: "var(--text-primary)",
          fontSize: 15,
          lineHeight: 1.5,
          minHeight: 64,
          width: "100%",
          fontFamily: "inherit",
        }}
      />

      <div className="flex items-center gap-2 flex-wrap">
        {/* Tools row — icon-only buttons, label appears as a tiny right
            badge when the tool has a state worth surfacing. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {tools.map((tool) => (
            <button
              key={tool.key}
              type="button"
              onClick={tool.onClick}
              title={tool.hint || tool.label}
              aria-label={tool.label}
              aria-pressed={tool.active}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: tool.badge ? "6px 10px 6px 8px" : "6px 8px",
                borderRadius: 999,
                background: tool.active ? "var(--text-primary)" : "var(--bg-primary)",
                color: tool.active ? "var(--bg-primary)" : "var(--text-secondary)",
                border:
                  "1px solid " +
                  (tool.active ? "var(--text-primary)" : "var(--border-color)"),
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                transition: "background 120ms, color 120ms, border-color 120ms",
              }}
              onMouseEnter={(e) => {
                if (!tool.active) {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!tool.active) {
                  e.currentTarget.style.background = "var(--bg-primary)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              <span style={{ display: "inline-flex" }}>{tool.icon}</span>
              {tool.badge && <span>{tool.badge}</span>}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Char counter — invisible until the user is close to the cap.
            Reduces noise for short prompts. */}
        {value.length > maxLength * 0.7 && (
          <div
            style={{
              fontSize: 11,
              color:
                value.length >= maxLength
                  ? "var(--error)"
                  : "var(--text-secondary)",
            }}
          >
            {value.length} / {maxLength}
          </div>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className={disabled ? "" : "btn-premium"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 16px",
            borderRadius: 999,
            background: disabled ? "var(--bg-primary)" : "var(--text-primary)",
            color: disabled ? "var(--text-muted)" : "var(--bg-primary)",
            border:
              "1px solid " +
              (disabled ? "var(--border-color)" : "var(--text-primary)"),
            fontSize: 13,
            fontWeight: 600,
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "background 120ms, color 120ms",
          }}
        >
          {submitting ? (
            <Spinner size={14} />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
          {submitting ? "Génération…" : submitLabel}
          {!submitting && (
            <span
              style={{
                fontSize: 10,
                opacity: 0.5,
                marginLeft: 4,
                fontWeight: 500,
              }}
            >
              ⌘↵
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
