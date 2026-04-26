/**
 * Popup — the small surface that opens when the user clicks the
 * extension icon. Two states:
 *   • Not connected → "Connect to Horpen" button (opens the bridge page)
 *   • Connected     → user card + Disconnect + tip on how to use
 */

const $content = document.getElementById("content");

function render(html) {
  $content.innerHTML = html;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

async function load() {
  const status = await chrome.runtime.sendMessage({ type: "horpen_auth_status" });
  if (status?.authed) {
    return renderConnected(status);
  }
  return renderDisconnected();
}

function renderDisconnected() {
  render(`
    <div class="state">
      <p class="muted">
        Connect your Horpen account to recreate any image you find on the web with your trained characters or products.
      </p>
      <button class="btn" id="btn-connect">Connect to Horpen</button>
      <p class="muted" style="text-align:center; margin: 4px 0 0;">
        Don't have an account?
        <a href="https://horpen.ai/signup" target="_blank" rel="noopener" style="color:#1a1a1a; font-weight:600;">Sign up</a>
      </p>
    </div>
  `);

  document.getElementById("btn-connect").addEventListener("click", () => {
    // Open the bridge page on horpen.ai. The page reads the user's JWT
    // from localStorage and posts it back to this extension via
    // chrome.runtime.sendMessage(EXTENSION_ID, ...). After it succeeds
    // we re-render the popup.
    chrome.tabs.create({
      url: "https://horpen.ai/dashboard/extension-connect",
    });
  });
}

function renderConnected(status) {
  const email = status.user?.email || "Connected";
  const initial = (email[0] || "?").toUpperCase();
  render(`
    <div class="state">
      <div class="user">
        <div class="avatar">${escapeHtml(initial)}</div>
        <div class="meta">
          <div class="label">Connected</div>
          <div class="email">${escapeHtml(email)}</div>
        </div>
      </div>

      <div class="tip">
        Right-click any image on the web → <strong>Recreate with Horpen</strong>.
        The side panel opens so you can pick a character or product to inject.
      </div>

      <button class="btn btn-ghost" id="btn-disconnect">Disconnect</button>
    </div>
  `);

  document.getElementById("btn-disconnect").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "horpen_disconnect" });
    load();
  });
}

document.addEventListener("DOMContentLoaded", load);

// Re-render when storage changes externally (e.g. bridge page just
// posted the JWT and the user comes back to the popup).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.horpen_jwt) load();
});
