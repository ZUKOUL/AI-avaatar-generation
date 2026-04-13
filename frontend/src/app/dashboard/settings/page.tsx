"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { userAPI, paymentsAPI, creditsAPI } from "@/lib/api";
import {
  Settings,
  Shield,
  CreditCard,
  Check,
  Spinner,
  Eye,
  EyeSlash,
  Globe,
  Zap,
} from "@/components/Icons";

/* ─── Types ─── */
type SettingsTab = "general" | "security" | "subscription";

interface Tier {
  slug: string;
  credits: number;
  price_usd: number;
}

const TABS: { key: SettingsTab; label: string; icon: React.FC<{ size?: number }> }[] = [
  { key: "general", label: "General", icon: Settings },
  { key: "security", label: "Security", icon: Shield },
  { key: "subscription", label: "Subscription", icon: CreditCard },
];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Fran\u00e7ais" },
  { code: "es", label: "Espa\u00f1ol" },
];

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    (tabParam === "security" || tabParam === "subscription") ? tabParam : "general"
  );

  // Profile state
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("en");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Subscription state
  const [balance, setBalance] = useState<number | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    loadSubscription();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await userAPI.getProfile();
      setUsername(res.data.username || "");
      setEmail(res.data.email || "");
    } catch {
      /* silently fail */
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadSubscription = async () => {
    try {
      const [balRes, tierRes] = await Promise.all([
        creditsAPI.balance(),
        paymentsAPI.tiers(),
      ]);
      setBalance(balRes.data.balance ?? balRes.data.credit_balance ?? 0);
      setTiers(tierRes.data.tiers || []);
    } catch {
      /* silently fail */
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await userAPI.updateProfile({ username: username.trim() });
      setProfileMsg({ type: "success", text: "Profile updated successfully" });
      setTimeout(() => setProfileMsg(null), 3000);
    } catch {
      setProfileMsg({ type: "error", text: "Failed to update profile" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "Passwords do not match" });
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({ type: "error", text: "Password must be at least 8 characters" });
      return;
    }
    setChangingPw(true);
    try {
      await userAPI.changePassword(currentPassword, newPassword);
      setPwMsg({ type: "success", text: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwMsg(null), 3000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: { message?: string } | string } } })?.response?.data?.detail;
      const errorText = typeof msg === "string" ? msg : typeof msg === "object" && msg?.message ? msg.message : "Failed to change password";
      setPwMsg({ type: "error", text: errorText });
    } finally {
      setChangingPw(false);
    }
  };

  const handleCheckout = async (tier: string) => {
    setCheckoutLoading(tier);
    try {
      const res = await paymentsAPI.checkout(tier);
      if (res.data.url) window.location.href = res.data.url;
    } catch {
      alert("Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleSaveLanguage = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("horpen_language", language);
      setProfileMsg({ type: "success", text: "Language preference saved" });
      setTimeout(() => setProfileMsg(null), 3000);
    }
  };

  // Load saved language on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("horpen_language");
      if (saved) setLanguage(saved);
    }
  }, []);

  return (
    <>
      <Header title="Settings" subtitle="Manage your account" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[820px] mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="flex flex-col md:flex-row gap-6">

            {/* ─── Sidebar tabs ─── */}
            <div className="md:w-[200px] shrink-0">
              <div
                className="flex md:flex-col gap-1 rounded-xl p-1"
                style={{
                  background: "var(--bg-secondary)",
                  boxShadow: "var(--shadow-segment-inset)",
                }}
              >
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all flex-1 md:flex-initial"
                      style={{
                        background: active ? "var(--bg-primary)" : "transparent",
                        color: active ? "var(--text-primary)" : "var(--text-muted)",
                        boxShadow: active ? "var(--shadow-segment-active)" : "none",
                      }}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── Content ─── */}
            <div className="flex-1 min-w-0">

              {/* ─── General Tab ─── */}
              {activeTab === "general" && (
                <div className="animate-fadeIn">
                  <h2 className="text-[18px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>General</h2>
                  <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>Manage your account information</p>

                  {loadingProfile ? (
                    <div className="flex items-center justify-center py-12"><Spinner size={20} /></div>
                  ) : (
                    <div className="space-y-5">
                      {/* Username */}
                      <div>
                        <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>Username</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter a username"
                            className="flex-1 px-3 py-2.5 rounded-lg text-[13px]"
                            style={{
                              background: "var(--bg-secondary)",
                              border: "1px solid var(--border-color)",
                              color: "var(--text-primary)",
                            }}
                          />
                          <button
                            onClick={handleSaveProfile}
                            disabled={savingProfile}
                            className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all disabled:opacity-50"
                            style={{ background: "#3b82f6", color: "#fff" }}
                          >
                            {savingProfile ? <Spinner size={14} /> : "Save"}
                          </button>
                        </div>
                      </div>

                      {/* Email (read-only) */}
                      <div>
                        <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>Email</label>
                        <input
                          type="email"
                          value={email}
                          readOnly
                          className="w-full px-3 py-2.5 rounded-lg text-[13px] cursor-not-allowed opacity-60"
                          style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Contact support to change your email</p>
                      </div>

                      {/* Language */}
                      <div>
                        <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>Language</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Globe size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                            <select
                              value={language}
                              onChange={(e) => setLanguage(e.target.value)}
                              className="w-full pl-8 pr-3 py-2.5 rounded-lg text-[13px] appearance-none cursor-pointer"
                              style={{
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border-color)",
                                color: "var(--text-primary)",
                              }}
                            >
                              {LANGUAGES.map((lang) => (
                                <option key={lang.code} value={lang.code}>{lang.label}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={handleSaveLanguage}
                            className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all"
                            style={{ background: "#3b82f6", color: "#fff" }}
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      {profileMsg && (
                        <div
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium"
                          style={{
                            background: profileMsg.type === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                            color: profileMsg.type === "success" ? "var(--success)" : "var(--error)",
                          }}
                        >
                          {profileMsg.type === "success" && <Check size={14} />}
                          {profileMsg.text}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─── Security Tab ─── */}
              {activeTab === "security" && (
                <div className="animate-fadeIn">
                  <h2 className="text-[18px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Security</h2>
                  <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>Change your password</p>

                  <div
                    className="rounded-xl p-5"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
                  >
                    <div className="space-y-4 max-w-[400px]">
                      {/* Current password */}
                      <div>
                        <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>Current password</label>
                        <div className="relative">
                          <input
                            type={showCurrentPw ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Enter current password"
                            className="w-full px-3 py-2.5 pr-10 rounded-lg text-[13px]"
                            style={{
                              background: "var(--bg-primary)",
                              border: "1px solid var(--border-color)",
                              color: "var(--text-primary)",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPw(!showCurrentPw)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {showCurrentPw ? <EyeSlash size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* New password */}
                      <div>
                        <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>New password</label>
                        <div className="relative">
                          <input
                            type={showNewPw ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password"
                            className="w-full px-3 py-2.5 pr-10 rounded-lg text-[13px]"
                            style={{
                              background: "var(--bg-primary)",
                              border: "1px solid var(--border-color)",
                              color: "var(--text-primary)",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPw(!showNewPw)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {showNewPw ? <EyeSlash size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* Confirm new password */}
                      <div>
                        <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>Confirm new password</label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                          style={{
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </div>

                      {pwMsg && (
                        <div
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium"
                          style={{
                            background: pwMsg.type === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                            color: pwMsg.type === "success" ? "var(--success)" : "var(--error)",
                          }}
                        >
                          {pwMsg.type === "success" && <Check size={14} />}
                          {pwMsg.text}
                        </div>
                      )}

                      <button
                        onClick={handleChangePassword}
                        disabled={changingPw || !currentPassword || !newPassword || !confirmPassword}
                        className="w-full py-2.5 rounded-lg font-medium text-[13px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: "#3b82f6", color: "#fff" }}
                      >
                        {changingPw ? <><Spinner size={14} /> Changing...</> : "Change password"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Subscription Tab ─── */}
              {activeTab === "subscription" && (
                <div className="animate-fadeIn">
                  <h2 className="text-[18px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Subscription</h2>
                  <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>Manage your plan and credits</p>

                  {/* Current balance */}
                  <div
                    className="rounded-xl p-5 mb-6"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <p className="text-[12px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Current Balance</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                        {balance !== null ? balance : "..."}
                      </span>
                      <span className="text-[14px]" style={{ color: "var(--text-secondary)" }}>credits</span>
                    </div>
                  </div>

                  {/* Credit tiers */}
                  <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                    Buy Credits
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {tiers.map((tier, i) => (
                      <div
                        key={tier.slug}
                        className="rounded-xl p-4 transition-all hover:-translate-y-0.5"
                        style={{
                          background: "var(--bg-secondary)",
                          border: i === 1 ? "2px solid #3b82f6" : "1px solid var(--border-color)",
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Zap size={16} style={{ color: i === 1 ? "#3b82f6" : "var(--text-primary)" }} />
                          <span className="font-semibold capitalize text-[14px]" style={{ color: "var(--text-primary)" }}>
                            {tier.slug}
                          </span>
                          {i === 1 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                              Popular
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1 mb-0.5">
                          <span className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>${tier.price_usd}</span>
                        </div>
                        <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>{tier.credits} credits</p>
                        <button
                          onClick={() => handleCheckout(tier.slug)}
                          disabled={checkoutLoading === tier.slug}
                          className="w-full py-2 rounded-lg font-medium text-[12px] flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                          style={{
                            background: i === 1 ? "#3b82f6" : "var(--bg-tertiary)",
                            color: i === 1 ? "#fff" : "var(--text-primary)",
                            border: i === 1 ? "none" : "1px solid var(--border-color)",
                          }}
                        >
                          {checkoutLoading === tier.slug ? <Spinner size={14} /> : "Purchase"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
