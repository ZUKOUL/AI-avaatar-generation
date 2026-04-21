"use client";

import { SubLanding, LandingConfig, MockupFrame, MockupBrowserChrome } from "@/components/landing/sub-landing";

const AUTOCLIP: LandingConfig = {
  slug: "autoclip",
  heroBadge: "⌘L pour ouvrir",
  heroTitle: (
    <>
      Du prompt à la vidéo short.
      <br />
      <span style={{ color: "#86efac" }}>Direct. Sans éditeur.</span>
    </>
  ),
  heroSubtitle:
    "Décris ton idée, colle une URL long-form, ou programme la publication — Autoclip assemble script, voix, visuels, sous-titres et coupes en pipeline automatisé. Publie sur TikTok / Reels / Shorts sans jamais ouvrir CapCut.",
  heroCta: "Générer mon premier clip",
  heroMockup: <HeroMockup />,

  logoBand: true,
  logoBandCopy: "Utilisé par des créateurs et faceless accounts qui postent 5-10×/jour",

  problem: {
    title: (
      <>
        Tu passes 2 heures sur CapCut par vidéo.{" "}
        <span style={{ color: "#9ca3af" }}>Pour 30 secondes de short.</span>
      </>
    ),
    subtitle:
      "Écrire le script, choisir la voix, trouver les visuels, monter les coupes, ajouter les sous-titres, exporter, poster à la main sur 3 plateformes. Chaque vidéo t'en coûte une demi-journée.",
    pains: [
      { label: "CapCut / Premiere : 2h par short", desc: "À 5 shorts par semaine, ça fait 10h/semaine de montage. Tu n'as pas d'autre choix que ralentir ton volume." },
      { label: "Long-form → shorts manuels", desc: "Trouver les moments engageants dans une vidéo d'1h, c'est 45 min juste de visionnage. Tu rates les meilleurs hooks." },
      { label: "Publication manuelle x3", desc: "Poster sur TikTok + Reels + YouTube Shorts séparément, avec 3 formats différents, 3 descriptions. Chaque upload = 10 min." },
    ],
  },

  features: [
    {
      eyebrow: "Depuis un prompt",
      title: "Décris ta vidéo, Autoclip assemble tout",
      desc:
        "Script généré par Gemini, voix-over ElevenLabs, visuels Canvas, sous-titres animés, musique fond. Pipeline complet de l'idée à l'export MP4 1080×1920 prêt à publier.",
      tags: ["Gemini 2.5 Pro", "ElevenLabs voice", "Sous-titres animés"],
      visual: <FeaturePrompt />,
    },
    {
      eyebrow: "Depuis une URL",
      title: "Long-form → 5 shorts, automatiquement",
      desc:
        "Colle un lien YouTube, Loom, Vimeo, un podcast. Autoclip détecte les passages les plus engageants (hook-stop, moment émotionnel, punchline), les découpe en 30-60s, ajoute sous-titres + reframe 9:16.",
      tags: ["YouTube · Loom · Podcast", "Moment detection IA", "Reframe 9:16 intelligent"],
      visual: <FeatureURL />,
    },
    {
      eyebrow: "Sous-titres animés",
      title: "Le style qui fait watch-to-end",
      desc:
        "Sous-titres synchronisés au mot, animés selon l'émotion parlée, avec emoji auto-contextualisés. Templates pré-configurés par niche (business, fitness, beauté, comedy). Export SRT dispo.",
      tags: ["Sync word-by-word", "Emoji auto", "Templates par niche"],
      visual: <FeatureSubtitles />,
    },
    {
      eyebrow: "Publication auto",
      title: "TikTok, Reels, Shorts — publiés aux créneaux optimaux",
      desc:
        "Connecte tes comptes, programme la publication. Autoclip choisit l'heure de post optimale pour ton audience par plateforme, écrit descriptions et hashtags adaptés. Multi-posting illimité.",
      tags: ["TikTok · Reels · Shorts", "Scheduler IA", "Descriptions + hashtags auto"],
      visual: <FeatureScheduler />,
    },
  ],

  howItWorks: {
    title: (
      <>
        De l&apos;idée au post publié.{" "}
        <span style={{ color: "#9ca3af" }}>3 minutes, 3 plateformes.</span>
      </>
    ),
    steps: [
      { number: "01", title: "Prompt ou URL", desc: "Décris ta vidéo ou colle un lien long-form. Autoclip comprend et démarre le pipeline." },
      { number: "02", title: "Pipeline auto", desc: "Script, voix, visuels, sous-titres, reframe 9:16, export. 1-3 min selon durée et moteur." },
      { number: "03", title: "Publie ou programme", desc: "Download direct, ou scheduler auto sur TikTok + Reels + Shorts aux heures optimales." },
    ],
  },

  testimonial: {
    quote:
      "J'ai un podcast de 1h par semaine. Avant, je passais 6h à sortir 3 shorts. Avec Autoclip, je colle le lien, je récupère 5 shorts auto-montés en 10 min. Mon compte TikTok est passé de 2k à 40k abonnés en 3 mois.",
    author: "Thomas L.",
    role: "Podcasteur / business creator · 40k abonnés TikTok",
    metrics: [
      { value: "6h → 10 min", label: "Temps par batch" },
      { value: "20×", label: "Plus de volume" },
      { value: "+38k", label: "Abos TikTok / 3 mois" },
    ],
  },

  comparison: {
    title: (
      <>
        Autoclip vs{" "}
        <span style={{ color: "#9ca3af" }}>les auto-clippers classiques</span>
      </>
    ),
    subtitle: "Les concurrents découpent. Autoclip assemble de A à Z et publie.",
    usLabel: "Horpen Autoclip",
    competitorLabels: ["Opus Clip", "Vizard", "Munch"],
    rows: [
      { feature: "URL → shorts découpés IA", us: true, them: [true, true, true] },
      { feature: "Prompt → vidéo complète", us: true, them: [false, false, false] },
      { feature: "Sous-titres animés word-by-word", us: true, them: [true, "Basique", true] },
      { feature: "Publication auto multi-plateforme", us: true, them: [false, false, false] },
      { feature: "Avatar IA intégré", us: true, them: [false, false, false] },
      { feature: "Prix / mois", us: "Dès 35€", them: ["29$", "39$", "49$"] },
      { feature: "Partagé avec Canvas / Avatar", us: true, them: [false, false, false] },
    ],
  },

  faq: [
    {
      q: "Quelle différence entre mode Prompt et mode URL ?",
      a: "Prompt : tu pars d'une idée sans contenu existant. Autoclip écrit le script, génère la voix, les visuels, tout. Idéal pour créer des shorts éducatifs ou faceless. URL : tu pars d'une vidéo long-form existante. Autoclip détecte les moments engageants et découpe.",
    },
    {
      q: "Quels formats d'export ?",
      a: "9:16 (TikTok / Reels / Shorts) par défaut. Aussi 1:1 (Instagram feed), 4:5 (portrait feed), 16:9 (YouTube long). HD 1080p sur tous les plans, 4K en Studio.",
    },
    {
      q: "Combien de temps prend une génération ?",
      a: "Prompt mode : 1-3 min pour 30s de vidéo. URL mode : 5-8 min pour découper une source d'1h en 5 shorts (dépend aussi de la vitesse de téléchargement YouTube).",
    },
    {
      q: "Je peux programmer la publication ?",
      a: "Oui. Connecte TikTok, Instagram Reels, YouTube Shorts. Autoclip programme aux créneaux où ton audience est active (détection auto via l'API de chaque plateforme), écrit descriptions + hashtags natifs par plateforme.",
    },
    {
      q: "Le moteur de voix-over ?",
      a: "ElevenLabs par défaut (29 voix FR + 300 voix EN + 50 voix multi-langues). Tu peux aussi uploader ta propre voix (clonage) en plan Studio — 30s d'audio suffisent.",
    },
    {
      q: "Je peux utiliser mon avatar dans les shorts ?",
      a: "Oui. Si tu as un Avatar entraîné, Autoclip l'intègre comme visage parlant (lipsync auto). Parfait pour un compte faceless avec ton persona IA.",
    },
    {
      q: "Combien de crédits par short ?",
      a: "Prompt mode : 8 crédits / 30s (script + voix + visuels + sous-titres + montage). URL mode : 12 crédits pour 5 shorts découpés d'une source long-form. Scheduler gratuit.",
    },
    {
      q: "Ça marche sur quelles sources long-form ?",
      a: "YouTube (toute vidéo publique), Loom, Vimeo, MP4 direct upload, URL de podcasts RSS. Durée source max 4h en Creator, 8h en Studio.",
    },
  ],

  finalCtaTitle: (
    <>
      Ton éditeur vidéo dort encore ?
      <br />
      <span style={{ color: "#94a3b8" }}>Toi non.</span>
    </>
  ),
  finalCtaSub: "3 shorts offerts pour tester. Pas de CB, pas d'engagement.",
  finalCta: "Générer mon premier short",
};

