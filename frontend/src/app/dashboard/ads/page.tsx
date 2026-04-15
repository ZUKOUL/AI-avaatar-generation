"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { adsAPI } from "@/lib/api";
import {
  Check,
  Download,
  Megaphone,
  Package,
  Plus,
  SparkleIcon,
  Spinner,
  Trash,
  Upload,
  XIcon,
} from "@/components/Icons";

/* ═══════════════════════════════════════════════════════════════════════════
   Ads — train a product, then generate static ad creatives.

   Flow:
   1. User uploads 3-20 photos of a product (different angles).
   2. Backend trains the product (stores refs + generates a clean thumbnail).
   3. User selects a product → picks a template + aspect + custom prompt.
   4. Gemini fuses the product refs with the template to produce a creative.
   5. Every generation lands in the gallery below for later download.
   ═══════════════════════════════════════════════════════════════════════ */

interface Product {
  product_id: string;
  name: string;
  category: string | null;
  thumbnail: string | null;
  created_at: string;
}

interface Template {
  id: string;
  label: string;
}

interface Ad {
  id: string;
  product_id: string | null;
  template: string | null;
  prompt: string;
  aspect_ratio: string;
  image_url: string;
  created_at: string;
}

const RATIOS: { value: string; label: string }[] = [
  { value: "1:1", label: "Square" },
  { value: "4:5", label: "Portrait" },
  { value: "9:16", label: "Story" },
  { value: "16:9", label: "Landscape" },
  { value: "3:4", label: "Classic" },
];

// Hard-coded fallback template order so the picker still renders if /templates
// hasn't loaded yet. The backend remains the source of truth for labels.
const FALLBACK_TEMPLATES: Template[] = [
  { id: "studio_white", label: "Studio White" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "ugc", label: "UGC — Hand-held" },
  { id: "premium", label: "Luxury Premium" },
  { id: "social_story", label: "Social Story" },
  { id: "outdoor", label: "Outdoor Golden Hour" },
];

