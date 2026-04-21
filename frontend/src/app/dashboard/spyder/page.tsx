"use client";

/**
 * /dashboard/spyder — Spyder product page.
 * Sous-onglets : Community feed · Brands · Experts · Trends.
 */

import { useState } from "react";
import { ProductPageShell, EmptyPanel } from "@/components/dashboard/ProductPageShell";

type TabKey = "feed" | "brands" | "experts" | "trends";

export default function SpyderPage() {
  const [tab, setTab] = useState<TabKey>("feed");

  return (
    <ProductPageShell
      slug="spyder"
      tabs={[
        { key: "feed", label: "Community feed" },
        { key: "brands", label: "Brands", count: 0 },
        { key: "experts", label: "Experts" },
        { key: "trends", label: "Trends" },
      ]}
      active={tab}
      onTabChange={(k) => setTab(k as TabKey)}
    >
      {tab === "feed" && (
        <EmptyPanel
          title="Feed des ads trackées"
          desc="Toutes les nouvelles ads publiées par tes brands trackées, agrégées ici. IA intégrée pour détecter ce qui performe."
          href="/dashboard/ads"
          cta="Voir le feed"
        />
      )}
      {tab === "brands" && (
        <EmptyPanel
          title="Brands trackées"
          desc="Ajoute des pages Meta Ads Library, profils TikTok ou chaînes YouTube. Spyder scan 24/7 et archive chaque nouveau creative."
          href="/dashboard/ads"
          cta="Ajouter une brand"
        />
      )}
      {tab === "experts" && (
        <EmptyPanel
          title="Experts à suivre"
          desc="Comptes d'experts dans ta niche qui partagent régulièrement de l'inspiration créative."
          href="/dashboard/ads"
          cta="Voir les experts"
        />
      )}
      {tab === "trends" && (
        <EmptyPanel
          title="Tendances détectées"
          desc="Les formats, hooks et angles qui explosent dans ta niche cette semaine. Scoring IA temps réel."
          href="/dashboard/ads"
          cta="Voir les trends"
        />
      )}
    </ProductPageShell>
  );
}
