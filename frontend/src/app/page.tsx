"use client";

/**
 * Horpen landing page — light-mode rewrite.
 *
 * Design language: inspired by modern B2B SaaS (Linear, Vercel,
 * Resend, Webflow) — soft off-white canvas, white rounded cards with
 * subtle shadow, dark solid CTAs, tight typographic hierarchy.
 *
 * Positioning:
 *   Horpen is an ALL-IN-ONE video studio for TikTok / Reels / Shorts
 *   creators. Competitors specialise (Opus Clip = clips only, Captions
 *   = talking-head only, HeyGen = corporate avatars) — Horpen folds
 *   the whole pipeline into one subscription.
 *
 * The 4 feature cards surface the 4 real differentiators vs the
 * competition (see block comment on `FEATURE_CARDS` below).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { showcaseAPI } from "@/lib/api";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Play,
  SparkleIcon,
  ChevronDown,
} from "@/components/Icons";

/* ─────────────────────────────────────────────────────────────────────
 *  Pricing (mirrors the app-internal tiers so landing + /dashboard
 *  /credits show the same prices — see app/core/pricing.py).
 * ─────────────────────────────────────────────────────────────────── */

const PLANS = [
  {
    slug: "free",
    name: "Free",
    price: 0,
    credits: "3 credits",
    sub: "Try the whole studio on us",
    features: [
      "3 free credits",
      "All AI tools (limited)",
      "Watermarked exports",
      "Community support",
    ],
    cta: "Get started free",
    highlighted: false,
  },
  {
    slug: "creator",
    name: "Creator",
    price: 35,
    credits: "200 credits / month",
    sub: "For solo creators shipping weekly",
    features: [
      "200 credits every month",
      "All motion models (Kling, Veo, Hailuo, Grok)",
      "HD exports, no watermark",
      "Niche presets + reference images",
      "Priority support",
    ],
    cta: "Start Creator",
    highlighted: true,
  },
  {
    slug: "studio",
    name: "Studio",
    price: 85,
    credits: "450 credits / month",
    sub: "For agencies and content studios",
    features: [
      "450 credits every month",
      "Everything in Creator",
      "4K export quality",
      "Priority generation queue",
      "API access",
    ],
    cta: "Get Studio",
    highlighted: false,
  },
] as const;

/* ─────────────────────────────────────────────────────────────────────
 *  FEATURE CARDS — the 4 real competitive advantages.
 *
 *  Chosen after comparing Horpen to Opus Clip, SendShort, Submagic,
 *  Captions.ai, HeyGen, Runway and Luma. Each card answers: "why
 *  Horpen over the single-purpose tool already on the market?"
 *
 *    1. Auto-Clip    ⇢ replaces Opus / SendShort / Submagic
 *    2. AI Video     ⇢ replaces Captions / HeyGen / Runway
 *    3. Niche-locked ⇢ UNIQUE — no competitor ships this today
 *    4. All-in-one   ⇢ positioning play: 1 sub instead of 5
 *
 *  The illustrations are pure HTML/CSS with small Icons pieces, no
 *  external images — keeps the bundle tight and the cards crisp on
 *  any screen.
 * ─────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────
 *  How it works
 * ─────────────────────────────────────────────────────────────────── */

const STEPS = [
  {
    num: "01",
    title: "Pick your lane",
    desc: "Train an avatar, describe a video, paste a URL or drop a product photo. Horpen handles the rest.",
  },
  {
    num: "02",
    title: "Review in one place",
    desc: "Tweak the script, swap voices with an inline audio preview, choose Kling / Veo / Hailuo / Grok, pick subtitles.",
  },
  {
    num: "03",
    title: "Download + post",
    desc: "9:16 ready for TikTok / Reels / Shorts. No watermark on paid tiers. Monetise right away.",
  },
];

/* ─────────────────────────────────────────────────────────────────────
 *  FAQ
 * ─────────────────────────────────────────────────────────────────── */

const FAQ = [
  {
    q: "Do I need to understand AI to use Horpen?",
    a: "No. Everything is a guided form: upload photos for avatars, type a sentence for a video, paste a URL for a clip, drop a product shot for ads. Horpen handles the prompts, models and rendering — you just pick what to make.",
  },
  {
    q: "Can I monetise the images and videos I export?",
    a: "Yes. Paid plans remove the watermark and give you full commercial rights on every asset. Many users run monetised TikTok / YouTube / Instagram channels and e-commerce stores on Horpen's output.",
  },
  {
    q: "Which AI models power Horpen?",
    a: "Images use Gemini 3 Pro Image (Nano Banana Pro). Videos use Kling 2.5 Turbo Pro, Veo 3.1 Fast, Hailuo 02 or Grok Imagine — you pick per video. Voice-over uses ElevenLabs. The stack is always best-in-class, never locked to one vendor.",
  },
  {
    q: "Can I keep a consistent style across every asset?",
    a: "Yes. Train an AI avatar from a few photos and it appears the same across every future video, thumbnail and ad. Drop reference images on any tool and Horpen matches that style on the next generation — character, palette, composition.",
  },
  {
    q: "What formats does Horpen export?",
    a: "Videos: 9:16 (TikTok / Reels / Shorts), 1:1 (square), 4:5 (feed) and 16:9 (landscape). Images: any size up to 4K. Ads: Meta / TikTok / Google Ads specs out of the box.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Anytime, no questions asked. Credits purchased in the current cycle stay valid until the end of the period.",
  },
];

/* ═══════════════════════════════════════════════════════════════════
 *  PAGE
 * ═════════════════════════════════════════════════════════════════ */

interface ShowcaseTile {
  url: string;
  aspect: string;
  created_at?: string;
}

interface ShowcaseVideoTile {
  thumbnail_url?: string | null;
  video_url?: string | null;
  aspect: string;
}

interface ShowcaseData {
  thumbnails: ShowcaseTile[];
  avatars: ShowcaseTile[];
  images: ShowcaseTile[];
  ads: ShowcaseTile[];
  videos: ShowcaseVideoTile[];
}

