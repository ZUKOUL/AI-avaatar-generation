"use client";

/**
 * Settings — modal plein-écran + UserMenuPopover.
 *
 * Pattern commun SaaS (Foreplay / Linear / Notion) :
 *   - Le user block en bas de Sidebar ouvre un UserMenuPopover
 *   - Le popover propose "Settings" → ouvre SettingsModal
 *   - SettingsModal = overlay avec sidebar gauche (groupes de
 *     sections) + contenu droite
 *
 * Toutes les sections sont dans ce fichier — compact à maintenir.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  XIcon,
  Check,
  Copy,
  Mail,
  User,
  CreditCard,
  Shield,
  Settings as SettingsIcon,
  SignOut,
  ArrowRight,
  SparkleIcon,
  Globe,
  Package,
} from "@/components/Icons";
import { clearAuth, getStoredUser } from "@/lib/auth";
import { creditsAPI } from "@/lib/api";

type SectionKey =
  | "account"
  | "plan"
  | "billing"
  | "referral"
  | "team"
  | "avatars"
  | "trackify"
  | "integrations";

interface SectionMeta {
  key: SectionKey;
  label: string;
  group: "account" | "workspace";
  icon: React.ElementType;
  locked?: boolean;
}

const SECTIONS: SectionMeta[] = [
  { key: "account", label: "My Account", group: "account", icon: User },
  { key: "plan", label: "Plan", group: "account", icon: Package },
  { key: "billing", label: "Billing", group: "account", icon: CreditCard },
  { key: "referral", label: "Referral", group: "account", icon: Globe },
  { key: "team", label: "Team", group: "workspace", icon: User },
  { key: "avatars", label: "Avatars", group: "workspace", icon: User },
  { key: "trackify", label: "Trackify Brands", group: "workspace", icon: Shield },
  { key: "integrations", label: "Integrations", group: "workspace", icon: SettingsIcon },
];

/* ═════════════════════════════════════════════════════════════════
   SETTINGS MODAL
   ═════════════════════════════════════════════════════════════════ */

