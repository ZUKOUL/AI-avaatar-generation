"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Play,
  Zap,
  ImageSquare,
  VideoCamera,
  UserCircle,
  Globe,
  SparkleIcon,
  Star,
  MagicWand,
  Shield,
  Download,
} from "@/components/Icons";
import Logo from "@/components/Logo";

/* ─── Plan data (mirrors credits page) ─── */
const PLANS = [
  {
    name: "Free",
    price: 0,
    period: "",
    credits: "3 credits",
    cta: "Get started free",
    features: [
      "3 free credits to start",
      "Access to basic AI models",
      "1 avatar",
      "Watermarked exports",
      "Standard quality",
    ],
  },
  {
    name: "Creator",
    price: 35,
    period: "/mo",
    credits: "200 credits / month",
    cta: "Get Creator",
    highlighted: true,
    features: [
      "200 credits / month",
      "All AI models",
      "HD exports, no watermark",
      "Video generation up to 30s",
      "Priority support",
    ],
  },
  {
    name: "Studio",
    price: 85,
    period: "/mo",
    credits: "450 credits / month",
    cta: "Get Studio",
    features: [
      "450 credits / month",
      "Everything in Creator",
      "4K export quality",
      "Priority processing",
      "API access",
    ],
  },
];

const STEPS = [
  {
    num: "01",
    title: "Create your avatar",
    desc: "Upload a few photos and let our AI generate a realistic digital version of yourself or any character.",
    icon: UserCircle,
  },
  {
    num: "02",
    title: "Write your prompt",
    desc: "Describe the image or video you want. Choose a style, aspect ratio, and let AI do the rest.",
    icon: MagicWand,
  },
  {
    num: "03",
    title: "Generate & export",
    desc: "Get your content in seconds. Download in HD or 4K, no watermark on paid plans.",
    icon: Download,
  },
];

const FEATURES = [
  {
    icon: UserCircle,
    title: "AI Avatars",
    desc: "Create hyper-realistic AI avatars from just a few reference photos. Use them across all your content.",
    tag: "Avatars",
  },
  {
    icon: ImageSquare,
    title: "Image Generation",
    desc: "Generate stunning images in any style. Product shots, portraits, lifestyle — powered by Gemini.",
    tag: "Images",
  },
  {
    icon: VideoCamera,
    title: "Video Generation",
    desc: "Create professional AI videos with Kling and Veo. Add motion, audio, and cinematic effects.",
    tag: "Videos",
  },
];

