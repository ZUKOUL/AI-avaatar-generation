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
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Play,
  Scissors,
  SparkleIcon,
  MagicWand,
  VideoCamera,
  UserCircle,
  Megaphone,
  PlaySquare,
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
    desc: "Auto-Clip a YouTube URL, describe a video from scratch, or apply a niche preset to match a creator's style.",
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
    a: "No. Paste a URL, type a sentence, or click a niche preset — Horpen handles the script, scene planning, image generation, animation, voice-over and subtitles. The dashboard is the whole interface.",
  },
  {
    q: "Can I monetise the videos I export?",
    a: "Yes. Paid plans remove the watermark and give you full commercial rights on the generated output. Many of our users run monetised TikTok / YouTube Shorts channels on Horpen's output.",
  },
  {
    q: "Which video models does Horpen support?",
    a: "Kling 2.5 Turbo Pro (default), Veo 3.1 Fast (Google's photoreal model), Minimax Hailuo 02 (cheapest) and Grok Imagine (xAI). You pick per video — Horpen shows the price for each upfront.",
  },
  {
    q: "How does a niche preset work?",
    a: "A niche bundles a visual style (reference images fed to the image model), a narrator voice pattern (script structure + signature phrases) and a topic generator. Click the preset, type a theme, get a video that visually + narratively matches the reference channel.",
  },
  {
    q: "Can I use my own reference images?",
    a: "Yes. Every niche has a drag-and-drop manager. Drop 2-5 screenshots from the creator you want to match, and future generations condition directly on them.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Anytime, no questions. Credits purchased in the current cycle stay valid until the end of the period.",
  },
];

/* ═══════════════════════════════════════════════════════════════════
 *  PAGE
 * ═════════════════════════════════════════════════════════════════ */

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [menuOpen, setMenuOpen] = useState(false);

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

          <h1
            className="text-[40px] md:text-[68px] lg:text-[78px] font-semibold leading-[1.02]"
            style={{ letterSpacing: "-0.03em", color: "#0a0a0a" }}
          >
            The whole video pipeline,
            <br />
            <span style={{ color: "#7a7a7a" }}>in a single studio.</span>
          </h1>

          <p
            className="mt-6 md:mt-8 text-[16px] md:text-[19px] leading-[1.5] max-w-[680px] mx-auto"
            style={{ color: "#555" }}
          >
            Auto-clip a YouTube URL, generate a full 60-second vertical video
            from one sentence, lock a TikTok creator&apos;s visual style on
            your own topic. All with voice-over, karaoke subtitles and 4K
            export — ready to post.
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

        {/* Hero visual — minimalist app preview */}
        <div
          className="horpen-reveal"
          style={{ ["--horpen-reveal-delay" as string]: "250ms" }}
        >
          <HeroPreview />
        </div>
      </section>

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
              style={{ letterSpacing: "-0.03em", color: "#0a0a0a" }}
            >
              One subscription.
              <br />
              <span style={{ color: "#7a7a7a" }}>
                The entire short-form pipeline.
              </span>
            </h2>
            <p
              className="mt-5 text-[15px] md:text-[16px] leading-[1.55]"
              style={{ color: "#555" }}
            >
              Why pay Opus Clip, Captions.ai, Runway and Synthesia at the same
              time? Horpen does what each of them does best — and one thing
              they can&apos;t: lock your output to a specific creator&apos;s
              signature style.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <FeatureCard
              illustration={<AutoClipIllustration />}
              title="From one URL, 10 viral shorts."
              body="Paste any YouTube, Vimeo, TikTok or X URL. Horpen finds the 10 most shareable moments, reframes them to 9:16 with face tracking, and burns in word-level karaoke subtitles. 30 seconds of work. A week of content."
              badge="Auto-Clip"
              revealDelay={0}
            />
            <FeatureCard
              illustration={<AIVideoIllustration />}
              title="One sentence, a 60-second video."
              body="Describe anything. Horpen writes the script, storyboards the scenes, generates cinematic keyframes, animates them with Kling or Veo, records a real voice-over with ElevenLabs, and syncs word-perfect subtitles."
              badge="AI Video"
              revealDelay={120}
            />
            <FeatureCard
              illustration={<NicheIllustration />}
              title="Match any creator's style, exactly."
              body="Pick a preset (Claymation 3D, UGC demo, aesthetic quote…) or drop reference screenshots from a TikTok channel you love. Every scene Horpen generates visually belongs to that same brand. Nobody else ships this."
              badge="Niche presets"
              highlight
              revealDelay={240}
            />
            <FeatureCard
              illustration={<StudioIllustration />}
              title="Stop juggling five SaaS."
              body="AI avatars. Viral thumbnails. Static ads. Long-form → shorts. Full AI videos. One login, one credit system, one dashboard. Everything the content pipeline needs, under one roof."
              badge="All-in-one"
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
              className="text-[32px] md:text-[44px] font-semibold leading-[1.08]"
              style={{ letterSpacing: "-0.03em", color: "#0a0a0a" }}
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
              className="text-[32px] md:text-[44px] font-semibold leading-[1.08]"
              style={{ letterSpacing: "-0.03em", color: "#0a0a0a" }}
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
              className="text-[32px] md:text-[44px] font-semibold leading-[1.08]"
              style={{ letterSpacing: "-0.03em", color: "#0a0a0a" }}
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
            className="text-[32px] md:text-[52px] font-semibold leading-[1.05]"
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

