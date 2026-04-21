"use client";

/**
 * SubLanding — moteur de rendu pour les 6 landing pages produit.
 *
 * Prend une config par produit (copy + visuels) et orchestre toutes
 * les sections conversion-focused : hero, bande logos, section
 * problème, features alternantes, how-it-works, témoignage, tableau
 * comparatif, FAQ, cross-promo, CTA final avec AEO buttons.
 *
 * Chaque sous-landing (`/avatar`, `/canvas`, `/trackify`, `/adlab`,
 * `/thumbs`, `/clipsy`) se résume à un fichier de ~40 lignes qui
 * déclare ses sections et passe au composant.
 */

import { useState } from "react";
import Link from "next/link";
import {
  PRODUCTS,
  Product3DLogo,
  ProductSlug,
  SubLandingNav,
  SubLandingFooter,
  SubLandingFAQ,
  SubLandingCrossPromo,
  ProductDock,
} from "@/components/landing/shared";

/* ─── Config schema ─────────────────────────────────────────────── */

export interface LandingConfig {
  slug: ProductSlug;
  /** Petit badge au-dessus du h1. Ex : "Nouveau" ou un shortcut. */
  heroBadge?: string;
  /** H1 — React node (peut contenir un <br/> + <span> couleur). */
  heroTitle: React.ReactNode;
  /** Sous-titre sous le h1. */
  heroSubtitle: string;
  /** Texte du bouton CTA principal. */
  heroCta: string;
  /** Visuel mockup placé en dessous du hero (optionnel). */
  heroMockup?: React.ReactNode;

  /** Afficher la bande de logos trust signal. Copy optionnelle. */
  logoBand?: boolean;
  logoBandCopy?: string;

  /** Section problème : "sans X, tu galères avec A/B/C". */
  problem?: {
    title: React.ReactNode;
    subtitle?: string;
    pains: { label: string; desc: string }[];
  };

  /** Liste de features alternantes image/texte (2-6 items). */
  features: {
    eyebrow: string;
    title: string;
    desc: string;
    tags?: string[];
    visual: React.ReactNode;
  }[];

  /** 3-4 étapes du workflow. */
  howItWorks?: {
    title: React.ReactNode;
    subtitle?: string;
    steps: { number: string; title: string; desc: string }[];
  };

  /** Témoignage unique fort avec metrics chiffrés. */
  testimonial?: {
    quote: React.ReactNode;
    author: string;
    role: string;
    metrics?: { label: string; value: string }[];
  };

  /** Tableau comparatif vs concurrents directs. */
  comparison?: {
    title: React.ReactNode;
    subtitle?: string;
    /** Nom de colonne "nous" + "eux". */
    usLabel: string;
    competitorLabels: string[];
    rows: {
      feature: string;
      us: boolean | string;
      them: (boolean | string)[];
    }[];
  };

  /** FAQ du produit (8-12 questions idéalement). */
  faq: { q: string; a: string }[];

  /** Bloc CTA final. */
  finalCtaTitle: React.ReactNode;
  finalCtaSub?: string;
  finalCta: string;
}

/* ─── Master component ──────────────────────────────────────────── */

export function SubLanding({ config }: { config: LandingConfig }) {
  const product = PRODUCTS.find((p) => p.slug === config.slug)!;

  return (
    <main
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: "#fafafa", color: "#0a0a0a" }}
    >
      <style jsx global>{`
        @keyframes sl-fade-up {
          0% { opacity: 0; transform: translate3d(0, 24px, 0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .sl-reveal {
          opacity: 0;
          animation: sl-fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          animation-delay: var(--sl-delay, 0s);
        }
        @supports (animation-timeline: view()) {
          .sl-reveal {
            opacity: 0;
            animation: sl-fade-up linear both;
            animation-timeline: view();
            animation-range: entry 0% cover 30%;
          }
        }
        .sl-dotbg {
          background-image:
            radial-gradient(circle at 1px 1px, rgba(10,10,10,0.05) 1px, transparent 0);
          background-size: 22px 22px;
        }
      `}</style>

      <SubLandingNav />
      <Hero config={config} product={product} />
      {config.logoBand && <LogoBand copy={config.logoBandCopy} />}
      {config.problem && <Problem config={config.problem} accent={product.color} />}
      <FeatureAlternating features={config.features} accent={product.color} />
      {config.howItWorks && <HowItWorks config={config.howItWorks} accent={product.color} />}
      {config.testimonial && <Testimonial config={config.testimonial} accent={product.color} />}
      {config.comparison && <Comparison config={config.comparison} accent={product.color} />}
      <SubLandingFAQ faq={config.faq} />
      <SubLandingCrossPromo exclude={config.slug} />
      <FinalCTA config={config} product={product} />
      <SubLandingFooter />
    </main>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────── */

