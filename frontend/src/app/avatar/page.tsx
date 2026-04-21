"use client";

/**
 * Avatar — sous-landing produit.
 *
 * Positionnement : ton influenceur IA réutilisable. Charge une photo,
 * Horpen génère ton avatar ultra-cohérent, réutilisable sur tous les
 * autres produits de la suite (Canvas, Adlab, Thumbs, Autoclip).
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

const AVATAR = PRODUCTS.find((p) => p.slug === "avatar")!;

const FAQ = [
  {
    q: "Comment Horpen crée mon avatar IA ?",
    a: "Charge 6 à 12 photos de ton visage (différents angles, bonnes lumières). En 8 minutes, Horpen entraîne ton avatar personnel. Tu peux ensuite le réutiliser partout dans la suite (Canvas, Adlab, Thumbs, Autoclip) — il garde les mêmes traits à chaque génération.",
  },
  {
    q: "Je peux créer un avatar fictif ?",
    a: "Oui. Décris le profil (âge, style, niche), Horpen te génère un personnage original ultra-cohérent. Parfait pour lancer un compte UGC faceless ou un influenceur IA.",
  },
  {
    q: "Combien d'avatars je peux avoir ?",
    a: "Illimité en plan Studio. 3 en Creator. 1 en Free. Chaque avatar coûte des crédits à entraîner une fois, puis est gratuit à réutiliser.",
  },
  {
    q: "Mes avatars sont privés ?",
    a: "100 %. Seul ton compte peut les utiliser. Horpen ne partage ni ne revend aucun avatar.",
  },
];

export default function AvatarLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: "#fafafa", color: "#0a0a0a" }}
    >
      <style jsx global>{`
        @keyframes avatar-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes avatar-fade-up {
          0% { opacity: 0; transform: translate3d(0, 24px, 0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .avatar-reveal {
          opacity: 0;
          animation: avatar-fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          animation-delay: var(--delay, 0s);
        }
        .avatar-dotbg {
          background-image: radial-gradient(circle at 1px 1px, rgba(10,10,10,0.05) 1px, transparent 0);
          background-size: 22px 22px;
        }
      `}</style>

      {/* ── NAV ── */}
      <SubLandingNav menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      {/* ── HERO ── */}
      <section className="pt-[88px] pb-6 px-4 md:px-6">
        <div
          className="max-w-[1280px] mx-auto rounded-[26px] md:rounded-[32px] relative overflow-hidden"
          style={{
            background: `radial-gradient(120% 90% at 50% 120%, ${AVATAR.color}20 0%, #1a0f2e 35%, #0a0515 70%, #050210 100%)`,
            border: "1px solid rgba(255,255,255,0.06)",
            minHeight: "min(720px, 88vh)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.4), 0 60px 120px -30px rgba(20,10,40,0.55)",
          }}
        >
          {/* Purple beams */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {[
              { left: "15%", width: 180, delay: "0s" },
              { left: "35%", width: 200, delay: "1.4s" },
              { left: "55%", width: 220, delay: "0.7s" },
              { left: "75%", width: 180, delay: "2.1s" },
            ].map((b, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: "-20%",
                  left: b.left,
                  width: b.width,
                  height: "130%",
                  background: `linear-gradient(180deg, ${AVATAR.color}55 0%, transparent 70%)`,
                  filter: "blur(16px)",
                  transform: "skewX(-6deg)",
                  mixBlendMode: "screen",
                }}
              />
            ))}
          </div>

          <div className="relative z-10 flex flex-col items-center text-center px-5 md:px-10 pt-16 md:pt-24 pb-12">
            <div className="avatar-reveal flex items-center gap-3 mb-8" style={{ "--delay": "0s" } as React.CSSProperties}>
              <Product3DLogo product={AVATAR} size={52} />
              <div className="text-left">
                <div style={{ fontSize: 11, color: "#cbd5e1", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
                  Horpen
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em" }}>
                  Avatar
                </div>
              </div>
            </div>

            <h1
              className="avatar-reveal"
              style={{
                color: "#ffffff",
                fontSize: "clamp(36px, 5.5vw, 68px)",
                lineHeight: 1.04,
                letterSpacing: "-0.04em",
                fontWeight: 600,
                maxWidth: 920,
                "--delay": "0.1s",
              } as React.CSSProperties}
            >
              Ton influenceur IA,
              <br />
              <span style={{ color: "#c4b5fd" }}>réutilisable partout.</span>
            </h1>

            <p
              className="avatar-reveal mt-6"
              style={{
                color: "#cbd5e1",
                fontSize: "clamp(16px, 1.4vw, 19px)",
                lineHeight: 1.55,
                maxWidth: 640,
                "--delay": "0.2s",
              } as React.CSSProperties}
            >
              Charge tes photos ou décris un profil. Horpen entraîne ton avatar ultra-cohérent en
              8 minutes — réutilisable dans Canvas, Adlab, Thumbs et Autoclip. Un seul visage,
              infinies variations.
            </p>

            <div className="avatar-reveal mt-9" style={{ "--delay": "0.3s" } as React.CSSProperties}>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
                style={{
                  background: "#ffffff",
                  color: "#0a0a0a",
                  fontSize: 16,
                  boxShadow: `0 8px 24px ${AVATAR.color}40, 0 1px 0 rgba(255,255,255,0.4) inset`,
                }}
              >
                Créer mon avatar
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Avatars demo row */}
            <div className="avatar-reveal mt-14 flex items-end gap-4 justify-center" style={{ "--delay": "0.4s" } as React.CSSProperties}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="relative rounded-2xl overflow-hidden"
                  style={{
                    width: i === 2 ? 160 : 120,
                    height: i === 2 ? 210 : 160,
                    background: `linear-gradient(180deg, ${AVATAR.color}99, #1a0f2e)`,
                    border: "2px solid rgba(255,255,255,0.15)",
                    boxShadow: `0 16px 40px -8px ${AVATAR.color}40`,
                    animation: `avatar-float ${4 + i * 0.3}s ease-in-out infinite ${i * 0.2}s`,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "30%",
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: i === 2 ? 48 : 36,
                      height: i === 2 ? 48 : 36,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.4)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: "45%",
                      background: "rgba(255,255,255,0.3)",
                      borderTopLeftRadius: "50%",
                      borderTopRightRadius: "50%",
                      transform: "scaleX(1.5)",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 3 BENEFITS ── */}
      <section className="py-20 md:py-28 px-5 md:px-8">
        <div className="max-w-[1080px] mx-auto">
          <div className="text-center mb-14">
            <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", lineHeight: 1.1, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a", maxWidth: 720, margin: "0 auto" }}>
              Un avatar. Toute la suite.{" "}
              <span style={{ color: "#9ca3af" }}>Cohérence garantie.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {[
              {
                num: "01",
                title: "Entraîné en 8 minutes",
                desc: "Upload 6 à 12 photos. Horpen crée ton avatar IA ultra-réaliste. Tu l'utilises dans toutes tes créas ensuite, gratuitement.",
              },
              {
                num: "02",
                title: "Cohérent à 100 %",
                desc: "Même visage, mêmes traits à chaque génération. Pas de dérive IA, pas de variations bizarres d'une photo à l'autre.",
              },
              {
                num: "03",
                title: "Réutilisable partout",
                desc: "Ton avatar alimente Canvas, Adlab, Thumbs et Autoclip. Une seule identité pour toute ta stack créa.",
              },
            ].map((b, i) => (
              <div
                key={i}
                className="avatar-reveal rounded-2xl p-7"
                style={{
                  background: "#ffffff",
                  border: "1px solid #ececec",
                  boxShadow: "0 1px 1px rgba(15,15,40,0.03), 0 2px 4px rgba(15,15,40,0.04), 0 12px 32px -8px rgba(15,15,40,0.08)",
                  "--delay": `${i * 0.05}s`,
                } as React.CSSProperties}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: AVATAR.color, letterSpacing: "0.08em", marginBottom: 14 }}>
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

      {/* ── Comparatif vs Arcads ── */}
      <section className="py-20 md:py-24 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec", borderBottom: "1px solid #ececec" }}>
        <div className="max-w-[960px] mx-auto">
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a", textAlign: "center", marginBottom: 40 }}>
            Pourquoi pas Arcads ou Makeugc ?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CompCol name="Arcads" price="$110/mo" points={["Génération UGC seulement", "Pas d'ads, pas de miniatures", "Avatars non réutilisables ailleurs"]} dim />
            <CompCol name="Horpen Avatar" price="$35/mo" points={["Avatar réutilisable sur 5 autres produits", "Même visage dans Ads, Thumbs, Canvas…", "Entraînement en 8 min, use illimité"]} highlight />
            <CompCol name="Makeugc" price="$99/mo" points={["UGC + photos produit", "Ne combine pas avec les ads ou miniatures", "Tools séparés, 3 abonnements"]} dim />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 md:py-24 px-5 md:px-8">
        <div className="max-w-[820px] mx-auto">
          <h2 className="text-center mb-12" style={{ fontSize: "clamp(28px, 3.5vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a" }}>
            Questions sur Avatar
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
            Avatar fait partie d&apos;une suite de 6 produits
          </p>
          <ProductDock dark={false} size={40} exclude="avatar" />
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 md:py-28 px-5 md:px-8">
        <div className="max-w-[820px] mx-auto text-center">
          <h2 style={{ fontSize: "clamp(30px, 4vw, 46px)", lineHeight: 1.1, letterSpacing: "-0.035em", fontWeight: 600, color: "#0a0a0a" }}>
            Crée ton avatar en 8 minutes.
          </h2>
          <p style={{ marginTop: 18, color: "#6b7280", fontSize: 17, maxWidth: 540, margin: "18px auto 0", lineHeight: 1.55 }}>
            Gratuit pour le premier avatar. Aucune CB requise.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
              style={{ background: "#0a0a0a", color: "#ffffff", fontSize: 16 }}
            >
              Essai gratuit
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <SubLandingFooter />
    </main>
  );
}

