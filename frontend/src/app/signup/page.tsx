"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { authAPI } from "@/lib/api";
import { storeAuth } from "@/lib/auth";
import { Spinner, Eye, EyeSlash } from "@/components/Icons";

/**
 * Signup screen — pixel-matched to `/login` so the auth flow feels like
 * a single surface. Only the copy + form handler diverge:
 *   - headline + subtitle reframe "welcome back" into an invitation
 *   - submit calls authAPI.signup (not login)
 *   - password uses autoComplete="new-password"
 *   - aria-label on <form> matches the action
 *   - footer link pivots to /login instead of /signup
 *
 * Every style / layout / artwork rule from /login is copied verbatim so
 * the two pages stay interchangeable. When you tune /login, update
 * this file in lock-step — the intentional duplication keeps the
 * design language 1:1 without introducing a shared wrapper that would
 * inevitably drift.
 */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await authAPI.signup(email, password);
      storeAuth(res.data.access_token, res.data.user);
      router.push("/dashboard");
    } catch (err: unknown) {
      const apiErr = err as {
        response?: { data?: { detail?: string | { message?: string } } };
      };
      const detail = apiErr.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else if (detail && typeof detail === "object" && "message" in detail)
        setError(detail.message || "Signup failed");
      else setError("Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen w-full flex items-center justify-center p-3 md:p-8"
      style={{ background: "#eeeeee" }}
    >
      {/* Outer card: the soft-shadowed rounded rectangle that frames
          both regions. max-width keeps it centered on ultra-wide
          monitors instead of stretching edge to edge. On desktop this
          is a 2-column split; on mobile it stacks banner-over-form. */}
      <div
        className="w-full max-w-[1240px] rounded-[22px] md:rounded-[28px] overflow-hidden grid grid-cols-1 md:grid-cols-2 md:min-h-[min(720px,92vh)]"
        style={{
          background: "#ffffff",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.04), 0 12px 40px rgba(15,15,40,0.08)",
        }}
      >
        {/* ─── Dark gradient panel ───
            Mobile: compact banner above the form (order-1).
            Desktop: right-hand column next to the form (order-2).
            Marked aria-hidden — this panel is purely decorative. */}
        <aside
          className="order-1 md:order-2 relative flex flex-col overflow-hidden h-[180px] md:h-auto"
          style={{
            background:
              "radial-gradient(120% 80% at 70% 30%, #6a2d8c 0%, #2a1540 35%, #140a22 70%, #0b0716 100%)",
          }}
          aria-hidden="true"
        >
          {/* ─── Desktop-only: full artwork + marketing text ─── */}
          <div className="hidden md:block absolute inset-0">
            {/* Soft ambient glows behind the mark */}
            <div
              className="absolute pointer-events-none"
              style={{
                top: "22%",
                left: "30%",
                width: 520,
                height: 520,
                background:
                  "radial-gradient(closest-side, rgba(244,114,182,0.25), rgba(244,114,182,0) 70%)",
                filter: "blur(8px)",
              }}
            />
            <div
              className="absolute pointer-events-none"
              style={{
                top: "45%",
                left: "55%",
                width: 360,
                height: 360,
                background:
                  "radial-gradient(closest-side, rgba(168,85,247,0.28), rgba(168,85,247,0) 70%)",
                filter: "blur(6px)",
              }}
            />

            {/* Abstract figure + spark, drawn with SVG.
                Sized relative to the column so it scales with the card. */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 600 720"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <radialGradient id="head-glow-su" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f472b6" stopOpacity="0.7" />
                  <stop offset="60%" stopColor="#f472b6" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="spark-glow-su" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f472b6" stopOpacity="0.6" />
                  <stop offset="70%" stopColor="#f472b6" stopOpacity="0.04" />
                  <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="stroke-grad-su" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fca5d1" />
                  <stop offset="100%" stopColor="#f472b6" />
                </linearGradient>
              </defs>

              {/* Head halo */}
              <circle cx="240" cy="300" r="180" fill="url(#head-glow-su)" />
              {/* Circle head stroke */}
              <circle
                cx="240"
                cy="300"
                r="92"
                fill="none"
                stroke="url(#stroke-grad-su)"
                strokeWidth="3"
                opacity="0.95"
              />
              {/* Shoulders/body — two soft curves meeting at the base */}
              <path
                d="M 90 560 C 120 430, 360 430, 390 560"
                fill="none"
                stroke="url(#stroke-grad-su)"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.9"
              />
              <path
                d="M 60 640 C 120 470, 360 470, 420 640"
                fill="none"
                stroke="url(#stroke-grad-su)"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.55"
              />

              {/* Spark (X) halo */}
              <circle cx="460" cy="330" r="110" fill="url(#spark-glow-su)" />
              {/* Spark lines */}
              <g
                stroke="url(#stroke-grad-su)"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.95"
              >
                <line x1="420" y1="290" x2="500" y2="370" />
                <line x1="500" y1="290" x2="420" y2="370" />
              </g>
            </svg>

            {/* Right-column body text — desktop only.
                Copy is the same marketing pitch as /login so the pair
                feels like a coherent product page. */}
            <div className="relative z-10 h-full flex flex-col justify-end p-10 md:p-12">
              <p
                className="text-[32px] md:text-[38px] leading-[1.1] font-semibold"
                style={{
                  color: "rgba(255,255,255,0.38)",
                  letterSpacing: "-0.02em",
                }}
              >
                Scale to meet demand.
              </p>
              <p
                className="mt-3 text-[14px] max-w-[360px]"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Generate viral thumbnails, lock in character identity and
                ship faster — all from a single studio.
              </p>
            </div>
          </div>

          {/* ─── Mobile-only: simplified artwork keyed to banner ratio ───
              Just the head + spark, vertically centred. Drops the
              shoulder curves because they'd clip unevenly across the
              phone-width range (320–767px) where this banner shows. */}
          <div className="md:hidden absolute inset-0">
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 400 180"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <radialGradient id="head-glow-m-su" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f472b6" stopOpacity="0.55" />
                  <stop offset="60%" stopColor="#f472b6" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="spark-glow-m-su" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f472b6" stopOpacity="0.5" />
                  <stop offset="70%" stopColor="#f472b6" stopOpacity="0.04" />
                  <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="stroke-grad-m-su" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fca5d1" />
                  <stop offset="100%" stopColor="#f472b6" />
                </linearGradient>
              </defs>

              {/* Ambient halos */}
              <circle cx="150" cy="90" r="130" fill="url(#head-glow-m-su)" />
              <circle cx="265" cy="90" r="95" fill="url(#spark-glow-m-su)" />

              {/* Head */}
              <circle
                cx="150"
                cy="90"
                r="44"
                fill="none"
                stroke="url(#stroke-grad-m-su)"
                strokeWidth="2.25"
                opacity="0.95"
              />
              {/* Spark (X) */}
              <g
                stroke="url(#stroke-grad-m-su)"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.95"
              >
                <line x1="240" y1="68" x2="290" y2="118" />
                <line x1="290" y1="68" x2="240" y2="118" />
              </g>
            </svg>
          </div>
        </aside>

        {/* ─── Form column ─── */}
        <div className="order-2 md:order-1 flex flex-col px-6 md:px-14 py-8 md:py-12 relative">
          {/* Logo. alt="" because the brand text sits next to it —
              giving it alt text would make screen readers announce
              "Horpen" twice. */}
          <div className="flex items-center gap-2">
            <div
              className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 36, height: 36, background: "#111" }}
            >
              <Image
                src="/horpen-logo.png"
                alt=""
                width={22}
                height={22}
                priority
                style={{ objectFit: "contain" }}
              />
            </div>
            <span
              className="text-[17px] font-semibold"
              style={{ color: "#111", letterSpacing: "-0.02em" }}
            >
              Horpen
            </span>
          </div>

          {/* Headline stack — same two-tone composition as /login.
              Copy inverts the "welcome back" framing into an invitation. */}
          <div className="mt-8 md:mt-20 max-w-[460px]">
            <h1
              className="text-[28px] md:text-[46px] leading-[1.15] md:leading-[1.08] font-semibold"
              style={{ letterSpacing: "-0.02em" }}
            >
              <span style={{ color: "#111" }}>Create your account</span>
              <br />
              <span style={{ color: "#9a9a9a" }}>
                and start shipping with Horpen.
              </span>
            </h1>

            <p
              className="mt-4 md:mt-6 text-[13.5px] md:text-[14px] leading-[1.55] max-w-[380px]"
              style={{ color: "#5a5a5a" }}
            >
              Generate avatars, thumbnails, ads and short-form videos from
              one studio. Free to start — no credit card required.
            </p>
          </div>

          {/* Divider */}
          <div
            className="mt-7 md:mt-12 h-px w-full max-w-[460px]"
            style={{ background: "#e6e6e6" }}
          />

          {/* ─── Form ─── */}
          <form
            onSubmit={handleSubmit}
            className="mt-6 w-full max-w-[460px] space-y-3"
            aria-label="Create your Horpen account"
            noValidate
          >
            <div>
              <label
                htmlFor="signup-email"
                className="text-[12px] font-medium mb-1.5 block"
                style={{ color: "#5a5a5a" }}
              >
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                inputMode="email"
                /* 16px on mobile prevents iOS Safari zooming on focus. */
                className="w-full px-5 py-3.5 text-[16px] md:text-[14px] outline-none transition-shadow"
                style={{
                  background: "#f2f2f2",
                  border: "1px solid transparent",
                  borderRadius: 999,
                  color: "#111",
                  minHeight: 48,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#d4d4d4";
                  e.currentTarget.style.background = "#ffffff";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 3px rgba(17,17,17,0.06)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.background = "#f2f2f2";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            <div>
              <label
                htmlFor="signup-password"
                className="text-[12px] font-medium mb-1.5 block"
                style={{ color: "#5a5a5a" }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  /* new-password hints password managers to OFFER a
                     fresh password instead of auto-filling an old one. */
                  autoComplete="new-password"
                  className="w-full px-5 py-3.5 text-[16px] md:text-[14px] outline-none pr-14 transition-shadow"
                  style={{
                    background: "#f2f2f2",
                    border: "1px solid transparent",
                    borderRadius: 999,
                    color: "#111",
                    minHeight: 48,
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#d4d4d4";
                    e.currentTarget.style.background = "#ffffff";
                    e.currentTarget.style.boxShadow =
                      "0 0 0 3px rgba(17,17,17,0.06)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "transparent";
                    e.currentTarget.style.background = "#f2f2f2";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                {/* Tap target is 44×44 (WCAG 2.5.5) — the icon is
                    smaller but the invisible padding gives finger-
                    friendly hit area. Wrapped in a rounded-full so a
                    keyboard focus ring reads cleanly against the pill
                    input. */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full transition-shadow"
                  style={{ color: "#7a7a7a" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 0 0 3px rgba(17,17,17,0.12)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="px-4 py-2.5 text-[13px]"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  color: "#c43030",
                  borderRadius: 14,
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                {error}
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 font-semibold text-[14px] flex items-center justify-center gap-2 transition-all"
                style={{
                  background: "#1a1024",
                  color: "#fff",
                  borderRadius: 999,
                  opacity: loading ? 0.55 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow:
                    "0 1px 1px rgba(255,255,255,0.1) inset, 0 8px 20px rgba(26,16,36,0.25)",
                  minHeight: 52,
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = "#27173a";
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.background = "#1a1024";
                }}
              >
                {loading ? <Spinner size={16} /> : "Create account"}
              </button>
            </div>
          </form>

          {/* ─── Footer links ───
              Marked as <nav> with an accessible label so screen-reader
              landmarks include this cluster. py-1 gives each link a
              taller hit area without changing the visual rhythm.
              /login swaps in for /signup since we're already on /signup. */}
          <nav
            aria-label="Account actions"
            className="mt-auto pt-8 md:pt-12 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]"
          >
            <Link
              href="/login"
              className="hover:underline py-1"
              style={{ color: "#6a6a6a" }}
            >
              Already have an account?
            </Link>
            <Link
              href="/forgot-password"
              className="hover:underline py-1"
              style={{ color: "#6a6a6a" }}
            >
              Forgot password?
            </Link>
            <Link
              href="/"
              className="hover:underline py-1"
              style={{ color: "#6a6a6a" }}
            >
              Support
            </Link>
            <Link
              href="/"
              className="hover:underline py-1"
              style={{ color: "#6a6a6a" }}
            >
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
