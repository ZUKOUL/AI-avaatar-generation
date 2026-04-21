"use client";

/**
 * Adlab — sous-landing produit. Générer des ads qui convertissent.
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
    q: "Comment Adlab génère mes ads ?",
    a: "Décris ton produit et choisis un angle (UGC, before/after, social proof, unboxing). Adlab sort 10 variantes avec hook différent, formats Meta / TikTok / Google Ads directement exportables.",
  },
  {
    q: "Adlab se connecte à mon compte publicitaire ?",
    a: "Pas encore — pour l'instant tu exports les créas et les uploads manuellement. L'intégration Meta Ads Manager + TikTok Ads arrive au T2 (roadmap publique).",
  },
  {
    q: "Comment fonctionne l'A/B test ?",
    a: "Lance une campagne avec 10 variantes d'un même angle. Adlab track le ROAS / CTR / scroll-stop rate de chaque variante et détecte la gagnante après 48h de données. Tu peux ensuite cloner le style de la gagnante.",
  },
  {
    q: "En quoi c'est mieux qu'un designer ?",
    a: "10× plus rapide, 20× moins cher. Et surtout : Adlab apprend de tes performances — plus tu l'utilises, plus il produit des ads qui matchent ta niche.",
  },
];

export default function AdlabLanding() {
  return (
    <main
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: "#fafafa", color: "#0a0a0a" }}
    >
      <SubLandingNav />

      <SubLandingHero
        slug="adlab"
        title={
          <>
            Des ads qui convertissent.
            <br />
            <span style={{ color: "#fcd34d" }}>Testées à l&apos;infini.</span>
          </>
        }
        subtitle="Adlab génère 10 variantes d'un même angle, A/B test automatiquement, détecte la gagnante et duplique son style. Hook scoring IA avant publication. Ton compte publicitaire n'a plus qu'à dépenser."
        cta="Générer mes premières ads"
      />

      <SubLandingBenefits
        slug="adlab"
        title={
          <>
            Générer. Tester. Scaler.{" "}
            <span style={{ color: "#9ca3af" }}>Sans designer.</span>
          </>
        }
        benefits={[
          {
            num: "01",
            title: "10 variantes par angle",
            desc: "Décris ton produit, choisis un angle. Adlab sort 10 hooks, 10 copies, 10 variantes visuelles directement prêtes à publier.",
          },
          {
            num: "02",
            title: "A/B test automatique",
            desc: "Suivi ROAS / CTR / scroll-stop par variante. Adlab détecte la gagnante après 48h, clone son style sur tes prochaines campagnes.",
          },
          {
            num: "03",
            title: "Hook scoring IA",
            desc: "Chaque hook reçoit un score de perf estimé avant publication. Tu gardes les 3 meilleurs, tu jettes le reste.",
          },
        ]}
      />

      <SubLandingFAQ faq={FAQ} />
      <SubLandingCrossPromo exclude="adlab" />
      <SubLandingCTA
        title={
          <>
            Ton prochain winning ad.
            <br />
            <span style={{ color: "#9ca3af" }}>Déjà généré, t&apos;as juste pas encore essayé.</span>
          </>
        }
        cta="Essai gratuit"
      />

      <SubLandingFooter />
    </main>
  );
}
