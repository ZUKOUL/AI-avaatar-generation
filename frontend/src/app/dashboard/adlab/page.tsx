"use client";

/**
 * /dashboard/adlab — Adlab product page.
 * Sous-onglets : Générer · A/B tests · Templates · Performance.
 */

import { useState } from "react";
import { ProductPageShell, EmptyPanel } from "@/components/dashboard/ProductPageShell";

type TabKey = "generate" | "abtest" | "templates" | "performance";

export default function AdlabPage() {
  const [tab, setTab] = useState<TabKey>("generate");

  return (
    <ProductPageShell
      slug="adlab"
      tabs={[
        { key: "generate", label: "Générer" },
        { key: "abtest", label: "A/B tests" },
        { key: "templates", label: "Templates" },
        { key: "performance", label: "Performance" },
      ]}
      active={tab}
      onTabChange={(k) => setTab(k as TabKey)}
    >
      {tab === "generate" && (
        <EmptyPanel
          title="Générer une ad"
          desc="Décris ton produit, choisis un angle (UGC, before/after, social proof). Adlab génère 10 variantes à tester."
          href="/dashboard/ads"
          cta="Générer mes ads"
        />
      )}
      {tab === "abtest" && (
        <EmptyPanel
          title="A/B tests actifs"
          desc="Lance des tests multi-variantes sur un même angle. Adlab détecte la gagnante et duplique le style."
          href="/dashboard/ads"
          cta="Lancer un A/B test"
        />
      )}
      {tab === "templates" && (
        <EmptyPanel
          title="Templates d'ads"
          desc="Packs pré-configurés : Tinder swipe, before/after, POV creator, unboxing. Prêts à l'emploi sur toutes les niches e-com."
          href="/dashboard/ads"
          cta="Parcourir les templates"
        />
      )}
      {tab === "performance" && (
        <EmptyPanel
          title="Performance de tes ads"
          desc="ROAS, CTR, taux de scroll-stop. Pour chaque ad générée, vois ce qu'elle a ramené une fois publiée."
          href="/dashboard/ads"
          cta="Ouvrir l'analytics"
        />
      )}
    </ProductPageShell>
  );
}
