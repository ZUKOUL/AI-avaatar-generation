"use client";

/**
 * Sidebar — dark, product-centric, inspired by modern SaaS dashboards.
 *
 * Layout :
 *   - Header     : Horpen logo + collapse toggle
 *   - Products   : single horizontal row of 6 product 3D tiles
 *   - Active pill: small chip below the tiles with the active product
 *                  name and its keyboard shortcut
 *   - Main nav   : Home / Search / Starred (compact rows)
 *   - Upgrade    : subtle trial/upgrade card
 *   - Bottom     : user button → UserMenuPopover → SettingsModal
 *
 * The whole sidebar is always dark regardless of app theme. A radial
 * gradient tint based on the active product colour washes the header
 * area so the bar breathes colour as you navigate.
 *
 * Keyboard shortcuts : ⌘/Ctrl + S/C/A/D/T/L jumps to each product.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getStoredUser } from "@/lib/auth";
import Logo from "@/components/Logo";
import { SettingsModal, UserMenuPopover } from "@/components/settings";
import NewAppWizard from "@/components/NewAppWizard";
import {
  workspacesAPI,
  miniAppsAPI,
  avatarAPI,
  WORKSPACE_STORAGE_KEY,
  type Workspace,
  type MiniApp,
} from "@/lib/api";
import {
  PRODUCTS,
  Product3DLogo,
  ProductSlug,
  PRODUCT_APP_ROUTES,
} from "@/components/landing/shared";
import { House, Search, Star, XIcon, Plus } from "@/components/Icons";

/* Collapse toggle glyph. */
function PanelToggleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <line x1="6" y1="3" x2="6" y2="13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Arc-style Spaces + Pinned Tabs.
   Data persists in localStorage so the user's workspace survives
   reloads and logins. Each space has its own colored dot in the
   bottom switcher and its own tab list.
   ═══════════════════════════════════════════════════════════════════ */

interface SidebarTab {
  id: string;
  url: string;
  label: string;
  favicon: string;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Short "2m / 4h / 3d" style relative time for the Recent feed. */
function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return "now";
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} j`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} sem`;
    const months = Math.floor(days / 30);
    return `${months} mois`;
  } catch {
    return "";
  }
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconFor(url: string): string {
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/** Turn whatever the user typed into a usable URL:
 *   - "horpen.ai"     → https://horpen.ai
 *   - "/dashboard/x"  → internal link
 *   - "hello world"   → Google search
 *   - full URL        → passthrough
 */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.includes(".") && !trimmed.includes(" ")) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

/* ─── Single tab row ────────────────────────────────────────────── */

function TabRow({ tab, onRemove }: { tab: SidebarTab; onRemove: () => void }) {
  const [hover, setHover] = useState(false);
  const internal = tab.url.startsWith("/");

  const content = (
    <>
      <img
        src={tab.favicon}
        alt=""
        width={16}
        height={16}
        style={{ borderRadius: 4, flexShrink: 0 }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: "#e5e7eb",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {tab.label}
      </span>
      {hover && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          title="Retirer cet onglet"
          style={{
            color: "#6b7280",
            padding: 2,
            borderRadius: 4,
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "#f87171";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#6b7280";
          }}
        >
          <XIcon size={11} />
        </button>
      )}
    </>
  );

  const className = "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors";

  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    setHover(true);
    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    setHover(false);
    e.currentTarget.style.background = "transparent";
  };

  if (internal) {
    return (
      <Link
        href={tab.url}
        className={className}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {content}
      </Link>
    );
  }
  return (
    <a
      href={tab.url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {content}
    </a>
  );
}

/* ─── "+ New Tab" command palette modal ─────────────────────────── */

/**
 * NewTabModal — app picker + free-text URL input.
 *
 * Shows the 6 native Horpen apps and all of the user's mini-apps in a
 * clickable grid, plus a search input at the top that filters both
 * the grid AND serves as a fallback "open a URL / Google search" entry
 * when the text doesn't match anything.
 */
