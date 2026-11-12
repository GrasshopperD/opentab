// REAL Testnet end-to-end test against a running app (default http://localhost:3000).
// Not mocked: creates a family, pairs a fresh key, pays, and attempts a replay on chain.
// Usage: node --experimental-strip-types scripts/e2e-api.mts [baseUrl]
import * as P from "../packages/shared/src/index.ts";

const BASE = process.argv[2] ?? "http://localhost:3000";
const VAULT = "CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW";
const TOKEN = "CC6JPD3NL3ZJMWT2JG246ISOG5QB2N72BG77KPVC3OCDEYUHK2TEPL73";
const MERCHANT_A = "GCDSS6VQP6GGTV6K2J6FMG2TQN2G2EG37TSQ5UYQK547ODDYGNPPRWN4";
const MERCHANT_B = "GBIIBDC4PM237AP57I42FO4GGKDUC53ZAQXIOOALVFBNCOLDULKJGEAI";
let failures = 0;
const check = (name: string, cond: boolean, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); if (!cond) failures++; };
const post = async (p: string, b: any) => (await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();
const get = async (p: string) => (await fetch(BASE + p)).json();

for (const r of ["/", "/sender", "/family", "/shop", "/manifest.webmanifest", "/sw.js"]) {
  const s = (await fetch(BASE + r)).status; check(`GET ${r}`, s === 200, String(s));
}

const fam = await post("/api/sender/family", { amount: "5" });
check("create + fund family", !!fam.familyId && fam.depositStatus === "CONFIRMED", `family=${fam.familyId} create=${fam.createTx} deposit=${fam.depositTx}`);
const familyId = BigInt(fam.familyId);

const sk = P.generateSecretKey(); // ephemeral test key, never persisted
const pub = P.toHex(P.publicKeyOf(sk));
const reg = await post("/api/sender/key", { familyId: String(familyId), publicKey: pub });
check("register recipient key", reg.status === "CONFIRMED", `tx=${reg.hash}`);

function invoice(merchant: string, name: string, price: string): P.Invoice {
  const q = { currency: "MXN", localMinor: P.parseLocalAmount(price, 2), minorDigits: 2, rate: "18.4200", source: "ILLUSTRATIVE" };
  return { network: P.TESTNET_PASSPHRASE, vault: VAULT, token: TOKEN, merchant, merchantName: name, terminalId: 3,
    invoiceId: P.randomBytes(32), amount: P.computeCharge(q), quote: q, expiresAt: BigInt(Math.floor(Date.now() / 1000) + 600) };
}
const now = () => BigInt(Math.floor(Date.now() / 1000));

// Offline-equivalent step: signing uses only local data (no fetch in signInvoice).
const invA = P.parseInvoiceQR(P.encodeInvoiceQR(invoice(MERCHANT_A, "Tienda Rosa", "20.00")));
const authA = P.encodeAuthQR(P.signInvoice(invA, familyId, sk, now()));
const payA = await post("/api/merchant/pay", { merchantId: "A", authorization: authA });
check("merchant A payment CONFIRMED", payA.status === "CONFIRMED", `tx=${payA.hash} amount=${invA.amount}`);

const replay = await post("/api/merchant/pay", { merchantId: "A", authorization: authA, forceSubmitForDemo: true });
check("replay rejected by contract", replay.status === "FAILED" && replay.error === "InvoiceUsed", JSON.stringify(replay));
const replay2 = await post("/api/merchant/pay", { merchantId: "A", authorization: authA });
check("replay rejected by idempotency pre-check", replay2.error === "InvoiceUsed");

const wrong = await post("/api/merchant/pay", { merchantId: "B", authorization: authA });
check("other merchant cannot use approval", !!wrong.error && wrong.status !== "CONFIRMED", wrong.detail ?? wrong.error);

const invB = invoice(MERCHANT_B, "Farmacia Luz", "10.00");
const payB = await post("/api/merchant/pay", { merchantId: "B", authorization: P.encodeAuthQR(P.signInvoice(invB, familyId, sk, now())) });
check("same family balance at merchant B CONFIRMED", payB.status === "CONFIRMED", `tx=${payB.hash}`);

const over = invoice(MERCHANT_A, "Tienda Rosa", "999.00");
const payOver = await post("/api/merchant/pay", { merchantId: "A", authorization: P.encodeAuthQR(P.signInvoice(over, familyId, sk, now())) });
check("overspend rejected", payOver.error === "InsufficientFunds", JSON.stringify(payOver));

const tampered = JSON.parse(authA.slice(5)); tampered.i.a = "1"; tampered.i.id = tampered.i.id.replace(/^./, "A");
const payT = await post("/api/merchant/pay", { merchantId: "A", authorization: "OTA1:" + JSON.stringify(tampered) });
check("tampered amount rejected", !!payT.error);

const after = await get(`/api/family/${familyId}?key=${pub}`);
const expected = P.parseTokenAmount("5") - invA.amount - invB.amount;
check("family balance decreased exactly", BigInt(after.family.balance) === expected, `balance=${after.family.balance} expected=${expected}`);
check("key active", after.keyActive === true);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
