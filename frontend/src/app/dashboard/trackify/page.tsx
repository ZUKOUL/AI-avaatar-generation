"use client";

/**
 * /dashboard/trackify — fonctionnel, pas un explainer.
 *
 * Affiche :
 *   - Header produit (logo + nom + Upgrade pill)
 *   - Bandeau "Add brand" inline (form)
 *   - Liste des brands trackées avec status + delete
 *   - État vide quand y'a rien encore
 *
 * Wiré sur /trackify/brands + /trackify/stats. L'utilisateur peut ajouter
 * un concurrent et voir ses brands en temps réel — plus aucun
 * intermédiaire "click to go".
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trackifyAPI } from "@/lib/api";
import { PRODUCTS, Product3DLogo } from "@/components/landing/shared";
import { SparkleIcon, Trash, ArrowRight, XIcon } from "@/components/Icons";

const TRACKIFY = PRODUCTS.find((p) => p.slug === "trackify")!;

interface Brand {
  id: string;
  platform: string;
  source_url: string;
  display_name: string;
  avatar_url?: string | null;
  status: string;
  last_scan_at?: string | null;
  created_at: string;
}

const PLATFORMS = [
  { value: "meta", label: "Meta (Facebook / Instagram Ads)" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram (profil)" },
  { value: "youtube", label: "YouTube" },
  { value: "web", label: "Site web" },
];

export default function TrackifyPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceUrl, setSourceUrl] = useState("");
  const [platform, setPlatform] = useState("meta");
  const [displayName, setDisplayName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await trackifyAPI.listBrands();
      setBrands(res.data || []);
    } catch (e) {
      console.warn("Trackify list failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceUrl) return;
    setError(null);
    setSubmitting(true);
    try {
      await trackifyAPI.addBrand({
        source_url: sourceUrl,
        platform,
        display_name: displayName || undefined,
      });
      setSourceUrl("");
      setDisplayName("");
      setAddOpen(false);
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Ajout échoué";
      setError(typeof msg === "string" ? msg : "Ajout échoué");
    } finally {
      setSubmitting(false);
    }
  };

  const removeBrand = async (id: string) => {
    if (!confirm("Supprimer cette brand ? Toutes ses archives seront aussi effacées.")) return;
    try {
      await trackifyAPI.deleteBrand(id);
      setBrands((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.warn("Trackify delete failed:", e);
    }
  };

  return (
    <div
      className="flex-1 overflow-auto"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Header sticky */}
      <div
        className="sticky top-0 z-10"
        style={{
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div className="px-6 md:px-8 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Product3DLogo product={TRACKIFY} size={40} glow={false} />
            <div className="min-w-0">
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: "var(--text-primary)",
                }}
              >
                Trackify
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                {TRACKIFY.tagline}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="btn-premium inline-flex items-center gap-1.5 px-4 py-2 rounded-full"
              style={{
                background: TRACKIFY.color,
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              + Ajouter une brand
            </button>
            <Link
              href="/dashboard/credits"
              className="btn-premium inline-flex items-center gap-1.5 px-3 py-2 rounded-full"
              style={{
                background: "var(--text-primary)",
                color: "var(--bg-primary)",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              <SparkleIcon size={13} />
              Upgrade
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 md:px-8 py-6 max-w-[1200px]">
        {loading ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Chargement...</div>
        ) : brands.length === 0 ? (
          <EmptyBrands onAddClick={() => setAddOpen(true)} />
        ) : (
          <BrandsGrid
            brands={brands}
            onDelete={removeBrand}
            onOpen={(b) => router.push(`/dashboard/trackify?brand=${b.id}`)}
          />
        )}
      </div>

      {/* Add-brand modal */}
      {addOpen && (
        <AddBrandModal
          onClose={() => {
            setAddOpen(false);
            setError(null);
          }}
        >
          <form onSubmit={submitBrand} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                Plateforme
              </span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  fontSize: 14,
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                Lien à tracker
              </span>
              <input
                required
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.facebook.com/ads/library/..."
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  fontSize: 14,
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                Nom d&apos;affichage (optionnel)
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ex: Magic Spoon"
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  fontSize: 14,
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
            </label>

            {error && (
              <div
                style={{
                  fontSize: 12.5,
                  color: "#dc2626",
                  background: "#fee2e2",
                  padding: "8px 12px",
                  borderRadius: 8,
                }}
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="px-4 py-2 rounded-full"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting || !sourceUrl}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full"
                style={{
                  background: TRACKIFY.color,
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 500,
                  opacity: submitting || !sourceUrl ? 0.6 : 1,
                }}
              >
                {submitting ? "Ajout..." : "Ajouter et lancer le scan"}
                {!submitting && <ArrowRight size={13} />}
              </button>
            </div>
          </form>
        </AddBrandModal>
      )}
    </div>
  );
}

function EmptyBrands({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div
      className="rounded-2xl p-10 text-center max-w-xl mx-auto"
      style={{
        border: "1px dashed var(--border-color)",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
        Aucune brand trackée
      </div>
      <div
        style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          maxWidth: 400,
          margin: "0 auto 18px",
          lineHeight: 1.55,
        }}
      >
        Colle un lien Meta Ads Library, TikTok, Instagram ou YouTube. Trackify
        commence à scanner sous 5 minutes et archive chaque nouvelle créa.
      </div>
      <button
        onClick={onAddClick}
        className="btn-premium inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full"
        style={{
          background: TRACKIFY.color,
          color: "#ffffff",
          fontSize: 13.5,
          fontWeight: 500,
        }}
      >
        + Ajouter ma première brand
      </button>
    </div>
  );
}

function BrandsGrid({
  brands,
  onDelete,
  onOpen,
}: {
  brands: Brand[];
  onDelete: (id: string) => void;
  onOpen: (b: Brand) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {brands.map((b) => {
        const statusColor =
          b.status === "active"
            ? "#10b981"
            : b.status === "error"
            ? "#dc2626"
            : "#9ca3af";
        const statusLabel =
          b.status === "active"
            ? "Active"
            : b.status === "scanning"
            ? "Scan en cours"
            : b.status === "error"
            ? "Erreur"
            : "En attente";
        return (
          <div
            key={b.id}
            className="rounded-xl p-4 transition-colors cursor-pointer"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 1px 2px rgba(15,15,40,0.04)",
            }}
            onClick={() => onOpen(b)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--text-muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-color)";
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: "var(--bg-hover)",
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-secondary)",
                    fontSize: 14,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {b.display_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.display_name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      textTransform: "capitalize",
                    }}
                  >
                    {b.platform}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(b.id);
                }}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: "var(--text-muted)" }}
                title="Supprimer"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#fee2e2";
                  e.currentTarget.style.color = "#dc2626";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                <Trash size={14} />
              </button>
            </div>

            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "ui-monospace, monospace",
                marginBottom: 10,
              }}
              title={b.source_url}
            >
              {b.source_url}
            </div>

            <div className="flex items-center justify-between">
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: `${statusColor}15`,
                  color: statusColor,
                }}
              >
                ● {statusLabel}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {b.last_scan_at
                  ? `Scanné ${new Date(b.last_scan_at).toLocaleDateString("fr-FR")}`
                  : "Jamais scanné"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddBrandModal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          boxShadow: "0 32px 64px -16px rgba(0,0,0,0.35)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            Tracker une nouvelle brand
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md"
            style={{ color: "var(--text-secondary)" }}
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
