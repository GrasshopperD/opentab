// OpenTab Global shared protocol (browser-safe: Uint8Array only, no Node Buffer).
// Must stay byte-identical to contracts/family_vault/src/lib.rs::build_message.
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const DOMAIN_TAG = new Uint8Array([0x4f, 0x54, 0x46, 0x56, 0x31, 0, 0, 0]); // "OTFV1\0\0\0"
export const MESSAGE_LEN = 340;
export const MAX_INVOICE_WINDOW_S = 24 * 3600;
export const TOKEN_DECIMALS = 7;

// ---------- byte helpers ----------
const enc = new TextEncoder();
export const utf8 = (s: string) => enc.encode(s);
export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export function fromHex(h: string): Uint8Array {
  if (!/^([0-9a-fA-F]{2})*$/.test(h)) throw new ProtocolError("bad hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}
function u32be(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new ProtocolError("u32 out of range");
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}
function u64be(n: bigint): Uint8Array {
  if (n < 0n || n > 0xffffffffffffffffn) throw new ProtocolError("u64 out of range");
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, false);
  return b;
}
function i128be(n: bigint): Uint8Array {
  const min = -(1n << 127n), max = (1n << 127n) - 1n;
  if (n < min || n > max) throw new ProtocolError("i128 out of range");
  let v = n < 0n ? (1n << 128n) + n : n;
  const b = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}
function strkey(s: string): Uint8Array {
  if (!/^[GC][A-Z2-7]{55}$/.test(s)) throw new ProtocolError(`not a 56-char G/C strkey: ${s}`);
  return utf8(s);
}
function fixed(b: Uint8Array, n: number, what: string): Uint8Array {
  if (b.length !== n) throw new ProtocolError(`${what} must be ${n} bytes`);
  return b;
}

export class ProtocolError extends Error {}

// ---------- domain types ----------
export interface Quote {
  currency: string;      // ISO 4217, e.g. "MXN"
  localMinor: bigint;    // local price in minor units (e.g. centavos)
  minorDigits: number;   // 2 for MXN
  rate: string;          // local units per 1 token unit, decimal string, e.g. "18.4200"
  source: string;        // e.g. "ILLUSTRATIVE" (never "live" unless it is)
  /** Optional itemization. When present it is bound into quoteHash (so it is covered by the phone's signature)
   *  and must sum exactly to localMinor. Absent = hash identical to the original OTQ1 format. */
  items?: LineItem[];
}

export interface LineItem {
  name: string;          // [A-Za-z0-9 ] only, 1-24 chars (no separator characters, unambiguous canonical form)
  qty: number;           // integer 1..99
  unitMinor: bigint;     // unit price in the quote currency's minor units
}
export const MAX_LINE_ITEMS = 10;

export function validateItems(q: Quote): void {
  if (q.items === undefined) return;
  if (!Array.isArray(q.items) || q.items.length < 1 || q.items.length > MAX_LINE_ITEMS) throw new ProtocolError("bad line items");
  let sum = 0n;
  for (const it of q.items) {
    if (typeof it.name !== "string" || !/^[A-Za-z0-9 ]{1,24}$/.test(it.name)) throw new ProtocolError("bad item name");
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 99) throw new ProtocolError("bad item quantity");
    if (typeof it.unitMinor !== "bigint" || it.unitMinor <= 0n) throw new ProtocolError("bad item price");
    sum += it.unitMinor * BigInt(it.qty);
  }
  if (sum !== q.localMinor) throw new ProtocolError("items do not add up to the price");
}

/** Created by the merchant terminal; contains only public data. */
export interface Invoice {
  network: string;       // passphrase
  vault: string;         // FamilyVault contract C...
  token: string;         // token contract C...
  merchant: string;      // G... merchant account
  merchantName: string;  // display only (not signed; merchant address is)
  terminalId: number;
  invoiceId: Uint8Array; // 32 random bytes
  amount: bigint;        // token base units (7 decimals)
  quote: Quote;
  expiresAt: bigint;     // unix seconds
}

/** Created OFFLINE on the recipient phone. */
export interface SignedAuthorization {
  invoice: Invoice;
  familyId: bigint;
  signer: Uint8Array;    // 32-byte Ed25519 public key
  signature: Uint8Array; // 64 bytes
}

export interface PaymentFields {
  networkId: Uint8Array; vault: string; token: string; familyId: bigint; signer: Uint8Array;
  merchant: string; terminalId: number; invoiceId: Uint8Array; amount: bigint;
  quoteHash: Uint8Array; expiresAt: bigint;
}

// ---------- canonical message ----------
export const networkId = (passphrase: string) => sha256(utf8(passphrase));

