"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  authorizationMismatch, computeCharge, encodeInvoiceQR, formatLocal, formatTokenAmount, parseAuthQR, parseInvoiceQR, parseLocalAmount,
  randomBytes, toHex, verifyAuthorization, type Invoice, type PaymentStatus, type Quote,
} from "@opentab/shared";
import { api, ERROR_TEXT, QR, Scanner, TxLink } from "../components";
import { CATALOG, CATALOG_CURRENCY, DEMO_RATES, MERCHANTS, NETWORK_PASSPHRASE, RATE_SOURCE, TOKEN_CODE, TOKEN_ID, VAULT_ID } from "@/lib/config";

const CUR = "opentab.shop.current";
const RECEIPTS = "opentab.shop.receipts"; // local demo record on THIS browser only (no backend accounting)
const merchantNameOf = (a: string) => MERCHANTS.find((m) => m.address === a)?.name ?? "this shop"; // survives refresh so a pending payment can be reconciled

interface Current { merchantId: string; invoiceQR: string; authQR?: string; status: PaymentStatus; hash?: string; error?: string }

/** Built only from the SIGNED invoice (items are covered by the customer's signature) plus the confirmed tx. */
interface Receipt {
  invoiceId: string; merchantName: string; merchant: string; terminalId: number;
  lines: { product: string; qty: number; unit: string; total: string }[];
  currency: string; total: string; charge: string; txHash?: string; status: "CONFIRMED"; confirmedAt: string;
}
function loadReceipts(): Receipt[] { try { const r = JSON.parse(localStorage.getItem(RECEIPTS) || "[]"); return Array.isArray(r) ? r : []; } catch { return []; } }
function receiptFor(inv: Invoice, hash: string | undefined): Receipt {
  const d = inv.quote.minorDigits;
  const lines = inv.quote.items?.length
    ? inv.quote.items.map((i) => ({ product: i.name, qty: i.qty, unit: formatLocal(i.unitMinor, d), total: formatLocal(i.unitMinor * BigInt(i.qty), d) }))
    : [{ product: "Custom amount", qty: 1, unit: formatLocal(inv.quote.localMinor, d), total: formatLocal(inv.quote.localMinor, d) }];
  return { invoiceId: toHex(inv.invoiceId), merchantName: merchantNameOf(inv.merchant), merchant: inv.merchant, terminalId: inv.terminalId,
    lines, currency: inv.quote.currency, total: formatLocal(inv.quote.localMinor, d), charge: formatTokenAmount(inv.amount, 7),
    txHash: hash, status: "CONFIRMED", confirmedAt: new Date().toISOString() };
}
function csv(rows: Receipt[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["confirmed_at", "merchant", "terminal", "invoice_id", "product", "quantity", "unit_price", "line_total", "currency", "invoice_total", `charged_${TOKEN_CODE}`, "stellar_tx_hash", "status"];
  const body = rows.flatMap((r) => r.lines.map((l) => [r.confirmedAt, r.merchantName, r.terminalId, r.invoiceId, l.product, l.qty, l.unit, l.total, r.currency, r.total, r.charge, r.txHash ?? "", r.status].map(q).join(",")));
  return [head.join(","), ...body].join("\r\n");
}

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
  const [mid, setMid] = useState<"A" | "B">("A");
  const [terminal, setTerminal] = useState("1");
  const [cur, setCur] = useState("MXN");
  const [price, setPrice] = useState("100.00");
  const [c, setC] = useState<Current | null>(null);
  const [info, setInfo] = useState<any>(null);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"catalog" | "custom">("catalog");
  const [sku, setSku] = useState(CATALOG[0].sku);
  const [qty, setQty] = useState("1");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  useEffect(() => { setReceipts(loadReceipts()); }, []);
  const merchant = MERCHANTS.find((m) => m.id === mid)!;

  const save = (x: Current | null) => { setC(x); try { x ? localStorage.setItem(CUR, JSON.stringify(x)) : localStorage.removeItem(CUR); } catch { } };
  useEffect(() => { try { const s = localStorage.getItem(CUR); if (s) { const x = JSON.parse(s); setC(x); setMid(x.merchantId); } } catch { } }, []);

  const loadInfo = useCallback(async () => setInfo(await api(`/api/merchant/${mid}`)), [mid]);
  useEffect(() => { loadInfo(); }, [loadInfo]);

  const product = CATALOG.find((p) => p.sku === sku) ?? CATALOG[0];
  const qtyN = /^\d{1,2}$/.test(qty) && Number(qty) >= 1 ? Number(qty) : 0;
  const quote: Quote | null = useMemo(() => {
    try {
      if (mode === "catalog") {
        if (!qtyN) return null;
        const r = DEMO_RATES[CATALOG_CURRENCY];
        // Item, quantity and unit price go into the quote hash, so the customer's signature covers them.
        return { currency: CATALOG_CURRENCY, localMinor: product.unitMinor * BigInt(qtyN), minorDigits: r.digits, rate: r.rate, source: RATE_SOURCE,
          items: [{ name: product.name, qty: qtyN, unitMinor: product.unitMinor }] };
      }
      const r = DEMO_RATES[cur];
      return { currency: cur, localMinor: parseLocalAmount(price, r.digits), minorDigits: r.digits, rate: r.rate, source: RATE_SOURCE };
    } catch { return null; }
  }, [mode, product, qtyN, cur, price]);
  const charge = quote && quote.localMinor > 0n ? computeCharge(quote) : 0n;

  function createInvoice() {
    if (!quote || charge <= 0n) return;
    const inv: Invoice = {
      network: NETWORK_PASSPHRASE, vault: VAULT_ID, token: TOKEN_ID, merchant: merchant.address, merchantName: merchant.name,
      terminalId: Number(terminal) || 1, invoiceId: randomBytes(32), amount: charge, quote,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 15 * 60),
    };
    setNote(""); save({ merchantId: mid, invoiceQR: encodeInvoiceQR(inv), status: "PRESENTED" });
  }

  const onAuth = useCallback((t: string) => {
    if (!c) return;
    try {
      const a = parseAuthQR(t);
      const inv = parseInvoiceQR(c.invoiceQR);
      if (toHex(a.invoice.invoiceId) !== toHex(inv.invoiceId)) throw new Error("This approval is for a different invoice.");
      if (!verifyAuthorization(a)) throw new Error("Signature check failed. Do not hand over goods.");
      // The signature must cover EXACTLY the invoice shown here: items, quantities, prices, merchant, terminal, expiry.
      const why = authorizationMismatch(inv, a);
      if (why === "OUTDATED_APP") throw new Error("The customer's OpenTab app is out of date: it approved the total without the item list. "
        + "Ask them to open OpenTab once while online to update it, then approve this invoice again. Do not hand over goods yet.");
      if (why) throw new Error("This approval does not match the invoice on screen (items, price, terminal or expiry differ). Do not hand over goods.");
      setNote(""); save({ ...c, authQR: t, status: "AUTHORIZED_LOCALLY" });
    } catch (e: any) { setNote(e.message); }
  }, [c]);

  const busy = useRef(false); // synchronous lock: a double-click cannot start two submissions

  async function submit(replay = false) {
    if (!c?.authQR || busy.current) return;
    const inv0 = parseInvoiceQR(c.invoiceQR);
    if (!replay && Number(inv0.expiresAt) * 1000 < Date.now()) {
      save({ ...c, status: "EXPIRED", error: "Invoice expired before submission. Start a new sale; the customer must approve again." });
      return;
    }
    busy.current = true;
    try {
      if (!replay) save({ ...c, status: "SUBMITTED", error: undefined });
      setNote(replay ? "Attempting to charge the same approval again…" : "");
      const r = await api("/api/merchant/pay", { method: "POST", body: JSON.stringify({ merchantId: c.merchantId, authorization: c.authQR, forceSubmitForDemo: replay }) });
      if (replay) {
        setNote(r.status === "CONFIRMED" ? "UNEXPECTED: second charge succeeded." : `Replay blocked: ${ERROR_TEXT[r.error] ?? r.error}`);
        return;
      }
      const transport = r.error === "NetworkError" || r.error === "BadResponse" || r.error === "ServerError";
      const status: PaymentStatus = r.status === "CONFIRMED" ? "CONFIRMED"
        : r.status === "PENDING" ? "PENDING"
        : r.status === "UNKNOWN" || transport ? "UNKNOWN"
        : r.error === "Unauthorized" || r.error === "RateLimited" ? "AUTHORIZED_LOCALLY" // not submitted at all
        : "FAILED";
      save({ ...c, status, hash: r.hash, error: r.error ? (ERROR_TEXT[r.error] ?? `${r.error} ${r.detail ?? ""}`) : undefined });
      if (status === "AUTHORIZED_LOCALLY") setNote(ERROR_TEXT[r.error] ?? r.error);
      loadInfo();
    } finally { busy.current = false; }
  }

  /** Resolve PENDING/UNKNOWN from the chain: by tx hash, then by the invoice's on-chain replay record. */
  async function reconcile() {
    if (!c) return;
    if (c.hash) {
      const r = await api(`/api/tx/${c.hash}`);
      if (r.status === "CONFIRMED" || r.status === "FAILED") { save({ ...c, status: r.status }); loadInfo(); return; }
    }
    if (!c.authQR) return;
    let fam: bigint, id: string;
    try { const a = parseAuthQR(c.authQR); fam = a.familyId; id = toHex(a.invoice.invoiceId); } catch { return; }
    const s = await api(`/api/invoice?family=${fam}&id=${id}`);
    if (s.used === true) { save({ ...c, status: "CONFIRMED", error: undefined }); loadInfo(); }
    else if (s.used === false && !c.hash) {
      // Never reached the chain: safe to retry the SAME approval (the contract allows each invoice once).
      save({ ...c, status: "AUTHORIZED_LOCALLY", error: undefined });
      setNote("Not settled on Stellar. You can safely submit the same approval again.");
    }
  }
  useEffect(() => {
    if (c && (c.status === "PENDING" || c.status === "UNKNOWN")) { const t = setTimeout(reconcile, 3000); return () => clearTimeout(t); }
  });

  const inv = c ? (() => { try { return parseInvoiceQR(c.invoiceQR); } catch { return null; } })() : null;
  useEffect(() => { if (c && !inv) save(null); }); // corrupted saved state: start over instead of crashing

  // Record a receipt only once Stellar has CONFIRMED the payment (never on local authorization).
  const invId = inv ? toHex(inv.invoiceId) : "";
  const receipt = receipts.find((r) => r.invoiceId === invId);
  useEffect(() => {
    if (!c || !inv || c.status !== "CONFIRMED" || receipt) return;
    const next = [receiptFor(inv, c.hash), ...loadReceipts().filter((r) => r.invoiceId !== invId)].slice(0, 200);
    setReceipts(next); try { localStorage.setItem(RECEIPTS, JSON.stringify(next)); } catch { }
  });
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([csv(receipts)], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `opentab-demo-receipts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function clearReceipts() {
    if (!confirm("Delete the local receipt log on this browser? On-chain payments are not affected.")) return;
    setReceipts([]); try { localStorage.removeItem(RECEIPTS); } catch { }
  }

  // Progressive disclosure: which stage of the existing payment state machine dominates the screen.
  const stage = !c ? -1 : c.status === "PRESENTED" ? 0 : c.status === "AUTHORIZED_LOCALLY" ? 2
    : c.status === "CONFIRMED" ? 3 : c.status === "FAILED" || c.status === "EXPIRED" ? -2 : 2.5;   // 2.5 = submitting / waiting
  const STAGES = ["Customer scans invoice", "Scan approval", "Submit to Stellar", "Receipt"];
  const stageClass = (i: number) => stage === 0 ? (i <= 1 ? "on" : "") : stage >= 2 && i < Math.floor(stage) ? "done" : i === Math.floor(stage) ? "on" : "";
  const summary = inv && (
    <p className="muted" data-testid="sale-summary">
      {inv.quote.items ? inv.quote.items.map((i) => `${i.name} × ${i.qty}`).join(", ") : "Custom amount"} · <b>{inv.quote.currency} {formatLocal(inv.quote.localMinor, inv.quote.minorDigits)}</b>
      {" "}= {formatTokenAmount(inv.amount, 7)} {TOKEN_CODE} · {merchantNameOf(inv.merchant)} · terminal #{inv.terminalId}
    </p>
  );
  const busySale = !!c && c.status !== "CONFIRMED" && c.status !== "FAILED" && c.status !== "EXPIRED";

  return (
    <>
      <h1>Merchant Checkout</h1>
      <p className="lead">Select a product and accept payment.</p>

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
          <button className="btn xl" disabled={!quote || charge <= 0n} onClick={createInvoice}>Generate Invoice QR</button>
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
              <button className="btn xl" onClick={() => { save(null); setNote(""); }}>New Sale</button>
              <button className="btn danger small" onClick={() => submit(true)}>Replay test: try to charge again</button>
            </>
          )}
          {c.status === "FAILED" && <><h2>Payment failed</h2>{summary}<div className="status bad">Payment failed: {c.error}<br /><TxLink hash={c.hash} /></div></>}
          {c.status === "EXPIRED" && <><h2>Invoice expired</h2>{summary}<div className="status bad">{c.error}</div></>}
          {note && <div className="status bad">{note}</div>}
          {c.status !== "CONFIRMED" && (
            <button className={"btn " + (stage === -2 ? "xl" : "ghost small")} onClick={() => { save(null); setNote(""); }}>{stage === -2 ? "New Sale" : "Cancel sale"}</button>
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
