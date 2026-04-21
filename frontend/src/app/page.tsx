"use client";

/**
 * Horpen.ai — landing page (FR, Taap.it-grade).
 *
 * Sections :
 *   1.  Hero (dark panel + beams)
 *   2.  Feature tabs interactifs (UGC / Avatars / Miniatures / Ads)
 *   3.  Social proof — logos flottants + 3 metrics
 *   4.  3 piliers (Convertir / Cloner / Unifier) + illustrations SVG
 *   5.  Feature showcase (sidebar tabs + demo)
 *   6.  6 features (icônes vectorielles, pas d'emoji)
 *   7.  Témoignage unique
 *   8.  Analytics + mockup
 *   9.  Workspace hub
 *   10. Micro-apps
 *   11. Pricing
 *   12. FAQ
 *   13. CTA final + AEO (Ask ChatGPT / Claude / Perplexity)
 *   14. Build in public
 *   15. Footer
 *
 * Tous les @keyframes sont dans un seul <style jsx global> top-level
 * (Turbopack refuse les styled-jsx imbriqués).
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
  SparkleIcon,
  ChevronDown,
  VideoCamera,
  User,
  Megaphone,
  PlaySquare,
  MagicWand,
  Camera,
  Brush,
  Package,
  Star,
  Type,
} from "@/components/Icons";
import {
  PRODUCTS,
  ProductDock,
  ProductDropdown,
  ProductDropdownTrigger,
  Product3DLogo,
  type Product,
  type ProductSlug,
} from "@/components/landing/shared";

/* ─── Pricing ─────────────────────────────────────────────────────── */

const PLANS = [
  {
    slug: "free",
    name: "Free",
    price: 0,
    credits: "3 crédits",
    sub: "Teste tout le studio, gratos",
    features: [
      "3 crédits offerts",
      "Tous les outils IA (limités)",
      "Exports avec watermark",
      "Support communautaire",
    ],
    cta: "Commencer gratuitement",
    highlighted: false,
  },
  {
    slug: "creator",
    name: "Creator",
    price: 35,
    credits: "200 crédits / mois",
    sub: "Pour créateurs solos qui publient chaque semaine",
    features: [
      "200 crédits chaque mois",
      "Tous les moteurs vidéo (Kling, Veo, Hailuo, Grok)",
      "Exports HD, sans watermark",
      "Presets niche + images de référence",
      "Droits commerciaux inclus",
    ],
    cta: "Passer à Creator",
    highlighted: true,
  },
  {
    slug: "studio",
    name: "Studio",
    price: 85,
    credits: "450 crédits / mois",
    sub: "Pour agences et studios e-com",
    features: [
      "450 crédits chaque mois",
      "Tout Creator",
      "Exports 4K",
      "File de génération prioritaire",
      "Accès API",
    ],
    cta: "Prendre Studio",
    highlighted: false,
  },
] as const;

/* ─── FAQ ─────────────────────────────────────────────────────────── */

const FAQ = [
  {
    q: "C'est quoi Horpen, exactement ?",
    a: "Une plateforme IA tout-en-un pour générer, cloner et décliner tes contenus marketing : UGC vidéo, ads, photos produit, miniatures YouTube, avatars IA. Un seul workspace, une seule facture.",
  },
  {
    q: "C'est pour qui ?",
    a: "E-commerçants, dropshippers, créateurs UGC, faceless content creators, opérateurs d'influenceurs IA, agences créa.",
  },
  {
    q: "C'est gratuit pour commencer ?",
    a: "Oui. 3 crédits offerts pour tester l'ensemble du studio. Pas de CB demandée, pas d'engagement.",
  },
  {
    q: "En quoi Horpen est différent d'Arcads, Makeugc ou Weavy ?",
    a: "Horpen combine la génération UGC (Arcads), le clonage d'ads (Weavy), les photos produit (Makeugc) et les miniatures (Thumio) dans un seul outil. 2 à 3× moins cher grâce à notre stack (Gemini 3 Pro Image + Flux + Kling). Une facture au lieu de cinq.",
  },
  {
    q: "Je peux utiliser mon propre visage ?",
    a: "Oui. Charge quelques photos, Horpen crée ton avatar IA réutilisable sur toutes tes créas — UGC, ads, miniatures, vidéos. Ton style reste cohérent partout.",
  },
  {
    q: "Quelle qualité de vidéo je peux sortir ?",
    a: "Full HD par défaut, 4K en plan Studio. Compatible Kling 2.5 Turbo Pro, Veo 3.1 Fast, Hailuo 02 et Grok Imagine.",
  },
  {
    q: "Combien ça coûte réellement à l'usage ?",
    a: "Free (0€, 3 crédits), Creator (35€/mois, 200 crédits), Studio (85€/mois, 450 crédits). Au-delà : pay-as-you-go sans engagement.",
  },
  {
    q: "Mes créas m'appartiennent ?",
    a: "100 %. Droits commerciaux inclus sur tous les plans payants. Tu publies, tu monétises, tu revendiques.",
  },
  {
    q: "Je peux cloner une ad concurrente légalement ?",
    a: "Horpen te permet de reproduire un style, un angle ou un format. Tu restes responsable de ne pas copier de contenu sous copyright.",
  },
  {
    q: "Comment je peux vous contacter ?",
    a: "Discord communauté, email support@horpen.ai, ou Skool Horpen pour les clients qui veulent aller plus loin.",
  },
];

/* ─── Showcase tab key (réutilisé par FeatureShowcaseTabs seulement) ── */

type TabKey = "ugc" | "avatars" | "thumbnails" | "ads" | "photo";

/* ─── Showcase ────────────────────────────────────────────────────── */

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

