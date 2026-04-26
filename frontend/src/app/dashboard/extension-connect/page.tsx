"use client";

/**
 * Extension auth bridge.
 *
 * The Chrome extension's manifest declares `externally_connectable.matches`
 * including this origin, so it can receive `chrome.runtime.sendMessage`
 * from this page. The user clicks "Connect", we forward their JWT (read
 * from localStorage) + a small profile snapshot, and the extension
 * stores them in `chrome.storage.local`.
 *
 * Two ways to land here:
 *   • Click the popup's "Connect to Horpen" button — we land authenticated.
 *   • Type the URL manually — same flow.
 *
 * If the user isn't logged in, we redirect to /login with a returnTo
 * pointing back here so they pick up after auth.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import Header from "@/components/Header";
import { userAPI } from "@/lib/api";

// IMPORTANT — replace this with the actual extension ID once it's
// loaded in chrome://extensions or published to the Chrome Web Store.
// During development, Chrome generates a unique ID per profile that you
// copy from the chrome://extensions page. We accept multiple IDs (dev +
// prod) so the same bridge page works in both contexts.
const HORPEN_EXTENSION_IDS: string[] = [
  // Add the dev ID after first load. Example:
  // "abcdefghijklmnopabcdefghijklmnop",
];

type Status =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "ok"; email: string }
  | { kind: "err"; message: string };

export default function ExtensionConnectPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [email, setEmail] = useState<string>("");

  // Auth gate — same pattern as /dashboard/layout.tsx.
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login?returnTo=/dashboard/extension-connect");
      return;
    }
    setReady(true);
    userAPI
      .getProfile()
      .then((res) => setEmail(res.data?.email || ""))
      .catch(() => {});
  }, [router]);

  const handleConnect = async () => {
    setStatus({ kind: "connecting" });
    try {
      const jwt = typeof window !== "undefined" ? localStorage.getItem("horpen_token") : null;
      if (!jwt) {
        setStatus({ kind: "err", message: "No JWT found. Sign out and sign back in." });
        return;
      }

      const apiBase =
        typeof window !== "undefined"
          ? process.env.NEXT_PUBLIC_API_URL || "https://api.horpen.ai"
          : "https://api.horpen.ai";

      const payload = {
        type: "horpen_connect",
        jwt,
        apiBase,
        user: {
          email,
        },
      };

      // Try every known extension ID — the user only has one of them.
      // chrome.runtime.sendMessage rejects unknown IDs silently, so we
      // collect successes and surface a friendly error if none replied.
      type ChromeRuntime = {
        sendMessage: (
          extensionId: string,
          message: unknown,
          callback?: (response: { ok?: boolean } | undefined) => void
        ) => void;
        lastError?: { message?: string };
      };
      type ChromeApi = { runtime?: ChromeRuntime };
      const chromeApi = (window as unknown as { chrome?: ChromeApi }).chrome;
      const sendMessage = chromeApi?.runtime?.sendMessage;
      if (!sendMessage) {
        setStatus({
          kind: "err",
          message:
            "Chrome extension API not available. Install the Horpen extension and try again from the same browser profile.",
        });
        return;
      }

      const ids = HORPEN_EXTENSION_IDS.length
        ? HORPEN_EXTENSION_IDS
        : // Fallback: try without an id (works only if a content script of
          // the extension is on this page — manifest's externally_connectable
          // also accepts host-side messages without an explicit id when the
          // extension is loaded). In dev we always need an explicit id.
          [];

      let okCount = 0;
      const errs: string[] = [];
      await Promise.all(
        ids.map(
          (id) =>
            new Promise<void>((resolve) => {
              try {
                chromeApi!.runtime!.sendMessage(
                  id,
                  payload,
                  (response) => {
                    const lastErr = chromeApi!.runtime!.lastError;
                    if (lastErr) {
                      errs.push(lastErr.message || "unknown");
                    } else if (response?.ok) {
                      okCount++;
                    }
                    resolve();
                  }
                );
              } catch (e) {
                errs.push(String(e));
                resolve();
              }
            })
        )
      );

      if (okCount > 0) {
        setStatus({ kind: "ok", email: email || "Horpen" });
        return;
      }
      setStatus({
        kind: "err",
        message:
          ids.length === 0
            ? "No extension ID configured. Pin the Horpen extension and copy its ID from chrome://extensions into HORPEN_EXTENSION_IDS in the source."
            : `Couldn't reach the extension. Make sure it's installed and enabled. (${errs.join("; ") || "no response"})`,
      });
    } catch (e) {
      setStatus({
        kind: "err",
        message: (e as Error)?.message || "Unexpected error.",
      });
    }
  };

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <Header title="Extension" subtitle="Connect the Horpen browser extension" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] mx-auto px-4 md:px-6 py-10">
          <div
            className="rounded-2xl p-8"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div className="flex items-center gap-3 mb-1">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[14px] font-bold"
                style={{
                  background: "linear-gradient(135deg, #c4ff3a, #94d100)",
                  color: "#0d0d0f",
                }}
              >
                H
              </div>
              <h1 className="text-[20px] font-bold" style={{ color: "var(--text-primary)" }}>
                Connect Horpen Extension
              </h1>
            </div>
            <p className="text-[13.5px] mt-2" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}>
              Right-click any image on the web — Pinterest, Instagram, ad libraries —
              and recreate it with your trained characters or products. One click
              connects this account to the extension.
            </p>

            {status.kind === "ok" ? (
              <div
                className="rounded-xl p-4 mt-6"
                style={{
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.25)",
                  color: "#15803d",
                  fontSize: 13.5,
                }}
              >
                ✓ Connected as <strong>{status.email}</strong>. You can close this tab —
                the extension's panel is ready to use.
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={status.kind === "connecting"}
                className="btn-premium-dark mt-6 w-full px-5 py-3 rounded-full text-[14px] font-semibold flex items-center justify-center gap-2"
              >
                {status.kind === "connecting" ? "Connecting…" : "Connect this account to the extension"}
              </button>
            )}

            {status.kind === "err" && (
              <div
                className="rounded-xl p-3 mt-3"
                style={{
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.25)",
                  color: "#b91c1c",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {status.message}
              </div>
            )}

            <ol
              className="mt-8 pl-5 text-[13px] flex flex-col gap-2"
              style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}
            >
              <li>Install the Horpen extension from the Chrome Web Store (or load <code>extension/</code> unpacked during development).</li>
              <li>Click <strong>Connect</strong> above.</li>
              <li>Right-click any image → <strong>Recreate with Horpen</strong>, or click the green Recreate pill that appears on hover.</li>
              <li>Pick a character or product to inject. Generation lands in your dashboard.</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
