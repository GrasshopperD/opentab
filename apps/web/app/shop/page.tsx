"use client";
import { useMemo, useState } from "react";
import { computeCharge, formatLocal, formatTokenAmount, type Quote } from "@opentab/shared";
import { DemoAccess, QR, Scanner, TxLink } from "../components";
import { CATALOG, CATALOG_CURRENCY, DEMO_RATES, MERCHANTS, TOKEN_CODE } from "@/lib/config";
import { catalogQuote, customQuote, merchantNameOf, receiptFor, type Receipt } from "@/lib/checkout";
import { useCheckout } from "./use-checkout";

// Demo Mode merchant checkout. The sale state machine (invoice, approval verification, Stellar submission, reconciliation,
// receipts) lives in useCheckout, shared with Product Mode /business/checkout; this file is presentation only.

function ReceiptView({ r }: { r: Receipt }) {
  return (
    <div className="receipt" data-testid="receipt">
      <div className="receipt-head"><b>{r.merchantName}</b><span className="muted">Payment receipt (demo, not a tax invoice)</span></div>
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
        <tbody>{r.lines.map((l, i) => <tr key={i}><td>{l.product}</td><td>{l.qty}</td><td>{r.currency} {l.unit}</td><td>{r.currency} {l.total}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={3}>Total ({r.currency}, illustrative price)</td><td><b>{r.currency} {r.total}</b></td></tr></tfoot>
      </table>
      <dl className="kv">
        <dt>Charged on Stellar</dt><dd>{r.charge} {TOKEN_CODE} (Testnet demo token)</dd>
        <dt>Status</dt><dd><b>{r.status === "CONFIRMED" ? "Confirmed on Stellar Testnet" : r.status}</b></dd>
        <dt>Timestamp</dt><dd>{new Date(r.confirmedAt).toLocaleString()} <span className="muted">(seen by this terminal)</span></dd>
        <dt>Terminal</dt><dd>#{r.terminalId}</dd>
        <dt>Invoice</dt><dd><code>{r.invoiceId.slice(0, 16)}…</code></dd>
        <dt>Transaction</dt><dd>{r.txHash ? <><code data-testid="receipt-hash">{r.txHash}</code><br /><TxLink hash={r.txHash} /></> : <span className="muted">hash not recorded by this terminal (settled; see Recent settlements)</span>}</dd>
      </dl>
    </div>
  );
}

export default function Shop() {
  const {
    mid, setMid, terminal, setTerminal, merchant, c, inv, info, note, receipts, receipt, stage, busySale,
    createInvoice, onAuth, submit, reconcile, exportCsv, clearReceipts, newSale,
  } = useCheckout();
  const [cur, setCur] = useState("MXN");
  const [price, setPrice] = useState("100.00");
  const [mode, setMode] = useState<"catalog" | "custom">("catalog");
  const [sku, setSku] = useState(CATALOG[0].sku);
  const [qty, setQty] = useState("1");

  const product = CATALOG.find((p) => p.sku === sku) ?? CATALOG[0];
  const qtyN = /^\d{1,2}$/.test(qty) && Number(qty) >= 1 ? Number(qty) : 0;
  const quote: Quote | null = useMemo(() => {
    try {
      // Item, quantity and unit price go into the quote hash, so the customer's signature covers them.
      if (mode === "catalog") return qtyN ? catalogQuote([{ sku: product.sku, qty: qtyN }]) : null;
      return customQuote(cur, price);
    } catch { return null; }
  }, [mode, product, qtyN, cur, price]);
  const charge = quote && quote.localMinor > 0n ? computeCharge(quote) : 0n;

  const STAGES = ["Customer scans invoice", "Scan approval", "Submit to Stellar", "Receipt"];
  const stageClass = (i: number) => stage === 0 ? (i <= 1 ? "on" : "") : stage >= 2 && i < Math.floor(stage) ? "done" : i === Math.floor(stage) ? "on" : "";
  const summary = inv && (
    <p className="muted" data-testid="sale-summary">
      {inv.quote.items ? inv.quote.items.map((i) => `${i.name} × ${i.qty}`).join(", ") : "Custom amount"} · <b>{inv.quote.currency} {formatLocal(inv.quote.localMinor, inv.quote.minorDigits)}</b>
      {" "}= {formatTokenAmount(inv.amount, 7)} {TOKEN_CODE} · {merchantNameOf(inv.merchant)} · terminal #{inv.terminalId}
    </p>
  );

  return (
    <>
      <h1>Merchant Checkout</h1>
      <p className="lead">Select a product and accept payment.</p>
      <DemoAccess />

      {!c && (
        <div className="card">
          <div className="wallet-head"><h2>Select a product</h2><span className="muted">{merchant.name} · terminal #{terminal || "1"}</span></div>
          <div className="seg" role="tablist" aria-label="Sale type">
            <button role="tab" aria-selected={mode === "catalog"} className={mode === "catalog" ? "on" : ""} onClick={() => setMode("catalog")}>Products</button>
            <button role="tab" aria-selected={mode === "custom"} className={mode === "custom" ? "on" : ""} onClick={() => setMode("custom")}>Custom amount</button>
          </div>
          {mode === "catalog" ? (
            <>
              <div className="products" role="radiogroup" aria-label="Product">
                {CATALOG.map((p) => (
                  <button key={p.sku} role="radio" aria-checked={p.sku === sku} className={"product" + (p.sku === sku ? " on" : "")} onClick={() => setSku(p.sku)}>
                    <b>{p.name}</b><span>{CATALOG_CURRENCY} {formatLocal(p.unitMinor, 2)}</span>
                  </button>
                ))}
              </div>
              <label htmlFor="qty">Quantity (1-99)</label>
              <div className="qty">
                <button className="btn ghost small" aria-label="Decrease quantity" onClick={() => setQty(String(Math.max(1, (qtyN || 1) - 1)))}>−</button>
                <input id="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 2))} />
                <button className="btn ghost small" aria-label="Increase quantity" onClick={() => setQty(String(Math.min(99, (qtyN || 0) + 1)))}>+</button>
              </div>
              <p className="muted">Illustrative demo prices in USD. No tax is calculated.</p>
            </>
          ) : (
            <div className="row">
              <div><label>Currency</label>
                <select value={cur} onChange={(e) => setCur(e.target.value)}>{Object.keys(DEMO_RATES).map((k) => <option key={k}>{k}</option>)}</select></div>
              <div><label>Price</label><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            </div>
          )}
          <h3>Order summary</h3>
          {quote ? (
            <dl className="kv">
              {mode === "catalog" && <><dt>Item</dt><dd data-testid="line">{product.name} × {qtyN} @ {CATALOG_CURRENCY} {formatLocal(product.unitMinor, 2)}</dd></>}
              <dt>{mode === "catalog" ? "Total" : "Local price"}</dt><dd><b>{quote.currency} {formatLocal(quote.localMinor, quote.minorDigits)}</b></dd>
              <dt>Actual Testnet charge</dt><dd><b>{formatTokenAmount(charge, 7)} {TOKEN_CODE}</b></dd>
              <dt>Rate</dt><dd>{quote.rate} {quote.currency} per demo USD · illustrative, not a live quote</dd>
            </dl>
          ) : <p className="warn">{mode === "catalog" ? "Enter a quantity from 1 to 99." : "Enter a valid price."}</p>}
          <button className="btn xl" disabled={!quote || charge <= 0n} onClick={() => createInvoice(quote)}>Generate Invoice QR</button>
          <details>
            <summary>Shop &amp; terminal settings</summary>
            <div className="row">
              <div><label>Shop</label>
                <select value={mid} onChange={(e) => setMid(e.target.value as "A" | "B")}>
                  {MERCHANTS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></div>
              <div><label>Terminal</label><input inputMode="numeric" value={terminal} onChange={(e) => setTerminal(e.target.value.replace(/\D/g, ""))} /></div>
            </div>
          </details>
        </div>
      )}

      {c && inv && (
        <div className="card">
          {stage >= 0 && (
            <ol className="progress" aria-label="Checkout steps">
              {STAGES.map((s, i) => <li key={s} className={stageClass(i)}>{i + 1}. {s}</li>)}
            </ol>
          )}
          {c.status === "PRESENTED" && (
            <>
              <h2>Step 1 · Customer scans invoice</h2>
              {summary}
              {inv.quote.items && <p className="muted">Items, quantities and prices are covered by the customer&apos;s signature.</p>}
              <QR value={c.invoiceQR} label="Invoice QR" />
              <p className="muted">The customer&apos;s phone can be offline.</p>
              <h2>Step 2 · Scan customer approval</h2>
              <Scanner prompt="Scan customer approval" onResult={onAuth} />
            </>
          )}
          {c.status === "AUTHORIZED_LOCALLY" && (
            <>
              <p className="done-step">✓ Invoice shown · ✓ customer approval scanned</p>
              {summary}
              <div className="status info">Authorization Verified: the customer&apos;s signature matches this exact invoice. NOT PAID until Stellar confirms.</div>
              <h2>Step 3 · Submit to Stellar</h2>
              <button className="btn xl" onClick={() => submit(false)}>Submit to Stellar</button>
            </>
          )}
          {c.status === "SUBMITTED" && <><h2>Step 3 · Submitting to Stellar</h2>{summary}<div className="status pending">Submitting to Stellar… do not hand over goods yet.</div></>}
          {(c.status === "PENDING" || c.status === "UNKNOWN") && (
            <>
              <h2>Step 3 · Waiting for Stellar</h2>{summary}
              <div className="status pending">Status {c.status}: waiting for final confirmation. Do not resubmit; checking by transaction hash…<br /><TxLink hash={c.hash} /></div>
              <button className="btn ghost small" onClick={reconcile}>Check status now</button>
            </>
          )}
          {c.status === "CONFIRMED" && (
            <>
              <div className="success" role="status">
                <div className="tick" aria-hidden>✓</div>
                <div><b>Payment confirmed on Stellar.</b></div>
                <div className="amt">{formatTokenAmount(inv.amount, 7)} {TOKEN_CODE}</div>
                <div>for {inv.quote.currency} {formatLocal(inv.quote.localMinor, inv.quote.minorDigits)} at {merchantNameOf(inv.merchant)} · terminal {inv.terminalId}</div>
                <TxLink hash={c.hash} />
              </div>
              <h2>Step 4 · Receipt</h2>
              <ReceiptView r={receipt ?? receiptFor(inv, c.hash)} />
              <p className="muted">You may hand over the goods.</p>
              <button className="btn xl" onClick={newSale}>New Sale</button>
              <button className="btn danger small" onClick={() => submit(true)}>Replay test: try to charge again</button>
            </>
          )}
          {c.status === "FAILED" && <><h2>Payment failed</h2>{summary}<div className="status bad">Payment failed: {c.error}<br /><TxLink hash={c.hash} /></div></>}
          {c.status === "EXPIRED" && <><h2>Invoice expired</h2>{summary}<div className="status bad">{c.error}</div></>}
          {note && <div className="status bad">{note}</div>}
          {c.status !== "CONFIRMED" && (
            <button className={"btn " + (stage === -2 ? "xl" : "ghost small")} onClick={newSale}>{stage === -2 ? "New Sale" : "Cancel sale"}</button>
          )}
        </div>
      )}

      {!busySale && (
        <>
          <div className="card">
            <h2>Receipt history (this browser)</h2>
            <p className="muted">Demo record kept only in this browser&apos;s local storage. It is not durable merchant accounting and not a tax invoice; the payments themselves are on Stellar Testnet. New Sale keeps this history.</p>
            {!receipts.length ? <p className="muted">No confirmed sales recorded on this browser yet.</p> : (
              <ul className="list" data-testid="receipt-log">{receipts.slice(0, 10).map((r) => (
                <li key={r.invoiceId}>{r.lines.map((l) => `${l.product} × ${l.qty}`).join(", ")} · {r.currency} {r.total} · {new Date(r.confirmedAt).toLocaleString()}<br /><TxLink hash={r.txHash} /></li>
              ))}</ul>
            )}
            <button className="btn ghost small" disabled={!receipts.length} onClick={exportCsv}>Export CSV</button>
            <button className="btn ghost small" disabled={!receipts.length} onClick={clearReceipts}>Clear log</button>
          </div>

          <details className="card">
            <summary>Shop account on Stellar</summary>
            <p className="muted">Settlement balance: <b>{info?.balance !== undefined ? formatTokenAmount(BigInt(info.balance), 7) : "…"} {TOKEN_CODE}</b> (on chain). Bank payout: not available (no licensed provider yet).</p>
            <h3>Recent settlements</h3>
            {!info?.payments?.length ? <p className="muted">None in the recent event window.</p> : (
              <ul className="list">{info.payments.map((p: any) => (
                <li key={p.txHash + p.invoiceId}>{formatTokenAmount(BigInt(p.amount), 7)} {TOKEN_CODE} · family #{String(p.familyId)} · terminal {p.terminalId}<br /><TxLink hash={p.txHash} /></li>
              ))}</ul>
            )}
          </details>
        </>
      )}
    </>
  );
}
