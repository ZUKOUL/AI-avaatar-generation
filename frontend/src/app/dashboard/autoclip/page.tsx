"use client";

/**
 * /dashboard/autoclip — Autoclip product page.
 * Sous-onglets : Depuis prompt · Depuis URL · Mes clips · Schedulés.
 */

import { useState } from "react";
import { ProductPageShell, EmptyPanel } from "@/components/dashboard/ProductPageShell";

type TabKey = "prompt" | "url" | "mine" | "scheduled";

export default function AutoclipPage() {
  const [tab, setTab] = useState<TabKey>("prompt");

  return (
    <ProductPageShell
      slug="autoclip"
      tabs={[
        { key: "prompt", label: "Depuis prompt" },
        { key: "url", label: "Depuis URL" },
        { key: "mine", label: "Mes clips" },
        { key: "scheduled", label: "Schedulés" },
      ]}
      active={tab}
      onTabChange={(k) => setTab(k as TabKey)}
    >
      {tab === "prompt" && (
        <EmptyPanel
          title="Vidéo IA depuis un prompt"
          desc="Décris ta vidéo (scène, hook, durée). Autoclip assemble script + voix + visuels + sous-titres en pipeline automatisé."
          href="/dashboard/ai-videos"
          cta="Lancer depuis prompt"
        />
      )}
      {tab === "url" && (
        <EmptyPanel
          title="Long-form → shorts"
          desc="Colle une URL YouTube ou Loom. Autoclip détecte les meilleurs passages, les découpe, ajoute sous-titres + musique."
          href="/dashboard/clips"
          cta="Lancer depuis URL"
        />
      )}
      {tab === "mine" && (
        <EmptyPanel
          title="Mes clips générés"
          desc="Historique de toutes tes vidéos courtes. Télécharge, republie ou re-cut en 1 clic."
          href="/dashboard/ai-videos"
          cta="Voir mes clips"
        />
      )}
      {tab === "scheduled" && (
        <EmptyPanel
          title="Publications programmées"
          desc="Programme la publication auto sur TikTok / Reels / Shorts depuis Autoclip. Zéro manipulation manuelle."
          href="/dashboard/ai-videos"
          cta="Voir la planification"
        />
      )}
    </ProductPageShell>
  );
}
