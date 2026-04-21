"use client";

/**
 * Autoclip — sous-landing produit. Prompt ou URL → vidéo short.
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
    q: "Prompt ou URL — quelle différence ?",
    a: "Prompt : décris ta vidéo, Autoclip génère script + voix + visuels + sous-titres en pipeline automatisé. URL : colle une longue vidéo YouTube ou Loom, Autoclip détecte les meilleurs moments et les découpe en shorts avec sous-titres.",
  },
  {
    q: "Quels formats sont supportés ?",
    a: "9:16 (TikTok / Reels / Shorts) par défaut. Aussi 1:1 (feed Instagram), 4:5 (portrait) et 16:9 (YouTube long). Export en HD ou 4K selon ton plan.",
  },
  {
    q: "Je peux programmer la publication ?",
    a: "Oui. Autoclip se connecte à TikTok, Instagram Reels et YouTube Shorts. Tu plannifies la publication, Horpen publie tout seul aux créneaux optimaux de ton audience.",
  },
  {
    q: "Combien de temps prend une génération ?",
    a: "1-3 min pour un clip depuis un prompt. 5-8 min pour une découpe depuis une URL longue (selon la durée de la vidéo source).",
  },
];

export default function AutoclipLanding() {
  return (
    <main
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: "#fafafa", color: "#0a0a0a" }}
    >
      <SubLandingNav />

      <SubLandingHero
        slug="autoclip"
        title={
          <>
            Du prompt à la vidéo short.
            <br />
            <span style={{ color: "#86efac" }}>Direct. Sans éditeur.</span>
          </>
        }
        subtitle="Décris ton idée, colle une URL long-form, ou programme la publication — Autoclip assemble script, voix, visuels et sous-titres en pipeline 100% automatisé. Publie sur TikTok / Reels / Shorts sans ouvrir CapCut."
        cta="Générer mon premier clip"
      />

      <SubLandingBenefits
        slug="autoclip"
        title={
          <>
            Trois entrées. Une sortie.{" "}
            <span style={{ color: "#9ca3af" }}>Ta vidéo livrée.</span>
          </>
        }
        benefits={[
          {
            num: "01",
            title: "Depuis un prompt",
            desc: "Décris ta vidéo (scène, hook, durée). Autoclip écrit le script, génère la voix ElevenLabs, colle les visuels Canvas et ajoute les sous-titres animés.",
          },
          {
            num: "02",
            title: "Depuis une URL",
            desc: "Colle un lien YouTube ou Loom. Autoclip détecte les passages les plus engageants, les découpe, ajoute sous-titres + musique + b-rolls.",
          },
          {
            num: "03",
            title: "Publication auto",
            desc: "Connecte TikTok / Reels / Shorts. Autoclip publie aux créneaux où ton audience est active, tracking de perf inclus.",
          },
        ]}
      />

      <SubLandingFAQ faq={FAQ} />
      <SubLandingCrossPromo exclude="autoclip" />
      <SubLandingCTA
        title={
          <>
            Ton éditeur vidéo dort encore ?
            <br />
            <span style={{ color: "#9ca3af" }}>Toi non.</span>
          </>
        }
        cta="Essai gratuit"
      />

      <SubLandingFooter />
    </main>
  );
}
