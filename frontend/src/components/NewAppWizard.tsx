"use client";

/**
 * NewAppWizard — "+ New App" modal.
 *
 * Flow :
 *   1. User types free-text intent ("shorts TikTok sur les animaux")
 *   2. Claude replies with either a follow-up question, a final spec,
 *      or an "out_of_scope" refusal
 *   3. The chat loops until Claude returns a spec
 *   4. User clicks "Créer" → POST /mini-apps → new mini-app appears
 *      in the sidebar
 *
 * Visual : Claude-style chat in a centered dark modal. Matches the
 * existing Horpen DA (pure black #000, white text, minimal borders).
 */

import { useEffect, useRef, useState } from "react";
import { miniAppsAPI, type MiniApp, type WizardReply } from "@/lib/api";
import { ArrowRight, XIcon } from "@/components/Icons";

interface Message {
  role: "user" | "assistant";
  text: string;
  reply?: WizardReply;
}

export default function NewAppWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (app: MiniApp) => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom on new message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, loading]);

  const appendAssistant = (reply: WizardReply) => {
    let text = "";
    if (reply.type === "question") {
      text = reply.text;
      if (reply.hint) text += `\n_${reply.hint}_`;
    } else if (reply.type === "spec") {
      text = `Prêt ! J'ai préparé **${reply.spec.name}** — ${reply.spec.description ?? ""}`;
      setReady(true);
    } else if (reply.type === "out_of_scope") {
      text = reply.reason;
      if (reply.suggestion) text += `\n\n💡 ${reply.suggestion}`;
    }
    setMessages((prev) => [...prev, { role: "assistant", text, reply }]);
  };

  const handleSubmit = async () => {
    const content = input.trim();
    if (!content || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: content }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      if (!sessionId) {
        const res = await miniAppsAPI.wizardStart(content);
        setSessionId(res.data.session_id);
        appendAssistant(res.data.reply);
      } else {
        const res = await miniAppsAPI.wizardMessage(sessionId, content);
        appendAssistant(res.data.reply);
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Le wizard n'a pas répondu, réessaie dans un instant.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!sessionId || !ready) return;
    setLoading(true);
    setError(null);
    try {
      const res = await miniAppsAPI.create(sessionId);
      onCreated(res.data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Impossible de sauvegarder l'app. Réessaie.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[8vh] px-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)" }}
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "rgba(10,10,15,0.98)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 40px 80px -20px rgba(0,0,0,0.8)",
          width: "min(680px, 100%)",
          maxHeight: "84vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#9ca3af",
              }}
            >
              New App
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#ffffff",
                marginTop: 2,
                letterSpacing: "-0.01em",
              }}
            >
              Crée ta mini-app custom
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "transparent",
              color: "#9ca3af",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.4 : 1,
            }}
            title="Fermer"
          >
            <XIcon size={14} />
          </button>
        </div>

        {/* Intro (only when no message yet) */}
        {messages.length === 0 && (
          <div
            className="px-5 py-6"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.55 }}>
              Dis-moi en une phrase ce que tu veux automatiser avec Horpen.
              Exemple :{" "}
              <em style={{ color: "#e5e7eb" }}>
                “des shorts TikTok sur les animaux exotiques”
              </em>
              . Je te pose 4-6 questions courtes, puis je compile ta mini-app.
            </div>
          </div>
        )}

        {/* Chat */}
        {messages.length > 0 && (
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-5 py-4"
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#6b7280",
                    marginBottom: 4,
                  }}
                >
                  {m.role === "user" ? "Toi" : "Wizard"}
                </div>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    background:
                      m.role === "user"
                        ? "rgba(59,130,246,0.15)"
                        : "rgba(255,255,255,0.04)",
                    border:
                      m.role === "user"
                        ? "1px solid rgba(59,130,246,0.3)"
                        : "1px solid rgba(255,255,255,0.08)",
                    color: "#f3f4f6",
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.text}
                </div>
                {m.reply?.type === "spec" && (
                  <div
                    className="mt-3 p-3 rounded-xl"
                    style={{
                      background: `linear-gradient(135deg, ${m.reply.spec.accent || "#3b82f6"}25, ${m.reply.spec.accent || "#3b82f6"}08)`,
                      border: `1px solid ${m.reply.spec.accent || "#3b82f6"}50`,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>
                      Outil : <strong style={{ color: "#ffffff" }}>{m.reply.spec.tool}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      Champs : {m.reply.spec.fields?.map((f) => f.label).join(" · ")}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  fontSize: 12,
                  color: "#6b7280",
                  fontStyle: "italic",
                }}
              >
                Le wizard réfléchit…
              </div>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            className="px-5 py-3"
            style={{
              background: "rgba(248,113,113,0.08)",
              borderTop: "1px solid rgba(248,113,113,0.2)",
              color: "#fca5a5",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Input */}
        <div
          className="px-5 py-4 flex items-end gap-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              messages.length === 0
                ? "Ex : shorts TikTok sur les animaux exotiques"
                : "Ta réponse…"
            }
            disabled={loading || ready}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#ffffff",
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 14,
              outline: "none",
              resize: "none",
              minHeight: 42,
              maxHeight: 120,
              opacity: ready ? 0.5 : 1,
            }}
          />
          {ready ? (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full font-medium"
              style={{
                background: "#ffffff",
                color: "#0a0a0a",
                fontSize: 13.5,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              {loading ? "Création…" : "Créer l'app"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: input.trim() && !loading ? "#ffffff" : "rgba(255,255,255,0.08)",
                color: input.trim() && !loading ? "#0a0a0a" : "#6b7280",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
              title="Envoyer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
