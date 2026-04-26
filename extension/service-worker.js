/**
 * Horpen extension — service worker (manifest v3 background)
 *
 *   • Registers the right-click "Recreate with Horpen" context menu on
 *     images, and remembers which image URL was clicked.
 *   • Opens the side panel on click so the recreation flow has a stable
 *     surface (popup auto-closes when you scroll/inspect — bad UX).
 *   • Owns the JWT (chrome.storage.local) and the API base URL.
 *   • Bridges the auth handshake from horpen.ai (externally_connectable)
 *     so the user can "Connect" the extension from inside the app.
 */

const STORAGE_KEYS = {
  jwt: "horpen_jwt",
  user: "horpen_user",
  apiBase: "horpen_api_base",
  pendingImage: "horpen_pending_image",
};

const DEFAULT_API_BASE = "https://api.horpen.ai";

const CTX_MENU_ID = "horpen-recreate-image";

// ── Setup ────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CTX_MENU_ID,
    title: "Recreate with Horpen",
    contexts: ["image"],
  });
});

// ── Context menu handler ────────────────────────────────────────────────
// Tells the active tab's content script to open its floating panel with
// this image pre-loaded. The panel itself is injected by content.js, so
// the worker is just a relay.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CTX_MENU_ID) return;
  if (!info.srcUrl) return;
  if (!tab?.id) return;

  await chrome.storage.local.set({
    [STORAGE_KEYS.pendingImage]: {
      url: info.srcUrl,
      pageUrl: info.pageUrl || "",
      addedAt: Date.now(),
    },
  });

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "horpen_open_panel",
      imageUrl: info.srcUrl,
      pageUrl: info.pageUrl || "",
    });
  } catch (err) {
    // Content script may not be injected yet (chrome:// pages, etc.).
    console.warn("sendMessage to content script failed:", err);
  }
});

// ── External handshake from horpen.ai ────────────────────────────────────
// The frontend's /dashboard/extension-connect page reads its JWT from
// localStorage and sends it here, paired with a tiny user object so the
// extension can show "Connected as <email>". The user clicks once and
// the popup is good for as long as the JWT is valid.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "horpen_connect" && typeof message.jwt === "string") {
    const payload = {
      [STORAGE_KEYS.jwt]: message.jwt,
      [STORAGE_KEYS.user]: message.user || null,
    };
    if (message.apiBase) payload[STORAGE_KEYS.apiBase] = message.apiBase;
    chrome.storage.local.set(payload).then(() => {
      sendResponse({ ok: true });
    });
    return true; // keep the channel open for async sendResponse
  }

  if (message.type === "horpen_disconnect") {
    chrome.storage.local.remove([STORAGE_KEYS.jwt, STORAGE_KEYS.user]).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

// ── Internal API helper ──────────────────────────────────────────────────
// Used by popup.js + sidepanel.js so JWT plumbing stays in one place.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "horpen_api") {
    callHorpenApi(message.path, message.options || {})
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  if (message.type === "horpen_auth_status") {
    chrome.storage.local
      .get([STORAGE_KEYS.jwt, STORAGE_KEYS.user, STORAGE_KEYS.apiBase])
      .then((store) => {
        sendResponse({
          authed: Boolean(store[STORAGE_KEYS.jwt]),
          user: store[STORAGE_KEYS.user] || null,
          apiBase: store[STORAGE_KEYS.apiBase] || DEFAULT_API_BASE,
        });
      });
    return true;
  }

  if (message.type === "horpen_disconnect") {
    chrome.storage.local.remove([STORAGE_KEYS.jwt, STORAGE_KEYS.user]).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

async function callHorpenApi(path, options) {
  const store = await chrome.storage.local.get([STORAGE_KEYS.jwt, STORAGE_KEYS.apiBase]);
  const apiBase = store[STORAGE_KEYS.apiBase] || DEFAULT_API_BASE;
  const jwt = store[STORAGE_KEYS.jwt];
  if (!jwt) {
    throw new Error("Not connected to Horpen — open the extension popup and click Connect.");
  }

  const headers = {
    Authorization: `Bearer ${jwt}`,
    ...(options.headers || {}),
  };
  // Don't set Content-Type for FormData — let the browser pick the boundary.
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const detail =
      (json && (json.detail?.message || json.detail || json.error || json.message)) ||
      `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return json;
}
