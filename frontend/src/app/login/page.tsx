"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { authAPI } from "@/lib/api";
import { storeAuth } from "@/lib/auth";
import { Spinner, Eye, EyeSlash } from "@/components/Icons";

/**
 * Login screen — clean centered card.
 *
 * Previously shipped with a two-column split + a dark purple gradient
 * artwork panel; the user found the panel visually heavy and asked
 * for it removed, so the layout is now a single white rounded card
 * centered on a light-grey backdrop. Keep `/signup` in lock-step —
 * the two pages are intentionally near-identical so auth feels like
 * one surface.
 *
 * Accessibility:
 * - wrapped in a <main> landmark with a <nav> for account actions
 * - inputs use htmlFor/id label associations and 16px font on mobile
 *   to stop iOS Safari from auto-zooming on focus
 * - error region is role="alert" aria-live="polite" so screen readers
 *   announce validation failures as they arrive
 * - password toggle exposes aria-pressed + a ≥ 44×44 tap target
 * - logo image uses alt="" because the brand text sits next to it
 *   (avoids double announce)
 * - hard-coded light palette so pre-auth surface looks identical
 *   regardless of the app's dark theme tokens
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
    <main
      className="min-h-screen w-full flex items-center justify-center p-3 md:p-8"
      style={{ background: "#eeeeee" }}
    >
      {/* Outer card: the soft-shadowed rounded rectangle that holds the
          form. Narrower than before (no more 2-column layout) and
          vertically sized to its content. */}
      <div
        className="w-full max-w-[520px] rounded-[22px] md:rounded-[28px] overflow-hidden"
        style={{
          background: "#ffffff",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.04), 0 12px 40px rgba(15,15,40,0.08)",
        }}
      >
        {/* ─── Form column ─── */}
        <div className="flex flex-col px-6 md:px-12 py-10 md:py-14 relative">
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

          {/* Headline stack — two-tone typography, sized for a narrower
              single-column card (was 46px in the split layout, now 32px
              so the title doesn't wrap awkwardly). */}
          <div className="mt-7 md:mt-8">
            <h1
              className="text-[26px] md:text-[32px] leading-[1.15] font-semibold"
              style={{ letterSpacing: "-0.02em" }}
            >
              <span style={{ color: "#111" }}>Welcome back</span>
              <br />
              <span style={{ color: "#9a9a9a" }}>
                and step into your creative studio.
              </span>
            </h1>

            <p
              className="mt-3 md:mt-4 text-[13.5px] leading-[1.55]"
              style={{ color: "#5a5a5a" }}
            >
              Sign in to pick up where you left off — your avatars,
              thumbnails and generations are waiting.
            </p>
          </div>

          {/* Divider */}
          <div
            className="mt-6 md:mt-8 h-px w-full"
            style={{ background: "#e6e6e6" }}
          />

          {/* ─── Form ─── */}
          <form
            onSubmit={handleSubmit}
            className="mt-6 w-full space-y-3"
            aria-label="Sign in to your Horpen account"
            noValidate
          >
            <div>
              <label
                htmlFor="login-email"
                className="text-[12px] font-medium mb-1.5 block"
                style={{ color: "#5a5a5a" }}
              >
                Email
              </label>
              <input
                id="login-email"
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
                htmlFor="login-password"
                className="text-[12px] font-medium mb-1.5 block"
                style={{ color: "#5a5a5a" }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  autoComplete="current-password"
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
                className="btn-premium-dark w-full py-3.5 font-semibold text-[14px] flex items-center justify-center gap-2"
                style={{ borderRadius: 999, minHeight: 52 }}
              >
                {loading ? <Spinner size={16} /> : "Sign in"}
              </button>
            </div>
          </form>

          {/* ─── Footer links ───
              Marked as <nav> with an accessible label so screen-reader
              landmarks include this cluster. py-1 gives each link a
              taller hit area without changing the visual rhythm. */}
          <nav
            aria-label="Account actions"
            className="mt-8 md:mt-10 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]"
          >
            <Link
              href="/forgot-password"
              className="hover:underline py-1"
              style={{ color: "#6a6a6a" }}
            >
              Forgot password?
            </Link>
            <Link
              href="/signup"
              className="hover:underline py-1"
              style={{ color: "#6a6a6a" }}
            >
              Create an account
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