function CompCol({
  name,
  price,
  points,
  highlight,
  dim,
}: {
  name: string;
  price: string;
  points: string[];
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: highlight ? "#0a0a0a" : "#fafafa",
        color: highlight ? "#ffffff" : "#0a0a0a",
        border: highlight ? "1px solid #0a0a0a" : "1px solid #ececec",
        opacity: dim ? 0.6 : 1,
        boxShadow: highlight ? "0 16px 40px -8px rgba(0,0,0,0.2)" : "none",
      }}
    >
      <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 6 }}>{name}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 16 }}>
        {price}
      </div>
      <ul className="space-y-2">
        {points.map((p) => (
          <li key={p} className="flex gap-2" style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.45 }}>
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Nav & Footer (partagés entre sous-landings) ─── */

function SubLandingNav({
  menuOpen,
  setMenuOpen,
}: {
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
}) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
      style={{
        background: "rgba(250,250,250,0.82)",
        borderBottom: "1px solid #ececec",
      }}
    >
      <div className="max-w-[1280px] mx-auto px-5 md:px-8 h-[64px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#0a0a0a" }}>
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
          <Link href="/#pricing" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">Tarifs</Link>
          <Link href="/#faq" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">FAQ</Link>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden md:inline text-[14px]" style={{ color: "#555" }}>
            Se connecter
          </Link>
          <Link href="/signup" className="text-[14px] font-medium px-4 py-2 rounded-full transition" style={{ background: "#0a0a0a", color: "#ffffff" }}>
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