export default function AdsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [templates, setTemplates] = useState<Template[]>(FALLBACK_TEMPLATES);

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingAds, setLoadingAds] = useState(true);

  const [showCreator, setShowCreator] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("studio_white");
  const [aspect, setAspect] = useState("1:1");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadProducts();
    loadAds();
    loadTemplates();
  }, []);

  const loadProducts = async () => {
    try {
      const res = await adsAPI.listProducts();
      setProducts(res.data.products || []);
    } catch {
      /* silently fail */
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadAds = async () => {
    try {
      const res = await adsAPI.history();
      setAds(res.data.ads || []);
    } catch {
      /* silently fail */
    } finally {
      setLoadingAds(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await adsAPI.templates();
      if (res.data.templates?.length) setTemplates(res.data.templates);
    } catch {
      /* fallback templates already set */
    }
  };

  const selectedProduct = products.find((p) => p.product_id === selectedProductId) || null;

  const handleGenerate = async () => {
    if (!selectedProductId) return;
    setGenerating(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("product_id", selectedProductId);
      formData.append("template", selectedTemplate);
      formData.append("aspect_ratio", aspect);
      if (customPrompt.trim()) formData.append("custom_prompt", customPrompt.trim());
      await adsAPI.generate(formData);
      setCustomPrompt("");
      loadAds();
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { detail?: string | { message?: string } } };
      };
      const detail = e.response?.data?.detail;
      let msg = "Generation failed";
      if (typeof detail === "string") msg = detail;
      else if (detail && typeof detail === "object" && "message" in detail) msg = detail.message || msg;
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteAd = async (adId: string) => {
    try {
      await adsAPI.delete(adId);
      setAds((prev) => prev.filter((a) => a.id !== adId));
    } catch {
      /* silently fail */
    }
  };

  return (
    <>
      <Header
        title="Ads"
        subtitle="Train a product once, generate unlimited static ads"
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
          {/* Hero — only shown when no products yet */}
          {!loadingProducts && products.length === 0 && (
            <section className="flex flex-col items-center text-center pb-10">
              <div
                className="flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
                style={{
                  background:
                    "linear-gradient(135deg, var(--bg-tertiary), var(--bg-hover))",
                  border: "1px solid var(--border-color)",
                }}
              >
                <Megaphone size={28} style={{ color: "var(--text-primary)" }} />
              </div>
              <h1
                className="text-[30px] md:text-[42px] font-bold tracking-tight"
                style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
              >
                Create winning ads in seconds
              </h1>
              <p
                className="text-[14px] md:text-[15px] max-w-[520px] mt-3"
                style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}
              >
                Upload reference photos of your product, then instantly generate
                high-converting static ads across every format — studio,
                lifestyle, UGC, social story and more.
              </p>
              <button
                type="button"
                onClick={() => setShowCreator(true)}
                className="mt-7 px-6 py-3 rounded-xl text-[14px] font-semibold flex items-center gap-2 transition-transform"
                style={{
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                Add your first product
                <Plus size={16} />
              </button>
            </section>
          )}

          {/* Products grid */}
          {!loadingProducts && products.length > 0 && (
            <section className="mb-10">
              <div className="flex items-baseline justify-between mb-4 px-1">
                <h2
                  className="text-[13px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Your products
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCreator(true)}
                  className="text-[12px] font-medium flex items-center gap-1.5"
                  style={{ color: "var(--text-primary)" }}
                >
                  <Plus size={13} />
                  New product
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                {products.map((p) => (
                  <ProductCard
                    key={p.product_id}
                    product={p}
                    selected={selectedProductId === p.product_id}
                    onSelect={() => setSelectedProductId(p.product_id)}
                    onDelete={() => {
                      if (selectedProductId === p.product_id) setSelectedProductId(null);
                      loadProducts();
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {loadingProducts && (
            <div className="flex items-center justify-center py-10">
              <Spinner size={22} />
            </div>
          )}

          {/* Ad generator — visible as soon as a product is selected */}
          {selectedProduct && (
            <section
              className="rounded-2xl p-5 md:p-6 mb-10"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {/* Selected product chip */}
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-12 h-12 rounded-xl overflow-hidden shrink-0"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  {selectedProduct.thumbnail ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={selectedProduct.thumbnail}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package size={18} style={{ color: "var(--text-muted)" }} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Generating ads for
                  </p>
                  <p
                    className="text-[15px] font-semibold truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {selectedProduct.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProductId(null)}
                  className="p-1.5 rounded-lg"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Clear selection"
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <XIcon size={16} />
                </button>
              </div>

              {/* Templates grid */}
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Ad style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                {templates.map((tpl) => {
                  const active = tpl.id === selectedTemplate;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className="rounded-xl px-3 py-3 text-left transition-all"
                      style={{
                        background: active ? "var(--bg-primary)" : "var(--bg-tertiary)",
                        border: `1.5px solid ${active ? "var(--text-primary)" : "var(--border-color)"}`,
                        color: "var(--text-primary)",
                        boxShadow: active ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                      }}
                    >
                      <span className="block text-[13px] font-semibold truncate">
                        {tpl.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Aspect ratio */}
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Aspect ratio
              </label>
              <div className="flex flex-wrap gap-2 mb-5">
                {RATIOS.map((r) => {
                  const active = r.value === aspect;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setAspect(r.value)}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                      style={{
                        background: active ? "var(--text-primary)" : "var(--bg-tertiary)",
                        color: active ? "var(--bg-primary)" : "var(--text-primary)",
                        border: `1px solid ${active ? "var(--text-primary)" : "var(--border-color)"}`,
                      }}
                    >
                      {r.value} · {r.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom prompt */}
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Extra direction (optional)
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. On a marble kitchen counter, morning sunlight, coffee mug nearby…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none mb-5"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />

              {error && (
                <div
                  className="px-3 py-2 rounded-lg text-[12px] mb-4"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    color: "var(--error)",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="w-full py-3 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2"
                style={{
                  background: generating ? "var(--bg-tertiary)" : "var(--text-primary)",
                  color: generating ? "var(--text-muted)" : "var(--bg-primary)",
                  cursor: generating ? "not-allowed" : "pointer",
                  boxShadow: generating ? "none" : "0 4px 20px rgba(0,0,0,0.18)",
                }}
              >
                {generating ? (
                  <>
                    <Spinner size={15} />
                    Generating your ad…
                  </>
                ) : (
                  <>
                    <SparkleIcon size={15} />
                    Generate ad
                  </>
                )}
              </button>
            </section>
          )}

          {/* Gallery */}
          <section>
            <div className="flex items-baseline justify-between mb-4 px-1">
              <h2
                className="text-[13px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Recent ads
              </h2>
              {ads.length > 0 && (
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {ads.length}
                </span>
              )}
            </div>

            {loadingAds ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size={22} />
              </div>
            ) : ads.length === 0 ? (
              <div
                className="text-center py-12 rounded-2xl"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px dashed var(--border-color)",
                }}
              >
                <Megaphone
                  size={28}
                  style={{ color: "var(--text-muted)", margin: "0 auto 10px" }}
                />
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Your generated ads will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                {ads.map((ad) => (
                  <AdCard key={ad.id} ad={ad} onDelete={() => handleDeleteAd(ad.id)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {showCreator && (
        <CreateProductModal
          onClose={() => setShowCreator(false)}
          onCreated={(newId) => {
            loadProducts();
            setSelectedProductId(newId);
          }}
        />
      )}
    </>
  );
}

/* ─── Product card ─── */

function ProductCard({
  product,
  selected,
  onSelect,
  onDelete,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await adsAPI.deleteProduct(product.product_id);
      setShowConfirm(false);
      onDelete();
    } catch {
      /* silently fail */
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelect();
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer"
        style={{
          background: "var(--bg-secondary)",
          border: `1.5px solid ${selected ? "var(--text-primary)" : "var(--border-color)"}`,
          transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
          boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.15)" : "none",
        }}
      >
        {product.thumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.thumbnail}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={40} style={{ color: "var(--text-muted)" }} />
          </div>
        )}

        {/* Selected badge */}
        {selected && (
          <div
            className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              background: "var(--text-primary)",
              color: "var(--bg-primary)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            <Check size={13} />
          </div>
        )}

        {/* Trash icon top-right on hover */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowConfirm(true);
          }}
          aria-label="Delete product"
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            backdropFilter: "blur(4px)",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.18s ease",
            pointerEvents: hovered ? "auto" : "none",
          }}
        >
          <Trash size={13} />
        </button>

        {/* Bottom gradient + centered name */}
        <div
          className="absolute inset-x-0 bottom-0 p-3"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)",
          }}
        >
          <p className="text-white text-[13px] font-semibold truncate drop-shadow-sm text-center">
            {product.name}
          </p>
        </div>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={() => { if (!deleting) setShowConfirm(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
              style={{ background: "rgba(239,68,68,0.12)" }}
            >
              <Trash size={18} style={{ color: "rgb(239,68,68)" }} />
            </div>
            <h3
              className="text-[16px] font-semibold mb-1.5"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
            >
              Supprimer ce produit ?
            </h3>
            <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}>
              Êtes-vous sûr de vouloir supprimer{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                {product.name}
              </span>{" "}
              ? Toutes les photos de référence seront aussi supprimées.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-medium"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                  opacity: deleting ? 0.5 : 1,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDeleteClick}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5"
                style={{
                  background: "rgb(239,68,68)",
                  color: "#fff",
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                {deleting ? <Spinner size={13} /> : <Trash size={13} />}
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Ad card (gallery) ─── */

function AdCard({ ad, onDelete }: { ad: Ad; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(ad.image_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ad_${ad.id.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* fallback: open in new tab */
      window.open(ad.image_url, "_blank");
    }
  };

  // Map aspect to CSS aspect-ratio
  const aspectClass =
    ad.aspect_ratio === "9:16"
      ? "aspect-[9/16]"
      : ad.aspect_ratio === "16:9"
      ? "aspect-[16/9]"
      : ad.aspect_ratio === "4:5"
      ? "aspect-[4/5]"
      : ad.aspect_ratio === "3:4"
      ? "aspect-[3/4]"
      : "aspect-square";

  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${aspectClass}`}
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ad.image_url} alt="Generated ad" className="w-full h-full object-cover" />

      {/* Hover actions */}
      <div
        className="absolute inset-0 flex items-end justify-between p-2"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 60%)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.18s ease",
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        <button
          type="button"
          onClick={handleDownload}
          aria-label="Download"
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.92)",
            color: "#000",
          }}
        >
          <Download size={14} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete"
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.72)",
            color: "#fff",
          }}
        >
          <Trash size={13} />
        </button>
      </div>

      {/* Template badge top-left */}
      {ad.template && (
        <div
          className="absolute top-2 left-2 px-2 py-1 rounded-md text-[10px] font-semibold"
          style={{
            background: "rgba(0,0,0,0.72)",
            color: "#fff",
            backdropFilter: "blur(4px)",
          }}
        >
          {ad.template.replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}

/* ─── Create product modal ─── */

function CreateProductModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (productId: string) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const next = [...files, ...Array.from(incoming)];
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };
  const removeFile = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const hasPhotos = files.length > 0;
  const meetsMinimum = files.length >= 3;
  const recommended = files.length >= 8;
  const canTrain = meetsMinimum && name.trim().length > 0 && !isTraining;

  const handleTrain = async () => {
    if (!canTrain) return;
    setIsTraining(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      if (category.trim()) formData.append("category", category.trim());
      files.forEach((f) => formData.append("files", f));
      const res = await adsAPI.trainProduct(formData);
      const newId = res.data.product_id as string;
      onCreated(newId);
      onClose();
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { detail?: string | { message?: string; error?: string } } };
        message?: string;
      };
      const detail = e.response?.data?.detail;
      const status = e.response?.status;
      let msg = "";
      if (typeof detail === "string") msg = detail;
      else if (detail && typeof detail === "object")
        msg = detail.message || detail.error || JSON.stringify(detail);
      else if (e.message) msg = e.message;
      else msg = "Training failed";
      setError(`[${status || "?"}] ${msg}`);
    } finally {
      setIsTraining(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isTraining) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTraining, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={() => { if (!isTraining) onClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
          style={{
            background: "var(--bg-primary)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div>
            <h3
              className="text-[16px] font-semibold"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
            >
              New product
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Upload photos from multiple angles so the AI can lock in the product identity.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isTraining}
            className="p-1.5 rounded-lg transition-colors shrink-0 ml-3"
            style={{
              color: "var(--text-muted)",
              opacity: isTraining ? 0.3 : 1,
              cursor: isTraining ? "not-allowed" : "pointer",
            }}
            aria-label="Close"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Upload zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className="relative rounded-xl cursor-pointer overflow-hidden"
            style={{
              background: "var(--bg-secondary)",
              border: `1.5px dashed ${dragging ? "var(--text-primary)" : "var(--border-color)"}`,
              minHeight: hasPhotos ? "auto" : 200,
              transition: "border-color 0.2s ease, background 0.2s ease",
            }}
          >
            {!hasPhotos ? (
              <div className="flex flex-col items-center justify-center text-center px-4 py-10">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold"
                  style={{
                    background: "var(--text-primary)",
                    color: "var(--bg-primary)",
                  }}
                >
                  <Upload size={15} />
                  Upload photos
                </div>
                <p className="text-[12px] mt-3" style={{ color: "var(--text-muted)" }}>
                  Drop files here or click to browse — 8+ angles recommended
                </p>
              </div>
            ) : (
              <div className="p-2.5">
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                  {previews.map((src, i) => (
                    <div
                      key={i}
                      className="relative aspect-square rounded-md overflow-hidden group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                        aria-label="Remove photo"
                      >
                        <XIcon size={10} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      inputRef.current?.click();
                    }}
                    className="aspect-square rounded-md flex items-center justify-center"
                    style={{
                      border: "1.5px dashed var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                    aria-label="Add more"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2.5 px-1">
                  <span
                    className="text-[12px]"
                    style={{
                      color: recommended
                        ? "var(--success)"
                        : meetsMinimum
                          ? "var(--text-secondary)"
                          : "var(--text-muted)",
                    }}
                  >
                    {files.length} photo{files.length === 1 ? "" : "s"}
                    {recommended ? " · great" : meetsMinimum ? " · ok" : " · need 3+"}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles([]);
                      setPreviews([]);
                    }}
                    className="text-[12px] hover:underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {/* Name */}
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Product name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rose Gold Watch"
              maxLength={60}
              className="w-full px-3 py-2.5 rounded-lg text-[13px]"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Category */}
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Category <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Accessories, Electronics, Beauty"
              maxLength={60}
              className="w-full px-3 py-2.5 rounded-lg text-[13px]"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Guidelines */}
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                style={{ background: "var(--success)", color: "#fff" }}
              >
                <Check size={12} />
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  Shoot every angle:
                </span>{" "}
                front, back, sides, top — plus a close-up of branding/labels.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <div
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                style={{ background: "var(--error)", color: "#fff" }}
              >
                <XIcon size={12} />
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  Avoid:
                </span>{" "}
                heavy filters, cluttered backgrounds, multiple products in one shot.
              </p>
            </div>
          </div>

          {error && (
            <div
              className="px-3 py-2 rounded-lg text-[12px]"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "var(--error)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between gap-3 px-5 py-4 sticky bottom-0"
          style={{
            background: "var(--bg-primary)",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isTraining}
            className="px-4 py-2 rounded-lg text-[13px] font-medium"
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              opacity: isTraining ? 0.5 : 1,
              cursor: isTraining ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTrain}
            disabled={!canTrain}
            className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5"
            style={{
              background: canTrain ? "var(--text-primary)" : "var(--bg-secondary)",
              color: canTrain ? "var(--bg-primary)" : "var(--text-muted)",
              border: canTrain ? "none" : "1px solid var(--border-color)",
              opacity: canTrain ? 1 : 0.7,
              cursor: canTrain ? "pointer" : "not-allowed",
            }}
          >
            {isTraining ? (
              <>
                <Spinner size={14} />
                Training…
              </>
            ) : (
              <>
                <SparkleIcon size={14} />
                Train product
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
