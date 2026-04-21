"use client";

import { SubLanding, LandingConfig, MockupFrame, MockupBrowserChrome } from "@/components/landing/sub-landing";

const TRACKIFY: LandingConfig = {
  slug: "trackify",
  heroBadge: "Nouveau",
  heroTitle: (
    <>
      Tracke tes concurrents.
      <br />
      <span style={{ color: "#d1d5db" }}>Recrée leurs meilleures ads en 1 clic.</span>
    </>
  ),
  heroSubtitle:
    "Trackify scan tes concurrents 24/7. Archive leurs ads, leurs UGC, leurs hooks. Une IA dédiée extrait tout ce qui marche. D'un clic, tu recrées dans Canvas — avec ton produit, ton avatar, ton angle.",
  heroCta: "Tracker mes 3 premiers concurrents",
  heroMockup: <HeroMockup />,

  logoBand: true,
  logoBandCopy: "Utilisé par des marques e-com pour espionner leurs compétiteurs US",

  problem: {
    title: (
      <>
        Tes concurrents sortent 20 ads/semaine.{" "}
        <span style={{ color: "#9ca3af" }}>Tu les rates toutes.</span>
      </>
    ),
    subtitle:
      "Pendant que tu bosses sur ta prochaine créa, 3 concurrents US testent 50 angles que tu vas découvrir 6 mois trop tard. Ou jamais.",
    pains: [
      { label: "Ouvrir Meta Ads Library à la main", desc: "30 minutes par jour à scroller. Tu rates 80% des ads discrètes qui performent." },
      { label: "Copier-coller dans Notion", desc: "Screenshots, captions, liens partout. Impossible de remonter un pattern sur 3 mois." },
      { label: "Deviner quel angle va marcher", desc: "Sans data réelle, tu testes à l'aveugle. Tu cramps ton budget avant de trouver le winning." },
    ],
  },

  features: [
    {
      eyebrow: "Scan 24/7",
      title: "Chaque nouvelle ad de tes concurrents est archivée automatiquement",
      desc:
        "Ajoute une page Meta Ads Library, un handle TikTok, une chaîne YouTube ou un site. Trackify scan en continu, archive chaque creative dès qu'elle apparaît. Ton historique est complet et centralisé.",
      tags: ["Meta Ads Library", "TikTok", "Instagram", "YouTube", "Web"],
      visual: <FeatureScan />,
    },
    {
      eyebrow: "IA qui décode",
      title: "Hook, angle, émotion, persona — tout est extrait automatiquement",
      desc:
        "Pour chaque ad archivée, Trackify extrait le hook d'ouverture, l'angle narratif, l'émotion dominante, le persona cible, le CTA, le scoring de perf estimé. Tu vois en 5 secondes pourquoi ça marche.",
      tags: ["Hook detection", "Angle mining", "Perf scoring"],
      visual: <FeatureDecode />,
    },
    {
      eyebrow: "Recréer en 1 clic",
      title: "« Recreate in Canvas » — ta version arrive en 30 secondes",
      desc:
        "L'ad qui te plaît ? Clique « Recréer ». Trackify extrait style + hook + angle, les envoie à Canvas avec ton produit + ton avatar. Ta version est prête à publier, 100% originale, inspirée de ce qui marche.",
      tags: ["Pipeline auto", "Canvas prefill", "100% original"],
      visual: <FeatureRecreate />,
    },
    {
      eyebrow: "Trend detection",
      title: "Les formats qui explosent dans ta niche — en temps réel",
      desc:
        "Trackify détecte les hooks / angles / formats qui explosent cette semaine dans ta niche. Tu reçois une alerte quand une tendance émerge, tu la duplique avant que tout le monde la fasse.",
      tags: ["Trend alerts", "Niche tracking", "Velocity scoring"],
      visual: <FeatureTrends />,
    },
  ],

  howItWorks: {
    title: (
      <>
        De la veille manuelle à l&apos;intel automatisée.{" "}
        <span style={{ color: "#9ca3af" }}>3 étapes.</span>
      </>
    ),
    steps: [
      { number: "01", title: "Ajoute un concurrent", desc: "URL Meta Ads Library, TikTok, Insta ou YouTube. Trackify scan sous 5 minutes." },
      { number: "02", title: "L'IA archive et analyse", desc: "Chaque ad est extraite, décomposée (hook/angle/émotion), scorée, indexée pour ta niche." },
      { number: "03", title: "Recrée ce qui marche", desc: "Clic « Recreate in Canvas » sur une ad top-perf → ta version avec ton produit en 30s." },
    ],
  },

  testimonial: {
    quote:
      "Je trackais 3 concurrents US en drop beauté. En 2 mois, j'ai cloné 6 winning ads qu'ils ont testées et validées pour moi. ROAS 4,8 sur ces créas — j'ai jamais autant économisé en tests inutiles.",
    author: "Yanis K.",
    role: "E-commerçant beauté dropshipping · 45k€/mois",
    metrics: [
      { value: "3", label: "Concurrents US trackés" },
      { value: "6", label: "Winners clonés" },
      { value: "4,8×", label: "ROAS moyen" },
    ],
  },

  comparison: {
    title: (
      <>
        Trackify vs{" "}
        <span style={{ color: "#9ca3af" }}>les autres spy tools</span>
      </>
    ),
    subtitle: "La concurrence archive. Trackify archive, décode et te laisse recréer en 1 clic.",
    usLabel: "Horpen Trackify",
    competitorLabels: ["Pipiads", "Minea", "AdSpy"],
    rows: [
      { feature: "Scan Meta + TikTok + YouTube", us: true, them: [true, true, "Meta seul"] },
      { feature: "Analyse IA par ad", us: true, them: [false, "Partiel", false] },
      { feature: "Recréer en 1 clic dans Canvas", us: true, them: [false, false, false] },
      { feature: "Trend alerts niche", us: true, them: [true, false, false] },
      { feature: "Partagé avec Avatar / Adlab", us: true, them: [false, false, false] },
      { feature: "Prix / mois", us: "Inclus dès 35€", them: ["77$", "59$", "149$"] },
      { feature: "Nombre de brands trackables", us: "3-∞", them: ["Illimité", "200", "Illimité"] },
    ],
  },

  faq: [
    {
      q: "Combien de concurrents je peux tracker ?",
      a: "3 en plan Free, 20 en Creator, illimité en Studio. Pour chaque brand, Trackify archive l'intégralité de sa bibliothèque Meta + ses 30 derniers posts TikTok / YouTube / Instagram.",
    },
    {
      q: "Combien de temps avant que je vois des résultats ?",
      a: "Premier scan sous 5 minutes après ajout. Historique complet des 90 derniers jours archivé dans les 2 heures. Ensuite scan continu (chaque nouvelle ad détectée sous 15 min).",
    },
    {
      q: "Comment fonctionne « Recréer dans Canvas » ?",
      a: "Sur n'importe quelle ad archivée, clic « Recréer ». Trackify extrait hook + angle + style via IA, pré-remplit Canvas avec ton produit + ton avatar + le brief adapté. Tu valides et ça génère en 30 secondes.",
    },
    {
      q: "C'est légal de cloner leurs ads ?",
      a: "Trackify reproduit un style, un angle, un format. Jamais un asset propriétaire, jamais un texte verbatim, jamais un logo. L'IA te prévient si ta candidate s'approche trop de la source. Responsable et safe copyright.",
    },
    {
      q: "Ça scan quelles plateformes exactement ?",
      a: "Meta Ads Library (Facebook + Instagram Ads), TikTok (profils + ads), Instagram (profils publics), YouTube (chaînes + pub YouTube), sites web via leur blog / landing pages.",
    },
    {
      q: "L'analyse IA marche en français ?",
      a: "Oui, 40+ langues supportées. Hook detection et angle mining marchent indépendamment de la langue. Idéal si tu tracks des concurrents US pour adapter au marché FR.",
    },
    {
      q: "Je peux partager mes brands avec ma team ?",
      a: "Oui. Si tu as un Team Horpen, tous les membres voient les mêmes brands trackées, peuvent commenter les ads archivées et lancer des recreate. Parfait pour les agences.",
    },
    {
      q: "Et si un concurrent me track en retour ?",
      a: "Tu peux activer le « Private mode » dans tes settings — Trackify ne log pas d'accès public à tes assets Horpen et masque ta fingerprint dans leurs ads libraries.",
    },
  ],

  finalCtaTitle: (
    <>
      Tes concurrents bossent pour toi.
      <br />
      <span style={{ color: "#94a3b8" }}>Il suffit de les regarder.</span>
    </>
  ),
  finalCtaSub: "Track 3 concurrents gratuitement. Résultats sous 2h.",
  finalCta: "Commencer le tracking",
};

