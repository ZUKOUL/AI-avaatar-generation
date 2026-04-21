"use client";

/**
 * /dashboard/thumbs — Thumbs product page.
 * Sous-onglets : Générer · Inspiration · Saved · Analytics.
 */

import { useState } from "react";
import { ProductPageShell, EmptyPanel } from "@/components/dashboard/ProductPageShell";

type TabKey = "generate" | "inspiration" | "saved" | "analytics";

export default function ThumbsPage() {
  const [tab, setTab] = useState<TabKey>("generate");

  return (
    <ProductPageShell
      slug="thumbs"
      tabs={[
        { key: "generate", label: "Générer" },
        { key: "inspiration", label: "Inspiration" },
        { key: "saved", label: "Saved" },
        { key: "analytics", label: "Analytics CTR" },
      ]}
      active={tab}
      onTabChange={(k) => setTab(k as TabKey)}
    >
      {tab === "generate" && (
        <EmptyPanel
          title="Générer une miniature"
          desc="Colle un lien de vidéo YouTube. Thumbs analyse le contenu et génère une miniature qui fait cliquer en 5 secondes."
          href="/dashboard/thumbnails"
          cta="Générer ma miniature"
        />
      )}
      {tab === "inspiration" && (
        <EmptyPanel
          title="Inspiration miniatures"
          desc="Des centaines de miniatures classées par niche et par CTR. Clique sur une pour la reproduire dans ton style."
          href="/dashboard/thumbnails/inspiration"
          cta="Parcourir l'inspiration"
        />
      )}
      {tab === "saved" && (
        <EmptyPanel
          title="Miniatures sauvegardées"
          desc="Toutes tes miniatures favorites, prêtes à être réutilisées, dupliquées ou modifiées."
          href="/dashboard/thumbnails/saved"
          cta="Voir mes sauvegardes"
        />
      )}
      {tab === "analytics" && (
        <EmptyPanel
          title="Analytics CTR"
          desc="Score de perf de chaque miniature, avant et après publication. Détecte les patterns qui marchent dans ta niche."
          href="/dashboard/thumbnails"
          cta="Ouvrir l'analytics"
        />
      )}
    </ProductPageShell>
  );
}
