"use client";

/**
 * ProductPageShell — layout partagé pour chaque page produit dashboard
 * (/dashboard/canvas, /avatar, /spyder, /adlab, /thumbs, /autoclip).
 *
 * Fournit :
 *   - Header sticky avec logo 3D du produit + nom + tagline + Upgrade pill
 *   - Sous-onglets horizontaux (SubTabs)
 *   - Zone de contenu qui change selon l'onglet actif
 *
 * Usage :
 *   <ProductPageShell
 *     slug="avatar"
 *     tabs={[{ key: "mine", label: "Mes avatars" }, ...]}
 *     active={tab}
 *     onTabChange={setTab}
 *   >
 *     {tab === "mine" && <MyAvatars />}
 *     ...
 *   </ProductPageShell>
 */

import Link from "next/link";
import { SparkleIcon } from "@/components/Icons";
import { SubTabs, SubTabItem } from "@/components/dashboard/SubTabs";
import { PRODUCTS, Product3DLogo, ProductSlug } from "@/components/landing/shared";

export function ProductPageShell({
  slug,
  tabs,
  active,
  onTabChange,
  children,
}: {
  slug: ProductSlug;
  tabs: SubTabItem[];
  active: string;
  onTabChange: (k: string) => void;
  children: React.ReactNode;
}) {
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product) return null;

  return (
    <div className="flex-1 overflow-auto" style={{ background: "var(--bg-primary)" }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10"
        style={{
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div className="px-6 md:px-8 pt-6 pb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Product3DLogo product={product} size={40} glow={false} />
            <div className="min-w-0">
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: "var(--text-primary)",
                }}
              >
                {product.name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {product.tagline}
              </div>
            </div>
          </div>

          <Link
            href="/dashboard/credits"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0"
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
          <SubTabs items={tabs} active={active} onChange={onTabChange} />
        </div>
      </div>

      {/* Content */}
      <div className="px-6 md:px-8 py-8">{children}</div>
    </div>
  );
}

/* Reusable empty-state panel for tabs that deep-link into existing
   feature routes. Keeps the 6 product pages clean while the sub-tool
   UIs stay at their legacy routes. */
export function EmptyPanel({
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
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 8,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            maxWidth: 460,
            margin: "0 auto 18px",
            lineHeight: 1.55,
          }}
        >
          {desc}
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full"
          style={{
            background: "#0a0a0a",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {cta}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
