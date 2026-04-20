"use client";

/**
 * Horpen.ai — landing page (FR, structure Taap.it).
 *
 * 12 sections, inspirées du blueprint Taap.it :
 *   1.  Hero (dark panel + beams)
 *   2.  Social proof band
 *   3.  3 piliers (Convertir / Cloner / Unifier)
 *   4.  6 features
 *   5.  Témoignage unique
 *   6.  Analytics
 *   7.  Workspace hub
 *   8.  Micro-apps
 *   9.  FAQ
 *   10. CTA final + AEO (Ask ChatGPT / Claude / Perplexity)
 *   11. Build in public / Skool
 *   12. Footer détaillé
 *
 * Toutes les @keyframes sont centralisées dans un seul <style jsx global>
 * au sommet du composant — Next.js 16 (Turbopack) refuse les blocs
 * styled-jsx imbriqués plus profondément.
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

/* ─── Pricing (miroir de app/core/pricing.py) ─────────────────────── */

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

/* ─── FAQ (10 questions FR d'après blueprint section 9) ───────────── */

const FAQ = [
  {
    q: "C'est quoi Horpen, exactement ?",
    a: "Une plateforme IA tout-en-un pour générer, cloner et décliner tes contenus marketing : UGC vidéo, ads, photos produit, miniatures YouTube, avatars IA. Un seul workspace, une seule facture.",
  },
  {
    q: "C'est pour qui ?",
    a: "E-commerçants, dropshippers, créateurs UGC, faceless content creators, opérateurs d'influenceurs IA, agences créa. Si tu vis de contenu qui doit convertir, Horpen est fait pour toi.",
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
    a: "Full HD par défaut, 4K en plan Studio. Compatible Kling 2.5 Turbo Pro, Veo 3.1 Fast, Hailuo 02 et Grok Imagine — tu choisis le moteur selon ton besoin qualité / vitesse.",
  },
  {
    q: "Combien ça coûte réellement à l'usage ?",
    a: "Free (0€, 3 crédits), Creator (35€/mois, 200 crédits), Studio (85€/mois, 450 crédits). Au-delà : pay-as-you-go sans engagement. Pas de surprise, pas de facture cachée.",
  },
  {
    q: "Mes créas m'appartiennent ?",
    a: "100 %. Droits commerciaux inclus sur tous les plans payants. Tu publies, tu monétises, tu revendiques — c'est à toi.",
  },
  {
    q: "Je peux cloner une ad concurrente légalement ?",
    a: "Horpen te permet de reproduire un style, un angle ou un format. Tu restes responsable de ne pas copier de contenu sous copyright. Notre extension Chrome te guide sur ce qui est safe.",
  },
  {
    q: "Comment je peux vous contacter ?",
    a: "Discord communauté, email support@horpen.ai, ou Skool Horpen pour les clients qui veulent aller plus loin (masterclasses, feedback prioritaire, roadmap votée).",
  },
];

