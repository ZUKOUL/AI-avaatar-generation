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
import Image from "next/image";
import { ChevronDown } from "@/components/Icons";

export type ProductSlug =
  | "trackify"
  | "canvas"
  | "avatar"
  | "adlab"
  | "thumbs"
  | "clipsy";

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
  /** Optional real-image override. Drop a file at /public/logos/<slug>.png
   *  and set `logoSrc: "/logos/<slug>.png"` to replace the CSS 3D logo
   *  with a rendered bespoke logo (Nano Banana / Blender / Spline etc). */
  logoSrc?: string;
}

export const PRODUCTS: Product[] = [
  {
    slug: "trackify",
    name: "Trackify",
    tagline: "Tracker tes concurrents 24/7",
    headline: "Vois tout ce que tes concurrents publient. Recréé leurs meilleures ads en 1 clic.",
    // Logo is silver/black metallic radar — neutral slate grey accent
    color: "#6b7280",
    cluster: "intelligence",
    shape: "radar",
    logoSrc: "/logos/trackify.png",
  },
  {
    slug: "canvas",
    name: "Canvas",
    tagline: "Générer tes visuels IA",
    headline: "Tes images et tes vidéos IA, depuis un prompt.",
    color: "#3b82f6",
    cluster: "creer",
    shape: "canvas",
    logoSrc: "/logos/canvas-v2.png",
  },
  {
    slug: "avatar",
    name: "Avatar",
    tagline: "Ton influenceur IA",
    headline: "Ton visage, ou ton créateur IA. Réutilisable partout.",
    color: "#8b5cf6",
    cluster: "creer",
    shape: "face",
    logoSrc: "/logos/avatar.png",
  },
  {
    slug: "adlab",
    name: "Adlab",
    tagline: "Les ads qui convertissent",
    headline: "Des ads qui scrollent-stop. Testées à l'infini.",
    // Logo is cyan neon TV frame — cyan accent
    color: "#06b6d4",
    cluster: "performer",
    shape: "bolt",
    logoSrc: "/logos/adlab.png",
  },
  {
    slug: "thumbs",
    name: "Thumbs",
    tagline: "La miniature qui fait cliquer",
    headline: "Colle un lien. Récupère la miniature qui performe.",
    // Logo is emerald neon play button — emerald green accent
    color: "#10b981",
    cluster: "performer",
    shape: "play",
    logoSrc: "/logos/thumbs.png",
  },
  {
    slug: "clipsy",
    name: "Clipsy",
    tagline: "Du prompt à la vidéo short",
    headline: "Du long-form, une URL ou un prompt — à la vidéo courte. Direct.",
    // Logo is gold/yellow neon movie projector — amber accent
    color: "#f59e0b",
    cluster: "automatiser",
    shape: "loop",
    logoSrc: "/logos/clipsy.png",
  },
];

export const CLUSTERS: { key: ClusterKey; label: string; desc: string }[] = [
  { key: "intelligence", label: "Intelligence", desc: "Voir ce qui marche" },
  { key: "creer", label: "Créer", desc: "Générer tes visuels et personas" },
  { key: "performer", label: "Performer", desc: "Transformer en ventes" },
  { key: "automatiser", label: "Automatiser", desc: "Du prompt à la publication" },
];

/* ─── Dashboard route mapping ───────────────────────────────────────
   Each product maps to an existing functional feature route in the
   dashboard. The sidebar tiles use `href` for navigation (so clicking
   Thumbs lands directly on the generator, not on an intermediate
   explainer page) and `paths` to decide whether a tile should show
   as active for the current pathname. */

export const PRODUCT_APP_ROUTES: Record<ProductSlug, { href: string; paths: string[] }> = {
  trackify: { href: "/dashboard/trackify",   paths: ["/dashboard/trackify"] },
  canvas:   { href: "/dashboard/videos",     paths: ["/dashboard/videos", "/dashboard/images", "/dashboard/canvas"] },
  avatar:   { href: "/dashboard/avatars",    paths: ["/dashboard/avatars", "/dashboard/characters", "/dashboard/avatar"] },
  adlab:    { href: "/dashboard/ads",        paths: ["/dashboard/ads", "/dashboard/adlab"] },
  thumbs:   { href: "/dashboard/thumbnails", paths: ["/dashboard/thumbnails", "/dashboard/thumbs"] },
  clipsy:   { href: "/dashboard/ai-videos",  paths: ["/dashboard/ai-videos", "/dashboard/clips", "/dashboard/clipsy", "/dashboard/autoclip"] },
};

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

  // Real-image override — if the product has a logoSrc, render that as
  // an Image with the same size/radius so the rest of the UI doesn't
  // need to special-case bespoke logos vs CSS fallbacks.
  //
  // Bespoke logos get a NEUTRAL drop shadow (dark, colourless) instead
  // of a product-color glow. Otherwise the halo fights whatever
  // accent sits inside the logo art — a red glow under a grey radar
  // or under an orange bolt reads as "mismatched".
  if (product.logoSrc) {
    return (
      <Image
        src={product.logoSrc}
        alt={product.name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: radius,
          objectFit: "contain",
          boxShadow: glow
            ? "0 10px 28px -6px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.18)"
            : "none",
        }}
      />
    );
  }

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