export function quoteHash(q: Quote, amount: bigint): Uint8Array {
  let s = `OTQ1|${q.currency}|${q.localMinor}|${q.minorDigits}|${q.rate}|${q.source}|${amount}`;
  if (q.items !== undefined) {
    validateItems(q);
    s += "|L|" + q.items.map((i) => `${i.name}*${i.qty}*${i.unitMinor}`).join(";");
  }
  return sha256(utf8(s));
}

export function encodePaymentMessage(f: PaymentFields): Uint8Array {
  const parts = [
    DOMAIN_TAG, fixed(f.networkId, 32, "networkId"), strkey(f.vault), strkey(f.token),
    u64be(f.familyId), fixed(f.signer, 32, "signer"), strkey(f.merchant), u32be(f.terminalId),
    fixed(f.invoiceId, 32, "invoiceId"), i128be(f.amount), fixed(f.quoteHash, 32, "quoteHash"),
    u64be(f.expiresAt),
  ];
  const out = new Uint8Array(MESSAGE_LEN);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  if (o !== MESSAGE_LEN) throw new ProtocolError("length mismatch");
  return out;
}

export function fieldsFor(inv: Invoice, familyId: bigint, signer: Uint8Array): PaymentFields {
  return {
    networkId: networkId(inv.network), vault: inv.vault, token: inv.token, familyId, signer,
    merchant: inv.merchant, terminalId: inv.terminalId, invoiceId: inv.invoiceId,
    amount: inv.amount, quoteHash: quoteHash(inv.quote, inv.amount), expiresAt: inv.expiresAt,
  };
}

// ---------- invitation proof of possession ----------
/** What a recipient phone signs to prove it holds the private key for `pub` when accepting an invitation.
 *  Domain-separated from payments: starts with "OTINV1|" (payment messages are 340 binary bytes starting "OTFV1\0\0\0"),
 *  so this signature can never be a valid payment authorization. `challenge` is server-random and single-use. */
export interface PossessionFields { network: string; vault: string; inviteId: string; familyId: bigint; challenge: string; pub: Uint8Array }
export function possessionMessage(f: PossessionFields): Uint8Array {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(f.inviteId) || !/^[A-Za-z0-9_-]{32,64}$/.test(f.challenge)) throw new ProtocolError("bad invite fields");
  strkey(f.vault);
  return utf8(`OTINV1|${toHex(networkId(f.network))}|${f.vault}|${f.inviteId}|${f.familyId}|${f.challenge}|${toHex(fixed(f.pub, 32, "pub"))}`);
}
export function signPossession(f: Omit<PossessionFields, "pub">, secret: Uint8Array): { pub: Uint8Array; signature: Uint8Array } {
  const pub = publicKeyOf(secret);
  return { pub, signature: ed25519.sign(possessionMessage({ ...f, pub }), secret) };
}
export function verifyPossession(f: PossessionFields, signature: Uint8Array): boolean {
  try { return signature.length === 64 && ed25519.verify(signature, possessionMessage(f), f.pub); } catch { return false; }
}

// ---------- keys & signing ----------
export function generateSecretKey(): Uint8Array { return ed25519.utils.randomPrivateKey(); }
export const publicKeyOf = (secret: Uint8Array) => ed25519.getPublicKey(secret);
export function fingerprint(pub: Uint8Array): string {
  const h = toHex(sha256(pub)).slice(0, 12).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}

export function signInvoice(inv: Invoice, familyId: bigint, secret: Uint8Array, nowS: bigint): SignedAuthorization {
  validateInvoice(inv, nowS);
  const signer = publicKeyOf(secret);
  const msg = encodePaymentMessage(fieldsFor(inv, familyId, signer));
  return { invoice: inv, familyId, signer, signature: ed25519.sign(msg, secret) };
}

export function verifyAuthorization(a: SignedAuthorization): boolean {
  try {
    const msg = encodePaymentMessage(fieldsFor(a.invoice, a.familyId, a.signer));
    return ed25519.verify(a.signature, msg, a.signer);
  } catch { return false; }
}

/** Does a (signature-checked) authorization approve EXACTLY the invoice this terminal displayed?
 *  Compares every field the phone signs: network, vault, token, merchant, terminal, invoice id, amount, expiry and the
 *  quote hash (currency, local price, digits, rate, source and line items). Returns null when identical,
 *  "OUTDATED_APP" when the only difference is a missing item list (a phone running an app version from before itemized
 *  quotes signs the total without the items), or "MISMATCH" for any other difference. */