const CAPABILITIES = [
  { icon: Globe, title: "Multi-language", desc: "Generate content in any language" },
  { icon: Zap, title: "Fast generation", desc: "Results in seconds, not hours" },
  { icon: Shield, title: "Secure & private", desc: "Your data stays yours" },
  { icon: SparkleIcon, title: "Multiple AI models", desc: "Gemini, Kling, Veo & more" },
  { icon: Star, title: "HD & 4K export", desc: "Studio-quality output" },
  { icon: Download, title: "Instant download", desc: "No watermark on paid plans" },
];

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    } else {
      setLoading(false);
    }
  }, [router]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: "#09090b" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#09090b", color: "#fafafa" }}>

      {/* ══════════════════════ NAVBAR ══════════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "rgba(9, 9, 11, 0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-5 md:px-8 h-[64px] flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <Logo size={30} variant="light" />
            <span className="text-[16px] font-semibold" style={{ color: "#fafafa" }}>
              Horpen
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {[
              ["Features", "#features"],
              ["How it works", "#how-it-works"],
              ["Pricing", "#pricing"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="text-[14px] no-underline transition-colors"
                style={{ color: "#a1a1aa" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#fafafa")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1aa")}
              >
                {label}
              </a>
            ))}
          </div>

          {/* CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="text-[14px] font-medium px-4 py-2 rounded-lg no-underline"
              style={{ color: "#a1a1aa" }}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-[14px] font-medium px-4 py-2.5 rounded-lg no-underline flex items-center gap-1.5"
              style={{ background: "#fafafa", color: "#09090b" }}
            >
              Get started
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <span className="block w-5 h-[1.5px] rounded" style={{ background: "#fafafa" }} />
            <span className="block w-5 h-[1.5px] rounded" style={{ background: "#fafafa" }} />
            <span className="block w-3.5 h-[1.5px] rounded" style={{ background: "#fafafa" }} />
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div
            className="md:hidden px-5 pb-6 flex flex-col gap-4"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            {[
              ["Features", "#features"],
              ["How it works", "#how-it-works"],
              ["Pricing", "#pricing"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="text-[15px] no-underline"
                style={{ color: "#a1a1aa" }}
                onClick={() => setMobileMenu(false)}
              >
                {label}
              </a>
            ))}
            <div className="flex gap-3 pt-2">
              <Link href="/login" className="text-[14px] font-medium px-4 py-2.5 rounded-lg no-underline" style={{ color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.1)" }}>
                Sign in
              </Link>
              <Link href="/signup" className="text-[14px] font-medium px-4 py-2.5 rounded-lg no-underline flex items-center gap-1.5" style={{ background: "#fafafa", color: "#09090b" }}>
                Get started <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ══════════════════════ HERO ══════════════════════ */}
      <section className="pt-[140px] md:pt-[160px] pb-16 md:pb-24 px-5 md:px-8">
        <div className="max-w-[1200px] mx-auto text-center">
          {/* Pill badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 text-[13px] font-medium"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#a1a1aa",
            }}
          >
            <SparkleIcon size={14} style={{ color: "#a1a1aa" }} />
            AI-powered content creation
          </div>

          {/* Headline */}
          <h1
            className="text-[40px] sm:text-[56px] md:text-[72px] font-semibold leading-[1.05] mb-6"
            style={{ letterSpacing: "-0.04em" }}
          >
            Create winning
            <br />
            content{" "}
            <span style={{ color: "#52525b" }}>with AI</span>
          </h1>

          {/* Sub-headline */}
          <p
            className="text-[17px] md:text-[19px] max-w-[520px] mx-auto mb-10 leading-relaxed"
            style={{ color: "#71717a" }}
          >
            Use our AI Avatars, image and video generation
            to create professional ads and content in seconds.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-20">
            <Link
              href="/signup"
              className="text-[15px] font-semibold px-8 py-3.5 rounded-xl no-underline flex items-center gap-2 w-full sm:w-auto justify-center"
              style={{ background: "#fafafa", color: "#09090b" }}
            >
              Start creating free
              <ArrowRight size={16} />
            </Link>
            <a
              href="#how-it-works"
              className="text-[15px] font-medium px-8 py-3.5 rounded-xl no-underline flex items-center gap-2 w-full sm:w-auto justify-center"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fafafa",
              }}
            >
              <Play size={15} />
              See how it works
            </a>
          </div>

          {/* Hero product mockup */}
          <div
            className="relative max-w-[960px] mx-auto rounded-2xl overflow-hidden"
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.03), 0 24px 48px -12px rgba(0,0,0,0.6), 0 48px 80px rgba(0,0,0,0.4)",
            }}
          >
            {/* Mock window chrome */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ background: "#18181b", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex gap-1.5">
                <div className="w-[10px] h-[10px] rounded-full" style={{ background: "#ef4444" }} />
                <div className="w-[10px] h-[10px] rounded-full" style={{ background: "#eab308" }} />
                <div className="w-[10px] h-[10px] rounded-full" style={{ background: "#22c55e" }} />
              </div>
              <div
                className="flex-1 text-center text-[12px]"
                style={{ color: "#52525b" }}
              >
                horpen.ai
              </div>
            </div>

            {/* Mock app content */}
            <div className="flex" style={{ background: "#111113", minHeight: "420px" }}>
              {/* Sidebar mock */}
              <div
                className="hidden md:flex flex-col gap-3 p-4 w-[180px] shrink-0"
                style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Logo size={24} variant="light" />
                  <span className="text-[12px] font-medium" style={{ color: "#a1a1aa" }}>Horpen</span>
                </div>
                {["Home", "Avatars", "Images", "Videos", "Settings"].map((item, i) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
                    style={{
                      background: i === 2 ? "rgba(255,255,255,0.06)" : "transparent",
                      color: i === 2 ? "#fafafa" : "#52525b",
                    }}
                  >
                    <div className="w-3.5 h-3.5 rounded" style={{ background: i === 2 ? "#fafafa" : "#3f3f46", opacity: 0.5 }} />
                    {item}
                  </div>
                ))}
              </div>

              {/* Main content mock */}
              <div className="flex-1 p-5 md:p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="h-4 w-32 rounded" style={{ background: "#27272a" }} />
                  <div className="h-7 w-20 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
                </div>
                {/* Image grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {[
                    "linear-gradient(135deg, #1c1917, #292524)",
                    "linear-gradient(135deg, #1e1b4b, #312e81)",
                    "linear-gradient(135deg, #1a2e05, #365314)",
                    "linear-gradient(135deg, #2a1a1a, #44403c)",
                    "linear-gradient(135deg, #172554, #1e3a5f)",
                    "linear-gradient(135deg, #27272a, #3f3f46)",
                    "linear-gradient(135deg, #1c1917, #44403c)",
                    "linear-gradient(135deg, #1e1b4b, #3b0764)",
                  ].map((bg, i) => (
                    <div
                      key={i}
                      className="rounded-xl"
                      style={{
                        background: bg,
                        aspectRatio: "1",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ POWERED BY ══════════════════════ */}
      <section className="py-12 md:py-16 px-5 md:px-8" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="max-w-[800px] mx-auto text-center">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] mb-8" style={{ color: "#52525b" }}>
            Built with the best AI models
          </p>
          <div className="flex items-center justify-center gap-8 md:gap-14 flex-wrap">
            {["Google Gemini", "Kling AI", "Google Veo", "Replicate"].map((name) => (
              <span
                key={name}
                className="text-[15px] md:text-[16px] font-medium"
                style={{ color: "#3f3f46" }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ HOW IT WORKS ══════════════════════ */}
      <section id="how-it-works" className="py-20 md:py-28 px-5 md:px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <p className="text-[13px] font-medium uppercase tracking-[0.08em] mb-4" style={{ color: "#52525b" }}>
              How it works
            </p>
            <h2 className="text-[32px] md:text-[44px] font-semibold leading-tight" style={{ letterSpacing: "-0.03em" }}>
              Create content in 3 steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.num}
                  className="rounded-2xl p-7 md:p-8 flex flex-col"
                  style={{
                    background: "#111113",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                    >
                      <Icon size={20} style={{ color: "#a1a1aa" }} />
                    </div>
                    <span className="text-[13px] font-medium" style={{ color: "#3f3f46" }}>
                      Step {step.num}
                    </span>
                  </div>
                  <h3
                    className="text-[20px] font-semibold mb-3"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {step.title}
                  </h3>
                  <p className="text-[14px] leading-relaxed" style={{ color: "#71717a" }}>
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════ FEATURES ══════════════════════ */}
      <section id="features" className="py-20 md:py-28 px-5 md:px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <p className="text-[13px] font-medium uppercase tracking-[0.08em] mb-4" style={{ color: "#52525b" }}>
              Features
            </p>
            <h2 className="text-[32px] md:text-[44px] font-semibold leading-tight mb-5" style={{ letterSpacing: "-0.03em" }}>
              Everything you need to create
            </h2>
            <p className="text-[17px] max-w-[480px] mx-auto" style={{ color: "#71717a" }}>
              From avatars to videos, generate professional AI content without any technical skills.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="group rounded-2xl overflow-hidden flex flex-col"
                  style={{
                    background: "#111113",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Visual area */}
                  <div
                    className="relative h-[220px] flex items-center justify-center"
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)",
                    }}
                  >
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      <Icon size={28} style={{ color: "#a1a1aa" }} />
                    </div>
                    <div
                      className="absolute top-4 right-4 px-2.5 py-1 rounded-md text-[11px] font-medium"
                      style={{ background: "rgba(255,255,255,0.06)", color: "#71717a" }}
                    >
                      {feat.tag}
                    </div>
                  </div>

                  {/* Text */}
                  <div className="p-6 pt-0 flex-1 flex flex-col">
                    <h3
                      className="text-[18px] font-semibold mb-2.5"
                      style={{ letterSpacing: "-0.02em" }}
                    >
                      {feat.title}
                    </h3>
                    <p className="text-[14px] leading-relaxed" style={{ color: "#71717a" }}>
                      {feat.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════ CAPABILITIES ══════════════════════ */}
      <section className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#0c0c0e" }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-[32px] md:text-[44px] font-semibold leading-tight mb-5" style={{ letterSpacing: "-0.03em" }}>
              Built for professionals
            </h2>
            <p className="text-[17px] max-w-[480px] mx-auto" style={{ color: "#71717a" }}>
              Every feature designed to save you time and deliver studio-quality results.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.title}
                  className="flex items-start gap-4 rounded-xl p-5"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                  >
                    <Icon size={18} style={{ color: "#71717a" }} />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-semibold mb-1">{cap.title}</h4>
                    <p className="text-[13px]" style={{ color: "#52525b" }}>
                      {cap.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════ STATS ══════════════════════ */}
      <section className="py-20 md:py-24 px-5 md:px-8">
        <div className="max-w-[900px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { value: "10K+", label: "Images generated" },
              { value: "2K+", label: "Videos created" },
              { value: "500+", label: "Creators" },
            ].map((stat) => (
              <div key={stat.label}>
                <div
                  className="text-[48px] md:text-[56px] font-semibold mb-2"
                  style={{ letterSpacing: "-0.04em" }}
                >
                  {stat.value}
                </div>
                <p className="text-[14px]" style={{ color: "#52525b" }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ PRICING ══════════════════════ */}
      <section id="pricing" className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#0c0c0e" }}>
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-14">
            <p className="text-[13px] font-medium uppercase tracking-[0.08em] mb-4" style={{ color: "#52525b" }}>
              Pricing
            </p>
            <h2 className="text-[32px] md:text-[44px] font-semibold leading-tight mb-5" style={{ letterSpacing: "-0.03em" }}>
              Simple, transparent pricing
            </h2>
            <p className="text-[17px] max-w-[440px] mx-auto" style={{ color: "#71717a" }}>
              Start free, upgrade when you need more. No hidden fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-7 flex flex-col"
                style={{
                  background: plan.highlighted ? "#18181b" : "#111113",
                  border: plan.highlighted
                    ? "1px solid rgba(255,255,255,0.15)"
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* Plan name */}
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-[18px] font-semibold">{plan.name}</h3>
                  {plan.highlighted && (
                    <span
                      className="text-[11px] font-semibold uppercase tracking-[0.06em] px-2.5 py-1 rounded-md"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#a1a1aa" }}
                    >
                      Popular
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-1 mb-6">
                  <span
                    className="text-[40px] font-semibold"
                    style={{ letterSpacing: "-0.04em" }}
                  >
                    ${plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-[14px]" style={{ color: "#52525b" }}>
                      USD{plan.period}
                    </span>
                  )}
                </div>

                {/* CTA */}
                <Link
                  href="/signup"
                  className="w-full py-3 rounded-xl font-semibold text-[14px] text-center no-underline block mb-7 transition-opacity hover:opacity-90"
                  style={{
                    background: plan.highlighted ? "#fafafa" : "rgba(255,255,255,0.06)",
                    color: plan.highlighted ? "#09090b" : "#fafafa",
                    border: plan.highlighted ? "none" : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {plan.cta}
                </Link>

                {/* Features */}
                <div className="space-y-3 flex-1">
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <Check size={16} className="shrink-0 mt-0.5" style={{ color: "#52525b" }} />
                      <span className="text-[13px]" style={{ color: "#a1a1aa" }}>
                        {feat}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ FINAL CTA ══════════════════════ */}
      <section className="py-24 md:py-32 px-5 md:px-8">
        <div className="max-w-[700px] mx-auto text-center">
          <h2
            className="text-[36px] md:text-[52px] font-semibold leading-tight mb-6"
            style={{ letterSpacing: "-0.04em" }}
          >
            Ready to create?
          </h2>
          <p className="text-[17px] mb-10" style={{ color: "#71717a" }}>
            Join creators and agencies who use Horpen to produce
            professional AI content at scale.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="text-[15px] font-semibold px-8 py-3.5 rounded-xl no-underline flex items-center gap-2 w-full sm:w-auto justify-center"
              style={{ background: "#fafafa", color: "#09090b" }}
            >
              Get started free
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="text-[15px] font-medium px-8 py-3.5 rounded-xl no-underline w-full sm:w-auto text-center"
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#a1a1aa",
              }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════ FOOTER ══════════════════════ */}
      <footer
        className="py-12 md:py-16 px-5 md:px-8"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-12">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <Logo size={28} variant="light" />
                <span className="text-[15px] font-semibold">Horpen</span>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: "#52525b" }}>
                AI-powered avatar, image and video generation for creators and agencies.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-[13px] font-semibold mb-4" style={{ color: "#71717a" }}>
                Product
              </h4>
              <div className="flex flex-col gap-2.5">
                {["Features", "Pricing", "How it works"].map((link) => (
                  <a
                    key={link}
                    href={`#${link.toLowerCase().replace(/ /g, "-")}`}
                    className="text-[13px] no-underline"
                    style={{ color: "#52525b" }}
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>

            {/* Account */}
            <div>
              <h4 className="text-[13px] font-semibold mb-4" style={{ color: "#71717a" }}>
                Account
              </h4>
              <div className="flex flex-col gap-2.5">
                <Link href="/signup" className="text-[13px] no-underline" style={{ color: "#52525b" }}>
                  Sign up
                </Link>
                <Link href="/login" className="text-[13px] no-underline" style={{ color: "#52525b" }}>
                  Sign in
                </Link>
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-[13px] font-semibold mb-4" style={{ color: "#71717a" }}>
                Legal
              </h4>
              <div className="flex flex-col gap-2.5">
                {["Privacy policy", "Terms of service"].map((link) => (
                  <span key={link} className="text-[13px]" style={{ color: "#52525b" }}>
                    {link}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
          >
            <p className="text-[12px]" style={{ color: "#3f3f46" }}>
              &copy; {new Date().getFullYear()} Horpen.ai — All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              {["Twitter", "LinkedIn"].map((social) => (
                <span key={social} className="text-[12px]" style={{ color: "#3f3f46" }}>
                  {social}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
