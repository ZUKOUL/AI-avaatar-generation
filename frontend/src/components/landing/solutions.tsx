"use client";

/**
 * Solutions / Verticals — Foreplay-style "Industries" pages.
 *
 * Each vertical gets its own landing page at /solutions/<slug> that
 * speaks directly to that audience's pain (e-com sellers, agences,
 * créateurs UGC, faceless creators, coaches, SaaS B2B).
 *
 * Why this exists:
 *   - SEO: each page targets "AI content pour <vertical>" keywords.
 *   - Conversion: tailored messaging per audience outperforms generic
 *     landing by 2-3× on cold traffic.
 *   - Internal linking: all pages cross-promote via `SolutionsCrossGrid`.
 *
 * Usage (thin page file):
 *
 *   import { SolutionLanding, SOLUTIONS } from "@/components/landing/solutions";
 *   export default function Page() {
 *     return <SolutionLanding config={SOLUTIONS.ecommerce} />;
 *   }
 */

import Link from "next/link";
import {
  ArrowRight,
  Check,
  XIcon,
  ShoppingBag,
  Briefcase,
  VideoCamera,
  Users,
  GraduationHat,
  CodeBrowser,
} from "@/components/Icons";
import {
  PRODUCTS,
  Product3DLogo,
  SubLandingNav,
  SubLandingFooter,
  type ProductSlug,
} from "@/components/landing/shared";

/* ─── Type definitions ────────────────────────────────────────────── */

export type SolutionSlug =
  | "ecommerce"
  | "agences"
  | "ugc"
  | "faceless"
  | "coaches"
  | "saas";

export interface SolutionBenefit {
  /** Which Horpen app mainly powers this benefit (for the badge icon). */
  app: ProductSlug;
  title: string;
  desc: string;
}

export interface SolutionPain {
  label: string;
  desc: string;
}

export interface SolutionStep {
  number: string;
  app: ProductSlug;
  title: string;
  desc: string;
}

export interface SolutionConfig {
  slug: SolutionSlug;
  /** Shown in the hero eyebrow, e.g. "HORPEN FOR E-COMMERCE". */
  tag: string;
  /** Short display name for nav / cross-grid, e.g. "E-commerce & DTC". */
  name: string;
  /** One-line description for the Solutions dropdown. */
  dropdownDesc: string;
  /** Lucide/UntitledUI icon component used in dropdown + hero. */
  Icon: React.FC<{ className?: string; size?: number }>;
  /** Accent color (hex) driving halo + spot highlights. */
  accent: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCta: string;
  /** Hero stat row — 3 big numbers. */
  stats: [{ value: string; label: string }, { value: string; label: string }, { value: string; label: string }];
  /** Pains this audience faces without Horpen. */
  pains: [SolutionPain, SolutionPain, SolutionPain];
  /** Key benefits (what Horpen unlocks), each tied to a product app. */
  benefits: [SolutionBenefit, SolutionBenefit, SolutionBenefit, SolutionBenefit];
  /** Typical Horpen workflow for this vertical. */
  steps: [SolutionStep, SolutionStep, SolutionStep];
  /** Short audience-specific testimonial. */
  testimonial: { quote: string; author: string; role: string };
  /** Final CTA heading. */
  finalCtaTitle: string;
}

/* ─── The 6 vertical configs ──────────────────────────────────────── */

