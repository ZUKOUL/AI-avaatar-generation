"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { creditsAPI, paymentsAPI } from "@/lib/api";
import { ArrowUpRight, ArrowDownRight, Spinner, Zap } from "@/components/Icons";

interface Transaction { id: string; amount: number; type: string; description: string; balance_after: number; created_at: string; }
interface Tier { slug: string; credits: number; price_usd: number; }

export default function CreditsPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [balRes, txRes, tierRes] = await Promise.all([creditsAPI.balance(), creditsAPI.history(), paymentsAPI.tiers()]);
      setBalance(balRes.data.balance ?? balRes.data.credit_balance ?? 0);
      setTransactions(txRes.data.transactions || txRes.data || []);
      setTiers(tierRes.data.tiers || []);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  const handleCheckout = async (tier: string) => {
    setCheckoutLoading(tier);
    try { const res = await paymentsAPI.checkout(tier); if (res.data.url) window.location.href = res.data.url; }
    catch { alert("Failed to start checkout. Please try again."); }
    finally { setCheckoutLoading(null); }
  };

  if (loading) {
    return (
      <><Header title="Credits" subtitle="Manage your credits and billing" />
      <div className="flex-1 flex items-center justify-center"><div className="spinner" /></div></>
    );
  }

  return (
    <>
      <Header title="Credits" subtitle="Manage your credits and billing" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Balance */}
        <div className="rounded-xl p-6 mb-8" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
          <p className="text-[13px] mb-1" style={{ color: "var(--text-muted)" }}>Current Balance</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>{balance}</span>
            <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>credits</span>
          </div>
        </div>

        {/* Pricing */}
        <span className="text-[11px] font-medium uppercase tracking-wider block mb-4" style={{ color: "var(--text-muted)" }}>Buy Credits</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {tiers.map((tier) => (
            <div key={tier.slug} className="rounded-xl p-5 transition-all hover:-translate-y-0.5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Zap size={18} style={{ color: "var(--text-primary)" }} />
                <span className="font-semibold capitalize text-[15px]" style={{ color: "var(--text-primary)" }}>{tier.slug}</span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-2xl font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>${tier.price_usd}</span>
              </div>
              <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>{tier.credits} credits</p>
              <button onClick={() => handleCheckout(tier.slug)} disabled={checkoutLoading === tier.slug}
                className="w-full py-2.5 rounded-lg font-medium text-[13px] flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background: "var(--text-primary)", color: "#000" }}
              >
                {checkoutLoading === tier.slug ? <Spinner size={14} /> : "Purchase"}
              </button>
            </div>
          ))}
        </div>

        {/* Transaction history */}
        <span className="text-[11px] font-medium uppercase tracking-wider block mb-4" style={{ color: "var(--text-muted)" }}>Transaction History</span>
        {transactions.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: tx.amount > 0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)" }}
                  >
                    {tx.amount > 0 ? <ArrowUpRight size={16} style={{ color: "var(--success)" }} /> : <ArrowDownRight size={16} style={{ color: "var(--error)" }} />}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{tx.description || tx.type}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <span className="font-semibold text-[13px]" style={{ color: tx.amount > 0 ? "var(--success)" : "var(--error)" }}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