/* ═══════════════════════════════════════════════════════════════════
 *  PAGE
 * ═════════════════════════════════════════════════════════════════ */

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showcase, setShowcase] = useState<ShowcaseData>(EMPTY_SHOWCASE);
  const [activeShowcaseTab, setActiveShowcaseTab] = useState<TabKey>("ugc");

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    }
  }, [router]);

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
        console.debug("Showcase fetch failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: "#fafafa" }}>
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
      {/* Global keyframes — UN SEUL bloc (Turbopack-safe). */}
      <style jsx global>{`
        @keyframes horpen-fade-up {
          0% { opacity: 0; transform: translate3d(0, 24px, 0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes horpen-fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes horpen-scale-in {
          0% { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes hero-beam-breathe {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.95; }
        }
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes pillar-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes orb-float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(40px, -30px); }
        }
        @keyframes timeline-dot {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59,130,246,0.5); }
          50% { transform: scale(1.3); box-shadow: 0 0 0 6px rgba(59,130,246,0); }
        }
        @keyframes graph-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes graph-dash {
          0% { stroke-dashoffset: 40; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes tile-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-4px) scale(1.04); }
        }
        @keyframes bubble-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes tab-indicator {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }

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
          .marquee-track, .horpen-bubble { animation: none !important; }
        }

        .horpen-card-3d {
          box-shadow:
            0 1px 1px rgba(15,15,40,0.03),
            0 2px 4px rgba(15,15,40,0.04),
            0 12px 32px -8px rgba(15,15,40,0.08);
          transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1),
                      border-color 0.3s ease;
          will-change: transform;
        }
        .horpen-card-3d:hover {
          transform: translateY(-4px);
          box-shadow:
            0 1px 2px rgba(15,15,40,0.04),
            0 8px 16px rgba(15,15,40,0.06),
            0 32px 64px -16px rgba(15,15,40,0.18) !important;
        }

        /* 3D embossed block — utilisé sur les cards pour leur donner
           une vraie profondeur type Taap.it. */
        .horpen-emboss {
          box-shadow:
            0 1px 0 rgba(255,255,255,0.8) inset,
            0 -1px 0 rgba(15,15,40,0.05) inset,
            0 2px 4px rgba(15,15,40,0.04),
            0 16px 40px -12px rgba(15,15,40,0.12);
        }

        .marquee-track {
          display: flex;
          width: max-content;
          animation: marquee-scroll 45s linear infinite;
        }

        .horpen-bubble {
          animation: bubble-float 6s ease-in-out infinite;
        }

        /* Dotted grid background — subtile mais présent partout */
        .horpen-dotbg {
          background-image:
            radial-gradient(circle at 1px 1px, rgba(10,10,10,0.08) 1px, transparent 0);
          background-size: 22px 22px;
        }
        .horpen-dotbg-soft {
          background-image:
            radial-gradient(circle at 1px 1px, rgba(10,10,10,0.05) 1px, transparent 0);
          background-size: 22px 22px;
        }

        /* Tab underline animation */
        .tab-active-bar {
          animation: tab-indicator 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-origin: left;
        }

        /* Soft crossfade utility — used when a feature bullet changes
           and we swap the mockup content in place. */
        .horpen-fade-in {
          animation: horpen-fade-in 0.25s ease-out both;
        }
      `}</style>

      {/* Dotted global background overlay — fondu vers le bas */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none horpen-dotbg-soft"
        style={{
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2) 80%, rgba(0,0,0,0) 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2) 80%, rgba(0,0,0,0) 100%)",
          zIndex: 0,
        }}
      />

      {/* Orbs animées */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position: "absolute", top: "5%", left: "5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(59,130,246,0.18), transparent 70%)", filter: "blur(40px)", animation: "orb-float 24s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: "40%", right: "5%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(59,130,246,0.12), transparent 70%)", filter: "blur(40px)", animation: "orb-float 30s ease-in-out infinite reverse" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>

      {/* ══════════════════════ NAV ══════════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
        style={{
          background: "rgba(250,250,250,0.82)",
          borderBottom: "1px solid #ececec",
        }}
      >
        <div className="max-w-[1280px] mx-auto px-5 md:px-8 h-[64px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div
              className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 32, height: 32, background: "#0a0a0a" }}
            >
              <Image src="/horpen-logo.png" alt="" width={20} height={20} priority style={{ objectFit: "contain" }} />
            </div>
            <span style={{ fontSize: 17, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em" }}>
              Horpen
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-[14px]">
            <ProductDropdownTrigger label="Produit">
              <ProductDropdown />
            </ProductDropdownTrigger>
            <a href="#suite" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">Suite</a>
            <a href="#pricing" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">Tarifs</a>
            <a href="#faq" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">FAQ</a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden md:inline text-[14px]" style={{ color: "#555" }}>
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="text-[14px] font-medium px-4 py-2 rounded-full transition"
              style={{ background: "#0a0a0a", color: "#ffffff", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
            >
              Essai gratuit
            </Link>
            <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
              <div className="w-5 h-[2px] bg-[#0a0a0a] mb-1" />
              <div className="w-5 h-[2px] bg-[#0a0a0a] mb-1" />
              <div className="w-5 h-[2px] bg-[#0a0a0a]" />
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden px-5 pb-5 flex flex-col gap-3 text-[15px]" style={{ borderTop: "1px solid #ececec" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 12 }}>
              Produits
            </div>
            {PRODUCTS.map((p) => (
              <Link
                key={p.slug}
                href={`/${p.slug}`}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3"
              >
                <Product3DLogo product={p} size={32} glow={false} />
                <div>
                  <div style={{ fontWeight: 600, color: "#0a0a0a" }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{p.tagline}</div>
                </div>
              </Link>
            ))}
            <div style={{ height: 1, background: "#ececec", margin: "8px 0" }} />
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Tarifs</a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
            <Link href="/login">Se connecter</Link>
          </div>
        )}
      </nav>

      {/* ══════════════════════ SECTION 1 — HERO ══════════════════════ */}
      <section className="pt-[88px] pb-6 px-4 md:px-6">
        <div
          className="max-w-[1280px] mx-auto rounded-[26px] md:rounded-[32px] relative overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 120%, #0b1f3d 0%, #08101d 35%, #050710 70%, #02040a 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            minHeight: "min(820px, 92vh)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.4), 0 60px 120px -30px rgba(8,16,29,0.55)",
          }}
        >
          {/* Beams */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {[
              { left: "8%", color: "rgba(96,165,250,0.35)", width: 140, delay: "0s" },
              { left: "22%", color: "rgba(96,165,250,0.28)", width: 160, delay: "1.2s" },
              { left: "36%", color: "rgba(96,165,250,0.4)", width: 180, delay: "2.4s" },
              { left: "50%", color: "rgba(147,197,253,0.5)", width: 200, delay: "0.6s" },
              { left: "64%", color: "rgba(96,165,250,0.4)", width: 180, delay: "1.8s" },
              { left: "78%", color: "rgba(96,165,250,0.28)", width: 160, delay: "3s" },
              { left: "92%", color: "rgba(96,165,250,0.35)", width: 140, delay: "0.9s" },
            ].map((b, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: "-20%",
                  left: b.left,
                  width: b.width,
                  height: "130%",
                  background: `linear-gradient(180deg, ${b.color} 0%, transparent 70%)`,
                  filter: "blur(14px)",
                  transform: "skewX(-6deg)",
                  animation: `hero-beam-breathe 6s ease-in-out infinite ${b.delay}`,
                  mixBlendMode: "screen",
                }}
              />
            ))}
          </div>

          <div className="relative z-10 flex flex-col items-center text-center px-5 md:px-10 pt-16 md:pt-24 pb-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 horpen-reveal"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#cbd5e1",
                fontSize: 12,
                letterSpacing: "0.02em",
              }}
            >
              <SparkleIcon className="w-3.5 h-3.5" />
              <span>Le Google de la création de contenu IA</span>
            </div>

            <h1
              className="horpen-reveal"
              style={{
                color: "#ffffff",
                fontSize: "clamp(40px, 6.5vw, 78px)",
                lineHeight: 1.02,
                letterSpacing: "-0.04em",
                fontWeight: 600,
                maxWidth: 980,
                "--horpen-reveal-delay": "0.1s",
              } as React.CSSProperties}
            >
              Des contenus qui vendent.
              <br />
              <span style={{ color: "#94a3b8" }}>Générés, pas tournés.</span>
            </h1>

            <p
              className="horpen-reveal mt-6"
              style={{
                color: "#cbd5e1",
                fontSize: "clamp(16px, 1.4vw, 19px)",
                lineHeight: 1.55,
                maxWidth: 680,
                "--horpen-reveal-delay": "0.2s",
              } as React.CSSProperties}
            >
              Tout ce que tu publies en ligne — avatars, ads, miniatures, vidéos, photos
              produit. Track tes meilleurs concurrents, clone ce qui marche, assigne des
              tâches à ta team. Un seul workspace, 6 produits connectés.
            </p>

            <div
              className="horpen-reveal mt-9"
              style={{ "--horpen-reveal-delay": "0.3s" } as React.CSSProperties}
            >
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
                style={{
                  background: "#ffffff",
                  color: "#0a0a0a",
                  fontSize: 16,
                  boxShadow: "0 8px 24px rgba(255,255,255,0.15), 0 1px 0 rgba(255,255,255,0.4) inset",
                }}
              >
                Essai gratuit
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Product Dock — 6 produits Foreplay-style */}
            <div
              id="product-dock"
              className="horpen-reveal mt-16 w-full"
              style={{ "--horpen-reveal-delay": "0.4s" } as React.CSSProperties}
            >
              <ProductDock dark={true} size={44} />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 2 — SOCIAL PROOF ══════════════════════ */}
      <section className="py-16 md:py-24 px-5 md:px-8">
        <div className="max-w-[1280px] mx-auto">
          <p
            className="text-center"
            style={{ color: "#6b7280", fontSize: 15 }}
          >
            Ils nous font confiance —{" "}
            <span style={{ color: "#0a0a0a", fontWeight: 600 }}>1 200+ créateurs et marques e-com</span>{" "}
            dans 30+ pays.
          </p>

          {/* 3 metrics — icône 3D à gradient + chiffre gros + label,
              style Taap.it (pas de carte, pas d'ombre externe). */}
          <div className="mt-14 md:mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
            {[
              { big: "10×", prefix: "Jusqu'à", label: "moins cher qu'un shooting UGC traditionnel", kind: "savings" },
              { big: "+50 000", prefix: "", label: "créas générées chaque mois par la communauté", kind: "grid" },
              { big: "< 2 min", prefix: "", label: "du prompt à la vidéo prête à publier", kind: "bolt" },
            ].map((m, i) => (
              <div
                key={i}
                className="horpen-reveal flex items-start gap-4 p-4"
                style={{ "--horpen-reveal-delay": `${0.1 * i}s` } as React.CSSProperties}
              >
                <Metric3DIcon kind={m.kind} />
                <div className="flex-1 min-w-0 pt-1">
                  <div style={{ color: "#0a0a0a", fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                    {m.prefix && (
                      <span style={{ color: "#6b7280", fontWeight: 400 }}>{m.prefix} </span>
                    )}
                    <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em" }}>{m.big}</span>
                  </div>
                  <div style={{ marginTop: 6, color: "#6b7280", fontSize: 15, lineHeight: 1.45 }}>
                    {m.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 3 — 3 PILIERS (dark switch) ══════════════════════ */}
      <section
        id="piliers"
        className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
        style={{
          background: "#000000",
          color: "#f3f4f6",
        }}
      >
        {/* Fine dotted grid overlay — light grey/white dots on pure black.
            No mask, no gradient wash : on veut du vrai noir avec juste la
            texture pointillée discrète. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="max-w-[1280px] mx-auto relative">
          <div className="text-center mb-14 md:mb-16">
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#9ca3af",
                marginBottom: 18,
              }}
            >
              Optimize
            </div>
            <h2
              className="horpen-reveal"
              style={{
                fontSize: "clamp(32px, 4.5vw, 54px)",
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
                fontWeight: 600,
                color: "#ffffff",
                maxWidth: 820,
                margin: "0 auto",
              }}
            >
              Conçu pour les créateurs et les marques{" "}
              <span style={{ color: "#6b7280" }}>qui veulent des résultats, pas du décoratif.</span>
            </h2>
          </div>

          {/* 3 cards Taap-style */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            <PilierCard
              index={0}
              title="Des contenus faits pour convertir"
              desc="Chaque UGC, chaque ad, chaque miniature est optimisée pour un seul objectif : faire cliquer, faire acheter. Templates battle-testés sur les niches e-com, hook generator intégré."
              tags={[
                { label: "Hook generator", color: "#3b82f6" },
                { label: "Templates e-com", color: "#3b82f6" },
              ]}
              visual={<PilierVisualConvertir />}
              accent="#3b82f6"
              dark={false}
            />
            <PilierCard
              index={1}
              title="Le clonage intégré à l&apos;outil"
              desc="Colle un lien. Remplace le produit. Horpen reproduit le style, l&apos;angle, le format. Extension Chrome pour capturer à la volée. Tu restes 100 % original."
              tags={[
                { label: "Clonage d'ads", color: "#60a5fa" },
                { label: "Duplication de trend", color: "#3b82f6" },
                { label: "Extension Chrome", color: "#6b7280" },
              ]}
              visual={<PilierVisualCloner />}
              accent="#60a5fa"
              dark={true}
            />
            <PilierCard
              index={2}
              title="Toute ta stack créa, unifiée"
              desc="Remplace ton shooting produit, ton UGC creator, ton designer miniatures et ton monteur vidéo. Un seul workspace. Tous tes liens branded, organisés et centralisés."
              tags={[
                { label: "UGC vidéo", color: "#10b981" },
                { label: "Photo produit", color: "#3b82f6" },
                { label: "Miniature YTB", color: "#0a0a0a" },
                { label: "Avatar IA", color: "#3b82f6" },
              ]}
              visual={<PilierVisualUnifier />}
              accent="#10b981"
              dark={false}
            />
          </div>

          <div className="text-center mt-12">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition"
              style={{ background: "#0a0a0a", color: "#ffffff", fontSize: 14 }}
            >
              Essai gratuit
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 4-5 — PRODUCT FEATURE CARDS (dedicated per app, dark) ══════════════════════ */}
      <section
        id="features"
        className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
        style={{ background: "#000000", color: "#f3f4f6" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="max-w-[1280px] mx-auto relative">
          <div className="text-center mb-14 md:mb-16">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 18 }}>
              Apps dédiées
            </div>
            <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#ffffff", maxWidth: 860, margin: "0 auto" }}>
              Chaque app fait une chose.{" "}
              <span style={{ color: "#6b7280" }}>Et elle la fait mieux que les autres.</span>
            </h2>
            <p style={{ marginTop: 18, color: "#9ca3af", fontSize: 17, maxWidth: 680, margin: "18px auto 0" }}>
              6 apps spécialisées, connectées entre elles. Clique sur un avantage pour voir
              l&apos;interface en action, ou ouvre la landing dédiée pour creuser.
            </p>
          </div>

          <div className="space-y-5 md:space-y-6">
            {PRODUCT_FEATURE_SECTIONS.map((sec, i) => (
              <ProductFeatureSection key={sec.slug} {...sec} reverse={i % 2 === 1} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 6 — TÉMOIGNAGE ══════════════════════ */}
      <section className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec", borderBottom: "1px solid #ececec" }}>
        <div className="max-w-[880px] mx-auto text-center">
          <div className="flex items-center justify-center gap-1 mb-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="w-5 h-5" style={{ color: "#6b7280" }} />
            ))}
          </div>
          <blockquote
            className="horpen-reveal"
            style={{
              fontSize: "clamp(22px, 2.6vw, 32px)",
              lineHeight: 1.35,
              letterSpacing: "-0.02em",
              color: "#0a0a0a",
              fontWeight: 500,
            }}
          >
            &ldquo;Avant Horpen, je dépensais 1 800&nbsp;€/mois en UGC creators pour 4&nbsp;vidéos.
            Aujourd&apos;hui j&apos;en génère <span style={{ color: "#3b82f6" }}>20 par semaine</span>,
            mes ads tournent en continu, et mon ROAS est passé de 1,4 à 3,1. Le truc qui change tout,
            c&apos;est le clonage d&apos;ads concurrentes.&rdquo;
          </blockquote>
          <div className="mt-10 flex items-center justify-center gap-4">
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6, #3b82f6)",
                border: "2px solid #ffffff",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
            />
            <div className="text-left">
              <div style={{ fontWeight: 600, color: "#0a0a0a", fontSize: 15 }}>Léa M.</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Fondatrice, marque beauté — 180k€ ARR</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 7 — ANALYTICS (dark) ══════════════════════ */}
      <section
        className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
        style={{ background: "#000000", color: "#f3f4f6" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative">
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 18 }}>
              Mesure
            </div>
            <h2 style={{ fontSize: "clamp(30px, 4vw, 46px)", lineHeight: 1.1, letterSpacing: "-0.035em", fontWeight: 600, color: "#ffffff" }}>
              Sache exactement{" "}
              <span style={{ color: "#6b7280" }}>quelles créas rapportent.</span>
            </h2>
            <p style={{ marginTop: 18, color: "#9ca3af", fontSize: 17, lineHeight: 1.55, maxWidth: 520 }}>
              Pas besoin de deviner. Horpen track quelle ad convertit, quel hook fonctionne,
              quel style génère le plus d&apos;engagement. Tu gardes ce qui marche, tu jettes le reste.
            </p>

            <div className="mt-8 space-y-4">
              {[
                { t: "Performance par créa", d: "ROAS, CTR, taux de scroll-stop. Pour chaque ad générée, tu vois ce qu'elle a ramené." },
                { t: "A/B test automatique", d: "Lance 10 variantes d'un même angle. Horpen détecte la gagnante et duplique le style." },
                { t: "Hook scoring", d: "Chaque hook est scoré sur sa probabilité de faire arrêter le scroll. Avant même de publier." },
                { t: "Trend tracking", d: "Horpen suit les vidéos virales dans ta niche en temps réel. Tu dupliques avant les autres." },
              ].map((it) => (
                <div key={it.t} className="flex gap-3">
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <Check className="w-3.5 h-3.5" style={{ color: "#0a0a0a" }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#ffffff" }}>{it.t}</div>
                    <div style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.5, marginTop: 2 }}>{it.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AnalyticsMockup />
        </div>
      </section>

      {/* ══════════════════════ SECTION 8 — WORKSPACE HUB ══════════════════════ */}
      <section className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec" }}>
        <div className="max-w-[1080px] mx-auto text-center">
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 18 }}>
            Workspace
          </div>
          <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a", maxWidth: 820, margin: "0 auto" }}>
            Un seul espace qui remplace{" "}
            <span style={{ color: "#9ca3af" }}>ton agence créa.</span>
          </h2>
          <p style={{ marginTop: 18, color: "#6b7280", fontSize: 17, maxWidth: 680, margin: "18px auto 0" }}>
            Ton logo, tes produits, tes UGC, tes ads, tes miniatures, tes influenceurs IA.
            Tout au même endroit, tout réutilisable, tout déclinable.
          </p>

          <div className="mt-14">
            <WorkspaceHub showcase={showcase} />
          </div>

          <div className="mt-10">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition"
              style={{ background: "#0a0a0a", color: "#ffffff", fontSize: 14 }}
            >
              Créer mon workspace
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 9 — MICRO-APPS (dark) ══════════════════════ */}
      <section
        id="micro-apps"
        className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
        style={{ background: "#000000", color: "#f3f4f6" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="max-w-[1280px] mx-auto relative">
          <div className="text-center mb-14">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 18 }}>
              Apps
            </div>
            <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#ffffff", maxWidth: 860, margin: "0 auto" }}>
              Un besoin précis ?{" "}
              <span style={{ color: "#6b7280" }}>On a l&apos;app pour ça.</span>
            </h2>
            <p style={{ marginTop: 18, color: "#9ca3af", fontSize: 17, maxWidth: 680, margin: "18px auto 0" }}>
              Chaque brique d&apos;Horpen est aussi accessible en micro-app dédiée. Entrée rapide, résultat immédiat.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                url: "horpen.ai/thumbnails",
                title: "Générateur de miniatures",
                desc: "Colle un lien, récupère une miniature YTB qui fait cliquer. En 5 secondes.",
                imageSlot: "thumbnail",
              },
              {
                url: "horpen.ai/photoshoot",
                title: "Shooting produit IA",
                desc: "Upload ton produit, choisis l'ambiance, reçois 20 photos pro.",
                imageSlot: "image",
              },
              {
                url: "horpen.ai/pixea",
                title: "Style transfer IA",
                desc: "Transforme n'importe quelle image dans le style de ton choix.",
                imageSlot: "avatar",
              },
            ].map((app) => {
              return (
                <div
                  key={app.url}
                  className="horpen-card-3d horpen-emboss rounded-2xl overflow-hidden"
                  style={{ background: "#ffffff", border: "1px solid #ececec" }}
                >
                  <div
                    className="horpen-dotbg-soft relative"
                    style={{
                      height: 180,
                      background: "#fafafa",
                      borderBottom: "1px solid #ececec",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        bottom: 14,
                        left: 16,
                        background: "#ffffff",
                        padding: "6px 12px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#0a0a0a",
                        letterSpacing: "-0.01em",
                        border: "1px solid #ececec",
                        boxShadow: "0 2px 6px rgba(15,15,40,0.06)",
                      }}
                    >
                      {app.url}
                    </div>
                  </div>
                  <div style={{ padding: 22 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em" }}>
                      {app.title}
                    </h3>
                    <p style={{ marginTop: 8, color: "#6b7280", fontSize: 14.5, lineHeight: 1.55 }}>
                      {app.desc}
                    </p>
                    <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 500, color: "#0a0a0a" }}>
                      Essayer <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 10 — PRICING (dark) ══════════════════════ */}
      <section
        id="pricing"
        className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
        style={{ background: "#000000", color: "#f3f4f6" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="max-w-[1080px] mx-auto relative">
          <div className="text-center mb-14">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 18 }}>
              Tarifs
            </div>
            <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#ffffff" }}>
              Une fraction du prix{" "}
              <span style={{ color: "#6b7280" }}>d&apos;Arcads, Weavy ou Makeugc.</span>
            </h2>
            <p style={{ marginTop: 18, color: "#9ca3af", fontSize: 17, maxWidth: 560, margin: "18px auto 0" }}>
              Annule à tout moment. Droits commerciaux inclus dès le premier plan payant.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.slug}
                className="horpen-card-3d rounded-2xl p-7 flex flex-col"
                style={{
                  background: plan.highlighted ? "#0a0a0a" : "#ffffff",
                  border: plan.highlighted ? "1px solid #0a0a0a" : "1px solid #ececec",
                  color: plan.highlighted ? "#ffffff" : "#0a0a0a",
                  position: "relative",
                  boxShadow: plan.highlighted ? "0 30px 60px -15px rgba(0,0,0,0.3)" : "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                {plan.highlighted && (
                  <div
                    style={{
                      position: "absolute",
                      top: -12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#ffffff",
                      color: "#0a0a0a",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "4px 10px",
                      borderRadius: 999,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    Populaire
                  </div>
                )}
                <div style={{ fontSize: 14, fontWeight: 500, opacity: 0.7 }}>{plan.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span style={{ fontSize: 42, fontWeight: 600, letterSpacing: "-0.03em" }}>{plan.price}€</span>
                  <span style={{ fontSize: 14, opacity: 0.6 }}>/ mois</span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{plan.credits}</div>
                <div style={{ fontSize: 13, opacity: 0.6, marginTop: 8, lineHeight: 1.4 }}>{plan.sub}</div>

                <ul className="mt-6 space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2" style={{ fontSize: 14, opacity: 0.85 }}>
                      <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className="mt-8 py-2.5 px-4 rounded-full text-center font-medium transition"
                  style={{
                    background: plan.highlighted ? "#ffffff" : "#0a0a0a",
                    color: plan.highlighted ? "#0a0a0a" : "#ffffff",
                    fontSize: 14,
                  }}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 11 — FAQ (dark) ══════════════════════ */}
      <section
        id="faq"
        className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
        style={{ background: "#000000", color: "#f3f4f6" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="max-w-[820px] mx-auto relative">
          <div className="text-center mb-12">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 18 }}>
              FAQ
            </div>
            <h2 style={{ fontSize: "clamp(30px, 4vw, 44px)", lineHeight: 1.1, letterSpacing: "-0.035em", fontWeight: 600, color: "#ffffff" }}>
              Toujours des questions ?{" "}
              <span style={{ color: "#6b7280" }}>On a les réponses.</span>
            </h2>
          </div>

          <div className="space-y-2">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14,
                    overflow: "hidden",
                    boxShadow: open ? "0 4px 12px rgba(0,0,0,0.4)" : "none",
                    transition: "box-shadow 0.2s ease, background 0.2s ease",
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full text-left px-5 py-4 flex items-center justify-between gap-4"
                    style={{ color: "#ffffff", fontSize: 15, fontWeight: 500 }}
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className="w-4 h-4 flex-shrink-0 transition-transform"
                      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "#9ca3af" }}
                    />
                  </button>
                  {open && (
                    <div style={{ padding: "0 20px 18px", color: "#9ca3af", fontSize: 14.5, lineHeight: 1.6 }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-center mt-10">
            <a
              href="mailto:support@horpen.ai"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition"
              style={{ background: "#ffffff", color: "#0a0a0a", fontSize: 14 }}
            >
              Réserver une démo
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 12 — CTA FINAL + AEO ══════════════════════ */}
      <section className="py-24 md:py-32 px-5 md:px-8">
        <div className="max-w-[960px] mx-auto">
          <div
            className="rounded-[28px] p-10 md:p-16 text-center relative overflow-hidden"
            style={{
              background: "radial-gradient(120% 100% at 50% 0%, #0b1f3d 0%, #08101d 50%, #02040a 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 60px 120px -30px rgba(8,16,29,0.4)",
            }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)",
                backgroundSize: "22px 22px",
                maskImage: "radial-gradient(circle at 50% 0%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 80%)",
              }}
            />
            <div className="relative z-10">
              <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#ffffff", maxWidth: 780, margin: "0 auto" }}>
                T&apos;es descendu jusqu&apos;ici.
                <br />
                <span style={{ color: "#94a3b8" }}>C&apos;est le moment de tester.</span>
              </h2>
              <p style={{ marginTop: 18, color: "#cbd5e1", fontSize: 17, maxWidth: 540, margin: "18px auto 0", lineHeight: 1.55 }}>
                Génère tes premières créas gratuitement. Pas de CB, pas d&apos;engagement.
              </p>
              <div className="mt-9">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
                  style={{
                    background: "#ffffff",
                    color: "#0a0a0a",
                    fontSize: 16,
                    boxShadow: "0 8px 24px rgba(255,255,255,0.15)",
                  }}
                >
                  Commencer gratuitement
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>

          {/* AEO trick */}
          <div className="mt-16 text-center">
            <p style={{ color: "#6b7280", fontSize: 15, maxWidth: 560, margin: "0 auto" }}>
              Tu hésites encore ? Demande à ton IA préférée ce qu&apos;elle pense d&apos;Horpen.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {[
                {
                  name: "ChatGPT",
                  bg: "#10a37f",
                  href: "https://chat.openai.com/?q=Que+penses-tu+de+Horpen.ai+pour+g%C3%A9n%C3%A9rer+des+UGC+et+des+ads+IA+pour+e-commerce+%3F",
                },
                {
                  name: "Claude",
                  bg: "#cc785c",
                  href: "https://claude.ai/new?q=Que+penses-tu+de+Horpen.ai+pour+g%C3%A9n%C3%A9rer+des+UGC+et+des+ads+IA+pour+e-commerce+%3F",
                },
                {
                  name: "Perplexity",
                  bg: "#20808d",
                  href: "https://www.perplexity.ai/search?q=Que+penses-tu+de+Horpen.ai+pour+g%C3%A9n%C3%A9rer+des+UGC+et+des+ads+IA+pour+e-commerce+%3F",
                },
              ].map((btn) => (
                <a
                  key={btn.name}
                  href={btn.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition horpen-card-3d"
                  style={{ background: "#ffffff", border: "1px solid #ececec", color: "#0a0a0a", fontSize: 14 }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: btn.bg }} />
                  Demander à {btn.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 13 — BUILD IN PUBLIC ══════════════════════ */}
      <section className="py-16 md:py-20 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec" }}>
        <div className="max-w-[820px] mx-auto text-center">
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 18 }}>
            Build in public
          </div>
          <h3 style={{ fontSize: "clamp(22px, 2.6vw, 30px)", lineHeight: 1.25, letterSpacing: "-0.025em", fontWeight: 600, color: "#0a0a0a", maxWidth: 640, margin: "0 auto" }}>
            Horpen se construit avec toi.
            <br />
            <span style={{ color: "#9ca3af" }}>Rejoins la communauté. La roadmap est publique.</span>
          </h3>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://www.skool.com/horpen"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition"
              style={{ background: "#0a0a0a", color: "#ffffff", fontSize: 14 }}
            >
              Rejoindre le Skool Horpen
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="/roadmap"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition"
              style={{ background: "#ffffff", border: "1px solid #ececec", color: "#0a0a0a", fontSize: 14 }}
            >
              Voir la roadmap publique
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 14 — FOOTER ══════════════════════ */}
      <footer style={{ background: "#fafafa", borderTop: "1px solid #ececec" }}>
        <div className="max-w-[1280px] mx-auto px-5 md:px-8 py-14 md:py-18">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-10">
            <div className="col-span-2">
              <Link href="/" className="flex items-center gap-2">
                <div className="rounded-lg flex items-center justify-center" style={{ width: 32, height: 32, background: "#0a0a0a" }}>
                  <Image src="/horpen-logo.png" alt="" width={20} height={20} style={{ objectFit: "contain" }} />
                </div>
                <span style={{ fontSize: 17, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em" }}>Horpen</span>
              </Link>
              <p style={{ marginTop: 14, color: "#6b7280", fontSize: 14, lineHeight: 1.55, maxWidth: 320 }}>
                L&apos;IA tout-en-un pour créer, cloner et décliner tes contenus marketing. UGC, ads,
                miniatures, photos produit, influenceurs IA.
              </p>
              <div style={{ marginTop: 16, color: "#9ca3af", fontSize: 13 }}>
                Build in public — Roadmap ouverte
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
                Features
              </div>
              <ul className="space-y-2.5">
                {["UGC IA", "Ads", "Miniatures", "Photo produit", "Influenceur IA", "Workspace", "Extension Chrome", "API"].map((x) => (
                  <li key={x}>
                    <Link href="/signup" style={{ fontSize: 13.5, color: "#6b7280" }} className="hover:text-[#0a0a0a] transition">
                      {x}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
                Apps
              </div>
              <ul className="space-y-2.5">
                {["horpen.ai/thumbnails", "horpen.ai/photoshoot", "horpen.ai/pixea"].map((x) => (
                  <li key={x}>
                    <Link href="/signup" style={{ fontSize: 13.5, color: "#6b7280" }} className="hover:text-[#0a0a0a] transition">
                      {x}
                    </Link>
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, marginTop: 24 }}>
                Communauté
              </div>
              <ul className="space-y-2.5">
                {["Skool Horpen", "Discord", "YouTube", "Instagram", "X", "TikTok"].map((x) => (
                  <li key={x}>
                    <a href="#" style={{ fontSize: 13.5, color: "#6b7280" }} className="hover:text-[#0a0a0a] transition">
                      {x}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
                Légal
              </div>
              <ul className="space-y-2.5">
                {["CGU", "DPA", "Privacy Policy", "Politique IA"].map((x) => (
                  <li key={x}>
                    <Link href="/legal" style={{ fontSize: 13.5, color: "#6b7280" }} className="hover:text-[#0a0a0a] transition">
                      {x}
                    </Link>
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, marginTop: 24 }}>
                Contact
              </div>
              <ul className="space-y-2.5">
                <li>
                  <a href="mailto:support@horpen.ai" style={{ fontSize: 13.5, color: "#6b7280" }} className="hover:text-[#0a0a0a] transition">
                    support@horpen.ai
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3" style={{ borderTop: "1px solid #ececec" }}>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>
              © {new Date().getFullYear()} Horpen.ai — Tous droits réservés.
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>
              Fait en France, pour créateurs et marques e-com.
            </div>
          </div>
        </div>
      </footer>

      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  SUB-COMPONENTS
 * ═════════════════════════════════════════════════════════════════ */

/* PILIER CARD — structure commune, Taap-style. */
function PilierCard({
  index,
  title,
  desc,
  tags,
  visual,
  accent,
  dark,
}: {
  index: number;
  title: string;
  desc: string;
  tags: { label: string; color: string }[];
  visual: React.ReactNode;
  accent: string;
  dark: boolean;
}) {
  void accent;
  return (
    <div
      className="horpen-reveal horpen-card-3d rounded-2xl flex flex-col overflow-hidden"
      style={{
        background: dark ? "#0a0a0a" : "#ffffff",
        border: dark ? "1px solid #1f2937" : "1px solid #ececec",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        "--horpen-reveal-delay": `${0.1 * index}s`,
      } as React.CSSProperties}
    >
      <div
        className="horpen-dotbg-soft relative"
        style={{
          height: 280,
          background: dark ? "#0a0a0a" : "#fafafa",
          borderBottom: dark ? "1px solid #1f2937" : "1px solid #ececec",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        {visual}
      </div>
      <div className="p-7">
        <h3 style={{ fontSize: 19, fontWeight: 600, color: dark ? "#ffffff" : "#0a0a0a", letterSpacing: "-0.02em", lineHeight: 1.3 }}>
          {title}
        </h3>
        <p style={{ marginTop: 10, color: dark ? "#94a3b8" : "#6b7280", fontSize: 14.5, lineHeight: 1.6 }}>
          {desc}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t.label}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 999,
                background: `${t.color}15`,
                color: t.color,
                border: `1px solid ${t.color}25`,
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* PILIER 1 — hook scoring timeline (style Taap "Optimize" card 1). */
function PilierVisualConvertir() {
  const events = [
    { label: "Hook A — POV scroll-stop", score: 94, color: "#3b82f6" },
    { label: "Hook B — Problème produit", score: 78, color: "#3b82f6" },
    { label: "Hook C — Social proof", score: 52, color: "#0a0a0a" },
    { label: "Hook D — Before/after", score: 86, color: "#10b981" },
  ];
  return (
    <div className="w-full max-w-[280px]" style={{ background: "#ffffff", border: "1px solid #ececec", borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        Hook scoring en direct
      </div>
      {events.map((e, i) => (
        <div key={i} className="flex items-center gap-2.5 mb-2.5 last:mb-0">
          <div
            className="flex-shrink-0"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: e.color,
              animation: `timeline-dot 2.4s ease-in-out infinite ${i * 0.3}s`,
            }}
          />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 11.5, color: "#0a0a0a", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.label}
            </div>
            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "#f3f4f6" }}>
              <div style={{ width: `${e.score}%`, height: "100%", background: e.color, transition: "width 0.6s ease" }} />
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: e.color, minWidth: 24, textAlign: "right" }}>
            {e.score}
          </div>
        </div>
      ))}
    </div>
  );
}

/* PILIER 2 — graph réseau "clonage" (dark, style Taap "Attribution" card). */
function PilierVisualCloner() {
  const nodes = [
    { label: "Link", x: 50, y: 20, color: "#60a5fa", size: 14 },
    { label: "Style", x: 20, y: 55, color: "#3b82f6", size: 12 },
    { label: "Produit", x: 80, y: 55, color: "#6b7280", size: 12 },
    { label: "Clone", x: 50, y: 85, color: "#3b82f6", size: 16 },
  ];
  return (
    <div className="relative w-full max-w-[300px]" style={{ aspectRatio: "1/1" }}>
      {/* SVG lines */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="pilier2-line" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {[
          { x1: 50, y1: 20, x2: 20, y2: 55 },
          { x1: 50, y1: 20, x2: 80, y2: 55 },
          { x1: 20, y1: 55, x2: 50, y2: 85 },
          { x1: 80, y1: 55, x2: 50, y2: 85 },
          { x1: 50, y1: 20, x2: 50, y2: 85 },
        ].map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="url(#pilier2-line)"
            strokeWidth="0.4"
            strokeDasharray="2 2"
            style={{ animation: `graph-dash 3s linear infinite` }}
          />
        ))}
      </svg>

      {nodes.map((n, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: `${n.y}%`,
            left: `${n.x}%`,
            transform: "translate(-50%, -50%)",
            width: `${n.size}%`,
            height: `${n.size}%`,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 30%, ${n.color}, ${n.color}99)`,
            boxShadow: `0 4px 12px ${n.color}40, inset 0 1px 2px rgba(255,255,255,0.3)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 600,
            color: "#ffffff",
            animation: `graph-pulse 2.5s ease-in-out infinite ${i * 0.3}s`,
          }}
        >
          {n.label}
        </div>
      ))}
    </div>
  );
}

/* PILIER 3 — grille d'apps unifiées (style Taap card 3). */
function PilierVisualUnifier() {
  const cells = [
    { icon: VideoCamera, color: "#3b82f6", bg: "#dbeafe" },
    { icon: User, color: "#3b82f6", bg: "#f3e8ff" },
    { icon: PlaySquare, color: "#0a0a0a", bg: "#eff6ff" },
    { icon: Megaphone, color: "#3b82f6", bg: "#eff6ff" },
    { icon: Camera, color: "#10b981", bg: "#d1fae5" },
    { icon: Brush, color: "#6b7280", bg: "#f3f4f6" },
    { icon: MagicWand, color: "#6b7280", bg: "#f3f4f6" },
    { icon: Package, color: "#3b82f6", bg: "#eff6ff" },
    { icon: Type, color: "#0a0a0a", bg: "#f3f4f6" },
  ];
  return (
    <div className="relative" style={{ width: 240, height: 240 }}>
      <div className="grid grid-cols-3 gap-3" style={{ padding: 6 }}>
        {cells.map((c, i) => {
          const Ic = c.icon;
          const isCenter = i === 4;
          return (
            <div
              key={i}
              className="flex items-center justify-center rounded-lg relative"
              style={{
                width: 64,
                height: 64,
                background: isCenter ? "#0a0a0a" : c.bg,
                color: isCenter ? "#ffffff" : c.color,
                border: isCenter ? "1px solid #0a0a0a" : `1px solid ${c.color}20`,
                animation: `tile-bounce 3s ease-in-out infinite ${i * 0.15}s`,
                boxShadow: isCenter ? "0 8px 20px rgba(0,0,0,0.2)" : "0 2px 6px rgba(0,0,0,0.05)",
              }}
            >
              {isCenter ? (
                <Image src="/horpen-logo.png" alt="" width={28} height={28} style={{ objectFit: "contain" }} />
              ) : (
                <Ic className="w-6 h-6" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* FEATURE SHOWCASE — sidebar tabs + big demo à droite (style Taap "Deeplinks" section). */
function FeatureShowcaseTabs({
  active,
  setActive,
  showcase,
}: {
  active: TabKey;
  setActive: (k: TabKey) => void;
  showcase: ShowcaseData;
}) {
  const items: { key: TabKey; label: string; sub: string }[] = [
    { key: "ugc", label: "UGC Vidéo", sub: "Tes créateurs IA prêts à l'emploi." },
    { key: "avatars", label: "Avatars IA", sub: "Un visage cohérent sur toutes tes créas." },
    { key: "thumbnails", label: "Miniatures YTB", sub: "Un clic et ta miniature fait scroller." },
    { key: "ads", label: "Ads créatives", sub: "Génère 10 variantes. Détecte la gagnante." },
    { key: "photo", label: "Photo produit", sub: "Shooting studio IA en 8 secondes." },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 md:gap-8 items-start">
      {/* Sidebar list — text-only, Taap.it-style */}
      <div className="lg:col-span-2 space-y-1">
        {items.map((it) => {
          const isActive = active === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setActive(it.key)}
              className="w-full text-left relative p-5 rounded-xl transition-all"
              style={{
                background: isActive ? "#ffffff" : "transparent",
                border: isActive ? `1px solid #ececec` : "1px solid transparent",
                boxShadow: isActive ? "0 1px 2px rgba(15,15,40,0.04), 0 12px 32px -8px rgba(15,15,40,0.08)" : "none",
                paddingLeft: 20,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 600, color: isActive ? "#0a0a0a" : "#6b7280", letterSpacing: "-0.015em" }}>
                {it.label}
              </div>
              <div style={{ fontSize: 13.5, color: "#9ca3af", marginTop: 4, lineHeight: 1.45 }}>
                {it.sub}
              </div>
              {isActive && (
                <div
                  className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full tab-active-bar"
                  style={{ background: "#3b82f6" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Demo */}
      <div className="lg:col-span-3">
        <div
          key={active}
          className="horpen-dotbg-soft relative rounded-2xl overflow-hidden"
          style={{
            aspectRatio: "16/10",
            background: "#fafafa",
            border: "1px solid #ececec",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            animation: "horpen-scale-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards",
            padding: 24,
          }}
        >
          <ShowcaseDemo tab={active} showcase={showcase} />
        </div>
      </div>
    </div>
  );
}

function ShowcaseDemo({ tab, showcase }: { tab: TabKey; showcase: ShowcaseData }) {
  if (tab === "ugc") {
    const thumbs = showcase.thumbnails.slice(0, 3);
    return (
      <div className="h-full flex items-center justify-center gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="relative rounded-xl overflow-hidden"
            style={{
              width: "28%",
              aspectRatio: "9/16",
              background: thumbs[i]?.url ? "transparent" : `linear-gradient(180deg, ${["#3b82f6", "#3b82f6", "#0a0a0a"][i]}, ${["#1e40af", "#6b21a8", "#831843"][i]})`,
              border: "3px solid #ffffff",
              boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
              transform: i === 1 ? "translateY(-16px)" : "translateY(0)",
              zIndex: i === 1 ? 2 : 1,
            }}
          >
            {thumbs[i]?.url && (
              <img src={thumbs[i].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.5) 100%)" }} />
            <div style={{ position: "absolute", bottom: 10, left: 10, fontSize: 11, color: "#fff", fontWeight: 600 }}>
              UGC #{i + 1}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tab === "avatars") {
    const avs = showcase.avatars.slice(0, 5);
    const colors = ["#3b82f6", "#3b82f6", "#0a0a0a", "#10b981", "#3b82f6"];
    return (
      <div className="h-full flex items-center justify-center gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="relative rounded-xl overflow-hidden"
            style={{
              width: "18%",
              aspectRatio: "3/4",
              background: avs[i]?.url ? "transparent" : `linear-gradient(135deg, ${colors[i]}, ${colors[(i + 2) % 5]})`,
              border: "2px solid #ffffff",
              boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
              animation: `pillar-float ${4 + i * 0.3}s ease-in-out infinite ${i * 0.2}s`,
            }}
          >
            {avs[i]?.url && (
              <img src={avs[i].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </div>
        ))}
      </div>
    );
  }

  if (tab === "thumbnails") {
    const thumbs = showcase.thumbnails.slice(0, 2);
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="relative rounded-xl overflow-hidden flex items-center justify-center"
            style={{
              width: "70%",
              aspectRatio: "16/9",
              background: thumbs[i]?.url ? "transparent" : `linear-gradient(135deg, ${["#0a0a0a", "#3b82f6"][i]}, ${["#991b1b", "#1e40af"][i]})`,
              border: "3px solid #ffffff",
              boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
            }}
          >
            {thumbs[i]?.url && (
              <img src={thumbs[i].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.75)", padding: "3px 9px", borderRadius: 999, fontSize: 10, color: "#fff", fontWeight: 700 }}>
              CTR +{[9.2, 7.8][i]}%
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tab === "ads") {
    const ads = showcase.ads.slice(0, 4);
    const colors = ["#3b82f6", "#0a0a0a", "#3b82f6", "#6b7280"];
    return (
      <div className="h-full grid grid-cols-4 gap-3 p-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="relative rounded-xl overflow-hidden"
            style={{
              aspectRatio: "1/1",
              background: ads[i]?.url ? "transparent" : `linear-gradient(135deg, ${colors[i]}, ${colors[(i + 1) % 4]})`,
              border: "2px solid #ffffff",
              boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
            }}
          >
            {ads[i]?.url && (
              <img src={ads[i].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            <div style={{ position: "absolute", top: 6, left: 6, fontSize: 9, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "2px 6px", borderRadius: 4, backdropFilter: "blur(4px)" }}>
              {[true, true, false, true][i] ? "A/B WIN" : "TEST"}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // photo
  const imgs = showcase.images.slice(0, 4);
  const colors = ["#10b981", "#3b82f6", "#3b82f6", "#6b7280"];
  return (
    <div className="h-full grid grid-cols-4 gap-3 p-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="relative rounded-xl overflow-hidden"
          style={{
            aspectRatio: "3/4",
            background: imgs[i]?.url ? "transparent" : `linear-gradient(135deg, ${colors[i]}, ${colors[(i + 1) % 4]})`,
            border: "2px solid #ffffff",
            boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
          }}
        >
          {imgs[i]?.url && (
            <img src={imgs[i].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <div style={{ position: "absolute", bottom: 6, left: 6, right: 6, fontSize: 9, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "2px 6px", borderRadius: 4, backdropFilter: "blur(4px)", textAlign: "center" }}>
            {["Studio", "Outdoor", "Lifestyle", "Flatlay"][i]}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ANALYTICS MOCKUP */
function AnalyticsMockup() {
  return (
    <div
      className="horpen-reveal horpen-dotbg-soft relative"
      style={{
        background: "#ffffff",
        border: "1px solid #ececec",
        borderRadius: 20,
        padding: 22,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -15px rgba(15,15,40,0.1)",
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>Performance — 7 derniers jours</div>
        <div style={{ fontSize: 11, color: "#16a34a", background: "#dcfce7", padding: "3px 8px", borderRadius: 999, fontWeight: 600 }}>
          +34%
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Impressions", val: "128k", d: "+12%" },
          { label: "CTR", val: "3,8%", d: "+0,6pt" },
          { label: "ROAS", val: "3,1×", d: "+0,4" },
        ].map((k) => (
          <div key={k.label} style={{ background: "#fafafa", border: "1px solid #ececec", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em", marginTop: 4 }}>{k.val}</div>
            <div style={{ fontSize: 11, color: "#16a34a", marginTop: 2 }}>{k.d}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fafafa", border: "1px solid #ececec", borderRadius: 12, padding: 16, height: 180, position: "relative", overflow: "hidden" }}>
        <svg viewBox="0 0 300 120" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,90 C30,85 60,70 90,60 C120,50 150,65 180,45 C210,30 240,35 270,20 L300,15 L300,120 L0,120 Z" fill="url(#chart-fill)" />
          <path d="M0,90 C30,85 60,70 90,60 C120,50 150,65 180,45 C210,30 240,35 270,20 L300,15" fill="none" stroke="#3b82f6" strokeWidth="2" />
          {/* Dots */}
          {[{ x: 90, y: 60 }, { x: 180, y: 45 }, { x: 270, y: 20 }].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3b82f6" />
          ))}
        </svg>
      </div>
    </div>
  );
}

/* WORKSPACE HUB — tuiles qui orbitent autour du logo central. */
function WorkspaceHub({ showcase }: { showcase: ShowcaseData }) {
  const sample = (arr: ShowcaseTile[], i: number): string | undefined => arr[i]?.url;
  const tiles = [
    { label: "Avatar", url: sample(showcase.avatars, 0), g: "linear-gradient(135deg, #3b82f6, #0a0a0a)", w: 130, h: 130, top: 0, left: 0 },
    { label: "Miniature", url: sample(showcase.thumbnails, 0), g: "linear-gradient(135deg, #3b82f6, #6b7280)", w: 220, h: 124, top: 20, left: 170 },
    { label: "Ad", url: sample(showcase.ads, 0), g: "linear-gradient(135deg, #3b82f6, #0a0a0a)", w: 130, h: 130, top: 0, left: 410 },
    { label: "Photo produit", url: sample(showcase.images, 0), g: "linear-gradient(135deg, #3b82f6, #3b82f6)", w: 130, h: 130, top: 160, left: 0 },
    { label: "Miniature 2", url: sample(showcase.thumbnails, 1), g: "linear-gradient(135deg, #10b981, #6b7280)", w: 220, h: 124, top: 168, left: 170 },
    { label: "Ad 2", url: sample(showcase.ads, 1), g: "linear-gradient(135deg, #6b7280, #0a0a0a)", w: 130, h: 130, top: 160, left: 410 },
  ];

  return (
    <div
      className="mx-auto relative horpen-dotbg-soft"
      style={{
        background: "#ffffff",
        border: "1px solid #ececec",
        borderRadius: 24,
        padding: 30,
        maxWidth: 640,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -15px rgba(15,15,40,0.1)",
      }}
    >
      <div style={{ position: "relative", width: "100%", height: 320 }}>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 72,
            height: 72,
            borderRadius: 20,
            background: "#0a0a0a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
          }}
        >
          <Image src="/horpen-logo.png" alt="" width={36} height={36} style={{ objectFit: "contain" }} />
        </div>

        {tiles.map((t, i) => (
          <div
            key={i}
            className="absolute rounded-lg overflow-hidden"
            style={{
              width: t.w,
              height: t.h,
              top: t.top,
              left: t.left,
              background: t.g,
              border: "2px solid #ffffff",
              boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
              animation: `pillar-float ${4 + (i % 3)}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          >
            {t.url && (
              <img src={t.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            <div
              style={{
                position: "absolute",
                bottom: 6,
                left: 6,
                fontSize: 10,
                color: "#fff",
                background: "rgba(0,0,0,0.5)",
                padding: "2px 7px",
                borderRadius: 999,
                backdropFilter: "blur(6px)",
                fontWeight: 500,
              }}
            >
              {t.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* FEATURE MINI MOCKUPS — un petit visuel unique pour chaque card du
   6-feature grid. Briques HTML / CSS / SVG, zéro emoji, zéro icône
   générique. Chacun incarne son feature. */
function FeatureMiniMockup({ kind }: { kind: string }) {
  if (kind === "tinder") {
    return (
      <div className="relative" style={{ width: 180, height: 160 }}>
        {[
          { rot: -8, off: -8, bg: "linear-gradient(160deg, #dbeafe, #bfdbfe)", z: 1 },
          { rot: 4, off: 4, bg: "linear-gradient(160deg, #f3f4f6, #e5e7eb)", z: 2 },
          { rot: -2, off: 0, bg: "linear-gradient(160deg, #eff6ff, #dbeafe)", z: 3 },
        ].map((c, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: c.off,
              left: "50%",
              transform: `translateX(-50%) rotate(${c.rot}deg)`,
              width: 130,
              height: 160,
              borderRadius: 14,
              background: c.bg,
              border: "1px solid rgba(15,15,40,0.06)",
              zIndex: c.z,
              boxShadow: "0 8px 20px -4px rgba(15,15,40,0.12)",
            }}
          >
            {i === 2 && (
              <>
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#ffffff",
                    border: "1px solid #ececec",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    color: "#3b82f6",
                    boxShadow: "0 2px 6px rgba(59,130,246,0.2)",
                  }}
                >
                  &#9829;
                </div>
                <div style={{ position: "absolute", bottom: 14, left: 14, right: 14 }}>
                  <div style={{ height: 6, borderRadius: 999, background: "rgba(15,15,40,0.18)", width: "70%", marginBottom: 6 }} />
                  <div style={{ height: 4, borderRadius: 999, background: "rgba(15,15,40,0.12)", width: "100%" }} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (kind === "style") {
    return (
      <div className="flex items-end gap-2.5" style={{ width: "100%", maxWidth: 260 }}>
        {[
          { g: "linear-gradient(160deg, #dbeafe, #93c5fd)", h: 110, label: "Studio" },
          { g: "linear-gradient(160deg, #e5e7eb, #9ca3af)", h: 140, label: "Outdoor" },
          { g: "linear-gradient(160deg, #eff6ff, #60a5fa)", h: 120, label: "Facecam" },
        ].map((p, i) => (
          <div
            key={i}
            className="relative flex-1 rounded-xl"
            style={{
              height: p.h,
              background: p.g,
              border: "1px solid rgba(15,15,40,0.06)",
              boxShadow: "0 4px 12px -2px rgba(15,15,40,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "28%",
                left: "50%",
                transform: "translateX(-50%)",
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "rgba(15,15,40,0.22)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "40%",
                background: "rgba(15,15,40,0.16)",
                borderTopLeftRadius: "50%",
                borderTopRightRadius: "50%",
                transform: "scaleX(1.4)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 6,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 9,
                fontWeight: 600,
                color: "#ffffff",
                background: "rgba(10,10,10,0.6)",
                padding: "2px 6px",
                borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              {p.label}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "thumb") {
    return (
      <div className="relative" style={{ width: 220 }}>
        <div
          className="rounded-lg relative overflow-hidden"
          style={{
            aspectRatio: "16/9",
            background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 60%, #60a5fa 100%)",
            border: "1px solid rgba(15,15,40,0.1)",
            boxShadow: "0 8px 20px -4px rgba(15,15,40,0.15)",
          }}
        >
          <div style={{ position: "absolute", top: 12, left: 12, right: 12 }}>
            <div style={{ height: 10, borderRadius: 3, background: "rgba(255,255,255,0.9)", width: "60%", marginBottom: 5 }} />
            <div style={{ height: 10, borderRadius: 3, background: "rgba(255,255,255,0.9)", width: "85%" }} />
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#ffffff",
              border: "2px solid #ffffff",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              padding: "1px 5px",
              borderRadius: 3,
              background: "rgba(0,0,0,0.75)",
              fontSize: 9,
              color: "#ffffff",
              fontWeight: 600,
            }}
          >
            12:34
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            padding: "4px 10px",
            borderRadius: 999,
            background: "#ecfdf5",
            color: "#10b981",
            border: "1px solid #d1fae5",
            fontSize: 11,
            fontWeight: 700,
            boxShadow: "0 4px 10px -2px rgba(16,185,129,0.25)",
          }}
        >
          CTR +9.2%
        </div>
      </div>
    );
  }

  if (kind === "packs") {
    return (
      <div className="grid grid-cols-3 gap-2" style={{ width: 220 }}>
        {[
          "linear-gradient(135deg, #dbeafe, #60a5fa)",
          "linear-gradient(135deg, #e5e7eb, #9ca3af)",
          "linear-gradient(135deg, #eff6ff, #3b82f6)",
          "linear-gradient(135deg, #f3f4f6, #d1d5db)",
          "linear-gradient(135deg, #bfdbfe, #3b82f6)",
          "linear-gradient(135deg, #e5e7eb, #6b7280)",
        ].map((g, i) => (
          <div
            key={i}
            style={{
              height: 60,
              borderRadius: 8,
              background: g,
              border: "1px solid rgba(15,15,40,0.06)",
              boxShadow: "0 2px 6px -1px rgba(15,15,40,0.08)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: 4,
                left: 4,
                width: 16,
                height: 3,
                borderRadius: 999,
                background: "rgba(255,255,255,0.8)",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (kind === "agents") {
    return (
      <div className="flex items-center gap-2" style={{ width: "100%" }}>
        <div
          className="flex-1 rounded-lg px-3 py-2"
          style={{
            background: "#ffffff",
            border: "1px solid #ececec",
            boxShadow: "0 2px 6px rgba(15,15,40,0.06)",
          }}
        >
          <div style={{ height: 4, borderRadius: 999, background: "#e5e7eb", width: "70%", marginBottom: 4 }} />
          <div style={{ height: 4, borderRadius: 999, background: "#e5e7eb", width: "100%" }} />
          <div style={{ marginTop: 6, fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>PROMPT</div>
        </div>
        <svg width="18" height="8" viewBox="0 0 18 8" style={{ flexShrink: 0 }}>
          <path d="M0 4 L14 4 M10 0 L14 4 L10 8" stroke="#3b82f6" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
        <div
          className="rounded-lg relative"
          style={{
            width: 48,
            height: 64,
            background: "linear-gradient(180deg, #1e3a8a, #3b82f6)",
            border: "1px solid rgba(15,15,40,0.1)",
            boxShadow: "0 4px 10px -2px rgba(59,130,246,0.3)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 0,
              height: 0,
              borderLeft: "8px solid #ffffff",
              borderTop: "5px solid transparent",
              borderBottom: "5px solid transparent",
            }}
          />
        </div>
        <svg width="18" height="8" viewBox="0 0 18 8" style={{ flexShrink: 0 }}>
          <path d="M0 4 L14 4 M10 0 L14 4 L10 8" stroke="#3b82f6" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
        <div
          className="flex-1 rounded-lg px-3 py-2 text-center"
          style={{
            background: "#0a0a0a",
            color: "#ffffff",
            boxShadow: "0 4px 10px -2px rgba(0,0,0,0.25)",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Export
        </div>
      </div>
    );
  }

  // trends
  return (
    <div className="flex items-center gap-3" style={{ width: "100%" }}>
      <div
        className="relative rounded-xl flex-1"
        style={{
          aspectRatio: "9/16",
          maxHeight: 150,
          background: "linear-gradient(180deg, #374151, #9ca3af)",
          border: "2px solid #0a0a0a",
          boxShadow: "0 4px 12px -2px rgba(15,15,40,0.15)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            padding: "2px 6px",
            borderRadius: 4,
            background: "#0a0a0a",
            fontSize: 8,
            color: "#ffffff",
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          VIRAL
        </div>
      </div>
      <svg width="22" height="22" viewBox="0 0 22 22" style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="10" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1" />
        <path d="M6 11 L16 11 M12 6 L16 11 L12 16" stroke="#3b82f6" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div
        className="relative rounded-xl flex-1"
        style={{
          aspectRatio: "9/16",
          maxHeight: 150,
          background: "linear-gradient(180deg, #1e3a8a, #60a5fa)",
          border: "2px solid #3b82f6",
          boxShadow: "0 4px 12px -2px rgba(59,130,246,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            padding: "2px 6px",
            borderRadius: 4,
            background: "#3b82f6",
            fontSize: 8,
            color: "#ffffff",
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          TOI
        </div>
      </div>
    </div>
  );
}

/* METRIC 3D ICON — petit carré arrondi à gradient subtil, inset
   highlight en haut et inset shadow en bas pour le relief 3D, picto
   monochrome fin dedans. Style Taap.it (pas d'ombre externe forte,
   tout le relief vient des inset shadows). */
function Metric3DIcon({ kind }: { kind: string }) {
  const box: React.CSSProperties = {
    width: 56,
    height: 56,
    flexShrink: 0,
    borderRadius: 14,
    background: "linear-gradient(145deg, #ffffff 0%, #e5e7eb 100%)",
    border: "1px solid rgba(15,15,40,0.06)",
    boxShadow:
      "inset 0 1px 1px rgba(255,255,255,0.95), inset 0 -2px 0 rgba(15,15,40,0.04), 0 1px 2px rgba(15,15,40,0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
  };

  if (kind === "savings") {
    // Price-tag / discount
    return (
      <div style={box}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 H20 V11 L11 20 L4 13 L12 3 Z" />
          <circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" />
          <path d="M14 14 L10 18" strokeDasharray="1 2" />
        </svg>
      </div>
    );
  }

  if (kind === "grid") {
    // Gallery / créations grid
    return (
      <div style={box}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      </div>
    );
  }

  // bolt — vitesse / < 2 min
  return (
    <div style={box}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 L4 14 H11 L10 22 L20 10 H13 L13 2 Z" />
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PRODUCT FEATURE SECTIONS — 6 dedicated "Foreplay-style" cards.

   Each config defines the 3 clickable advantages + the LP href. The
   `ProductFeatureSection` renders a 2-column grid (info / visual) and
   alternates the column order on odd indices for a zig-zag rhythm.
   ═══════════════════════════════════════════════════════════════════ */

interface ProductFeatureBullet {
  key: string;
  label: string;
  /** Small chip rows displayed in the right-side mockup when this
   *  bullet is active — think "live data hints" that sell the feature. */
  chips: string[];
}

interface ProductFeatureSectionData {
  slug: ProductSlug;
  title: string;
  href: string;
  bullets: [ProductFeatureBullet, ProductFeatureBullet, ProductFeatureBullet];
}

const PRODUCT_FEATURE_SECTIONS: ProductFeatureSectionData[] = [
  {
    slug: "trackify",
    title: "Suis tes concurrents. 24/7. Automatiquement.",
    href: "/trackify",
    bullets: [
      {
        key: "scraper",
        label: "Scraper d'ads 24/7",
        chips: [
          "553 ads actives chez ton concurrent",
          "42 nouvelles ads cette semaine",
          "Alerte quand un test monte en spend",
        ],
      },
      {
        key: "hooks",
        label: "Analyse des hooks gagnants",
        chips: [
          "Top 10 hooks scorés sur la durée de run",
          "\"306 jours\" · \"I looked 15 years older\"",
          "Export CSV direct pour tes briefs",
        ],
      },
      {
        key: "lps",
        label: "Landing pages des concurrents",
        chips: [
          "41 % du trafic va sur play.google.com/...",
          "Capture auto des variantes de LP",
          "Diff visuel entre 2 versions",
        ],
      },
    ],
  },
  {
    slug: "canvas",
    title: "Shooting produit pro sans shoot.",
    href: "/canvas",
    bullets: [
      {
        key: "packshot",
        label: "Packshot studio",
        chips: [
          "Fond blanc / noir / dégradé en 1 clic",
          "Ombres portées réalistes",
          "Exports 4K prêts pour Amazon / Shopify",
        ],
      },
      {
        key: "lifestyle",
        label: "Scènes lifestyle infinies",
        chips: [
          "Plage, salle de sport, cuisine, bureau…",
          "Ton produit intégré à la scène",
          "20 variantes / minute",
        ],
      },
      {
        key: "mockups",
        label: "Mockups photo-réalistes",
        chips: [
          "iPhone, MacBook, Billboard, packaging",
          "Conserve les couleurs de ta marque",
          "Zoom ultra-détail sans pixellisation",
        ],
      },
    ],
  },
  {
    slug: "avatar",
    title: "Clone ton meilleur UGC creator.",
    href: "/avatar",
    bullets: [
      {
        key: "face",
        label: "Avatar hyper-réaliste",
        chips: [
          "Upload 10 photos → avatar vidéo reusable",
          "Expressions naturelles, pas de uncanny",
          "Utilisable sur toutes tes ads",
        ],
      },
      {
        key: "voice",
        label: "Voix clonée",
        chips: [
          "30 secondes d'audio suffisent",
          "Accent, intonation, respirations",
          "FR + EN + 15 langues",
        ],
      },
      {
        key: "scripts",
        label: "Scripts IA vendeurs",
        chips: [
          "Hook → problème → solution → CTA",
          "Adapté à ta niche et ton offer",
          "A/B test 10 variantes d'un même script",
        ],
      },
    ],
  },
  {
    slug: "adlab",
    title: "Des ads qui scroll-stop. Par batch de 50.",
    href: "/adlab",
    bullets: [
      {
        key: "hooks",
        label: "Hook generator",
        chips: [
          "50 hooks scorés sur la probabilité de stop-scroll",
          "Variantes par angle, émotion, promesse",
          "Prêts à coller dans ton ad",
        ],
      },
      {
        key: "batch",
        label: "A/B batch ×50",
        chips: [
          "Même offer, 50 variantes créatives",
          "Découvre le gagnant en 72h",
          "Duplique le style, jette le reste",
        ],
      },
      {
        key: "export",
        label: "Meta + TikTok ready",
        chips: [
          "Exports 9:16, 1:1, 4:5 automatiques",
          "Captions SRT + burn-in",
          "Specs Meta / TikTok Ads validées",
        ],
      },
    ],
  },
  {
    slug: "thumbs",
    title: "Miniatures YTB qui font cliquer.",
    href: "/thumbs",
    bullets: [
      {
        key: "extract",
        label: "Extract + reverse",
        chips: [
          "Colle une URL, récupère la miniature",
          "Reverse-engineer le style et le layout",
          "Applique-le à ta propre vidéo",
        ],
      },
      {
        key: "face",
        label: "Face swap",
        chips: [
          "Remplace le visage par le tien",
          "Expression conservée (choc, rire, sérieux)",
          "Aucune trace de retouche",
        ],
      },
      {
        key: "style",
        label: "Style de créateur",
        chips: [
          "MrBeast, Inoxtag, Squeezie, Feastables…",
          "Palette, typo, composition clonée",
          "Reste dans les règles YouTube",
        ],
      },
    ],
  },
  {
    slug: "clipsy",
    title: "Du prompt à la vidéo short. Direct.",
    href: "/clipsy",
    bullets: [
      {
        key: "longform",
        label: "Long-form → shorts",
        chips: [
          "Colle un lien YouTube long",
          "Clipsy détecte les moments viraux",
          "Exporte 5 à 10 shorts en 9:16",
        ],
      },
      {
        key: "prompt",
        label: "Prompt-to-video",
        chips: [
          "Décris la scène, reçois la vidéo",
          "Kling, Veo, Hailuo, Grok au choix",
          "Jusqu'à 10 s, 4K, en < 2 min",
        ],
      },
      {
        key: "subs",
        label: "Sous-titres auto",
        chips: [
          "Découpage mot par mot, style TikTok",
          "Animation rebond / zoom / surligné",
          "FR, EN, ES, DE — 97 % d'accuracy",
        ],
      },
    ],
  },
];

function ProductFeatureSection({
  slug,
  title,
  href,
  bullets,
  reverse = false,
}: ProductFeatureSectionData & { reverse?: boolean }) {
  const [active, setActive] = useState(0);
  const product = PRODUCTS.find((p) => p.slug === slug)!;
  const activeBullet = bullets[active];
  const accent = product.color;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 items-stretch">
      {/* ── LEFT : info card ─────────────────────────────────────── */}
      <div
        className={reverse ? "md:order-2" : ""}
        style={{
          background: "#0a0a0a",
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "40px 34px",
          display: "flex",
          flexDirection: "column",
          minHeight: 520,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 16 }}>
          {product.name}
        </div>
        <h3
          style={{
            fontSize: "clamp(26px, 3vw, 38px)",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            fontWeight: 600,
            color: "#ffffff",
            marginBottom: 26,
            maxWidth: 360,
          }}
        >
          {title}
        </h3>

        <div className="flex items-center gap-2.5 mb-auto flex-wrap">
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full font-medium transition"
            style={{ background: "#ffffff", color: "#0a0a0a", fontSize: 13.5 }}
          >
            Essai gratuit <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full font-medium transition"
            style={{
              background: "transparent",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.18)",
              fontSize: 13.5,
            }}
          >
            En savoir plus <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="mt-10 space-y-1">
          {bullets.map((b, i) => {
            const isActive = i === active;
            return (
              <button
                key={b.key}
                onClick={() => setActive(i)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition"
                style={{
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  color: isActive ? "#ffffff" : "#6b7280",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = "#d1d5db";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = "#6b7280";
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 99,
                    background: isActive ? accent : "#4b5563",
                    flexShrink: 0,
                    boxShadow: isActive ? `0 0 10px ${accent}` : "none",
                  }}
                />
                <span style={{ fontSize: 14.5, fontWeight: isActive ? 600 : 500 }}>{b.label}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom-left accent glow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: -100,
            left: -100,
            width: 260,
            height: 260,
            background: `radial-gradient(circle, ${accent}30 0%, transparent 70%)`,
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* ── RIGHT : visual card with live mockup ─────────────────── */}
      <div
        className={reverse ? "md:order-1" : ""}
        style={{
          background: "#0a0a0a",
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.08)",
          minHeight: 520,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 50% 25%, ${accent}30 0%, transparent 55%)`,
            pointerEvents: "none",
          }}
        />
        <div className="relative flex items-center justify-center h-full p-6 md:p-8">
          <ProductShowcaseMockup
            product={product}
            bulletKey={activeBullet.key}
            bulletLabel={activeBullet.label}
            chips={activeBullet.chips}
          />
        </div>
      </div>
    </div>
  );
}

function ProductShowcaseMockup({
  product,
  bulletKey,
  bulletLabel,
  chips,
}: {
  product: Product;
  bulletKey: string;
  bulletLabel: string;
  chips: string[];
}) {
  return (
    <div
      key={bulletKey}
      className="horpen-fade-in"
      style={{
        width: "100%",
        maxWidth: 480,
        position: "relative",
        aspectRatio: "1 / 1",
      }}
    >
      {/* App-window frame */}
      <div
        style={{
          position: "absolute",
          inset: "6% 4% 12% 4%",
          background: "rgba(10,10,10,0.75)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
        }}
      >
        {/* Traffic lights header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "11px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 99, background: "rgba(255,255,255,0.18)" }} />
          <span style={{ width: 9, height: 9, borderRadius: 99, background: "rgba(255,255,255,0.18)" }} />
          <span style={{ width: 9, height: 9, borderRadius: 99, background: "rgba(255,255,255,0.18)" }} />
          <span style={{ marginLeft: 12, fontSize: 11, color: "#6b7280", letterSpacing: "0.01em" }}>
            horpen.ai / {product.slug}
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Highlight: active bullet */}
          <div
            style={{
              padding: "10px 13px",
              background: `${product.color}22`,
              border: `1px solid ${product.color}55`,
              borderRadius: 10,
              color: "#ffffff",
              fontSize: 12.5,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: product.color,
                boxShadow: `0 0 8px ${product.color}`,
                flexShrink: 0,
              }}
            />
            {bulletLabel}
          </div>
          {/* Chip rows */}
          {chips.map((c, i) => (
            <div
              key={i}
              style={{
                padding: "9px 13px",
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                color: "#9ca3af",
                fontSize: 12,
                lineHeight: 1.4,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 99,
                  background: "#4b5563",
                  flexShrink: 0,
                }}
              />
              {c}
            </div>
          ))}
        </div>
      </div>

      {/* 3D logo floating bottom-left of frame */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "2%",
          zIndex: 5,
        }}
      >
        <Product3DLogo product={product} size={96} />
      </div>
    </div>
  );
}