export const SOLUTIONS: Record<SolutionSlug, SolutionConfig> = {
  ecommerce: {
    slug: "ecommerce",
    tag: "Horpen pour l'e-commerce",
    name: "E-commerce & DTC",
    dropdownDesc: "Shopify, dropshippers, marques DTC",
    Icon: ShoppingBag,
    accent: "#3b82f6",
    heroTitle: "Remplace ton shooting, ton UGC creator et ton ad buyer.",
    heroSubtitle:
      "Horpen génère tes photos packshot, tes UGC videos, tes ads variantes et tes miniatures — avec TON produit, TON avatar, TON angle. Tu publies le jour même, tu scale à la semaine.",
    heroCta: "Lancer ma première créa e-com",
    stats: [
      { value: "2-3×", label: "moins cher qu'un UGC creator" },
      { value: "48h", label: "entre idée et campagne live" },
      { value: "∞", label: "variantes pour un même produit" },
    ],
    pains: [
      { label: "1 800€/mois en UGC", desc: "Pour 4 vidéos par mois qui arrivent en retard et ne correspondent jamais à ton brief." },
      { label: "Shooting produit à 1 500€", desc: "Studio, photographe, DA, retouche. Chaque nouvelle déclinaison te coûte un SMIC." },
      { label: "Creative fatigue en 10 jours", desc: "Ton ad winner s'essouffle. Sans variantes, ton ROAS s'effondre et tes coûts par acquisition explosent." },
    ],
    benefits: [
      { app: "canvas", title: "Packshots pro, infinis", desc: "Upload ton produit une seule fois. Canvas génère 20 visuels lifestyle, fond blanc, mockups — qualité catalogue premium." },
      { app: "avatar", title: "Ton UGC creator dédié, 24/7", desc: "Entraîne ton avatar IA sur 10 photos. Il te tourne un UGC en 2 minutes, sans briefer, sans attendre, sans négocier." },
      { app: "adlab", title: "50 variantes d'ads par batch", desc: "Mêmes scripts, angles différents. Adlab détecte ta gagnante, clone son style sur toute ta gamme produits." },
      { app: "trackify", title: "Espionne tes concurrents 24/7", desc: "Vois ce qui marche chez PetLab, AG1, Brooklinen. Clone le hook, ajuste ton offre, lance ta variante." },
    ],
    steps: [
      { number: "01", app: "trackify", title: "Scanne les concurrents", desc: "Sélectionne 5 marques. Trackify archive leurs ads et extrait les hooks gagnants chaque jour." },
      { number: "02", app: "canvas", title: "Génère tes visuels", desc: "Upload ton produit. Canvas sort 20 photos lifestyle pro + mockups en 3 minutes." },
      { number: "03", app: "adlab", title: "Batch & publie", desc: "Adlab génère 10 ads variantes. Tu pushes direct sur Meta / TikTok Ads Manager via l'export natif." },
    ],
    testimonial: {
      quote:
        "Avant Horpen, je brûlais 1 800€/mois en UGC pour 4 vidéos par semaine. Maintenant j'en sors 20, de meilleure qualité, pour un 10ème du prix. Mon ROAS sur Meta est passé de 1.8 à 3.2 en 6 semaines.",
      author: "Léa M.",
      role: "Fondatrice, marque beauté — 180k€ ARR",
    },
    finalCtaTitle: "Prêt à remplacer ton agence créa ?",
  },

  agences: {
    slug: "agences",
    tag: "Horpen pour les agences créa",
    name: "Agences créa & ad buying",
    dropdownDesc: "Agences marketing, SEA, UGC, social",
    Icon: Briefcase,
    accent: "#8b5cf6",
    heroTitle: "10× plus de livrables par client. Sans embaucher.",
    heroSubtitle:
      "Tes juniors génèrent les variantes, tes seniors valident. Horpen sert 20 clients en parallèle avec la même équipe — chaque client a ses assets, son avatar, son branding cloisonné.",
    heroCta: "Démarrer mon workspace agence",
    stats: [
      { value: "20+", label: "clients servis par workspace" },
      { value: "10×", label: "livrables par creative hour" },
      { value: "2 min", label: "onboarding d'un nouveau client" },
    ],
    pains: [
      { label: "CAC qui explose à cause du turnover", desc: "Junior recruté, formé, parti dans 10 mois. Tu recommences à zéro, tes clients payent la facture." },
      { label: "Chaque client demande 3× plus", desc: "Les clients veulent 50 variantes par campagne, pas 5. Ton équipe craque ou tu refuses des budgets." },
      { label: "Créa pas scalable", desc: "Plus tu prends de clients, plus tu ralentis. Ton pricing ne suit pas tes coûts réels de production." },
    ],
    benefits: [
      { app: "canvas", title: "Un workspace par client", desc: "Chaque client a son brand kit, son avatar, ses images de référence. Jamais de contamination visuelle entre comptes." },
      { app: "avatar", title: "1 avatar = 1 creator dédié par client", desc: "Ton client SaaS a son avatar. Ton client cosmétique aussi. Personne ne partage, tout est cloisonné." },
      { app: "adlab", title: "Batch 100 ads, un junior, une matinée", desc: "Ton junior drive Adlab au prompt, sort 100 variantes, ton senior valide. Ton marge triple." },
      { app: "trackify", title: "Benchmark concurrentiel automatisé", desc: "Monitoring des ads concurrents de chaque client, rapport hebdo auto-généré. Zéro Google Alert à configurer." },
    ],
    steps: [
      { number: "01", app: "canvas", title: "Onboarding client en 2 min", desc: "Upload le logo, la charte, 10 photos produit. Le workspace client est prêt. Branding parfaitement cloisonné." },
      { number: "02", app: "adlab", title: "Production en batch", desc: "Junior lance 50 variantes par angle. Export 9:16, 1:1, 4:5 automatique. Labels client auto-appliqués." },
      { number: "03", app: "trackify", title: "Rapport performance hebdo", desc: "Trackify compile les ads concurrents + A/B test results. Export PDF white-label pour le client." },
    ],
    testimonial: {
      quote:
        "On gère 15 clients e-com avec 3 personnes. Avant Horpen il nous en fallait 8. Notre marge est passée de 22% à 47%. Les juniors apprennent plus vite, les seniors font enfin de la stratégie.",
      author: "Jérôme D.",
      role: "CEO, agence média — 40 clients actifs",
    },
    finalCtaTitle: "Multiplier tes marges d'agence ?",
  },

  ugc: {
    slug: "ugc",
    tag: "Horpen pour les créateurs UGC",
    name: "Créateurs UGC",
    dropdownDesc: "Créateurs UGC freelances, ads-creators",
    Icon: VideoCamera,
    accent: "#f59e0b",
    heroTitle: "Multiplie ton volume de livrables. Garde ton style.",
    heroSubtitle:
      "Horpen clone ton visage, ta voix, ton énergie. Tu tournes 1 prise, tu livres 10 variantes. Les clients payent plus parce que tu livres plus vite, avec plus d'angles testés.",
    heroCta: "Cloner mon style UGC",
    stats: [
      { value: "10×", label: "livrables par shoot day" },
      { value: "+80%", label: "de marge par brief accepté" },
      { value: "4 j", label: "temps moyen d'onboarding client" },
    ],
    pains: [
      { label: "Briefs à rallonge et revisions infinies", desc: "Le client veut 5 hooks, 3 angles, 2 durations. Tu tournes 3 jours pour 1 brief payé en 1 vidéo." },
      { label: "Plafond de revenus bloqué par tes heures", desc: "Tu ne peux pas tourner la nuit. Ton CA est plafonné par le nombre de prises possibles par semaine." },
      { label: "Ton style se perd dans les masses", desc: "Les marques veulent du volume, pas du sur-mesure. Tu finis par faire le même UGC que tout le monde." },
    ],
    benefits: [
      { app: "avatar", title: "Ton avatar IA fait le volume", desc: "Entraîne-toi en 8 minutes. Ton avatar génère des variantes illimitées, voix clonée, expressions conservées." },
      { app: "adlab", title: "10 hooks, 1 même prise", desc: "Un brief = une prise. Adlab génère 10 variantes de hooks sur ta même vidéo. Tu livres 10, tu factures 10." },
      { app: "clipsy", title: "Pipeline long-form → shorts auto", desc: "Clipsy découpe tes longues prises en 8 shorts exportables sur TikTok / Reels / Shorts avec sous-titres brandés." },
      { app: "canvas", title: "Aucun shoot produit requis", desc: "Le client envoie le produit en visuel. Canvas l'intègre dans tes scènes UGC — pas besoin de shooter le produit." },
    ],
    steps: [
      { number: "01", app: "avatar", title: "Entraîne ton avatar IA", desc: "10 photos + 30s de voix. 8 minutes. Tu as maintenant un creator IA 100% toi, réutilisable à l'infini." },
      { number: "02", app: "adlab", title: "Livre 10 variantes par brief", desc: "Le client demande 1 vidéo, tu livres 10 hooks. Ton devis passe de 400€ à 1 200€ sans plus de temps." },
      { number: "03", app: "clipsy", title: "Pipeline de clips auto", desc: "Ta prise long-form part automatiquement sur Clipsy. Tu récupères 8 shorts avec sous-titres brandés, prêts à livrer." },
    ],
    testimonial: {
      quote:
        "Je livrais 15 UGC/mois. Avec Horpen, 80. Mon avatar fait 70% du job pendant que je brief, je négocie, je pitche. Mon CA est passé de 4k à 14k en 3 mois. Même nombre d'heures travaillées.",
      author: "Chloé R.",
      role: "UGC creator pro — 40 clients actifs",
    },
    finalCtaTitle: "Transformer tes heures en livrables ?",
  },

  faceless: {
    slug: "faceless",
    tag: "Horpen pour les faceless creators",
    name: "Faceless & IA creators",
    dropdownDesc: "Chaînes YouTube, TikTok, avatars IA",
    Icon: Users,
    accent: "#8b5cf6",
    heroTitle: "Scale tes chaînes sans jamais montrer ton visage.",
    heroSubtitle:
      "Horpen te fournit l'avatar IA, l'angle d'hameçon, le script, la voix, les visuels et le montage. Publie 3 vidéos par jour, 7 jours par semaine, sur 5 chaînes.",
    heroCta: "Lancer ma chaîne faceless",
    stats: [
      { value: "5+", label: "chaînes gérées en parallèle" },
      { value: "3/jour", label: "vidéos publiées par chaîne" },
      { value: "0", label: "caméras, micros, studios" },
    ],
    pains: [
      { label: "Voix de synthèse qui sonne robot", desc: "Les outils ElevenLabs génériques s'entendent à 1km. L'algo détecte, le watch time s'écroule." },
      { label: "Visuels ChatGPT + PromptMe répétitifs", desc: "Tu finis par publier les mêmes images pastel tout le monde. Pas de branding, pas de reconnaissance." },
      { label: "CapCut à la main 4h par vidéo", desc: "Tu es créateur de contenu ou éditeur vidéo ? À ce rythme-là, une seule chaîne te prend 30h/semaine." },
    ],
    benefits: [
      { app: "avatar", title: "Voix clonée hyper-réaliste", desc: "30s d'audio suffisent. Ta voix, tes respirations, ton accent — indétectable par l'algo et par l'audience." },
      { app: "canvas", title: "Style visuel cohérent par chaîne", desc: "Chaque chaîne a son univers visuel. Canvas génère dans ce style, toujours. Jamais d'image générique." },
      { app: "clipsy", title: "Pipeline prompt → shorts publiés", desc: "Décris l'idée. Clipsy assemble script, voix, visuels, sous-titres et programme la publication. Tu supervises seulement." },
      { app: "thumbs", title: "Miniatures scorées par CTR", desc: "Thumbs génère 6 candidats par vidéo, te sort le gagnant prédit selon ta niche. Tes CTR passent de 4% à 9%." },
    ],
    steps: [
      { number: "01", app: "avatar", title: "Clone ta voix ou crée ton persona", desc: "Upload 30s d'audio ou choisis un persona préconçu. Tu as maintenant un creator IA prêt pour 1000 vidéos." },
      { number: "02", app: "clipsy", title: "Pipeline de production auto", desc: "Décris le sujet. Clipsy génère script + voix + visuels + coupes + sous-titres en 4 minutes." },
      { number: "03", app: "thumbs", title: "Miniature + upload programmé", desc: "Thumbs sort la miniature scorée. Clipsy poste automatiquement sur TikTok / YT Shorts / Reels aux heures gagnantes." },
    ],
    testimonial: {
      quote:
        "Je gère 4 chaînes faceless, 400k abos cumulés. Horpen remplace mon éditeur vidéo, ma voix off, ma DA. Je supervise 45 min par jour, je publie 12 shorts. Revenus Shorts : 6k/mois.",
      author: "Nico M.",
      role: "Opérateur de chaînes IA — 4 comptes, 400k abos",
    },
    finalCtaTitle: "Lancer ta première chaîne faceless ?",
  },

  coaches: {
    slug: "coaches",
    tag: "Horpen pour les coaches & infopreneurs",
    name: "Coaches & Infopreneurs",
    dropdownDesc: "Formateurs, coaches, info-preneurs",
    Icon: GraduationHat,
    accent: "#10b981",
    heroTitle: "Transforme ton expertise en machine à contenus.",
    heroSubtitle:
      "Tu as 10h de formation enregistrée, 50 posts LinkedIn, 20h de podcast. Horpen extrait, clipe, recycle et publie 10 pièces de contenu / jour — toutes brandées à ton image, toutes scorées pour la conversion.",
    heroCta: "Recycler mes contenus existants",
    stats: [
      { value: "10×", label: "contenus publiés par semaine" },
      { value: "+220%", label: "de leads via contenu organique" },
      { value: "0h", label: "d'édition vidéo manuelle" },
    ],
    pains: [
      { label: "Tu crées moins, ton audience stagne", desc: "Tu veux poster 5×/jour, tu postes 2×/semaine. Tes compétiteurs plus réguliers prennent tes leads." },
      { label: "Ton podcast et ta formation dorment", desc: "10h de golden content que personne ne réutilise. Chaque clip tiré à la main prend 30 minutes, tu ne le fais pas." },
      { label: "L'édition vidéo te bloque", desc: "Le script est écrit, la prise est faite. Mais le montage prend 3h. Tu publies 1× au lieu de 5×." },
    ],
    benefits: [
      { app: "clipsy", title: "Podcast / formation → shorts viraux", desc: "Clipsy scanne tes longues prises, détecte les moments à hook, sort 10 shorts optimisés par épisode avec sous-titres brandés." },
      { app: "avatar", title: "Ton avatar IA tourne 24/7", desc: "Tu écris le script, ton avatar l'incarne. Même look, même voix — tu publies quotidien sans jamais rallumer ta caméra." },
      { app: "adlab", title: "Posts LinkedIn carousels perfs", desc: "Adlab génère 5 variantes de hook par idée. Tu choisis, tu publies, tu A/B test ton engagement sur LinkedIn + IG." },
      { app: "thumbs", title: "Miniatures qui performent ta niche", desc: "Thumbs analyse ta niche, propose les formats qui font cliquer. Ton CTR YouTube passe de 3% à 8%." },
    ],
    steps: [
      { number: "01", app: "clipsy", title: "Upload ton catalogue", desc: "Podcasts, lives, formations. Clipsy indexe et détecte les moments à fort potentiel viral." },
      { number: "02", app: "avatar", title: "Crée ton avatar IA signature", desc: "Clone ton visage et ta voix. Tu as un double IA prêt à incarner tes scripts quotidiens." },
      { number: "03", app: "adlab", title: "Calendrier de publication auto", desc: "10 pièces / jour sur LinkedIn, IG, TikTok, YT. Thumbs choisit les miniatures, Adlab optimise les hooks." },
    ],
    testimonial: {
      quote:
        "Je suis coach business depuis 8 ans. J'ai 40h de contenu qui dormait. Horpen a tout scanné, j'ai 400 clips vidéo générés en 2 semaines. Mon Instagram a doublé en 1 mois. Mes ventes de formation : +180%.",
      author: "Sophie V.",
      role: "Coach business — 85k followers IG",
    },
    finalCtaTitle: "Recycler ton catalogue de contenus ?",
  },

  saas: {
    slug: "saas",
    tag: "Horpen pour les SaaS B2B",
    name: "SaaS B2B",
    dropdownDesc: "Startups B2B, outils SaaS",
    Icon: CodeBrowser,
    accent: "#06b6d4",
    heroTitle: "Raconte ton SaaS mieux que ta concurrence.",
    heroSubtitle:
      "Horpen transforme tes features en démos vidéo, ton blog en shorts LinkedIn, tes screenshots en ads converteurs. Ton CAC baisse, ton cycle de vente raccourcit, ton marketing devient enfin scalable.",
    heroCta: "Lancer mon studio SaaS",
    stats: [
      { value: "-40%", label: "sur le CAC organique" },
      { value: "3 j", label: "entre feature ship et campagne live" },
      { value: "10", label: "démos vidéo générées / feature" },
    ],
    pains: [
      { label: "Démo produit = 2 semaines à filmer", desc: "Tu shippes une feature, ton équipe marketing met 2 semaines à produire la vidéo de lancement. Le hype retombe." },
      { label: "Tes ads SaaS sonnent corporate", desc: "Les creatives génériques type \"See how X helps you scale\" ne convertissent pas. Tu n'as pas d'UGC authentique B2B." },
      { label: "Content marketing qui ne rame pas", desc: "Tu publies 1 blog / semaine, zéro découverte. Pas assez de volume, pas assez de formats, pas de reach organique." },
    ],
    benefits: [
      { app: "clipsy", title: "Démo produit en 5 minutes", desc: "Upload ton screen record. Clipsy ajoute voix off, sous-titres, zoom auto sur les clics. Vidéo de lancement prête le jour même." },
      { app: "avatar", title: "Testimonials clients IA (autorisés)", desc: "Client signe un consentement, upload 30s de voix. Avatar génère 10 testimonials vidéo avec son accord, sous tes angles marketing." },
      { app: "adlab", title: "Ads B2B qui convertissent", desc: "Adlab connaît les hooks B2B qui marchent dans ta niche SaaS. 50 variantes testées, 1 gagnante, scale auto sur LinkedIn Ads." },
      { app: "canvas", title: "Screenshots stylés, mockups pro", desc: "Canvas transforme tes captures produit en visuels lifestyle, mockups MacBook, bannières dashboard. Finies les screenshots brutes moches." },
    ],
    steps: [
      { number: "01", app: "clipsy", title: "Ship feature → démo en 1 clic", desc: "Tu records ton écran 2 minutes. Clipsy ajoute voix, sous-titres, zoom animé. Démo publiable sur site + LinkedIn." },
      { number: "02", app: "canvas", title: "Visuels marketing pro", desc: "Upload screenshots produit. Canvas les intègre dans des mockups MacBook / iPhone / billboard. Prêts pour ads + OG images." },
      { number: "03", app: "adlab", title: "Campagne LinkedIn + Meta live", desc: "Adlab génère 20 variantes d'ads B2B. A/B test auto, détection de la gagnante, export LinkedIn Ads + Meta." },
    ],
    testimonial: {
      quote:
        "On est 6 chez Flowy, on vend à des PMI. Avant Horpen, notre CAC moyen était 380€. Après 2 mois, 210€. Les démos produit ne coûtent plus rien. Notre team ship et communique simultanément.",
      author: "Thomas P.",
      role: "CEO, Flowy — SaaS B2B workflow",
    },
    finalCtaTitle: "Scaler ton marketing SaaS ?",
  },
};