export function authorizationMismatch(shown: Invoice, a: SignedAuthorization): null | "OUTDATED_APP" | "MISMATCH" {
  const s = a.invoice;
  const same = (x: Invoice, y: Invoice) => {
    try {
      return x.network === y.network && x.vault === y.vault && x.token === y.token && x.merchant === y.merchant &&
        x.terminalId === y.terminalId && toHex(x.invoiceId) === toHex(y.invoiceId) && x.amount === y.amount &&
        x.expiresAt === y.expiresAt && toHex(quoteHash(x.quote, x.amount)) === toHex(quoteHash(y.quote, y.amount));
    } catch { return false; }
  };
  if (same(shown, s)) return null;
  if (shown.quote.items !== undefined && s.quote.items === undefined) {
    const { items: _drop, ...q } = shown.quote;
    if (same({ ...shown, quote: q }, s)) return "OUTDATED_APP";
  }
  return "MISMATCH";
}

export function validateInvoice(inv: Invoice, nowS: bigint): void {
  if (inv.amount <= 0n) throw new ProtocolError("amount must be positive");
  if (inv.expiresAt < nowS) throw new ProtocolError("invoice expired");
  if (inv.expiresAt > nowS + BigInt(MAX_INVOICE_WINDOW_S)) throw new ProtocolError("invoice window too long");
  if (inv.invoiceId.length !== 32) throw new ProtocolError("invoiceId must be 32 bytes");
  if (computeCharge(inv.quote) !== inv.amount) throw new ProtocolError("amount does not match quote");
  validateItems(inv.quote);
}

// ---------- amounts & FX (integer only) ----------
/** "12.5" -> 125000000n (7 decimals). Rejects >7 decimals. */
export function parseTokenAmount(s: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,7}))?$/.exec(s.trim());
  if (!m) throw new ProtocolError("invalid amount");
  return BigInt(m[1]) * 10n ** 7n + BigInt((m[2] ?? "").padEnd(7, "0") || "0");
}
export function formatTokenAmount(n: bigint, dp = 2): string {
  const neg = n < 0n; const a = neg ? -n : n;
  const whole = a / 10n ** 7n; const frac = (a % 10n ** 7n).toString().padStart(7, "0");
  const shown = dp === 7 ? frac : frac.slice(0, dp);
  return `${neg ? "-" : ""}${whole}${dp > 0 ? "." + shown : ""}`;
}
export function parseLocalAmount(s: string, minorDigits: number): bigint {
  const m = new RegExp(`^(\\d+)(?:\\.(\\d{1,${minorDigits}}))?$`).exec(s.trim());
  if (!m) throw new ProtocolError("invalid local amount");
  return BigInt(m[1]) * 10n ** BigInt(minorDigits) + BigInt((m[2] ?? "").padEnd(minorDigits, "0") || "0");
}
export function formatLocal(minor: bigint, digits: number): string {
  const d = 10n ** BigInt(digits);
  return `${minor / d}.${(minor % d).toString().padStart(digits, "0")}`;
}
/** Token base units = ceil(localMinor / 10^minorDigits / rate * 10^7). Deterministic. */
export function computeCharge(q: Quote): bigint {
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(q.rate);
  if (!m) throw new ProtocolError("invalid rate");
  const rd = (m[2] ?? "").length;
  const rateScaled = BigInt(m[1] + (m[2] ?? "")); // rate * 10^rd
  if (rateScaled <= 0n) throw new ProtocolError("rate must be positive");
  const num = q.localMinor * 10n ** 7n * 10n ** BigInt(rd);
  const den = rateScaled * 10n ** BigInt(q.minorDigits);
  return (num + den - 1n) / den;
}