export default function TrackifyLanding() {
  return <SubLanding config={TRACKIFY} />;
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
          boxShadow: "0 32px 80px -16px rgba(220,38,38,0.35)",
        }}
      >
        <MockupBrowserChrome url="horpen.ai/trackify" />
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3" style={{ fontSize: 10, color: "#9ca3af", fontFamily: "ui-monospace, monospace" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#dc2626", boxShadow: "0 0 8px #dc2626" }} />
            Scan live · 3 brands actives
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { brand: "ConcurrentA", ads: 47, color: "#dc2626" },
              { brand: "ConcurrentB", ads: 23, color: "#991b1b" },
              { brand: "ConcurrentC", ads: 68, color: "#7f1d1d" },
            ].map((b, i) => (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: b.color, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {b.brand.charAt(11)}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: "#0a0a0a" }}>{b.brand}</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626" }}>{b.ads}</div>
                <div style={{ fontSize: 9.5, color: "#6b7280" }}>ads trackées</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureScan() {
  const platforms = [
    { name: "Meta", count: 847, color: "#3b82f6" },
    { name: "TikTok", count: 412, color: "#0a0a0a" },
    { name: "Instagram", count: 289, color: "#ec4899" },
    { name: "YouTube", count: 156, color: "#dc2626" },
  ];
  return (
    <MockupFrame aspect="4/3">
      <div className="p-5 space-y-2.5">
        {platforms.map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-lg"
            style={{ background: "#fafafa", border: "1px solid #ececec" }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: p.color,
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {p.name.charAt(0)}
            </div>
            <div className="flex-1">
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0a0a0a" }}>{p.name}</div>
              <div style={{ fontSize: 10.5, color: "#10b981", fontWeight: 500 }}>● Scan actif</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{p.count}</div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function FeatureDecode() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4">
        <div className="flex gap-3 mb-3">
          <div
            style={{
              width: 80,
              aspectRatio: "9/16",
              borderRadius: 8,
              background: "linear-gradient(180deg, #991b1b, #dc2626)",
              border: "2px solid #fff",
              flexShrink: 0,
            }}
          />
          <div className="flex-1 space-y-1.5">
            {[
              { label: "Hook", val: "POV : tu découvres…", c: "#3b82f6" },
              { label: "Angle", val: "Before / after extrême", c: "#8b5cf6" },
              { label: "Émotion", val: "Surprise + désir", c: "#ec4899" },
              { label: "Persona", val: "F 25-35, skincare", c: "#10b981" },
              { label: "Score perf", val: "94/100", c: "#dc2626" },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2" style={{ padding: "5px 9px", background: "#fafafa", borderRadius: 6, border: "1px solid #ececec" }}>
                <span style={{ fontSize: 9.5, color: "#6b7280", fontWeight: 500 }}>{r.label}</span>
                <span style={{ fontSize: 10.5, color: r.c, fontWeight: 600 }}>{r.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

function FeatureRecreate() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 h-full flex items-center gap-3">
        <div
          style={{
            width: 90,
            aspectRatio: "9/16",
            borderRadius: 8,
            background: "linear-gradient(180deg, #991b1b, #dc2626)",
            border: "2px solid #fff",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", top: 4, left: 4, fontSize: 8, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "2px 5px", borderRadius: 3, fontWeight: 600 }}>
            SOURCE
          </div>
        </div>
        <div className="flex flex-col items-center gap-1" style={{ color: "#dc2626" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>→</div>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>1 clic</div>
          <div style={{ fontSize: 9, color: "#6b7280" }}>30 s</div>
        </div>
        <div
          style={{
            width: 90,
            aspectRatio: "9/16",
            borderRadius: 8,
            background: "linear-gradient(180deg, #1e40af, #3b82f6)",
            border: "2px solid #3b82f6",
            flexShrink: 0,
            position: "relative",
            boxShadow: "0 8px 20px rgba(59,130,246,0.3)",
          }}
        >
          <div style={{ position: "absolute", top: 4, left: 4, fontSize: 8, color: "#fff", background: "rgba(59,130,246,0.9)", padding: "2px 5px", borderRadius: 3, fontWeight: 600 }}>
            TA VERSION
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

function FeatureTrends() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 space-y-2.5">
        {[
          { name: "POV morning routine", vel: "+340%", hot: true },
          { name: "Before/after diet", vel: "+180%" },
          { name: "Unboxing surprise", vel: "+120%" },
          { name: "Reaction moms", vel: "+95%" },
        ].map((t, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 p-2.5 rounded-lg"
            style={{ background: t.hot ? "#fef2f2" : "#fafafa", border: `1px solid ${t.hot ? "#fecaca" : "#ececec"}` }}
          >
            {t.hot && (
              <span style={{ fontSize: 14 }}>🔥</span>
            )}
            <div className="flex-1">
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a" }}>{t.name}</div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>Dans ta niche · 7 derniers jours</div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: t.hot ? "#dc2626" : "#10b981",
                padding: "2px 7px",
                borderRadius: 999,
                background: t.hot ? "#fee2e2" : "#dcfce7",
              }}
            >
              {t.vel}
            </span>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}
