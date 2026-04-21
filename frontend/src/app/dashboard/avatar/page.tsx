"use client";

/**
 * /dashboard/avatar — Avatar product page.
 * Sous-onglets : Mes avatars · Créer · Community · Entraînement.
 */

import { useState } from "react";
import { ProductPageShell, EmptyPanel } from "@/components/dashboard/ProductPageShell";

type TabKey = "mine" | "create" | "community" | "training";

export default function AvatarPage() {
  const [tab, setTab] = useState<TabKey>("mine");

  return (
    <ProductPageShell
      slug="avatar"
      tabs={[
        { key: "mine", label: "Mes avatars" },
        { key: "create", label: "Créer" },
        { key: "community", label: "Community" },
        { key: "training", label: "Entraînement" },
      ]}
      active={tab}
      onTabChange={(k) => setTab(k as TabKey)}
    >
      {tab === "mine" && (
        <EmptyPanel
          title="Mes avatars IA"
          desc="Retrouve tous tes avatars entraînés. Chacun est réutilisable dans Canvas, Adlab, Thumbs et Autoclip."
          href="/dashboard/avatars"
          cta="Voir mes avatars"
        />
      )}
      {tab === "create" && (
        <EmptyPanel
          title="Entraîner un nouvel avatar"
          desc="Charge 6 à 12 photos, Horpen crée ton avatar IA ultra-cohérent en 8 minutes."
          href="/dashboard/characters"
          cta="Lancer l'entraînement"
        />
      )}
      {tab === "community" && (
        <EmptyPanel
          title="Avatars communauté"
          desc="Explore les avatars partagés par la communauté Horpen. Parfait pour lancer un compte UGC faceless."
          href="/dashboard/avatars"
          cta="Parcourir la communauté"
        />
      )}
      {tab === "training" && (
        <EmptyPanel
          title="Jobs d'entraînement en cours"
          desc="Suis l'état d'entraînement de tes avatars (généralement 6-8 minutes du début à la fin)."
          href="/dashboard/avatars"
          cta="Voir les jobs"
        />
      )}
    </ProductPageShell>
  );
}
