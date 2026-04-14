"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** useLayoutEffect on client, useEffect on server (SSR-safe). */
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
 * Measures the active item's bounding box so the indicator stays perfectly
 * aligned regardless of label length or container sizing (flex-1 items in a
 * shrink-to-fit parent don't get equal widths — measurement sidesteps that).
 *
 * Defined at module level so React preserves the DOM node across parent
 * renders and the CSS transition actually plays.
 */
export default function SegmentToggle({
  items,
  selected,
  onSelect,
  size = "md",
  capitalize = false,
  className = "",
}: SegmentToggleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    visible: boolean;
  }>({ left: 0, width: 0, visible: false });
  // Transitions stay off until after the initial measured position has
  // painted — otherwise the pill animates from left:0 on mount (every client
  // nav to this page would look like it "slides in from the left").
  const [animate, setAnimate] = useState(false);
  // Optimistic selection used for positioning the pill. When a user clicks a
  // href-based item we flip this immediately so the pill slides, then fire
  // router.push after the animation completes — makes cross-page nav look
  // like a normal in-page tab switch.
  const [displaySelected, setDisplaySelected] = useState(selected);
  const router = useRouter();
  const pendingNavRef = useRef<number | null>(null);

  // Sync with prop changes (e.g. route change landing on a new page resets
  // selected via a fresh mount, but this also covers parent-driven updates).
  useEffect(() => {
    setDisplaySelected(selected);
  }, [selected]);

  useEffect(() => {
    return () => {
      if (pendingNavRef.current !== null) {
        window.clearTimeout(pendingNavRef.current);
      }
    };
  }, []);

  const rawIdx = items.findIndex((i) => i.key === displaySelected);
  const activeIdx = rawIdx < 0 ? 0 : rawIdx;
  const isSm = size === "sm";

  useIsoLayoutEffect(() => {
    const update = () => {
      const container = containerRef.current;
      const el = itemRefs.current[activeIdx];
      if (!container || !el) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      setIndicator({
        left: eRect.left - cRect.left,
        width: eRect.width,
        visible: rawIdx >= 0,
      });
    };
    update();
    // Re-measure after fonts/layout settle.
    const t1 = setTimeout(update, 30);
    const t2 = setTimeout(update, 120);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, rawIdx, items.length, size]);

  // Enable transitions only after the initial paint with the measured
  // position. Double rAF guarantees the first frame with the correct left/
  // width has already been committed and painted before `transition` turns on.
  useEffect(() => {
    if (animate) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [animate]);

  const containerCls = isSm
    ? "relative flex items-center rounded-lg p-0.5"
    : "relative flex items-center rounded-xl p-1";

  const indicatorCls = isSm
    ? "absolute rounded-md pointer-events-none"
    : "absolute rounded-lg pointer-events-none";

  const baseBtn = isSm
    ? "relative z-[1] flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[12px] font-medium text-center whitespace-nowrap"
    : "relative z-[1] flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-center whitespace-nowrap";

  const btnCls = capitalize ? `${baseBtn} capitalize` : baseBtn;

  const indicatorInset = isSm ? 2 : 4;

  return (
    <div
      ref={containerRef}
      className={`${containerCls} ${className}`.trim()}
      style={{
        background: "var(--segment-bg)",
        boxShadow: "var(--shadow-segment-inset)",
      }}
    >
      <div
        className={indicatorCls}
        style={{
          left: indicator.left,
          width: indicator.width,
          top: indicatorInset,
          bottom: indicatorInset,
          background: "var(--segment-active-bg)",
          boxShadow: "var(--shadow-segment-active)",
          transition: animate
            ? "left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease"
            : "none",
          opacity: indicator.visible ? 1 : 0,
        }}
      />
      {items.map((item, i) => {
        const active = item.key === displaySelected;
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
          const href = item.href;
          return (
            <Link
              key={item.key}
              ref={(el) => {
                itemRefs.current[i] = (el as unknown as HTMLElement) ?? null;
              }}
              href={href}
              className={btnCls}
              style={style}
              onClick={(e) => {
                // Let modifier-clicks (new tab / window) fall through to the
                // browser's default behavior.
                if (
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey ||
                  (e.button !== undefined && e.button !== 0)
                ) {
                  onSelect?.(item.key);
                  return;
                }
                if (item.key === displaySelected) {
                  onSelect?.(item.key);
                  return;
                }
                e.preventDefault();
                setDisplaySelected(item.key);
                onSelect?.(item.key);
                if (pendingNavRef.current !== null) {
                  window.clearTimeout(pendingNavRef.current);
                }
                pendingNavRef.current = window.setTimeout(() => {
                  pendingNavRef.current = null;
                  router.push(href);
                }, 300);
              }}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
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
