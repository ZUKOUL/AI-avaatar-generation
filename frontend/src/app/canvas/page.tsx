"use client";

/**
 * Canvas — sous-landing produit. Générer visuels + vidéos IA.
 */

import {
  SubLandingNav,
  SubLandingFooter,
  SubLandingHero,
  SubLandingBenefits,
  SubLandingFAQ,
  SubLandingCrossPromo,
  SubLandingCTA,
} from "@/components/landing/shared";

const FAQ = [
  {
    q: "Quelle est la différence entre Canvas et Adlab ?",
    a: "Canvas génère tes visuels bruts (images + vidéos), sans contrainte de format ad. Adlab prend ces visuels et les transforme en ads performantes avec hook, CTA et formats plateformes.",
  },
  {
    q: "Quels moteurs vidéo sont disponibles ?",
    a: "Kling 2.5 Turbo Pro (réalisme), Veo 3.1 Fast (rapidité), Hailuo 02 (mouvement) et Grok Imagine. Tu choisis selon ton besoin qualité / vitesse.",
  },
  {
    q: "Mes images peuvent être utilisées en print ?",
    a: "Oui. Canvas sort jusqu'à 4K en plan Studio, suffisant pour du print jusqu'au A3 300 DPI.",
  },
  {
    q: "Je peux importer des images de référence ?",
    a: "Oui. Upload une ou plusieurs images, Canvas les utilise comme style guide pour toutes tes futures générations.",
  },
];

export default function CanvasLanding() {
  return (
    <main
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: "#fafafa", color: "#0a0a0a" }}
    >
      <SubLandingNav />

      <SubLandingHero
        slug="canvas"
        title={
          <>
            Tes visuels et tes vidéos IA,
            <br />
            <span style={{ color: "#93c5fd" }}>depuis un prompt.</span>
          </>
        }
        subtitle="Générateur d'images Gemini 3 Pro Image + générateur vidéo multi-moteur (Kling / Veo / Hailuo / Grok). Un seul espace pour créer tout ce qui sera décliné ensuite dans Adlab, Thumbs, Autoclip."
        cta="Générer mon premier visuel"
      />

      <SubLandingBenefits
        slug="canvas"
        title={
          <>
            Image, vidéo, référence.{" "}
            <span style={{ color: "#9ca3af" }}>Sous un même toit.</span>
          </>
        }
        benefits={[
          {
            num: "01",
            title: "Image IA en 8 secondes",
            desc: "Gemini 3 Pro Image (Nano Banana Pro) — photo produit, scène lifestyle, visual hero. Tu prompts, ça sort, c'est propre.",
          },
          {
            num: "02",
            title: "Vidéo multi-moteur",
            desc: "Kling pour le réalisme, Veo pour la vitesse, Hailuo pour le mouvement. Horpen route vers le meilleur moteur selon ton prompt.",
          },
          {
            num: "03",
            title: "Références sauvegardées",
            desc: "Upload tes visuels de référence une fois. Ils pilotent le style de toutes tes futures créas dans toute la suite.",
          },
        ]}
      />

      <SubLandingFAQ faq={FAQ} />
      <SubLandingCrossPromo exclude="canvas" />
      <SubLandingCTA
        title={
          <>
            Prompt → visuel.
            <br />
            <span style={{ color: "#9ca3af" }}>Les deux en 30 secondes.</span>
          </>
        }
        cta="Essai gratuit"
      />

      <SubLandingFooter />
    </main>
  );
}