/* ─── Showcase shape ──────────────────────────────────────────────── */

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

  /* Auth redirect — côté client uniquement (localStorage SSR-unsafe). */
  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    }
  }, [router]);

  /* Showcase fetch — silencieux si indisponible. */
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
      {/* Global keyframes — UN SEUL bloc, top-level (Turbopack-safe). */}
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
        @keyframes horpen-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
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
        @keyframes feature-glow {
          0%, 100% { box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 20px 40px -15px rgba(15,15,40,0.12); }
          50% { box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -15px rgba(15,15,40,0.18); }
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
        }

        .horpen-card-3d {
          transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1),
                      border-color 0.3s ease;
          will-change: transform;
        }
        .horpen-card-3d:hover {
          transform: translateY(-6px);
          box-shadow:
            0 1px 2px rgba(0,0,0,0.04),
            0 30px 60px -15px rgba(15,15,40,0.18) !important;
        }

        .marquee-track {
          display: flex;
          width: max-content;
          animation: marquee-scroll 40s linear infinite;
        }
      `}</style>

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
            <a href="#piliers" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">Produit</a>
            <a href="#features" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">Features</a>
            <a href="#micro-apps" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">Apps</a>
            <a href="#pricing" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">Tarifs</a>
            <a href="#faq" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">FAQ</a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden md:inline text-[14px]"
              style={{ color: "#555" }}
            >
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="text-[14px] font-medium px-4 py-2 rounded-full transition"
              style={{
                background: "#0a0a0a",
                color: "#ffffff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              }}
            >
              Essai gratuit
            </Link>
            <button
              className="md:hidden p-2"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              <div className="w-5 h-[2px] bg-[#0a0a0a] mb-1" />
              <div className="w-5 h-[2px] bg-[#0a0a0a] mb-1" />
              <div className="w-5 h-[2px] bg-[#0a0a0a]" />
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden px-5 pb-5 flex flex-col gap-3 text-[15px]" style={{ borderTop: "1px solid #ececec" }}>
            <a href="#piliers" onClick={() => setMenuOpen(false)}>Produit</a>
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#micro-apps" onClick={() => setMenuOpen(false)}>Apps</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Tarifs</a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
            <Link href="/login">Se connecter</Link>
          </div>
        )}
      </nav>

      {/* ══════════════════════ SECTION 1 — HERO ══════════════════════ */}
      <section className="pt-[88px] pb-10 md:pb-16 px-4 md:px-6">
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
          {/* 7 god-ray beams */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {[
              { left: "8%", color: "rgba(96,165,250,0.35)", width: 140, delay: "0s" },
              { left: "22%", color: "rgba(167,139,250,0.28)", width: 160, delay: "1.2s" },
              { left: "36%", color: "rgba(96,165,250,0.4)", width: 180, delay: "2.4s" },
              { left: "50%", color: "rgba(147,197,253,0.5)", width: 200, delay: "0.6s" },
              { left: "64%", color: "rgba(96,165,250,0.4)", width: 180, delay: "1.8s" },
              { left: "78%", color: "rgba(167,139,250,0.28)", width: 160, delay: "3s" },
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

          {/* Contenu hero */}
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
              <span>Nouveau — Clonage d&apos;ads en 1 clic</span>
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
              Horpen génère tes UGC, tes ads, tes miniatures et tes visuels produit
              avec l&apos;IA la plus économique du marché. Clone ce qui cartonne. Décline
              à l&apos;infini. Publie.
            </p>

            <div
              className="horpen-reveal mt-9 flex flex-col sm:flex-row items-center gap-3"
              style={{ "--horpen-reveal-delay": "0.3s" } as React.CSSProperties}
            >
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-medium transition"
                style={{
                  background: "#ffffff",
                  color: "#0a0a0a",
                  fontSize: 15,
                  boxShadow: "0 8px 24px rgba(255,255,255,0.15), 0 1px 0 rgba(255,255,255,0.4) inset",
                }}
              >
                Commencer gratuitement
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-medium transition"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.14)",
                  fontSize: 15,
                }}
              >
                <Play className="w-4 h-4" />
                Voir la démo (2 min)
              </a>
            </div>

            <div
              className="horpen-reveal mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
              style={{ "--horpen-reveal-delay": "0.4s" } as React.CSSProperties}
            >
              {["UGC vidéo", "Photos produit", "Ads", "Miniatures YTB", "Influenceur IA"].map(
                (b, i) => (
                  <span
                    key={b}
                    style={{
                      color: "#94a3b8",
                      fontSize: 13,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {b}
                    {i < 4 && <span className="mx-2 opacity-50">·</span>}
                  </span>
                )
              )}
            </div>

            {/* Hero preview : gallery d'aperçus */}
            <div
              className="horpen-reveal mt-14 w-full"
              style={{ "--horpen-reveal-delay": "0.5s", maxWidth: 1080 } as React.CSSProperties}
            >
              <HeroPreview showcase={showcase} />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 2 — SOCIAL PROOF ══════════════════════ */}
      <section className="py-14 md:py-20 px-5 md:px-8">
        <div className="max-w-[1280px] mx-auto">
          <p
            className="text-center horpen-reveal"
            style={{
              color: "#6b7280",
              fontSize: 14,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Utilisé par créateurs et marques e-com dans 30+ pays
          </p>

          {/* Logos carousel (placeholders texte — remplacer par vrais logos) */}
          <div className="mt-8 overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
            <div className="marquee-track items-center gap-12 md:gap-16">
              {[...Array(2)].flatMap((_, dup) =>
                ["OPALE", "NOVA", "Kairos", "MERIDIAN", "Orbit", "LUMEN", "Fjord", "Aria", "PRISMA", "Zenith", "Halo", "VOLT"].map((name, i) => (
                  <span
                    key={`${dup}-${i}`}
                    style={{
                      fontSize: 22,
                      letterSpacing: "0.2em",
                      color: "#9ca3af",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* 3 metrics */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
            {[
              { big: "10×", label: "moins cher qu'un shooting UGC traditionnel" },
              { big: "+50 000", label: "créas générées chaque mois par la communauté" },
              { big: "< 2 min", label: "du prompt à la vidéo prête à publier" },
            ].map((m, i) => (
              <div
                key={i}
                className="horpen-reveal text-center md:text-left"
                style={{ "--horpen-reveal-delay": `${0.1 * i}s` } as React.CSSProperties}
              >
                <div
                  style={{
                    fontSize: "clamp(40px, 4.5vw, 56px)",
                    fontWeight: 600,
                    letterSpacing: "-0.03em",
                    color: "#0a0a0a",
                    lineHeight: 1,
                  }}
                >
                  {m.big}
                </div>
                <div style={{ marginTop: 10, color: "#6b7280", fontSize: 15, lineHeight: 1.5 }}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 3 — 3 PILIERS ══════════════════════ */}
      <section id="piliers" className="py-16 md:py-24 px-5 md:px-8">
        <div className="max-w-[1280px] mx-auto">
          <div className="text-center mb-14 md:mb-20">
            <div className="inline-block mb-4 px-3 py-1 rounded-full" style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Pensé pour vendre
            </div>
            <h2 className="horpen-reveal" style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a", maxWidth: 860, margin: "0 auto" }}>
              Trois raisons pour lesquelles Horpen remplace ta stack créa.
            </h2>
          </div>

          <div className="space-y-24 md:space-y-32">
            <PilierRow
              reverse={false}
              index={1}
              title="Des contenus pensés pour convertir, pas pour faire joli."
              desc="Chaque UGC, chaque ad, chaque miniature est optimisée pour un seul objectif : faire cliquer, faire acheter. Templates battle-testés sur les niches e-com, hook generator intégré, A/B test en un clic."
              tags={["UGC vidéo", "Ads IA", "Hook generator", "Templates e-com"]}
              visual={<PilierVisualConvertir />}
            />
            <PilierRow
              reverse={true}
              index={2}
              title="Clone ce qui cartonne. En 1 clic."
              desc="Une ad qui marche chez un concurrent ? Colle le lien, remplace le produit ou le personnage, récupère ta version. Trend virale sur TikTok ? Duplique le style, garde la viralité. Extension Chrome pour capturer à la volée."
              tags={["Clonage d'ads", "Duplication de trend", "Swap produit", "Extension Chrome"]}
              visual={<PilierVisualCloner />}
            />
            <PilierRow
              reverse={false}
              index={3}
              title="Ta stack créa, enfin unifiée."
              desc="Remplace ton shooting produit, ton UGC creator freelance, ton designer de miniatures, ton monteur vidéo et ton éditeur photo. Un seul workspace, une seule facture, zéro aller-retour."
              tags={["Workspace e-com", "Photo produit", "Miniature YTB", "Influenceur IA"]}
              visual={<PilierVisualUnifier />}
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 4 — 6 FEATURES ══════════════════════ */}
      <section id="features" className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec", borderBottom: "1px solid #ececec" }}>
        <div className="max-w-[1280px] mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block mb-4 px-3 py-1 rounded-full" style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Features
            </div>
            <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a", maxWidth: 820, margin: "0 auto" }}>
              Des outils pensés pour vendre, <span style={{ color: "#9ca3af" }}>pas pour impressionner.</span>
            </h2>
            <p style={{ marginTop: 18, color: "#6b7280", fontSize: 17, maxWidth: 620, margin: "18px auto 0" }}>
              Chaque feature d&apos;Horpen a été créée pour une chose : te faire gagner du temps et te faire gagner de l&apos;argent. Pas pour remplir un changelog.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {[
              {
                emoji: "🔥",
                title: "Tinder des ads",
                desc: "Swipe. Like. Publie. Le feed infini d'ads pour ton produit, généré sur mesure.",
              },
              {
                emoji: "🎭",
                title: "Style personnalisé",
                desc: "Charge un visage, un univers, une niche. Réutilise-les sur toutes tes créas.",
              },
              {
                emoji: "🎬",
                title: "Miniatures YTB",
                desc: "Colle un lien de vidéo. Récupère une miniature qui fait cliquer. En 5 secondes.",
              },
              {
                emoji: "📦",
                title: "Templates de packs",
                desc: "Réaction selfie, facecam bagnole, lifestyle étudiant. Des dizaines de packs prêts à l'emploi.",
              },
              {
                emoji: "🤖",
                title: "Agents IA connectés",
                desc: "Du prompt à la vidéo finale, en pipeline. Tu écris l'histoire, l'IA la filme.",
              },
              {
                emoji: "🌀",
                title: "Duplicateur de trends",
                desc: "Une vidéo virale ? Un clic. Ta version, ton produit, ta niche.",
              },
            ].map((f, i) => (
              <div
                key={f.title}
                className="horpen-reveal horpen-card-3d p-7 rounded-2xl"
                style={{
                  background: "#fafafa",
                  border: "1px solid #ececec",
                  "--horpen-reveal-delay": `${0.05 * i}s`,
                } as React.CSSProperties}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "#ffffff",
                    border: "1px solid #ececec",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    marginBottom: 18,
                  }}
                >
                  {f.emoji}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em" }}>
                  {f.title}
                </h3>
                <p style={{ marginTop: 8, color: "#6b7280", fontSize: 14.5, lineHeight: 1.55 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition"
              style={{
                background: "#0a0a0a",
                color: "#ffffff",
                fontSize: 14,
              }}
            >
              Explorer toutes les features
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 5 — TÉMOIGNAGE ══════════════════════ */}
      <section className="py-20 md:py-28 px-5 md:px-8">
        <div className="max-w-[880px] mx-auto text-center">
          <div className="inline-block mb-6 px-3 py-1 rounded-full" style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Témoignage
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
            Aujourd&apos;hui j&apos;en génère <span style={{ color: "#9ca3af" }}>20 par semaine</span>,
            mes ads tournent en continu, et mon ROAS est passé de 1,4 à 3,1. Le truc qui change
            tout, c&apos;est le clonage d&apos;ads concurrentes.&rdquo;
          </blockquote>
          <div className="mt-10 flex items-center justify-center gap-4">
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #f472b6, #a78bfa)",
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

      {/* ══════════════════════ SECTION 6 — ANALYTICS ══════════════════════ */}
      <section className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec", borderBottom: "1px solid #ececec" }}>
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-block mb-4 px-3 py-1 rounded-full" style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Analytics
            </div>
            <h2 style={{ fontSize: "clamp(30px, 4vw, 46px)", lineHeight: 1.1, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a" }}>
              Sache exactement <span style={{ color: "#9ca3af" }}>quelles créas rapportent.</span>
            </h2>
            <p style={{ marginTop: 18, color: "#6b7280", fontSize: 17, lineHeight: 1.55, maxWidth: 520 }}>
              Pas besoin de deviner. Horpen track quelle ad convertit, quel hook fonctionne,
              quel style génère le plus d&apos;engagement. Tu gardes ce qui marche, tu jettes le reste.
            </p>

            <div className="mt-8 space-y-5">
              {[
                { t: "Performance par créa", d: "ROAS, CTR, taux de scroll-stop. Pour chaque ad générée, tu vois ce qu'elle a ramené." },
                { t: "A/B test automatique", d: "Lance 10 variantes d'un même angle. Horpen détecte la gagnante et duplique le style." },
                { t: "Hook scoring", d: "Chaque hook généré est scoré sur sa probabilité de faire arrêter le scroll. Avant même de publier." },
                { t: "Trend tracking", d: "Horpen suit les vidéos virales dans ta niche en temps réel. Tu dupliques avant les autres." },
              ].map((it) => (
                <div key={it.t} className="flex gap-3">
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: "#0a0a0a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <Check className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#0a0a0a" }}>{it.t}</div>
                    <div style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.5, marginTop: 2 }}>{it.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mockup dashboard */}
          <div
            className="horpen-reveal"
            style={{
              background: "#fafafa",
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
                <div key={k.label} style={{ background: "#ffffff", border: "1px solid #ececec", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em", marginTop: 4 }}>{k.val}</div>
                  <div style={{ fontSize: 11, color: "#16a34a", marginTop: 2 }}>{k.d}</div>
                </div>
              ))}
            </div>

            {/* Fake chart */}
            <div style={{ background: "#ffffff", border: "1px solid #ececec", borderRadius: 12, padding: 16, height: 180, position: "relative", overflow: "hidden" }}>
              <svg viewBox="0 0 300 120" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                <defs>
                  <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0a0a0a" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,90 C30,85 60,70 90,60 C120,50 150,65 180,45 C210,30 240,35 270,20 L300,15 L300,120 L0,120 Z"
                  fill="url(#chart-fill)"
                />
                <path
                  d="M0,90 C30,85 60,70 90,60 C120,50 150,65 180,45 C210,30 240,35 270,20 L300,15"
                  fill="none"
                  stroke="#0a0a0a"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 7 — WORKSPACE HUB ══════════════════════ */}
      <section className="py-20 md:py-28 px-5 md:px-8">
        <div className="max-w-[1080px] mx-auto text-center">
          <div className="inline-block mb-4 px-3 py-1 rounded-full" style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Workspace
          </div>
          <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a", maxWidth: 820, margin: "0 auto" }}>
            Un seul espace qui remplace <span style={{ color: "#9ca3af" }}>ton agence créa.</span>
          </h2>
          <p style={{ marginTop: 18, color: "#6b7280", fontSize: 17, maxWidth: 680, margin: "18px auto 0" }}>
            Ton logo, tes produits, tes UGC, tes ads, tes miniatures, tes influenceurs IA.
            Tout au même endroit, tout réutilisable, tout déclinable. Comme avoir un studio créa
            en illimité dans le cloud.
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

      {/* ══════════════════════ SECTION 8 — MICRO-APPS ══════════════════════ */}
      <section id="micro-apps" className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec", borderBottom: "1px solid #ececec" }}>
        <div className="max-w-[1280px] mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block mb-4 px-3 py-1 rounded-full" style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Micro-apps
            </div>
            <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a", maxWidth: 860, margin: "0 auto" }}>
              Un besoin précis ? <span style={{ color: "#9ca3af" }}>On a l&apos;app pour ça.</span>
            </h2>
            <p style={{ marginTop: 18, color: "#6b7280", fontSize: 17, maxWidth: 680, margin: "18px auto 0" }}>
              Horpen, c&apos;est une plateforme. Mais chaque brique est aussi accessible en app dédiée.
              Entrée rapide, résultat immédiat.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                url: "horpen.ai/thumbnails",
                title: "Générateur de miniatures",
                desc: "Colle un lien, récupère une miniature YTB qui fait cliquer. En 5 secondes.",
                gradient: "linear-gradient(135deg, #f472b6 0%, #a78bfa 100%)",
              },
              {
                url: "horpen.ai/photoshoot",
                title: "Shooting produit IA",
                desc: "Upload ton produit, choisis l'ambiance, reçois 20 photos pro.",
                gradient: "linear-gradient(135deg, #60a5fa 0%, #34d399 100%)",
              },
              {
                url: "horpen.ai/pixea",
                title: "Style transfer IA",
                desc: "Transforme n'importe quelle image dans le style de ton choix.",
                gradient: "linear-gradient(135deg, #fbbf24 0%, #f472b6 100%)",
              },
            ].map((app) => (
              <div
                key={app.url}
                className="horpen-card-3d rounded-2xl overflow-hidden"
                style={{ background: "#fafafa", border: "1px solid #ececec" }}
              >
                <div style={{ height: 140, background: app.gradient, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      bottom: 14,
                      left: 16,
                      background: "rgba(255,255,255,0.9)",
                      backdropFilter: "blur(10px)",
                      padding: "6px 12px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#0a0a0a",
                      letterSpacing: "-0.01em",
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
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ PRICING ══════════════════════ */}
      <section id="pricing" className="py-20 md:py-28 px-5 md:px-8">
        <div className="max-w-[1080px] mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block mb-4 px-3 py-1 rounded-full" style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Tarifs
            </div>
            <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a" }}>
              Une fraction du prix <span style={{ color: "#9ca3af" }}>d&apos;Arcads, Weavy ou Makeugc.</span>
            </h2>
            <p style={{ marginTop: 18, color: "#6b7280", fontSize: 17, maxWidth: 560, margin: "18px auto 0" }}>
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

      {/* ══════════════════════ SECTION 9 — FAQ ══════════════════════ */}
      <section id="faq" className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec" }}>
        <div className="max-w-[820px] mx-auto">
          <div className="text-center mb-12">
            <div className="inline-block mb-4 px-3 py-1 rounded-full" style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              FAQ
            </div>
            <h2 style={{ fontSize: "clamp(30px, 4vw, 44px)", lineHeight: 1.1, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a" }}>
              Toujours des questions ? <span style={{ color: "#9ca3af" }}>On a les réponses.</span>
            </h2>
          </div>

          <div className="space-y-2">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  style={{
                    background: "#fafafa",
                    border: "1px solid #ececec",
                    borderRadius: 14,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full text-left px-5 py-4 flex items-center justify-between gap-4"
                    style={{ color: "#0a0a0a", fontSize: 15, fontWeight: 500 }}
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className="w-4 h-4 flex-shrink-0 transition-transform"
                      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "#6b7280" }}
                    />
                  </button>
                  {open && (
                    <div style={{ padding: "0 20px 18px", color: "#6b7280", fontSize: 14.5, lineHeight: 1.6 }}>
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
              style={{ background: "#0a0a0a", color: "#ffffff", fontSize: 14 }}
            >
              Réserver une démo
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 10 — CTA FINAL + AEO ══════════════════════ */}
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
            <div className="relative z-10">
              <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.035em", fontWeight: 600, color: "#ffffff", maxWidth: 780, margin: "0 auto" }}>
                T&apos;es descendu jusqu&apos;ici.
                <br />
                <span style={{ color: "#94a3b8" }}>C&apos;est le moment de tester.</span>
              </h2>
              <p style={{ marginTop: 18, color: "#cbd5e1", fontSize: 17, maxWidth: 540, margin: "18px auto 0", lineHeight: 1.55 }}>
                Génère tes premières créas gratuitement. Pas de CB, pas d&apos;engagement, pas de bullshit.
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

          {/* AEO — Ask ChatGPT / Claude / Perplexity */}
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition"
                  style={{
                    background: "#ffffff",
                    border: "1px solid #ececec",
                    color: "#0a0a0a",
                    fontSize: 14,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: btn.bg }} />
                  Demander à {btn.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ SECTION 11 — BUILD IN PUBLIC ══════════════════════ */}
      <section className="py-16 md:py-20 px-5 md:px-8" style={{ background: "#fafafa", borderTop: "1px solid #ececec" }}>
        <div className="max-w-[820px] mx-auto text-center">
          <div style={{ fontSize: 32, marginBottom: 12 }}>🛠️</div>
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

      {/* ══════════════════════ SECTION 12 — FOOTER ══════════════════════ */}
      <footer style={{ background: "#ffffff", borderTop: "1px solid #ececec" }}>
        <div className="max-w-[1280px] mx-auto px-5 md:px-8 py-14 md:py-18">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-10">
            <div className="col-span-2">
              <Link href="/" className="flex items-center gap-2">
                <div
                  className="rounded-lg flex items-center justify-center"
                  style={{ width: 32, height: 32, background: "#0a0a0a" }}
                >
                  <Image src="/horpen-logo.png" alt="" width={20} height={20} style={{ objectFit: "contain" }} />
                </div>
                <span style={{ fontSize: 17, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em" }}>Horpen</span>
              </Link>
              <p style={{ marginTop: 14, color: "#6b7280", fontSize: 14, lineHeight: 1.55, maxWidth: 320 }}>
                L&apos;IA tout-en-un pour créer, cloner et décliner tes contenus marketing. UGC,
                ads, miniatures, photos produit, influenceurs IA.
              </p>
              <div style={{ marginTop: 16, color: "#9ca3af", fontSize: 13 }}>
                Build in public — Roadmap ouverte 🛠️
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
              Fait avec ❤️ pour les créateurs et les marques e-com.
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

/* Hero preview — grille d'aperçus avec vraies images showcase si dispo. */
function HeroPreview({ showcase }: { showcase: ShowcaseData }) {
  const tiles: { url?: string; aspect: string; fallback: string }[] = [
    {
      url: showcase.thumbnails[0]?.url,
      aspect: "16/9",
      fallback: "linear-gradient(135deg, #f472b6 0%, #a78bfa 100%)",
    },
    {
      url: showcase.avatars[0]?.url,
      aspect: "1/1",
      fallback: "linear-gradient(135deg, #60a5fa 0%, #34d399 100%)",
    },
    {
      url: showcase.ads[0]?.url,
      aspect: "1/1",
      fallback: "linear-gradient(135deg, #fbbf24 0%, #f472b6 100%)",
    },
    {
      url: showcase.images[0]?.url,
      aspect: "1/1",
      fallback: "linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%)",
    },
    {
      url: showcase.thumbnails[1]?.url,
      aspect: "16/9",
      fallback: "linear-gradient(135deg, #34d399 0%, #60a5fa 100%)",
    },
  ];

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: 20,
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fbbf24" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.05em" }}>
          app.horpen.ai/workspace
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="grid grid-cols-6 gap-3" style={{ minHeight: 240 }}>
        <div className="col-span-2 row-span-2 rounded-xl overflow-hidden" style={{ aspectRatio: "1/1.2", background: tiles[1].fallback, position: "relative" }}>
          {tiles[1].url && (
            <img src={tiles[1].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 10, color: "#fff", background: "rgba(0,0,0,0.5)", padding: "3px 8px", borderRadius: 999, backdropFilter: "blur(8px)" }}>
            Avatar IA
          </div>
        </div>
        <div className="col-span-4 rounded-xl overflow-hidden" style={{ aspectRatio: "16/9", background: tiles[0].fallback, position: "relative" }}>
          {tiles[0].url && (
            <img src={tiles[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 10, color: "#fff", background: "rgba(0,0,0,0.5)", padding: "3px 8px", borderRadius: 999, backdropFilter: "blur(8px)" }}>
            Miniature YTB
          </div>
        </div>
        <div className="col-span-2 rounded-xl overflow-hidden" style={{ aspectRatio: "1/1", background: tiles[2].fallback, position: "relative" }}>
          {tiles[2].url && (
            <img src={tiles[2].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 10, color: "#fff", background: "rgba(0,0,0,0.5)", padding: "3px 8px", borderRadius: 999, backdropFilter: "blur(8px)" }}>
            Ad
          </div>
        </div>
        <div className="col-span-2 rounded-xl overflow-hidden" style={{ aspectRatio: "1/1", background: tiles[3].fallback, position: "relative" }}>
          {tiles[3].url && (
            <img src={tiles[3].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 10, color: "#fff", background: "rgba(0,0,0,0.5)", padding: "3px 8px", borderRadius: 999, backdropFilter: "blur(8px)" }}>
            Image
          </div>
        </div>
      </div>
    </div>
  );
}

/* Piliers — row alternée image / texte. */
function PilierRow({
  reverse,
  index,
  title,
  desc,
  tags,
  visual,
}: {
  reverse: boolean;
  index: number;
  title: string;
  desc: string;
  tags: string[];
  visual: React.ReactNode;
}) {
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <div className="horpen-reveal">
        <div style={{ color: "#9ca3af", fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600, marginBottom: 14 }}>
          Pilier {String(index).padStart(2, "0")}
        </div>
        <h3 style={{ fontSize: "clamp(26px, 3.4vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.03em", fontWeight: 600, color: "#0a0a0a", maxWidth: 480 }}>
          {title}
        </h3>
        <p style={{ marginTop: 18, color: "#6b7280", fontSize: 17, lineHeight: 1.55, maxWidth: 460 }}>
          {desc}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                padding: "5px 11px",
                borderRadius: 999,
                background: "#f3f4f6",
                color: "#4b5563",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="horpen-reveal" style={{ "--horpen-reveal-delay": "0.1s" } as React.CSSProperties}>
        {visual}
      </div>
    </div>
  );
}

/* Pilier visuals — mockups HTML/CSS. */
function PilierVisualConvertir() {
  return (
    <div
      className="horpen-card-3d rounded-2xl p-6"
      style={{
        background: "#ffffff",
        border: "1px solid #ececec",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -15px rgba(15,15,40,0.1)",
      }}
    >
      <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
        Hook scoring en direct
      </div>
      {[
        { h: "POV : tu découvres qu'on peut…", s: 94, ok: true },
        { h: "Je l'ai testé pendant 7 jours…", s: 78, ok: true },
        { h: "Mon expert beauté m'a dit…", s: 52, ok: false },
        { h: "Regarde ce qui arrive quand…", s: 86, ok: true },
      ].map((item, i) => (
        <div key={i} className="mb-2.5" style={{ padding: "11px 14px", background: "#fafafa", border: "1px solid #ececec", borderRadius: 10 }}>
          <div className="flex items-center justify-between gap-3">
            <div style={{ fontSize: 13.5, color: "#0a0a0a", fontWeight: 500, flex: 1 }}>{item.h}</div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 999,
                background: item.ok ? "#dcfce7" : "#fee2e2",
                color: item.ok ? "#16a34a" : "#dc2626",
              }}
            >
              {item.s}
            </div>
          </div>
          <div style={{ marginTop: 8, height: 4, borderRadius: 999, background: "#ececec", overflow: "hidden" }}>
            <div style={{ width: `${item.s}%`, height: "100%", background: item.ok ? "#16a34a" : "#dc2626" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PilierVisualCloner() {
  return (
    <div
      className="horpen-card-3d rounded-2xl p-6"
      style={{
        background: "#ffffff",
        border: "1px solid #ececec",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -15px rgba(15,15,40,0.1)",
      }}
    >
      <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
        Clone d&apos;ad concurrente
      </div>

      <div style={{ background: "#fafafa", border: "1px solid #ececec", borderRadius: 10, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: "#6b7280" }} />
        <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "ui-monospace, monospace" }}>
          tiktok.com/@competitor/video/7445...
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>Source</div>
          <div style={{ aspectRatio: "9/16", borderRadius: 10, background: "linear-gradient(180deg, #a78bfa 0%, #60a5fa 100%)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.15)" }} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>Ta version</div>
          <div style={{ aspectRatio: "9/16", borderRadius: 10, background: "linear-gradient(180deg, #f472b6 0%, #fbbf24 100%)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.15)" }} />
            <div style={{ position: "absolute", top: 8, right: 8, fontSize: 10, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "2px 7px", borderRadius: 999, fontWeight: 600 }}>
              NEW
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 justify-center" style={{ fontSize: 12, color: "#6b7280" }}>
        <span>Style conservé · Produit remplacé · 100 % original</span>
      </div>
    </div>
  );
}

function PilierVisualUnifier() {
  return (
    <div
      className="horpen-card-3d rounded-2xl p-6"
      style={{
        background: "#ffffff",
        border: "1px solid #ececec",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -15px rgba(15,15,40,0.1)",
      }}
    >
      <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
        Avant / Après
      </div>

      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div style={{ padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
          <div style={{ color: "#dc2626", fontWeight: 600, marginBottom: 8 }}>Avant</div>
          {["Shooting photo : 600€", "UGC creator : 1200€", "Designer miniatures : 300€", "Monteur : 500€", "5 outils SaaS : 220€"].map((x) => (
            <div key={x} style={{ color: "#991b1b", marginBottom: 4 }}>— {x}</div>
          ))}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #fecaca", fontWeight: 700, color: "#dc2626" }}>
            Total : 2 820 € / mois
          </div>
        </div>
        <div style={{ padding: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
          <div style={{ color: "#16a34a", fontWeight: 600, marginBottom: 8 }}>Avec Horpen</div>
          {["Tout le studio inclus", "UGC + ads + miniatures", "Photo produit IA", "Clonage d'ads", "Workspace unifié"].map((x) => (
            <div key={x} style={{ color: "#166534", marginBottom: 4 }}>+ {x}</div>
          ))}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #bbf7d0", fontWeight: 700, color: "#16a34a" }}>
            Total : 85 € / mois
          </div>
        </div>
      </div>

      <div className="mt-4 text-center" style={{ fontSize: 13, color: "#6b7280" }}>
        Économies moyennes : <span style={{ fontWeight: 700, color: "#0a0a0a" }}>-96 %</span>
      </div>
    </div>
  );
}

/* Workspace hub visual — tuiles agencées autour d'un centre. */
function WorkspaceHub({ showcase }: { showcase: ShowcaseData }) {
  const sample = (arr: ShowcaseTile[], i: number): string | undefined => arr[i]?.url;
  const tiles = [
    { label: "Avatar", url: sample(showcase.avatars, 0), g: "linear-gradient(135deg, #60a5fa, #34d399)", w: 130, h: 130, top: 0, left: 0 },
    { label: "Miniature", url: sample(showcase.thumbnails, 0), g: "linear-gradient(135deg, #f472b6, #a78bfa)", w: 220, h: 124, top: 20, left: 170 },
    { label: "Ad", url: sample(showcase.ads, 0), g: "linear-gradient(135deg, #fbbf24, #f472b6)", w: 130, h: 130, top: 0, left: 410 },
    { label: "Photo produit", url: sample(showcase.images, 0), g: "linear-gradient(135deg, #a78bfa, #60a5fa)", w: 130, h: 130, top: 160, left: 0 },
    { label: "Miniature 2", url: sample(showcase.thumbnails, 1), g: "linear-gradient(135deg, #34d399, #60a5fa)", w: 220, h: 124, top: 168, left: 170 },
    { label: "Ad 2", url: sample(showcase.ads, 1), g: "linear-gradient(135deg, #60a5fa, #f472b6)", w: 130, h: 130, top: 160, left: 410 },
  ];

  return (
    <div
      className="mx-auto relative"
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
        {/* Centre = logo Horpen */}
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
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
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
              boxShadow: "0 6px 16px rgba(0,0,0,0.1)",
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
