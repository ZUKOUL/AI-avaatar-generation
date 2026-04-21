"use client";

import { SubLanding, LandingConfig, MockupFrame, MockupBrowserChrome } from "@/components/landing/sub-landing";

const AVATAR: LandingConfig = {
  slug: "avatar",
  heroBadge: "⌘A pour ouvrir",
  heroTitle: (
    <>
      Ton influenceur IA,
      <br />
      <span style={{ color: "#c4b5fd" }}>réutilisable partout.</span>
    </>
  ),
  heroSubtitle:
    "Charge 6 à 12 photos, ou décris un persona. Avatar crée ton visage IA ultra-cohérent en 8 minutes — réutilisable dans Canvas, Adlab, Thumbs et Clipsy. Un seul visage, des milliers de variations.",
  heroCta: "Entraîner mon avatar",
  heroMockup: <HeroMockup />,

  logoBand: true,
  logoBandCopy: "Utilisé par des créateurs UGC, dropshippers et faceless accounts",

  problem: {
    title: (
      <>
        Tu paies 300€ par UGC.{" "}
        <span style={{ color: "#9ca3af" }}>Pour une vidéo que tu peux pas décliner.</span>
      </>
    ),
    subtitle:
      "Les UGC creators classiques te donnent UNE vidéo. Pas 50 variations. Pas un hook différent demain. Pas la même personne qui réapparaît sur ton ad Meta la semaine d'après.",
    pains: [
      { label: "UGC creator freelance : 200-400€/vidéo", desc: "À 4 vidéos/semaine, ça fait 3 500€/mois. Pour des créatrices que tu perds à chaque sprint." },
      { label: "Zéro cohérence entre les ads", desc: "Chaque nouvelle vidéo = nouvelle personne. Ton audience ne reconnaît jamais ta brand." },
      { label: "UGC standard IA = visages qui bougent", desc: "Arcads, Makeugc génèrent à la demande — mais le visage dérive d'une vidéo à l'autre. Pas d'identité stable." },
    ],
  },

  features: [
    {
      eyebrow: "Entraînement 8 min",
      title: "Upload 6 à 12 photos, ton avatar est prêt",
      desc:
        "Selfies, photos studio, peu importe — tant que c'est le même visage sous différents angles. Avatar génère un modèle persistent qui produira le même visage à chaque génération future, cohérent à 100%.",
      tags: ["6-12 photos requises", "8 min d'entraînement", "1 crédit"],
      visual: <FeatureTraining />,
    },
    {
      eyebrow: "Cross-product",
      title: "Ton avatar alimente toute la suite Horpen",
      desc:
        "Entraîne-le une fois, réutilise-le gratuitement. Canvas l'intègre dans tes visuels, Adlab en fait des ads UGC, Thumbs le met sur tes miniatures, Clipsy l'anime dans tes shorts. Ton brand facial est partout.",
      tags: ["Canvas · Adlab · Thumbs · Clipsy", "Réutilisation illimitée", "Cohérence garantie"],
      visual: <FeatureCrossProduct />,
    },
    {
      eyebrow: "Personas fictifs",
      title: "Pas envie de montrer ton visage ? Crée un persona",
      desc:
        "Décris âge, style, niche, univers. Avatar génère un personnage original ultra-cohérent. Parfait pour lancer un compte UGC faceless, un influenceur IA, ou plusieurs avatars pour tester des angles.",
      tags: ["Faceless content", "Influenceurs IA", "Multi-personas"],
      visual: <FeaturePersonas />,
    },
    {
      eyebrow: "Variations infinies",
      title: "Un seul visage, des angles, tenues, settings illimités",
      desc:
        "Ton avatar entraîné supporte des variations de tenue, de lieu, d'émotion, d'angle, de lumière. Tu prompts la scène, Avatar garde le même visage cohérent quel que soit le contexte.",
      tags: ["Changement de tenue", "Multi-settings", "Émotions pilotées"],
      visual: <FeatureVariations />,
    },
  ],

  howItWorks: {
    title: (
      <>
        De tes photos à ton avatar IA.{" "}
        <span style={{ color: "#9ca3af" }}>3 étapes, 8 minutes.</span>
      </>
    ),
    steps: [
      { number: "01", title: "Upload tes photos", desc: "6-12 photos du même visage, angles variés, bonne lumière. Ou décris un persona fictif." },
      { number: "02", title: "Avatar s'entraîne", desc: "8 minutes chrono, 1 crédit. Tu peux lancer d'autres tâches pendant." },
      { number: "03", title: "Réutilise partout", desc: "Dans Canvas, Adlab, Thumbs, Clipsy — gratis, illimité, cohérent à chaque fois." },
    ],
  },

  testimonial: {
    quote:
      "J'avais un budget UGC de 1 800€/mois pour 4 vidéos d'une créatrice. Depuis Avatar, j'ai créé ma persona IA, elle tourne sur mes 12 ads Meta simultanément, même visage partout. ROAS passé de 1,4 à 3,1.",
    author: "Léa M.",
    role: "Fondatrice marque beauté · 180k€ ARR",
    metrics: [
      { value: "-95%", label: "Coût UGC mensuel" },
      { value: "2,2×", label: "ROAS Meta" },
      { value: "20/sem", label: "Ads produites" },
    ],
  },

  comparison: {
    title: (
      <>
        Avatar vs{" "}
        <span style={{ color: "#9ca3af" }}>les UGC creators IA standards</span>
      </>
    ),
    subtitle: "La concurrence génère un UGC à la fois. Avatar te donne une identité réutilisable.",
    usLabel: "Horpen Avatar",
    competitorLabels: ["Arcads", "Makeugc", "HeyGen"],
    rows: [
      { feature: "Visage 100% cohérent entre générations", us: true, them: [false, false, "Partiel"] },
      { feature: "Réutilisable sur d'autres produits", us: true, them: [false, false, false] },
      { feature: "Entraîne ton propre visage", us: true, them: ["Limité", "Limité", true] },
      { feature: "Personas fictifs sur mesure", us: true, them: ["Bibliothèque fixe", "Bibliothèque fixe", "Limité"] },
      { feature: "Variations de tenue / setting", us: true, them: ["Limité", false, "Limité"] },
      { feature: "Prix / mois", us: "Inclus dès 35€", them: ["110$", "99$", "24$/vidéo"] },
      { feature: "Droits commerciaux inclus", us: true, them: [true, true, true] },
    ],
  },

  faq: [
    {
      q: "Combien de photos je dois uploader pour entraîner mon avatar ?",
      a: "6 minimum, 12 idéal. Même visage, angles différents (face, 3/4, profil), éclairage varié, pas de sunglasses. Plus c'est diversifié, plus la cohérence sera forte dans les variations futures.",
    },
    {
      q: "Combien de temps dure l'entraînement ?",
      a: "8 minutes en moyenne sur la file standard, 3 minutes en file prioritaire (plan Studio). Tu peux lancer d'autres tâches pendant, tu reçois une notif quand c'est prêt.",
    },
    {
      q: "Je peux créer plusieurs avatars ?",
      a: "1 avatar en plan Free, 3 en Creator, illimité en Studio. Idéal si tu veux tester plusieurs personas pour des comptes UGC différents ou des niches différentes.",
    },
    {
      q: "Mon avatar reste privé ?",
      a: "100%. Seul ton compte peut l'utiliser. Aucun partage, aucun accès tiers, aucun entraînement secondaire sur tes données. Tu peux le supprimer à tout moment.",
    },
    {
      q: "Je peux générer un avatar fictif sans uploader mes photos ?",
      a: "Oui. Décris le persona (âge, genre, style, niche), Avatar génère un personnage original ultra-cohérent que tu peux utiliser librement. Parfait pour lancer un faceless account.",
    },
    {
      q: "Mon avatar peut changer de tenue, de contexte, d'émotion ?",
      a: "Oui. Une fois entraîné, tu prompts la scène (« robe d'été dans un café parisien, sourire naturel ») et Avatar garde le même visage cohérent dans le nouveau contexte.",
    },
    {
      q: "C'est compatible avec mes ads Meta / TikTok ?",
      a: "Entièrement. Tu peux utiliser ton avatar dans Adlab pour générer des ads Meta / TikTok, dans Thumbs pour des miniatures YouTube, dans Clipsy pour des Shorts vidéo. Droits commerciaux inclus dès Creator.",
    },
    {
      q: "En quoi c'est différent d'Arcads ou Makeugc ?",
      a: "Arcads / Makeugc te donnent un UGC à la pièce, avec un visage qui varie d'une génération à l'autre. Avatar entraîne TON avatar une fois, puis tu le réutilises gratis avec 100% de cohérence sur toute la suite Horpen.",
    },
  ],

  finalCtaTitle: (
    <>
      Un visage IA.
      <br />
      <span style={{ color: "#94a3b8" }}>Des milliers de variations.</span>
    </>
  ),
  finalCtaSub: "1 avatar gratuit en plan Free pour tester. Pas de CB, pas d'engagement.",
  finalCta: "Créer mon avatar",
};

