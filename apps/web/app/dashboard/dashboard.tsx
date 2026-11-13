"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatTokenAmount } from "@opentab/shared";
import { DEMO_FAMILY_ID, EXPLORER_TX, MERCHANTS } from "@/lib/config";
import { Arrow, Brand, RoleIcon } from "../experience/design";
import { useFamilyRead } from "../experience/use-family-read";
import "./dashboard.css";
import "../experience/product.css";

// Product Mode organizer dashboard: a READ-ONLY showcase of the demo's real Family #7. Balance, totals and purchases are
// read live from the FamilyVault contract (GET /api/family/7). Every action that changes money or access opens the
// working Demo Mode screen, which is the only place transactions are sent from.
type View = "overview" | "money" | "family" | "activity";
const validHash = (hash?: string) => !!hash && /^[0-9a-f]{64}$/.test(hash);
function money(value?: string) { try { return value === undefined ? "—" : formatTokenAmount(BigInt(value)); } catch { return "—"; } }
function NavIcon({ view }: { view: View }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{view === "overview" ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : view === "money" ? <><path d="M12 4v16M4 12h16" /><circle cx="12" cy="12" r="9" /></> : view === "family" ? <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" /></> : <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM9 8h6M9 12h6" /></>}</svg>;
}

export function Dashboard() {
  const familyId = DEMO_FAMILY_ID;
  const [view, setView] = useState<View>("overview");
  const { info, loading, checkedAt, refresh, payments, ok } = useFamilyRead(familyId);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [view]);
  const shown = view === "overview" ? payments.slice(0, 5) : payments;
  const status = loading && !ok ? "Reading Stellar Testnet…" : ok ? `Read live from Stellar Testnet${checkedAt ? ` at ${new Date(checkedAt).toLocaleTimeString()}` : ""}.` : "Balance unavailable. Stellar could not be read right now.";

  const activity = <section className="dash-card dash-activity" data-testid="dash-activity"><div className="dash-card-heading"><h2>Recent purchases</h2>{view === "overview" && <button className="dash-text-button" onClick={() => setView("activity")}>View all <Arrow /></button>}</div>
    {loading && !info ? <p className="dash-empty">Loading purchases…</p> : info?.error ? <p className="dash-empty">Purchases are unavailable. Refresh to try again.</p> : !payments.length ? <div className="dash-empty"><span className="dash-empty-icon"><NavIcon view="activity" /></span><h3>No purchases yet</h3><p>Confirmed shop payments from about the last day appear here.</p></div>
      : <ul className="dash-purchases">{shown.map(p => <li key={p.txHash + p.invoiceId}><span className="dash-shop-icon"><RoleIcon kind="merchant" /></span><div><b>{MERCHANTS.find(m => m.address && m.address === p.merchant)?.name || "Family purchase"}</b><span>{p.at && !Number.isNaN(Date.parse(p.at)) ? new Date(p.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Confirmed purchase"} · confirmed on Stellar</span></div><strong>−{money(p.amount)}<span>Demo USD</span></strong>{validHash(p.txHash) && <a className="dash-receipt" href={EXPLORER_TX + p.txHash} target="_blank" rel="noreferrer" aria-label="View this payment on Stellar Expert">↗</a>}</li>)}</ul>}
  </section>;
  const demoNote = <p className="dash-demo-note">Opens Demo Mode, where the working Stellar Testnet app sends real transactions (demo access code required).</p>;

  return <div className="dash-app">
    <a className="ot-skip" href="#dashboard-main">Skip to dashboard</a>
    <aside className="dash-sidebar"><Brand /><div className="dash-workspace"><span className="dash-family-avatar"><RoleIcon kind="family" /></span><div><b>Family #{familyId}</b><span>Organizer</span></div></div><nav aria-label="Dashboard navigation">{([["overview", "Overview"], ["money", "Add money"], ["family", "Family"], ["activity", "Activity"]] as const).map(([id, label]) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}><NavIcon view={id} />{label}{view === id && <span className="dash-nav-dot" />}</button>)}</nav><div className="dash-sidebar-bottom"><Link href="/home">Back to Home <Arrow back /></Link><Link href="/demo/sender">Open Demo Sender <Arrow /></Link></div></aside>
    <div className="dash-main-shell">
    <main id="dashboard-main" className="dash-main">
      <div className="dash-page-heading"><h1 ref={heading} tabIndex={-1}>{view === "overview" ? "Your family" : view === "money" ? "Add money" : view === "family" ? "Your family phones" : "Your activity"}</h1><span className="dash-family-switch" data-testid="family-chip"><RoleIcon kind="family" />Family #{familyId} · demo family</span></div>
      <div className="dash-view" key={view}>
      {view === "overview" && <><div className="dash-overview-grid"><section className="dash-balance" data-testid="dash-balance"><div className="dash-balance-top"><span>Available for family #{familyId}</span><RoleIcon kind="family" /></div><div className="dash-amount" data-testid="dash-amount">{ok ? money(info?.family?.balance) : loading ? "…" : "—"}<span>Demo USD</span></div><p className="dash-balance-note" data-testid="balance-status">{status}</p><div className="dash-balance-bottom"><Link className="ot-button" href="/demo/sender" prefetch={false}>Add money <Arrow /></Link><button className="dash-text-button" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh balance"}</button></div></section><section className="dash-connect-card"><div className="dash-connection-art" aria-hidden="true"><span><RoleIcon kind="organizer" /></span><i /><span><RoleIcon kind="recipient" /></span></div><h2>One family.<br />A shared everyday.</h2><button className="dash-text-button" onClick={() => setView("family")}>Add family member <Arrow /></button></section></div><section className="dash-totals" aria-label="Family balance summary"><div><span>Total added</span><b>{ok ? money(info?.family?.total_deposited) : "—"} <small>Demo USD</small></b></div><div><span>Spent at shops</span><b>{ok ? money(info?.family?.total_paid) : "—"} <small>Demo USD</small></b></div><div><span>Withdrawn</span><b>{ok ? money(info?.family?.total_withdrawn) : "—"} <small>Demo USD</small></b></div></section>{activity}</>}
      {view === "activity" && <>{activity}<div className="dash-inline dash-activity-actions"><button className="dash-secondary" onClick={refresh} disabled={loading}>Refresh purchases</button><Link href="/demo/sender" prefetch={false}>Open activity in Demo Mode <Arrow /></Link></div></>}
      {view === "money" && <div className="dash-money-flow"><section className="dash-card dash-money"><div className="dash-money-step">
        <h2>Add money to family #{familyId}</h2>
        <ol className="dash-phone-steps"><li><span>1</span><div><b>Open the Sender in Demo Mode</b><p>Unlock it with the demo access code.</p></div></li><li><span>2</span><div><b>Tap Add Funds and enter an amount</b><p>Up to 50 Demo USD (OTUSD test tokens, no monetary value).</p></div></li><li><span>3</span><div><b>Come back here</b><p>The new balance shows after Stellar confirms the deposit.</p></div></li></ol>
        <Link className="ot-button ot-button-full" href="/demo/sender" prefetch={false} data-testid="add-funds-link">Add funds in Demo Mode <Arrow /></Link>{demoNote}
        <Link className="dash-text-button dash-create-switch" href="/demo/sender" prefetch={false} data-testid="create-family-link">Start a new family instead (Demo Sender → Advanced) <Arrow /></Link>
      </div></section></div>}
      {view === "family" && <div className="dash-family-layout"><section className="dash-card"><h2>Add a family member</h2><ol className="dash-phone-steps"><li><span>1</span><div><b>On their phone, open the Family Wallet</b><p>They set up the phone and enter family number #{familyId}. Their pairing code holds only a public key.</p></div></li><li><span>2</span><div><b>In the Demo Sender, tap Pair Family Member</b><p>Scan their pairing code, check the security code matches, then authorize. Stellar records it.</p></div></li><li><span>3</span><div><b>Their phone can now Scan to Pay</b><p>Even offline, at participating shops.</p></div></li></ol><Link className="ot-button" href="/demo/sender" prefetch={false} data-testid="pair-link">Pair a family member in Demo Mode <Arrow /></Link>{demoNote}</section><section className="dash-card dash-phone-detail"><span className="dash-family-avatar"><RoleIcon kind="recipient" /></span><h2>On the family member’s phone</h2><p>The Family Wallet creates its own signing key on the phone and approves purchases offline.</p><div className="dash-phone-actions"><Link className="ot-button" href="/demo/family" prefetch={false} data-testid="family-wallet-link">Open the Family Wallet <Arrow /></Link></div></section></div>}
      </div>
    </main></div>
  </div>;
}