/* Factory returning a NavDef-compatible icon component for a given
   product — lets the Sidebar drop Product3DLogos into its nav without
   rewriting NavSection. */
export function productIcon(slug: ProductSlug, defaultSize = 20): React.FC<{ size?: number }> {
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product) {
    const Fallback: React.FC<{ size?: number }> = () => null;
    return Fallback;
  }
  const Icon: React.FC<{ size?: number }> = ({ size }) => (
    <Product3DLogo product={product} size={size ?? defaultSize} glow={false} />
  );
  Icon.displayName = `ProductIcon(${slug})`;
  return Icon;
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
    // Target / radar — concentric arcs + center dot (Trackify)
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

/* ─────────────────────────────────────────────────────────────────
   SubLandingNav + SubLandingFooter — partagés entre toutes les
   sous-landings (/avatar, /trackify, /canvas, /adlab, /thumbs,
   /clipsy) pour éviter la duplication.
   ───────────────────────────────────────────────────────────────── */

export function SubLandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
      style={{
        background: "rgba(250,250,250,0.82)",
        borderBottom: "1px solid #ececec",
      }}
    >
      <div className="max-w-[1280px] mx-auto px-5 md:px-8 h-[64px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div
            className="rounded-lg flex items-center justify-center shrink-0"
            style={{ width: 32, height: 32, background: "#0a0a0a" }}
          >
            <Image src="/horpen-logo.png" alt="" width={20} height={20} priority style={{ objectFit: "contain" }} />
          </div>
          <span style={{ fontSize: 17, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.02em" }}>
            Horpen
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-[14px]">
          <ProductDropdownTrigger label="Produit">
            <ProductDropdown />
          </ProductDropdownTrigger>
          <ProductDropdownTrigger label="Solutions">
            <SolutionsMiniDropdown />
          </ProductDropdownTrigger>
          <Link href="/#pricing" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">Tarifs</Link>
          <Link href="/#faq" style={{ color: "#555" }} className="transition hover:text-[#0a0a0a]">FAQ</Link>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden md:inline text-[14px]" style={{ color: "#555" }}>
            Se connecter
          </Link>
          <Link
            href="/signup"
            className="text-[14px] font-medium px-4 py-2 rounded-full transition"
            style={{ background: "#0a0a0a", color: "#ffffff" }}
          >
            Essai gratuit
          </Link>
          <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <div className="w-5 h-[2px] bg-[#0a0a0a] mb-1" />
            <div className="w-5 h-[2px] bg-[#0a0a0a] mb-1" />
            <div className="w-5 h-[2px] bg-[#0a0a0a]" />
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="md:hidden px-5 pb-5 flex flex-col gap-3 text-[15px]" style={{ borderTop: "1px solid #ececec" }}>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 12 }}>
            Produits
          </div>
          {PRODUCTS.map((p) => (
            <Link
              key={p.slug}
              href={`/${p.slug}`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3"
            >
              <Product3DLogo product={p} size={32} glow={false} />
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{p.tagline}</div>
              </div>
            </Link>
          ))}
          <div style={{ height: 1, background: "#ececec", margin: "8px 0" }} />
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Solutions
          </div>
          {SOLUTIONS_MINI.map((s) => (
            <Link
              key={s.slug}
              href={`/solutions/${s.slug}`}
              onClick={() => setMenuOpen(false)}
              style={{ fontSize: 14, color: "#0a0a0a" }}
            >
              {s.name}
            </Link>
          ))}
          <div style={{ height: 1, background: "#ececec", margin: "8px 0" }} />
          <Link href="/#pricing" onClick={() => setMenuOpen(false)}>Tarifs</Link>
          <Link href="/#faq" onClick={() => setMenuOpen(false)}>FAQ</Link>
          <Link href="/login">Se connecter</Link>
        </div>
      )}
    </nav>
  );
}

/* ─── Solutions mini-dropdown (lives in shared to avoid circular imports
       with solutions.tsx). Data is duplicated here as a minimal index —
       the full SOLUTIONS object + landing components stay in solutions.tsx. */