function AutoClipIllustration() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 gap-3">
      {/* URL bar at top */}
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1.5 shadow-sm"
        style={{ background: "#ffffff", border: "1px solid #ececec", minWidth: 240 }}
      >
        <div
          className="w-4 h-4 rounded-sm flex items-center justify-center"
          style={{ background: "#ef4444" }}
        >
          <Play size={8} color="#fff" />
        </div>
        <span className="text-[11px]" style={{ color: "#666" }}>
          youtube.com/watch?v=…
        </span>
      </div>

      {/* Scissor connector */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: "#0a0a0a" }}
      >
        <Scissors size={14} color="#fff" />
      </div>

      {/* Row of vertical clip tiles */}
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-md relative overflow-hidden"
            style={{
              width: 32,
              height: 56,
              background:
                "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)",
              border: "1px solid #e4e4e7",
              animation: `float-y 3s ease-in-out ${i * 0.3}s infinite`,
            }}
          >
            <div
              className="absolute bottom-1 left-1 right-1 h-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.85)" }}
            />
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes float-y {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

function AIVideoIllustration() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-3 p-4">
      {/* Left: sentence bubble */}
      <div
        className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5 shadow-sm"
        style={{ background: "#ffffff", border: "1px solid #ececec", maxWidth: 110 }}
      >
        <div
          className="h-1.5 rounded-full"
          style={{ background: "#e4e4e7", width: "80%" }}
        />
        <div
          className="h-1.5 rounded-full"
          style={{ background: "#e4e4e7", width: "100%" }}
        />
        <div
          className="h-1.5 rounded-full"
          style={{ background: "#e4e4e7", width: "60%" }}
        />
      </div>

      {/* Arrow */}
      <div style={{ color: "#bbb" }}>
        <ArrowRight size={14} color="currentColor" />
      </div>

      {/* Middle: stack of scene cards */}
      <div className="relative" style={{ width: 60, height: 100 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute rounded-md shadow-sm"
            style={{
              width: 44,
              height: 78,
              top: i * 6,
              left: i * 6,
              background:
                i === 2
                  ? "linear-gradient(135deg, #fde68a 0%, #fbbf24 100%)"
                  : i === 1
                    ? "linear-gradient(135deg, #bae6fd 0%, #7dd3fc 100%)"
                    : "linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 100%)",
              border: "1px solid #ffffff",
              zIndex: 3 - i,
            }}
          />
        ))}
      </div>

      {/* Arrow */}
      <div style={{ color: "#bbb" }}>
        <ArrowRight size={14} color="currentColor" />
      </div>

      {/* Right: final video preview */}
      <div
        className="relative rounded-lg overflow-hidden shadow-md"
        style={{
          width: 56,
          height: 100,
          background: "linear-gradient(180deg, #0a0a0a 0%, #27272a 100%)",
          border: "1px solid #1a1a1a",
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: "#ffffff" }}
        >
          <div
            className="rounded-full p-2"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <Play size={12} color="#fff" />
          </div>
        </div>
        {/* Subtitle line */}
        <div
          className="absolute left-2 right-2 bottom-2 h-1.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.85)" }}
        />
      </div>
    </div>
  );
}

