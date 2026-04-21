"use client";

import { SubLanding, LandingConfig, MockupFrame, MockupBrowserChrome } from "@/components/landing/sub-landing";

const CANVAS: LandingConfig = {
  slug: "canvas",
  heroBadge: "⌘C pour ouvrir",
  heroTitle: (
    <>
      Tes visuels et tes vidéos IA,
      <br />
      <span style={{ color: "#93c5fd" }}>depuis un prompt.</span>
    </>
  ),
  heroSubtitle:
    "Générateur d'images Gemini 3 Pro Image + vidéo multi-moteur (Kling, Veo, Hailuo, Grok). Un seul espace pour créer tout ce qui sera ensuite décliné dans Adlab, Thumbs et Clipsy.",
  heroCta: "Générer mon premier visuel",
  heroMockup: <HeroMockup />,

  logoBand: true,
  logoBandCopy: "Les marques e-com et créateurs qui créent sans designer",

  problem: {
    title: (
      <>
        Tu paies un shooting 2 000 €.{" "}
        <span style={{ color: "#9ca3af" }}>Pour 40 photos figées.</span>
      </>
    ),
    subtitle:
      "Les outils IA génériques font des visuels cool. Mais aucun ne comprend ton produit, ton avatar, ta niche — et encore moins les 3 en même temps.",
    pains: [
      { label: "Shooting studio : 1 500-3 000 €", desc: "Pour un set de photos figées. Tu veux un angle en plus ? Retour au studio." },
      { label: "Midjourney / DALL·E génériques", desc: "Jolis, mais zéro cohérence avec ton produit ou ton visage. Tu reconnais le style IA." },
      { label: "Vidéo IA à la pièce", desc: "Runway, Kling, Sora isolés — chaque outil son abo, zéro mémoire entre les runs." },
    ],
  },

  features: [
    {
      eyebrow: "Image IA",
      title: "Photo produit, scène lifestyle, hero image — depuis un prompt",
      desc:
        "Gemini 3 Pro Image (Nano Banana Pro) sous le capot. Tu prompts en français ou en anglais, Canvas sort du 2K natif avec contrôle précis de l'angle, l'éclairage, le style.",
      tags: ["Gemini 3 Pro Image", "2K natif", "Photo / lifestyle / hero"],
      visual: <FeatureImage />,
    },
    {
      eyebrow: "Vidéo multi-moteur",
      title: "Kling, Veo, Hailuo, Grok — Horpen route vers le meilleur",
      desc:
        "Chaque moteur a sa force : Kling pour le réalisme photo-like, Veo pour la vitesse, Hailuo pour le mouvement complexe, Grok pour le surreal. Tu décris ta scène, Canvas choisit le moteur optimal.",
      tags: ["Kling 2.5", "Veo 3.1", "Hailuo 02", "Grok Imagine"],
      visual: <FeatureVideo />,
    },
    {
      eyebrow: "Références",
      title: "Upload tes visuels de marque — Canvas les utilise comme style guide",
      desc:
        "Charge 3-10 images de ton univers (palette, ambiance, produit). Toutes tes futures générations dans Horpen (Canvas, Adlab, Thumbs, Clipsy) s'alignent automatiquement sur ce style.",
      tags: ["Style guide global", "Cross-product", "Palette locking"],
      visual: <FeatureReferences />,
    },
    {
      eyebrow: "Styles sauvegardés",
      title: "Crée tes presets, réutilise-les d'un clic",
      desc:
        "Décris ton style une fois (“minimaliste scandinave, pastel mat, low-key”) et sauvegarde le preset. Réutilise-le sur toutes tes prochaines génés sans retaper le prompt.",
      tags: ["Prompts réutilisables", "Team-friendly", "Versioning"],
      visual: <FeatureStyles />,
    },
  ],

  howItWorks: {
    title: (
      <>
        Du prompt au visuel.{" "}
        <span style={{ color: "#9ca3af" }}>En moins de 30 secondes.</span>
      </>
    ),
    steps: [
      { number: "01", title: "Décris ta scène", desc: "En français, en anglais ou via preset. Canvas interprète et enrichit automatiquement." },
      { number: "02", title: "Horpen choisit le moteur", desc: "Image ou vidéo, Gemini ou Kling/Veo/Hailuo/Grok. Tu peux override si besoin." },
      { number: "03", title: "Export direct", desc: "PNG/JPG/WebP pour image, MP4 1080p/4K pour vidéo. Prêt à publier ou injecter dans Adlab." },
    ],
  },

  testimonial: {
    quote:
      "J'avais un budget shooting de 4k€/trimestre avec un photographe pour ma boutique beauté. Depuis Canvas, je fais 100% en IA — photos produit, lifestyle, hero. Mon Instagram n'a jamais été aussi cohérent.",
    author: "Camille R.",
    role: "Fondatrice marque skincare · 240k€ ARR",
    metrics: [
      { value: "-92%", label: "Coûts créa photo" },
      { value: "3×", label: "Volume de visuels/mois" },
      { value: "30 s", label: "Par asset" },
    ],
  },

  comparison: {
    title: (
      <>
        Canvas vs{" "}
        <span style={{ color: "#9ca3af" }}>les générateurs séparés</span>
      </>
    ),
    subtitle: "La concurrence c'est un outil par besoin. Canvas fait le job multi-outil.",
    usLabel: "Horpen Canvas",
    competitorLabels: ["Midjourney", "Runway", "DALL·E"],
    rows: [
      { feature: "Image IA 2K", us: true, them: [true, false, true] },
      { feature: "Vidéo IA multi-moteur", us: true, them: [false, "1 moteur", false] },
      { feature: "Images de référence", us: true, them: ["Limité", "Limité", false] },
      { feature: "Styles réutilisables", us: true, them: [false, false, false] },
      { feature: "Partagé avec Avatar / Adlab / Thumbs", us: true, them: [false, false, false] },
      { feature: "Prix / mois", us: "Dès 35€", them: ["30$", "35$", "20$"] },
      { feature: "Droits commerciaux", us: true, them: [true, true, true] },
    ],
  },

  faq: [
    {
      q: "Quelle différence avec Midjourney ou Runway ?",
      a: "Midjourney = image uniquement, pas de vidéo, pas de cohérence avec ton produit/avatar. Runway = vidéo uniquement, un seul moteur. Canvas combine les deux, route vers le meilleur moteur selon ton prompt, et partage ton style/avatar avec tout Horpen.",
    },
    {
      q: "Quels moteurs vidéo je peux utiliser ?",
      a: "Kling 2.5 Turbo Pro (meilleur réalisme), Veo 3.1 Fast (le plus rapide), Hailuo 02 (meilleur mouvement complexe), Grok Imagine (style plus artistique). Tu peux forcer un moteur ou laisser Horpen choisir.",
    },
    {
      q: "Je peux utiliser en usage commercial ?",
      a: "Oui, droits commerciaux inclus dès le plan Creator. Tu peux publier, vendre, monétiser tout ce que tu génères dans Canvas.",
    },
    {
      q: "Quelle résolution max ?",
      a: "Image : 2K par défaut, 4K en plan Studio. Vidéo : 1080p sur tous les plans, 4K en Studio (via Veo 3.1 Fast ou Kling 2.5).",
    },
    {
      q: "Canvas se connecte à mes images de référence ?",
      a: "Oui. Upload jusqu'à 10 images dans le tab “Références” — Canvas les utilise comme style guide. Elles pilotent aussi le rendu dans Adlab, Thumbs et Clipsy, pour une cohérence totale.",
    },
    {
      q: "Je peux sauvegarder mes prompts ?",
      a: "Oui, dans le tab “Styles”. Enregistre un preset (prompt + paramètres), nomme-le, réutilise-le en 1 clic sur tes futurs visuels.",
    },
    {
      q: "Ça consomme combien de crédits ?",
      a: "Image : 1 crédit / 2K, 2 crédits / 4K. Vidéo : 5-15 crédits selon moteur et durée (Veo Fast 5 crédits / 5s, Kling 10 / 5s, Hailuo 12 / 6s, Grok 15 / 6s).",
    },
    {
      q: "Mes visuels restent privés ?",
      a: "Oui par défaut. Tu peux les partager dans un board public si tu le souhaites, mais aucune créa n'est publique sans action explicite de ta part.",
    },
  ],

  finalCtaTitle: (
    <>
      Un prompt. Un visuel.
      <br />
      <span style={{ color: "#94a3b8" }}>30 secondes chrono.</span>
    </>
  ),
  finalCtaSub: "Teste Canvas gratuitement — 3 visuels offerts sur le plan Free.",
  finalCta: "Créer mon premier visuel",
};

