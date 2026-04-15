"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import MediaDetailView from "@/components/MediaDetailView";
import { adsAPI } from "@/lib/api";
import {
  Check,
  Download,
  LinkIcon,
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
  source_url?: string | null;
  description?: string | null;
  features?: string[];
  price?: string | null;
}

interface Template {
  id: string;
  label: string;
  auto?: boolean;
}

interface AdBrief {
  problem_solved?: string;
  target_audience?: string;
  before_state?: string;
  after_state?: string;
  key_benefit?: string;
  main_objection?: string;
  objection_response?: string;
  emotional_angle?: string;
  winning_hook_ideas?: string[];
  social_proof_cue?: string | null;
  urgency_or_scarcity?: string | null;
}

interface AdConcept {
  concept_name?: string;
  visual_direction?: string;
  composition?: string;
  mood_lighting?: string;
  hook_overlay_text?: string | null;
  why_it_converts?: string;
}

interface Ad {
  id: string;
  product_id: string | null;
  template: string | null;
  prompt: string;
  aspect_ratio: string;
  image_url: string;
  created_at: string;
  metadata?: {
    brief?: AdBrief | null;
    concept?: AdConcept | null;
  } | null;
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
  { id: "auto", label: "Auto — AI finds winning concept", auto: true },
  { id: "studio_white", label: "Clean White Ad" },
  { id: "lifestyle", label: "Lifestyle In-Use" },
  { id: "ugc", label: "UGC Review" },
  { id: "premium", label: "Luxury Hero" },
  { id: "social_story", label: "Bold Gradient Story" },
  { id: "outdoor", label: "Golden Hour In-Use" },
];

interface PendingProduct {
  name: string;
  previewUrl: string | null;
}

