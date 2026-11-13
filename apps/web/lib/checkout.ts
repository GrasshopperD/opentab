// Pure merchant-checkout helpers shared by Demo Mode (/shop) and Product Mode (/business/checkout). No React, no secrets.
// Moved unchanged from app/shop/page.tsx; quote builders added so both screens build quotes with the same rules.
import { formatLocal, formatTokenAmount, parseLocalAmount, toHex, type Invoice, type Quote } from "@opentab/shared";
import { CATALOG, CATALOG_CURRENCY, DEMO_RATES, MERCHANTS, RATE_SOURCE, TOKEN_CODE } from "./config";

export const CUR = "opentab.shop.current";
export const RECEIPTS = "opentab.shop.receipts"; // local demo record on THIS browser only (no backend accounting)
export const merchantNameOf = (a: string) => MERCHANTS.find((m) => m.address === a)?.name ?? "this shop"; // survives refresh so a pending payment can be reconciled

/** Built only from the SIGNED invoice (items are covered by the customer's signature) plus the confirmed tx. */
export interface Receipt {
  invoiceId: string; merchantName: string; merchant: string; terminalId: number;
  lines: { product: string; qty: number; unit: string; total: string }[];
  currency: string; total: string; charge: string; txHash?: string; status: "CONFIRMED"; confirmedAt: string;
}
export function loadReceipts(): Receipt[] { try { const r = JSON.parse(localStorage.getItem(RECEIPTS) || "[]"); return Array.isArray(r) ? r : []; } catch { return []; } }
export function receiptFor(inv: Invoice, hash: string | undefined): Receipt {
  const d = inv.quote.minorDigits;
  const lines = inv.quote.items?.length
    ? inv.quote.items.map((i) => ({ product: i.name, qty: i.qty, unit: formatLocal(i.unitMinor, d), total: formatLocal(i.unitMinor * BigInt(i.qty), d) }))
    : [{ product: "Custom amount", qty: 1, unit: formatLocal(inv.quote.localMinor, d), total: formatLocal(inv.quote.localMinor, d) }];
  return { invoiceId: toHex(inv.invoiceId), merchantName: merchantNameOf(inv.merchant), merchant: inv.merchant, terminalId: inv.terminalId,
    lines, currency: inv.quote.currency, total: formatLocal(inv.quote.localMinor, d), charge: formatTokenAmount(inv.amount, 7),
    txHash: hash, status: "CONFIRMED", confirmedAt: new Date().toISOString() };
}
export function csv(rows: Receipt[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["confirmed_at", "merchant", "terminal", "invoice_id", "product", "quantity", "unit_price", "line_total", "currency", "invoice_total", `charged_${TOKEN_CODE}`, "stellar_tx_hash", "status"];
  const body = rows.flatMap((r) => r.lines.map((l) => [r.confirmedAt, r.merchantName, r.terminalId, r.invoiceId, l.product, l.qty, l.unit, l.total, r.currency, r.total, r.charge, r.txHash ?? "", r.status].map(q).join(",")));
  return [head.join(","), ...body].join("\r\n");
}

/** Catalog quote. Every item, quantity and unit price goes into the quote hash, so the customer's signature covers them.
 *  Returns null for an empty or invalid order (quantities 1-99, at most 10 different items: the protocol's limits). */
export function catalogQuote(lines: { sku: string; qty: number }[]): Quote | null {
  const items = lines.filter((l) => l.qty > 0).map((l) => {
    const p = CATALOG.find((x) => x.sku === l.sku);
    if (!p || !Number.isInteger(l.qty) || l.qty > 99) throw new Error("bad line");
    return { name: p.name, qty: l.qty, unitMinor: p.unitMinor };
  });
  if (!items.length || items.length > 10) return null;
  const r = DEMO_RATES[CATALOG_CURRENCY];
  return { currency: CATALOG_CURRENCY, localMinor: items.reduce((s, i) => s + i.unitMinor * BigInt(i.qty), 0n), minorDigits: r.digits,
    rate: r.rate, source: RATE_SOURCE, items };
}
/** Custom local-currency amount without an item list (Demo Mode). Throws on an invalid price. */
export function customQuote(cur: string, price: string): Quote {
  const r = DEMO_RATES[cur];
  return { currency: cur, localMinor: parseLocalAmount(price, r.digits), minorDigits: r.digits, rate: r.rate, source: RATE_SOURCE };
}
