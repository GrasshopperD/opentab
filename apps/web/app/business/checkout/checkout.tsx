"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { computeCharge, formatLocal, formatTokenAmount, type Quote } from "@opentab/shared";
import { QR, Scanner, TxLink } from "../../components";
import { CATALOG, CATALOG_CURRENCY, MERCHANTS, TOKEN_CODE } from "@/lib/config";
import { catalogQuote, merchantNameOf, receiptFor, type Receipt } from "@/lib/checkout";
import { useCheckout } from "../../shop/use-checkout";
import { accessLogin, accessLogout, accessStatus, type AccessState } from "../../opentab-api";
import { Arrow, Brand, RoleIcon } from "../../experience/design";
import "../../dashboard/dashboard.css";
import "../../experience/product.css";

// Product Mode merchant checkout. The sale is the SAME state machine as Demo Mode /shop (useCheckout): invoice QR, exact
// approval verification (signature + every invoice field, items included), submission to the FamilyVault contract via
// /api/merchant/pay, reconciliation of PENDING/UNKNOWN by hash and by the on-chain invoice record, and receipts recorded
// only after Stellar CONFIRMED. "Paid" is never shown before that.
type Tab = "sale" | "receipts" | "settings";
const usd = (minor: bigint) => `${CATALOG_CURRENCY} ${formatLocal(minor, 2)}`;

function TabIcon({ tab }: { tab: Tab }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab === "sale" ? <><path d="M3 4h2l2.4 11h11L21 7H6.2" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></> : tab === "receipts" ? <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM9 8h6M9 12h6" /></> : <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>}</svg>;
}

