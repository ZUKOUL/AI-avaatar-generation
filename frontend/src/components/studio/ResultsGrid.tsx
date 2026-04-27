"use client";

/**
 * ResultsGrid — replaces the single-image carousel with a side-by-side
 * masonry of generations. Users can compare variants at a glance
 * (Midjourney + Ideogram convergent pattern) instead of clicking
 * arrows back and forth.
 *
 * Each card has a hover-revealed action bar with 3 actions:
 *   • Lock — pin this style for future generations (emoji + state)
 *   • Download — direct file download
 *   • Open — opens a lightbox for full-size detail
 *
 * Why this beats a carousel:
 *   • A/B cognition: humans pick "the best" by comparing, not by
 *     remembering which one came before.
 *   • Selection without commitment — hovering reveals options, no
 *     click-to-navigate-then-decide friction.
 *   • Scales with variant count: 1, 3, 5 all look natural in the grid.
 */

import { useEffect, useState } from "react";
import { Download, Lock, Maximize, XIcon, Spinner } from "@/components/Icons";

export interface GeneratedItem {
  /** Image URL (Supabase storage). */
  url: string;
  /** Optional id for stable keys. */
  id?: string;
  /** Optional caption (e.g. the strategist's headline). */
  caption?: string;
}

interface ResultsGridProps {
  items: GeneratedItem[];
  /** Aspect ratio CSS string ("4 / 3", "16 / 9", "9 / 16"). */
  aspectRatio?: string;
  /** Currently locked URL (or null). Drives the "🔒 Locked" pill state. */
  lockedUrl?: string | null;
  /** Toggle lock for an item. */
  onToggleLock?: (item: GeneratedItem) => void;
  /** When set, renders N skeleton placeholders below the items while loading. */
  pendingCount?: number;
  /** Optional empty-state node when items + pending are both 0. */
  empty?: React.ReactNode;
}

export default function ResultsGrid({
  items,
  aspectRatio = "4 / 3",
  lockedUrl,
  onToggleLock,
  pendingCount = 0,
  empty,
}: ResultsGridProps) {
  const [lightbox, setLightbox] = useState<GeneratedItem | null>(null);

  // Esc-to-close lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  if (!items.length && !pendingCount) {
    return empty ? <>{empty}</> : null;
  }

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            items.length + pendingCount === 1
              ? "minmax(0, 560px)"
              : "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          justifyContent: "center",
        }}
      >
        {items.map((item, idx) => {
          const isLocked = lockedUrl === item.url;
          return (
            <div
              key={item.id || `${item.url}-${idx}`}
              style={{
                position: "relative",
                aspectRatio,
                borderRadius: 16,
                overflow: "hidden",
                background: "var(--bg-secondary)",
                border: isLocked
                  ? "1.5px solid var(--text-primary)"
                  : "1px solid var(--border-color)",
                boxShadow: isLocked
                  ? "0 0 0 4px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.18)"
                  : "0 1px 2px rgba(0,0,0,0.06)",
                transition: "border-color 160ms, box-shadow 160ms",
              }}
              onMouseEnter={(e) => {
                const bar = e.currentTarget.querySelector(
                  "[data-actions]"
                ) as HTMLElement | null;
                if (bar) bar.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                const bar = e.currentTarget.querySelector(
                  "[data-actions]"
                ) as HTMLElement | null;
                if (bar) bar.style.opacity = isLocked ? "1" : "0";
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.caption || `Variant ${idx + 1}`}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />

              {/* Locked badge — always visible when active. */}
              {isLocked && (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    background: "var(--text-primary)",
                    color: "var(--bg-primary)",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Lock size={11} />
                  Style ancré
                </div>
              )}

              {/* Action bar — hover-revealed. */}
              <div
                data-actions
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: 10,
                  right: 10,
                  display: "flex",
                  gap: 6,
                  justifyContent: "flex-end",
                  opacity: isLocked ? 1 : 0,
                  transition: "opacity 180ms",
                }}
              >
                <ActionBtn
                  icon={<Lock size={14} />}
                  label={isLocked ? "Libérer" : "Verrouiller"}
                  onClick={() => onToggleLock?.(item)}
                  active={isLocked}
                />
                <ActionBtn
                  icon={<Maximize size={14} />}
                  label="Agrandir"
                  onClick={() => setLightbox(item)}
                />
                <ActionBtn
                  icon={<Download size={14} />}
                  label="Télécharger"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = item.url;
                    a.download = `bento-${item.id || idx}.png`;
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }}
                />
              </div>
            </div>
          );
        })}

        {/* Skeleton placeholders for in-flight generations. */}
        {Array.from({ length: pendingCount }).map((_, i) => (
          <div
            key={`pending-${i}`}
            style={{
              aspectRatio,
              borderRadius: 16,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <Spinner size={20} color="var(--text-secondary)" />
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "-60%",
                width: "60%",
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
                animation: "shimmer 1.6s linear infinite",
              }}
            />
          </div>
        ))}
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(0%); }
            100% { transform: translateX(266%); }
          }
        `}</style>
      </div>

      {/* Lightbox — full-size view. Click backdrop or Esc to close. */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Fermer"
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              padding: 8,
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <XIcon size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt="Full view"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "min(90vw, 1100px)",
              maxHeight: "90vh",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              cursor: "default",
            }}
          />
        </div>
      )}
    </>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        background: active ? "var(--text-primary)" : "rgba(0,0,0,0.6)",
        color: active ? "var(--bg-primary)" : "#fff",
        border:
          "1px solid " + (active ? "var(--text-primary)" : "rgba(255,255,255,0.18)"),
        backdropFilter: "blur(10px)",
        cursor: "pointer",
        width: 32,
        height: 32,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms, transform 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.8)";
        e.currentTarget.style.transform = "scale(1.05)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.6)";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {icon}
    </button>
  );
}
