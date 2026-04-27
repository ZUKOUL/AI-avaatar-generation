"use client";

/**
 * HeroExamples — empty-state hero for the Studio pages.
 *
 * Instead of explaining what the tool does with paragraphs, we show
 * 3-4 actual outputs from the curated library. Each is clickable —
 * tap one and it pins as the style anchor + drops a starter prompt
 * into the composer below.
 *
 * Why this beats "explanatory copy":
 *   • Creators are visual — they trust the tool when they SEE its
 *     output, not when they read about it.
 *   • Examples become both inspiration AND template entry points
 *     (the "Wayfinder" pattern from Shape of AI).
 *   • Zero text on the cards themselves — the images speak.
 *
 * The component is shape-agnostic: pass an array of {url, slug, label}
 * and it lays them out. The parent decides what "click" means (e.g.
 * pin template + suggest prompt).
 */

import { useEffect, useState } from "react";

export interface ExampleCard {
  /** Public URL of the reference image. */
  url: string;
  /** Stable id (template slug or pack slug). */
  id: string;
  /** Optional short label that appears on hover only. */
  label?: string;
  /** Optional starter prompt the parent can inject when this card is clicked. */
  starterPrompt?: string;
}

interface HeroExamplesProps {
  examples: ExampleCard[];
  /** When set, drives the visual treatment — typical aspect of the produced art. */
  aspectRatio?: string; // e.g. "4 / 3", "9 / 16"
  /** Click handler — receives the picked card. */
  onPick?: (card: ExampleCard) => void;
  /** Optional kicker rendered above the row (small uppercase label). */
  kicker?: string;
  /** Optional title shown above the row. Larger, more present. */
  title?: string;
  /** Whether the parent is currently loading examples. Renders a skeleton. */
  loading?: boolean;
}

export default function HeroExamples({
  examples,
  aspectRatio = "4 / 3",
  onPick,
  kicker,
  title,
  loading = false,
}: HeroExamplesProps) {
  // We display up to 4 examples. If the parent passes more, we shuffle
  // and slice — keeps the row visually sized while showing variety on
  // each mount (so refreshing surprises the user with new picks).
  const [displayed, setDisplayed] = useState<ExampleCard[]>([]);

  useEffect(() => {
    if (!examples.length) return;
    const shuffled = [...examples].sort(() => Math.random() - 0.5);
    setDisplayed(shuffled.slice(0, 4));
  }, [examples]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(kicker || title) && (
          <div>
            {kicker && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                {kicker}
              </div>
            )}
            {title && (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {title}
              </div>
            )}
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                aspectRatio,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRadius: 14,
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>
      </div>
    );
  }

  if (!displayed.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {(kicker || title) && (
        <div>
          {kicker && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                marginBottom: 4,
              }}
            >
              {kicker}
            </div>
          )}
          {title && (
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {title}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        {displayed.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => onPick?.(ex)}
            title={ex.label || "Utiliser ce style"}
            style={{
              padding: 0,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: 14,
              overflow: "hidden",
              cursor: onPick ? "pointer" : "default",
              transition: "transform 180ms cubic-bezier(0.4, 0, 0.2, 1), border-color 180ms",
              position: "relative",
              aspectRatio,
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
              alt={ex.label || "Style example"}
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            {/* Hover overlay surfaces the affordance only on intent —
                keeps the gallery clean at rest. */}
            {onPick && (
              <div
                data-overlay
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.6) 100%)",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  padding: 12,
                  opacity: 0,
                  transition: "opacity 200ms",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(8px)",
                    padding: "6px 12px",
                    borderRadius: 999,
                  }}
                >
                  Utiliser ce style →
                </span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
