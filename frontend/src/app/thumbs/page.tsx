"use client";

import { SubLanding, LandingConfig, MockupFrame, MockupBrowserChrome } from "@/components/landing/sub-landing";

const THUMBS: LandingConfig = {
  slug: "thumbs",
  heroBadge: "Nouveau",
  heroTitle: (
    <>
      La miniature YouTube
      <br />
      <span style={{ color: "#6ee7b7" }}>qui fait cliquer. En 5 secondes.</span>
    </>
  ),
  heroSubtitle:
    "Colle un lien de vidéo. Thumbs analyse le hook, l'émotion et le persona cible, puis génère 6 miniatures candidates avec CTR scoring. Ton avatar IA est intégré automatiquement.",
  heroCta: "Créer ma première miniature",
  heroMockup: <HeroMockup />,

  logoBand: true,
  logoBandCopy: "Utilisé par des créateurs YouTube de 10k à 2M d'abonnés",

  problem: {
    title: (
      <>
        Tu passes 30 min par miniature.{" "}
        <span style={{ color: "#9ca3af" }}>Et elles flop quand même.</span>
      </>
    ),
    subtitle:
      "Le problème n'est pas ton Photoshop. C'est que les patterns qui marchent changent toutes les 2 semaines.",
    pains: [
      { label: "Designer en freelance : 40€/miniature", desc: "À 5 vidéos par semaine, ça fait 800€/mois. Sans garantie de CTR." },
      { label: "Canva + templates génériques", desc: "Tu reconnais la template au premier coup d'œil. Ton audience aussi." },
      { label: "Tu devines ce qui marche", desc: "Sans scoring, tu publies à l'aveugle. Tu découvres le CTR 48h trop tard." },
    ],
  },

  features: [
    {
      eyebrow: "Analyse IA",
      title: "Thumbs lit ta vidéo avant de la shooter",
      desc:
        "Upload le lien YouTube ou la vidéo brute. L'IA extrait le transcript, détecte le hook dominant, l'émotion principale et le persona cible. La miniature est pensée pour CE contenu précis, pas générique.",
      tags: ["Transcript parsing", "Hook detection", "Persona targeting"],
      visual: <FeatureAnalyze />,
    },
    {
      eyebrow: "Avatar intégré",
      title: "Ton visage, cohérent sur toute ta chaîne",
      desc:
        "Si tu as un Avatar entraîné dans Horpen, Thumbs l'embarque automatiquement. Même éclairage, même direction de regard, même brand. Tes miniatures deviennent reconnaissables instantanément.",
      tags: ["Cross-product", "Brand consistency", "Auto-pose"],
      visual: <FeatureAvatar />,
    },
    {
      eyebrow: "CTR scoring",
      title: "Sache laquelle va performer avant de publier",
      desc:
        "Chaque candidate reçoit un CTR estimé (0-100) basé sur ta niche, ton audience et les patterns YouTube 2024. Tu gardes la plus forte, tu jettes les autres. Fini le pari.",
      tags: ["CTR prediction", "A/B ready", "Niche-aware"],
      visual: <FeatureCTR />,
    },
    {
      eyebrow: "Clone de viraux",
      title: "Une miniature qui a cartonné ? Reproduis la recette.",
      desc:
        "Colle un lien YouTube viral. Thumbs décortique le framing, la typo, la composition — puis applique la même recette à ton sujet. Légal, 100% original. Tu copies la méthode, pas l'asset.",
      tags: ["Viral analysis", "Style transfer", "Copyright-safe"],
      visual: <FeatureClone />,
    },
  ],

  howItWorks: {
    title: (
      <>
        De l&apos;URL à la miniature.{" "}
        <span style={{ color: "#9ca3af" }}>3 étapes, 5 secondes.</span>
      </>
    ),
    steps: [
      { number: "01", title: "Colle ton lien", desc: "URL YouTube, Loom ou fichier vidéo direct. Thumbs fait l'analyse derrière." },
      { number: "02", title: "Choisis la candidate", desc: "6 miniatures générées avec CTR estimé. Pick la plus forte en 1 clic." },
      { number: "03", title: "Publie et track", desc: "Export direct en 1280×720. Le CTR réel remonte sous 48h et update tes prochains scorings." },
    ],
  },

  testimonial: {
    quote:
      "Avant Thumbs je faisais ma miniature sur Canva en 30 min, CTR moyen 5,2 %. En un mois avec Thumbs, j'ai tapé 11,4 % de CTR moyen sur ma chaîne. J'ai doublé mes vues sans rien changer d'autre.",
    author: "Marc T.",
    role: "Créateur YouTube business · 180k abonnés",
    metrics: [
      { value: "+120%", label: "CTR moyen" },
      { value: "2M", label: "Vues gagnées/mois" },
      { value: "5 s", label: "Temps par miniature" },
    ],
  },

  comparison: {
    title: (
      <>
        Pourquoi Thumbs vs{" "}
        <span style={{ color: "#9ca3af" }}>les autres outils miniatures ?</span>
      </>
    ),
    subtitle: "Les concurrents font de la génération. Thumbs fait de la performance.",
    usLabel: "Horpen Thumbs",
    competitorLabels: ["Thumio", "Canva", "Photoshop"],
    rows: [
      { feature: "Analyse du contenu vidéo", us: true, them: [false, false, false] },
      { feature: "CTR scoring pré-publication", us: true, them: [false, false, false] },
      { feature: "Avatar IA intégré", us: true, them: [false, false, false] },
      { feature: "Clone de miniatures virales", us: true, them: [false, false, false] },
      { feature: "Temps par miniature", us: "5 s", them: ["30 s", "15 min", "45 min"] },
      { feature: "Prix / mois", us: "Inclus dès 35€", them: ["19€", "13€", "24€ (licence)"] },
      { feature: "Droits commerciaux inclus", us: true, them: [true, "Limité", true] },
    ],
  },

  faq: [
    {
      q: "Comment fonctionne le CTR scoring ?",
      a: "Thumbs compare ta miniature candidate à un dataset de miniatures YouTube de ta niche avec leur CTR réel. L'IA prédit un CTR estimé en fonction du contraste, de la typographie, de l'émotion faciale, de la composition. La précision est +/-15% en moyenne.",
    },
    {
      q: "Ça marche avec quel format de vidéo ?",
      a: "YouTube long-form, Shorts, Reels, TikTok, Loom, Vimeo. Tu peux aussi uploader un fichier MP4 brut. Durées de 30s à 4h supportées.",
    },
    {
      q: "Je peux mettre mon visage ?",
      a: "Oui. Si tu as un Avatar entraîné dans Horpen, Thumbs l'intègre automatiquement. Sinon tu uploades 2-3 photos du créateur et Thumbs crée un avatar temporaire pour la miniature.",
    },
    {
      q: "Est-ce que je peux cloner une miniature concurrente ?",
      a: "Tu peux reproduire un style, un framing, une palette. Jamais un texte ou un visage exact. Thumbs te prévient si ta candidate s'approche trop de la source. Responsable et safe copyright.",
    },
    {
      q: "Quels formats d'export ?",
      a: "1280×720 (YouTube long), 1080×1920 (Shorts vertical), 1080×1080 (Reels square), WebP + PNG + JPG. 4K en plan Studio.",
    },
    {
      q: "Combien de miniatures je peux générer ?",
      a: "10 en plan Free, 80 en Creator, 300 en Studio. Chaque génération retourne 6 candidates — tu choisis celle que tu publies, les 5 autres sont gratuites à retravailler.",
    },
    {
      q: "Thumbs marche pour les Shorts / Reels / TikTok ?",
      a: "Oui. Le mode vertical (1080×1920) est optimisé pour le cover frame TikTok / Reels / Shorts. Scoring spécifique pour chaque plateforme (le hook qui marche sur YouTube n'est pas le même que sur TikTok).",
    },
    {
      q: "Mes miniatures sont à moi ?",
      a: "100%. Droits commerciaux inclus dès le plan Creator. Tu monétises, tu republies, tu revends — c'est ton asset.",
    },
  ],

  finalCtaTitle: (
    <>
      Ta prochaine miniature.
      <br />
      <span style={{ color: "#94a3b8" }}>Dans 5 secondes.</span>
    </>
  ),
  finalCtaSub:
    "10 miniatures offertes pour tester. Pas de CB, pas d'engagement.",
  finalCta: "Générer ma première miniature",
};