export default function AutoclipLanding() {
  return <SubLanding config={AUTOCLIP} />;
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
          boxShadow: "0 32px 80px -16px rgba(16,185,129,0.35)",
        }}
      >
        <MockupBrowserChrome url="horpen.ai/autoclip" />
        <div className="p-5">
          <div
            style={{
              fontSize: 10.5,
              color: "#065f46",
              fontFamily: "ui-monospace, monospace",
              marginBottom: 12,
              padding: "8px 10px",
              background: "#d1fae5",
              borderRadius: 8,
              border: "1px solid #a7f3d0",
            }}
          >
            🎬 Source : youtube.com/watch?v=podcast · 1h12m
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="relative rounded-lg overflow-hidden"
                style={{
                  aspectRatio: "9/16",
                  background: `linear-gradient(180deg, #047857, #10b981, #6ee7b7)`,
                  border: "2px solid #fff",
                  boxShadow: "0 4px 12px rgba(16,185,129,0.25)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    bottom: 6,
                    left: 6,
                    right: 6,
                    height: 3,
                    background: "rgba(255,255,255,0.3)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ width: "60%", height: "100%", background: "#fff" }} />
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 4,
                    fontSize: 8,
                    color: "#fff",
                    background: "rgba(0,0,0,0.6)",
                    padding: "1px 4px",
                    borderRadius: 3,
                    fontWeight: 600,
                  }}
                >
                  {10 + i * 12}s
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", textAlign: "center", marginTop: 12 }}>
            5 shorts auto-découpés · Sous-titres + reframe inclus
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturePrompt() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 h-full flex flex-col">
        <div
          style={{
            padding: "8px 12px",
            background: "#fafafa",
            borderRadius: 8,
            border: "1px solid #ececec",
            fontSize: 10.5,
            color: "#0a0a0a",
            fontFamily: "ui-monospace, monospace",
            marginBottom: 12,
          }}
        >
          &gt; 30s sur la productivité matinale des entrepreneurs
        </div>
        <div className="flex-1 grid grid-cols-4 gap-2">
          {[
            { label: "Script", color: "#3b82f6" },
            { label: "Voix-over", color: "#8b5cf6" },
            { label: "Visuels", color: "#ec4899" },
            { label: "Montage", color: "#10b981" },
          ].map((step, i) => (
            <div
              key={i}
              className="rounded-lg p-2 text-center flex flex-col items-center justify-center"
              style={{
                background: `${step.color}10`,
                border: `1px solid ${step.color}30`,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: step.color,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 6,
                }}
              >
                ✓
              </div>
              <div style={{ fontSize: 10, color: step.color, fontWeight: 600 }}>{step.label}</div>
            </div>
          ))}
        </div>
      </div>
    </MockupFrame>
  );
}