const EMPTY_SHOWCASE: ShowcaseData = {
  thumbnails: [],
  avatars: [],
  images: [],
  ads: [],
  videos: [],
};

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showcase, setShowcase] = useState<ShowcaseData>(EMPTY_SHOWCASE);

  /* Auto-redirect signed-in visitors straight to the dashboard so the
     landing doesn't flash for returning users. The setLoading-in-effect
     is intentional: isAuthenticated() reads from localStorage which is
     SSR-unsafe, so we MUST defer the auth check to the client. React's
     new "no setState in effect" rule is too strict for this hydration
     pattern. */
  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    }
  }, [router]);

  /* Load real generated content from /showcase/featured. Landing
     renders with gradient placeholders while this resolves, and
     silently keeps those placeholders when the endpoint is
     unreachable. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await showcaseAPI.featured();
        if (!cancelled && res.data) {
          setShowcase({
            thumbnails: res.data.thumbnails ?? [],
            avatars: res.data.avatars ?? [],
            images: res.data.images ?? [],
            ads: res.data.ads ?? [],
            videos: res.data.videos ?? [],
          });
        }
      } catch (e) {
        // Silent — the gradient placeholders stay in place.
        console.debug("Showcase fetch failed, using placeholders:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ background: "#fafafa" }}
      >
        <div className="spinner" />
      </div>
    );
  }

  return (
    <main
      className="min-h-screen relative overflow-x-hidden"
      style={{
        background: "#fafafa",
        color: "#0a0a0a",
        fontFeatureSettings: '"cv11", "ss01"',
      }}
    >
      {/* ─── Global background texture ───
          A faint dot grid pulled toward the top of the page — gives the
          light canvas tangible depth without being loud. `radial-
          gradient + repeating` is cheaper than any image / SVG. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(10,10,10,0.06) 1px, transparent 0)",
          backgroundSize: "24px 24px",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 60%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 60%)",
          zIndex: 0,
        }}
      />

      {/* Animated gradient orbs — soft radial auras that drift slowly
          behind the hero for that "alive" landing-page feel without
          being distracting. Pure CSS, no JS. */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div
          className="absolute"
          style={{
            top: "-10%",
            left: "10%",
            width: 520,
            height: 520,
            borderRadius: "50%",
            background:
              "radial-gradient(closest-side, rgba(244,114,182,0.22), rgba(244,114,182,0) 70%)",
            filter: "blur(40px)",
            animation: "horpen-orb-a 22s ease-in-out infinite",
          }}
        />
        <div
          className="absolute"
          style={{
            top: "-5%",
            right: "8%",
            width: 480,
            height: 480,
            borderRadius: "50%",
            background:
              "radial-gradient(closest-side, rgba(96,165,250,0.22), rgba(96,165,250,0) 70%)",
            filter: "blur(40px)",
            animation: "horpen-orb-b 28s ease-in-out infinite",
          }}
        />
        <div
          className="absolute"
          style={{
            top: "18%",
            left: "48%",
            width: 360,
            height: 360,
            borderRadius: "50%",
            background:
              "radial-gradient(closest-side, rgba(167,139,250,0.18), rgba(167,139,250,0) 70%)",
            filter: "blur(36px)",
            animation: "horpen-orb-c 32s ease-in-out infinite",
          }}
        />
      </div>

      {/* Global scoped animations + scroll-reveal primitive */}
      <style jsx global>{`
        @keyframes horpen-orb-a {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(60px, 40px); }
        }
        @keyframes horpen-orb-b {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-50px, 70px); }
        }
        @keyframes horpen-orb-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -60px) scale(1.1); }
        }
        @keyframes horpen-fade-up {
          0% { opacity: 0; transform: translate3d(0, 24px, 0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes horpen-hero-in {
          0% { opacity: 0; transform: translate3d(0, 30px, 0) scale(0.98); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes horpen-pulse-glow {
          0%, 100% { box-shadow: 0 1px 1px rgba(255,255,255,0.1) inset, 0 8px 24px rgba(10,10,10,0.22), 0 0 0 0 rgba(10,10,10,0); }
          50% { box-shadow: 0 1px 1px rgba(255,255,255,0.1) inset, 0 12px 36px rgba(10,10,10,0.28), 0 0 0 8px rgba(10,10,10,0.04); }
        }
        @keyframes horpen-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes horpen-float-slow {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-6px) rotate(0.5deg); }
        }

        /* Scroll-reveal — any element with this class becomes visible
           only once it enters the viewport. Uses modern animation-
           timeline: view() where supported and gracefully falls back
           to an on-mount entrance elsewhere. */
        .horpen-reveal {
          opacity: 0;
          transform: translate3d(0, 24px, 0);
          animation: horpen-fade-up 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          animation-delay: var(--horpen-reveal-delay, 0s);
        }
        @supports (animation-timeline: view()) {
          .horpen-reveal {
            opacity: 0;
            animation: horpen-fade-up linear both;
            animation-timeline: view();
            animation-range: entry 0% cover 30%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .horpen-reveal { opacity: 1; transform: none; animation: none; }
          .horpen-orb-a, .horpen-orb-b, .horpen-orb-c { animation: none !important; }
          .horpen-emboss, .horpen-emboss-muted, .horpen-emboss-dark-bg {
            text-shadow: none;
            filter: none;
          }
        }

        /* 3-D embossed headline effect — applied to every big title
           on the landing via the .horpen-emboss class. Two variants:
           .horpen-emboss (dark primary half of the title) and
           .horpen-emboss-muted (grey secondary half). Both stack
           layered text-shadows to get a raised look + an ambient
           drop shadow underneath so the type feels physically lifted
           off the off-white canvas.
           Gracefully disabled under prefers-reduced-motion at the
           bottom of this stylesheet. */
        .horpen-emboss {
          color: #0a0a0a;
          background: linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 65%, #000 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow:
            0 1px 0 rgba(255, 255, 255, 0.9),
            0 2px 0 rgba(209, 213, 219, 0.9),
            0 3px 0 rgba(180, 180, 180, 0.85),
            0 4px 0 rgba(160, 160, 160, 0.7),
            0 5px 0 rgba(130, 130, 130, 0.55),
            0 8px 16px rgba(15, 15, 40, 0.12),
            0 16px 28px rgba(15, 15, 40, 0.08),
            0 28px 48px rgba(15, 15, 40, 0.06);
          filter: drop-shadow(0 10px 20px rgba(15, 15, 40, 0.08));
        }
        .horpen-emboss-muted {
          color: #7a7a7a;
          background: linear-gradient(180deg, #a1a1a1 0%, #7a7a7a 60%, #5a5a5a 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow:
            0 1px 0 rgba(255, 255, 255, 0.95),
            0 2px 0 rgba(220, 220, 220, 0.8),
            0 3px 0 rgba(200, 200, 200, 0.6),
            0 4px 0 rgba(180, 180, 180, 0.45),
            0 6px 10px rgba(15, 15, 40, 0.08),
            0 12px 20px rgba(15, 15, 40, 0.05);
        }
        /* White variant for titles sitting on the DARK final-CTA panel. */
        .horpen-emboss-dark-bg {
          color: #ffffff;
          background: linear-gradient(180deg, #ffffff 0%, #e5e5e5 65%, #b0b0b0 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow:
            0 1px 0 rgba(255, 255, 255, 0.2),
            0 2px 0 rgba(0, 0, 0, 0.4),
            0 3px 0 rgba(0, 0, 0, 0.3),
            0 4px 0 rgba(0, 0, 0, 0.22),
            0 6px 12px rgba(0, 0, 0, 0.5),
            0 12px 24px rgba(0, 0, 0, 0.35);
        }

        /* 3-D hover — the card leans toward the cursor. Pure CSS, no
           JS, works as long as the parent has perspective set. */
        .horpen-card-3d {
          transform-style: preserve-3d;
          transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1),
                      border-color 0.3s ease;
          will-change: transform;
        }
        .horpen-card-3d:hover {
          transform: translateY(-6px) rotateX(2deg) rotateY(-2deg);
          box-shadow:
            0 1px 2px rgba(0,0,0,0.04),
            0 30px 60px -15px rgba(15,15,40,0.18),
            0 15px 30px -10px rgba(15,15,40,0.12) !important;
        }
      `}</style>

      {/* z-index wrapper: everything below the orbs/grid sits on top */}
      <div style={{ position: "relative", zIndex: 1 }}>
      {/* ═════════════════════════ NAV ═════════════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
        style={{
          background: "rgba(250,250,250,0.8)",
          borderBottom: "1px solid #ececec",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-5 md:px-8 h-[64px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div
              className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 32, height: 32, background: "#0a0a0a" }}
            >
              <Image
                src="/horpen-logo.png"
                alt=""
                width={20}
                height={20}
                priority
                style={{ objectFit: "contain" }}
              />
            </div>
            <span
              className="text-[17px] font-semibold"
              style={{ color: "#0a0a0a", letterSpacing: "-0.02em" }}
            >
              Horpen
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-[14px]">
            <a
              href="#features"
              className="transition"
              style={{ color: "#555" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#0a0a0a")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="transition"
              style={{ color: "#555" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#0a0a0a")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            >
              How it works
            </a>
            <a
              href="#pricing"
              className="transition"
              style={{ color: "#555" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#0a0a0a")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="transition"
              style={{ color: "#555" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#0a0a0a")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            >
              FAQ
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden md:inline-flex text-[14px] font-medium transition"
              style={{ color: "#555" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#0a0a0a")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1 text-[13px] md:text-[14px] font-semibold px-4 py-2 rounded-full transition"
              style={{
                background: "#0a0a0a",
                color: "#fff",
                boxShadow:
                  "0 1px 1px rgba(255,255,255,0.1) inset, 0 2px 8px rgba(0,0,0,0.15)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#222")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#0a0a0a")
              }
            >
              Start free
              <ArrowRight size={14} color="currentColor" />
            </Link>
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden p-2"
              aria-label="Toggle navigation"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <line
                  x1="3"
                  y1="6"
                  x2="21"
                  y2="6"
                  stroke="#0a0a0a"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <line
                  x1="3"
                  y1="12"
                  x2="21"
                  y2="12"
                  stroke="#0a0a0a"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <line
                  x1="3"
                  y1="18"
                  x2="21"
                  y2="18"
                  stroke="#0a0a0a"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div
            className="md:hidden border-t"
            style={{ borderColor: "#ececec", background: "#ffffff" }}
          >
            <div className="px-5 py-3 flex flex-col gap-3 text-[14px]">
              <a href="#features" onClick={() => setMenuOpen(false)}>
                Features
              </a>
              <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
                How it works
              </a>
              <a href="#pricing" onClick={() => setMenuOpen(false)}>
                Pricing
              </a>
              <a href="#faq" onClick={() => setMenuOpen(false)}>
                FAQ
              </a>
              <Link href="/login" className="pt-1" style={{ color: "#555" }}>
                Sign in
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ═════════════════════════ HERO ═════════════════════════ */}
      <section className="pt-[120px] md:pt-[160px] pb-14 md:pb-20 px-5 md:px-8 relative">
        <div
          className="max-w-[1040px] mx-auto text-center"
          style={{ animation: "horpen-hero-in 1.1s cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          {/* Pill tagline */}
          <div
            className="inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-full mb-6"
            style={{
              background: "#ffffff",
              border: "1px solid #ececec",
              color: "#555",
              boxShadow:
                "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(15,15,40,0.04)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "#16a34a" }}
            />
            New · AI video generation with Kling 2.5, Veo 3.1 & Grok
          </div>

          {/* 3D embossed headline — shared `.horpen-emboss` class
              (defined in the global stylesheet block). Same treatment
              applied on every big title across the page so the whole
              landing reads as one tactile surface. */}
          <h1
            className="text-[40px] md:text-[68px] lg:text-[78px] font-semibold leading-[1.02]"
            style={{ letterSpacing: "-0.03em" }}
          >
            <span className="horpen-emboss">Every AI asset your</span>
            <br />
            <span className="horpen-emboss-muted">channel needs.</span>
          </h1>

          <p
            className="mt-6 md:mt-8 text-[16px] md:text-[19px] leading-[1.5] max-w-[680px] mx-auto"
            style={{ color: "#555" }}
          >
            Generate AI avatars, viral images, full-motion videos and
            product ads — all from one studio. One subscription, every tool,
            zero juggling between apps.
          </p>

          <div className="mt-8 md:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="group inline-flex items-center justify-center gap-2 text-[15px] font-semibold px-6 py-3.5 rounded-full transition-all duration-300 w-full sm:w-auto relative overflow-hidden"
              style={{
                background: "#0a0a0a",
                color: "#fff",
                minWidth: 180,
                animation: "horpen-pulse-glow 3s ease-in-out infinite",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1a1a1a";
                e.currentTarget.style.transform = "translateY(-1px) scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#0a0a0a";
                e.currentTarget.style.transform = "translateY(0) scale(1)";
              }}
            >
              {/* Shimmer sweep inside the CTA */}
              <span
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.18) 45%, transparent 70%)",
                  backgroundSize: "200% 100%",
                  animation: "horpen-shimmer 3s linear infinite",
                }}
              />
              <span className="relative">Start for free</span>
              <ArrowRight
                size={15}
                color="currentColor"
                className="relative transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 text-[15px] font-medium px-6 py-3.5 rounded-full transition w-full sm:w-auto"
              style={{
                background: "#ffffff",
                color: "#0a0a0a",
                border: "1px solid #ececec",
                minWidth: 180,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f4f4f4")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#ffffff")
              }
            >
              <Play size={14} color="currentColor" />
              See what it does
            </a>
          </div>

          <p
            className="mt-5 text-[12px]"
            style={{ color: "#888" }}
          >
            3 free credits. No credit card. 60 seconds to your first video.
          </p>
        </div>

        {/* Hero visual — minimalist app preview, fed with real user
            generations the moment /showcase/featured resolves. */}
        <div
          className="horpen-reveal"
          style={{ ["--horpen-reveal-delay" as string]: "250ms" }}
        >
          <HeroPreview showcase={showcase} />
        </div>
      </section>

      {/* ═════════════════════════ THUMBNAILS SHOWCASE ═════════════════════════
          Dedicated section that surfaces real thumbnails generated by
          the admin account. User feedback: "met en avant les
          miniatures". This is where they land — a big hero gallery
          proving the product actually produces click-worthy output,
          not a promise. Empty-state falls back to labelled gradient
          tiles so the page still looks finished on a cold backend. */}
      <ThumbnailsShowcase tiles={showcase.thumbnails} />

      {/* ═════════════════════════ FEATURES ═════════════════════════ */}
      <section id="features" className="py-16 md:py-24 px-5 md:px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center max-w-[720px] mx-auto mb-12 md:mb-16">
            <div
              className="inline-block text-[11px] font-semibold tracking-widest uppercase px-3 py-1 rounded-full mb-4"
              style={{
                background: "#ffffff",
                border: "1px solid #ececec",
                color: "#555",
              }}
            >
              Features
            </div>
            <h2
              className="text-[32px] md:text-[48px] font-semibold leading-[1.08]"
              style={{ letterSpacing: "-0.03em" }}
            >
              <span className="horpen-emboss">Four studios.</span>
              <br />
              <span className="horpen-emboss-muted">One subscription.</span>
            </h2>
            <p
              className="mt-5 text-[15px] md:text-[16px] leading-[1.55]"
              style={{ color: "#555" }}
            >
              Horpen bundles every AI tool a content creator needs. Avatars,
              images, videos, ads — all in one dashboard. Pay once, create
              everything, keep your workflow unified.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <FeatureCard
              illustration={<AvatarsIllustration />}
              title="AI avatars, consistent everywhere."
              body="Upload a few photos of any character. Horpen trains a reusable avatar you can drop into every video, thumbnail or ad — keeping the exact same face, style and identity across the whole channel."
              badge="AI Avatars"
              revealDelay={0}
            />
            <FeatureCard
              illustration={<ImagesIllustration />}
              title="Every image, in every style."
              body="Viral YouTube thumbnails, product photography, stylised portraits, lifestyle shots. Powered by Gemini 3 Pro Image (Nano Banana Pro) — the sharpest image model on the market — generated in seconds."
              badge="AI Images"
              highlight
              revealDelay={120}
            />
            <FeatureCard
              illustration={<VideosIllustration />}
              title="Videos, from a sentence or a URL."
              body="Describe a topic and get a 60-second vertical video with voice-over and subtitles. Or paste a YouTube URL and get 10 viral shorts. Powered by Kling, Veo 3.1, Hailuo and Grok."
              badge="AI Videos"
              revealDelay={240}
            />
            <FeatureCard
              illustration={<AdsIllustration />}
              title="Product ads, in every format."
              body="Drop 3 photos of a product. Horpen generates a library of static ad creatives — studio shots, lifestyle, before / after, holiday edits — ready for Meta, TikTok and Google Ads in every aspect ratio."
              badge="Ad Creatives"
              revealDelay={360}
            />
          </div>
        </div>
      </section>

      {/* ═════════════════════════ HOW IT WORKS ═════════════════════════ */}
      <section
        id="how-it-works"
        className="py-16 md:py-24 px-5 md:px-8"
        style={{ background: "#ffffff", borderTop: "1px solid #ececec" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center max-w-[640px] mx-auto mb-12">
            <div
              className="inline-block text-[11px] font-semibold tracking-widest uppercase px-3 py-1 rounded-full mb-4"
              style={{
                background: "#f4f4f4",
                color: "#555",
              }}
            >
              How it works
            </div>
            <h2
              className="horpen-emboss text-[32px] md:text-[44px] font-semibold leading-[1.08]"
              style={{ letterSpacing: "-0.03em" }}
            >
              Three steps from idea to post.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {STEPS.map((s, idx) => (
              <div
                key={s.num}
                className="horpen-reveal group rounded-2xl p-6 md:p-7 transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: "#fafafa",
                  border: "1px solid #ececec",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.02), 0 6px 18px rgba(15,15,40,0.04)",
                  ["--horpen-reveal-delay" as string]: `${idx * 120}ms`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 1px 2px rgba(0,0,0,0.04), 0 20px 40px rgba(15,15,40,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 1px 2px rgba(0,0,0,0.02), 0 6px 18px rgba(15,15,40,0.04)";
                }}
              >
                <div
                  className="text-[13px] font-semibold tracking-widest mb-4 transition-colors group-hover:text-[#0a0a0a]"
                  style={{ color: "#9a9a9a" }}
                >
                  {s.num}
                </div>
                <div
                  className="text-[19px] font-semibold mb-2"
                  style={{ color: "#0a0a0a", letterSpacing: "-0.01em" }}
                >
                  {s.title}
                </div>
                <div
                  className="text-[14px] leading-[1.55]"
                  style={{ color: "#555" }}
                >
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════════════════ SOCIAL-PROOF STATS ═════════════════════════ */}
      <section className="py-14 md:py-20 px-5 md:px-8">
        <div className="max-w-[1100px] mx-auto">
          <div
            className="rounded-3xl px-6 md:px-12 py-10 md:py-14"
            style={{
              background: "#0a0a0a",
              color: "#fff",
            }}
          >
            <div
              className="text-[11px] font-semibold tracking-widest uppercase mb-6 text-center"
              style={{ color: "#999" }}
            >
              Built for creators shipping daily
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4 text-center">
              <Stat k="4" l="motion models" />
              <Stat k="60s" l="max output length" />
              <Stat k="9:16" l="TikTok-native" />
              <Stat k="1" l="subscription, not 5" />
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════════════ PRICING ═════════════════════════ */}
      <section
        id="pricing"
        className="py-16 md:py-24 px-5 md:px-8"
        style={{ background: "#ffffff", borderTop: "1px solid #ececec" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center max-w-[640px] mx-auto mb-12 md:mb-16">
            <div
              className="inline-block text-[11px] font-semibold tracking-widest uppercase px-3 py-1 rounded-full mb-4"
              style={{
                background: "#f4f4f4",
                color: "#555",
              }}
            >
              Pricing
            </div>
            <h2
              className="horpen-emboss text-[32px] md:text-[44px] font-semibold leading-[1.08]"
              style={{ letterSpacing: "-0.03em" }}
            >
              Transparent, credit-based.
            </h2>
            <p
              className="mt-4 text-[15px] md:text-[16px] leading-[1.55]"
              style={{ color: "#555" }}
            >
              Every model, every export quality shows you its exact credit cost
              upfront. No hidden fees, no usage surprises.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {PLANS.map((plan, idx) => (
              <div
                key={plan.slug}
                className="horpen-reveal rounded-2xl p-6 md:p-7 flex flex-col transition-all duration-300 hover:-translate-y-2"
                style={{
                  background: plan.highlighted ? "#0a0a0a" : "#ffffff",
                  color: plan.highlighted ? "#fafafa" : "#0a0a0a",
                  border: plan.highlighted
                    ? "1px solid #0a0a0a"
                    : "1px solid #ececec",
                  boxShadow: plan.highlighted
                    ? "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -15px rgba(0,0,0,0.35), 0 15px 30px -10px rgba(0,0,0,0.2)"
                    : "0 1px 2px rgba(0,0,0,0.02), 0 8px 24px rgba(15,15,40,0.04)",
                  transform: plan.highlighted ? "scale(1.03)" : undefined,
                  ["--horpen-reveal-delay" as string]: `${idx * 140}ms`,
                }}
              >
                <div
                  className="text-[13px] font-semibold uppercase tracking-widest"
                  style={{
                    color: plan.highlighted ? "#9a9a9a" : "#9a9a9a",
                  }}
                >
                  {plan.name}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span
                    className="text-[42px] font-semibold"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    ${plan.price}
                  </span>
                  {plan.price > 0 && (
                    <span
                      className="text-[14px]"
                      style={{
                        color: plan.highlighted ? "#9a9a9a" : "#7a7a7a",
                      }}
                    >
                      / month
                    </span>
                  )}
                </div>
                <div
                  className="mt-1 text-[13px]"
                  style={{ color: plan.highlighted ? "#bbb" : "#555" }}
                >
                  {plan.credits} · {plan.sub}
                </div>

                <ul className="mt-6 space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-[14px]"
                      style={{
                        color: plan.highlighted ? "#ddd" : "#444",
                      }}
                    >
                      <Check
                        size={16}
                        color={plan.highlighted ? "#8ee0a9" : "#0a0a0a"}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className="mt-6 inline-flex items-center justify-center gap-2 text-[14px] font-semibold px-5 py-3 rounded-full transition"
                  style={{
                    background: plan.highlighted ? "#ffffff" : "#0a0a0a",
                    color: plan.highlighted ? "#0a0a0a" : "#ffffff",
                  }}
                >
                  {plan.cta}
                  <ArrowRight size={13} color="currentColor" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════════════════ FAQ ═════════════════════════ */}
      <section id="faq" className="py-16 md:py-24 px-5 md:px-8">
        <div className="max-w-[860px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <div
              className="inline-block text-[11px] font-semibold tracking-widest uppercase px-3 py-1 rounded-full mb-4"
              style={{
                background: "#ffffff",
                border: "1px solid #ececec",
                color: "#555",
              }}
            >
              FAQ
            </div>
            <h2
              className="horpen-emboss text-[32px] md:text-[44px] font-semibold leading-[1.08]"
              style={{ letterSpacing: "-0.03em" }}
            >
              Questions, answered.
            </h2>
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "#ffffff",
              border: "1px solid #ececec",
            }}
          >
            {FAQ.map((item, idx) => {
              const open = openFaq === idx;
              return (
                <div
                  key={idx}
                  style={{
                    borderTop: idx > 0 ? "1px solid #ececec" : undefined,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : idx)}
                    className="w-full text-left px-5 md:px-6 py-4 flex items-center justify-between gap-4 transition"
                    style={{
                      background: open ? "#fafafa" : "#ffffff",
                    }}
                  >
                    <span
                      className="text-[15px] md:text-[16px] font-medium"
                      style={{ color: "#0a0a0a" }}
                    >
                      {item.q}
                    </span>
                    <ChevronDown
                      size={16}
                      color="#7a7a7a"
                      className={`shrink-0 transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {open && (
                    <div
                      className="px-5 md:px-6 pb-5 text-[14px] leading-[1.6]"
                      style={{ color: "#555" }}
                    >
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═════════════════════════ FINAL CTA ═════════════════════════ */}
      <section className="py-16 md:py-24 px-5 md:px-8">
        <div
          className="max-w-[1100px] mx-auto rounded-3xl px-6 md:px-12 py-14 md:py-20 text-center"
          style={{
            background:
              "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
            color: "#fff",
          }}
        >
          <h2
            className="horpen-emboss-dark-bg text-[32px] md:text-[52px] font-semibold leading-[1.05]"
            style={{ letterSpacing: "-0.03em" }}
          >
            Start shipping today.
          </h2>
          <p
            className="mt-4 md:mt-6 text-[15px] md:text-[17px] leading-[1.55] max-w-[520px] mx-auto"
            style={{ color: "#aaa" }}
          >
            3 free credits. The whole studio unlocked. Your first video in 60
            seconds.
          </p>
          <Link
            href="/signup"
            className="mt-8 md:mt-10 inline-flex items-center justify-center gap-2 text-[15px] font-semibold px-7 py-4 rounded-full transition"
            style={{
              background: "#ffffff",
              color: "#0a0a0a",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            Start for free
            <ArrowRight size={15} color="currentColor" />
          </Link>
        </div>
      </section>

      {/* ═════════════════════════ FOOTER ═════════════════════════ */}
      <footer
        className="px-5 md:px-8 py-10 md:py-14"
        style={{ borderTop: "1px solid #ececec" }}
      >
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div
              className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 28, height: 28, background: "#0a0a0a" }}
            >
              <Image
                src="/horpen-logo.png"
                alt=""
                width={16}
                height={16}
                style={{ objectFit: "contain" }}
              />
            </div>
            <span
              className="text-[15px] font-semibold"
              style={{ color: "#0a0a0a", letterSpacing: "-0.02em" }}
            >
              Horpen
            </span>
            <span className="text-[13px] ml-2" style={{ color: "#9a9a9a" }}>
              © {new Date().getFullYear()}
            </span>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <Link href="/login" style={{ color: "#555" }}>
              Sign in
            </Link>
            <Link href="/signup" style={{ color: "#555" }}>
              Start free
            </Link>
            <a href="#pricing" style={{ color: "#555" }}>
              Pricing
            </a>
            <a href="#faq" style={{ color: "#555" }}>
              FAQ
            </a>
            <a
              href="mailto:anskoju@gmail.com"
              style={{ color: "#555" }}
            >
              Support
            </a>
          </nav>
        </div>
      </footer>
      </div>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  Feature card primitive
 * ─────────────────────────────────────────────────────────────────── */

function FeatureCard({
  illustration,
  title,
  body,
  badge,
  highlight,
  revealDelay = 0,
}: {
  illustration: React.ReactNode;
  title: string;
  body: string;
  badge?: string;
  highlight?: boolean;
  revealDelay?: number;
}) {
  /* `perspective` on a wrapper lets the child `rotate` a little into 3D
     space without distorting the rest of the grid. We pair that with a
     deeper shadow stack on hover for a tangible "card lifted off the
     paper" feel — the gold-standard SaaS landing look. */
  return (
    <div
      className="horpen-reveal"
      style={{
        perspective: 1200,
        ["--horpen-reveal-delay" as string]: `${revealDelay}ms`,
      }}
    >
      <div
        className="horpen-card-3d rounded-2xl p-5 md:p-7"
        style={{
          background: "#ffffff",
          border: highlight
            ? "1px solid #d4d4d4"
            : "1px solid #ececec",
          boxShadow: highlight
            ? "0 1px 2px rgba(0,0,0,0.04), 0 18px 50px -10px rgba(15,15,40,0.10), 0 8px 20px -8px rgba(15,15,40,0.08)"
            : "0 1px 2px rgba(0,0,0,0.02), 0 10px 30px -8px rgba(15,15,40,0.06)",
        }}
      >
        {/* Illustration — soft-tinted pill with an inner shadow so it
            reads like a recessed panel, giving the card a two-layer
            depth. */}
        <div
          className="relative rounded-xl overflow-hidden mb-6 md:mb-7"
          style={{
            background:
              "linear-gradient(180deg, #fafafa 0%, #f1f1f5 100%)",
            border: "1px solid #ececec",
            height: 240,
            boxShadow: "inset 0 2px 6px rgba(15,15,40,0.04)",
          }}
        >
          {illustration}
        </div>

        {badge && (
          <div
            className="inline-block text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-full mb-3"
            style={{
              background: highlight ? "#0a0a0a" : "#f4f4f5",
              color: highlight ? "#fff" : "#555",
              boxShadow: highlight
                ? "0 4px 12px rgba(10,10,10,0.25)"
                : undefined,
            }}
          >
            {badge}
          </div>
        )}

        <h3
          className="text-[20px] md:text-[22px] font-semibold mb-2"
          style={{ color: "#0a0a0a", letterSpacing: "-0.02em" }}
        >
          {title}
        </h3>
        <p
          className="text-[14px] leading-[1.55]"
          style={{ color: "#555" }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  Illustrations
 *  All pure HTML/CSS + Icons so the bundle stays thin and the cards
 *  scale crisply on any DPI.
 * ─────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────
 *  Thumbnails showcase — hero gallery of real generations.
 *
 *  Renders a 4-column masonry-style wall of 16:9 thumbnails pulled
 *  from /showcase/featured. Each tile tilts slightly on hover (same
 *  `.horpen-card-3d` treatment as the feature cards) and fades in on
 *  scroll via `.horpen-reveal`. The section title uses the shared
 *  embossed 3-D class so it reads as part of the same visual family.
 * ─────────────────────────────────────────────────────────────────── */

function ThumbnailsShowcase({ tiles }: { tiles: ShowcaseTile[] }) {
  // Always show 8 slots. Fill from real thumbnails first, then pad
  // with gradient placeholders so the section never looks half-empty.
  const gradientPool = [
    "linear-gradient(135deg, #fca5d1 0%, #c4b5fd 100%)",
    "linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)",
    "linear-gradient(135deg, #bae6fd 0%, #0284c7 100%)",
    "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 100%)",
    "linear-gradient(135deg, #bbf7d0 0%, #10b981 100%)",
    "linear-gradient(135deg, #fca5a5 0%, #ef4444 100%)",
    "linear-gradient(135deg, #e9d5ff 0%, #a855f7 100%)",
    "linear-gradient(135deg, #fed7aa 0%, #ea580c 100%)",
  ];
  const slots = Array.from({ length: 8 }, (_, i) => ({
    url: tiles[i]?.url,
    grad: gradientPool[i % gradientPool.length],
  }));
  const hasRealContent = tiles.length > 0;

  return (
    <section className="py-12 md:py-20 px-5 md:px-8 relative">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center max-w-[720px] mx-auto mb-10 md:mb-14">
          <div
            className="inline-block text-[11px] font-semibold tracking-widest uppercase px-3 py-1 rounded-full mb-4"
            style={{
              background: "#ffffff",
              border: "1px solid #ececec",
              color: "#555",
            }}
          >
            Viral thumbnails
          </div>
          <h2
            className="text-[32px] md:text-[48px] font-semibold leading-[1.08]"
            style={{ letterSpacing: "-0.03em" }}
          >
            <span className="horpen-emboss">Thumbnails that stop</span>
            <br />
            <span className="horpen-emboss-muted">the scroll.</span>
          </h2>
          <p
            className="mt-5 text-[15px] md:text-[16px] leading-[1.55]"
            style={{ color: "#555" }}
          >
            Real thumbnails generated with Horpen — YouTube-ready,
            click-optimised, produced in seconds. No Photoshop, no
            designer, no template library.
          </p>
        </div>

        {/* 4-col grid of 16:9 thumbnails with 3-D tilt on hover */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {slots.map((slot, i) => (
            <div
              key={i}
              className="horpen-reveal"
              style={{
                perspective: 1200,
                ["--horpen-reveal-delay" as string]: `${i * 80}ms`,
              }}
            >
              <div
                className="horpen-card-3d relative rounded-xl overflow-hidden"
                style={{
                  aspectRatio: "16 / 9",
                  background: slot.url ? "#000" : slot.grad,
                  border: "1px solid #ececec",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.04), 0 14px 32px -8px rgba(15,15,40,0.12)",
                }}
              >
                {slot.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slot.url}
                    alt={`Thumbnail generated with Horpen (#${i + 1})`}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className="text-[11px] font-semibold tracking-widest uppercase"
                      style={{ color: "rgba(255,255,255,0.85)" }}
                    >
                      AI Thumbnail
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CTA row under the grid — reinforces value + funnel */}
        <div className="mt-10 md:mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 text-[14px] font-semibold px-5 py-3 rounded-full transition"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              boxShadow:
                "0 1px 1px rgba(255,255,255,0.1) inset, 0 8px 20px rgba(0,0,0,0.2)",
            }}
          >
            Generate your first thumbnail
            <ArrowRight size={14} color="currentColor" />
          </Link>
          {!hasRealContent && (
            <span
              className="text-[12px]"
              style={{ color: "#888" }}
            >
              Sample visuals shown — your gallery fills in with your own
              generations.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── 1. AI Avatars ──────────────────────────────────────────────
   A "photo" tile morphs into 3 generated avatar variations cycling
   behind it. The face silhouette is abstract so it reads as "any
   person" rather than a specific demo. */
function AvatarsIllustration() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-4 p-4">
      {/* Uploaded photo tile (left) */}
      <div
        className="relative rounded-xl overflow-hidden shadow-md shrink-0"
        style={{
          width: 80,
          height: 100,
          background: "linear-gradient(135deg, #fca5d1 0%, #c4b5fd 50%, #93c5fd 100%)",
          border: "2px solid #fff",
          animation: "avatars-upload-pulse 3.5s ease-in-out infinite",
        }}
      >
        {/* Face silhouette */}
        <svg viewBox="0 0 80 100" className="absolute inset-0 w-full h-full">
          <circle cx="40" cy="36" r="14" fill="rgba(255,255,255,0.6)" />
          <ellipse cx="40" cy="90" rx="28" ry="22" fill="rgba(255,255,255,0.6)" />
        </svg>
        <div
          className="absolute top-1 left-1 text-[8px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
        >
          Photo
        </div>
      </div>

      <ArrowRight size={14} color="#bbb" />

      {/* Generated avatar variations (right) — 3 stacked, cycling which is on top */}
      <div className="relative shrink-0" style={{ width: 100, height: 110 }}>
        {[
          { grad: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)" },
          { grad: "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)" },
          { grad: "linear-gradient(135deg, #f472b6 0%, #db2777 100%)" },
        ].map((v, i) => (
          <div
            key={i}
            className="absolute rounded-xl overflow-hidden shadow-md"
            style={{
              width: 72,
              height: 92,
              top: i * 6,
              left: i * 8,
              background: v.grad,
              border: "2px solid #fff",
              animation: `avatars-card-cycle 4.5s ease-in-out ${i * 1.5}s infinite`,
              zIndex: 3 - i,
            }}
          >
            <svg viewBox="0 0 72 92" className="absolute inset-0 w-full h-full">
              <circle cx="36" cy="34" r="12" fill="rgba(255,255,255,0.5)" />
              <ellipse cx="36" cy="84" rx="24" ry="18" fill="rgba(255,255,255,0.5)" />
            </svg>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes avatars-upload-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
          50% { transform: scale(1.03); box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
        }
        @keyframes avatars-card-cycle {
          0%, 20% { transform: translate(0, 0) rotate(0deg); z-index: 1; }
          50% { transform: translate(-4px, -6px) rotate(-2deg); z-index: 10; }
          100% { transform: translate(0, 0) rotate(0deg); z-index: 1; }
        }
      `}</style>
    </div>
  );
}

/* ─── 2. AI Images ───────────────────────────────────────────────
   A 2×3 grid of image tiles with different use-case labels
   (Thumbnail / Portrait / Product / Lifestyle). Each tile gently
   pulses on its own beat so the whole gallery feels alive. */
function ImagesIllustration() {
  const tiles = [
    { grad: "linear-gradient(135deg, #fca5d1 0%, #f472b6 100%)", label: "Thumbnail" },
    { grad: "linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)", label: "Product" },
    { grad: "linear-gradient(135deg, #bae6fd 0%, #0ea5e9 100%)", label: "Portrait" },
    { grad: "linear-gradient(135deg, #bbf7d0 0%, #10b981 100%)", label: "Lifestyle" },
    { grad: "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 100%)", label: "Style" },
    { grad: "linear-gradient(135deg, #fca5a5 0%, #ef4444 100%)", label: "Poster" },
  ];
  return (
    <div className="absolute inset-0 p-4 flex items-center justify-center">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t, i) => (
          <div
            key={i}
            className="relative rounded-lg overflow-hidden shadow-sm"
            style={{
              width: 60,
              height: 60,
              background: t.grad,
              border: "2px solid #fff",
              animation: `images-pulse 4s ease-in-out ${i * 0.4}s infinite`,
            }}
          >
            <div
              className="absolute bottom-0.5 left-0.5 right-0.5 text-[7px] font-semibold text-center py-0.5 rounded-sm"
              style={{
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
              }}
            >
              {t.label}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes images-pulse {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.05); opacity: 1; box-shadow: 0 6px 18px rgba(0,0,0,0.12); }
        }
      `}</style>
    </div>
  );
}

/* ─── 3. AI Videos ───────────────────────────────────────────────
   Prompt field + 3 stacked scene cards + playback bar with a
   progressing indicator. The progress bar fills left-to-right on a
   loop to convey "video being built". */
function VideosIllustration() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
      {/* Prompt field */}
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1.5 shadow-sm"
        style={{
          background: "#ffffff",
          border: "1px solid #ececec",
          minWidth: 220,
        }}
      >
        <SparkleIcon size={11} color="#0a0a0a" />
        <span className="text-[11px]" style={{ color: "#555" }}>
          Generate a video about…
        </span>
      </div>

      {/* Row of 3 stacked scene preview cards */}
      <div className="flex gap-2">
        {[
          "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 100%)",
          "linear-gradient(135deg, #fca5d1 0%, #db2777 100%)",
          "linear-gradient(135deg, #bae6fd 0%, #0284c7 100%)",
        ].map((grad, i) => (
          <div
            key={i}
            className="relative rounded-lg overflow-hidden shadow-md"
            style={{
              width: 50,
              height: 88,
              background: grad,
              border: "2px solid #fff",
              animation: `videos-scene 3.5s ease-in-out ${i * 0.4}s infinite`,
            }}
          >
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              <Play size={14} color="currentColor" />
            </div>
          </div>
        ))}
      </div>

      {/* Progress bar at the bottom */}
      <div
        className="relative rounded-full overflow-hidden"
        style={{
          width: 180,
          height: 6,
          background: "#ececec",
        }}
      >
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)",
            animation: "videos-progress 2.5s ease-in-out infinite",
          }}
        />
      </div>
      <span className="text-[9px]" style={{ color: "#888" }}>
        Rendering scenes…
      </span>

      <style jsx>{`
        @keyframes videos-scene {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes videos-progress {
          0% { width: 10%; }
          50% { width: 70%; }
          100% { width: 95%; }
        }
      `}</style>
    </div>
  );
}

/* ─── 4. Ad Creatives ────────────────────────────────────────────
   A product photo on the left + 3 ad variations on the right, each
   with a different marketing label ("30% OFF", "NEW", "Sale"). The
   variations cycle which one is highlighted. */
function AdsIllustration() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-4 p-4">
      {/* Product source card */}
      <div
        className="relative rounded-xl overflow-hidden shadow-md shrink-0"
        style={{
          width: 70,
          height: 70,
          background:
            "linear-gradient(135deg, #fde68a 0%, #f59e0b 50%, #d97706 100%)",
          border: "2px solid #fff",
        }}
      >
        {/* Abstract bottle/product shape */}
        <svg viewBox="0 0 70 70" className="absolute inset-0 w-full h-full">
          <rect x="27" y="14" width="16" height="10" rx="2" fill="rgba(255,255,255,0.7)" />
          <rect x="22" y="24" width="26" height="40" rx="4" fill="rgba(255,255,255,0.8)" />
          <rect x="26" y="38" width="18" height="8" rx="1" fill="rgba(0,0,0,0.15)" />
        </svg>
        <div
          className="absolute top-1 left-1 text-[8px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
        >
          Product
        </div>
      </div>

      <ArrowRight size={14} color="#bbb" />

      {/* 3 ad variations stacked */}
      <div className="flex flex-col gap-2">
        {[
          { grad: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", tag: "30% OFF" },
          { grad: "linear-gradient(135deg, #10b981 0%, #047857 100%)", tag: "NEW" },
          { grad: "linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)", tag: "Best seller" },
        ].map((v, i) => (
          <div
            key={i}
            className="relative rounded-lg overflow-hidden shadow-sm"
            style={{
              width: 100,
              height: 30,
              background: v.grad,
              border: "2px solid #fff",
              animation: `ads-highlight 5s ease-in-out ${i * 1.6}s infinite`,
            }}
          >
            {/* Mini product silhouette in the ad */}
            <svg viewBox="0 0 100 30" className="absolute inset-0 w-full h-full">
              <rect x="6" y="6" width="18" height="18" rx="3" fill="rgba(255,255,255,0.8)" />
            </svg>
            <div
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold"
              style={{ color: "#fff" }}
            >
              {v.tag}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes ads-highlight {
          0%, 40%, 100% { transform: translateX(0) scale(1); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
          20% { transform: translateX(4px) scale(1.04); box-shadow: 0 8px 20px rgba(0,0,0,0.16); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  Hero app preview — minimal, light-mode window mockup
 * ─────────────────────────────────────────────────────────────────── */

function HeroPreview({ showcase }: { showcase: ShowcaseData }) {
  /* Build a mixed gallery prioritising real thumbnails (user asked to
     "mettre en avant les miniatures") with avatars + images filling
     the rest. Tiles fall back to labelled gradients when no real
     content is loaded yet. */
  type HeroTile = {
    url?: string;
    label: string;
    grad: string;
    aspect: string;
    priority?: boolean;
  };
  const gradientPool = [
    "linear-gradient(135deg, #fca5d1 0%, #c4b5fd 100%)",
    "linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)",
    "linear-gradient(135deg, #bae6fd 0%, #0284c7 100%)",
    "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 100%)",
    "linear-gradient(135deg, #bbf7d0 0%, #10b981 100%)",
    "linear-gradient(135deg, #fca5a5 0%, #ef4444 100%)",
    "linear-gradient(135deg, #e9d5ff 0%, #a855f7 100%)",
    "linear-gradient(135deg, #fed7aa 0%, #ea580c 100%)",
  ];

  const tiles: HeroTile[] = [];
  // 1. First 4 thumbnails get a big 16:9 slot each — this is what the
  //    user asked to emphasise.
  showcase.thumbnails.slice(0, 4).forEach((t, i) => {
    tiles.push({
      url: t.url,
      label: "Thumbnail",
      grad: gradientPool[i % gradientPool.length],
      aspect: "16 / 9",
      priority: true,
    });
  });
  // 2. Then a mix of avatars (1:1) + ads (1:1) + images (1:1)
  showcase.avatars.slice(0, 2).forEach((t, i) => {
    tiles.push({
      url: t.url,
      label: "Avatar",
      grad: gradientPool[(i + 4) % gradientPool.length],
      aspect: "1 / 1",
    });
  });
  showcase.ads.slice(0, 2).forEach((t, i) => {
    tiles.push({
      url: t.url,
      label: "Ad",
      grad: gradientPool[(i + 6) % gradientPool.length],
      aspect: "1 / 1",
    });
  });
  // 3. Pad the grid to 8 total with gradient placeholders tagged with
  //    category labels so the layout stays full on a cold start.
  const padLabels = ["Video", "Portrait", "Poster", "Lifestyle"];
  const padAspects = ["9 / 16", "9 / 16", "1 / 1", "4 / 5"];
  while (tiles.length < 8) {
    const idx = tiles.length;
    tiles.push({
      label: padLabels[idx % padLabels.length],
      grad: gradientPool[idx % gradientPool.length],
      aspect: padAspects[idx % padAspects.length],
    });
  }
  const gallery = tiles.slice(0, 8);

  return (
    <div
      className="max-w-[980px] mx-auto mt-12 md:mt-16 px-3 md:px-0"
      style={{ perspective: 1800 }}
    >
      <div
        className="rounded-2xl overflow-hidden transition-transform duration-700"
        style={{
          background: "#ffffff",
          border: "1px solid #ececec",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.03), 0 40px 80px -20px rgba(15,15,40,0.18), 0 20px 40px -12px rgba(15,15,40,0.12)",
          transform: "rotateX(2deg) rotateY(0deg)",
          animation: "horpen-float-slow 8s ease-in-out infinite",
        }}
      >
        {/* Window chrome */}
        <div
          className="flex items-center gap-1.5 px-4 py-2.5"
          style={{ borderBottom: "1px solid #ececec", background: "#fafafa" }}
        >
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: "#f87171" }}
          />
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: "#fbbf24" }}
          />
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: "#34d399" }}
          />
          <span
            className="ml-3 text-[11px]"
            style={{ color: "#9a9a9a" }}
          >
            horpen.ai / AI Video
          </span>
        </div>

        {/* App body */}
        <div
          className="grid grid-cols-1 md:grid-cols-[180px_1fr]"
          style={{ minHeight: 320 }}
        >
          {/* Sidebar */}
          <div
            className="hidden md:flex flex-col p-3 gap-1"
            style={{ borderRight: "1px solid #ececec", background: "#fafafa" }}
          >
            {[
              { icon: "✨", label: "AI Video", active: true },
              { icon: "✂️", label: "Auto-Clip" },
              { icon: "🎭", label: "Avatars" },
              { icon: "🖼️", label: "Thumbnails" },
              { icon: "📢", label: "Ads" },
            ].map((n, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
                style={{
                  background: n.active ? "#ffffff" : "transparent",
                  color: n.active ? "#0a0a0a" : "#666",
                  border: n.active ? "1px solid #ececec" : "1px solid transparent",
                  fontWeight: n.active ? 600 : 400,
                }}
              >
                <span>{n.icon}</span>
                <span>{n.label}</span>
              </div>
            ))}
          </div>

          {/* Main — mixed gallery of recent generations across tools
              (an avatar, two images, a thumbnail, a video). Gives the
              visitor a one-glance sense of "this app makes every
              asset type". Every tile pulses gently so the dashboard
              looks alive. */}
          <div className="p-4 md:p-6">
            {/* Top bar: tool + generating state */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="rounded-md flex items-center justify-center"
                  style={{
                    width: 24,
                    height: 24,
                    background: "#0a0a0a",
                    color: "#fff",
                  }}
                >
                  <SparkleIcon size={12} color="currentColor" />
                </div>
                <span
                  className="text-[12px] font-medium"
                  style={{ color: "#0a0a0a" }}
                >
                  Latest generations
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "#555" }}>
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#34d399",
                    animation: "hero-dot-pulse 1.8s ease-in-out infinite",
                  }}
                />
                Rendering · 67%
              </div>
            </div>

            {/* Gallery grid — blends real thumbnails + avatars + ads
                from /showcase/featured with gradient placeholders for
                any missing slots. Real images always win when
                available, per the user's request to "mettre en avant
                les miniatures". */}
            <div className="grid grid-cols-4 gap-2">
              {gallery.map((tile, i) => (
                <div
                  key={i}
                  className="relative rounded-md overflow-hidden shadow-sm"
                  style={{
                    aspectRatio: tile.aspect,
                    background: tile.url ? "#000" : tile.grad,
                    border: "1.5px solid #ffffff",
                    animation: `hero-tile-pulse 3.5s ease-in-out ${i * 0.25}s infinite`,
                  }}
                >
                  {tile.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tile.url}
                      alt={tile.label}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div
                    className="absolute bottom-1 left-1 right-1 text-[7px] font-semibold text-center py-0.5 rounded-sm"
                    style={{
                      background: "rgba(0,0,0,0.55)",
                      color: "#fff",
                    }}
                  >
                    {tile.label}
                  </div>
                  {tile.priority && tile.url && (
                    <div
                      className="absolute top-1 left-1 text-[7px] font-semibold px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(255,255,255,0.95)",
                        color: "#0a0a0a",
                      }}
                    >
                      ★
                    </div>
                  )}
                </div>
              ))}
            </div>

            <style jsx>{`
              @keyframes hero-tile-pulse {
                0%, 100% { transform: scale(1); opacity: 0.95; }
                50% { transform: scale(1.02); opacity: 1; }
              }
              @keyframes hero-dot-pulse {
                0%, 100% { opacity: 0.4; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.3); }
              }
            `}</style>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  Stats primitive (for the dark social-proof band)
 * ─────────────────────────────────────────────────────────────────── */

function Stat({ k, l }: { k: string; l: string }) {
  return (
    <div>
      <div
        className="text-[32px] md:text-[42px] font-semibold leading-none"
        style={{ letterSpacing: "-0.03em", color: "#fff" }}
      >
        {k}
      </div>
      <div
        className="mt-1 text-[12px] md:text-[13px]"
        style={{ color: "#888" }}
      >
        {l}
      </div>
    </div>
  );
}
