"use client";

import { SubLanding, LandingConfig, MockupFrame, MockupBrowserChrome } from "@/components/landing/sub-landing";

const ADLAB: LandingConfig = {
  slug: "adlab",
  heroBadge: "⌘D pour ouvrir",
  heroTitle: (
    <>
      Des ads qui convertissent.
      <br />
      <span style={{ color: "#67e8f9" }}>Testées à l&apos;infini.</span>
    </>
  ),
  heroSubtitle:
    "Adlab génère 10 variantes d'un même angle, A/B test automatiquement, détecte la gagnante et clone son style. Hook scoring IA avant publication. Ton compte pub n'a plus qu'à dépenser.",
  heroCta: "Générer mes premières ads",
  heroMockup: <HeroMockup />,

  logoBand: true,
  logoBandCopy: "Utilisé par des drop, e-com et D2C qui scalent sur Meta / TikTok",

  problem: {
    title: (
      <>
        Tu payes ton designer 40€ la créa.{" "}
        <span style={{ color: "#9ca3af" }}>Sans garantie que ça convertisse.</span>
      </>
    ),
    subtitle:
      "La roue des ads tourne tous les 14 jours. Tes winners fatiguent. Tes challengers flop. Tu recommences. Toujours à court de variantes pour tester.",
    pains: [
      { label: "Designer freelance : 40-80€ la créa", desc: "À 15 créas par semaine, ça fait 3 000€/mois. Sans data perf, tu paies pour des flops." },
      { label: "Ad fatigue sous 10 jours", desc: "Même ta winning ad s'épuise. Si tu n'as pas 30 variantes en stock, tu coupes ton volume." },
      { label: "Hook testé à l'aveugle", desc: "Tu postes, tu attends 48h, tu découvres que le hook était mauvais. 200€ de budget cramé." },
    ],
  },

  features: [
    {
      eyebrow: "10 variantes / angle",
      title: "Décris ton produit, récupère 10 ads prêtes à tester",
      desc:
        "Un angle = 10 hooks + 10 copies + 10 visuels (UGC, product shot, before/after). Formats Meta Ads Manager / TikTok Ads Manager / Google Ads natifs. Téléchargement en CSV pour upload bulk.",
      tags: ["Meta / TikTok / Google", "Export CSV", "UGC + product + B/A"],
      visual: <FeatureVariants />,
    },
    {
      eyebrow: "A/B auto-détecté",
      title: "Lance 10 variantes, Adlab détecte la gagnante sous 48h",
      desc:
        "Connecte ton compte Meta Ads. Adlab monitore ROAS / CTR / scroll-stop par variante, élimine les perdantes, double le budget sur les winners. Plus aucune décision manuelle.",
      tags: ["Meta Ads direct", "ROAS monitoring", "Budget auto-scaling"],
      visual: <FeatureABTest />,
    },
    {
      eyebrow: "Hook scoring",
      title: "Chaque hook reçoit un score avant publication",
      desc:
        "L'IA compare chaque hook à un dataset de 2M+ ads e-com scorées sur perf réelle. Tu obtiens un « score scroll-stop » de 0 à 100. Publies que les hooks >75, tu économises tes tests.",
      tags: ["2M ads training set", "Scoring 0-100", "Économise 30% du budget test"],
      visual: <FeatureHookScoring />,
    },
    {
      eyebrow: "Templates par niche",
      title: "Battle-testées sur ta niche spécifique",
      desc:
        "Packs de templates par niche : beauté, food, fitness, fashion, tech, SaaS B2B. Hooks qui ont déjà fait +3 ROAS sur des marques similaires. Tu choisis, tu adaptes, tu publies.",
      tags: ["Beauté · Food · Fitness · Fashion", "Adaptés à ta niche", "Updated chaque semaine"],
      visual: <FeatureTemplates />,
    },
  ],

  howItWorks: {
    title: (
      <>
        De ton produit à tes 10 ads.{" "}
        <span style={{ color: "#9ca3af" }}>En 2 minutes.</span>
      </>
    ),
    steps: [
      { number: "01", title: "Upload ton produit", desc: "Photo + 2 lignes de description. Adlab récupère la niche, le persona cible, le pain point." },
      { number: "02", title: "Choisis un angle", desc: "POV creator, before/after, social proof, unboxing, comparaison, reaction. 10 variantes générées par angle." },
      { number: "03", title: "Lance et scale", desc: "Export CSV pour upload Meta / TikTok. Ou connexion directe pour A/B auto + budget scaling." },
    ],
  },

  testimonial: {
    quote:
      "Avant Adlab, je faisais 3-5 ads par semaine avec un designer à 60€. Aujourd'hui j'en ai 30 live en permanence, ROAS 4,2 moyen vs 2,1 avant. J'ai scaled ma boutique de 60k€/mois à 180k€/mois en 4 mois.",
    author: "Hugo P.",
    role: "E-commerçant drop fitness · 180k€/mois",
    metrics: [
      { value: "30", label: "Ads live /semaine" },
      { value: "2×", label: "ROAS" },
      { value: "3×", label: "Revenue /mois" },
    ],
  },

  comparison: {
    title: (
      <>
        Adlab vs{" "}
        <span style={{ color: "#9ca3af" }}>les générateurs d&apos;ads classiques</span>
      </>
    ),
    subtitle: "La concurrence génère. Adlab génère, score, teste et scale.",
    usLabel: "Horpen Adlab",
    competitorLabels: ["AdCreative.ai", "Creatify", "Arcads"],
    rows: [
      { feature: "10 variantes par angle", us: true, them: [true, "5", "1"] },
      { feature: "Hook scoring pré-publication", us: true, them: [false, false, false] },
      { feature: "A/B auto + scaling direct Meta", us: true, them: [false, false, false] },
      { feature: "Templates par niche", us: true, them: [true, "Limité", false] },
      { feature: "UGC vidéo IA", us: true, them: [false, true, true] },
      { feature: "Prix / mois", us: "Dès 35€", them: ["41$", "49$", "110$"] },
      { feature: "Partagé avec Avatar / Thumbs", us: true, them: [false, false, false] },
    ],
  },

  faq: [
    {
      q: "Adlab se connecte à mon compte Meta Ads ?",
      a: "Oui, intégration native Meta Ads Manager + TikTok Ads Manager. Tu autorises une fois, Adlab peut lancer des campagnes, monitorer ROAS par variante, scaler le budget des winners automatiquement.",
    },
    {
      q: "Quels angles d'ads sont supportés ?",
      a: "POV creator, before/after, social proof, unboxing, comparaison, reaction, POV customer, educational. Plus d'angles arrivent chaque mois (demandes communauté Skool).",
    },
    {
      q: "Comment fonctionne le hook scoring ?",
      a: "L'IA compare ton hook à un dataset de 2M+ ads e-commerce historiques avec leur perf réelle. Elle détecte les patterns de hooks qui scrollent-stop (longueur, mots, émotion, structure). Score 0-100, précision ±12%.",
    },
    {
      q: "Je peux utiliser mon avatar Horpen dans les ads ?",
      a: "Oui. Si tu as un Avatar entraîné, Adlab l'utilise sur les formats UGC. Ta créatrice ou ton persona IA apparaît dans toutes tes ads UGC — cohérence totale de brand.",
    },
    {
      q: "Combien de crédits consomme une génération ?",
      a: "3 crédits / angle (= 10 variantes). Donc 30 crédits pour 100 variantes. Les templates niche sont gratuits à charger, tu payes uniquement la génération.",
    },
    {
      q: "Les ads sont au format Meta / TikTok natif ?",
      a: "Oui. 1:1 (Feed), 4:5 (Mobile feed), 9:16 (Stories / Reels / TikTok), 16:9 (YouTube pré-roll). Texte à l'image optimisé par format, CTA intégré selon plateforme.",
    },
    {
      q: "Mes ads sont à moi ?",
      a: "100%. Droits commerciaux inclus dès Creator. Tu peux monétiser, relancer, revendre — c'est ton asset marketing.",
    },
    {
      q: "Tu trackes le ROAS réel après publication ?",
      a: "Oui, si tu connectes Meta / TikTok Ads. Adlab remonte ROAS, CTR, scroll-stop rate, CPA par variante, et utilise cette data pour améliorer ses prochaines générations (boucle d'apprentissage).",
    },
  ],

  finalCtaTitle: (
    <>
      Ton prochain winning ad.
      <br />
      <span style={{ color: "#94a3b8" }}>Déjà dans Adlab, t&apos;as juste pas cliqué.</span>
    </>
  ),
  finalCtaSub: "10 ads offertes pour tester. Pas de CB, pas d'engagement.",
  finalCta: "Générer mes 10 premières ads",
};

