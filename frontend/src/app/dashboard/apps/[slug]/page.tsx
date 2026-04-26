"use client";

/**
 * /dashboard/apps/<slug> — runner page for a user-created mini app.
 *
 * This page is **the same layout for every mini-app**. It reads the
 * spec from the backend, renders the form fields, and when the user
 * clicks "Générer" it calls the underlying Horpen tool endpoint with
 * the composed prompt. No custom UI per mini-app — the whole point
 * is that mini-apps stay inside the Horpen DA.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { miniAppsAPI, avatarAPI, type MiniApp } from "@/lib/api";
import { ArrowRight } from "@/components/Icons";

export default function MiniAppRunnerPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug;

  const [app, setApp] = useState<MiniApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ prompt: string; tool: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await miniAppsAPI.get(slug);
        if (cancelled) return;
        setApp(res.data);
        // Seed form values with spec defaults.
        const init: Record<string, string | number> = {};
        for (const field of res.data.spec.fields ?? []) {
          if (field.default !== undefined) init[field.key] = field.default;
        }
        setValues(init);
      } catch {
        if (!cancelled) setError("Mini-app introuvable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleRun = async () => {
    if (!app) return;
    setRunning(true);
    setError(null);
    try {
      const runRes = await miniAppsAPI.run(app.slug, values);
      const { composed_prompt, tool } = runRes.data;
      setResult({ prompt: composed_prompt, tool });

      // Route the composed prompt to the underlying Horpen tool :
      //   canvas → /generate-image
      //   others → kept as preview for now (user copies + pastes into the
      //   corresponding app page — full auto-wiring lands in the next
      //   iteration).
      if (tool === "canvas") {
        const formData = new FormData();
        formData.append("prompt", composed_prompt);
        await avatarAPI.generateImage(formData);
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Le run a échoué.";
      setError(message);
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: "50vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-8" style={{ color: "var(--text-primary)" }}>
        <h1 className="text-[22px] font-semibold">Mini-app introuvable</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
          Elle a peut-être été supprimée ou appartient à un autre workspace.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="btn-premium mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full"
          style={{ background: "var(--text-primary)", color: "var(--bg-primary)", fontSize: 13 }}
        >
          Retour au dashboard
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header — mirrors the /dashboard/images layout */}
      <div
        className="px-4 md:px-6 pt-6 pb-4"
        style={{ borderBottom: "1px solid var(--border-color)" }}
      >
        <div className="flex items-center gap-3">
          {app.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={app.logo_url}
              alt=""
              width={40}
              height={40}
              style={{ borderRadius: 10 }}
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${app.accent}, ${app.accent}55)`,
                border: `1px solid ${app.accent}99`,
              }}
            />
          )}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--text-tertiary, #9ca3af)",
              }}
            >
              Mini App · {app.tool}
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              {app.name}
            </h1>
          </div>
        </div>
        {app.description && (
          <p
            style={{
              marginTop: 12,
              color: "var(--text-secondary)",
              fontSize: 14,
              maxWidth: 720,
            }}
          >
            {app.description}
          </p>
        )}
      </div>

      {/* Body — 2-col on desktop : form left, result right */}
      <div className="flex-1 px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 16,
            }}
          >
            Paramètres
          </div>
          <div className="flex flex-col gap-4">
            {(app.spec.fields ?? []).map((field) => (
              <div key={field.key}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                  }}
                >
                  {field.label}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    value={String(values[field.key] ?? "")}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.key]: e.target.value }))
                    }
                    rows={3}
                    className="w-full rounded-lg px-3 py-2"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                ) : field.type === "select" ? (
                  <select
                    value={String(values[field.key] ?? "")}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.key]: e.target.value }))
                    }
                    className="w-full rounded-lg px-3 py-2"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      outline: "none",
                    }}
                  >
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    value={String(values[field.key] ?? "")}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        [field.key]:
                          field.type === "number" ? Number(e.target.value) : e.target.value,
                      }))
                    }
                    className="w-full rounded-lg px-3 py-2"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                )}
              </div>
            ))}
            <button
              onClick={handleRun}
              disabled={running}
              className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-medium"
              style={{
                background: app.accent,
                color: "#ffffff",
                fontSize: 14,
                border: "none",
                cursor: running ? "not-allowed" : "pointer",
                opacity: running ? 0.7 : 1,
                boxShadow: `0 4px 14px ${app.accent}50`,
              }}
            >
              {running ? "Génération…" : "Générer"}
              {!running && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
            {error && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  color: "#fca5a5",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Result / prompt preview */}
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            minHeight: 200,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 16,
            }}
          >
            Résultat
          </div>
          {!result ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
              Remplis les paramètres et clique sur <strong>Générer</strong> — ton
              mini-app va appeler <strong>{app.tool}</strong> avec le prompt
              composé à partir de tes réponses.
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                Prompt composé → envoyé à <strong>{result.tool}</strong>
              </div>
              <pre
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {result.prompt}
              </pre>
              <div
                style={{
                  marginTop: 12,
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                }}
              >
                Les livrables apparaissent dans{" "}
                <a
                  href="/dashboard/images"
                  style={{ color: app.accent, textDecoration: "underline" }}
                >
                  ta galerie
                </a>
                .
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
