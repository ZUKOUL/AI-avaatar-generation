"use client";

import { useState } from "react";
import Link from "next/link";
import { authAPI } from "@/lib/api";
import { Spinner, ArrowLeft, Mail } from "@/components/Icons";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await authAPI.forgotPassword(email); } catch { /* always show success */ }
    finally { setLoading(false); setSent(true); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#fff" }}>
            <span className="text-black text-[13px] font-bold">H</span>
          </div>
          <span className="text-xl font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Horpen.ai</span>
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(34,197,94,0.1)" }}>
                <Mail size={22} style={{ color: "var(--success)" }} />
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Check your email</h2>
              <p className="text-[13px] mb-4" style={{ color: "var(--text-muted)" }}>
                If an account exists for {email}, we&apos;ve sent a password reset link.
              </p>
              <Link href="/login" className="text-[13px] font-medium hover:underline" style={{ color: "var(--text-primary)" }}>Back to login</Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Reset password</h2>
              <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>Enter your email to receive a reset link</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
                  className="w-full px-3 py-2.5 rounded-lg text-[14px]"
                  style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                />
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-lg font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: "#3b82f6", color: "#fff" }}
                >
                  {loading ? <Spinner size={16} /> : "Send reset link"}
                </button>
              </form>
              <div className="mt-4 text-center">
                <Link href="/login" className="text-[13px] inline-flex items-center gap-1.5 hover:underline" style={{ color: "var(--text-muted)" }}>
                  <ArrowLeft size={14} /> Back to login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
