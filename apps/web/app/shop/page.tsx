"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  computeCharge, encodeInvoiceQR, formatLocal, formatTokenAmount, parseAuthQR, parseInvoiceQR, parseLocalAmount,
  randomBytes, toHex, verifyAuthorization, type Invoice, type PaymentStatus, type Quote,
} from "@opentab/shared";
import { api, DemoAccess, ERROR_TEXT, QR, Scanner, TxLink } from "../components";
import { DEMO_RATES, MERCHANTS, NETWORK_PASSPHRASE, RATE_SOURCE, TOKEN_CODE, TOKEN_ID, VAULT_ID } from "@/lib/config";

const CUR = "opentab.shop.current";
const merchantNameOf = (a: string) => MERCHANTS.find((m) => m.address === a)?.name ?? "this shop"; // survives refresh so a pending payment can be reconciled

interface Current { merchantId: string; invoiceQR: string; authQR?: string; status: PaymentStatus; hash?: string; error?: string }

export default function Shop() {
  const [mid, setMid] = useState<"A" | "B">("A");
  const [terminal, setTerminal] = useState("1");
  const [cur, setCur] = useState("MXN");
  const [price, setPrice] = useState("100.00");
  const [c, setC] = useState<Current | null>(null);
  const [info, setInfo] = useState<any>(null);
  const [note, setNote] = useState("");
  const merchant = MERCHANTS.find((m) => m.id === mid)!;

  const save = (x: Current | null) => { setC(x); try { x ? localStorage.setItem(CUR, JSON.stringify(x)) : localStorage.removeItem(CUR); } catch { } };
  useEffect(() => { try { const s = localStorage.getItem(CUR); if (s) { const x = JSON.parse(s); setC(x); setMid(x.merchantId); } } catch { } }, []);

  const loadInfo = useCallback(async () => setInfo(await api(`/api/merchant/${mid}`)), [mid]);
  useEffect(() => { loadInfo(); }, [loadInfo]);

  const quote: Quote | null = useMemo(() => {
    try {
      const r = DEMO_RATES[cur];
      return { currency: cur, localMinor: parseLocalAmount(price, r.digits), minorDigits: r.digits, rate: r.rate, source: RATE_SOURCE };
    } catch { return null; }
  }, [cur, price]);
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
      if (a.invoice.amount !== inv.amount || a.invoice.merchant !== inv.merchant) throw new Error("Approval does not match this invoice.");
      if (!verifyAuthorization(a)) throw new Error("Signature check failed. Do not hand over goods.");
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

  return (
    <>
      <h1>Shop checkout</h1>
      <p className="lead">Price in local currency. The customer approves on their phone; you get paid on Stellar.</p>
      <DemoAccess />
      <div className="card">
        <div className="row">
          <div><label>Shop</label>
            <select value={mid} onChange={(e) => setMid(e.target.value as "A" | "B")} disabled={!!c}>
              {MERCHANTS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></div>
          <div><label>Terminal</label><input inputMode="numeric" value={terminal} onChange={(e) => setTerminal(e.target.value.replace(/\D/g, ""))} disabled={!!c} /></div>
        </div>
        <p className="muted">Settlement balance: <b>{info?.balance !== undefined ? formatTokenAmount(BigInt(info.balance), 7) : "…"} {TOKEN_CODE}</b> (on chain). Bank payout: not available (no licensed provider yet).</p>
      </div>

      {!c && (
        <div className="card">
          <h2>New sale</h2>
          <div className="row">
            <div><label>Currency</label>
              <select value={cur} onChange={(e) => setCur(e.target.value)}>{Object.keys(DEMO_RATES).map((k) => <option key={k}>{k}</option>)}</select></div>
            <div><label>Price</label><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>
          {quote ? (
            <dl className="kv">
              <dt>Local price</dt><dd>{cur} {formatLocal(quote.localMinor, quote.minorDigits)}</dd>
              <dt>Actual Testnet charge</dt><dd><b>{formatTokenAmount(charge, 7)} {TOKEN_CODE}</b></dd>
              <dt>Rate</dt><dd>{quote.rate} {cur} per demo USD · illustrative, not a live quote</dd>
            </dl>
          ) : <p className="warn">Enter a valid price.</p>}
          <button className="btn" disabled={!quote || charge <= 0n} onClick={createInvoice}>Show invoice QR</button>
        </div>
      )}

      {c && inv && (
        <div className="card">
          <h2>Invoice {toHex(inv.invoiceId).slice(0, 8)} · {inv.quote.currency} {formatLocal(inv.quote.localMinor, inv.quote.minorDigits)} = {formatTokenAmount(inv.amount, 7)} {TOKEN_CODE}</h2>
          {c.status === "PRESENTED" && (
            <>
              <p className="muted">1. Customer scans this (their phone can be offline).</p>
              <QR value={c.invoiceQR} label="Invoice QR" />
              <p className="muted">2. Scan the customer&apos;s approval.</p>
              <Scanner prompt="Scan customer approval" onResult={onAuth} />
            </>
          )}
          {c.status === "AUTHORIZED_LOCALLY" && (
            <>
              <div className="status info">Approval received and signature checked. NOT PAID until Stellar confirms.</div>
              <button className="btn" onClick={() => submit(false)}>Submit to Stellar</button>
            </>
          )}
          {c.status === "SUBMITTED" && <div className="status pending">Submitting to Stellar… do not hand over goods yet.</div>}
          {(c.status === "PENDING" || c.status === "UNKNOWN") && (
            <div className="status pending">Status {c.status}: waiting for final confirmation. Do not resubmit; checking by transaction hash…<br /><TxLink hash={c.hash} /></div>
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
              <p className="muted">You may hand over the goods.</p>
              <button className="btn danger small" onClick={() => submit(true)}>Replay test: try to charge again</button>
            </>
          )}
          {c.status === "FAILED" && <div className="status bad">Payment failed: {c.error}<br /><TxLink hash={c.hash} /></div>}
          {c.status === "EXPIRED" && <div className="status bad">{c.error}</div>}
          {(c.status === "PENDING" || c.status === "UNKNOWN") && <button className="btn ghost small" onClick={reconcile}>Check status now</button>}
          {note && <div className="status bad">{note}</div>}
          <button className="btn ghost small" onClick={() => { save(null); setNote(""); }}>New sale</button>
        </div>
      )}

      <div className="card">
        <h2>Recent settlements</h2>
        {!info?.payments?.length ? <p className="muted">None in the recent event window.</p> : (
          <ul className="list">{info.payments.map((p: any) => (
            <li key={p.txHash + p.invoiceId}>{formatTokenAmount(BigInt(p.amount), 7)} {TOKEN_CODE} · family #{String(p.familyId)} · terminal {p.terminalId}<br /><TxLink hash={p.txHash} /></li>
          ))}</ul>
        )}
      </div>
    </>
  );
}
