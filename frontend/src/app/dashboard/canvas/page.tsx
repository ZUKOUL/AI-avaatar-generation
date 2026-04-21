"use client";

/**
 * /dashboard/canvas — Canvas product page.
 *
 * Regroupe la génération Image + Vidéo + Références sous une seule
 * route avec sous-onglets horizontaux façon Foreplay Discovery. Chaque
 * sous-onglet charge le composant correspondant sans changer de route
 * — pattern rapide et fluide vs multiples routes séparées.
 */

import { useState } from "react";
import Link from "next/link";
import { SubTabs } from "@/components/dashboard/SubTabs";
import {
  VideoCamera,
  ImageSquare,
  SparkleIcon,
  Brush,
  Package,
  ArrowRight,
} from "@/components/Icons";

type TabKey = "video" | "image" | "references" | "styles";

export default function CanvasPage() {
  const [tab, setTab] = useState<TabKey>("video");

  return (
    <div className="flex-1 overflow-auto" style={{ background: "var(--bg-primary)" }}>
      {/* ── Header : nom produit + sous-tabs ── */}
      <div
        className="sticky top-0 z-10"
        style={{
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div className="px-6 md:px-8 pt-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "radial-gradient(circle at 28% 22%, #93c5fd 0%, #3b82f6 55%, #1e40af 100%)",
                boxShadow:
                  "inset 0 1.5px 2px rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.22), 0 4px 12px -2px rgba(59,130,246,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4 V20 M4 12 H20" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
                Canvas
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Générer tes visuels IA
              </div>
            </div>
          </div>

          <Link
            href="/dashboard/credits"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            <SparkleIcon size={13} />
            Upgrade
          </Link>
        </div>

        <div className="px-4 md:px-6 pt-3">
          <SubTabs
            items={[
              { key: "video", label: "Vidéo", icon: VideoCamera },
              { key: "image", label: "Image", icon: ImageSquare },
              { key: "references", label: "Références", icon: Package },
              { key: "styles", label: "Styles", icon: Brush },
            ]}
            active={tab}
            onChange={(k) => setTab(k as TabKey)}
          />
        </div>
      </div>

      {/* ── Contenu sous-onglet ── */}
      <div className="px-6 md:px-8 py-8">
        {tab === "video" && <CanvasVideo />}
        {tab === "image" && <CanvasImage />}
        {tab === "references" && <CanvasReferences />}
        {tab === "styles" && <CanvasStyles />}
      </div>
    </div>
  );
}

/* ─── Panels ─── */

function EmptyPanel({
  title,
  desc,
  href,
  cta,
}: {
  title: string;
  desc: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="rounded-2xl p-10 text-center"
        style={{
          border: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 460, margin: "0 auto 18px", lineHeight: 1.55 }}>
          {desc}
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full"
          style={{ background: "#0a0a0a", color: "#ffffff", fontSize: 13, fontWeight: 500 }}
        >
          {cta}
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

function CanvasVideo() {
  return (
    <EmptyPanel
      title="Générer une vidéo IA"
      desc="Décris la scène que tu veux, Horpen choisit le meilleur moteur (Kling / Veo / Hailuo / Grok) et livre ta vidéo en 2 min."
      href="/dashboard/videos"
      cta="Ouvrir le générateur vidéo"
    />
  );
}

function CanvasImage() {
  return (
    <EmptyPanel
      title="Générer une image IA"
      desc="Gemini 3 Pro Image (Nano Banana Pro). Photo produit, visuel social, hero image — tu prompts, ça sort."
      href="/dashboard/images"
      cta="Ouvrir le générateur d'image"
    />
  );
}

function CanvasReferences() {
  return (
    <EmptyPanel
      title="Tes images de référence"
      desc="Upload des visuels de référence qui guident le style de toutes tes futures générations dans Canvas."
      href="/dashboard/images"
      cta="Gérer mes références"
    />
  );
}

function CanvasStyles() {
  return (
    <EmptyPanel
      title="Tes styles sauvegardés"
      desc="Crée tes presets de style (palette, ambiance, format) et réutilise-les d'un clic sur toutes tes créas."
      href="/dashboard/characters"
      cta="Voir mes styles"
    />
  );
}
