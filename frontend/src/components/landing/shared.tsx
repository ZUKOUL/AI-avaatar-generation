"use client";

/**
 * Shared landing primitives — Foreplay-grade.
 *
 * Provides :
 *   - PRODUCTS + CLUSTERS data (single source of truth for product
 *     identity : name, tagline, color, shape, slug)
 *   - Product3DLogo — CSS-rendered 3D logo tile (rounded-square with
 *     radial gradient, inset highlight, outer glow in product color)
 *   - ProductDock — horizontal row of 5 products à la Foreplay hero
 *     bottom row
 *   - ProductDropdown — nav mega-menu organised by 3 clusters
 *     (CRÉER / PERFORMER / AUTOMATISER)
 *
 * Each sub-landing page (/avatar, /canvas, /adlab…) can pull these
 * directly without duplicating assets.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "@/components/Icons";

export type ProductSlug =
  | "spyder"
  | "canvas"
  | "avatar"
  | "adlab"
  | "thumbs"
  | "autoclip";

export type ProductShape =
  | "canvas"
  | "face"
  | "bolt"
  | "play"
  | "loop"
  | "radar";

export type ClusterKey = "intelligence" | "creer" | "performer" | "automatiser";

export interface Product {
  slug: ProductSlug;
  name: string;
  tagline: string;
  headline: string;
  color: string;
  cluster: ClusterKey;
  shape: ProductShape;
}

export const PRODUCTS: Product[] = [
  {
    slug: "spyder",
    name: "Spyder",
    tagline: "Tracker tes concurrents 24/7",
    headline: "Vois tout ce que tes concurrents publient. Recréé leurs meilleures ads en 1 clic.",
    color: "#dc2626",
    cluster: "intelligence",
    shape: "radar",
  },
  {
    slug: "canvas",
    name: "Canvas",
    tagline: "Générer tes visuels IA",
    headline: "Tes images et tes vidéos IA, depuis un prompt.",
    color: "#3b82f6",
    cluster: "creer",
    shape: "canvas",
  },
  {
    slug: "avatar",
    name: "Avatar",
    tagline: "Ton influenceur IA",
    headline: "Ton visage, ou ton créateur IA. Réutilisable partout.",
    color: "#8b5cf6",
    cluster: "creer",
    shape: "face",
  },
  {
    slug: "adlab",
    name: "Adlab",
    tagline: "Les ads qui convertissent",
    headline: "Des ads qui scrollent-stop. Testées à l'infini.",
    color: "#f59e0b",
    cluster: "performer",
    shape: "bolt",
  },
  {
    slug: "thumbs",
    name: "Thumbs",
    tagline: "La miniature qui fait cliquer",
    headline: "Colle un lien. Récupère la miniature qui performe.",
    color: "#ef4444",
    cluster: "performer",
    shape: "play",
  },
  {
    slug: "autoclip",
    name: "Autoclip",
    tagline: "Du prompt à la vidéo short",
    headline: "Du long-form, une URL ou un prompt — à la vidéo courte. Direct.",
    color: "#10b981",
    cluster: "automatiser",
    shape: "loop",
  },
];

export const CLUSTERS: { key: ClusterKey; label: string; desc: string }[] = [
  { key: "intelligence", label: "Intelligence", desc: "Voir ce qui marche" },
  { key: "creer", label: "Créer", desc: "Générer tes visuels et personas" },
  { key: "performer", label: "Performer", desc: "Transformer en ventes" },
  { key: "automatiser", label: "Automatiser", desc: "Du prompt à la publication" },
];

/* ─────────────────────────────────────────────────────────────────
   Product3DLogo — Foreplay-style 3D tile.

   Uses a radial gradient (highlight top-left, product color middle,
   dark edge bottom-right) + inset shadows to fake a 3D sphere feel
   baked into a rounded square. Inside sits a simple white shape
   specific to the product identity.
   ───────────────────────────────────────────────────────────────── */

