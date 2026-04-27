"use client";

/**
 * TemplatesStrip — horizontal scrolling row of template thumbnails
 * that sits at the bottom of a studio page.
 *
 * Why a strip vs a grid:
 *   • Grids make users feel they MUST decide on a template before
 *     starting. A horizontal strip is browsable but optional —
 *     "scroll if you want inspiration, otherwise just type your
 *     prompt".
 *   • Mirrors Higgsfield's "Visual Effects" preset row and Pikzels'
 *     template tray — the convention creators already know.
 *   • Edges fade out via the .studio-strip CSS mask, so the row
 *     visually communicates "more inspiration sideways" without a
 *     scrollbar pollution.
 *
 * Each card is fully visual (no text), with hover-revealed action and
 * label. Click → fires onPick with the selected example.
 */

import { ExampleCard } from "./HeroExamples";

interface TemplatesStripProps {
  examples: ExampleCard[];
  /** Aspect ratio for each card. Default 16:9 fits YouTube thumbs. */
  aspectRatio?: string;
  /** Card height in px — width derives from aspect. */
  cardHeight?: number;
  /** Click handler — called with the picked example. */
  onPick?: (card: ExampleCard) => void;
  /** Optional kicker rendered above the strip. */
  kicker?: string;
  /** Optional title — small, positioned next to the kicker. */
  title?: string;
  /** Optional skeleton placeholders count when loading. */
  loading?: boolean;
}

export default function TemplatesStrip({
  examples,
  aspectRatio = "16 / 9",
  cardHeight = 130,
  onPick,
  kicker,
  title,
  loading = false,
}: TemplatesStripProps) {
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(kicker || title) && <StripHeader kicker={kicker} title={title} />}
        <div className="studio-strip">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                aspectRatio,
                height: cardHeight,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>
      </div>
    );
  }

  if (!examples.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(kicker || title) && <StripHeader kicker={kicker} title={title} />}
      <div className="studio-strip">
        {examples.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => onPick?.(ex)}
            title={ex.label || "Utiliser ce style"}
            style={{
              padding: 0,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              overflow: "hidden",
              cursor: onPick ? "pointer" : "default",
              transition:
                "transform 200ms cubic-bezier(0.4, 0, 0.2, 1), border-color 180ms",
              position: "relative",
              aspectRatio,
              height: cardHeight,
              flexShrink: 0,
              display: "block",
            }}
            onMouseEnter={(e) => {
              if (!onPick) return;
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.borderColor = "var(--text-primary)";
              const overlay = e.currentTarget.querySelector(
                "[data-overlay]"
              ) as HTMLElement | null;
              if (overlay) overlay.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "var(--border-color)";
              const overlay = e.currentTarget.querySelector(
                "[data-overlay]"
              ) as HTMLElement | null;
              if (overlay) overlay.style.opacity = "0";
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ex.url}
              alt={ex.label || "Template"}
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            {onPick && (
              <div
                data-overlay
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.65) 100%)",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  padding: 10,
                  opacity: 0,
                  transition: "opacity 180ms",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    background: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(6px)",
                    padding: "4px 10px",
                    borderRadius: 999,
                  }}
                >
                  Utiliser
                </span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function StripHeader({
  kicker,
  title,
}: {
  kicker?: string;
  title?: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      {kicker && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          {kicker}
        </span>
      )}
      {title && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </span>
      )}
    </div>
  );
}