/* ─── SolutionLanding — the actual page layout ────────────────────── */

export function SolutionLanding({ slug }: { slug: SolutionSlug }) {
  const config = SOLUTIONS[slug];
  return (
    <>
      <SubLandingNav />

      <Hero config={config} />
      <Pains config={config} />
      <Benefits config={config} />
      <Steps config={config} />
      <Testimonial config={config} />
      <SolutionsCrossGrid exclude={config.slug} />
      <FinalCTA config={config} />

      <SubLandingFooter />

      {/* Global reveal animation — matches the rest of the landing */}
      <style jsx global>{`
        @keyframes sol-fade-up {
          0% { opacity: 0; transform: translate3d(0, 24px, 0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .sol-reveal {
          opacity: 0;
          transform: translate3d(0, 24px, 0);
          animation: sol-fade-up 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          animation-delay: var(--sol-delay, 0s);
        }
        @media (prefers-reduced-motion: reduce) {
          .sol-reveal { opacity: 1; transform: none; animation: none; }
        }
      `}</style>
    </>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────── */

function Hero({ config }: { config: SolutionConfig }) {
  return (
    <section
      className="pt-[88px] relative overflow-hidden"
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, ${config.accent}22 0%, #000000 60%)`,
        color: "#ffffff",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="max-w-[1080px] mx-auto px-5 md:px-8 py-24 md:py-32 relative flex flex-col items-center text-center">
        <div
          className="sol-reveal"
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${config.accent}40, ${config.accent}15)`,
            border: `1px solid ${config.accent}50`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: config.accent,
            marginBottom: 28,
            boxShadow: `0 10px 28px -8px ${config.accent}50`,
          }}
        >
          <config.Icon className="w-7 h-7" />
        </div>

        <div
          className="sol-reveal"
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#9ca3af",
            marginBottom: 18,
            "--sol-delay": "0.05s",
          } as React.CSSProperties}
        >
          {config.tag}
        </div>

        <h1
          className="sol-reveal"
          style={{
            fontSize: "clamp(36px, 5.5vw, 64px)",
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            fontWeight: 600,
            color: "#ffffff",
            maxWidth: 860,
            "--sol-delay": "0.1s",
          } as React.CSSProperties}
        >
          {config.heroTitle}
        </h1>

        <p
          className="sol-reveal mt-6"
          style={{
            color: "#cbd5e1",
            fontSize: "clamp(16px, 1.4vw, 19px)",
            lineHeight: 1.55,
            maxWidth: 720,
            "--sol-delay": "0.15s",
          } as React.CSSProperties}
        >
          {config.heroSubtitle}
        </p>

        <div
          className="sol-reveal mt-10 flex flex-wrap items-center justify-center gap-3"
          style={{ "--sol-delay": "0.25s" } as React.CSSProperties}
        >
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-medium transition"
            style={{ background: "#ffffff", color: "#0a0a0a", fontSize: 15 }}
          >
            {config.heroCta}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/#pricing"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-medium transition"
            style={{
              background: "transparent",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.2)",
              fontSize: 15,
            }}
          >
            Voir les tarifs
          </Link>
        </div>

        {/* Stats row */}
        <div
          className="sol-reveal mt-16 grid grid-cols-3 gap-4 md:gap-10 w-full max-w-[640px]"
          style={{ "--sol-delay": "0.35s" } as React.CSSProperties}
        >
          {config.stats.map((s, i) => (
            <div key={i} className="text-center">
              <div
                style={{
                  fontSize: "clamp(28px, 3.4vw, 40px)",
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: config.accent,
                  lineHeight: 1,
                }}
              >
                {s.value}
              </div>
              <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 12.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pains (dark) ────────────────────────────────────────────────── */

function Pains({ config }: { config: SolutionConfig }) {
  return (
    <section
      className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
      style={{ background: "#000000", color: "#f3f4f6" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="max-w-[1080px] mx-auto relative">
        <div className="text-center mb-14">
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#9ca3af",
              marginBottom: 18,
            }}
          >
            Sans Horpen
          </div>
          <h2
            style={{
              fontSize: "clamp(30px, 4vw, 46px)",
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              color: "#ffffff",
              maxWidth: 780,
              margin: "0 auto",
            }}
          >
            Ce qui freine ta croissance aujourd&apos;hui.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {config.pains.map((p, i) => (
            <div
              key={i}
              className="sol-reveal rounded-2xl p-6"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                "--sol-delay": `${i * 0.06}s`,
              } as React.CSSProperties}
            >
              <div style={{ color: "#f87171", marginBottom: 14 }}>
                <XIcon className="w-5 h-5" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#ffffff", letterSpacing: "-0.015em", marginBottom: 8 }}>
                {p.label}
              </div>
              <div style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.55 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Benefits — 4 horpen-app-powered wins (dark) ─────────────────── */

function Benefits({ config }: { config: SolutionConfig }) {
  return (
    <section
      className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
      style={{ background: "#000000", color: "#f3f4f6", borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="max-w-[1280px] mx-auto relative">
        <div className="text-center mb-14">
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#9ca3af",
              marginBottom: 18,
            }}
          >
            Avec Horpen
          </div>
          <h2
            style={{
              fontSize: "clamp(30px, 4vw, 46px)",
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              color: "#ffffff",
              maxWidth: 820,
              margin: "0 auto",
            }}
          >
            Chaque app fait partie du moteur.{" "}
            <span style={{ color: "#6b7280" }}>Branches ce dont tu as besoin.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {config.benefits.map((b, i) => {
            const product = PRODUCTS.find((p) => p.slug === b.app)!;
            return (
              <div
                key={i}
                className="sol-reveal rounded-2xl p-7 md:p-8 flex gap-5 items-start"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  "--sol-delay": `${i * 0.06}s`,
                } as React.CSSProperties}
              >
                <div style={{ flexShrink: 0 }}>
                  <Product3DLogo product={product} size={54} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "#9ca3af",
                      marginBottom: 8,
                    }}
                  >
                    {product.name}
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: "#ffffff",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.25,
                      marginBottom: 10,
                    }}
                  >
                    {b.title}
                  </div>
                  <div style={{ fontSize: 14.5, color: "#9ca3af", lineHeight: 1.55 }}>{b.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Steps — 3-step workflow (dark) ──────────────────────────────── */

function Steps({ config }: { config: SolutionConfig }) {
  return (
    <section
      className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
      style={{ background: "#000000", color: "#f3f4f6" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="max-w-[1080px] mx-auto relative">
        <div className="text-center mb-14">
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#9ca3af",
              marginBottom: 18,
            }}
          >
            Workflow type
          </div>
          <h2
            style={{
              fontSize: "clamp(30px, 4vw, 46px)",
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              color: "#ffffff",
              maxWidth: 780,
              margin: "0 auto",
            }}
          >
            Comment ça marche pour toi, concrètement.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.steps.map((s, i) => {
            const product = PRODUCTS.find((p) => p.slug === s.app)!;
            return (
              <div
                key={i}
                className="sol-reveal relative"
                style={{ "--sol-delay": `${i * 0.08}s` } as React.CSSProperties}
              >
                <div
                  style={{
                    fontSize: 52,
                    fontWeight: 700,
                    letterSpacing: "-0.04em",
                    color: config.accent,
                    lineHeight: 1,
                    marginBottom: 12,
                    opacity: 0.9,
                  }}
                >
                  {s.number}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Product3DLogo product={product} size={22} />
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "#9ca3af",
                    }}
                  >
                    {product.name}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: "#ffffff",
                    letterSpacing: "-0.02em",
                    marginBottom: 8,
                  }}
                >
                  {s.title}
                </div>
                <div style={{ fontSize: 14.5, color: "#9ca3af", lineHeight: 1.55 }}>{s.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonial (dark) ──────────────────────────────────────────── */

function Testimonial({ config }: { config: SolutionConfig }) {
  const t = config.testimonial;
  return (
    <section
      className="py-20 md:py-28 px-5 md:px-8 relative overflow-hidden"
      style={{
        background: "#000000",
        color: "#f3f4f6",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="max-w-[880px] mx-auto relative text-center">
        <div className="flex items-center justify-center gap-1 mb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} style={{ color: config.accent, fontSize: 18 }}>
              ★
            </span>
          ))}
        </div>
        <blockquote
          style={{
            fontSize: "clamp(22px, 2.6vw, 30px)",
            lineHeight: 1.4,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            fontWeight: 500,
          }}
        >
          &ldquo;{t.quote}&rdquo;
        </blockquote>
        <div className="mt-10 flex items-center justify-center gap-4">
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${config.accent}, ${config.accent}88)`,
              border: "2px solid rgba(255,255,255,0.1)",
              boxShadow: `0 4px 14px ${config.accent}40`,
            }}
          />
          <div className="text-left">
            <div style={{ fontWeight: 600, color: "#ffffff", fontSize: 15 }}>{t.author}</div>
            <div style={{ color: "#9ca3af", fontSize: 13 }}>{t.role}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Cross-promo to other solutions ──────────────────────────────── */

export function SolutionsCrossGrid({ exclude }: { exclude?: SolutionSlug }) {
  const items = Object.values(SOLUTIONS).filter((s) => s.slug !== exclude);
  return (
    <section
      className="py-16 md:py-20 px-5 md:px-8 relative overflow-hidden"
      style={{ background: "#000000", color: "#f3f4f6" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="max-w-[1080px] mx-auto relative">
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#9ca3af",
            marginBottom: 18,
            textAlign: "center",
          }}
        >
          Autres solutions
        </div>
        <h2
          style={{
            fontSize: "clamp(26px, 3.2vw, 38px)",
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
            fontWeight: 600,
            color: "#ffffff",
            textAlign: "center",
            maxWidth: 680,
            margin: "0 auto 40px",
          }}
        >
          Horpen sert aussi ces profils.
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {items.map((s) => (
            <Link
              key={s.slug}
              href={`/solutions/${s.slug}`}
              className="rounded-2xl p-5 transition"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${s.accent}40, ${s.accent}15)`,
                  border: `1px solid ${s.accent}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: s.accent,
                }}
              >
                <s.Icon className="w-4 h-4" />
              </div>
              <div style={{ color: "#ffffff", fontWeight: 600, fontSize: 15 }}>{s.name}</div>
              <div style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.45 }}>{s.dropdownDesc}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA (dark card with accent glow) ──────────────────────── */

function FinalCTA({ config }: { config: SolutionConfig }) {
  return (
    <section className="py-24 md:py-32 px-5 md:px-8" style={{ background: "#000000" }}>
      <div className="max-w-[960px] mx-auto">
        <div
          className="rounded-[28px] p-10 md:p-16 text-center relative overflow-hidden"
          style={{
            background: `radial-gradient(120% 100% at 50% 0%, ${config.accent}30 0%, #08101d 50%, #02040a 100%)`,
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: `0 60px 120px -30px ${config.accent}40`,
          }}
        >
          <h2
            style={{
              fontSize: "clamp(32px, 4.5vw, 52px)",
              lineHeight: 1.08,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              color: "#ffffff",
              maxWidth: 780,
              margin: "0 auto",
            }}
          >
            {config.finalCtaTitle}
          </h2>
          <p style={{ marginTop: 18, color: "#cbd5e1", fontSize: 17, maxWidth: 580, margin: "18px auto 0" }}>
            3 crédits offerts. Pas de CB. Annule à tout moment. Droits commerciaux inclus dès le premier plan payant.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
              style={{ background: "#ffffff", color: "#0a0a0a", fontSize: 15 }}
            >
              <Check className="w-4 h-4" />
              {config.heroCta}
            </Link>
            <Link
              href="mailto:support@horpen.ai"
              className="inline-flex items-center gap-2 px-5 py-4 rounded-full font-medium transition"
              style={{
                background: "transparent",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.2)",
                fontSize: 15,
              }}
            >
              Réserver une démo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Solutions dropdown — used in the main landing nav ───────────── */

export function SolutionsDropdown({ onClose }: { onClose?: () => void }) {
  return (
    <div
      className="absolute top-full left-1/2 -translate-x-1/2 pt-3"
      style={{ zIndex: 50 }}
    >
      <div
        className="rounded-[20px] overflow-hidden"
        style={{
          background: "rgba(10,10,15,0.96)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6)",
          width: "min(720px, 90vw)",
          padding: 16,
        }}
      >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "#9ca3af",
          padding: "8px 8px 14px",
        }}
      >
        Horpen est pour
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {Object.values(SOLUTIONS).map((s) => (
          <Link
            key={s.slug}
            href={`/solutions/${s.slug}`}
            onClick={() => onClose?.()}
            className="flex items-center gap-3 p-3 rounded-xl transition"
            style={{ color: "#ffffff" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: `linear-gradient(135deg, ${s.accent}40, ${s.accent}15)`,
                border: `1px solid ${s.accent}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: s.accent,
                flexShrink: 0,
              }}
            >
              <s.Icon className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff" }}>{s.name}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{s.dropdownDesc}</div>
            </div>
          </Link>
        ))}
        </div>
      </div>
    </div>
  );
}