function ReceiptCard({ r }: { r: Receipt }) {
  return <section className="dash-card pm-receipt" data-testid="receipt">
    <div className="dash-card-heading"><h2>{r.merchantName}</h2><span className="pm-muted">Receipt (demo, not a tax invoice)</span></div>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
      <tbody>{r.lines.map((l, i) => <tr key={i}><td>{l.product}</td><td>{l.qty}</td><td>{r.currency} {l.unit}</td><td>{r.currency} {l.total}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={3}>Total ({r.currency}, illustrative price)</td><td><b>{r.currency} {r.total}</b></td></tr></tfoot></table>
    <dl className="pm-kv">
      <div><dt>Charged on Stellar</dt><dd>{r.charge} {TOKEN_CODE}<small>Testnet demo token</small></dd></div>
      <div><dt>Status</dt><dd><b>Confirmed on Stellar Testnet</b></dd></div>
      <div><dt>Time</dt><dd>{new Date(r.confirmedAt).toLocaleString()}<small>seen by this terminal</small></dd></div>
      <div><dt>Counter</dt><dd>#{r.terminalId}</dd></div>
      <div><dt>Invoice</dt><dd><span className="pm-code">{r.invoiceId.slice(0, 16)}…</span></dd></div>
      <div><dt>Transaction</dt><dd>{r.txHash ? <><span className="pm-code" data-testid="receipt-hash">{r.txHash}</span><br /><TxLink hash={r.txHash} /></> : <span className="pm-muted">settled; hash not recorded by this terminal</span>}</dd></div>
    </dl>
  </section>;
}

export function Checkout() {
  const k = useCheckout();
  const { mid, terminal, merchant, c, inv, info, note, receipts, receipt, stage, busySale } = k;
  const [tab, setTab] = useState<Tab>("sale");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [access, setAccess] = useState<AccessState | null>(null), [code, setCode] = useState(""), [accessErr, setAccessErr] = useState(""), [accessBusy, setAccessBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { accessStatus().then(r => { if (!r.error) setAccess(r); }); }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [tab, stage]);

  const lines = CATALOG.map(p => ({ sku: p.sku, qty: cart[p.sku] ?? 0 }));
  const quote: Quote | null = useMemo(() => { try { return catalogQuote(lines); } catch { return null; } }, [JSON.stringify(lines)]); // eslint-disable-line react-hooks/exhaustive-deps
  const charge = quote ? computeCharge(quote) : 0n;
  const setQty = (sku: string, q: number) => setCart(x => ({ ...x, [sku]: Math.max(0, Math.min(99, Math.floor(q) || 0)) }));
  function generate() { k.createInvoice(quote); }
  function newSale() { k.newSale(); setCart({}); }
  async function unlock(e: FormEvent) {
    e.preventDefault(); if (accessBusy || !code) return; setAccessBusy(true); setAccessErr("");
    try { const r = await accessLogin(code); if (r.authorized) { setAccess({ enabled: true, authorized: true }); setCode(""); } else setAccessErr(r.detail || "That code didn’t work."); }
    finally { setAccessBusy(false); }
  }
  async function lockAccess() { const r = await accessLogout(); if (!r.error) setAccess(a => a ? { ...a, authorized: false } : a); }
  function exportReceipts() { k.exportCsv(); }

  const STAGES = ["Show invoice", "Scan approval", "Submit to Stellar", "Receipt"];
  const stepClass = (i: number) => stage === 0 ? (i <= 1 ? "is-on" : "") : stage >= 2 && i < Math.floor(stage) ? "is-done" : i === Math.floor(stage) ? "is-on" : "";
  const saleLines = inv && <ul className="pm-lines" data-testid="sale-summary">
    {(inv.quote.items ?? [{ name: "Custom amount", qty: 1, unitMinor: inv.quote.localMinor }]).map((i, n) => <li key={n}><span>{i.name} × {i.qty}</span><span>{inv.quote.currency} {formatLocal(i.unitMinor * BigInt(i.qty), inv.quote.minorDigits)}</span></li>)}
    <li><b>Total</b><b>{inv.quote.currency} {formatLocal(inv.quote.localMinor, inv.quote.minorDigits)} = {formatTokenAmount(inv.amount, 7)} {TOKEN_CODE}</b></li>
  </ul>;
  const accessCard = access && !access.authorized && <section className="dash-card dash-access" data-testid="checkout-access">
    <h2>Demo access</h2>
    {!access.enabled ? <p>Payments are disabled on this deployment.</p> : <form onSubmit={unlock}>
      <p>Submitting payments uses the demo shop’s Testnet account, so it needs the demo access code. Showing invoices and checking approvals works without it.</p>
      <label htmlFor="checkout-code">Access code</label><input id="checkout-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required />
      {accessErr && <p className="pm-warn" role="alert">{accessErr}</p>}
      <button className="ot-button" disabled={accessBusy || !code}>Unlock checkout <Arrow /></button></form>}
  </section>;

  let body: React.ReactNode;
  if (tab === "receipts") {
    body = <div className="pm-stack">
      <section className="dash-card"><h2>Receipts on this terminal</h2>
        <p className="pm-muted">Kept only in this browser’s storage. Not durable merchant accounting and not a tax invoice; the payments themselves are on Stellar Testnet.</p>
        {!receipts.length ? <p className="pm-muted">No confirmed sales recorded on this browser yet.</p> : <ul className="pm-list" data-testid="receipt-log">{receipts.slice(0, 20).map(r => <li key={r.invoiceId}><b>{r.lines.map(l => `${l.product} × ${l.qty}`).join(", ")} · {r.currency} {r.total}</b><span>{new Date(r.confirmedAt).toLocaleString()} · {r.charge} {TOKEN_CODE}</span><TxLink hash={r.txHash} /></li>)}</ul>}
        <div className="pm-row-actions"><button className="dash-secondary" disabled={!receipts.length} onClick={exportReceipts}>Export CSV</button><button className="pm-danger" disabled={!receipts.length} onClick={k.clearReceipts}>Clear log</button></div>
      </section>
      <section className="dash-card"><h2>Shop account on Stellar</h2>
        <p className="pm-muted">Settlement balance: <b>{info?.balance !== undefined ? formatTokenAmount(BigInt(info.balance), 7) : "…"} {TOKEN_CODE}</b> (read from Stellar). Bank payout: not available (no licensed provider yet).</p>
        {!info?.payments?.length ? <p className="pm-muted">No settlements in the recent event window.</p> : <ul className="pm-list">{info.payments.map((p: any) => <li key={p.txHash + p.invoiceId}><b>{formatTokenAmount(BigInt(p.amount), 7)} {TOKEN_CODE} · family #{String(p.familyId)}</b><span>counter #{p.terminalId}</span><TxLink hash={p.txHash} /></li>)}</ul>}
      </section>
    </div>;
  } else if (tab === "settings") {
    body = <section className="dash-card pm-stack"><h2>Shop and counter</h2>
      {busySale && <p className="pm-warn">Finish or cancel the current sale before changing these.</p>}
      <div className="pm-field"><label htmlFor="checkout-shop">Shop</label><select id="checkout-shop" disabled={busySale} value={mid} onChange={e => k.setMid(e.target.value as "A" | "B")}>{MERCHANTS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      <div className="pm-field"><label htmlFor="checkout-terminal">Counter (terminal number)</label><input id="checkout-terminal" disabled={busySale} inputMode="numeric" value={terminal} onChange={e => k.setTerminal(e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
      <p className="pm-muted">Demo shops are Testnet accounts operated by this demo. The terminal number is part of every invoice the customer signs.</p>
      {access?.authorized && <div className="pm-row-actions"><button className="dash-text-button" onClick={lockAccess}>Lock checkout (sign out of demo access)</button></div>}
    </section>;
  } else if (!c || !inv) {
    body = <div className="pm-stack">{accessCard}
      <section className="dash-card">
        <div className="dash-card-heading"><h2>New sale</h2><span className="pm-muted">{merchant.name} · counter #{terminal || "1"}</span></div>
        <div className="pm-products" role="group" aria-label="Products">{CATALOG.map(p => { const q = cart[p.sku] ?? 0; return <div key={p.sku} className={`pm-product ${q ? "is-in" : ""}`} data-testid={`product-${p.sku}`}>
          <div><b>{p.name}</b><span>{usd(p.unitMinor)}</span></div>
          <div className="pm-qty"><button aria-label={`Remove one ${p.name}`} disabled={!q} onClick={() => setQty(p.sku, q - 1)}>−</button><input aria-label={`${p.name} quantity`} inputMode="numeric" value={String(q)} onChange={e => setQty(p.sku, Number(e.target.value.replace(/\D/g, "").slice(0, 2)))} /><button aria-label={`Add one ${p.name}`} disabled={q >= 99} onClick={() => setQty(p.sku, q + 1)}>+</button></div>
        </div>; })}</div>
      </section>
      <section className="dash-card" data-testid="order-summary"><h2>Order</h2>
        {!quote ? <p className="pm-muted">Add a product to start the order.</p> : <>
          <ul className="pm-lines">{quote.items!.map(i => <li key={i.name}><span>{i.name} × {i.qty} @ {usd(i.unitMinor)}</span><span>{usd(i.unitMinor * BigInt(i.qty))}</span></li>)}</ul>
          <div className="pm-total">{usd(quote.localMinor)}<span>total</span></div>
          <p className="pm-muted">Testnet charge: <b>{formatTokenAmount(charge, 7)} {TOKEN_CODE}</b> at {quote.rate} {quote.currency} per demo USD (illustrative, not a live quote). No tax is calculated.</p>
        </>}
        <button className="ot-button pm-cta" disabled={!quote || charge <= 0n} onClick={generate}>Generate invoice QR <Arrow /></button>
      </section>
    </div>;
  } else {
    body = <div className="pm-stack">
      {stage >= 0 && <ol className="pm-steps" style={{ "--n": 4 } as React.CSSProperties} aria-label="Checkout steps">{STAGES.map((s, i) => <li key={s} className={stepClass(i)}>{i + 1}. {s}</li>)}</ol>}
      {c.status === "AUTHORIZED_LOCALLY" || c.status === "SUBMITTED" ? accessCard : null}
      <section className="dash-card">
        {c.status === "PRESENTED" && <>
          <h2>Show this invoice to the customer</h2>{saleLines}
          {inv.quote.items && <p className="pm-muted">Items, quantities and prices are covered by the customer’s signature.</p>}
          <QR value={c.invoiceQR} label="Invoice QR" />
          <p className="pm-muted">The customer’s phone can be offline. Valid for 15 minutes.</p>
          <h2>Scan the customer’s approval</h2>
          <Scanner prompt="Scan customer approval" onResult={k.onAuth} />
        </>}
        {c.status === "AUTHORIZED_LOCALLY" && <>
          <h2>Authorization verified</h2>{saleLines}
          <div className="pm-status info" role="status">Authorization Verified: the customer’s signature matches this exact invoice. NOT PAID until Stellar confirms.</div>
          <button className="ot-button pm-cta" onClick={() => k.submit(false)}>Submit to Stellar <Arrow /></button>
        </>}
        {c.status === "SUBMITTED" && <><h2>Submitting to Stellar</h2>{saleLines}<div className="pm-status pending" role="status">Submitting to Stellar… do not hand over goods yet.</div></>}
        {(c.status === "PENDING" || c.status === "UNKNOWN") && <><h2>Waiting for Stellar</h2>{saleLines}
          <div className="pm-status pending" role="status">Status {c.status}: waiting for final confirmation. Do not resubmit; checking by transaction hash…<br /><TxLink hash={c.hash} /></div>
          <button className="dash-secondary" onClick={k.reconcile}>Check status now</button></>}
        {c.status === "CONFIRMED" && <>
          <div className="pm-success" role="status"><span className="pm-tick" aria-hidden="true">✓</span><b>Payment confirmed on Stellar.</b>
            <div className="pm-total">{formatTokenAmount(inv.amount, 7)}<span>{TOKEN_CODE}</span></div>
            <span>for {inv.quote.currency} {formatLocal(inv.quote.localMinor, inv.quote.minorDigits)} at {merchantNameOf(inv.merchant)} · counter #{inv.terminalId}</span><TxLink hash={c.hash} /></div>
          <p className="pm-muted">You may hand over the goods.</p>
        </>}
        {c.status === "FAILED" && <><h2>Payment failed</h2>{saleLines}<div className="pm-status bad" role="alert">Payment failed: {c.error}<br /><TxLink hash={c.hash} /></div><p className="pm-muted">Nothing was charged unless the transaction link says otherwise. Do not hand over goods.</p></>}
        {c.status === "EXPIRED" && <><h2>Invoice expired</h2>{saleLines}<div className="pm-status bad" role="alert">{c.error}</div></>}
        {note && <div className="pm-status bad" role="alert" data-testid="checkout-note">{note}</div>}
        <div className="pm-row-actions">{c.status === "CONFIRMED" || stage === -2 ? <button className="ot-button" onClick={newSale}>New sale <Arrow /></button> : <button className="dash-text-button" onClick={newSale}>Cancel sale</button>}</div>
      </section>
      {c.status === "CONFIRMED" && <ReceiptCard r={receipt ?? receiptFor(inv, c.hash)} />}
    </div>;
  }

  return <div className="dash-app ot-theme-merchant">
    <a className="ot-skip" href="#checkout-main">Skip to checkout</a>
    <aside className="dash-sidebar"><Brand /><div className="dash-workspace"><span className="dash-family-avatar"><RoleIcon kind="merchant" /></span><div><b>{merchant.name}</b><span>Counter #{terminal || "1"}</span></div></div>
      <nav className="pm-nav-3" aria-label="Checkout navigation">{([["sale", "Sale"], ["receipts", "Receipts"], ["settings", "Settings"]] as const).map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><TabIcon tab={id} />{label}{tab === id && <span className="dash-nav-dot" />}</button>)}</nav>
      <div className="dash-sidebar-bottom"><Link href="/business">Back to Business <Arrow back /></Link><Link href="/demo/shop">Original demo <Arrow /></Link></div></aside>
    <div className="dash-main-shell"><main id="checkout-main" className="dash-main">
      <div className="dash-page-heading"><h1 ref={heading} tabIndex={-1}>{tab === "receipts" ? "Receipts" : tab === "settings" ? "Settings" : c?.status === "CONFIRMED" ? "Paid" : "Checkout"}</h1></div>
      {body}
    </main></div>
  </div>;
}