function NewTabModal({
  onClose,
  onAdd,
  miniApps,
}: {
  onClose: () => void;
  onAdd: (url: string, label: string, favicon?: string) => void;
  miniApps: MiniApp[];
}) {
  const [input, setInput] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Flatten all pickable entries : native products + mini-apps.
  type PickerEntry = {
    key: string;
    label: string;
    url: string;
    kind: "native" | "mini";
    logoUrl?: string;
    accent?: string;
    product?: typeof PRODUCTS[number];
  };
  const entries: PickerEntry[] = [
    ...PRODUCTS.map<PickerEntry>((p) => ({
      key: `native-${p.slug}`,
      label: p.name,
      url: PRODUCT_APP_ROUTES[p.slug].href,
      kind: "native",
      product: p,
      accent: p.color,
    })),
    ...miniApps.map<PickerEntry>((a) => ({
      key: `mini-${a.id}`,
      label: a.name,
      url: `/dashboard/apps/${a.slug}`,
      kind: "mini",
      logoUrl: a.logo_url,
      accent: a.accent,
    })),
  ];

  const query = input.trim().toLowerCase();
  const filtered = query
    ? entries.filter((e) => e.label.toLowerCase().includes(query))
    : entries;

  // When the input looks like a URL or a search, we offer it as an
  // extra "action" at the top of the list.
  const trimmed = input.trim();
  const hasFreeText = trimmed.length > 0;
  const normalizedFreeText = hasFreeText ? normalizeUrl(trimmed) : "";

  const addEntry = (entry: PickerEntry) => {
    onAdd(
      entry.url,
      entry.label,
      entry.logoUrl || (entry.kind === "native" ? undefined : undefined)
    );
  };

  const submitFreeText = () => {
    if (!trimmed) return;
    const url = normalizeUrl(trimmed);
    const label = extractDomain(url) || trimmed.slice(0, 32);
    onAdd(url, label, faviconFor(url));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] px-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "rgba(15,15,25,0.98)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 40px 80px -20px rgba(0,0,0,0.8)",
          width: "min(620px, 100%)",
          maxHeight: "70vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#9ca3af",
            padding: "14px 20px 6px",
          }}
        >
          Nouvel onglet
        </div>
        <input
          autoFocus
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Prefer the first filtered match, otherwise free text.
              if (filtered.length > 0) {
                addEntry(filtered[0]);
              } else {
                submitFreeText();
              }
            }
          }}
          placeholder="Filtre tes apps, ou colle une URL / tape une recherche…"
          style={{
            width: "100%",
            padding: "10px 20px 14px",
            background: "transparent",
            border: "none",
            color: "#ffffff",
            fontSize: 16,
            outline: "none",
            fontWeight: 500,
          }}
        />

        {/* Body — scrollable app grid + free-text fallback */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Free-text action row (only when user typed something
              that looks like a URL / search) */}
          {hasFreeText && (
            <button
              onClick={submitFreeText}
              className="w-full flex items-center gap-3 px-5 py-3 transition-colors"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                color: "#e5e7eb",
                textAlign: "left",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <img
                src={faviconFor(normalizedFreeText)}
                alt=""
                width={18}
                height={18}
                style={{ borderRadius: 4, flexShrink: 0 }}
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                  {normalizedFreeText.startsWith("https://www.google.com/search")
                    ? `Rechercher "${trimmed}" sur Google`
                    : `Ouvrir ${extractDomain(normalizedFreeText)}`}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {normalizedFreeText}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#6b7280",
                  flexShrink: 0,
                }}
              >
                URL
              </span>
            </button>
          )}

          {/* Apps section */}
          {filtered.length > 0 && (
            <div className="px-2 py-3">
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#6b7280",
                  padding: "4px 12px 10px",
                }}
              >
                Tes apps Horpen
              </div>
              <div className="grid grid-cols-2 gap-1">
                {filtered.map((entry) => (
                  <button
                    key={entry.key}
                    onClick={() => addEntry(entry)}
                    className="flex items-center gap-3 p-2.5 rounded-lg transition-colors text-left"
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.04)",
                      color: "#e5e7eb",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {entry.kind === "native" && entry.product ? (
                      <Product3DLogo product={entry.product} size={28} glow={false} />
                    ) : entry.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.logoUrl}
                        alt=""
                        width={28}
                        height={28}
                        style={{ borderRadius: 6, flexShrink: 0, objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: `linear-gradient(135deg, ${entry.accent || "#3b82f6"}, ${entry.accent || "#3b82f6"}55)`,
                          border: `1px solid ${entry.accent || "#3b82f6"}aa`,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
                        {entry.kind === "native" ? "App native" : "Mini-app"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && !hasFreeText && (
            <div
              style={{
                padding: "28px 20px",
                textAlign: "center",
                color: "#6b7280",
                fontSize: 13,
              }}
            >
              Aucune app. Crée ta première mini-app avec le bouton “+” à côté de Search.
            </div>
          )}
        </div>

        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11,
            color: "#6b7280",
          }}
        >
          Entrée pour ajouter le premier résultat · Échap pour annuler
        </div>
      </div>
    </div>
  );
}

