"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { authAPI } from "@/lib/api";
import { storeAuth } from "@/lib/auth";
import { Spinner, Eye, EyeSlash } from "@/components/Icons";

/**
 * Login screen — mirrors the "Join our community" reference design:
 * a centred rounded card floating on a soft grey page, split into a
 * white form column on the left and a dark gradient column on the
 * right with a glowing abstract mark. Intentionally standalone from
 * the app's dark theme tokens: this is a pre-auth surface, so we
 * hard-code the light palette so the page looks identical in any theme.
 */
export default function LoginPage() {
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
      const res = await authAPI.login(email, password);
      storeAuth(res.data.access_token, res.data.user);
      router.push("/dashboard");
    } catch (err: unknown) {
      const apiErr = err as {
        response?: { data?: { detail?: string | { message?: string } } };
      };
      const detail = apiErr.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else if (detail && typeof detail === "object" && "message" in detail)
        setError(detail.message || "Login failed");
      else setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 md:p-8"
      style={{ background: "#eeeeee" }}
    >
      {/* Outer card: the soft-shadowed rounded rectangle that frames
          both columns. max-width keeps it centered on ultra-wide
          monitors instead of stretching edge to edge. */}
      <div
        className="w-full max-w-[1240px] rounded-[28px] overflow-hidden grid grid-cols-1 md:grid-cols-2"
        style={{
          background: "#ffffff",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.04), 0 12px 40px rgba(15,15,40,0.08)",
          minHeight: "min(720px, 92vh)",
        }}
      >
        {/* ─── Left column: form ─── */}
        <div className="flex flex-col px-6 md:px-14 py-10 md:py-12 relative">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div
              className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 36, height: 36, background: "#111" }}
            >
              <Image
                src="/horpen-logo.png"
                alt="Horpen"
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

          {/* Headline stack — two-tone to match the reference's
              "Join our community / and get updates …" layout. */}
          <div className="mt-14 md:mt-20 max-w-[460px]">
            <h1
              className="text-[38px] md:text-[46px] leading-[1.08] font-semibold"
              style={{ letterSpacing: "-0.02em" }}
            >
              <span style={{ color: "#111" }}>Welcome back</span>
              <br />
              <span style={{ color: "#9a9a9a" }}>
                and step into your creative studio.
              </span>
            </h1>

            <p
              className="mt-6 text-[14px] leading-[1.55] max-w-[380px]"
              style={{ color: "#5a5a5a" }}
            >
              Sign in to pick up where you left off — your avatars,
              thumbnails and generations are waiting.
            </p>
          </div>

          {/* Divider */}
          <div
            className="mt-10 md:mt-12 h-px w-full max-w-[460px]"
            style={{ background: "#e6e6e6" }}
          />

          {/* ─── Form ─── */}
          <form
            onSubmit={handleSubmit}
            className="mt-7 w-full max-w-[460px] space-y-3"
          >
            <div>
              <label
                className="text-[12px] font-medium mb-1.5 block"
                style={{ color: "#5a5a5a" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full px-5 py-3.5 text-[14px] outline-none transition-shadow"
                style={{
                  background: "#f2f2f2",
                  border: "1px solid transparent",
                  borderRadius: 999,
                  color: "#111",
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
                className="text-[12px] font-medium mb-1.5 block"
                style={{ color: "#5a5a5a" }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  autoComplete="current-password"
                  className="w-full px-5 py-3.5 text-[14px] outline-none pr-12 transition-shadow"
                  style={{
                    background: "#f2f2f2",
                    border: "1px solid transparent",
                    borderRadius: 999,
                    color: "#111",
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
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: "#7a7a7a" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div
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
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = "#27173a";
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.background = "#1a1024";
                }}
              >
                {loading ? <Spinner size={16} /> : "Sign in"}
              </button>
            </div>
          </form>

          {/* ─── Footer links ─── */}
          <div className="mt-auto pt-10 md:pt-12 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            <Link
              href="/forgot-password"
              className="hover:underline"
              style={{ color: "#6a6a6a" }}
            >
              Forgot password?
            </Link>
            <Link
              href="/signup"
              className="hover:underline"
              style={{ color: "#6a6a6a" }}
            >
              Create an account
            </Link>
            <Link
              href="/"
              className="hover:underline"
              style={{ color: "#6a6a6a" }}
            >
              Support
            </Link>
            <Link
              href="/"
              className="hover:underline"
              style={{ color: "#6a6a6a" }}
            >
              Terms
            </Link>
          </div>
        </div>

        {/* ─── Right column: dark marketing panel ───
            CSS-only recreation of the reference's glowing abstract
            mark — a circle head + an X-shaped spark, both drawn as
            soft SVG strokes with radial-gradient halos behind them.
            We don't need raster art for this: the look is entirely
            producible with a handful of radial gradients. */}
        <div
          className="relative hidden md:flex flex-col overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 80% at 70% 30%, #6a2d8c 0%, #2a1540 35%, #140a22 70%, #0b0716 100%)",
          }}
        >
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
            aria-hidden
          >
            <defs>
              <radialGradient id="head-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f472b6" stopOpacity="0.7" />
                <stop offset="60%" stopColor="#f472b6" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="spark-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f472b6" stopOpacity="0.6" />
                <stop offset="70%" stopColor="#f472b6" stopOpacity="0.04" />
                <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="stroke-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fca5d1" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>

            {/* Head halo */}
            <circle cx="240" cy="300" r="180" fill="url(#head-glow)" />
            {/* Circle head stroke */}
            <circle
              cx="240"
              cy="300"
              r="92"
              fill="none"
              stroke="url(#stroke-grad)"
              strokeWidth="3"
              opacity="0.95"
            />
            {/* Shoulders/body — two soft curves meeting at the base */}
            <path
              d="M 90 560 C 120 430, 360 430, 390 560"
              fill="none"
              stroke="url(#stroke-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.9"
            />
            <path
              d="M 60 640 C 120 470, 360 470, 420 640"
              fill="none"
              stroke="url(#stroke-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.55"
            />

            {/* Spark (X) halo */}
            <circle cx="460" cy="330" r="110" fill="url(#spark-glow)" />
            {/* Spark lines */}
            <g
              stroke="url(#stroke-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.95"
            >
              <line x1="420" y1="290" x2="500" y2="370" />
              <line x1="500" y1="290" x2="420" y2="370" />
            </g>
          </svg>

          {/* Right-column body text */}
          <div className="relative z-10 mt-auto p-10 md:p-12">
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
      </div>
    </div>
  );
}