function hexDarken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.max(0, Math.floor(parseInt(h.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.floor(parseInt(h.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.floor(parseInt(h.slice(4, 6), 16) * (1 - amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

function hexLighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.min(255, Math.floor(parseInt(h.slice(0, 2), 16) + (255 - parseInt(h.slice(0, 2), 16)) * amount));
  const g = Math.min(255, Math.floor(parseInt(h.slice(2, 4), 16) + (255 - parseInt(h.slice(2, 4), 16)) * amount));
  const b = Math.min(255, Math.floor(parseInt(h.slice(4, 6), 16) + (255 - parseInt(h.slice(4, 6), 16)) * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

export function Product3DLogo({
  product,
  size = 48,
  glow = true,
}: {
  product: Product;
  size?: number;
  glow?: boolean;
}) {
  const radius = size * 0.24;
  const dark = hexDarken(product.color, 0.3);
  const light = hexLighten(product.color, 0.35);

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius,
        position: "relative",
        background: `radial-gradient(circle at 28% 22%, ${light} 0%, ${product.color} 55%, ${dark} 100%)`,
        boxShadow: [
          "inset 0 1.5px 2px rgba(255,255,255,0.45)",
          "inset 0 -2px 3px rgba(0,0,0,0.22)",
          glow ? `0 8px 24px -4px ${product.color}55` : "0 2px 4px rgba(15,15,40,0.08)",
          "0 1px 2px rgba(15,15,40,0.12)",
        ].join(", "),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Shape3D shape={product.shape} size={Math.round(size * 0.48)} />
    </div>
  );
}

function Shape3D({ shape, size }: { shape: ProductShape; size: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" };
  const strokeProps = {
    stroke: "#ffffff",
    strokeWidth: 2.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (shape === "canvas") {
    // Plus / creation symbol
    return (
      <svg {...common}>
        <path d="M12 4 V20 M4 12 H20" {...strokeProps} />
      </svg>
    );
  }
  if (shape === "face") {
    return (
      <svg {...common}>
        <circle cx="12" cy="9" r="3.5" fill="#ffffff" />
        <path d="M4 21 C4 16 7.5 13 12 13 S20 16 20 21" fill="#ffffff" />
      </svg>
    );
  }
  if (shape === "bolt") {
    return (
      <svg {...common}>
        <path d="M13 2 L4 14 H11 L10 22 L20 10 H13 L13 2 Z" fill="#ffffff" />
      </svg>
    );
  }
  if (shape === "play") {
    return (
      <svg {...common}>
        <path d="M8 5 L19 12 L8 19 Z" fill="#ffffff" />
      </svg>
    );
  }
  if (shape === "radar") {
    // Target / radar — concentric arcs + center dot (Spyder)
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="2.5" fill="#ffffff" />
        <circle cx="12" cy="12" r="6" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.85" />
        <circle cx="12" cy="12" r="10" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.45" />
      </svg>
    );
  }
  // loop
  return (
    <svg {...common}>
      <path
        d="M17 3 L21 7 L17 11 M21 7 H9 A5 5 0 0 0 4 12 A5 5 0 0 0 9 17 H15"
        {...strokeProps}
        fill="none"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────
   ProductDock — horizontal row of the 5 products, Foreplay-style.
   Each item : [3D logo] + tagline above + product name.
   Works on dark hero panel (dark=true) and light sections
   (dark=false).
   ───────────────────────────────────────────────────────────────── */

export function ProductDock({
  dark = true,
  exclude,
  size = 44,
}: {
  dark?: boolean;
  exclude?: ProductSlug;
  size?: number;
}) {
  const products = exclude ? PRODUCTS.filter((p) => p.slug !== exclude) : PRODUCTS;
  const tagColor = dark ? "#94a3b8" : "#6b7280";
  const nameColor = dark ? "#ffffff" : "#0a0a0a";

  return (
    <div className="flex items-center justify-center gap-x-8 gap-y-5 flex-wrap">
      {products.map((p) => (
        <Link
          key={p.slug}
          href={`/${p.slug}`}
          className="flex items-center gap-3 transition-opacity hover:opacity-80 group"
        >
          <Product3DLogo product={p} size={size} />
          <div className="text-left">
            <div
              style={{
                fontSize: 11,
                color: tagColor,
                fontWeight: 500,
                letterSpacing: "0.02em",
                lineHeight: 1.3,
              }}
            >
              {p.tagline}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: nameColor,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                marginTop: 2,
              }}
            >
              {p.name}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   ProductDropdown — nav mega-menu. Organised by cluster, with a
   3D logo next to each product. Hover from the nav trigger.
   ───────────────────────────────────────────────────────────────── */

export function ProductDropdownTrigger({
  label = "Produit",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        className="flex items-center gap-1 transition"
        style={{ color: "#555", fontSize: 14 }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {label}
        <ChevronDown
          className="w-3.5 h-3.5"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>
      {open && children}
    </div>
  );
}

export function ProductDropdown() {
  return (
    <div
      className="absolute top-full left-1/2 -translate-x-1/2 pt-3"
      style={{ zIndex: 50 }}
    >
      <div
        style={{
          width: 820,
          background: "#ffffff",
          border: "1px solid #ececec",
          borderRadius: 18,
          boxShadow: "0 24px 48px -12px rgba(15,15,40,0.18), 0 4px 8px rgba(15,15,40,0.05)",
          padding: 22,
        }}
      >
        <div className="grid grid-cols-4 gap-5">
          {CLUSTERS.map((cluster) => (
            <div key={cluster.key}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 12,
                }}
              >
                {cluster.label}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12, lineHeight: 1.4 }}>
                {cluster.desc}
              </div>
              <div className="space-y-1">
                {PRODUCTS.filter((p) => p.cluster === cluster.key).map((p) => (
                  <Link
                    key={p.slug}
                    href={`/${p.slug}`}
                    className="flex items-center gap-3 p-2 -mx-2 rounded-lg transition hover:bg-[#fafafa]"
                  >
                    <Product3DLogo product={p} size={32} glow={false} />
                    <div className="min-w-0">
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#0a0a0a",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {p.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          lineHeight: 1.35,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.tagline}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px solid #ececec",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            6 produits, 1 seul workspace.
          </div>
          <Link
            href="/#suite"
            style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a" }}
            className="hover:underline"
          >
            Voir la suite complète →
          </Link>
        </div>
      </div>
    </div>
  );
}
