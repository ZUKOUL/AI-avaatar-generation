"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { paymentsAPI } from "@/lib/api";
import { Check, Spinner } from "@/components/Icons";

type BillingCycle = "monthly" | "yearly";

interface PlanFeature {
  text: string;
}

interface Plan {
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: PlanFeature[];
  highlighted?: boolean;
  current?: boolean;
  cta: string;
  tier: string; // Stripe tier slug
}

const PLANS: Plan[] = [
  {
    name: "Free",
    description: "Try Horpen with a few free generations.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    tier: "free",
    cta: "Current Plan",
    current: true,
    features: [
      { text: "3 free credits to start" },
      { text: "Access to basic AI models" },
      { text: "1 avatar" },
      { text: "Watermarked exports" },
      { text: "Standard quality" },
    ],
  },
  {
    name: "Creator",
    description: "For creators and freelancers who need quality AI content.",
    monthlyPrice: 35,
    yearlyPrice: 336,
    tier: "creator",
    cta: "Get Creator",
    features: [
      { text: "200 credits / month" },
      { text: "All AI models" },
      { text: "HD exports, no watermark" },
      { text: "Up to 20 avatars" },
      { text: "Priority support" },
    ],
  },
  {
    name: "Studio",
    description: "For agencies and teams who need volume and speed.",
    monthlyPrice: 85,
    yearlyPrice: 816,
    tier: "studio",
    cta: "Get Studio",
    highlighted: true,
    features: [
      { text: "450 credits / month" },
      { text: "Everything in Creator" },
      { text: "4K export quality" },
      { text: "Priority processing" },
      { text: "API access" },
    ],
  },
];

export default function CreditsPage() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleCheckout = async (tier: string) => {
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

  return (
    <>
      <Header title="Subscription" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[960px] mx-auto px-4 md:px-6 py-10 md:py-16">

          {/* Title */}
          <h1
            className="text-[28px] md:text-[36px] font-semibold text-center mb-8"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
          >
            Choose your plan
          </h1>

          {/* Billing toggle */}
          <div className="flex justify-center mb-10">
            <div
              className="relative inline-flex items-center rounded-xl p-1"
              style={{
                background: "var(--segment-bg)",
                boxShadow: "var(--shadow-segment-inset)",
              }}
            >
              <div className="absolute top-1 bottom-1 rounded-lg" style={{ width: "calc(50% - 4px)", left: billing === "monthly" ? 4 : "calc(50% + 0px)", background: "var(--segment-active-bg)", boxShadow: "var(--shadow-segment-active)", transition: "left 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
              {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => {
                const active = billing === cycle;
                return (
                  <button
                    key={cycle}
                    onClick={() => setBilling(cycle)}
                    className="relative z-[1] px-5 py-2 rounded-lg text-[14px] font-medium"
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((plan) => {
              const price = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
              const perMonth = billing === "yearly" && plan.monthlyPrice > 0
                ? Math.round(plan.yearlyPrice / 12)
                : plan.monthlyPrice;

              return (
                <div
                  key={plan.name}
                  className="relative rounded-2xl overflow-hidden flex flex-col"
                  style={{
                    background: "var(--bg-secondary)",
                    border: plan.highlighted
                      ? "2px solid var(--text-primary)"
                      : "1px solid var(--border-color)",
                  }}
                >
                  {/* Highlighted plan decorative banner */}
                  {plan.highlighted && (
                    <div
                      className="absolute top-0 right-0 w-24 h-24 overflow-hidden"
                      style={{ pointerEvents: "none" }}
                    >
                      <div
                        className="absolute -top-1 -right-1 w-28 h-28 rounded-bl-[100%]"
                        style={{
                          background: "linear-gradient(135deg, rgba(120,120,120,0.3), rgba(80,80,80,0.15))",
                        }}
                      />
                    </div>
                  )}

                  <div className="p-6 flex flex-col flex-1">
                    {/* Plan name */}
                    <h3
                      className="text-[18px] font-semibold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {plan.name}
                    </h3>

                    {/* Description */}
                    <p
                      className="text-[13px] leading-relaxed mb-5"
                      style={{ color: "var(--text-secondary)", minHeight: "40px" }}
                    >
                      {plan.description}
                    </p>

                    {/* Price */}
                    <div className="flex items-baseline gap-1 mb-1">
                      <span
                        className="text-[36px] font-semibold"
                        style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
                      >
                        ${billing === "monthly" ? price : perMonth}
                      </span>
                      <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                        USD / month
                      </span>
                    </div>

                    {billing === "yearly" && plan.monthlyPrice > 0 && (
                      <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
                        ${price} billed yearly
                      </p>
                    )}
                    {(billing === "monthly" || plan.monthlyPrice === 0) && <div className="mb-4" />}

                    {/* CTA Button */}
                    <button
                      onClick={() => handleCheckout(plan.tier)}
                      disabled={plan.current || checkoutLoading === plan.tier}
                      className="w-full py-3 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed mb-6"
                      style={{
                        background: plan.current
                          ? "var(--bg-tertiary)"
                          : plan.highlighted
                            ? "var(--bg-tertiary)"
                            : "var(--text-primary)",
                        color: plan.current
                          ? "var(--text-muted)"
                          : plan.highlighted
                            ? "var(--text-primary)"
                            : "var(--bg-primary)",
                        border: plan.highlighted
                          ? "1px solid var(--border-color)"
                          : "none",
                        opacity: plan.current ? 0.6 : 1,
                      }}
                    >
                      {checkoutLoading === plan.tier ? (
                        <Spinner size={16} />
                      ) : plan.current ? (
                        "Current Plan"
                      ) : (
                        plan.cta
                      )}
                    </button>

                    {/* Features */}
                    <div className="space-y-3">
                      {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="mt-0.5 shrink-0">
                            <Check size={16} style={{ color: "var(--text-primary)" }} />
                          </div>
                          <span
                            className="text-[13px] leading-snug"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {feature.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