export default function AdlabLanding() {
  return <SubLanding config={ADLAB} />;
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
          boxShadow: "0 32px 80px -16px rgba(245,158,11,0.35)",
        }}
      >
        <MockupBrowserChrome url="horpen.ai/adlab" />
        <div className="p-5">
          <div
            style={{
              fontSize: 10.5,
              color: "#92400e",
              fontFamily: "ui-monospace, monospace",
              marginBottom: 10,
              padding: "8px 10px",
              background: "#fef3c7",
              borderRadius: 8,
              border: "1px solid #fde68a",
            }}
          >
            🎯 Angle : POV creator · Skincare · 10 variantes
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { c: "#dc2626", win: true },
              { c: "#f59e0b" },
              { c: "#ec4899" },
              { c: "#8b5cf6" },
              { c: "#3b82f6" },
              { c: "#10b981", win: true },
              { c: "#0a0a0a" },
              { c: "#6b7280" },
              { c: "#f97316" },
              { c: "#6366f1" },
            ].map((v, i) => (
              <div
                key={i}
                className="relative rounded-md overflow-hidden"
                style={{
                  aspectRatio: "1/1",
                  background: `linear-gradient(135deg, ${v.c}, ${v.c}88)`,
                  border: v.win ? "2px solid #10b981" : "1px solid rgba(0,0,0,0.05)",
                  boxShadow: v.win ? "0 0 12px rgba(16,185,129,0.4)" : "none",
                }}
              >
                {v.win && (
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      fontSize: 8,
                      color: "#fff",
                      background: "#10b981",
                      padding: "1px 4px",
                      borderRadius: 3,
                      fontWeight: 700,
                    }}
                  >
                    WIN
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureVariants() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4">
        <div style={{ fontSize: 11, color: "#92400e", fontWeight: 600, marginBottom: 10, padding: "4px 10px", background: "#fef3c7", borderRadius: 6, display: "inline-block" }}>
          Angle : Before / After
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md"
              style={{
                aspectRatio: "1/1",
                background: `linear-gradient(135deg, ${["#f59e0b", "#dc2626", "#8b5cf6", "#3b82f6", "#10b981"][i % 5]}, #92400e)`,
                border: "1px solid rgba(0,0,0,0.05)",
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 10, textAlign: "center" }}>
          10 variantes hook + copy + visuel
        </div>
      </div>
    </MockupFrame>
  );
}

