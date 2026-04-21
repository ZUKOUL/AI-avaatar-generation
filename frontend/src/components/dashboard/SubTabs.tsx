"use client";

/**
 * SubTabs — horizontal sub-navigation bar à la Foreplay Discovery.
 *
 * Affiche les sous-onglets d'un produit en haut de page, avec un
 * indicateur actif bleu et un survol doux. Conçu pour être plug-and-
 * play dans n'importe quelle page produit du dashboard (Canvas,
 * Avatar, Spyder, Adlab, Thumbs, Autoclip).
 *
 * Usage :
 *   <SubTabs
 *     items={[
 *       { key: "video", label: "Vidéo", icon: VideoCamera },
 *       { key: "image", label: "Image", icon: ImageSquare, count: 12 },
 *     ]}
 *     active="video"
 *     onChange={setActive}
 *   />
 */

export interface SubTabItem {
  key: string;
  label: string;
  icon?: React.FC<{ size?: number; color?: string }>;
  count?: number;
}

export function SubTabs({
  items,
  active,
  onChange,
}: {
  items: SubTabItem[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 overflow-x-auto"
      style={{
        borderBottom: "1px solid var(--border-color, #ececec)",
        padding: "0 4px",
      }}
    >
      {items.map((it) => {
        const isActive = active === it.key;
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className="relative flex items-center gap-2 px-4 py-3 transition-colors whitespace-nowrap"
            style={{
              color: isActive ? "var(--text-primary, #0a0a0a)" : "var(--text-secondary, #6b7280)",
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = "var(--text-primary, #0a0a0a)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = "var(--text-secondary, #6b7280)";
            }}
          >
            {Icon && <Icon size={15} />}
            {it.label}
            {typeof it.count === "number" && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: isActive ? "#0a0a0a" : "var(--bg-hover, #f3f4f6)",
                  color: isActive ? "#ffffff" : "var(--text-secondary, #6b7280)",
                  minWidth: 20,
                  textAlign: "center",
                }}
              >
                {it.count}
              </span>
            )}
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: 10,
                  right: 10,
                  height: 2,
                  background: "#3b82f6",
                  borderRadius: "2px 2px 0 0",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