interface SidebarProps {
  open: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function Sidebar({ open, onClose, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const user = typeof window !== "undefined" ? getStoredUser() : null;
  const [isMobile, setIsMobile] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hovered, setHovered] = useState<ProductSlug | null>(null);
  /** When collapsed, hovering the top-left Horpen logo swaps it for a
   *  clickable "expand sidebar" toggle icon. Reverts on mouse leave. */
  const [logoHover, setLogoHover] = useState(false);

  /** Workspaces from the backend (personal isolated spaces). */
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>("");
  const [tabsByWorkspace, setTabsByWorkspace] = useState<Record<string, SidebarTab[]>>({});
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [newAppOpen, setNewAppOpen] = useState(false);
  const [miniApps, setMiniApps] = useState<MiniApp[]>([]);

  /** Folders — organisational groups for pinned tabs, Foreplay-style.
   *  A folder is a labeled section header; tabs can carry a folder_id
   *  and get rendered under the matching group. Persists in
   *  localStorage keyed by workspace_id so each workspace has its
   *  own folder tree. */
  const [foldersByWorkspace, setFoldersByWorkspace] = useState<
    Record<string, { id: string; name: string }[]>
  >({});
  const [navPlusOpen, setNavPlusOpen] = useState(false);

  /** Recent creations — the last few images / avatars the user made
   *  in the active workspace. Auto-populated from the backend so the
   *  sidebar fills with real content instead of static links. */
  type RecentItem = {
    id: string;
    kind: "image" | "avatar";
    thumbnail?: string;
    label: string;
    created_at: string;
    href: string;
  };
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  /* Hydrate workspaces + mini-apps + recents from backend on mount. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [wsRes, appsRes, imagesRes, avatarsRes] = await Promise.all([
          workspacesAPI.list(),
          miniAppsAPI.list().catch(() => ({ data: [] as MiniApp[] })),
          avatarAPI.getImages(undefined, 5).catch(() => ({ data: { images: [] } })),
          avatarAPI.list().catch(() => ({ data: { avatars: [] } })),
        ]);
        if (cancelled) return;
        const ws = wsRes.data || [];
        setWorkspaces(ws);
        setMiniApps(appsRes.data || []);

        // Merge recent creations from both image + avatar endpoints
        // and sort by date desc so the sidebar always shows what the
        // user just made.
        const images = (imagesRes.data as { images?: { image_id: string; image_url: string; prompt?: string; created_at: string }[] })?.images || [];
        const avatars = (avatarsRes.data as { avatars?: { avatar_id: string; name: string; thumbnail?: string; created_at: string }[] })?.avatars || [];
        const merged: RecentItem[] = [
          ...images.slice(0, 5).map((i) => ({
            id: i.image_id,
            kind: "image" as const,
            thumbnail: i.image_url,
            label: (i.prompt || "Image").slice(0, 32),
            created_at: i.created_at,
            href: "/dashboard/images",
          })),
          ...avatars.slice(0, 5).map((a) => ({
            id: a.avatar_id,
            kind: "avatar" as const,
            thumbnail: a.thumbnail,
            label: a.name || "Avatar",
            created_at: a.created_at,
            href: "/dashboard/avatars",
          })),
        ];
        merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setRecentItems(merged.slice(0, 6));

        const storedActive = localStorage.getItem(WORKSPACE_STORAGE_KEY);
        const resolved =
          storedActive && ws.find((w) => w.id === storedActive)
            ? storedActive
            : ws[0]?.id ?? "";
        setActiveSpaceId(resolved);
        if (resolved) localStorage.setItem(WORKSPACE_STORAGE_KEY, resolved);
      } catch {
        /* backend unreachable — stay silent, the user can still navigate */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Hydrate pinned tabs (kept purely client-side, scoped per workspace). */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("horpen-workspace-tabs-v1");
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, SidebarTab[]>;
        if (parsed && typeof parsed === "object") setTabsByWorkspace(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "horpen-workspace-tabs-v1",
        JSON.stringify(tabsByWorkspace)
      );
    } catch {
      /* ignore */
    }
  }, [tabsByWorkspace]);

  /* Hydrate + persist folders (local-only, same pattern as tabs). */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("horpen-workspace-folders-v1");
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, { id: string; name: string }[]>;
        if (parsed && typeof parsed === "object") setFoldersByWorkspace(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "horpen-workspace-folders-v1",
        JSON.stringify(foldersByWorkspace)
      );
    } catch {
      /* ignore */
    }
  }, [foldersByWorkspace]);

  const activeFolders = foldersByWorkspace[activeSpaceId || "local"] ?? [];

  /** Key under which folders + tabs are persisted for the current
   *  context. When a workspace is loaded we use its UUID ; otherwise
   *  we fall back to "local" so folder creation still works for
   *  anonymous / fresh-session users. */
  const persistKey = activeSpaceId || "local";

  const createFolder = () => {
    // Close the popover first so the prompt isn't visually fighting it.
    setNavPlusOpen(false);
    const name = window.prompt("Nom du dossier :");
    if (!name || !name.trim()) return;
    const newFolder = { id: randomId(), name: name.trim() };
    setFoldersByWorkspace((prev) => ({
      ...prev,
      [persistKey]: [...(prev[persistKey] ?? []), newFolder],
    }));
  };

  const deleteFolder = (folderId: string) => {
    if (!window.confirm("Supprimer ce dossier ?")) return;
    setFoldersByWorkspace((prev) => ({
      ...prev,
      [persistKey]: (prev[persistKey] ?? []).filter((f) => f.id !== folderId),
    }));
  };

  const activeSpace = workspaces.find((w) => w.id === activeSpaceId);
  const activeTabs = tabsByWorkspace[activeSpaceId || "local"] ?? [];

  const addTabToActiveSpace = (url: string, label: string, favicon?: string) => {
    const key = activeSpaceId || "local";
    const newTab: SidebarTab = {
      id: randomId(),
      url,
      label,
      favicon: favicon ?? faviconFor(url),
    };
    setTabsByWorkspace((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), newTab],
    }));
    setNewTabOpen(false);
  };

  const removeTab = (tabId: string) => {
    const key = activeSpaceId || "local";
    setTabsByWorkspace((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((t) => t.id !== tabId),
    }));
  };

  /** Switch workspace = persist + hard reload so every data query
   *  refetches with the new X-Workspace-Id header. This is the
   *  simplest path to guaranteed isolation (no stale React Query
   *  cache bleeding data between workspaces). */
  const switchWorkspace = (id: string) => {
    if (id === activeSpaceId) return;
    localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
    window.location.reload();
  };

  const createSpace = async () => {
    const name = window.prompt("Nom du nouvel espace :");
    if (!name || !name.trim()) return;
    try {
      const res = await workspacesAPI.create(name.trim());
      const created = res.data;
      setWorkspaces((prev) => [...prev, created]);
      // Switch into it immediately (hard reload gives a clean slate).
      localStorage.setItem(WORKSPACE_STORAGE_KEY, created.id);
      window.location.reload();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Impossible de créer le workspace.";
      window.alert(message);
    }
  };

  const renameWorkspace = async (id: string) => {
    const current = workspaces.find((w) => w.id === id);
    if (!current) return;
    const name = window.prompt("Renommer l'espace :", current.name);
    if (!name || !name.trim() || name.trim() === current.name) return;
    try {
      const res = await workspacesAPI.update(id, { name: name.trim() });
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? res.data : w)));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Impossible de renommer le workspace.";
      window.alert(message);
    }
  };

  const deleteWorkspace = async (id: string) => {
    const target = workspaces.find((w) => w.id === id);
    if (!target) return;
    if (target.is_primary) {
      window.alert("Tu ne peux pas supprimer ton espace principal.");
      return;
    }
    if (!window.confirm(`Supprimer l'espace "${target.name}" et toutes ses créations ?`)) {
      return;
    }
    try {
      await workspacesAPI.delete(id);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      // If the deleted workspace was active, fall back to primary +
      // reload so the data refreshes.
      if (id === activeSpaceId) {
        const fallback = workspaces.find((w) => w.id !== id);
        if (fallback) {
          localStorage.setItem(WORKSPACE_STORAGE_KEY, fallback.id);
          window.location.reload();
        }
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Impossible de supprimer le workspace.";
      window.alert(message);
    }
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close drawer on navigation (mobile).
  useEffect(() => {
    if (isMobile && onClose) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);



  // Active product detection checks every path that counts as
  // "belonging" to a product (Canvas = /videos + /images, Avatar =
  // /avatars + /characters, etc. — see PRODUCT_APP_ROUTES).
  const activeProduct = PRODUCTS.find((p) =>
    PRODUCT_APP_ROUTES[p.slug].paths.some((path) =>
      pathname === path || pathname?.startsWith(`${path}/`)
    )
  );
  const hoveredProduct = hovered
    ? PRODUCTS.find((p) => p.slug === hovered)
    : null;
  const shownProduct = hoveredProduct ?? activeProduct;
  const tintColor = shownProduct?.color ?? activeProduct?.color ?? "#3b82f6";

  const handleSidebarClick = () => {
    if (collapsed && onToggleCollapsed) onToggleCollapsed();
  };

  const NAV_ROWS: { href: string; label: string; icon: React.FC<{ size?: number }>; action?: () => void }[] = [
    { href: "/dashboard", label: "Home", icon: House },
    { href: "/dashboard/search", label: "Search…", icon: Search },
    { href: "/dashboard/starred", label: "Starred", icon: Star },
  ];

  const sidebarContent = (
    <>
      {/* ── Header ──
            Collapsed : Horpen logo crossfades on hover to a clickable
            toggle icon, so the user always has a one-click way to
            re-expand the sidebar even if they don't realise empty
            space also works. */}
      <div
        className="flex items-center px-4 h-14 shrink-0"
        style={{
          justifyContent: collapsed ? "center" : "space-between",
        }}
      >
        {!collapsed ? (
          <>
            <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
              <Logo size={26} />
              <span style={{ fontSize: 15, fontWeight: 600, color: "#f3f4f6", letterSpacing: "-0.01em" }}>
                Horpen
              </span>
            </Link>
            {!isMobile && onToggleCollapsed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapsed();
                }}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: "#6b7280" }}
                title="Collapse sidebar"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "#e5e7eb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#6b7280";
                }}
              >
                <PanelToggleIcon />
              </button>
            )}
            {isMobile && onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 rounded-md"
                style={{ color: "#6b7280" }}
              >
                <XIcon size={16} />
              </button>
            )}
          </>
        ) : (
          <div
            className="relative"
            style={{ width: 30, height: 30 }}
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
          >
            {/* Horpen logo (default) */}
            <Link
              href="/dashboard"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: logoHover && onToggleCollapsed ? 0 : 1,
                transition: "opacity 0.18s ease",
                pointerEvents: logoHover && onToggleCollapsed ? "none" : "auto",
              }}
            >
              <Logo size={26} />
            </Link>
            {/* Expand-sidebar toggle (appears on hover) */}
            {onToggleCollapsed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapsed();
                }}
                title="Ouvrir la sidebar"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.06)",
                  color: "#e5e7eb",
                  opacity: logoHover ? 1 : 0,
                  transition: "opacity 0.18s ease",
                  pointerEvents: logoHover ? "auto" : "none",
                  cursor: "pointer",
                }}
              >
                <PanelToggleIcon />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Product tiles : single horizontal row in expanded mode,
            stacked vertically when collapsed. Empty space between tiles
            intentionally lets clicks bubble up so the collapsed
            sidebar can reopen — interactive children stop propagation
            individually. ── */}
      <div className={collapsed ? "px-2 pb-3" : "px-4 pb-1"}>
        <div
          style={{
            display: "flex",
            flexDirection: collapsed ? "column" : "row",
            alignItems: "center",
            gap: collapsed ? 8 : 6,
            flexWrap: collapsed ? "nowrap" : "nowrap",
          }}
        >
          {PRODUCTS.map((p) => {
            const routes = PRODUCT_APP_ROUTES[p.slug];
            const isActive = routes.paths.some(
              (path) => pathname === path || pathname?.startsWith(`${path}/`)
            );
            return (
              <Link
                key={p.slug}
                href={routes.href}
                title={p.name}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setHovered(p.slug)}
                onMouseLeave={() => setHovered(null)}
                className="relative flex items-center justify-center rounded-xl transition-all"
                style={{
                  width: collapsed ? 40 : "100%",
                  aspectRatio: "1",
                  flex: collapsed ? undefined : "1 1 0",
                  background: isActive
                    ? `linear-gradient(145deg, ${p.color}30, ${p.color}10)`
                    : "rgba(255,255,255,0.02)",
                  border: isActive
                    ? `1.5px solid ${p.color}aa`
                    : "1px solid rgba(255,255,255,0.05)",
                  // Bigger colored halo — the chip below is gone so the
                  // glow is now the ONLY "you are here" indicator.
                  boxShadow: isActive
                    ? `0 0 28px 2px ${p.color}66, 0 0 10px ${p.color}80, inset 0 1px 0 rgba(255,255,255,0.12)`
                    : "none",
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "scale(0.96)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <Product3DLogo
                  product={p}
                  size={collapsed ? 28 : 30}
                  glow={false}
                />
              </Link>
            );
          })}
        </div>

        {/* Hovered-only chip — when a product is actually ACTIVE
            (user is on its page) we rely on the colored glow around
            the tile, no chip needed. The chip only surfaces on hover
            so unfamiliar logos stay discoverable. */}
        {!collapsed && hoveredProduct && (
          <div
            key={hoveredProduct.slug /* re-render per product to restart fade */}
            className="mt-3 mx-auto inline-flex items-center px-2.5 py-1.5 rounded-lg"
            style={{
              background: "rgba(15,15,20,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
              animation: "sidebar-chip-in 0.25s ease-out forwards",
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#f3f4f6", letterSpacing: "-0.01em" }}>
              {hoveredProduct.name}
            </span>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes sidebar-chip-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Main nav ── */}
      <nav
        className={collapsed ? "flex-1 overflow-y-auto px-2 py-2" : "flex-1 overflow-y-auto px-3 py-3"}
      >
        <div className="flex flex-col gap-0.5">
          {NAV_ROWS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            const isSearchRow = item.label === "Search…";
            const rowLink = (
              <Link
                href={item.href}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.action) {
                    e.preventDefault();
                    item.action();
                  }
                }}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors flex-1 min-w-0"
                style={{
                  color: isActive ? "#f3f4f6" : "#9ca3af",
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  justifyContent: collapsed ? "center" : "flex-start",
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.color = "#e5e7eb";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#9ca3af";
                  }
                }}
              >
                <Icon size={16} />
                {!collapsed && <span className="flex-1">{item.label}</span>}
              </Link>
            );

            // The Search row gets a trailing "+" button that opens a
            // popover to create folders / new tabs — Foreplay-style.
            if (isSearchRow && !collapsed) {
              return (
                <div
                  key={item.href}
                  className="flex items-center gap-1 relative"
                >
                  {rowLink}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNavPlusOpen((o) => !o);
                    }}
                    title="Créer"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: navPlusOpen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "#9ca3af",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.color = "#e5e7eb";
                    }}
                    onMouseLeave={(e) => {
                      if (!navPlusOpen) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                        e.currentTarget.style.color = "#9ca3af";
                      }
                    }}
                  >
                    <Plus size={13} />
                  </button>
                  {navPlusOpen && (
                    <div
                      onMouseLeave={() => setNavPlusOpen(false)}
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: 6,
                        zIndex: 60,
                        background: "rgba(15,15,25,0.98)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        padding: 4,
                        minWidth: 180,
                        boxShadow: "0 20px 40px -10px rgba(0,0,0,0.7)",
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          createFolder();
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 6,
                          background: "transparent",
                          color: "#e5e7eb",
                          fontSize: 13,
                          textAlign: "left",
                          border: "none",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          <line x1="12" y1="11" x2="12" y2="17" />
                          <line x1="9" y1="14" x2="15" y2="14" />
                        </svg>
                        Créer un dossier
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNavPlusOpen(false);
                          setNewTabOpen(true);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 6,
                          background: "transparent",
                          color: "#e5e7eb",
                          fontSize: 13,
                          textAlign: "left",
                          border: "none",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <Plus size={14} />
                        Nouvel onglet
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNavPlusOpen(false);
                          setNewAppOpen(true);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 6,
                          background: "transparent",
                          color: "#e5e7eb",
                          fontSize: 13,
                          textAlign: "left",
                          border: "none",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" rx="1.5" />
                          <rect x="14" y="3" width="7" height="7" rx="1.5" />
                          <rect x="3" y="14" width="7" height="7" rx="1.5" />
                          <path d="M17.5 14v7M14 17.5h7" />
                        </svg>
                        Nouvelle app
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            return <div key={item.href}>{rowLink}</div>;
          })}
        </div>
      </nav>

      {/* ── Récents : auto-populated feed of the last creations made
            in the active workspace. Each row has a real thumbnail so
            the sidebar has texture even on a fresh account. ── */}
      {!collapsed && recentItems.length > 0 && (
        <div className="px-2 pb-3">
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#6b7280",
              padding: "6px 10px 8px",
            }}
          >
            Récent
          </div>
          <div className="flex flex-col gap-0.5">
            {recentItems.map((item) => (
              <Link
                key={`${item.kind}-${item.id}`}
                href={item.href}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors"
                style={{ color: "#e5e7eb" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title={item.label}
              >
                {item.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnail}
                    alt=""
                    width={28}
                    height={28}
                    style={{
                      borderRadius: 6,
                      objectFit: "cover",
                      flexShrink: 0,
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#6b7280", marginTop: 1 }}>
                    {item.kind === "avatar" ? "Avatar" : "Image"} · {timeAgo(item.created_at)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Mes apps : user-created mini apps (New App wizard).
            Card-style rows so each app feels like a real shortcut
            instead of a plain nav link. ── */}
      {!collapsed && (
        <div className="px-2 pb-2">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#6b7280",
              }}
            >
              Mes Apps
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setNewAppOpen(true);
              }}
              className="p-1 rounded-md transition-colors"
              style={{ color: "#9ca3af", background: "transparent", border: "none", cursor: "pointer" }}
              title="Créer une nouvelle app"
              onMouseEnter={(e) => (e.currentTarget.style.color = "#e5e7eb")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {miniApps.map((app) => (
              <Link
                key={app.id}
                href={`/dashboard/apps/${app.slug}`}
                onClick={(e) => e.stopPropagation()}
                className="group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all"
                style={{
                  color: "#e5e7eb",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${app.accent}18, ${app.accent}06)`;
                  e.currentTarget.style.borderColor = `${app.accent}60`;
                  e.currentTarget.style.boxShadow = `0 0 16px ${app.accent}25`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                title={app.description ?? app.name}
              >
                {/* Accent color stripe on the left */}
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: app.accent,
                    opacity: 0.8,
                  }}
                />
                {app.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={app.logo_url}
                    alt=""
                    width={26}
                    height={26}
                    style={{
                      borderRadius: 7,
                      flexShrink: 0,
                      objectFit: "cover",
                      boxShadow: `0 2px 8px ${app.accent}50`,
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      background: `linear-gradient(135deg, ${app.accent}, ${app.accent}55)`,
                      border: `1px solid ${app.accent}aa`,
                      flexShrink: 0,
                      boxShadow: `0 2px 8px ${app.accent}50`,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "#ffffff",
                    }}
                  >
                    {app.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "#9ca3af",
                      marginTop: 1,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontWeight: 600,
                    }}
                  >
                    {app.tool}
                  </div>
                </div>
              </Link>
            ))}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setNewAppOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-2 py-2 rounded-lg transition-colors w-full"
              style={{
                color: "#6b7280",
                fontSize: 12.5,
                fontWeight: 500,
                background: "transparent",
                border: "1px dashed rgba(255,255,255,0.12)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                e.currentTarget.style.color = "#e5e7eb";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#6b7280";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }}
            >
              <Plus size={13} />
              <span>Créer une app</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Pinned tabs + folders (no workspace-related label here —
            workspace management lives exclusively in the bottom
            profile menu). ── */}
      {!collapsed && (activeTabs.length > 0 || activeFolders.length > 0) && (
        <div className="px-2 pb-2">
          <div className="flex flex-col gap-0.5">
            {activeTabs.map((tab) => (
              <TabRow key={tab.id} tab={tab} onRemove={() => removeTab(tab.id)} />
            ))}
            {activeFolders.map((folder) => (
              <div key={folder.id} className="mt-2">
                <div
                  className="flex items-center gap-2 px-2 py-1.5 group"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#6b7280",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {folder.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFolder(folder.id);
                    }}
                    style={{
                      padding: 2,
                      borderRadius: 4,
                      background: "transparent",
                      color: "#4b5563",
                      border: "none",
                      cursor: "pointer",
                    }}
                    title="Supprimer le dossier"
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Upgrade card ── */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <div
            className="rounded-xl p-3.5"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f3f4f6", marginBottom: 4 }}>
              Passe au plan supérieur
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.45, marginBottom: 12 }}>
              Plus de crédits, 4K, A/B tests illimités, toute la suite.
            </div>
            <Link
              href="/dashboard/credits"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg"
              style={{
                padding: "8px 10px",
                background: "#ffffff",
                color: "#0a0a0a",
                fontSize: 12.5,
                fontWeight: 600,
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
              Upgrade Horpen
            </Link>
          </div>
        </div>
      )}

      {/* ── User row ── */}
      <div
        className="shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {collapsed ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setUserMenuOpen(true);
            }}
            className="w-full h-14 flex items-center justify-center"
            title={user?.email ?? "Compte"}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold uppercase"
              style={{
                background: "linear-gradient(135deg, #3b82f6, #1e40af)",
                color: "#ffffff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
              }}
            >
              {user?.email?.charAt(0) || "?"}
            </div>
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setUserMenuOpen(true);
            }}
            className="w-full flex items-center justify-between px-3 h-14 transition-colors"
            style={{
              background: userMenuOpen ? "rgba(255,255,255,0.04)" : "transparent",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            onMouseLeave={(e) => {
              if (!userMenuOpen) e.currentTarget.style.background = "transparent";
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold uppercase shrink-0"
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #1e40af)",
                  color: "#ffffff",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                }}
              >
                {user?.email?.charAt(0) || "?"}
              </div>
              <div className="min-w-0 text-left">
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#f3f4f6",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.email?.split("@")[0] || "Utilisateur"}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.email || ""}
                </div>
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#6b7280", flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      <UserMenuPopover
        open={userMenuOpen}
        onClose={() => setUserMenuOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color }))}
        activeWorkspaceId={activeSpaceId}
        onSwitchWorkspace={(id) => {
          setUserMenuOpen(false);
          switchWorkspace(id);
        }}
        onCreateWorkspace={() => {
          setUserMenuOpen(false);
          createSpace();
        }}
        onRenameWorkspace={(id) => {
          setUserMenuOpen(false);
          renameWorkspace(id);
        }}
        onDeleteWorkspace={(id) => {
          setUserMenuOpen(false);
          deleteWorkspace(id);
        }}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {newTabOpen && (
        <NewTabModal
          onClose={() => setNewTabOpen(false)}
          onAdd={(url, label, favicon) => addTabToActiveSpace(url, label, favicon)}
          miniApps={miniApps}
        />
      )}
      {newAppOpen && (
        <NewAppWizard
          onClose={() => setNewAppOpen(false)}
          onCreated={(app) => {
            setMiniApps((prev) => [app, ...prev]);
            setNewAppOpen(false);
          }}
        />
      )}
    </>
  );

  // Dark theme + radial tint driven by the active / hovered product.
  const darkBg: React.CSSProperties = {
    background: `
      radial-gradient(140% 45% at 50% 0%, ${tintColor}1c 0%, transparent 55%),
      linear-gradient(180deg, #0a0b14 0%, #070810 50%, #040510 100%)
    `,
    color: "#e5e7eb",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    transition: "background 0.5s ease, width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  };

  if (isMobile) {
    return (
      <>
        {open && (
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
            onClick={onClose}
          />
        )}
        <aside
          className="fixed left-0 top-0 h-full z-50 flex flex-col"
          style={{
            width: "280px",
            transform: open ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            ...darkBg,
          }}
        >
          {sidebarContent}
        </aside>
      </>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full z-40 flex flex-col"
      style={{
        width: "var(--sidebar-width)",
        cursor: collapsed ? "pointer" : "default",
        ...darkBg,
      }}
      onClick={handleSidebarClick}
    >
      {sidebarContent}
    </aside>
  );
}