function FeatureABTest() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-5 space-y-2.5">
        {[
          { name: "Variant A", roas: 4.2, win: true },
          { name: "Variant B", roas: 3.1, win: true },
          { name: "Variant C", roas: 1.8 },
          { name: "Variant D", roas: 1.1 },
          { name: "Variant E", roas: 0.7 },
        ].map((v, i) => (
          <div key={i} className="flex items-center gap-3">
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", width: 60 }}>{v.name}</div>
            <div className="flex-1 h-5 rounded" style={{ background: "#f3f4f6", position: "relative", overflow: "hidden" }}>
              <div
                style={{
                  width: `${v.roas * 20}%`,
                  height: "100%",
                  background: v.win ? "linear-gradient(90deg, #10b981, #34d399)" : "#d1d5db",
                }}
              />
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: v.win ? "#10b981" : "#9ca3af", width: 54, textAlign: "right" }}>
              ROAS {v.roas}
            </div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function FeatureHookScoring() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 space-y-2">
        {[
          { hook: "POV : tu découvres qu'on peut…", score: 94, ok: true },
          { hook: "Je l'ai testé pendant 7 jours…", score: 82, ok: true },
          { hook: "Mon expert beauté m'a dit…", score: 58 },
          { hook: "Regarde ce que ça fait quand…", score: 76, ok: true },
          { hook: "C'est le moment de changer…", score: 34 },
        ].map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2"
            style={{ padding: "7px 10px", background: "#fafafa", borderRadius: 8, border: "1px solid #ececec" }}
          >
            <div style={{ fontSize: 11, color: "#0a0a0a", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.hook}
            </div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 999,
                background: item.ok ? "#dcfce7" : "#fee2e2",
                color: item.ok ? "#10b981" : "#dc2626",
              }}
            >
              {item.score}
            </div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function FeatureTemplates() {
  const niches = [
    { n: "Beauté", c: "#ec4899" },
    { n: "Food", c: "#f59e0b" },
    { n: "Fitness", c: "#10b981" },
    { n: "Fashion", c: "#8b5cf6" },
    { n: "Tech", c: "#3b82f6" },
    { n: "SaaS B2B", c: "#0a0a0a" },
  ];
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 grid grid-cols-3 gap-2">
        {niches.map((n, i) => (
          <div
            key={i}
            className="rounded-lg p-3 text-center"
            style={{ background: `${n.c}10`, border: `1px solid ${n.c}30` }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: n.c,
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 8px",
              }}
            >
              {n.n.charAt(0)}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "#0a0a0a" }}>{n.n}</div>
            <div style={{ fontSize: 9.5, color: "#6b7280", marginTop: 2 }}>24 templates</div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}
