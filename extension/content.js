/**
 * Horpen content script — injects:
 *
 *   • A "Recreate" pill on every reasonably large image on the page
 *     (bottom-left, like Higgsfield). Click → opens the floating panel
 *     with that image pre-loaded.
 *
 *   • A floating panel widget (top-right of viewport) with:
 *       - Image preview / drop zone
 *       - Character picker  (from /avatar/avatars)
 *       - Product picker    (from /ads/products)
 *       - Aspect ratio picker
 *       - Generate button → POST /extension/recreate
 *
 * Both live inside a Shadow DOM so the host site (Pinterest, IG, etc.)
 * can't bleed CSS into our widget — and our CSS can't pollute theirs.
 *
 * Defensive design:
 *   • Idempotent — if the script gets injected twice we no-op.
 *   • IntersectionObserver scans for images lazily (Pinterest = infinite
 *     scroll, scanning every node up-front would be insane).
 *   • Skips images smaller than 200px (icons, avatars, decorative bits).
 *   • The pill positions absolutely relative to a wrapper around the img,
 *     not the img itself, so we don't break sites that use img onClick.
 */
(() => {
  if (window.__horpenInjected) return;
  window.__horpenInjected = true;

  const MIN_IMG_SIZE = 200;
  const HOST_ID = "horpen-extension-root";

  // ── Shadow DOM root for our widget ────────────────────────────────
  const host = document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: "0",
    height: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif; }

      .panel {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 320px;
        max-height: calc(100vh - 32px);
        overflow: hidden;
        background: #0d0d0f;
        color: #f0f0f0;
        border: 1px solid #232328;
        border-radius: 18px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        font-size: 13px;
        opacity: 0;
        transform: translateX(8px);
        transition: opacity 0.18s ease, transform 0.18s ease, max-height 0.25s ease;
      }
      .panel.visible { opacity: 1; transform: translateX(0); }
      .panel.collapsed { max-height: 56px !important; }

      .head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px;
        border-bottom: 1px solid #1c1c20;
        cursor: grab;
        flex-shrink: 0;
      }
      .head .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: -0.01em; }
      .head .brand .dot {
        width: 22px; height: 22px; border-radius: 6px;
        background: linear-gradient(135deg, #c4ff3a, #7dd400);
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 800; color: #0d0d0f;
      }
      .head .actions { display: flex; gap: 4px; }
      .icon-btn {
        appearance: none; background: transparent; border: none;
        color: #888; padding: 4px 6px; border-radius: 6px; cursor: pointer; font-size: 13px; line-height: 1;
      }
      .icon-btn:hover { background: #1c1c20; color: #f0f0f0; }

      .body { padding: 14px; overflow-y: auto; flex: 1; }

      .drop {
        position: relative;
        aspect-ratio: 9/16;
        max-height: 220px;
        background: #16161a;
        border: 1px dashed #2a2a2f;
        border-radius: 14px;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
        cursor: pointer;
        transition: border-color 0.18s, background 0.18s;
      }
      .drop:hover, .drop.drag { border-color: #c4ff3a; background: #1a1a1e; }
      .drop .placeholder {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        color: #888; font-size: 12px; text-align: center; padding: 20px;
      }
      .drop .placeholder .arrow {
        width: 32px; height: 32px; border-radius: 50%;
        background: #232328;
        display: flex; align-items: center; justify-content: center;
        color: #aaa; font-size: 16px;
      }
      .drop img {
        position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
      }
      .drop .clear {
        position: absolute; top: 6px; right: 6px;
        width: 22px; height: 22px; border-radius: 50%;
        background: rgba(0,0,0,0.6); color: #fff;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; font-size: 11px; line-height: 1;
        backdrop-filter: blur(4px);
      }

      .title {
        font-size: 15px; font-weight: 700; margin: 14px 0 4px;
      }
      .subtitle {
        font-size: 11.5px; color: #999; line-height: 1.5;
      }

      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
      .field {
        background: #16161a;
        border: 1px solid #232328;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        position: relative;
      }
      .field:hover { border-color: #2f2f35; }
      .field .label { font-size: 10px; color: #777; letter-spacing: 0.04em; text-transform: uppercase; }
      .field .value { font-size: 13px; color: #f0f0f0; margin-top: 2px; display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .field .value .swatch {
        width: 16px; height: 16px; border-radius: 50%;
        background: #2a2a2f; flex-shrink: 0;
        background-size: cover; background-position: center;
      }
      .field .chev { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #666; font-size: 10px; }

      .generate {
        width: 100%; margin-top: 14px;
        padding: 12px 14px;
        background: linear-gradient(180deg, #c4ff3a, #94d100);
        color: #0d0d0f;
        font-weight: 700; font-size: 13.5px;
        border: none; border-radius: 12px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 6px;
        box-shadow:
          inset 0 4px 4px rgba(255, 255, 255, 0.3),
          0 4px 12px rgba(196, 255, 58, 0.3);
        transition: transform 0.12s, box-shadow 0.18s;
      }
      .generate:hover:not([disabled]) { transform: translateY(-1px); }
      .generate[disabled] { opacity: 0.5; cursor: not-allowed; background: #2a2a2f; color: #888; box-shadow: none; }

      .err {
        margin-top: 10px; padding: 8px 10px;
        background: rgba(248,113,113,0.1);
        border: 1px solid rgba(248,113,113,0.25);
        color: #fca5a5; font-size: 11.5px;
        border-radius: 8px;
      }

      .auth-cta {
        margin-top: 10px; padding: 12px;
        background: #16161a;
        border: 1px solid #232328;
        border-radius: 12px;
        text-align: center;
      }
      .auth-cta p { margin: 0 0 8px; color: #aaa; font-size: 12px; line-height: 1.5; }
      .auth-cta button {
        width: 100%; padding: 10px;
        background: #f0f0f0; color: #0d0d0f;
        border: none; border-radius: 8px;
        font-weight: 700; font-size: 12.5px;
        cursor: pointer;
      }

      /* Dropdown panel for character/product picker */
      .picker-pop {
        position: absolute;
        top: calc(100% + 4px); left: 0; right: 0;
        background: #16161a;
        border: 1px solid #2a2a2f;
        border-radius: 10px;
        padding: 6px;
        max-height: 240px; overflow-y: auto;
        z-index: 10;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      }
      .picker-pop .empty { padding: 14px; text-align: center; color: #888; font-size: 11.5px; }
      .picker-tabs { display: flex; gap: 4px; margin-bottom: 6px; padding: 0 2px; }
      .picker-tabs button {
        flex: 1; padding: 5px; font-size: 11px; font-weight: 600;
        background: transparent; border: 1px solid transparent;
        color: #888; border-radius: 6px; cursor: pointer;
      }
      .picker-tabs button.active { background: #1f1f24; color: #f0f0f0; border-color: #2f2f35; }
      .picker-item {
        display: flex; align-items: center; gap: 8px; padding: 6px;
        border-radius: 8px; cursor: pointer; font-size: 12px;
      }
      .picker-item:hover { background: #1f1f24; }
      .picker-item .thumb {
        width: 28px; height: 28px; border-radius: 6px;
        background: #2a2a2f; flex-shrink: 0;
        background-size: cover; background-position: center;
      }
      .picker-item .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* Image overlay pill — injected on each img on the page. */
      .horpen-pill {
        position: absolute;
        bottom: 8px; left: 8px;
        background: linear-gradient(180deg, #c4ff3a, #94d100);
        color: #0d0d0f;
        border: none;
        font-weight: 700;
        font-size: 11.5px;
        padding: 5px 10px 5px 6px;
        border-radius: 999px;
        display: inline-flex; align-items: center; gap: 4px;
        cursor: pointer;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.18s, transform 0.18s, box-shadow 0.18s;
        z-index: 9999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        pointer-events: auto;
      }
      .horpen-pill .icon {
        width: 18px; height: 18px; border-radius: 50%;
        background: #0d0d0f;
        display: inline-flex; align-items: center; justify-content: center;
        color: #c4ff3a; font-size: 10px; font-weight: 800;
      }
      .horpen-wrap:hover .horpen-pill { opacity: 1; transform: translateY(0); }
      .horpen-pill:hover { box-shadow: 0 4px 14px rgba(196,255,58,0.4); }
    </style>
  `;

  // ── State ────────────────────────────────────────────────────────────
  const state = {
    authed: false,
    user: null,
    apiBase: "https://api.horpen.ai",
    image: null,           // { url, pageUrl }
    selected: null,        // { kind: "character" | "product", id, name, thumb }
    aspectRatio: "9:16",
    characters: [],
    products: [],
    listsLoaded: false,
    panelVisible: false,
    panelMounted: false,
  };

  // ── Floating panel ───────────────────────────────────────────────────
  let $panel = null;

  function mountPanel() {
    if (state.panelMounted) return;
    state.panelMounted = true;
    $panel = document.createElement("div");
    $panel.className = "panel";
    shadow.appendChild($panel);
    renderPanel();
    requestAnimationFrame(() => $panel.classList.add("visible"));
  }

  function showPanel() {
    mountPanel();
    state.panelVisible = true;
    if ($panel) {
      $panel.classList.remove("collapsed");
      $panel.classList.add("visible");
    }
    renderPanel();
  }

  function hidePanel() {
    if (!$panel) return;
    state.panelVisible = false;
    $panel.classList.remove("visible");
    setTimeout(() => {
      if (!state.panelVisible && $panel) {
        $panel.remove();
        $panel = null;
        state.panelMounted = false;
      }
    }, 250);
  }

  function renderPanel() {
    if (!$panel) return;
    const sel = state.selected;
    const ar = state.aspectRatio;

    const previewBg = state.image
      ? `<img src="${escapeAttr(state.image.url)}" alt="" /><span class="clear" id="hpn-clear">×</span>`
      : `<div class="placeholder"><div class="arrow">↑</div><span>Drag any image here<br/>or right-click → Recreate</span></div>`;

    if (!state.authed) {
      $panel.innerHTML = `
        ${headHtml()}
        <div class="body">
          <div class="title">Recreate Any Image</div>
          <div class="subtitle">Connect your Horpen account to recreate images with your trained characters or products.</div>
          <div class="auth-cta">
            <p>Open the extension popup to connect.</p>
            <button id="hpn-open-popup">Open popup</button>
          </div>
        </div>
      `;
      bindHead();
      $panel.querySelector("#hpn-open-popup")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "horpen_open_popup_hint" }).catch(() => {});
      });
      return;
    }

    $panel.innerHTML = `
      ${headHtml()}
      <div class="body">
        <div class="drop" id="hpn-drop">${previewBg}</div>
        <div class="title">Recreate Any Image</div>
        <div class="subtitle">Click the <strong>Recreate</strong> pill on any image, or right-click → Recreate with Horpen.</div>

        <div class="row">
          <div class="field" id="hpn-target-field">
            <div class="label">${sel?.kind === "product" ? "Product" : "Character"}</div>
            <div class="value">
              <span class="swatch"${sel?.thumb ? ` style="background-image:url('${escapeAttr(sel.thumb)}')"` : ""}></span>
              <span>${sel ? escapeHtml(sel.name) : "None"}</span>
            </div>
            <span class="chev">▾</span>
          </div>

          <div class="field" id="hpn-aspect-field">
            <div class="label">Aspect ratio</div>
            <div class="value">${escapeHtml(ar)}</div>
            <span class="chev">▾</span>
          </div>
        </div>

        <button class="generate" id="hpn-generate" ${!state.image ? "disabled" : ""}>
          ✦ Generate
        </button>

        <div id="hpn-error"></div>
      </div>
    `;

    bindHead();
    $panel.querySelector("#hpn-clear")?.addEventListener("click", (e) => { e.stopPropagation(); state.image = null; renderPanel(); });
    $panel.querySelector("#hpn-drop")?.addEventListener("click", () => openImageFilePicker());
    $panel.querySelector("#hpn-target-field")?.addEventListener("click", openTargetPicker);
    $panel.querySelector("#hpn-aspect-field")?.addEventListener("click", openAspectPicker);
    $panel.querySelector("#hpn-generate")?.addEventListener("click", handleGenerate);

    setupDragDrop($panel.querySelector("#hpn-drop"));
  }

  function headHtml() {
    return `
      <div class="head">
        <div class="brand">
          <span class="dot">H</span>
          <span>Horpen</span>
        </div>
        <div class="actions">
          <button class="icon-btn" id="hpn-collapse" title="Collapse">—</button>
          <button class="icon-btn" id="hpn-close" title="Close">×</button>
        </div>
      </div>
    `;
  }

  function bindHead() {
    $panel.querySelector("#hpn-close")?.addEventListener("click", hidePanel);
    $panel.querySelector("#hpn-collapse")?.addEventListener("click", () => {
      $panel.classList.toggle("collapsed");
    });
  }

  // ── Pickers ────────────────────────────────────────────────────────
  function openTargetPicker() {
    const field = $panel.querySelector("#hpn-target-field");
    if (!field) return;
    const existing = field.querySelector(".picker-pop");
    if (existing) { existing.remove(); return; }

    const pop = document.createElement("div");
    pop.className = "picker-pop";
    pop.innerHTML = `
      <div class="picker-tabs">
        <button class="active" data-kind="character">Characters</button>
        <button data-kind="product">Products</button>
      </div>
      <div id="hpn-pick-list"></div>
    `;
    field.appendChild(pop);

    const renderList = (kind) => {
      const list = kind === "product" ? state.products : state.characters;
      const $list = pop.querySelector("#hpn-pick-list");
      pop.querySelectorAll(".picker-tabs button").forEach((b) => {
        b.classList.toggle("active", b.dataset.kind === kind);
      });
      if (!list.length) {
        $list.innerHTML = `<div class="empty">No ${kind === "product" ? "products" : "characters"} trained yet.<br/>Train one on horpen.ai.</div>`;
        return;
      }
      $list.innerHTML = list.map((item) => `
        <div class="picker-item" data-kind="${kind}" data-id="${escapeAttr(item.id)}">
          <span class="thumb"${item.thumb ? ` style="background-image:url('${escapeAttr(item.thumb)}')"` : ""}></span>
          <span class="name">${escapeHtml(item.name)}</span>
        </div>
      `).join("");
      $list.querySelectorAll(".picker-item").forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.dataset.id;
          const item = list.find((x) => x.id === id);
          if (!item) return;
          state.selected = { kind, id, name: item.name, thumb: item.thumb };
          renderPanel();
        });
      });
    };

    renderList(state.selected?.kind === "product" ? "product" : "character");
    pop.querySelectorAll(".picker-tabs button").forEach((b) => {
      b.addEventListener("click", (e) => { e.stopPropagation(); renderList(b.dataset.kind); });
    });

    // Lazy-fetch the lists if we haven't already.
    if (!state.listsLoaded) loadLists();

    // Click outside closes.
    setTimeout(() => {
      const onDocClick = (e) => {
        if (!field.contains(e.target)) {
          pop.remove();
          document.removeEventListener("click", onDocClick, true);
        }
      };
      document.addEventListener("click", onDocClick, true);
    }, 0);
  }

  function openAspectPicker() {
    const field = $panel.querySelector("#hpn-aspect-field");
    if (!field) return;
    const existing = field.querySelector(".picker-pop");
    if (existing) { existing.remove(); return; }

    const ratios = ["1:1", "9:16", "16:9", "3:4", "4:3", "2:3", "3:2"];
    const pop = document.createElement("div");
    pop.className = "picker-pop";
    pop.innerHTML = ratios.map((r) => `<div class="picker-item" data-r="${r}"><span class="name">${r}</span></div>`).join("");
    field.appendChild(pop);
    pop.querySelectorAll(".picker-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        state.aspectRatio = el.dataset.r;
        pop.remove();
        renderPanel();
      });
    });
    setTimeout(() => {
      const onDocClick = (e) => {
        if (!field.contains(e.target)) {
          pop.remove();
          document.removeEventListener("click", onDocClick, true);
        }
      };
      document.addEventListener("click", onDocClick, true);
    }, 0);
  }

  // ── API calls ──────────────────────────────────────────────────────
  async function api(path, options) {
    const res = await chrome.runtime.sendMessage({ type: "horpen_api", path, options });
    if (!res) throw new Error("No response from background.");
    if (!res.ok) throw new Error(res.error || "API error");
    return res.data;
  }

  async function checkAuth() {
    try {
      const status = await chrome.runtime.sendMessage({ type: "horpen_auth_status" });
      state.authed = Boolean(status?.authed);
      state.user = status?.user || null;
      state.apiBase = status?.apiBase || state.apiBase;
    } catch {
      state.authed = false;
    }
  }

  async function loadLists() {
    state.listsLoaded = true;
    try {
      const [avatars, products] = await Promise.all([
        api("/avatar/avatars").catch(() => null),
        api("/ads/products").catch(() => null),
      ]);
      state.characters = (avatars || []).map((a) => ({
        id: a.id,
        name: a.name || a.character_name || "Unnamed",
        thumb: a.thumbnail_url || a.preview_url || a.image_url || "",
      }));
      state.products = (products || []).map((p) => ({
        id: p.id,
        name: p.name || "Product",
        thumb: p.thumbnail_url || p.preview_url || (p.photos?.[0]?.url) || "",
      }));
      renderPanel();
    } catch (err) {
      console.warn("loadLists failed:", err);
    }
  }

  async function handleGenerate() {
    const $err = $panel.querySelector("#hpn-error");
    const $btn = $panel.querySelector("#hpn-generate");
    if (!state.image) return;
    $err.innerHTML = "";
    $btn.disabled = true;
    $btn.innerHTML = `<span class="spin" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(13,13,15,0.4);border-top-color:#0d0d0f;border-radius:50%;animation:spin 0.7s linear infinite"></span> Generating…`;

    try {
      const fd = new FormData();
      fd.append("source_image_url", state.image.url);
      fd.append("aspect_ratio", state.aspectRatio);
      if (state.selected?.kind === "character") fd.append("character_id", state.selected.id);
      if (state.selected?.kind === "product") fd.append("product_id", state.selected.id);
      if (state.image.pageUrl) fd.append("source_page_url", state.image.pageUrl);

      const data = await api("/extension/recreate", { method: "POST", body: fd });
      if (data?.image_url) {
        state.image = { url: data.image_url, pageUrl: state.image.pageUrl };
        renderPanel();
      } else {
        throw new Error("Empty response");
      }
    } catch (err) {
      $err.innerHTML = `<div class="err">${escapeHtml(err.message || "Generation failed")}</div>`;
      $btn.disabled = false;
      $btn.innerHTML = "✦ Generate";
    }
  }

  // ── Drag-drop + paste on the drop zone ───────────────────────────────
  function setupDragDrop(zone) {
    if (!zone) return;
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag");
      // Prefer URL drag (image dragged from page)
      const url = e.dataTransfer?.getData("text/uri-list") || e.dataTransfer?.getData("text/plain");
      if (url && /^https?:\/\//.test(url)) {
        state.image = { url, pageUrl: location.href };
        renderPanel();
        return;
      }
      // Fallback: file drag (uploaded to a data URL)
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          state.image = { url: reader.result, pageUrl: location.href };
          renderPanel();
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function openImageFilePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.image = { url: reader.result, pageUrl: location.href };
        renderPanel();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // ── Per-image "Recreate" pill injection ─────────────────────────────
  // Wraps each <img> in a relative-positioned wrapper so the pill can be
  // absolutely positioned without breaking the page's existing layout.
  // IntersectionObserver is way cheaper than scanning the whole DOM —
  // we only attach pills to images the user actually scrolls into.
  const seenImages = new WeakSet();
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(handleVisible, { rootMargin: "200px" })
    : null;

  function shouldDecorate(img) {
    if (!img || seenImages.has(img)) return false;
    if (img.closest(`#${HOST_ID}`)) return false;     // our own widget
    if (img.closest(".horpen-wrap")) return false;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w && h && (w < MIN_IMG_SIZE || h < MIN_IMG_SIZE)) return false;
    // Skip data: and blob: that aren't useful as references
    const src = img.currentSrc || img.src || "";
    if (!src) return false;
    if (src.startsWith("data:") && src.length < 200) return false;
    return true;
  }

  function decorateImage(img) {
    if (!shouldDecorate(img)) return;
    seenImages.add(img);

    // Wrap the img in a relative container so we can absolutely position
    // the pill on top, without changing the img's own positioning.
    const parent = img.parentElement;
    if (!parent) return;
    let wrap;
    const cs = getComputedStyle(parent);
    if (cs.position !== "static" && parent.children.length === 1) {
      // Parent is already a positioned single-img container — reuse it.
      wrap = parent;
      wrap.classList.add("horpen-wrap");
    } else {
      wrap = document.createElement("span");
      wrap.className = "horpen-wrap";
      wrap.style.cssText = "position:relative;display:inline-block;line-height:0;";
      parent.insertBefore(wrap, img);
      wrap.appendChild(img);
    }

    const pill = document.createElement("button");
    pill.className = "horpen-pill";
    pill.innerHTML = `<span class="icon">H</span> Recreate`;
    // Inject the pill style by injecting a stylesheet once into the page
    // — this pill lives in light DOM (next to the img), not the shadow.
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = img.currentSrc || img.src;
      if (!url) return;
      state.image = { url, pageUrl: location.href };
      showPanel();
      renderPanel();
    });
    wrap.appendChild(pill);
  }

  // The pill class lives in light DOM (alongside the host page), not in
  // shadow, so it can position relative to the img wrapper. Inject one
  // <style> for those classes.
  const lightStyle = document.createElement("style");
  lightStyle.textContent = `
    .horpen-wrap { position: relative !important; }
    .horpen-pill {
      position: absolute !important;
      bottom: 8px !important;
      left: 8px !important;
      background: linear-gradient(180deg, #c4ff3a, #94d100) !important;
      color: #0d0d0f !important;
      border: none !important;
      font-weight: 700 !important;
      font-size: 11.5px !important;
      padding: 5px 10px 5px 6px !important;
      border-radius: 999px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
      cursor: pointer !important;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.18s, transform 0.18s, box-shadow 0.18s !important;
      z-index: 9999 !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
      pointer-events: auto !important;
      line-height: 1 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif !important;
    }
    .horpen-pill .icon {
      width: 18px; height: 18px; border-radius: 50%;
      background: #0d0d0f; color: #c4ff3a;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 800;
    }
    .horpen-wrap:hover .horpen-pill { opacity: 1 !important; transform: translateY(0) !important; }
    .horpen-pill:hover { box-shadow: 0 4px 14px rgba(196,255,58,0.4) !important; }
  `;
  document.documentElement.appendChild(lightStyle);

  function handleVisible(entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        decorateImage(entry.target);
        io.unobserve(entry.target);
      }
    }
  }

  function scanImages(root = document) {
    const imgs = root.querySelectorAll?.("img") || [];
    imgs.forEach((img) => {
      if (seenImages.has(img)) return;
      if (io && img.complete) {
        if (shouldDecorate(img)) decorateImage(img);
      } else if (io) {
        io.observe(img);
      } else {
        // No IO support — degrade to direct decoration, capped to first 50.
        decorateImage(img);
      }
    });
  }

  // Initial scan + watch for new nodes (Pinterest infinite scroll, etc.).
  scanImages();
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.tagName === "IMG") {
          if (io) io.observe(node);
          else decorateImage(node);
        } else {
          scanImages(node);
        }
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // ── Inbound messages from service worker ───────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "horpen_open_panel" && msg.imageUrl) {
      state.image = { url: msg.imageUrl, pageUrl: msg.pageUrl || location.href };
      showPanel();
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" })[c]);
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, "&#96;");
  }

  // ── Boot ───────────────────────────────────────────────────────────
  // Don't show the panel by default — only when the user triggers an
  // action (right-click image OR clicks a Recreate pill). Keeps us out
  // of the way on every page load.
  checkAuth();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.horpen_jwt) {
      checkAuth().then(() => {
        if (state.panelMounted) renderPanel();
      });
    }
  });
})();