const SOLUTIONS_MINI = [
  { slug: "ecommerce", name: "E-commerce & DTC", desc: "Shopify, dropshippers, marques DTC", accent: "#3b82f6" },
  { slug: "agences",   name: "Agences créa",      desc: "Agences marketing, SEA, UGC, social", accent: "#8b5cf6" },
  { slug: "ugc",       name: "Créateurs UGC",     desc: "Créateurs UGC freelances", accent: "#f59e0b" },
  { slug: "faceless",  name: "Faceless & IA",     desc: "Chaînes YouTube, TikTok, avatars", accent: "#8b5cf6" },
  { slug: "coaches",   name: "Coaches & Infopreneurs", desc: "Formateurs, coaches, info", accent: "#10b981" },
  { slug: "saas",      name: "SaaS B2B",          desc: "Startups B2B, outils SaaS", accent: "#06b6d4" },
] as const;

function SolutionsMiniDropdown() {
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
          width: "min(640px, 90vw)",
          padding: 14,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#9ca3af",
            padding: "6px 8px 12px",
          }}
        >
          Horpen est pour
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {SOLUTIONS_MINI.map((s) => (
            <Link
              key={s.slug}
              href={`/solutions/${s.slug}`}
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
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: s.accent,
                  boxShadow: `0 0 10px ${s.accent}`,
                  flexShrink: 0,
                }}
              />
              <div className="text-left">
                <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff" }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{s.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SubLandingFooter() {
  return (
    <footer style={{ background: "#fafafa", borderTop: "1px solid #ececec" }}>
      <div className="max-w-[1280px] mx-auto px-5 md:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <div
            className="rounded-lg flex items-center justify-center"
            style={{ width: 28, height: 28, background: "#0a0a0a" }}
          >
            <Image src="/horpen-logo.png" alt="" width={18} height={18} style={{ objectFit: "contain" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#0a0a0a" }}>Horpen</span>
        </Link>
        <div style={{ fontSize: 13, color: "#9ca3af" }}>
          © {new Date().getFullYear()} Horpen.ai — Tous droits réservés.
        </div>
        <div className="flex items-center gap-4" style={{ fontSize: 13 }}>
          <Link href="/" style={{ color: "#6b7280" }} className="hover:text-[#0a0a0a]">Accueil</Link>
          <Link href="/#pricing" style={{ color: "#6b7280" }} className="hover:text-[#0a0a0a]">Tarifs</Link>
          <a href="mailto:support@horpen.ai" style={{ color: "#6b7280" }} className="hover:text-[#0a0a0a]">
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────────
   SubLandingTemplate — squelette complet pour créer une sous-landing
   en quelques lignes. Hero dark panel avec beams dans la couleur du
   produit, 3 benefit cards, FAQ, cross-promo dock, CTA final.
   ───────────────────────────────────────────────────────────────── */

export function SubLandingHero({ slug, title, subtitle, cta }: { slug: ProductSlug; title: React.ReactNode; subtitle: string; cta: string }) {
  const product = PRODUCTS.find((p) => p.slug === slug)!;
  return (
    <section className="pt-[88px] pb-6 px-4 md:px-6">
      <div
        className="max-w-[1280px] mx-auto rounded-[26px] md:rounded-[32px] relative overflow-hidden"
        style={{
          background: `radial-gradient(120% 90% at 50% 120%, ${product.color}1a 0%, #0b0a1a 35%, #060514 70%, #030210 100%)`,
          border: "1px solid rgba(255,255,255,0.06)",
          minHeight: "min(680px, 86vh)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.4), 0 60px 120px -30px rgba(10,10,30,0.55)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {[{ left: "18%", w: 200 }, { left: "42%", w: 220 }, { left: "66%", w: 200 }, { left: "86%", w: 180 }].map((b, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: "-20%",
                left: b.left,
                width: b.w,
                height: "130%",
                background: `linear-gradient(180deg, ${product.color}55 0%, transparent 70%)`,
                filter: "blur(16px)",
                transform: "skewX(-6deg)",
                mixBlendMode: "screen",
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-5 md:px-10 pt-16 md:pt-24 pb-12">
          <div className="flex items-center gap-3 mb-8">
            <Product3DLogo product={product} size={52} />
            <div className="text-left">
              <div
                style={{
                  fontSize: 11,
                  color: "#cbd5e1",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Horpen
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em" }}>
                {product.name}
              </div>
            </div>
          </div>

          <h1
            style={{
              color: "#ffffff",
              fontSize: "clamp(36px, 5.5vw, 68px)",
              lineHeight: 1.04,
              letterSpacing: "-0.04em",
              fontWeight: 600,
              maxWidth: 960,
            }}
          >
            {title}
          </h1>

          <p
            className="mt-6"
            style={{
              color: "#cbd5e1",
              fontSize: "clamp(16px, 1.4vw, 19px)",
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            {subtitle}
          </p>

          <div className="mt-9">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
              style={{
                background: "#ffffff",
                color: "#0a0a0a",
                fontSize: 16,
                boxShadow: `0 8px 24px ${product.color}40, 0 1px 0 rgba(255,255,255,0.4) inset`,
              }}
            >
              {cta}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SubLandingBenefits({ slug, title, benefits }: { slug: ProductSlug; title: React.ReactNode; benefits: { num: string; title: string; desc: string }[] }) {
  const product = PRODUCTS.find((p) => p.slug === slug)!;
  return (
    <section className="py-20 md:py-28 px-5 md:px-8">
      <div className="max-w-[1080px] mx-auto">
        <div className="text-center mb-14">
          <h2
            style={{
              fontSize: "clamp(30px, 4vw, 48px)",
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              color: "#0a0a0a",
              maxWidth: 760,
              margin: "0 auto",
            }}
          >
            {title}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {benefits.map((b, i) => (
            <div
              key={i}
              className="rounded-2xl p-7"
              style={{
                background: "#ffffff",
                border: "1px solid #ececec",
                boxShadow:
                  "0 1px 1px rgba(15,15,40,0.03), 0 2px 4px rgba(15,15,40,0.04), 0 12px 32px -8px rgba(15,15,40,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: product.color,
                  letterSpacing: "0.08em",
                  marginBottom: 14,
                }}
              >
                {b.num}
              </div>
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "#0a0a0a",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.25,
                }}
              >
                {b.title}
              </h3>
              <p style={{ marginTop: 10, color: "#6b7280", fontSize: 15, lineHeight: 1.55 }}>
                {b.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SubLandingFAQ({ faq }: { faq: { q: string; a: string }[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return (
    <section className="py-20 md:py-24 px-5 md:px-8">
      <div className="max-w-[820px] mx-auto">
        <h2
          className="text-center mb-12"
          style={{
            fontSize: "clamp(28px, 3.5vw, 40px)",
            lineHeight: 1.15,
            letterSpacing: "-0.035em",
            fontWeight: 600,
            color: "#0a0a0a",
          }}
        >
          Questions fréquentes
        </h2>
        <div className="space-y-2">
          {faq.map((item, i) => {
            const open = openFaq === i;
            return (
              <div
                key={i}
                style={{
                  background: "#ffffff",
                  border: "1px solid #ececec",
                  borderRadius: 14,
                  overflow: "hidden",
                  boxShadow: open ? "0 4px 12px rgba(0,0,0,0.04)" : "none",
                }}
              >
                <button
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4"
                  style={{ color: "#0a0a0a", fontSize: 15, fontWeight: 500 }}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className="w-4 h-4 flex-shrink-0 transition-transform"
                    style={{
                      transform: open ? "rotate(180deg)" : "rotate(0deg)",
                      color: "#6b7280",
                    }}
                  />
                </button>
                {open && (
                  <div
                    style={{
                      padding: "0 20px 18px",
                      color: "#6b7280",
                      fontSize: 14.5,
                      lineHeight: 1.6,
                    }}
                  >
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function SubLandingCrossPromo({ exclude }: { exclude: ProductSlug }) {
  return (
    <section className="py-16 md:py-20 px-5 md:px-8" style={{ background: "#ffffff", borderTop: "1px solid #ececec" }}>
      <div className="max-w-[1080px] mx-auto">
        <p
          className="text-center mb-10"
          style={{
            color: "#6b7280",
            fontSize: 14,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Fait partie d&apos;une suite de 6 produits
        </p>
        <ProductDock dark={false} size={40} exclude={exclude} />
      </div>
    </section>
  );
}

export function SubLandingCTA({ title, cta }: { title: React.ReactNode; cta: string }) {
  return (
    <section className="py-20 md:py-28 px-5 md:px-8">
      <div className="max-w-[820px] mx-auto text-center">
        <h2
          style={{
            fontSize: "clamp(30px, 4vw, 46px)",
            lineHeight: 1.1,
            letterSpacing: "-0.035em",
            fontWeight: 600,
            color: "#0a0a0a",
          }}
        >
          {title}
        </h2>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-medium transition"
            style={{ background: "#0a0a0a", color: "#ffffff", fontSize: 16 }}
          >
            {cta}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