export default function AdsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [templates, setTemplates] = useState<Template[]>(FALLBACK_TEMPLATES);

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingAds, setLoadingAds] = useState(true);

  const [showCreator, setShowCreator] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("auto");
  const [aspect, setAspect] = useState("1:1");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Skeleton-card state: while the product uploads/trains we show a live
  // placeholder in the grid so the modal can close immediately.
  const [pendingProduct, setPendingProduct] = useState<PendingProduct | null>(null);
  const [trainError, setTrainError] = useState("");

  // Last auto-generated brief + concept — surfaced in a panel right after
  // generation so the user sees the full chain-of-thought (strategy + visual).
  const [lastBrief, setLastBrief] = useState<AdBrief | null>(null);
  const [lastConcept, setLastConcept] = useState<AdConcept | null>(null);

  // Lightbox state — clicking an ad card opens MediaDetailView.
  const [lightboxAdId, setLightboxAdId] = useState<string | null>(null);

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
    setLastBrief(null);
    setLastConcept(null);
    try {
      const formData = new FormData();
      formData.append("product_id", selectedProductId);
      formData.append("template", selectedTemplate);
      formData.append("aspect_ratio", aspect);
      if (customPrompt.trim()) formData.append("custom_prompt", customPrompt.trim());
      const res = await adsAPI.generate(formData);
      const brief = res.data?.brief;
      const concept = res.data?.concept;
      if (brief && typeof brief === "object") setLastBrief(brief);
      if (concept && typeof concept === "object") setLastConcept(concept);
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

  /**
   * Kicks off product training from the creator modal.
   * - Closes the modal immediately.
   * - Shows a skeleton card (with the first photo as preview) in the grid
   *   while the backend uploads + analyses.
   * - Replaces the skeleton with the real product once the API returns.
   */
  const handleTrainProduct = async (
    formData: FormData,
    previewUrl: string | null,
    name: string,
  ) => {
    setPendingProduct({ name, previewUrl });
    setTrainError("");
    try {
      const res = await adsAPI.trainProduct(formData);
      const newId = res.data.product_id as string;
      await loadProducts();
      setSelectedProductId(newId);
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { detail?: string | { message?: string; error?: string } } };
        message?: string;
      };
      const detail = e.response?.data?.detail;
      const status = e.response?.status;
      let msg = "";
      if (typeof detail === "string") msg = detail;
      else if (detail && typeof detail === "object") {
        msg = detail.message || detail.error || JSON.stringify(detail);
      } else if (e.message) {
        msg = e.message;
      } else {
        msg = "Training failed";
      }
      setTrainError(`[${status || "?"}] ${msg}`);
    } finally {
      setPendingProduct(null);
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

          {/* Products grid — also rendered when a product is training so the
              user sees the skeleton placeholder right away */}
          {!loadingProducts && (products.length > 0 || pendingProduct) && (
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
                  disabled={!!pendingProduct}
                  className="text-[12px] font-medium flex items-center gap-1.5"
                  style={{
                    color: "var(--text-primary)",
                    opacity: pendingProduct ? 0.4 : 1,
                    cursor: pendingProduct ? "not-allowed" : "pointer",
                  }}
                >
                  <Plus size={13} />
                  New product
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                {/* Skeleton lands first so the user sees it pop in where their
                    new product will live. */}
                {pendingProduct && <SkeletonProductCard pending={pendingProduct} />}
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

              {trainError && (
                <div
                  className="mt-4 px-3 py-2 rounded-lg text-[12px] flex items-start justify-between gap-3"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    color: "var(--error)",
                  }}
                >
                  <span>{trainError}</span>
                  <button
                    type="button"
                    onClick={() => setTrainError("")}
                    aria-label="Dismiss"
                    style={{ color: "var(--error)", opacity: 0.7 }}
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              )}
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

              {/* Extracted product metadata — only shown when AI grabbed useful info */}
              {(selectedProduct.description ||
                (selectedProduct.features && selectedProduct.features.length > 0) ||
                selectedProduct.price ||
                selectedProduct.source_url) && (
                <div
                  className="rounded-xl p-3.5 mb-5"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <SparkleIcon size={12} style={{ color: "var(--text-muted)" }} />
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      AI product context
                    </p>
                  </div>

                  {selectedProduct.description && (
                    <p
                      className="text-[12.5px] mb-2.5"
                      style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}
                    >
                      {selectedProduct.description}
                    </p>
                  )}

                  {selectedProduct.features && selectedProduct.features.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {selectedProduct.features.map((f, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded-md"
                          style={{
                            background: "var(--bg-tertiary)",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    {selectedProduct.price && (
                      <span
                        className="text-[11.5px] font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {selectedProduct.price}
                      </span>
                    )}
                    {selectedProduct.source_url && (
                      <a
                        href={selectedProduct.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] flex items-center gap-1 hover:underline"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <LinkIcon size={11} />
                        Source page
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Templates grid */}
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Ad style
              </label>

              {/* Auto hero card — takes the full row, styled differently so it
                  reads as the recommended path. */}
              {templates.filter((t) => t.auto).map((tpl) => {
                const active = tpl.id === selectedTemplate;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className="w-full rounded-xl px-4 py-3.5 text-left transition-all mb-2 flex items-start gap-3"
                    style={{
                      background: active
                        ? "linear-gradient(135deg, var(--text-primary), #3b3b3b)"
                        : "var(--bg-tertiary)",
                      border: `1.5px solid ${active ? "var(--text-primary)" : "var(--border-color)"}`,
                      color: active ? "var(--bg-primary)" : "var(--text-primary)",
                      boxShadow: active ? "0 6px 20px rgba(0,0,0,0.18)" : "none",
                    }}
                  >
                    <div
                      className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
                      style={{
                        background: active ? "rgba(255,255,255,0.15)" : "var(--bg-primary)",
                        border: active ? "none" : "1px solid var(--border-color)",
                      }}
                    >
                      <SparkleIcon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-[13.5px] font-semibold">
                        Generate winning ad
                      </span>
                      <span
                        className="block text-[11.5px] mt-0.5"
                        style={{
                          color: active ? "rgba(255,255,255,0.75)" : "var(--text-muted)",
                          lineHeight: 1.4,
                        }}
                      >
                        AI researches top-performing ads in your niche and
                        designs an original concept for this product.
                      </span>
                    </div>
                    {active && (
                      <span
                        className="shrink-0 text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded"
                        style={{
                          background: "rgba(255,255,255,0.18)",
                          color: "var(--bg-primary)",
                        }}
                      >
                        SELECTED
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Divider — "Or pick a specific style" — only if we have non-auto
                  templates available */}
              {templates.some((t) => !t.auto) && (
                <p
                  className="text-[10px] uppercase tracking-wider mt-3 mb-2 px-1"
                  style={{ color: "var(--text-muted)", fontWeight: 600 }}
                >
                  Or pick a specific style
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                {templates.filter((t) => !t.auto).map((tpl) => {
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
                    {selectedTemplate === "auto"
                      ? "Researching concepts & generating…"
                      : "Generating your ad…"}
                  </>
                ) : (
                  <>
                    <SparkleIcon size={15} />
                    {selectedTemplate === "auto" ? "Generate winning ad" : "Generate ad"}
                  </>
                )}
              </button>

              {/* Chain-of-thought panel — shows the FULL strategic reasoning
                  (brief + concept) so the user sees why the AI picked this
                  angle, not just what it landed on. */}
              {(lastConcept?.concept_name || lastBrief?.key_benefit) && (
                <ChainOfThoughtPanel
                  brief={lastBrief}
                  concept={lastConcept}
                  onDismiss={() => {
                    setLastBrief(null);
                    setLastConcept(null);
                  }}
                />
              )}
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
                  <AdCard
                    key={ad.id}
                    ad={ad}
                    onDelete={() => handleDeleteAd(ad.id)}
                    onOpen={() => setLightboxAdId(ad.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {showCreator && (
        <CreateProductModal
          onClose={() => setShowCreator(false)}
          onSubmit={(formData, previewUrl, name) => {
            setShowCreator(false);
            // Fire-and-forget — the page shows a skeleton card until it resolves.
            void handleTrainProduct(formData, previewUrl, name);
          }}
        />
      )}

      {/* Lightbox — reuses MediaDetailView (same one the Images page uses) so
          the strategic reasoning (brief + concept) renders in the prompt
          panel on the right. Prev/next walks through the ads grid. */}
      {lightboxAdId && (
        <AdLightbox
          ads={ads}
          products={products}
          templates={templates}
          currentId={lightboxAdId}
          onSelectId={setLightboxAdId}
          onClose={() => setLightboxAdId(null)}
          onDelete={(id) => {
            void handleDeleteAd(id);
            setLightboxAdId(null);
          }}
        />
      )}
    </>
  );
}

/* ─── Ad lightbox ─────────────────────────────────────────────────────────
   Thin wrapper around MediaDetailView. Translates an Ad row (plus its
   metadata + template label) into the MediaDetailItem shape the viewer
   expects, then wires download / delete / prev / next against the parent's
   ads list. The formatted `prompt` contains the whole chain-of-thought
   (brief + concept + custom prompt) so the user can read the full strategy
   behind each generated ad — and copy it to the clipboard.
   ─────────────────────────────────────────────────────────────────── */

function AdLightbox({
  ads,
  products,
  templates,
  currentId,
  onSelectId,
  onClose,
  onDelete,
}: {
  ads: Ad[];
  products: Product[];
  templates: Template[];
  currentId: string;
  onSelectId: (id: string) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  // Index into the ads list. Guards against the row being removed from
  // under us (e.g. after a delete) — in that case we just close.
  const index = ads.findIndex((a) => a.id === currentId);
  if (index === -1) return null;

  const ad = ads[index];
  const total = ads.length;

  // Resolve display-friendly template label (from /templates) so the
  // details panel shows "Auto — AI finds winning concept" instead of
  // the raw slug.
  const templateLabel =
    (ad.template && templates.find((t) => t.id === ad.template)?.label) ||
    (ad.template ? ad.template.replace(/_/g, " ") : "");

  // Pull the primary product photo as the "source image" reference so the
  // lightbox's source block shows which product the ad was built from.
  const product = products.find((p) => p.product_id === ad.product_id) || null;

  // Cheap enough that a useMemo would only add ceremony — re-renders only
  // happen when the user navigates between ads or closes the viewer.
  const formattedPrompt = formatAdPrompt(ad, templateLabel);

  const handleDownload = async () => {
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
      window.open(ad.image_url, "_blank");
    }
  };

  return (
    <MediaDetailView
      item={{
        id: ad.id,
        type: "image",
        url: ad.image_url,
        prompt: formattedPrompt,
        created_at: ad.created_at,
        model: "Gemini 3 Pro Image",
        aspect_ratio: ad.aspect_ratio,
        quality: templateLabel || undefined,
        source_image_url: product?.thumbnail || undefined,
        source_label: product?.name ? `Product: ${product.name}` : undefined,
      }}
      position={total > 1 ? { index, total } : undefined}
      onClose={onClose}
      onPrev={index > 0 ? () => onSelectId(ads[index - 1].id) : undefined}
      onNext={index < total - 1 ? () => onSelectId(ads[index + 1].id) : undefined}
      onDownload={handleDownload}
      onDelete={() => onDelete(ad.id)}
    />
  );
}

/**
 * Renders the Ad's metadata (marketing brief + concept) plus its user-typed
 * prompt into a single readable block. This becomes the `prompt` shown in
 * the lightbox's details panel — the user can read the full AI strategy
 * and copy it to the clipboard with one click.
 */
function formatAdPrompt(ad: Ad, templateLabel: string): string {
  const lines: string[] = [];

  if (templateLabel) {
    lines.push(`Template: ${templateLabel}`);
    lines.push("");
  }

  const brief = ad.metadata?.brief;
  const concept = ad.metadata?.concept;

  if (brief) {
    lines.push("━━━ Marketing brief ━━━");
    if (brief.problem_solved) lines.push(`• Problem solved: ${brief.problem_solved}`);
    if (brief.target_audience) lines.push(`• Target audience: ${brief.target_audience}`);
    if (brief.before_state) lines.push(`• Before state: ${brief.before_state}`);
    if (brief.after_state) lines.push(`• After state: ${brief.after_state}`);
    if (brief.key_benefit) lines.push(`• Key benefit: ${brief.key_benefit}`);
    if (brief.main_objection) lines.push(`• Main objection: ${brief.main_objection}`);
    if (brief.objection_response) lines.push(`• Objection response: ${brief.objection_response}`);
    if (brief.emotional_angle) lines.push(`• Emotional angle: ${brief.emotional_angle}`);
    if (brief.social_proof_cue) lines.push(`• Social proof: ${brief.social_proof_cue}`);
    if (brief.urgency_or_scarcity) lines.push(`• Urgency: ${brief.urgency_or_scarcity}`);
    if (brief.winning_hook_ideas && brief.winning_hook_ideas.length > 0) {
      lines.push("• Winning hook ideas:");
      brief.winning_hook_ideas.forEach((h) => lines.push(`    – ${h}`));
    }
    lines.push("");
  }

  if (concept) {
    lines.push("━━━ Visual concept ━━━");
    if (concept.concept_name) lines.push(`• Concept: ${concept.concept_name}`);
    if (concept.visual_direction) lines.push(`• Visual direction: ${concept.visual_direction}`);
    if (concept.composition) lines.push(`• Composition: ${concept.composition}`);
    if (concept.mood_lighting) lines.push(`• Mood & lighting: ${concept.mood_lighting}`);
    if (concept.hook_overlay_text) lines.push(`• Headline overlay: "${concept.hook_overlay_text}"`);
    if (concept.why_it_converts) lines.push(`• Why it converts: ${concept.why_it_converts}`);
    lines.push("");
  }

  if (ad.prompt) {
    lines.push("━━━ User prompt ━━━");
    lines.push(ad.prompt);
  }

  return lines.join("\n").trim() || ad.prompt || "(no prompt recorded)";
}

/* ─── Chain-of-thought panel ───────────────────────────────────────────────
   Shows the full reasoning trail (marketing brief + visual concept) the AI
   produced for an Auto-mode ad. Appears inline right after generation so
   the user can see WHY the creative looks the way it does — not just what
   concept name it picked. Every field is optional: we render only what the
   model returned. If the whole thing is empty, the parent doesn't mount us.
   ─────────────────────────────────────────────────────────────────────── */

function ChainOfThoughtPanel({
  brief,
  concept,
  onDismiss,
}: {
  brief: AdBrief | null;
  concept: AdConcept | null;
  onDismiss: () => void;
}) {
  // Pull only the fields we actually want to surface. Keeping this compact
  // so the panel doesn't dominate the composer — full detail lives in the
  // lightbox when the user clicks the generated ad.
  const highlights: { label: string; value: string }[] = [];
  if (brief?.key_benefit) highlights.push({ label: "Key benefit", value: brief.key_benefit });
  if (brief?.target_audience) highlights.push({ label: "Target audience", value: brief.target_audience });
  if (brief?.problem_solved) highlights.push({ label: "Problem solved", value: brief.problem_solved });
  if (brief?.emotional_angle) highlights.push({ label: "Emotional angle", value: brief.emotional_angle });

  return (
    <div
      className="mt-4 rounded-xl p-4"
      style={{
        background: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {/* Header row: sparkle icon + "AI strategy" label + dismiss */}
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
          style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <SparkleIcon size={13} style={{ color: "var(--text-primary)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            AI strategy & concept
          </p>
          {concept?.concept_name && (
            <p
              className="text-[13px] font-semibold mt-0.5"
              style={{ color: "var(--text-primary)" }}
            >
              {concept.concept_name}
            </p>
          )}
          {concept?.hook_overlay_text && (
            <p
              className="text-[12px] mt-1"
              style={{ color: "var(--text-secondary)", fontStyle: "italic" }}
            >
              &ldquo;{concept.hook_overlay_text}&rdquo;
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1 rounded"
          style={{ color: "var(--text-muted)" }}
        >
          <XIcon size={13} />
        </button>
      </div>

      {/* Brief highlights — the strategic Q&A the AI did before designing */}
      {highlights.length > 0 && (
        <div
          className="mt-3 pt-3 space-y-2"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          {highlights.map((h) => (
            <div key={h.label} className="flex flex-col gap-0.5">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                {h.label}
              </span>
              <span
                className="text-[12px]"
                style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}
              >
                {h.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Why it converts — the through-line tying visual choice to strategy */}
      {concept?.why_it_converts && (
        <div
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Why it converts
          </span>
          <p
            className="text-[12px] mt-1"
            style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}
          >
            {concept.why_it_converts}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Skeleton product card (while training) ─── */

function SkeletonProductCard({ pending }: { pending: PendingProduct }) {
  return (
    <div
      className="relative aspect-[3/4] rounded-2xl overflow-hidden"
      style={{
        background: "var(--bg-secondary)",
        border: "1.5px dashed var(--border-color)",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      {/* Blurred preview of the first photo, faded so the shimmer reads on top */}
      {pending.previewUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={pending.previewUrl}
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: "blur(6px) brightness(0.55)", transform: "scale(1.08)" }}
        />
      ) : (
        <div className="w-full h-full" style={{ background: "var(--bg-tertiary)" }} />
      )}

      {/* Moving shimmer band — same trick used everywhere else in the app */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)",
          backgroundSize: "200% 100%",
          animation: "adsSkeletonShimmer 1.6s linear infinite",
        }}
      />

      {/* Centered status: spinner + "Training product..." */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 gap-2"
        style={{ color: "#fff" }}
      >
        <Spinner size={22} />
        <p className="text-[12px] font-semibold tracking-wide">Training product…</p>
        <p
          className="text-[10.5px]"
          style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.35 }}
        >
          Uploading photos and analysing the product. This takes ~20–40 s.
        </p>
      </div>

      {/* Bottom gradient + product name, matches the real card */}
      <div
        className="absolute inset-x-0 bottom-0 p-3"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)",
        }}
      >
        <p className="text-white text-[13px] font-semibold truncate drop-shadow-sm text-center">
          {pending.name}
        </p>
      </div>

      {/* Scoped keyframes so we don't pollute globals */}
      <style jsx>{`
        @keyframes adsSkeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
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

        {/* URL badge — shown when product has source metadata */}
        {!selected && product.source_url && (
          <div
            className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              backdropFilter: "blur(4px)",
            }}
            title="Analysed from product URL"
          >
            <LinkIcon size={11} />
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

function AdCard({
  ad,
  onDelete,
  onOpen,
}: {
  ad: Ad;
  onDelete: () => void;
  onOpen: () => void;
}) {
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
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`relative rounded-2xl overflow-hidden ${aspectClass} cursor-pointer`}
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.15)" : "none",
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
  onSubmit,
}: {
  onClose: () => void;
  /** Hands the form payload back to the page; modal closes immediately. */
  onSubmit: (formData: FormData, previewUrl: string | null, name: string) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
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
  const canTrain = meetsMinimum && name.trim().length > 0;

  const handleTrain = () => {
    if (!canTrain) return;
    const formData = new FormData();
    formData.append("name", name.trim());
    if (category.trim()) formData.append("category", category.trim());
    if (sourceUrl.trim()) formData.append("source_url", sourceUrl.trim());
    files.forEach((f) => formData.append("files", f));
    onSubmit(formData, previews[0] || null, name.trim());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
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
            className="p-1.5 rounded-lg transition-colors shrink-0 ml-3"
            style={{ color: "var(--text-muted)", cursor: "pointer" }}
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

          {/* Product URL — lets the AI analyse the full listing (AliExpress, Amazon…) */}
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-2 flex items-center gap-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              <LinkIcon size={11} />
              Product URL <span style={{ fontWeight: 400, textTransform: "none" }}>(optional, but recommended)</span>
            </label>
            <div className="relative">
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              >
                <LinkIcon size={13} />
              </div>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.aliexpress.com/item/..."
                maxLength={2048}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-[13px]"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
            <p
              className="text-[11px] mt-1.5"
              style={{ color: "var(--text-muted)", lineHeight: 1.45 }}
            >
              Paste the AliExpress, Amazon or Shopify link — the AI reads the page to learn
              what the product does, giving it better scene ideas.
            </p>
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
            className="px-4 py-2 rounded-lg text-[13px] font-medium"
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
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
            <SparkleIcon size={14} />
            Train product
          </button>
        </div>
      </div>
    </div>
  );
}