export default function ThumbsLanding() {
  return <SubLanding config={THUMBS} />;
}

/* ─── Mockup visuals ─── */

function HeroMockup() {
  return (
    <div className="w-full max-w-[720px]">
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "#ffffff",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 32px 80px -16px rgba(239,68,68,0.3)",
        }}
      >
        <MockupBrowserChrome url="horpen.ai/thumbs" />
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
            → https://youtube.com/watch?v=demo
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { g: "linear-gradient(135deg, #1e40af, #3b82f6)", ctr: 11.2 },
              { g: "linear-gradient(135deg, #991b1b, #dc2626)", ctr: 8.7 },
              { g: "linear-gradient(135deg, #374151, #6b7280)", ctr: 6.4 },
            ].map((t, i) => (
              <div
                key={i}
                className="relative rounded-lg overflow-hidden"
                style={{ aspectRatio: "16/9", background: t.g, border: "2px solid #fff", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    padding: "2px 6px",
                    borderRadius: 6,
                    background: i === 0 ? "#10b981" : "rgba(0,0,0,0.65)",
                    fontSize: 9,
                    color: "#fff",
                    fontWeight: 700,
                  }}
                >
                  CTR {t.ctr}%
                </div>
                {i === 0 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      border: "3px solid #10b981",
                      borderRadius: 8,
                      boxShadow: "0 0 20px rgba(16,185,129,0.5)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureAnalyze() {
  return (
    <MockupFrame aspect="4/3">
      <MockupBrowserChrome url="analyse.thumbs" />
      <div className="p-4 space-y-2">
        {[
          { label: "Hook détecté", val: "“J'ai testé pendant 30 jours”", color: "#3b82f6" },
          { label: "Émotion", val: "Curiosité / surprise", color: "#8b5cf6" },
          { label: "Persona", val: "Entrepreneur 25-40", color: "#10b981" },
          { label: "CTR estimé", val: "9.4 %", color: "#dc2626" },
        ].map((row, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ background: "#fafafa", border: "1px solid #ececec" }}
          >
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>{row.label}</div>
            <div style={{ fontSize: 12, color: row.color, fontWeight: 600 }}>{row.val}</div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function FeatureAvatar() {
  return (
    <div className="flex items-center justify-center gap-3 w-full">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl overflow-hidden relative"
          style={{
            width: "30%",
            aspectRatio: "16/9",
            background: `linear-gradient(135deg, ${["#dc2626", "#991b1b", "#fca5a5"][i]}, ${["#7f1d1d", "#450a0a", "#dc2626"][i]})`,
            border: "2px solid #ffffff",
            boxShadow: "0 8px 20px rgba(239,68,68,0.25)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "25%",
              right: "15%",
              width: "35%",
              height: "50%",
              borderRadius: "50% 50% 45% 45%",
              background: "rgba(255,255,255,0.4)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 6,
              left: 6,
              right: 6,
              height: 8,
              borderRadius: 2,
              background: "rgba(255,255,255,0.85)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function FeatureCTR() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-6 space-y-3">
        {[
          { label: "Variant A", ctr: 11.2, win: true },
          { label: "Variant B", ctr: 8.7 },
          { label: "Variant C", ctr: 6.4 },
          { label: "Variant D", ctr: 4.1 },
        ].map((v, i) => (
          <div key={i} className="flex items-center gap-3">
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", width: 60 }}>{v.label}</div>
            <div className="flex-1 h-6 rounded" style={{ background: "#f3f4f6", position: "relative", overflow: "hidden" }}>
              <div
                style={{
                  width: `${v.ctr * 7}%`,
                  height: "100%",
                  background: v.win ? "linear-gradient(90deg, #10b981, #34d399)" : "#d1d5db",
                }}
              />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: v.win ? "#10b981" : "#9ca3af", width: 48, textAlign: "right" }}>
              {v.ctr}%
            </div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function FeatureClone() {
  return (
    <div className="flex items-center justify-center gap-4 w-full">
      <div
        className="rounded-xl overflow-hidden relative"
        style={{
          width: "42%",
          aspectRatio: "16/9",
          background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
          border: "2px solid #ffffff",
          boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ position: "absolute", top: 6, left: 6, fontSize: 9, color: "#0a0a0a", fontWeight: 700, padding: "2px 6px", background: "rgba(255,255,255,0.8)", borderRadius: 4 }}>
          VIRAL · 4.2M vues
        </div>
      </div>
      <div style={{ fontSize: 24, color: "#dc2626", fontWeight: 700 }}>→</div>
      <div
        className="rounded-xl overflow-hidden relative"
        style={{
          width: "42%",
          aspectRatio: "16/9",
          background: "linear-gradient(135deg, #dc2626, #991b1b)",
          border: "2px solid #dc2626",
          boxShadow: "0 8px 20px rgba(220,38,38,0.3)",
        }}
      >
        <div style={{ position: "absolute", top: 6, left: 6, fontSize: 9, color: "#fff", fontWeight: 700, padding: "2px 6px", background: "rgba(0,0,0,0.6)", borderRadius: 4 }}>
          TON CONTENU
        </div>
      </div>
    </div>
  );
}