function NicheIllustration() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      {/* Center niche card */}
      <div
        className="relative rounded-xl p-3 shadow-md z-10"
        style={{
          background:
            "linear-gradient(135deg, #1c1c1c 0%, #0d1424 50%, #1c2b4a 100%)",
          border: "1px solid #1a1a1a",
          minWidth: 130,
        }}
      >
        <div
          className="text-[8px] font-semibold tracking-widest uppercase"
          style={{ color: "#d6dce5" }}
        >
          Claymation 3D · FR
        </div>
        <div className="text-[11px] font-semibold mt-1" style={{ color: "#fff" }}>
          Humain Penseur
        </div>
        <div className="text-[9px] mt-0.5" style={{ color: "#999" }}>
          @humain.penseur
        </div>
        <div className="flex items-center gap-1 mt-2">
          <SparkleIcon size={9} color="#d6dce5" />
          <span className="text-[8px]" style={{ color: "#bbb" }}>
            Style locked
          </span>
        </div>
      </div>

      {/* 4 floating generated scenes around */}
      {[
        { top: 10, left: 10, grad: "linear-gradient(135deg, #d4d4d8 0%, #71717a 100%)" },
        { top: 10, right: 10, grad: "linear-gradient(135deg, #a1a1aa 0%, #52525b 100%)" },
        { bottom: 10, left: 10, grad: "linear-gradient(135deg, #e4e4e7 0%, #a1a1aa 100%)" },
        { bottom: 10, right: 10, grad: "linear-gradient(135deg, #71717a 0%, #3f3f46 100%)" },
      ].map((pos, i) => (
        <div
          key={i}
          className="absolute rounded-md shadow-sm"
          style={{
            width: 36,
            height: 62,
            background: pos.grad,
            border: "1px solid #ffffff",
            ...pos,
            animation: `drift-${i} 6s ease-in-out infinite`,
          }}
        />
      ))}

      <style jsx>{`
        @keyframes drift-0 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(2px,-2px); } }
        @keyframes drift-1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-2px,-2px); } }
        @keyframes drift-2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(2px,2px); } }
        @keyframes drift-3 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-2px,2px); } }
      `}</style>
    </div>
  );
}

