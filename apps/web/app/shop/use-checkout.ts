"use client";
// ONE merchant checkout implementation shared by Demo Mode (/shop) and Product Mode (/business/checkout).
// Moved unchanged from app/shop/page.tsx: invoice creation, approval verification (signature + exact invoice match),
// submission to Stellar, PENDING/UNKNOWN reconciliation, and receipts recorded only after Stellar CONFIRMED.
// Both screens use the same localStorage keys, so a sale started on one is the same sale on the other.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  authorizationMismatch, computeCharge, encodeInvoiceQR, parseAuthQR, parseInvoiceQR,
  randomBytes, toHex, verifyAuthorization, type Invoice, type PaymentStatus, type Quote,
} from "@opentab/shared";
import { api, ERROR_TEXT } from "../components";
import { MERCHANTS, NETWORK_PASSPHRASE, TOKEN_ID, VAULT_ID } from "@/lib/config";
import { CUR, RECEIPTS, csv, loadReceipts, receiptFor, type Receipt } from "@/lib/checkout";

export interface Current { merchantId: string; invoiceQR: string; authQR?: string; status: PaymentStatus; hash?: string; error?: string }

/** Which demo shop identity + terminal number this browser's checkout uses (set in Product onboarding or settings). */
const SETTINGS = "opentab.shop.settings";
export function loadShopSettings(): { mid: "A" | "B"; terminal: string } {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS) || "null"); if (s && (s.mid === "A" || s.mid === "B") && /^\d{1,4}$/.test(String(s.terminal))) return { mid: s.mid, terminal: String(s.terminal) }; } catch { }
  return { mid: "A", terminal: "1" };
}
export function saveShopSettings(s: { mid: "A" | "B"; terminal: string }) { try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { } }

export function useCheckout() {
  const [mid, setMidState] = useState<"A" | "B">("A");
  const [terminal, setTerminalState] = useState("1");
  useEffect(() => { const s = loadShopSettings(); setMidState(s.mid); setTerminalState(s.terminal); }, []);
  const setMid = (m: "A" | "B") => { setMidState(m); saveShopSettings({ mid: m, terminal: terminal || "1" }); };
  const setTerminal = (t: string) => { setTerminalState(t); if (/^\d{1,4}$/.test(t)) saveShopSettings({ mid, terminal: t }); };
  const [c, setC] = useState<Current | null>(null);
  const [info, setInfo] = useState<any>(null);
  const [note, setNote] = useState("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  useEffect(() => { setReceipts(loadReceipts()); }, []);
  const merchant = MERCHANTS.find((m) => m.id === mid)!;

  const save = (x: Current | null) => { setC(x); try { x ? localStorage.setItem(CUR, JSON.stringify(x)) : localStorage.removeItem(CUR); } catch { } };
  useEffect(() => { try { const s = localStorage.getItem(CUR); if (s) { const x = JSON.parse(s); setC(x); setMidState(x.merchantId); } } catch { } }, []);

  const loadInfo = useCallback(async () => setInfo(await api(`/api/merchant/${mid}`)), [mid]);
  useEffect(() => { loadInfo(); }, [loadInfo]);

  function createInvoice(quote: Quote | null) {
    const charge = quote && quote.localMinor > 0n ? computeCharge(quote) : 0n;
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
  /** New Sale / Cancel sale: clears only the current sale; the receipt history is kept. */
  function newSale() { save(null); setNote(""); }

  // Progressive disclosure: which stage of the payment state machine dominates the screen.
  const stage = !c ? -1 : c.status === "PRESENTED" ? 0 : c.status === "AUTHORIZED_LOCALLY" ? 2
    : c.status === "CONFIRMED" ? 3 : c.status === "FAILED" || c.status === "EXPIRED" ? -2 : 2.5;   // 2.5 = submitting / waiting
  const busySale = !!c && c.status !== "CONFIRMED" && c.status !== "FAILED" && c.status !== "EXPIRED";

  return {
    mid, setMid, terminal, setTerminal, merchant, c, inv, info, note, receipts, receipt, stage, busySale,
    createInvoice, onAuth, submit, reconcile, exportCsv, clearReceipts, newSale,
  };
}