export function SettingsModal({
  open,
  onClose,
  initialSection = "account",
}: {
  open: boolean;
  onClose: () => void;
  initialSection?: SectionKey;
}) {
  const [section, setSection] = useState<SectionKey>(initialSection);

  // Lock body scroll while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc closes modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
  };

  const accountSections = SECTIONS.filter((s) => s.group === "account");
  const workspaceSections = SECTIONS.filter((s) => s.group === "workspace");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(5,10,20,0.55)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full overflow-hidden flex flex-col md:flex-row"
        style={{
          maxWidth: 1040,
          height: "min(740px, 92vh)",
          background: "var(--bg-primary, #ffffff)",
          border: "1px solid var(--border-color, #ececec)",
          borderRadius: 16,
          boxShadow: "0 40px 80px -20px rgba(5,10,20,0.55), 0 16px 32px -8px rgba(5,10,20,0.25)",
        }}
      >
        {/* ── Sidebar ── */}
        <aside
          className="flex flex-col shrink-0"
          style={{
            width: 240,
            borderRight: "1px solid var(--border-color, #ececec)",
            background: "var(--bg-secondary, #fafafa)",
            padding: 16,
          }}
        >
          <div className="flex items-center gap-2 px-2 mb-7" style={{ height: 36 }}>
            <SettingsIcon size={16} style={{ color: "var(--text-secondary, #6b7280)" }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary, #0a0a0a)" }}>
              Settings
            </div>
          </div>

          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-tertiary, #9ca3af)",
              padding: "0 8px 6px",
            }}
          >
            Account
          </div>
          <nav className="flex flex-col gap-0.5 mb-4">
            {accountSections.map((s) => (
              <SectionLink
                key={s.key}
                active={section === s.key}
                onClick={() => setSection(s.key)}
                icon={s.icon}
                label={s.label}
              />
            ))}
          </nav>

          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-tertiary, #9ca3af)",
              padding: "0 8px 6px",
            }}
          >
            Workspace
          </div>
          <nav className="flex flex-col gap-0.5">
            {workspaceSections.map((s) => (
              <SectionLink
                key={s.key}
                active={section === s.key}
                onClick={() => setSection(s.key)}
                icon={s.icon}
                label={s.label}
              />
            ))}
          </nav>

          {/* Spacer + Log Out */}
          <div className="mt-auto pt-4">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors"
              style={{
                color: "var(--text-secondary, #6b7280)",
                border: "1px solid var(--border-color, #ececec)",
                background: "var(--bg-primary, #ffffff)",
                fontSize: 13.5,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover, #f3f4f6)";
                e.currentTarget.style.color = "var(--text-primary, #0a0a0a)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-primary, #ffffff)";
                e.currentTarget.style.color = "var(--text-secondary, #6b7280)";
              }}
            >
              <SignOut size={15} />
              Log Out
            </button>
          </div>
        </aside>

        {/* ── Content ── */}
        <div className="flex-1 relative overflow-auto">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary, #6b7280)" }}
            aria-label="Close"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover, #f3f4f6)";
              e.currentTarget.style.color = "var(--text-primary, #0a0a0a)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary, #6b7280)";
            }}
          >
            <XIcon size={18} />
          </button>

          <div className="p-8 md:p-10">
            {section === "account" && <AccountSection />}
            {section === "plan" && <PlanSection />}
            {section === "billing" && <BillingSection />}
            {section === "referral" && <ReferralSection />}
            {section === "team" && <TeamSection />}
            {section === "avatars" && <AvatarsSection />}
            {section === "trackify" && <TrackifySection />}
            {section === "integrations" && <IntegrationsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLink({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left"
      style={{
        background: active ? "var(--bg-primary, #ffffff)" : "transparent",
        border: active ? "1px solid var(--border-color, #ececec)" : "1px solid transparent",
        color: active ? "var(--text-primary, #0a0a0a)" : "var(--text-secondary, #6b7280)",
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        boxShadow: active ? "0 1px 2px rgba(15,15,40,0.04)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--bg-hover, #f3f4f6)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════════
   SECTIONS
   ═════════════════════════════════════════════════════════════════ */

function SectionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.025em", color: "var(--text-primary, #0a0a0a)" }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ marginTop: 6, color: "var(--text-secondary, #6b7280)", fontSize: 14, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
      <div className="mt-7">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  children,
  desc,
}: {
  label: string;
  children: React.ReactNode;
  desc?: string;
}) {
  return (
    <div
      className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-4"
      style={{ borderBottom: "1px solid var(--border-color, #ececec)" }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary, #0a0a0a)" }}>
          {label}
        </div>
        {desc && (
          <div style={{ fontSize: 12.5, color: "var(--text-secondary, #6b7280)", marginTop: 2, lineHeight: 1.4 }}>
            {desc}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function AccountSection() {
  const user = typeof window !== "undefined" ? getStoredUser() : null;
  return (
    <SectionShell
      title="My Account"
      subtitle="Manage your profile information and preferences."
    >
      <div className="flex items-center gap-4 mb-8">
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #1e40af)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 24,
            fontWeight: 600,
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {user?.email?.charAt(0) || "?"}
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary, #0a0a0a)" }}>
            {user?.email?.split("@")[0] || "Utilisateur"}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)" }}>
            {user?.email || ""}
          </div>
        </div>
      </div>

      <SettingRow
        label="Email"
        desc="L'adresse utilisée pour te connecter et recevoir les notifications."
      >
        <div style={{ fontSize: 14, color: "var(--text-secondary, #6b7280)" }}>
          {user?.email || "—"}
        </div>
      </SettingRow>

      <SettingRow
        label="Nom d'affichage"
        desc="Visible par les membres de ton team."
      >
        <input
          defaultValue={user?.email?.split("@")[0] || ""}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border-color, #ececec)",
            borderRadius: 8,
            fontSize: 14,
            background: "var(--bg-primary, #ffffff)",
            color: "var(--text-primary, #0a0a0a)",
            width: 220,
          }}
        />
      </SettingRow>

      <SettingRow
        label="Langue"
        desc="Langue par défaut pour la génération de contenu."
      >
        <select
          defaultValue="fr"
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border-color, #ececec)",
            borderRadius: 8,
            fontSize: 14,
            background: "var(--bg-primary, #ffffff)",
            color: "var(--text-primary, #0a0a0a)",
            width: 220,
          }}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="de">Deutsch</option>
        </select>
      </SettingRow>

      <div className="mt-6 flex justify-end">
        <button
          style={{
            padding: "8px 16px",
            background: "#0a0a0a",
            color: "#ffffff",
            borderRadius: 999,
            fontSize: 13.5,
            fontWeight: 500,
          }}
        >
          Enregistrer
        </button>
      </div>
    </SectionShell>
  );
}

function PlanSection() {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await creditsAPI.balance();
        if (res.data) setBalance(res.data.balance ?? null);
      } catch {
        /* silent */
      }
    })();
  }, []);

  return (
    <SectionShell
      title="Plan"
      subtitle="Ton plan actuel et ta consommation de crédits."
    >
      <div
        className="rounded-2xl p-6 mb-6"
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)",
          color: "#ffffff",
          boxShadow: "0 16px 40px -8px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Plan actuel
        </div>
        <div className="flex items-baseline justify-between mb-5">
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>Free</div>
          <div style={{ fontSize: 14, opacity: 0.7 }}>0€ / mois</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Crédits restants</div>
            <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{balance ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Renouvellement</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>Pas de renouvellement auto</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PlanCard
          name="Creator"
          price="35€/mois"
          features={["200 crédits", "Tous les moteurs vidéo", "HD sans watermark", "Droits commerciaux"]}
          cta="Passer à Creator"
        />
        <PlanCard
          name="Studio"
          price="85€/mois"
          features={["450 crédits", "Tout Creator", "Export 4K", "File prioritaire", "Accès API"]}
          cta="Passer à Studio"
          highlight
        />
      </div>
    </SectionShell>
  );
}

