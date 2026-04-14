"use client";

import Link from "next/link";
import { ReactNode } from "react";

export type SegmentItem = {
  key: string;
  label?: ReactNode;
  icon?: ReactNode;
  /** If set, renders the item as a Next.js Link pointing to this URL. */
  href?: string;
};

type SegmentToggleProps = {
  items: SegmentItem[];
  selected: string;
  onSelect?: (key: string) => void;
  /** "md" (default) — primary tabs. "sm" — compact toolbars/filters. */
  size?: "sm" | "md";
  /** Add `capitalize` class to button labels. */
  capitalize?: boolean;
  className?: string;
};

/**
 * Shared segmented control with an inset gray track and a sliding white pill.
 * Uses `transform: translateX(N * 100%)` so the indicator is always pixel-aligned
 * with the active button regardless of label length.
 *
 * Defined at module level (NOT nested inside another component) so React preserves
 * the DOM node across parent renders and the CSS transition can actually play.
 */
export default function SegmentToggle({
  items,
  selected,
  onSelect,
  size = "md",
  capitalize = false,
  className = "",
}: SegmentToggleProps) {
  const rawIdx = items.findIndex((i) => i.key === selected);
  const activeIdx = rawIdx < 0 ? 0 : rawIdx;
  const n = items.length;
  const isSm = size === "sm";

  const containerCls = isSm
    ? "relative flex items-center rounded-lg p-0.5"
    : "relative flex items-center rounded-xl p-1";

  const indicatorCls = isSm
    ? "absolute top-0.5 bottom-0.5 left-0.5 rounded-md pointer-events-none"
    : "absolute top-1 bottom-1 left-1 rounded-lg pointer-events-none";

  const indicatorWidth = isSm
    ? `calc((100% - 4px) / ${n})`
    : `calc((100% - 8px) / ${n})`;

  const baseBtn = isSm
    ? "relative z-[1] flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[12px] font-medium text-center"
    : "relative z-[1] flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[13px] font-medium text-center";

  const btnCls = capitalize ? `${baseBtn} capitalize` : baseBtn;

  return (
    <div
      className={`${containerCls} ${className}`.trim()}
      style={{
        background: "var(--segment-bg)",
        boxShadow: "var(--shadow-segment-inset)",
      }}
    >
      <div
        className={indicatorCls}
        style={{
          width: indicatorWidth,
          transform: `translateX(${activeIdx * 100}%)`,
          background: "var(--segment-active-bg)",
          boxShadow: "var(--shadow-segment-active)",
          transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease",
          opacity: rawIdx < 0 ? 0 : 1,
        }}
      />
      {items.map((item) => {
        const active = item.key === selected;
        const inner = (
          <>
            {item.icon}
            {item.label}
          </>
        );
        const style = {
          color: active ? "var(--text-primary)" : "var(--text-muted)",
          transition: "color 0.25s ease",
        };
        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              className={btnCls}
              style={style}
              onClick={() => onSelect?.(item.key)}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect?.(item.key)}
            className={btnCls}
            style={style}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