// ---------- QR payloads (compact JSON, base64url bytes, versioned prefix) ----------
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function unb64u(s: string): Uint8Array {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "===".slice((p.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const NET_CODES: Record<string, string> = { T: TESTNET_PASSPHRASE };
function netCode(p: string) {
  const c = Object.keys(NET_CODES).find((k) => NET_CODES[k] === p);
  if (!c) throw new ProtocolError("only Testnet is supported");
  return c;
}

function invToObj(i: Invoice) {
  return { n: netCode(i.network), v: i.vault, t: i.token, m: i.merchant, mn: i.merchantName, ti: i.terminalId,
    id: b64u(i.invoiceId), a: i.amount.toString(), e: i.expiresAt.toString(),
    q: [i.quote.currency, i.quote.localMinor.toString(), i.quote.minorDigits, i.quote.rate, i.quote.source],
    ...(i.quote.items ? { li: i.quote.items.map((x) => [x.name, x.qty, x.unitMinor.toString()]) } : {}) };
}
function objToInv(o: any): Invoice {
  if (!o || typeof o !== "object" || !Array.isArray(o.q) || o.q.length !== 5) throw new ProtocolError("malformed invoice");
  const network = NET_CODES[o.n];
  if (!network) throw new ProtocolError("unknown network");
  const str = (x: unknown, w: string) => { if (typeof x !== "string") throw new ProtocolError(`bad ${w}`); return x; };
  const big = (x: unknown, w: string) => { if (typeof x !== "string" || !/^-?\d+$/.test(x)) throw new ProtocolError(`bad ${w}`); return BigInt(x); };
  if (!Number.isInteger(o.ti) || !Number.isInteger(o.q[2])) throw new ProtocolError("bad integer field");
  const inv: Invoice = {
    network, vault: str(o.v, "vault"), token: str(o.t, "token"), merchant: str(o.m, "merchant"),
    merchantName: str(o.mn, "merchantName").slice(0, 60), terminalId: o.ti, invoiceId: unb64u(str(o.id, "id")),
    amount: big(o.a, "amount"), expiresAt: big(o.e, "expiry"),
    quote: { currency: str(o.q[0], "currency"), localMinor: big(o.q[1], "local"), minorDigits: o.q[2],
      rate: str(o.q[3], "rate"), source: str(o.q[4], "source") },
  };
  if (o.li !== undefined) {
    if (!Array.isArray(o.li)) throw new ProtocolError("bad line items");
    inv.quote.items = o.li.map((x: unknown) => {
      if (!Array.isArray(x) || x.length !== 3 || !Number.isInteger(x[1])) throw new ProtocolError("bad line items");
      return { name: str(x[0], "item name"), qty: x[1], unitMinor: big(x[2], "item price") };
    });
    validateItems(inv.quote);
  }
  for (const a of [inv.vault, inv.token, inv.merchant]) strkey(a);
  if (inv.invoiceId.length !== 32) throw new ProtocolError("bad invoice id");
  return inv;
}

export function encodeInvoiceQR(i: Invoice): string { return "OTI1:" + JSON.stringify(invToObj(i)); }
export function parseInvoiceQR(s: string): Invoice {
  s = s.trim();
  if (!s.startsWith("OTI1:")) throw new ProtocolError("not an OpenTab invoice");
  let o: unknown;
  try { o = JSON.parse(s.slice(5)); } catch { throw new ProtocolError("malformed invoice"); }
  return objToInv(o);
}
export function encodeAuthQR(a: SignedAuthorization): string {
  return "OTA1:" + JSON.stringify({ i: invToObj(a.invoice), f: a.familyId.toString(), k: b64u(a.signer), s: b64u(a.signature) });
}
export function parseAuthQR(s: string): SignedAuthorization {
  s = s.trim();
  if (!s.startsWith("OTA1:")) throw new ProtocolError("not an OpenTab authorization");
  let o: any;
  try { o = JSON.parse(s.slice(5)); } catch { throw new ProtocolError("malformed authorization"); }
  if (!o || typeof o.f !== "string" || !/^\d+$/.test(o.f) || typeof o.k !== "string" || typeof o.s !== "string")
    throw new ProtocolError("malformed authorization");
  const a = { invoice: objToInv(o.i), familyId: BigInt(o.f), signer: unb64u(o.k), signature: unb64u(o.s) };
  if (a.signer.length !== 32 || a.signature.length !== 64) throw new ProtocolError("bad key/signature length");
  return a;
}
export function encodePairingQR(familyHint: string, pub: Uint8Array): string {
  return `OTK1:${toHex(pub)}:${familyHint.replace(/[^\w -]/g, "").slice(0, 40)}`;
}
export function parsePairingQR(s: string): { pub: Uint8Array; label: string } {
  const m = /^OTK1:([0-9a-f]{64}):(.*)$/.exec(s.trim());
  if (!m) throw new ProtocolError("not an OpenTab pairing code");
  return { pub: fromHex(m[1]), label: m[2] };
}

// ---------- payment status machine ----------
export type PaymentStatus =
  | "CREATED" | "PRESENTED" | "AUTHORIZED_LOCALLY" | "SUBMITTED" | "PENDING"
  | "CONFIRMED" | "FAILED" | "EXPIRED" | "UNKNOWN";
const NEXT: Record<PaymentStatus, PaymentStatus[]> = {
  CREATED: ["PRESENTED", "EXPIRED"],
  PRESENTED: ["AUTHORIZED_LOCALLY", "EXPIRED"],
  AUTHORIZED_LOCALLY: ["SUBMITTED", "EXPIRED"],
  SUBMITTED: ["PENDING", "CONFIRMED", "FAILED", "UNKNOWN"],
  PENDING: ["CONFIRMED", "FAILED", "UNKNOWN"],
  UNKNOWN: ["CONFIRMED", "FAILED", "PENDING", "AUTHORIZED_LOCALLY"], // reconciled; may retry the SAME invoice only (on-chain nonce makes a double charge impossible)
  CONFIRMED: [], FAILED: [], EXPIRED: [],
};
export function transition(from: PaymentStatus, to: PaymentStatus): PaymentStatus {
  if (!NEXT[from].includes(to)) throw new ProtocolError(`illegal status transition ${from} -> ${to}`);
  return to;
}
export const isPaid = (s: PaymentStatus) => s === "CONFIRMED";
