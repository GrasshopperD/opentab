import { describe, expect, it } from "vitest";
import * as P from "./index";
import vector from "../vectors/payment_v1.json";

const VAULT = "CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW";
const TOKEN = "CC6JPD3NL3ZJMWT2JG246ISOG5QB2N72BG77KPVC3OCDEYUHK2TEPL73";
const MERCHANT = "GCDSS6VQP6GGTV6K2J6FMG2TQN2G2EG37TSQ5UYQK547ODDYGNPPRWN4";
const MERCHANT2 = "GBIIBDC4PM237AP57I42FO4GGKDUC53ZAQXIOOALVFBNCOLDULKJGEAI";
const SECRET = new Uint8Array(32).fill(7);
const NOW = 1_800_000_000n;

function quote(): P.Quote {
  return { currency: "MXN", localMinor: 10000n, minorDigits: 2, rate: "18.4200", source: "ILLUSTRATIVE" };
}
function invoice(over: Partial<P.Invoice> = {}): P.Invoice {
  const q = quote();
  return {
    network: P.TESTNET_PASSPHRASE, vault: VAULT, token: TOKEN, merchant: MERCHANT, merchantName: "Tienda Rosa",
    terminalId: 1, invoiceId: new Uint8Array(32).fill(0x11), amount: P.computeCharge(q), quote: q,
    expiresAt: NOW + 600n, ...over,
  };
}

describe("canonical message", () => {
  it("is 340 bytes and deterministic", () => {
    const f = P.fieldsFor(invoice(), 1n, P.publicKeyOf(SECRET));
    const a = P.encodePaymentMessage(f), b = P.encodePaymentMessage(f);
    expect(a.length).toBe(340);
    expect(P.toHex(a)).toBe(P.toHex(b));
    expect(new TextDecoder().decode(a.slice(0, 5))).toBe("OTFV1");
  });
  it("matches the committed cross-language vector (also checked by the Rust test)", () => {
    const f = P.fieldsFor(invoice(), 1n, P.publicKeyOf(SECRET));
    const msg = P.encodePaymentMessage(f);
    expect(P.toHex(msg)).toBe(vector.message_hex);
    const a = P.signInvoice(invoice(), 1n, SECRET, NOW);
    expect(P.toHex(a.signature)).toBe(vector.signature_hex);
    expect(P.toHex(a.signer)).toBe(vector.public_key_hex);
    expect(P.toHex(P.networkId(P.TESTNET_PASSPHRASE))).toBe(vector.network_id_hex);
    expect(a.invoice.amount.toString()).toBe(vector.amount);
  });
  it("encodes negative i128 two's complement and rejects bad strkeys", () => {
    const f = P.fieldsFor(invoice(), 1n, P.publicKeyOf(SECRET));
    const m = P.encodePaymentMessage({ ...f, amount: -1n });
    expect(P.toHex(m.slice(284, 300))).toBe("ff".repeat(16));
    expect(() => P.encodePaymentMessage({ ...f, merchant: "GABC" })).toThrow();
  });
});