export default function CanvasLanding() {
  return <SubLanding config={CANVAS} />;
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
          boxShadow: "0 32px 80px -16px rgba(59,130,246,0.3)",
        }}
      >
        <MockupBrowserChrome url="horpen.ai/canvas" />
        <div className="p-5">
          <div
            style={{
              fontSize: 11,
              color: "#6b7280",
              fontFamily: "ui-monospace, monospace",
              marginBottom: 10,
              padding: "10px 12px",
              background: "#fafafa",
              borderRadius: 10,
              border: "1px solid #ececec",
            }}
          >
            &gt; Photo produit : flacon sérum sur marbre blanc, lumière naturelle matin
          </div>
          <div className="grid grid-cols-4 gap-2">
            {["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa"].map((c, i) => (
              <div
                key={i}
                className="rounded-lg relative overflow-hidden"
                style={{
                  aspectRatio: "3/4",
                  background: `linear-gradient(180deg, ${c}, #3b82f6)`,
                  border: "2px solid #fff",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "40%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 24,
                    height: 40,
                    borderRadius: 4,
                    background: "rgba(255,255,255,0.45)",
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

function FeatureImage() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 grid grid-cols-3 gap-2" style={{ height: "100%" }}>
        {[
          "linear-gradient(135deg, #dbeafe, #3b82f6)",
          "linear-gradient(135deg, #bfdbfe, #1e40af)",
          "linear-gradient(135deg, #e0e7ff, #6366f1)",
          "linear-gradient(135deg, #93c5fd, #2563eb)",
          "linear-gradient(135deg, #60a5fa, #1e3a8a)",
          "linear-gradient(135deg, #eff6ff, #3b82f6)",
        ].map((g, i) => (
          <div
            key={i}
            className="rounded-md"
            style={{ background: g, border: "1px solid rgba(255,255,255,0.4)", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}
          />
        ))}
      </div>
    </MockupFrame>
  );
}

function FeatureVideo() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-5 space-y-2">
        {[
          { name: "Kling 2.5", tag: "Réaliste", speed: "10s", color: "#3b82f6" },
          { name: "Veo 3.1 Fast", tag: "Rapide", speed: "5s", color: "#8b5cf6" },
          { name: "Hailuo 02", tag: "Mouvement", speed: "8s", color: "#10b981" },
          { name: "Grok Imagine", tag: "Artistique", speed: "7s", color: "#f59e0b" },
        ].map((m, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
            style={{ background: i === 0 ? "#eff6ff" : "#fafafa", border: `1px solid ${i === 0 ? "#bfdbfe" : "#ececec"}` }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color }} />
            <div className="flex-1">
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0a0a0a" }}>{m.name}</div>
              <div style={{ fontSize: 10.5, color: "#6b7280" }}>{m.tag} · {m.speed}</div>
            </div>
            {i === 0 && (
              <div style={{ fontSize: 10, color: "#3b82f6", fontWeight: 600, padding: "2px 6px", background: "#ffffff", borderRadius: 4, border: "1px solid #bfdbfe" }}>
                AUTO
              </div>
            )}
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function FeatureReferences() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 h-full flex flex-col">
        <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          Références actives (4)
        </div>
        <div className="flex-1 grid grid-cols-4 gap-2">
          {["#fecaca", "#fed7aa", "#fde68a", "#bbf7d0"].map((c, i) => (
            <div
              key={i}
              className="rounded-md relative"
              style={{ background: c, border: "1px solid rgba(0,0,0,0.05)" }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#10b981",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✓
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, textAlign: "center" }}>
          Pilote Canvas + Adlab + Thumbs + Clipsy
        </div>
      </div>
    </MockupFrame>
  );
}

function FeatureStyles() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-5 space-y-2">
        {[
          { name: "Scandi pastel", uses: 24 },
          { name: "Low-key luxe", uses: 18 },
          { name: "Studio clean white", uses: 41 },
          { name: "Golden hour outdoor", uses: 9 },
        ].map((s, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-3 py-2.5 rounded-lg"
            style={{ background: "#fafafa", border: "1px solid #ececec" }}
          >
            <div className="flex items-center gap-2">
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  background: ["#fecaca", "#fbbf24", "#e5e7eb", "#f59e0b"][i],
                  border: "1px solid rgba(0,0,0,0.05)",
                }}
              />
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0a0a0a" }}>{s.name}</div>
            </div>
            <div style={{ fontSize: 10.5, color: "#6b7280" }}>{s.uses} usages</div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}
