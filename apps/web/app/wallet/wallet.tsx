"use client";

import Link from "next/link";
import { formatTokenAmount } from "@opentab/shared";
import { DEMO_FAMILY_ID, EXPLORER_TX, MERCHANTS, TOKEN_CODE } from "@/lib/config";
import { Arrow, Brand, RoleIcon } from "../experience/design";
import { useFamilyRead } from "../experience/use-family-read";
import "../dashboard/dashboard.css";
import "../experience/product.css";

// Product Mode Family Wallet: a READ-ONLY consumer view of the demo's shared Family #7 balance (live from Stellar Testnet).
// It holds no key and signs nothing. Scan to Pay opens the real Family Wallet (Demo Mode), which keeps this phone's own
// signing key and approves purchases offline.
const money = (v?: string) => { try { return v === undefined ? "—" : formatTokenAmount(BigInt(v)); } catch { return "—"; } };

export function Wallet() {
  const familyId = DEMO_FAMILY_ID;
  const { info, loading, checkedAt, refresh, payments, ok } = useFamilyRead(familyId);
  return <div className="dash-app ot-theme-recipient">
    <a className="ot-skip" href="#wallet-main">Skip to wallet</a>
    <aside className="dash-sidebar"><Brand /><div className="dash-workspace"><span className="dash-family-avatar"><RoleIcon kind="recipient" /></span><div><b>Family #{familyId}</b><span>Family member</span></div></div>
      <div className="dash-sidebar-bottom"><Link href="/home">Back to Home <Arrow back /></Link><Link href="/demo/family">Open Demo Family Wallet <Arrow /></Link></div></aside>
    <div className="dash-main-shell"><main id="wallet-main" className="dash-main">
      <div className="dash-page-heading"><h1>Family Wallet</h1><span className="dash-family-switch"><RoleIcon kind="family" />Family #{familyId} · demo family</span></div>
      <div className="pm-stack">
        <section className="dash-balance" data-testid="wallet-balance">
          <div className="dash-balance-top"><span>Shared family balance</span><RoleIcon kind="recipient" /></div>
          <div className="dash-amount" data-testid="wallet-amount">{ok ? money(info?.family?.balance) : loading ? "…" : "—"}<span>{TOKEN_CODE}</span></div>
          <p className="dash-balance-note" data-testid="balance-status">{ok ? `Read live from Stellar Testnet${checkedAt ? ` at ${new Date(checkedAt).toLocaleTimeString()}` : ""}.` : loading ? "Reading Stellar Testnet…" : "Balance unavailable. Stellar could not be read right now."}</p>
          <div className="dash-balance-bottom"><button className="dash-text-button" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh balance"}</button></div>
        </section>
        <Link className="ot-button pm-cta" href="/demo/family" prefetch={false} data-testid="scan-to-pay">Scan to Pay <Arrow /></Link>
        <p className="pm-muted">Opens the Family Wallet in Demo Mode. There, this phone keeps its own signing key (paired by your organizer) and approves the shop’s exact invoice, even offline. The shop is paid only after Stellar confirms.</p>
        <section className="dash-card dash-activity"><div className="dash-card-heading"><h2>Recent family purchases</h2></div>
          {info?.error ? <p className="pm-muted">Purchases are unavailable right now.</p> : !payments.length ? <p className="pm-muted">{loading ? "Loading…" : "No confirmed purchases in about the last day."}</p>
            : <ul className="dash-purchases">{payments.slice(0, 5).map(p => <li key={p.txHash + p.invoiceId}><span className="dash-shop-icon"><RoleIcon kind="merchant" /></span><div><b>{MERCHANTS.find(m => m.address && m.address === p.merchant)?.name || "Family purchase"}</b><span>confirmed on Stellar</span></div><strong>−{money(p.amount)}<span>{TOKEN_CODE}</span></strong>{/^[0-9a-f]{64}$/.test(p.txHash) && <a className="dash-receipt" href={EXPLORER_TX + p.txHash} target="_blank" rel="noreferrer" aria-label="View this payment on Stellar Expert">↗</a>}</li>)}</ul>}
        </section>
        <section className="dash-card"><h2>New phone?</h2><p className="pm-muted">Set it up in the Family Wallet, then ask your organizer to pair it. Choosing a role in this app is not payment authorization.</p>
          <div className="pm-row-actions"><Link className="dash-secondary" href="/demo/family" prefetch={false}>Set up this phone in Demo Mode</Link></div></section>
      </div>
    </main></div>
  </div>;
}