describe("signatures", () => {
  it("valid signature verifies", () => {
    expect(P.verifyAuthorization(P.signInvoice(invoice(), 1n, SECRET, NOW))).toBe(true);
  });
  it("tampered signature, amount, merchant, family, terminal, domain/network fail", () => {
    const a = P.signInvoice(invoice(), 1n, SECRET, NOW);
    const sig = a.signature.slice(); sig[0] ^= 1;
    expect(P.verifyAuthorization({ ...a, signature: sig })).toBe(false);
    expect(P.verifyAuthorization({ ...a, invoice: { ...a.invoice, amount: a.invoice.amount + 1n } })).toBe(false);
    expect(P.verifyAuthorization({ ...a, invoice: { ...a.invoice, merchant: MERCHANT2 } })).toBe(false);
    expect(P.verifyAuthorization({ ...a, familyId: 2n })).toBe(false);
    expect(P.verifyAuthorization({ ...a, invoice: { ...a.invoice, terminalId: 2 } })).toBe(false);
    expect(P.verifyAuthorization({ ...a, invoice: { ...a.invoice, network: "Public Global Stellar Network ; September 2015" } })).toBe(false);
    expect(P.verifyAuthorization({ ...a, invoice: { ...a.invoice, quote: { ...a.invoice.quote, rate: "1.0000" } } })).toBe(false);
  });
  it("fingerprint is stable", () => {
    expect(P.fingerprint(P.publicKeyOf(SECRET))).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
});

describe("invoice validation", () => {
  it("rejects expired, too-long, nonpositive, and quote-mismatched invoices", () => {
    expect(() => P.signInvoice(invoice({ expiresAt: NOW - 1n }), 1n, SECRET, NOW)).toThrow(/expired/);
    expect(() => P.signInvoice(invoice({ expiresAt: NOW + 90000n }), 1n, SECRET, NOW)).toThrow(/too long/);
    expect(() => P.signInvoice(invoice({ amount: 0n }), 1n, SECRET, NOW)).toThrow(/positive/);
    expect(() => P.signInvoice(invoice({ amount: 1n }), 1n, SECRET, NOW)).toThrow(/quote/);
  });
});

describe("QR payloads", () => {
  it("round-trip invoice and authorization", () => {
    const inv = invoice();
    const back = P.parseInvoiceQR(P.encodeInvoiceQR(inv));
    expect(P.toHex(P.encodePaymentMessage(P.fieldsFor(back, 1n, P.publicKeyOf(SECRET)))))
      .toBe(P.toHex(P.encodePaymentMessage(P.fieldsFor(inv, 1n, P.publicKeyOf(SECRET)))));
    const a = P.signInvoice(inv, 1n, SECRET, NOW);
    const qr = P.encodeAuthQR(a);
    expect(qr.length).toBeLessThan(700);
    expect(P.verifyAuthorization(P.parseAuthQR(qr))).toBe(true);
  });
  it("rejects malformed, wrong-prefix and mainnet payloads", () => {
    expect(() => P.parseInvoiceQR("hello")).toThrow();
    expect(() => P.parseInvoiceQR("OTI1:{bad json")).toThrow();
    expect(() => P.parseInvoiceQR('OTI1:{"n":"P"}')).toThrow();
    expect(() => P.parseAuthQR(P.encodeInvoiceQR(invoice()))).toThrow();
    const o = JSON.parse(P.encodeInvoiceQR(invoice()).slice(5)); o.n = "P";
    expect(() => P.parseInvoiceQR("OTI1:" + JSON.stringify(o))).toThrow(/network/);
  });
  it("pairing code carries only the public key", () => {
    const pub = P.publicKeyOf(SECRET);
    const code = P.encodePairingQR("Ana phone", pub);
    expect(code).not.toContain(P.toHex(SECRET));
    expect(P.toHex(P.parsePairingQR(code).pub)).toBe(P.toHex(pub));
  });
});

describe("itemized invoices", () => {
  const usd = (items: P.LineItem[]): P.Quote => ({ currency: "USD", localMinor: items.reduce((s, i) => s + i.unitMinor * BigInt(i.qty), 0n),
    minorDigits: 2, rate: "1.0000", source: "ILLUSTRATIVE", items });
  const itemInv = (items: P.LineItem[]) => { const q = usd(items); return invoice({ quote: q, amount: P.computeCharge(q) }); };
  const milk = [{ name: "Milk", qty: 1, unitMinor: 300n }];

  it("quote hash without items is unchanged (legacy vector still holds)", () => {
    const q = quote();
    expect(P.toHex(P.quoteHash({ ...q, items: undefined }, 1n))).toBe(P.toHex(P.quoteHash(q, 1n)));
  });
  it("items are bound into the signature; tampering with name, qty or unit price fails", () => {
    const a = P.signInvoice(itemInv(milk), 1n, SECRET, NOW);
    expect(a.invoice.amount).toBe(30_000_000n);                     // $3.00 at 1.0000 = 3 OTUSD
    expect(P.verifyAuthorization(a)).toBe(true);
    const swap = (it: P.LineItem[]) => ({ ...a, invoice: { ...a.invoice, quote: { ...a.invoice.quote, items: it } } });
    expect(P.verifyAuthorization(swap([{ name: "Water", qty: 1, unitMinor: 300n }]))).toBe(false);
    expect(P.verifyAuthorization(swap([{ name: "Milk", qty: 3, unitMinor: 100n }]))).toBe(false);
    expect(P.verifyAuthorization(swap(undefined as any))).toBe(false);  // stripping items also breaks it
    const back = P.parseAuthQR(P.encodeAuthQR(a));                    // survives the QR round trip
    expect(back.invoice.quote.items).toEqual(milk);
    expect(P.verifyAuthorization(back)).toBe(true);
  });
  it("rejects items that do not add up, bad names, bad quantities", () => {
    const bad = itemInv(milk); bad.quote = { ...bad.quote, localMinor: 400n }; bad.amount = P.computeCharge(bad.quote);
    expect(() => P.signInvoice(bad, 1n, SECRET, NOW)).toThrow(/add up/);
    expect(() => P.signInvoice(itemInv([{ name: "Milk|x", qty: 1, unitMinor: 300n }]), 1n, SECRET, NOW)).toThrow(/name/);
    expect(() => P.signInvoice(itemInv([{ name: "Milk", qty: 100, unitMinor: 300n }]), 1n, SECRET, NOW)).toThrow(/quantity/);
    const o = JSON.parse(P.encodeInvoiceQR(itemInv(milk)).slice(5)); o.li[0][1] = 2;   // edited QR text
    expect(() => P.parseInvoiceQR("OTI1:" + JSON.stringify(o))).toThrow(/add up/);
  });
});

describe("merchant checks the approval against the displayed invoice", () => {
  const milkQ: P.Quote = { currency: "USD", localMinor: 300n, minorDigits: 2, rate: "1.0000", source: "ILLUSTRATIVE", items: [{ name: "Milk", qty: 1, unitMinor: 300n }] };
  const shown = invoice({ quote: milkQ, amount: P.computeCharge(milkQ) });
  // What an app version from before itemized quotes does: its QR parser ignores `li`, so it signs and re-encodes without items.
  const staleSign = (inv: P.Invoice) => {
    const legacy = JSON.parse(P.encodeInvoiceQR(inv).slice(5)); delete legacy.li;
    return P.parseAuthQR(P.encodeAuthQR(P.signInvoice(P.parseInvoiceQR("OTI1:" + JSON.stringify(legacy)), 1n, SECRET, NOW)));
  };

  it("exact itemized approval (after the QR round trip) matches", () => {
    const a = P.parseAuthQR(P.encodeAuthQR(P.signInvoice(P.parseInvoiceQR(P.encodeInvoiceQR(shown)), 1n, SECRET, NOW)));
    expect(P.verifyAuthorization(a)).toBe(true);
    expect(P.authorizationMismatch(shown, a)).toBeNull();
  });
  it("valid non-itemized approval still matches its non-itemized invoice (backward compatible)", () => {
    const plain = invoice();
    expect(P.authorizationMismatch(plain, P.signInvoice(plain, 1n, SECRET, NOW))).toBeNull();
  });
  it("REGRESSION: an outdated app's approval of an itemized invoice is validly signed but rejected as OUTDATED_APP", () => {
    const a = staleSign(shown);
    expect(P.verifyAuthorization(a)).toBe(true);                     // the signature alone would have passed
    expect(a.invoice.quote.items).toBeUndefined();
    expect(P.authorizationMismatch(shown, a)).toBe("OUTDATED_APP");
  });
  it("any other signed difference is a MISMATCH (items, qty, price, terminal, expiry, merchant, amount, rate, currency, id)", () => {
    const variants: P.Invoice[] = [
      { ...shown, quote: { ...milkQ, items: [{ name: "Water", qty: 3, unitMinor: 100n }] } },
      { ...shown, terminalId: 2 },
      { ...shown, expiresAt: shown.expiresAt + 60n },
      { ...shown, merchant: MERCHANT2 },
      { ...shown, invoiceId: new Uint8Array(32).fill(0x22) },
    ];
    const q2: P.Quote = { ...milkQ, localMinor: 600n, items: [{ name: "Milk", qty: 2, unitMinor: 300n }] };
    variants.push({ ...shown, quote: q2, amount: P.computeCharge(q2) });
    const q3: P.Quote = { currency: "CAD", localMinor: 300n, minorDigits: 2, rate: "1.3900", source: "ILLUSTRATIVE", items: [{ name: "Milk", qty: 1, unitMinor: 300n }] };
    variants.push({ ...shown, quote: q3, amount: P.computeCharge(q3) });
    for (const v of variants) {
      const a = P.signInvoice(v, 1n, SECRET, NOW);
      expect(P.verifyAuthorization(a)).toBe(true);
      expect(P.authorizationMismatch(shown, a)).toBe("MISMATCH");
    }
    // An outdated app signing a DIFFERENT invoice is still a plain mismatch, not "outdated".
    expect(P.authorizationMismatch(shown, staleSign({ ...shown, terminalId: 9 }))).toBe("MISMATCH");
  });
});

describe("amounts", () => {
  it("integer conversions", () => {
    expect(P.parseTokenAmount("12.5")).toBe(125000000n);
    expect(P.parseTokenAmount("0.0000001")).toBe(1n);
    expect(() => P.parseTokenAmount("1.00000001")).toThrow();
    expect(() => P.parseTokenAmount("-1")).toThrow();
    expect(P.formatTokenAmount(54288817n)).toBe("5.42");
    expect(P.parseLocalAmount("100", 2)).toBe(10000n);
    expect(P.formatLocal(10050n, 2)).toBe("100.50");
  });
  it("charge rounds up deterministically", () => {
    // 100.00 MXN / 18.42 = 5.428881650... -> ceil at 7 dp
    expect(P.computeCharge(quote())).toBe(54288817n);
    expect(P.computeCharge({ ...quote(), currency: "USD", rate: "1", localMinor: 500n })).toBe(50000000n);
  });
});

describe("status machine", () => {
  it("never jumps to CONFIRMED from a local authorization and keeps UNKNOWN reconcilable", () => {
    expect(() => P.transition("AUTHORIZED_LOCALLY", "CONFIRMED")).toThrow();
    expect(P.transition("SUBMITTED", "UNKNOWN")).toBe("UNKNOWN");
    expect(P.transition("UNKNOWN", "CONFIRMED")).toBe("CONFIRMED");
    expect(() => P.transition("UNKNOWN", "SUBMITTED")).toThrow();
    expect(P.transition("UNKNOWN", "AUTHORIZED_LOCALLY")).toBe("AUTHORIZED_LOCALLY");
    expect(() => P.transition("EXPIRED", "SUBMITTED")).toThrow();
    expect(() => P.transition("CONFIRMED", "FAILED")).toThrow();
    expect(P.isPaid("PENDING")).toBe(false);
  });
});
