"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authAPI } from "@/lib/api";
import { storeAuth } from "@/lib/auth";
import { Spinner, Eye, EyeSlash } from "@/components/Icons";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await authAPI.login(email, password);
      storeAuth(res.data.access_token, res.data.user);
      router.push("/dashboard");
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { detail?: string | { message?: string } } } };
      const detail = apiErr.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else if (detail && typeof detail === "object" && "message" in detail) setError(detail.message || "Login failed");
      else setError("Invalid email or password.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Logo size={32} variant="light" />
          <span className="text-xl font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Horpen
          </span>
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
          <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Welcome back</h2>
          <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>Sign in to your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[12px] font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
                className="w-full px-3 py-2.5 rounded-lg text-[14px]"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters" required minLength={8}
                  className="w-full px-3 py-2.5 rounded-lg text-[14px] pr-10"
                  style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}
                >
                  {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && <div className="px-3 py-2 rounded-lg text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{ background: "#3b82f6", color: "#fff" }}
            >
              {loading ? <Spinner size={16} /> : "Sign in"}
            </button>
          </form>

          <div className="mt-4 text-center space-y-2">
            <Link href="/forgot-password" className="text-[13px] hover:underline" style={{ color: "var(--text-muted)" }}>Forgot password?</Link>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-medium hover:underline" style={{ color: "var(--text-primary)" }}>Sign up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
