"use client";

/**
 * Thumbs — sous-landing produit. Miniatures YouTube qui font cliquer.
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
    q: "Comment ça marche à partir d'un lien vidéo ?",
    a: "Colle une URL YouTube, Thumbs analyse le contenu (transcript, hooks parlés, émotion dominante) et génère 6 miniatures candidates. Tu choisis, tu télécharges, tu publies.",
  },
  {
    q: "Je peux mettre mon visage ?",
    a: "Oui. Si tu as un avatar entraîné dans Avatar, Thumbs le récupère automatiquement. Sinon tu peux uploader 2-3 photos du créateur.",
  },
  {
    q: "Quel CTR je peux attendre ?",
    a: "On track en moyenne +40 % de CTR vs les miniatures faites à la main. Mais ça dépend énormément de ta niche et de l'ancienneté de ta chaîne.",
  },
  {
    q: "Je peux cloner une miniature qui performe ?",
    a: "Oui — colle le lien d'une vidéo YouTube virale, Thumbs reproduit le style / framing / typo (pas le contenu exact, juste la recette). Légal et 100 % original.",
  },
];

export default function ThumbsLanding() {
  return (
    <main
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: "#fafafa", color: "#0a0a0a" }}
    >
      <SubLandingNav />

      <SubLandingHero
        slug="thumbs"
        title={
          <>
            La miniature qui fait cliquer.
            <br />
            <span style={{ color: "#fca5a5" }}>Colle un lien, c&apos;est fait.</span>
          </>
        }
        subtitle="Thumbs analyse ta vidéo (ou celle d'un concurrent) et génère la miniature optimale en 5 secondes. CTR scoring avant publication. Ton visage IA est intégré automatiquement."
        cta="Créer ma miniature"
      />

      <SubLandingBenefits
        slug="thumbs"
        title={
          <>
            De l&apos;URL à la miniature.{" "}
            <span style={{ color: "#9ca3af" }}>En 5 secondes.</span>
          </>
        }
        benefits={[
          {
            num: "01",
            title: "Analyse ta vidéo",
            desc: "Thumbs lit le transcript, détecte le hook dominant, l'émotion principale et le persona cible. Puis génère 6 candidates.",
          },
          {
            num: "02",
            title: "Ton avatar intégré",
            desc: "Si tu as un Avatar entraîné, il apparaît automatiquement sur la miniature. Cohérence de brand sur toute ta chaîne.",
          },
          {
            num: "03",
            title: "CTR scoring",
            desc: "Chaque miniature candidate reçoit un CTR estimé. Tu gardes la plus forte, tu jettes les autres. Pas de devinette.",
          },
        ]}
      />

      <SubLandingFAQ faq={FAQ} />
      <SubLandingCrossPromo exclude="thumbs" />
      <SubLandingCTA
        title={
          <>
            Une miniature en 5 secondes.
            <br />
            <span style={{ color: "#9ca3af" }}>Un CTR qui explose.</span>
          </>
        }
        cta="Essai gratuit"
      />

      <SubLandingFooter />
    </main>
  );
}
