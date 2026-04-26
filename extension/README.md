# Horpen — Chrome extension

Right-click any image on the web → **Recreate with Horpen** → pick one of
your trained characters or products → get a regenerated image with the
character's face / product's identity swapped in.

Same UX as Higgsfield: a green "Recreate" pill shows on hover at the
bottom-left of every reasonably large image, plus a floating panel
top-right with picker + Generate.

## File layout

```
extension/
├── manifest.json          v3, declares context menu + content script
├── service-worker.js      background: context menu, JWT bridge, API helper
├── content.js             content script: floating panel + image pills (Shadow DOM)
├── popup.html / popup.js / popup.css   small action popup (auth status)
└── icons/                 16 / 48 / 128 PNGs
```

## How it ships data

```
[user right-clicks an image on Pinterest]
        │
        ▼
service-worker.js  ──── chrome.tabs.sendMessage ────►  content.js
                       (image URL, page URL)              │
                                                          ▼
                                              shows the floating panel
                                              with the image preloaded
                                                          │
                                                  user picks a character
                                                          │
                                                          ▼
                                          POST /extension/recreate
                                              (multipart/form-data)
                                                          │
                                                          ▼
                                            Gemini 3 Pro Image runs:
                                            source as composition ref +
                                            character refs as identity lock
                                                          │
                                                          ▼
                                          panel swaps in the result
```

## Auth flow

The extension can't read horpen.ai's localStorage directly (cross-origin),
so we use Chrome's `externally_connectable` to receive the JWT from a
trusted page (`/dashboard/extension-connect`):

1. Popup shows **Connect to Horpen** when no JWT in `chrome.storage.local`.
2. Click → opens `https://horpen.ai/dashboard/extension-connect` in a new tab.
3. The page reads its own JWT from `localStorage["horpen_token"]` and posts it
   via `chrome.runtime.sendMessage(EXT_ID, { type: "horpen_connect", jwt, user })`.
4. Service worker stores it; popup re-renders as connected.

> **Important:** during development, you must paste the dev extension ID
> into `HORPEN_EXTENSION_IDS` in `frontend/src/app/dashboard/extension-connect/page.tsx`.
> Get it from `chrome://extensions` after loading the extension unpacked.
> Once published to the Chrome Web Store, the prod ID is stable and
> ships in the same array.

## Local development

### 1. Install in Chrome

```
chrome://extensions
  → toggle "Developer mode" on (top-right)
  → click "Load unpacked"
  → select the `extension/` folder
```

Pin the extension in the toolbar (puzzle icon → pin Horpen).

### 2. Wire the dev ID

Copy the long random ID Chrome shows for the extension on
`chrome://extensions` (looks like `abcdefghijklmnopabcdefghijklmnop`)
and paste it into:

```ts
// frontend/src/app/dashboard/extension-connect/page.tsx
const HORPEN_EXTENSION_IDS: string[] = [
  "abcdefghijklmnopabcdefghijklmnop",  // ← paste here
];
```

Restart the Next.js dev server.

### 3. Connect

Open the popup → Connect to Horpen → tab opens → click Connect.

### 4. Use it

Browse Pinterest / Instagram / any image-heavy site:

- Hover any image → green Recreate pill appears bottom-left.
- Click → panel slides in top-right with the image pre-loaded.
- OR right-click an image → **Recreate with Horpen** in the context menu.
- Pick a Character or Product, hit Generate.

The result lands in the panel and in `/dashboard/avatars` (history).

## Backend contract

| Endpoint | Method | Purpose |
|---|---|---|
| `/extension/me` | GET | Auth-check + profile snapshot for the popup |
| `/extension/recreate` | POST | Recreate an image, optionally with character/product injection |

Costs `CREDIT_COST_EXTENSION_RECREATE` per generation (= 2 × CREDIT_COST_IMAGE = 10 credits).

CORS is wired with `allow_origin_regex=r"chrome-extension://[a-z]+"` so
both dev and prod IDs Just Work.

## Publishing to the Chrome Web Store

1. Bump `version` in `manifest.json`.
2. Zip the `extension/` folder (skip `README.md` and `.DS_Store`).
3. Upload to the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole).
4. Justify `<all_urls>` in the privacy form ("inject a Recreate button on images
   any user might want to remix — Pinterest, Instagram, ad libraries, etc.").
5. Add a privacy policy URL: `https://horpen.ai/privacy-extension`.
6. First review takes 1-3 weeks. Subsequent updates are usually <48h.
