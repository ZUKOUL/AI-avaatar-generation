"use client";

import Image from "next/image";
import { useTheme } from "@/lib/theme";

/**
 * Horpen square brand mark — a rounded color-filled box with the Horpen logo
 * inside. Source PNG is white-on-transparent, so we invert it on light
 * backgrounds to preserve contrast against the container fill.
 */
type Variant = "themed" | "light" | "dark";

interface LogoProps {
  /** Outer square size in px. Default 28. */
  size?: number;
  /**
   * - "themed" (default): container follows the current theme (white in dark
   *   mode, near-black in light mode); logo inverts to stay visible.
   * - "light": always-white container with a black logo (for dark surfaces).
   * - "dark":  always-black container with a white logo (for light surfaces).
   */
  variant?: Variant;
  className?: string;
}

export default function Logo({
  size = 28,
  variant = "themed",
  className = "",
}: LogoProps) {
  const { theme } = useTheme();

  let bg: string;
  let invert: boolean;
  if (variant === "light") {
    bg = "#ffffff";
    invert = true; // source is white, invert → black logo on white
  } else if (variant === "dark") {
    bg = "#1a1a1a";
    invert = false; // source is white → white logo on black
  } else {
    // themed
    bg = theme === "dark" ? "#ffffff" : "#1a1a1a";
    invert = theme === "dark"; // dark mode → white bg → invert → black logo
  }

  const inner = Math.round(size * 0.72);

  return (
    <div
      className={`rounded-lg flex items-center justify-center shrink-0 ${className}`.trim()}
      style={{ width: size, height: size, background: bg }}
    >
      <Image
        src="/horpen-logo.png"
        alt="Horpen"
        width={inner}
        height={inner}
        style={{
          width: inner,
          height: inner,
          filter: invert ? "invert(1)" : "none",
          objectFit: "contain",
        }}
        priority
      />
    </div>
  );
}
