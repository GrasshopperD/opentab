"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatLocal, formatTokenAmount } from "@opentab/shared";
import { Online, QR, Scanner } from "../components";
import { MERCHANTS, TOKEN_CODE } from "@/lib/config";
import { useFamilyWallet } from "../family/use-family-wallet";
import { Arrow, Brand, RoleIcon } from "../experience/design";
import "../dashboard/dashboard.css";
import "../experience/product.css";

// Product Mode Family Wallet. Same device key, same storage, same Stellar authorization check and the same OFFLINE
// signing code as Demo Mode /family (useFamilyWallet). A signed QR is a payment AUTHORIZATION, never a settlement.
type Tab = "wallet" | "activity" | "device";

function TabIcon({ tab }: { tab: Tab }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab === "wallet" ? <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></> : tab === "activity" ? <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM9 8h6M9 12h6" /></> : <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4" /></>}</svg>;
}

export function Wallet() {
  const w = useFamilyWallet();
  const [tab, setTab] = useState<Tab>("wallet");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [tab, w.paying, w.connected]);
  const { sk, fam, name, fp, pairingCode, synced, connected, check, hist, paying, inv, err, authQR, known, expMin, thisApproval } = w;
  const syncLine = synced && (check === "ok"
    ? `Confirmed on Stellar at ${new Date(synced.at).toLocaleTimeString()}.`
    : `Last synced with Stellar ${new Date(synced.at).toLocaleString()}${check === "offline" ? " · you are offline, so this is not a fresh check" : ""}.`);
  const history = <ul className="pm-list" data-testid="wallet-history">{hist.map((h) => <li key={h.invoiceId + h.at}>
    <b>{h.local} at {h.merchant}</b><span>{formatTokenAmount(BigInt(h.amount))} {TOKEN_CODE} · {new Date(h.at).toLocaleString()}</span>
    {h.settled ? <span className="pm-settled">✓ Settled on Stellar</span> : <span className="pm-waiting">Approved on this phone · waiting for the shop to settle</span>}</li>)}</ul>;

  const nav = <nav className="pm-nav-3" aria-label="Wallet navigation">{([["wallet", "Wallet"], ["activity", "Activity"], ["device", "Device"]] as const).map(([id, label]) =>
    <button key={id} aria-current={!paying && tab === id ? "page" : undefined} disabled={!sk && id !== "wallet"} onClick={() => { if (paying) w.endPay(); setTab(id); }}><TabIcon tab={id} />{label}{!paying && tab === id && <span className="dash-nav-dot" />}</button>)}</nav>;

  let body: React.ReactNode;
  if (!w.loaded) body = <p className="pm-muted" role="status">Opening your wallet…</p>;
  else if (paying) {
    const step = authQR ? 2 : inv ? 1 : 0;
    body = <div className="pm-stack">
      <ol className="pm-steps" style={{ "--n": 3 } as React.CSSProperties} aria-label="Payment steps">{["Scan shop QR", "Review", "Show approval"].map((s, i) => <li key={s} className={i < step ? "is-done" : i === step ? "is-on" : ""}>{i + 1}. {s}</li>)}</ol>
      <section className="dash-card">
        {step === 0 && <>
          <h2>Scan the shop’s invoice</h2>
          <p className="pm-muted">Point the camera at the invoice QR on the shop’s screen. No internet needed: this phone checks and signs it locally.</p>
          <Scanner prompt="Open camera" onResult={w.onInvoice} autoStart />
          {err && <div className="pm-status bad" role="alert">{err}</div>}
          <div className="pm-row-actions"><button className="dash-text-button" onClick={w.endPay}><Arrow back /> Back to wallet</button></div>
        </>}
        {step === 1 && inv && <>
          <h2>Review payment</h2>
          <dl className="pm-kv" data-testid="pay-review">
            <div><dt>Shop</dt><dd><b>{inv.merchantName}</b>{known ? "" : " (unlisted)"}<small>{inv.merchant.slice(0, 8)}…{inv.merchant.slice(-6)} · counter #{inv.terminalId}</small></dd></div>
            {inv.quote.items && <div><dt>Items</dt><dd data-testid="items">{inv.quote.items.map((i, k) => <div key={k}>{i.name} × {i.qty} @ {inv.quote.currency} {formatLocal(i.unitMinor, inv.quote.minorDigits)}</div>)}</dd></div>}
            <div><dt>{inv.quote.items ? "Total" : "Price"}</dt><dd><b>{inv.quote.currency} {formatLocal(inv.quote.localMinor, inv.quote.minorDigits)}</b></dd></div>
            <div><dt>You pay</dt><dd><b>{formatTokenAmount(inv.amount, 7)} {TOKEN_CODE}</b><small>Testnet demo token, no monetary value</small></dd></div>
            <div><dt>Paid from</dt><dd>Family #{fam} wallet</dd></div>
          </dl>
          <p className="pm-muted">Rate {inv.quote.rate} {inv.quote.currency} per demo USD ({inv.quote.source === "ILLUSTRATIVE" ? "illustrative, not live" : inv.quote.source}) · expires in ~{expMin} min.</p>
          {err && <div className="pm-status bad" role="alert">{err}</div>}
          <button className="ot-button pm-cta" disabled={!fam} onClick={w.approve}>Approve payment <Arrow /></button>
          <div className="pm-row-actions"><button className="dash-text-button" onClick={w.cancelReview}>Cancel</button></div>
        </>}
        {step === 2 && <>
          <h2>Payment authorized</h2>
          <p className="pm-muted"><b>Show this QR code to the shop to complete your purchase.</b></p>
          <QR value={authQR} label="Signed payment approval for the shop" />
          {thisApproval?.settled
            ? <div className="pm-status ok" role="status">✓ Settled on Stellar. The shop has been paid.</div>
            : <div className="pm-status pending" role="status">Waiting for merchant settlement. Not paid yet.</div>}
          <p className="pm-muted">This approval works only for this shop, this amount and this invoice, once. The shop submits it to Stellar; the payment is complete only when Stellar confirms it.</p>
          <div className="pm-row-actions"><button className="dash-text-button" onClick={w.endPay}><Arrow back /> Back to wallet</button></div>
        </>}
      </section>
    </div>;
  } else if (!sk) {
    body = <section className="dash-card pm-stack">
      <h2>Set up this phone</h2>
      <p className="pm-muted">Creates this phone’s signing key. Only its public part is ever shared; the private key never leaves this browser.</p>
      <div className="pm-field"><label htmlFor="wallet-name">Your name (shown to your organizer)</label><input id="wallet-name" value={name} maxLength={40} onChange={(e) => w.changeName(e.target.value)} placeholder="e.g. Ana" /></div>
      <button className="ot-button pm-cta" onClick={w.setup}>Create my key <Arrow /></button>
      <p className="pm-muted">Or use the <Link href="/onboarding?role=recipient" className="dash-text-button">guided setup <Arrow /></Link></p>
    </section>;
  } else if (tab === "activity") {
    body = <section className="dash-card"><h2>Payments approved on this phone</h2>{!hist.length ? <p className="pm-muted">No payments approved on this phone yet.</p> : history}
      <p className="pm-muted">Settlement is checked on Stellar whenever this phone is online.</p></section>;
  } else if (tab === "device") {
    body = <div className="pm-stack"><section className="dash-card">
      <h2>Device settings</h2>
      <p className="pm-muted">Security code</p><p className="pm-fp" data-testid="security-code">{fp}</p>
      <p className="pm-muted">Pairing code: show it to an organizer to authorize this phone again, or for another family. It contains only the public key.</p>
      <QR value={pairingCode} label="Pairing code" />
      <div className="pm-field"><label htmlFor="device-family">Family number (from your organizer)</label><input id="device-family" inputMode="numeric" value={fam} onChange={(e) => w.changeFam(e.target.value.replace(/\D/g, ""))} /></div>
      <div className="pm-field"><label htmlFor="device-name">Your name (shown to your organizer)</label><input id="device-name" value={name} maxLength={40} onChange={(e) => w.changeName(e.target.value)} /></div>
      <p className="pm-warn">Testnet demo: the signing key is stored unencrypted in this browser and has no backup. Replacing or deleting it means your organizer must connect this phone again.</p>
      <div className="pm-row-actions"><button className="pm-danger" onClick={w.setup}>Replace key</button><button className="pm-danger" onClick={w.deleteKey}>Delete key</button></div>
    </section></div>;
  } else if (connected && synced) {
    body = <div className="pm-stack">
      <section className="dash-balance" data-testid="wallet-balance">
        <div className="dash-balance-top"><span>Family #{fam} · this phone is authorized</span><RoleIcon kind="recipient" /></div>
        <div className="dash-amount">{formatTokenAmount(BigInt(synced.balance))}<span>{TOKEN_CODE}</span></div>
        <p className="dash-balance-note">{syncLine} Shared family balance; Stellar decides what can be spent.</p>
        <div className="dash-balance-bottom"><button className="dash-text-button" onClick={w.refresh}>{check === "checking" ? "Checking…" : "Refresh balance"}</button></div>
      </section>
      <button className="ot-button pm-cta" onClick={w.startPay}>Scan to Pay <Arrow /></button>
      <p className="pm-muted">Works without internet at participating shops: {MERCHANTS.map((m) => m.name).join(", ")}.</p>
      <section className="dash-card dash-activity"><div className="dash-card-heading"><h2>Recent payments</h2>{hist.length > 3 && <button className="dash-text-button" onClick={() => setTab("activity")}>View all <Arrow /></button>}</div>
        {!hist.length ? <p className="pm-muted">No payments approved on this phone yet.</p> : <ul className="pm-list">{hist.slice(0, 3).map((h) => <li key={h.invoiceId + h.at}><b>{h.local} at {h.merchant}</b>
          {h.settled ? <span className="pm-settled">✓ Settled on Stellar</span> : <span className="pm-waiting">Approved on this phone · waiting for the shop to settle</span>}</li>)}</ul>}</section>
    </div>;
  } else {
    // Key exists but Stellar has not (yet) confirmed this phone for this family: pairing.
    body = <div className="pm-stack">
      <section className="dash-card">
        <h2>Connect to your family</h2>
        <ol className="dash-phone-steps"><li><span>1</span><div><b>Enter your family number</b><p>Your organizer shares it with you.</p></div></li><li><span>2</span><div><b>Show this pairing code to your organizer</b><p>They open <b>Add family member</b> and scan it. It contains only a public key, never a secret.</p></div></li><li><span>3</span><div><b>Wait for Stellar to confirm</b><p>This page checks automatically.</p></div></li></ol>
        <div className="pm-field"><label htmlFor="wallet-family">Family number</label><input id="wallet-family" inputMode="numeric" value={fam} onChange={(e) => w.changeFam(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 7" /></div>
        <p className="pm-muted">Security code</p><p className="pm-fp" data-testid="security-code">{fp}</p>
        <QR value={pairingCode} label="Pairing code" />
      </section>
      <section className="dash-card" data-testid="pairing-status">
        <h2>Connection status</h2>
        {!fam ? <p className="pm-muted">Enter your family number first.</p> : <>
          {check === "checking" && !synced && <div className="pm-status pending" role="status">Checking Stellar…</div>}
          {synced && !synced.keyActive && check !== "offline" && <div className="pm-status pending" role="status">Waiting for your organizer to authorize this phone on Stellar for family #{fam} (not authorized yet, or the authorization was revoked).</div>}
          {check === "FamilyNotFound" && <div className="pm-status bad" role="alert">Family #{fam} does not exist on this vault. Check the number with your organizer.</div>}
          {check && !["ok", "checking", "offline", "FamilyNotFound"].includes(check) && <div className="pm-status bad" role="alert">Could not check Stellar ({check}). Try again.</div>}
          {check === "offline" && <><div className="pm-status pending" role="status">You are offline, so this phone cannot confirm its authorization yet. Connect once after your organizer pairs it.</div>
            <p className="pm-muted">Already authorized? You can still pay; the payment only goes through if Stellar confirms this phone is authorized.</p>
            <div className="pm-row-actions"><button className="dash-secondary" onClick={w.startPay}>Scan to Pay anyway</button></div></>}
          <div className="pm-row-actions"><button className="dash-text-button" onClick={w.refresh}>Check again <Arrow /></button></div>
        </>}
      </section>
      {hist.length > 0 && <section className="dash-card"><h2>Payments approved on this phone ({hist.length})</h2>{history}</section>}
    </div>;
  }

  return <div className="dash-app ot-theme-recipient">
    <a className="ot-skip" href="#wallet-main">Skip to wallet</a>
    <aside className="dash-sidebar"><Brand /><div className="dash-workspace"><span className="dash-family-avatar"><RoleIcon kind="recipient" /></span><div><b>{name || "This phone"}</b><span>{fam ? `Family #${fam}` : "Recipient"}</span></div></div>{nav}
      <div className="dash-sidebar-bottom"><Link href="/home">Back to Home <Arrow back /></Link><Link href="/demo/family">Original demo <Arrow /></Link></div></aside>
    <div className="dash-main-shell"><main id="wallet-main" className="dash-main">
      <div className="dash-page-heading"><h1 ref={heading} tabIndex={-1}>{paying ? "Scan to Pay" : !sk ? "Welcome to your Family Wallet" : tab === "activity" ? "Your activity" : tab === "device" ? "This phone" : connected ? "Family Wallet" : "Almost there"}<Online /></h1></div>
      {body}
    </main></div>
  </div>;
}
