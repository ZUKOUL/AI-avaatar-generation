"use client";

/**
 * /dashboard/canvas — Canvas product page.
 * Sous-onglets : Vidéo · Image · Références · Styles.
 */

import { useState } from "react";
import { ProductPageShell, EmptyPanel } from "@/components/dashboard/ProductPageShell";

type TabKey = "video" | "image" | "references" | "styles";

export default function CanvasPage() {
  const [tab, setTab] = useState<TabKey>("video");

  return (
    <ProductPageShell
      slug="canvas"
      tabs={[
        { key: "video", label: "Vidéo" },
        { key: "image", label: "Image" },
        { key: "references", label: "Références" },
        { key: "styles", label: "Styles" },
      ]}
      active={tab}
      onTabChange={(k) => setTab(k as TabKey)}
    >
      {tab === "video" && (
        <EmptyPanel
          title="Générer une vidéo IA"
          desc="Décris la scène, Horpen choisit le meilleur moteur (Kling / Veo / Hailuo / Grok) et livre ta vidéo en 2 min."
          href="/dashboard/videos"
          cta="Ouvrir le générateur vidéo"
        />
      )}
      {tab === "image" && (
        <EmptyPanel
          title="Générer une image IA"
          desc="Gemini 3 Pro Image (Nano Banana Pro). Photo produit, visuel social, hero image — tu prompts, ça sort."
          href="/dashboard/images"
          cta="Ouvrir le générateur d'image"
        />
      )}
      {tab === "references" && (
        <EmptyPanel
          title="Tes images de référence"
          desc="Upload des visuels de référence qui guident le style de toutes tes futures générations dans Canvas."
          href="/dashboard/images"
          cta="Gérer mes références"
        />
      )}
      {tab === "styles" && (
        <EmptyPanel
          title="Tes styles sauvegardés"
          desc="Crée tes presets de style (palette, ambiance, format) et réutilise-les d'un clic sur toutes tes créas."
          href="/dashboard/characters"
          cta="Voir mes styles"
        />
      )}
    </ProductPageShell>
  );
}
