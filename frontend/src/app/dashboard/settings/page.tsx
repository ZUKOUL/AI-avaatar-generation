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

type BillingCycle = "monthly" | "yearly";

interface PlanFeature { text: string; }
interface PlanDef {
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: PlanFeature[];
  highlighted?: boolean;
  current?: boolean;
  cta: string;
  tier: string;
}

const PLAN_DEFS: PlanDef[] = [
  {
    name: "Free", description: "Try Horpen with a few free generations.",
    monthlyPrice: 0, yearlyPrice: 0, tier: "free", cta: "Current Plan", current: true,
    features: [
      { text: "3 free credits to start" }, { text: "Access to basic AI models" },
      { text: "1 avatar" }, { text: "Watermarked exports" }, { text: "Standard quality" },
    ],
  },
  {
    name: "Creator", description: "For creators and freelancers who need quality AI content.",
    monthlyPrice: 35, yearlyPrice: 336, tier: "creator", cta: "Get Creator",
    features: [
      { text: "200 credits / month" }, { text: "All AI models" },
      { text: "HD exports, no watermark" }, { text: "Up to 20 avatars" }, { text: "Priority support" },
    ],
  },
  {
    name: "Studio", description: "For agencies and teams who need volume and speed.",
    monthlyPrice: 85, yearlyPrice: 816, tier: "studio", cta: "Get Studio", highlighted: true,
    features: [
      { text: "450 credits / month" }, { text: "Everything in Creator" },
      { text: "4K export quality" }, { text: "Priority processing" }, { text: "API access" },
    ],
  },
];

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
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Admin state
  const [userRole, setUserRole] = useState("");
  const [creditAmount, setCreditAmount] = useState(120);
  const [addingCredits, setAddingCredits] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await userAPI.getProfile();
      setUsername(res.data.username || "");
      setEmail(res.data.email || "");
      setUserRole(res.data.role || "user");
    } catch {
      /* silently fail */
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSubCheckout = async (tier: string) => {
    if (tier === "free") return;
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
                className="relative flex md:flex-col gap-1 rounded-xl p-1"
                style={{
                  background: "var(--segment-bg)",
                  boxShadow: "var(--shadow-segment-inset)",
                }}
              >
                {/* Sliding indicator — horizontal on mobile, vertical on desktop */}
                {(() => {
                  const tabIndex = TABS.findIndex(t => t.key === activeTab);
                  return (
                    <>
                      {/* Mobile: horizontal slider */}
                      <div className="absolute top-1 bottom-1 rounded-lg md:hidden" style={{ width: `calc(${100/TABS.length}% - 4px)`, left: `calc(${tabIndex * (100/TABS.length)}% + ${tabIndex === 0 ? 4 : 2}px)`, background: "var(--segment-active-bg)", boxShadow: "var(--shadow-segment-active)", transition: "left 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                      {/* Desktop: vertical slider */}
                      <div className="absolute left-1 right-1 rounded-lg hidden md:block" style={{ height: `calc(${100/TABS.length}% - 4px)`, top: `calc(${tabIndex * (100/TABS.length)}% + ${tabIndex === 0 ? 4 : 2}px)`, background: "var(--segment-active-bg)", boxShadow: "var(--shadow-segment-active)", transition: "top 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                    </>
                  );
                })()}
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className="relative z-[1] flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium flex-1 md:flex-initial"
                      style={{
                        color: active ? "var(--text-primary)" : "var(--text-muted)",
                        transition: "color 0.25s ease",
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

                      {/* Admin: Add Credits */}
                      {userRole === "administrator" && (
                        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-color)" }}>
                          <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>
                            Admin — Add Credits
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={creditAmount}
                              onChange={(e) => setCreditAmount(Number(e.target.value))}
                              min={1}
                              max={10000}
                              className="w-24 px-3 py-2.5 rounded-lg text-[13px]"
                              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                            />
                            <button
                              onClick={async () => {
                                setAddingCredits(true);
                                try {
                                  const res = await userAPI.adminAddCredits(creditAmount);
                                  setProfileMsg({ type: "success", text: `Added ${creditAmount} credits. New balance: ${res.data.new_balance}` });
                                  setTimeout(() => setProfileMsg(null), 4000);
                                } catch {
                                  setProfileMsg({ type: "error", text: "Failed to add credits" });
                                }
                                setAddingCredits(false);
                              }}
                              disabled={addingCredits}
                              className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all disabled:opacity-50"
                              style={{ background: "#22c55e", color: "#fff" }}
                            >
                              {addingCredits ? <Spinner size={14} /> : `+ ${creditAmount} credits`}
                            </button>
                          </div>
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
                  <h2 className="text-[18px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Choose your plan</h2>
                  <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>Manage your subscription</p>

                  {/* Billing toggle */}
                  <div className="flex mb-6">
                    <div
                      className="relative inline-flex items-center rounded-xl p-1"
                      style={{ background: "var(--segment-bg)", boxShadow: "var(--shadow-segment-inset)" }}
                    >
                      <div className="absolute top-1 bottom-1 rounded-lg" style={{ width: "calc(50% - 4px)", left: billing === "monthly" ? 4 : "calc(50% + 0px)", background: "var(--segment-active-bg)", boxShadow: "var(--shadow-segment-active)", transition: "left 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                      {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => {
                        const active = billing === cycle;
                        return (
                          <button
                            key={cycle}
                            onClick={() => setBilling(cycle)}
                            className="relative z-[1] px-4 py-1.5 rounded-lg text-[13px] font-medium"
                            style={{
                              color: active ? "var(--text-primary)" : "var(--text-muted)",
                              transition: "color 0.25s ease",
                            }}
                          >
                            {cycle === "monthly" ? "Pay monthly" : "Pay yearly"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Plan cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {PLAN_DEFS.map((plan) => {
                      const perMonth = billing === "yearly" && plan.monthlyPrice > 0
                        ? Math.round(plan.yearlyPrice / 12)
                        : plan.monthlyPrice;
                      return (
                        <div
                          key={plan.name}
                          className="relative rounded-2xl overflow-hidden flex flex-col"
                          style={{
                            background: "var(--bg-secondary)",
                            border: plan.highlighted ? "2px solid var(--text-primary)" : "1px solid var(--border-color)",
                          }}
                        >
                          {plan.highlighted && (
                            <div className="absolute top-0 right-0 w-20 h-20 overflow-hidden" style={{ pointerEvents: "none" }}>
                              <div className="absolute -top-1 -right-1 w-24 h-24 rounded-bl-[100%]" style={{ background: "linear-gradient(135deg, rgba(120,120,120,0.3), rgba(80,80,80,0.15))" }} />
                            </div>
                          )}
                          <div className="p-5 flex flex-col flex-1">
                            <h3 className="text-[16px] font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>{plan.name}</h3>
                            <p className="text-[12px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)", minHeight: "32px" }}>{plan.description}</p>
                            <div className="flex items-baseline gap-1 mb-1">
                              <span className="text-[28px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>${perMonth}</span>
                              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>USD / month</span>
                            </div>
                            {billing === "yearly" && plan.monthlyPrice > 0 && (
                              <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>${plan.yearlyPrice} billed yearly</p>
                            )}
                            {(billing === "monthly" || plan.monthlyPrice === 0) && <div className="mb-3" />}
                            <button
                              onClick={() => handleSubCheckout(plan.tier)}
                              disabled={plan.current || checkoutLoading === plan.tier}
                              className="w-full py-2.5 rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed mb-4"
                              style={{
                                background: plan.current ? "var(--bg-tertiary)" : plan.highlighted ? "var(--bg-tertiary)" : "var(--text-primary)",
                                color: plan.current ? "var(--text-muted)" : plan.highlighted ? "var(--text-primary)" : "var(--bg-primary)",
                                border: plan.highlighted ? "1px solid var(--border-color)" : "none",
                                opacity: plan.current ? 0.6 : 1,
                              }}
                            >
                              {checkoutLoading === plan.tier ? <Spinner size={14} /> : plan.current ? "Current Plan" : plan.cta}
                            </button>
                            <div className="space-y-2.5">
                              {plan.features.map((f, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <div className="mt-0.5 shrink-0"><Check size={14} style={{ color: "var(--text-primary)" }} /></div>
                                  <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>{f.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