function Hero({
  config,
  product,
}: {
  config: LandingConfig;
  product: ReturnType<typeof PRODUCTS.find> & NonNullable<unknown>;
}) {
  return (
    <section className="pt-[88px] pb-6 px-4 md:px-6">
      <div
        className="max-w-[1280px] mx-auto rounded-[26px] md:rounded-[32px] relative overflow-hidden"
        style={{
          background: `radial-gradient(120% 90% at 50% 120%, ${product!.color}1a 0%, #0b0a1a 35%, #060514 70%, #030210 100%)`,
          border: "1px solid rgba(255,255,255,0.06)",
          minHeight: "min(720px, 88vh)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.4), 0 60px 120px -30px rgba(10,10,30,0.55)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {[{ left: "18%", w: 200 }, { left: "42%", w: 220 }, { left: "66%", w: 200 }, { left: "86%", w: 180 }].map(
            (b, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: "-20%",
                  left: b.left,
                  width: b.w,
                  height: "130%",
                  background: `linear-gradient(180deg, ${product!.color}55 0%, transparent 70%)`,
                  filter: "blur(16px)",
                  transform: "skewX(-6deg)",
                  mixBlendMode: "screen",
                }}
              />
            )
          )}
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-5 md:px-10 pt-16 md:pt-24 pb-12">
          <div className="sl-reveal flex items-center gap-3 mb-8">
            <Product3DLogo product={product!} size={52} />
            <div className="text-left">
              <div
                style={{
                  fontSize: 11,
                  color: "#cbd5e1",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Horpen
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em" }}>
                {product!.name}
              </div>
            </div>
          </div>

          {config.heroBadge && (
            <div
              className="sl-reveal inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#cbd5e1",
                fontSize: 12,
                letterSpacing: "0.02em",
                "--sl-delay": "0.05s",
              } as React.CSSProperties}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: product!.color,
                  boxShadow: `0 0 8px ${product!.color}`,
                }}
              />
              {config.heroBadge}
            </div>
          )}

          <h1
            className="sl-reveal"
            style={{
              color: "#ffffff",
              fontSize: "clamp(36px, 5.5vw, 68px)",
              lineHeight: 1.04,
              letterSpacing: "-0.04em",
              fontWeight: 600,
              maxWidth: 960,
              "--sl-delay": "0.1s",
            } as React.CSSProperties}
          >
            {config.heroTitle}
          </h1>

          <p
            className="sl-reveal mt-6"
            style={{
              color: "#cbd5e1",
              fontSize: "clamp(16px, 1.4vw, 19px)",
              lineHeight: 1.55,
              maxWidth: 680,
              "--sl-delay": "0.2s",
            } as React.CSSProperties}
          >
            {config.heroSubtitle}
          </p>

          <div
            className="sl-reveal mt-9"
            style={{ "--sl-delay": "0.3s" } as React.CSSProperties}
          >
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
              style={{
                background: "#ffffff",
                color: "#0a0a0a",
                fontSize: 16,
                boxShadow: `0 8px 24px ${product!.color}40, 0 1px 0 rgba(255,255,255,0.4) inset`,
              }}
            >
              {config.heroCta}
              <ArrowRightInline />
            </Link>
          </div>

          {config.heroMockup && (
            <div
              className="sl-reveal mt-14 w-full flex justify-center"
              style={{ "--sl-delay": "0.4s" } as React.CSSProperties}
            >
              {config.heroMockup}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── Social proof logo band ────────────────────────────────────── */

function LogoBand({ copy }: { copy?: string }) {
  const monograms = [
    { label: "OP", bg: "#0a0a0a" },
    { label: "NV", bg: "#3b82f6" },
    { label: "KR", bg: "#6b7280" },
    { label: "MR", bg: "#0a0a0a" },
    { label: "OR", bg: "#6b7280" },
    { label: "LM", bg: "#0a0a0a" },
    { label: "FJ", bg: "#3b82f6" },
    { label: "AR", bg: "#6b7280" },
  ];
  return (
    <section className="py-14 md:py-18 px-5 md:px-8" style={{ borderBottom: "1px solid #ececec" }}>
      <div className="max-w-[1080px] mx-auto text-center">
        <p style={{ color: "#6b7280", fontSize: 13.5, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>
          {copy ?? "Utilisé par des créateurs et marques e-com dans 30+ pays"}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5 md:gap-8">
          {monograms.map((m, i) => (
            <div
              key={i}
              className="rounded-full flex items-center justify-center"
              style={{
                width: 46,
                height: 46,
                background: m.bg,
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                boxShadow: `0 4px 12px ${m.bg}30, inset 0 1px 2px rgba(255,255,255,0.2)`,
              }}
            >
              {m.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Problem section ───────────────────────────────────────────── */

function Problem({
  config,
  accent,
}: {
  config: NonNullable<LandingConfig["problem"]>;
  accent: string;
}) {
  void accent;
  return (
    <section className="py-20 md:py-28 px-5 md:px-8">
      <div className="max-w-[1080px] mx-auto">
        <div className="text-center mb-14">
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
            Sans Horpen
          </div>
          <h2
            style={{
              fontSize: "clamp(30px, 4vw, 48px)",
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              color: "#0a0a0a",
              maxWidth: 800,
              margin: "0 auto",
            }}
          >
            {config.title}
          </h2>
          {config.subtitle && (
            <p
              style={{
                marginTop: 18,
                color: "#6b7280",
                fontSize: 17,
                maxWidth: 620,
                margin: "18px auto 0",
                lineHeight: 1.55,
              }}
            >
              {config.subtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {config.pains.map((p, i) => (
            <div
              key={i}
              className="sl-reveal rounded-2xl p-6"
              style={{
                background: "#ffffff",
                border: "1px solid #ececec",
                "--sl-delay": `${i * 0.06}s`,
              } as React.CSSProperties}
            >
              <div
                style={{
                  color: "#dc2626",
                  fontSize: 22,
                  lineHeight: 1,
                  marginBottom: 14,
                  fontWeight: 600,
                }}
              >
                ✕
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.015em", marginBottom: 8 }}>
                {p.label}
              </div>
              <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.55 }}>
                {p.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Feature alternating rows ──────────────────────────────────── */

function FeatureAlternating({
  features,
  accent,
}: {
  features: LandingConfig["features"];
  accent: string;
}) {
  return (
    <section className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec", borderBottom: "1px solid #ececec" }}>
      <div className="max-w-[1280px] mx-auto space-y-24 md:space-y-32">
        {features.map((f, i) => {
          const reverse = i % 2 === 1;
          return (
            <div
              key={i}
              className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center ${
                reverse ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div className="sl-reveal">
                <div
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 700,
                    color: accent,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginBottom: 14,
                  }}
                >
                  {f.eyebrow}
                </div>
                <h3
                  style={{
                    fontSize: "clamp(28px, 3.5vw, 42px)",
                    lineHeight: 1.1,
                    letterSpacing: "-0.03em",
                    fontWeight: 600,
                    color: "#0a0a0a",
                    maxWidth: 460,
                  }}
                >
                  {f.title}
                </h3>
                <p
                  style={{
                    marginTop: 16,
                    color: "#6b7280",
                    fontSize: 17,
                    lineHeight: 1.55,
                    maxWidth: 480,
                  }}
                >
                  {f.desc}
                </p>
                {f.tags && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {f.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 12.5,
                          fontWeight: 500,
                          padding: "5px 11px",
                          borderRadius: 999,
                          background: `${accent}10`,
                          color: accent,
                          border: `1px solid ${accent}25`,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div
                className="sl-reveal sl-dotbg relative rounded-2xl overflow-hidden flex items-center justify-center p-8"
                style={{
                  background: "#fafafa",
                  border: "1px solid #ececec",
                  aspectRatio: "4/3",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -15px rgba(15,15,40,0.1)",
                  "--sl-delay": "0.1s",
                } as React.CSSProperties}
              >
                {f.visual}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── How it works ──────────────────────────────────────────────── */

function HowItWorks({
  config,
  accent,
}: {
  config: NonNullable<LandingConfig["howItWorks"]>;
  accent: string;
}) {
  return (
    <section className="py-20 md:py-28 px-5 md:px-8">
      <div className="max-w-[1080px] mx-auto">
        <div className="text-center mb-14">
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
            Comment ça marche
          </div>
          <h2
            style={{
              fontSize: "clamp(30px, 4vw, 48px)",
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              color: "#0a0a0a",
              maxWidth: 820,
              margin: "0 auto",
            }}
          >
            {config.title}
          </h2>
          {config.subtitle && (
            <p style={{ marginTop: 18, color: "#6b7280", fontSize: 17, maxWidth: 620, margin: "18px auto 0", lineHeight: 1.55 }}>
              {config.subtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.steps.map((s, i) => (
            <div
              key={i}
              className="sl-reveal relative"
              style={{ "--sl-delay": `${i * 0.08}s` } as React.CSSProperties}
            >
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  color: accent,
                  lineHeight: 1,
                  marginBottom: 12,
                  opacity: 0.85,
                }}
              >
                {s.number}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "#0a0a0a",
                  letterSpacing: "-0.02em",
                  marginBottom: 8,
                }}
              >
                {s.title}
              </div>
              <div style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.55 }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonial ───────────────────────────────────────────────── */

function Testimonial({
  config,
  accent,
}: {
  config: NonNullable<LandingConfig["testimonial"]>;
  accent: string;
}) {
  return (
    <section className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec", borderBottom: "1px solid #ececec" }}>
      <div className="max-w-[960px] mx-auto">
        <div className="flex items-center justify-center gap-1 mb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} style={{ color: accent, fontSize: 18 }}>★</span>
          ))}
        </div>
        <blockquote
          className="text-center"
          style={{
            fontSize: "clamp(22px, 2.6vw, 32px)",
            lineHeight: 1.35,
            letterSpacing: "-0.02em",
            color: "#0a0a0a",
            fontWeight: 500,
          }}
        >
          &ldquo;{config.quote}&rdquo;
        </blockquote>
        <div className="mt-10 flex items-center justify-center gap-4">
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${accent}, ${accent}88)`,
              border: "2px solid #ffffff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          />
          <div className="text-left">
            <div style={{ fontWeight: 600, color: "#0a0a0a", fontSize: 15 }}>{config.author}</div>
            <div style={{ color: "#6b7280", fontSize: 13 }}>{config.role}</div>
          </div>
        </div>
        {config.metrics && config.metrics.length > 0 && (
          <div className="mt-12 grid grid-cols-2 md:grid-cols-3 gap-5">
            {config.metrics.map((m, i) => (
              <div
                key={i}
                className="text-center rounded-xl p-5"
                style={{ background: "#fafafa", border: "1px solid #ececec" }}
              >
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    color: accent,
                    lineHeight: 1,
                  }}
                >
                  {m.value}
                </div>
                <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>{m.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Comparison table ──────────────────────────────────────────── */

function Comparison({
  config,
  accent,
}: {
  config: NonNullable<LandingConfig["comparison"]>;
  accent: string;
}) {
  const renderCell = (val: boolean | string, highlight = false) => {
    if (val === true) {
      return <span style={{ color: highlight ? accent : "#10b981", fontSize: 18, fontWeight: 600 }}>✓</span>;
    }
    if (val === false) {
      return <span style={{ color: "#9ca3af", fontSize: 16 }}>—</span>;
    }
    return (
      <span style={{ fontSize: 13, color: highlight ? "#0a0a0a" : "#6b7280", fontWeight: highlight ? 600 : 400 }}>
        {val}
      </span>
    );
  };

  return (
    <section className="py-20 md:py-28 px-5 md:px-8">
      <div className="max-w-[980px] mx-auto">
        <div className="text-center mb-12">
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
            Comparatif
          </div>
          <h2
            style={{
              fontSize: "clamp(28px, 3.5vw, 42px)",
              lineHeight: 1.15,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              color: "#0a0a0a",
              maxWidth: 800,
              margin: "0 auto",
            }}
          >
            {config.title}
          </h2>
          {config.subtitle && (
            <p style={{ marginTop: 16, color: "#6b7280", fontSize: 16, maxWidth: 620, margin: "16px auto 0" }}>
              {config.subtitle}
            </p>
          )}
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "#ffffff", border: "1px solid #ececec", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -15px rgba(15,15,40,0.08)" }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#fafafa", borderBottom: "1px solid #ececec" }}>
                <th style={{ padding: "14px 18px", textAlign: "left", fontWeight: 500, color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Feature
                </th>
                <th
                  style={{
                    padding: "14px 18px",
                    textAlign: "center",
                    fontWeight: 700,
                    color: accent,
                    fontSize: 13,
                    background: `${accent}08`,
                    borderLeft: `1px solid ${accent}25`,
                    borderRight: `1px solid ${accent}25`,
                  }}
                >
                  {config.usLabel}
                </th>
                {config.competitorLabels.map((label) => (
                  <th key={label} style={{ padding: "14px 18px", textAlign: "center", fontWeight: 500, color: "#6b7280", fontSize: 13 }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid #f3f4f6",
                  }}
                >
                  <td style={{ padding: "14px 18px", color: "#0a0a0a", fontWeight: 500 }}>{row.feature}</td>
                  <td
                    style={{
                      padding: "14px 18px",
                      textAlign: "center",
                      background: `${accent}06`,
                      borderLeft: `1px solid ${accent}18`,
                      borderRight: `1px solid ${accent}18`,
                    }}
                  >
                    {renderCell(row.us, true)}
                  </td>
                  {row.them.map((val, j) => (
                    <td key={j} style={{ padding: "14px 18px", textAlign: "center" }}>
                      {renderCell(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA with AEO buttons ────────────────────────────────── */

function FinalCTA({
  config,
  product,
}: {
  config: LandingConfig;
  product: ReturnType<typeof PRODUCTS.find> & NonNullable<unknown>;
}) {
  const aeoQuery = encodeURIComponent(
    `Que penses-tu de Horpen ${product!.name} (${product!.tagline}) ?`
  );
  return (
    <>
      <section className="py-24 md:py-32 px-5 md:px-8">
        <div className="max-w-[960px] mx-auto">
          <div
            className="rounded-[28px] p-10 md:p-16 text-center relative overflow-hidden"
            style={{
              background: `radial-gradient(120% 100% at 50% 0%, ${product!.color}22 0%, #08101d 50%, #02040a 100%)`,
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 60px 120px -30px rgba(10,10,30,0.4)",
            }}
          >
            <div className="relative z-10">
              <h2
                style={{
                  fontSize: "clamp(32px, 4.5vw, 52px)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.035em",
                  fontWeight: 600,
                  color: "#ffffff",
                  maxWidth: 780,
                  margin: "0 auto",
                }}
              >
                {config.finalCtaTitle}
              </h2>
              {config.finalCtaSub && (
                <p
                  style={{
                    marginTop: 18,
                    color: "#cbd5e1",
                    fontSize: 17,
                    maxWidth: 540,
                    margin: "18px auto 0",
                    lineHeight: 1.55,
                  }}
                >
                  {config.finalCtaSub}
                </p>
              )}
              <div className="mt-9">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
                  style={{
                    background: "#ffffff",
                    color: "#0a0a0a",
                    fontSize: 16,
                    boxShadow: `0 8px 24px ${product!.color}40`,
                  }}
                >
                  {config.finalCta}
                  <ArrowRightInline />
                </Link>
              </div>
            </div>
          </div>

          {/* AEO trick */}
          <div className="mt-14 text-center">
            <p style={{ color: "#6b7280", fontSize: 15, maxWidth: 560, margin: "0 auto" }}>
              Tu hésites encore ? Demande à ton IA préférée ce qu&apos;elle pense de {product!.name}.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {[
                { name: "ChatGPT", bg: "#10a37f", href: `https://chat.openai.com/?q=${aeoQuery}` },
                { name: "Claude", bg: "#cc785c", href: `https://claude.ai/new?q=${aeoQuery}` },
                { name: "Perplexity", bg: "#20808d", href: `https://www.perplexity.ai/search?q=${aeoQuery}` },
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
    </>
  );
}

/* ─── Arrow right inline ─── */

function ArrowRightInline() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* ─── Mockup primitives ─────────────────────────────────────────── */

/* Small helper components to build custom visuals for each feature
   section without every sub-landing duplicating raw CSS. Each takes
   an accent colour and returns a dotted-bg card with the specified
   illustration inside. */

export function MockupFrame({
  children,
  aspect = "4/3",
  dark = false,
}: {
  children: React.ReactNode;
  aspect?: string;
  dark?: boolean;
}) {
  return (
    <div
      className="relative rounded-xl overflow-hidden w-full"
      style={{
        aspectRatio: aspect,
        background: dark ? "#0a0a0a" : "#ffffff",
        border: `1px solid ${dark ? "#1f2937" : "#ececec"}`,
        boxShadow: "0 4px 16px rgba(15,15,40,0.08)",
      }}
    >
      {children}
    </div>
  );
}

export function MockupBrowserChrome({ url, dark }: { url: string; dark?: boolean }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{
        borderBottom: `1px solid ${dark ? "#1f2937" : "#ececec"}`,
        background: dark ? "#0a0a0a" : "#fafafa",
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24" }} />
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
      <div
        className="flex-1 mx-3 text-center"
        style={{
          fontSize: 10,
          color: dark ? "#6b7280" : "#9ca3af",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {url}
      </div>
    </div>
  );
}

export { ProductDock };