function PlanCard({
  name,
  price,
  features,
  cta,
  highlight,
}: {
  name: string;
  price: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--bg-primary, #ffffff)",
        border: highlight ? "1.5px solid #3b82f6" : "1px solid var(--border-color, #ececec)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary, #0a0a0a)" }}>{name}</div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary, #0a0a0a)", marginTop: 4 }}>
        {price}
      </div>
      <ul className="mt-4 space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex gap-2" style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)" }}>
            <Check size={13} style={{ marginTop: 3, flexShrink: 0 }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/dashboard/credits"
        className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full transition"
        style={{
          background: highlight ? "#3b82f6" : "var(--bg-secondary, #fafafa)",
          color: highlight ? "#ffffff" : "var(--text-primary, #0a0a0a)",
          border: highlight ? "1px solid #3b82f6" : "1px solid var(--border-color, #ececec)",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {cta}
        <ArrowRight size={13} />
      </Link>
    </div>
  );
}

function BillingSection() {
  return (
    <SectionShell
      title="Billing"
      subtitle="Historique de paiements et méthode de facturation."
    >
      <div
        className="rounded-xl p-10 text-center"
        style={{
          border: "1px dashed var(--border-color, #ececec)",
          background: "var(--bg-secondary, #fafafa)",
        }}
      >
        <CreditCard size={32} style={{ color: "var(--text-tertiary, #9ca3af)", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary, #0a0a0a)", marginBottom: 6 }}>
          Pas encore de paiement
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-secondary, #6b7280)", maxWidth: 340, margin: "0 auto 18px", lineHeight: 1.5 }}>
          Tes factures et tes méthodes de paiement apparaîtront ici dès ton premier upgrade.
        </div>
        <Link
          href="/dashboard/credits"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full"
          style={{
            background: "#0a0a0a",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Voir les plans
          <ArrowRight size={13} />
        </Link>
      </div>
    </SectionShell>
  );
}

function ReferralSection() {
  const user = typeof window !== "undefined" ? getStoredUser() : null;
  const link = `https://horpen.ai/?via=${encodeURIComponent(user?.email?.split("@")[0] ?? "ref")}`;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* silent */
    }
  };

  return (
    <SectionShell
      title="Referral"
      subtitle="Partage Horpen et gagne 20% de commission sur chaque abonnement."
    >
      <div
        className="rounded-xl p-5 mb-5"
        style={{ background: "var(--bg-secondary, #fafafa)", border: "1px solid var(--border-color, #ececec)" }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary, #9ca3af)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
          Ton lien d&apos;affiliation
        </div>
        <div className="flex gap-2">
          <div
            className="flex-1 px-3 py-2.5 rounded-lg font-mono"
            style={{
              background: "var(--bg-primary, #ffffff)",
              border: "1px solid var(--border-color, #ececec)",
              color: "var(--text-primary, #0a0a0a)",
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {link}
          </div>
          <button
            onClick={copyLink}
            className="px-3.5 rounded-lg flex items-center gap-1.5 transition"
            style={{
              background: copied ? "#10b981" : "#0a0a0a",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { big: "0", label: "Clics" },
          { big: "0", label: "Inscriptions" },
          { big: "0€", label: "Gagnés" },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-xl p-4 text-center"
            style={{ background: "var(--bg-secondary, #fafafa)", border: "1px solid var(--border-color, #ececec)" }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary, #0a0a0a)", letterSpacing: "-0.02em" }}>{m.big}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)", marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function TeamSection() {
  return (
    <SectionShell
      title="Team Settings"
      subtitle="Invite ton équipe, assigne des tâches spécifiques et partage ton workspace."
    >
      <button
        className="w-full rounded-xl p-10 flex flex-col items-center justify-center gap-2 transition"
        style={{
          border: "1.5px dashed var(--border-color, #ececec)",
          background: "var(--bg-secondary, #fafafa)",
          color: "var(--text-secondary, #6b7280)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#3b82f6";
          e.currentTarget.style.background = "rgba(59,130,246,0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-color, #ececec)";
          e.currentTarget.style.background = "var(--bg-secondary, #fafafa)";
        }}
      >
        <div style={{ fontSize: 28, color: "var(--text-tertiary, #9ca3af)", lineHeight: 1 }}>+</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary, #0a0a0a)" }}>
          Créer un team
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)", textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
          Commence par créer ton équipe. Tu pourras inviter des membres, leur assigner des rôles et leur dédier des tâches (génération, tracking, analytics).
        </div>
      </button>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { role: "Admin", desc: "Accès complet, facturation, gestion team." },
          { role: "Creative", desc: "Génère du contenu, utilise tous les outils." },
          { role: "Analyst", desc: "Accès Trackify + analytics, lecture seule sur les créas." },
        ].map((r) => (
          <div
            key={r.role}
            className="rounded-xl p-4"
            style={{ background: "var(--bg-secondary, #fafafa)", border: "1px solid var(--border-color, #ececec)" }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary, #0a0a0a)" }}>{r.role}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary, #6b7280)", marginTop: 4, lineHeight: 1.45 }}>{r.desc}</div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function AvatarsSection() {
  return (
    <SectionShell
      title="Avatars"
      subtitle="Gère tes avatars IA entraînés. Ils sont réutilisables dans Canvas, Adlab, Thumbs et Clipsy."
    >
      <Link
        href="/dashboard/avatars"
        className="rounded-xl p-10 flex flex-col items-center justify-center gap-2 transition"
        style={{
          border: "1.5px dashed var(--border-color, #ececec)",
          background: "var(--bg-secondary, #fafafa)",
          color: "var(--text-secondary, #6b7280)",
        }}
      >
        <User size={28} style={{ color: "var(--text-tertiary, #9ca3af)" }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary, #0a0a0a)" }}>
          Voir tous les avatars
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)", textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
          Entraîne un avatar à partir de 6-12 photos. Utilise-le partout ensuite.
        </div>
      </Link>
    </SectionShell>
  );
}

function TrackifySection() {
  return (
    <SectionShell
      title="Trackify Brands"
      subtitle="Gère les concurrents trackés par Trackify. Chaque brand est scannée 24/7."
    >
      <div
        className="rounded-xl p-10 text-center"
        style={{ border: "1px dashed var(--border-color, #ececec)", background: "var(--bg-secondary, #fafafa)" }}
      >
        <Shield size={28} style={{ color: "var(--text-tertiary, #9ca3af)", margin: "0 auto 10px" }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary, #0a0a0a)", marginBottom: 6 }}>
          Aucune brand trackée
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)", maxWidth: 360, margin: "0 auto 16px", lineHeight: 1.5 }}>
          Tu peux tracker jusqu&apos;à 3 concurrents en plan Free, 20 en Creator, illimité en Studio.
        </div>
        <Link
          href="/trackify"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full"
          style={{ background: "#dc2626", color: "#ffffff", fontSize: 13, fontWeight: 500 }}
        >
          Ajouter un concurrent
          <ArrowRight size={13} />
        </Link>
      </div>
    </SectionShell>
  );
}

function IntegrationsSection() {
  return (
    <SectionShell
      title="Integrations"
      subtitle="Connecte Horpen aux outils que tu utilises déjà."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { name: "API", desc: "Génère via l'API Horpen depuis tes propres apps." },
          { name: "Stripe", desc: "Accepter les paiements sur tes créas monétisées." },
          { name: "Zapier", desc: "Automatise tes workflows créa." },
          { name: "Extension Chrome", desc: "Capture des ads à la volée pour Trackify." },
        ].map((i) => (
          <div
            key={i.name}
            className="rounded-xl p-4 flex items-start justify-between gap-3"
            style={{ background: "var(--bg-secondary, #fafafa)", border: "1px solid var(--border-color, #ececec)" }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary, #0a0a0a)" }}>{i.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary, #6b7280)", marginTop: 3, lineHeight: 1.45 }}>{i.desc}</div>
            </div>
            <button
              style={{
                padding: "5px 12px",
                border: "1px solid var(--border-color, #ececec)",
                borderRadius: 999,
                background: "var(--bg-primary, #ffffff)",
                color: "var(--text-primary, #0a0a0a)",
                fontSize: 12,
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              Connecter
            </button>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* ═════════════════════════════════════════════════════════════════
   USER MENU POPOVER (appelé depuis Sidebar)
   ═════════════════════════════════════════════════════════════════ */

export function UserMenuPopover({
  open,
  onClose,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const user = typeof window !== "undefined" ? getStoredUser() : null;
  const link = `https://horpen.ai/?via=${encodeURIComponent(user?.email?.split("@")[0] ?? "ref")}`;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* silent */
    }
  };

  return (
    <>
      {/* backdrop click-to-close */}
      <div className="fixed inset-0 z-[90]" onClick={onClose} />

      <div
        className="fixed z-[91]"
        style={{
          bottom: 72,
          left: 12,
          width: 260,
          background: "var(--bg-primary, #ffffff)",
          border: "1px solid var(--border-color, #ececec)",
          borderRadius: 14,
          boxShadow: "0 24px 48px -12px rgba(5,10,20,0.18), 0 4px 8px rgba(5,10,20,0.06)",
          overflow: "hidden",
        }}
      >
        {/* User header */}
        <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--border-color, #ececec)" }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #3b82f6, #1e40af)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 600,
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            {user?.email?.charAt(0) || "?"}
          </div>
          <div className="min-w-0">
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary, #0a0a0a)" }}>
              {user?.email?.split("@")[0] || "Utilisateur"}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-secondary, #6b7280)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.email || ""}
            </div>
          </div>
        </div>

        {/* Affiliate link */}
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-color, #ececec)" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-tertiary, #9ca3af)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Affiliate Link
          </div>
          <button
            onClick={copyLink}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md transition"
            style={{
              background: "var(--bg-secondary, #fafafa)",
              border: "1px solid var(--border-color, #ececec)",
              fontSize: 12,
              color: "var(--text-secondary, #6b7280)",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>
              horpen.ai/?via={user?.email?.split("@")[0] ?? "…"}
            </span>
            {copied ? <Check size={12} style={{ color: "#10b981" }} /> : <Copy size={12} />}
          </button>
        </div>

        {/* Menu items */}
        <div className="py-1">
          <MenuItem
            icon={SettingsIcon}
            label="Settings"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
          />
          <MenuItem icon={SparkleIcon} label="Perks & Benefits" onClick={() => {}} />
          <MenuItem icon={Mail} label="Customer Support" href="mailto:support@horpen.ai" />
        </div>

        {/* Logout */}
        <div style={{ borderTop: "1px solid var(--border-color, #ececec)" }}>
          <MenuItem icon={SignOut} label="Log out" onClick={handleLogout} danger />
        </div>
      </div>
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  href,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const inner = (
    <div
      className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer"
      style={{
        fontSize: 13.5,
        fontWeight: 500,
        color: danger ? "#dc2626" : "var(--text-secondary, #6b7280)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-hover, #f3f4f6)";
        if (!danger) e.currentTarget.style.color = "var(--text-primary, #0a0a0a)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        if (!danger) e.currentTarget.style.color = "var(--text-secondary, #6b7280)";
      }}
    >
      <Icon size={14} />
      <span>{label}</span>
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ display: "block" }}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} style={{ display: "block", width: "100%", textAlign: "left" }}>
      {inner}
    </button>
  );
}