export default function AvatarLanding() {
  return <SubLanding config={AVATAR} />;
}

/* ─── Mockups ─── */

function HeroMockup() {
  return (
    <div className="w-full max-w-[720px]">
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "#ffffff",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 32px 80px -16px rgba(139,92,246,0.3)",
        }}
      >
        <MockupBrowserChrome url="horpen.ai/avatar" />
        <div className="p-5">
          <div
            style={{
              fontSize: 10,
              color: "#9ca3af",
              fontFamily: "ui-monospace, monospace",
              marginBottom: 10,
              padding: "8px 10px",
              background: "#fafafa",
              borderRadius: 8,
              border: "1px solid #ececec",
            }}
          >
            📤 Upload : 8 photos prêtes pour entraînement
          </div>
          <div className="grid grid-cols-4 gap-2">
            {["#e9d5ff", "#d8b4fe", "#c4b5fd", "#a78bfa"].map((c, i) => (
              <div
                key={i}
                className="relative rounded-lg overflow-hidden"
                style={{
                  aspectRatio: "3/4",
                  background: `linear-gradient(180deg, ${c}, #7c3aed)`,
                  border: "2px solid #fff",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "28%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.55)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "40%",
                    background: "rgba(255,255,255,0.4)",
                    borderTopLeftRadius: "50%",
                    borderTopRightRadius: "50%",
                    transform: "scaleX(1.4)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureTraining() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4">
        <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 }}>
          Entraînement en cours
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {["#f3e8ff", "#e9d5ff", "#d8b4fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9"].map((c, i) => (
            <div
              key={i}
              className="rounded-md relative"
              style={{ aspectRatio: "1", background: c, border: "1px solid rgba(0,0,0,0.05)" }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: i < 5 ? "#10b981" : "#d1d5db",
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i < 5 ? "✓" : ""}
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "#f3f4f6", overflow: "hidden" }}>
          <div style={{ width: "63%", height: "100%", background: "linear-gradient(90deg, #8b5cf6, #a78bfa)" }} />
        </div>
        <div className="flex items-center justify-between mt-2" style={{ fontSize: 11, color: "#6b7280" }}>
          <span>5 min restantes</span>
          <span style={{ color: "#8b5cf6", fontWeight: 600 }}>63%</span>
        </div>
      </div>
    </MockupFrame>
  );
}

function FeatureCrossProduct() {
  const targets = [
    { name: "Canvas", color: "#3b82f6" },
    { name: "Adlab", color: "#f59e0b" },
    { name: "Thumbs", color: "#ef4444" },
    { name: "Clipsy", color: "#10b981" },
  ];
  return (
    <MockupFrame aspect="4/3">
      <div className="p-5 h-full flex items-center">
        <div className="relative w-full">
          <div
            className="mx-auto rounded-xl flex items-center justify-center"
            style={{
              width: 80,
              height: 80,
              background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              color: "#fff",
              fontSize: 28,
              boxShadow: "0 12px 32px rgba(139,92,246,0.35)",
            }}
          >
            A
          </div>
          <div className="flex items-center justify-between mt-6 gap-3">
            {targets.map((t) => (
              <div key={t.name} className="flex-1 relative">
                <svg
                  width="100%"
                  height="20"
                  viewBox="0 0 100 20"
                  style={{ position: "absolute", top: -20, left: 0 }}
                >
                  <path d="M50 0 L50 20" stroke={t.color} strokeWidth="1.5" strokeDasharray="2 3" opacity="0.5" />
                </svg>
                <div
                  className="rounded-lg p-2 text-center"
                  style={{
                    background: `${t.color}15`,
                    border: `1px solid ${t.color}40`,
                    fontSize: 11,
                    fontWeight: 600,
                    color: t.color,
                  }}
                >
                  {t.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

function FeaturePersonas() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 grid grid-cols-3 gap-2 h-full">
        {[
          { g: "linear-gradient(180deg, #fce7f3, #ec4899)", label: "Sarah · 24 · beauté" },
          { g: "linear-gradient(180deg, #dbeafe, #3b82f6)", label: "Tom · 32 · tech" },
          { g: "linear-gradient(180deg, #dcfce7, #10b981)", label: "Emma · 28 · lifestyle" },
        ].map((p, i) => (
          <div
            key={i}
            className="relative rounded-lg overflow-hidden"
            style={{ background: p.g, border: "1px solid rgba(0,0,0,0.05)" }}
          >
            <div
              style={{
                position: "absolute",
                top: "25%",
                left: "50%",
                transform: "translateX(-50%)",
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.55)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 6,
                left: 6,
                right: 6,
                fontSize: 9,
                color: "#fff",
                background: "rgba(0,0,0,0.65)",
                padding: "2px 6px",
                borderRadius: 4,
                textAlign: "center",
                fontWeight: 500,
              }}
            >
              {p.label}
            </div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function FeatureVariations() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 grid grid-cols-4 gap-2 h-full">
        {[
          { label: "Studio", g: "linear-gradient(180deg, #f3f4f6, #9ca3af)" },
          { label: "Café Paris", g: "linear-gradient(180deg, #fef3c7, #f59e0b)" },
          { label: "Plage", g: "linear-gradient(180deg, #bae6fd, #0ea5e9)" },
          { label: "Bureau", g: "linear-gradient(180deg, #ede9fe, #8b5cf6)" },
        ].map((v, i) => (
          <div
            key={i}
            className="relative rounded-md overflow-hidden"
            style={{ background: v.g, border: "1px solid rgba(0,0,0,0.05)" }}
          >
            <div
              style={{
                position: "absolute",
                top: "30%",
                left: "50%",
                transform: "translateX(-50%)",
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.6)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 4,
                left: 4,
                right: 4,
                fontSize: 8,
                color: "#fff",
                background: "rgba(0,0,0,0.6)",
                padding: "1px 4px",
                borderRadius: 3,
                textAlign: "center",
                fontWeight: 500,
              }}
            >
              {v.label}
            </div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}