function StudioIllustration() {
  const tools = [
    { icon: UserCircle, label: "Avatars", color: "#a78bfa" },
    { icon: PlaySquare, label: "Thumbnails", color: "#f472b6" },
    { icon: Megaphone, label: "Ads", color: "#fb923c" },
    { icon: Scissors, label: "Clips", color: "#34d399" },
    { icon: SparkleIcon, label: "AI Video", color: "#60a5fa" },
    { icon: VideoCamera, label: "Motion", color: "#facc15" },
  ];
  return (
    <div className="absolute inset-0 p-4">
      {/* Connecting dashed lines underneath */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 300 240"
        preserveAspectRatio="none"
      >
        <g
          stroke="#d4d4d8"
          strokeWidth="1"
          strokeDasharray="3,3"
          fill="none"
          opacity="0.6"
        >
          <line x1="50" y1="60" x2="150" y2="120" />
          <line x1="150" y1="60" x2="150" y2="120" />
          <line x1="250" y1="60" x2="150" y2="120" />
          <line x1="50" y1="180" x2="150" y2="120" />
          <line x1="150" y1="180" x2="150" y2="120" />
          <line x1="250" y1="180" x2="150" y2="120" />
        </g>
      </svg>

      {/* Center hub — Horpen logo */}
      <div
        className="absolute rounded-2xl shadow-lg flex items-center justify-center"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 48,
          height: 48,
          background: "#0a0a0a",
          border: "2px solid #ffffff",
          zIndex: 10,
        }}
      >
        <MagicWand size={20} color="#fff" />
      </div>

      {/* 6 tool cards in a 3x2 grid */}
      <div className="relative h-full grid grid-cols-3 gap-2" style={{ zIndex: 5 }}>
        {tools.map((t, i) => {
          const Icon = t.icon;
          return (
            <div
              key={t.label}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 shadow-sm self-start justify-self-center"
              style={{
                background: "#ffffff",
                border: "1px solid #ececec",
                alignSelf: i < 3 ? "start" : "end",
                justifySelf: i % 3 === 0 ? "start" : i % 3 === 1 ? "center" : "end",
              }}
            >
              <div
                className="rounded-sm flex items-center justify-center"
                style={{
                  width: 14,
                  height: 14,
                  background: t.color,
                }}
              >
                <Icon size={8} color="#fff" />
              </div>
              <span
                className="text-[9px] font-medium"
                style={{ color: "#333" }}
              >
                {t.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  Hero app preview — minimal, light-mode window mockup
 * ─────────────────────────────────────────────────────────────────── */

function HeroPreview() {
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

          {/* Main */}
          <div className="p-4 md:p-6">
            {/* Prompt box */}
            <div
              className="rounded-lg px-3 py-2.5 text-[13px]"
              style={{
                background: "#fafafa",
                border: "1px solid #ececec",
                color: "#0a0a0a",
              }}
            >
              l&apos;énergie masculine et pourquoi un homme qui aime protège
              vraiment
            </div>

            {/* Niche badge */}
            <div
              className="mt-3 rounded-lg px-3 py-2 flex items-center gap-2"
              style={{
                background:
                  "linear-gradient(135deg, #1c1c1c 0%, #1c2b4a 100%)",
                color: "#fff",
              }}
            >
              <SparkleIcon size={13} color="#d6dce5" />
              <span
                className="text-[11px] font-semibold tracking-wider uppercase"
                style={{ color: "#d6dce5" }}
              >
                Claymation 3D · @humain.penseur
              </span>
            </div>

            {/* Scene thumbnails */}
            <div className="mt-4 grid grid-cols-5 gap-2">
              {[
                "linear-gradient(135deg, #e4e4e7 0%, #a1a1aa 100%)",
                "linear-gradient(135deg, #d4d4d8 0%, #71717a 100%)",
                "linear-gradient(135deg, #a1a1aa 0%, #52525b 100%)",
                "linear-gradient(135deg, #e4e4e7 0%, #a1a1aa 100%)",
                "linear-gradient(135deg, #71717a 0%, #3f3f46 100%)",
              ].map((bg, i) => (
                <div
                  key={i}
                  className="relative rounded-md aspect-[9/16]"
                  style={{
                    background: bg,
                    border: "1px solid #ffffff",
                  }}
                >
                  <div
                    className="absolute bottom-1 left-1 right-1 h-0.5 rounded-full"
                    style={{ background: "rgba(255,255,255,0.85)" }}
                  />
                </div>
              ))}
            </div>

            {/* Status row */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px]" style={{ color: "#555" }}>
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "#34d399" }}
                />
                Rendering keyframes · 35%
              </div>
              <div
                className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: "#0a0a0a",
                  color: "#fff",
                }}
              >
                Generate another
              </div>
            </div>
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