function FeatureURL() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4">
        <div
          style={{
            height: 14,
            background: "#f3f4f6",
            borderRadius: 7,
            position: "relative",
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          {[15, 28, 46, 62, 85].map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${p}%`,
                top: -4,
                width: 8,
                height: 22,
                background: "#10b981",
                borderRadius: 2,
                boxShadow: "0 2px 6px rgba(16,185,129,0.4)",
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", textAlign: "center", marginBottom: 14 }}>
          5 moments engageants détectés — durée source 1h12m
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-md"
              style={{
                aspectRatio: "9/16",
                background: `linear-gradient(180deg, #10b981, #065f46)`,
                border: "1px solid rgba(255,255,255,0.3)",
                boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
              }}
            />
          ))}
        </div>
      </div>
    </MockupFrame>
  );
}

function FeatureSubtitles() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 h-full flex items-center justify-center">
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            width: 140,
            aspectRatio: "9/16",
            background: "linear-gradient(180deg, #0a0a0a, #1f2937)",
            border: "2px solid #fff",
            boxShadow: "0 12px 32px rgba(16,185,129,0.3)",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: "30%",
              left: 8,
              right: 8,
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "5px 9px",
                background: "#10b981",
                color: "#fff",
                fontSize: 11,
                fontWeight: 900,
                borderRadius: 4,
                marginBottom: 3,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              TESTE
            </div>
            <div
              style={{
                display: "inline-block",
                padding: "5px 9px",
                background: "#fff",
                color: "#0a0a0a",
                fontSize: 11,
                fontWeight: 900,
                borderRadius: 4,
                marginLeft: 3,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              ÇA 🔥
            </div>
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

function FeatureScheduler() {
  return (
    <MockupFrame aspect="4/3">
      <div className="p-4 space-y-2">
        {[
          { p: "TikTok", time: "19:00", status: "Programmé", color: "#0a0a0a" },
          { p: "Instagram Reels", time: "20:30", status: "Programmé", color: "#ec4899" },
          { p: "YouTube Shorts", time: "21:00", status: "Programmé", color: "#dc2626" },
        ].map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-lg"
            style={{ background: "#fafafa", border: "1px solid #ececec" }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: s.color,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {s.p.charAt(0)}
            </div>
            <div className="flex-1">
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a" }}>{s.p}</div>
              <div style={{ fontSize: 10.5, color: "#6b7280" }}>Aujourd&apos;hui · {s.time}</div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 999,
                background: "#dcfce7",
                color: "#10b981",
              }}
            >
              ● {s.status}
            </span>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}
