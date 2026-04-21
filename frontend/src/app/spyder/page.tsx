"use client";

/**
 * Spyder — sous-landing produit.
 *
 * Positionnement : tracker tes concurrents 24/7. IA dédiée qui
 * archive leurs ads, leurs UGC, leurs hooks. Un clic = "Recréer dans
 * Canvas" pour générer ta version améliorée.
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, ChevronDown } from "@/components/Icons";
import {
  PRODUCTS,
  ProductDock,
  ProductDropdown,
  ProductDropdownTrigger,
  Product3DLogo,
} from "@/components/landing/shared";

const SPYDER = PRODUCTS.find((p) => p.slug === "spyder")!;

const FAQ = [
  {
    q: "Comment je tracke un concurrent ?",
    a: "Ajoute leur page Meta Ads Library, leur profil TikTok ou leur chaîne YouTube. Spyder scan 24/7 et archive automatiquement chaque nouvelle ad, chaque nouveau hook, chaque changement de creative. Tu as un historique complet à portée de main.",
  },
  {
    q: "Combien de concurrents je peux tracker ?",
    a: "3 en Free, 20 en Creator, illimité en Studio. Pour chaque concurrent, Spyder archive l'intégralité de leur bibliothèque Meta + leurs 30 derniers posts TikTok / YouTube / Instagram.",
  },
  {
    q: "Comment fonctionne « Recréer dans Canvas » ?",
    a: "Sur n'importe quelle ad archivée par Spyder, un clic sur « Recréer dans Canvas » extrait le style, le hook, l'angle et ouvre Canvas avec un prompt pré-rempli — ton produit remplacé, ton avatar à la place du leur. Tu édites si tu veux, tu génères.",
  },
  {
    q: "C'est légal de copier leurs ads ?",
    a: "Spyder reproduit des styles, angles et formats — jamais des assets propriétaires. Tu restes responsable de ne pas copier directement du texte, un logo ou une image sous copyright. Notre IA te prévient quand un élément est risqué.",
  },
  {
    q: "Qu'est-ce que l'IA extrait de leurs contenus ?",
    a: "Pour chaque ad : le hook d'ouverture, l'angle narratif, la durée, le CTA, les émotions déclenchées, le persona cible, l'ambiance visuelle. Tu as un scoring « probabilité de performance » et un rapport hebdo sur les tendances de ta niche.",
  },
];

export default function SpyderLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: "#fafafa", color: "#0a0a0a" }}
    >
      <style jsx global>{`
        @keyframes spyder-radar {
          0% { transform: rotate(0deg); opacity: 0.8; }
          100% { transform: rotate(360deg); opacity: 0.8; }
        }
        @keyframes spyder-fade-up {
          0% { opacity: 0; transform: translate3d(0, 24px, 0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes spyder-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .spyder-reveal {
          opacity: 0;
          animation: spyder-fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          animation-delay: var(--delay, 0s);
        }
      `}</style>

      <SubLandingNav menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      {/* ── HERO ── */}
      <section className="pt-[88px] pb-6 px-4 md:px-6">
        <div
          className="max-w-[1280px] mx-auto rounded-[26px] md:rounded-[32px] relative overflow-hidden"
          style={{
            background: `radial-gradient(120% 90% at 50% 120%, ${SPYDER.color}22 0%, #2a0a0a 35%, #1a0505 70%, #0a0202 100%)`,
            border: "1px solid rgba(255,255,255,0.06)",
            minHeight: "min(720px, 88vh)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.4), 0 60px 120px -30px rgba(40,10,10,0.55)",
          }}
        >
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {[
              { left: "20%", width: 200, delay: "0s" },
              { left: "45%", width: 220, delay: "1.2s" },
              { left: "70%", width: 200, delay: "0.6s" },
            ].map((b, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: "-20%",
                  left: b.left,
                  width: b.width,
                  height: "130%",
                  background: `linear-gradient(180deg, ${SPYDER.color}55 0%, transparent 70%)`,
                  filter: "blur(16px)",
                  transform: "skewX(-6deg)",
                  mixBlendMode: "screen",
                }}
              />
            ))}
          </div>

          <div className="relative z-10 flex flex-col items-center text-center px-5 md:px-10 pt-16 md:pt-24 pb-12">
            <div className="spyder-reveal flex items-center gap-3 mb-8">
              <Product3DLogo product={SPYDER} size={52} />
              <div className="text-left">
                <div style={{ fontSize: 11, color: "#fca5a5", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
                  Horpen
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em" }}>
                  Spyder
                </div>
              </div>
            </div>

            <h1
              className="spyder-reveal"
              style={{
                color: "#ffffff",
                fontSize: "clamp(36px, 5.5vw, 68px)",
                lineHeight: 1.04,
                letterSpacing: "-0.04em",
                fontWeight: 600,
                maxWidth: 960,
                "--delay": "0.1s",
              } as React.CSSProperties}
            >
              Tracke tes concurrents.
              <br />
              <span style={{ color: "#fca5a5" }}>Recrée leurs meilleures ads en 1 clic.</span>
            </h1>

            <p
              className="spyder-reveal mt-6"
              style={{
                color: "#cbd5e1",
                fontSize: "clamp(16px, 1.4vw, 19px)",
                lineHeight: 1.55,
                maxWidth: 680,
                "--delay": "0.2s",
              } as React.CSSProperties}
            >
              Spyder scan tes concurrents 24/7. Archive leurs ads, leurs UGC, leurs hooks. Une IA
              dédiée extrait tout ce qui marche. D&apos;un clic, tu recrées dans Canvas — avec ton
              produit, ton avatar, ton angle.
            </p>

            <div className="spyder-reveal mt-9" style={{ "--delay": "0.3s" } as React.CSSProperties}>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
                style={{
                  background: "#ffffff",
                  color: "#0a0a0a",
                  fontSize: 16,
                  boxShadow: `0 8px 24px ${SPYDER.color}50, 0 1px 0 rgba(255,255,255,0.4) inset`,
                }}
              >
                Tracker mes 3 premiers concurrents
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Radar visual */}
            <div className="spyder-reveal mt-14 relative" style={{ width: 320, height: 320, "--delay": "0.4s" } as React.CSSProperties}>
              {[140, 110, 80, 50].map((r, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: r * 2,
                    height: r * 2,
                    borderRadius: "50%",
                    border: `1px solid ${SPYDER.color}${["66", "55", "44", "33"][i]}`,
                    animation: `spyder-pulse ${3 + i * 0.4}s ease-in-out infinite ${i * 0.3}s`,
                  }}
                />
              ))}
              {/* Rotating scanner line */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: 140,
                  height: 2,
                  background: `linear-gradient(90deg, transparent, ${SPYDER.color}99)`,
                  transformOrigin: "0 50%",
                  animation: "spyder-radar 4s linear infinite",
                }}
              />
              {/* Concurrent dots */}
              {[
                { top: "25%", left: "70%", label: "ConcurrentA" },
                { top: "65%", left: "75%", label: "ConcurrentB" },
                { top: "55%", left: "22%", label: "ConcurrentC" },
              ].map((d, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: d.top,
                    left: d.left,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: SPYDER.color,
                    boxShadow: `0 0 16px ${SPYDER.color}, 0 0 32px ${SPYDER.color}80`,
                    animation: `spyder-pulse ${2 + i * 0.5}s ease-in-out infinite ${i * 0.3}s`,
                  }}
                />
              ))}
              {/* Center logo */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <Product3DLogo product={SPYDER} size={48} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3 BENEFITS ── */}
      <section className="py-20 md:py-28 px-5 md:px-8">
        <div className="max-w-[1080px] mx-auto">
          <div className="text-center mb-14">
            <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", lineHeight: 1.1, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a", maxWidth: 760, margin: "0 auto" }}>
              Ne devine plus ce qui marche.{" "}
              <span style={{ color: "#9ca3af" }}>Observe-le en direct.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {[
              {
                num: "01",
                title: "Scan 24/7",
                desc: "Chaque nouvelle ad, chaque UGC, chaque hook de tes concurrents est archivé automatiquement. Dashboard unifié Meta + TikTok + YouTube.",
              },
              {
                num: "02",
                title: "IA qui décode",
                desc: "Pour chaque creative : hook, angle, émotion, persona, CTA, ambiance. Scoring de perf estimé avant même que tu testes.",
              },
              {
                num: "03",
                title: "Recrée en 1 clic",
                desc: "Clic sur « Recréer dans Canvas ». Ton produit, ton avatar, même style. En 30 secondes t'as ta version améliorée.",
              },
            ].map((b, i) => (
              <div
                key={i}
                className="spyder-reveal rounded-2xl p-7"
                style={{
                  background: "#ffffff",
                  border: "1px solid #ececec",
                  boxShadow: "0 1px 1px rgba(15,15,40,0.03), 0 2px 4px rgba(15,15,40,0.04), 0 12px 32px -8px rgba(15,15,40,0.08)",
                  "--delay": `${i * 0.05}s`,
                } as React.CSSProperties}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: SPYDER.color, letterSpacing: "0.08em", marginBottom: 14 }}>
                  {b.num}
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em", lineHeight: 1.25 }}>
                  {b.title}
                </h3>
                <p style={{ marginTop: 10, color: "#6b7280", fontSize: 15, lineHeight: 1.55 }}>
                  {b.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow visual ── */}
      <section className="py-20 md:py-28 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec", borderBottom: "1px solid #ececec" }}>
        <div className="max-w-[1080px] mx-auto">
          <div className="text-center mb-14">
            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a" }}>
              De l&apos;observation à la création.{" "}
              <span style={{ color: "#9ca3af" }}>En un clic.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            <WorkflowStep
              step="1"
              title="Spyder observe"
              desc="L'ad concurrente apparaît dans ton dashboard avec son analyse IA."
            />
            <WorkflowStep
              step="2"
              title="1 clic « Recréer »"
              desc="Le hook, l'angle, le style sont extraits et envoyés à Canvas."
            />
            <WorkflowStep
              step="3"
              title="Ta version arrive"
              desc="Canvas génère avec ton produit / avatar. Publiable en 30s."
              accent
            />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 md:py-24 px-5 md:px-8">
        <div className="max-w-[820px] mx-auto">
          <h2 className="text-center mb-12" style={{ fontSize: "clamp(28px, 3.5vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a" }}>
            Questions sur Spyder
          </h2>
          <div className="space-y-2">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #ececec",
                    borderRadius: 14,
                    overflow: "hidden",
                    boxShadow: open ? "0 4px 12px rgba(0,0,0,0.04)" : "none",
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
        </div>
      </section>

      {/* ── Suite dock ── */}
      <section className="py-16 md:py-20 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec" }}>
        <div className="max-w-[1080px] mx-auto">
          <p className="text-center mb-10" style={{ color: "#6b7280", fontSize: 14, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>
            Spyder fait partie d&apos;une suite de 6 produits
          </p>
          <ProductDock dark={false} size={40} exclude="spyder" />
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 md:py-28 px-5 md:px-8">
        <div className="max-w-[820px] mx-auto text-center">
          <h2 style={{ fontSize: "clamp(30px, 4vw, 46px)", lineHeight: 1.1, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a" }}>
            Tes concurrents bossent pour toi.
            <br />
            <span style={{ color: "#9ca3af" }}>Il suffit de les regarder.</span>
          </h2>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
              style={{ background: "#0a0a0a", color: "#ffffff", fontSize: 16 }}
            >
              Commencer le tracking
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <SubLandingFooter />
    </main>
  );
}

function WorkflowStep({
  step,
  title,
  desc,
  accent,
}: {
  step: string;
  title: string;
  desc: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-7"
      style={{
        background: accent ? "#0a0a0a" : "#fafafa",
        color: accent ? "#ffffff" : "#0a0a0a",
        border: accent ? "1px solid #0a0a0a" : "1px solid #ececec",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: accent ? "rgba(255,255,255,0.12)" : "#ffffff",
          border: accent ? "1px solid rgba(255,255,255,0.2)" : "1px solid #ececec",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 15,
          marginBottom: 16,
        }}
      >
        {step}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 14.5, opacity: 0.7, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

/* ─── Nav + Footer partagés (dupliqués — à extraire plus tard) ─── */

function SubLandingNav({
  menuOpen,
  setMenuOpen,
}: {
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
}) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md" style={{ background: "rgba(250,250,250,0.82)", borderBottom: "1px solid #ececec" }}>
      <div className="max-w-[1280px] mx-auto px-5 md:px-8 h-[64px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#0a0a0a" }}>
            <Image src="/horpen-logo.png" alt="" width={20} height={20} priority style={{ objectFit: "contain" }} />
          </div>
          <span style={{ fontSize: 17, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em" }}>Horpen</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-[14px]">
          <ProductDropdownTrigger label="Produit">
            <ProductDropdown />
          </ProductDropdownTrigger>
          <Link href="/#pricing" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">Tarifs</Link>
          <Link href="/#faq" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">FAQ</Link>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden md:inline text-[14px]" style={{ color: "#555" }}>Se connecter</Link>
          <Link href="/signup" className="text-[14px] font-medium px-4 py-2 rounded-full transition" style={{ background: "#0a0a0a", color: "#ffffff" }}>Essai gratuit</Link>
          <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <div className="w-5 h-[2px] bg-[#0a0a0a] mb-1" />
            <div className="w-5 h-[2px] bg-[#0a0a0a] mb-1" />
            <div className="w-5 h-[2px] bg-[#0a0a0a]" />
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="md:hidden px-5 pb-5 flex flex-col gap-3 text-[15px]" style={{ borderTop: "1px solid #ececec" }}>
          {PRODUCTS.map((p) => (
            <Link key={p.slug} href={`/${p.slug}`} onClick={() => setMenuOpen(false)} className="flex items-center gap-3">
              <Product3DLogo product={p} size={32} glow={false} />
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{p.tagline}</div>
              </div>
            </Link>
          ))}
          <Link href="/#pricing" onClick={() => setMenuOpen(false)}>Tarifs</Link>
          <Link href="/#faq" onClick={() => setMenuOpen(false)}>FAQ</Link>
          <Link href="/login">Se connecter</Link>
        </div>
      )}
    </nav>
  );
}

function SubLandingFooter() {
  return (
    <footer style={{ background: "#fafafa", borderTop: "1px solid #ececec" }}>
      <div className="max-w-[1280px] mx-auto px-5 md:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="rounded-lg flex items-center justify-center" style={{ width: 28, height: 28, background: "#0a0a0a" }}>
            <Image src="/horpen-logo.png" alt="" width={18} height={18} style={{ objectFit: "contain" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#0a0a0a" }}>Horpen</span>
        </Link>
        <div style={{ fontSize: 13, color: "#9ca3af" }}>
          © {new Date().getFullYear()} Horpen.ai — Tous droits réservés.
        </div>
        <div className="flex items-center gap-4" style={{ fontSize: 13 }}>
          <Link href="/" style={{ color: "#6b7280" }} className="hover:text-[#0a0a0a]">Accueil</Link>
          <Link href="/#pricing" style={{ color: "#6b7280" }} className="hover:text-[#0a0a0a]">Tarifs</Link>
          <a href="mailto:support@horpen.ai" style={{ color: "#6b7280" }} className="hover:text-[#0a0a0a]">Support</a>
        </div>
      </div>
    </footer>
  );
}
