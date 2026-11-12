// Testnet helper: recipient signs an invoice with the TS protocol package.
// Usage: node --experimental-strip-types scripts/sign-invoice.mts <keyfile> <family_id> <merchant G...> <local MXN> [terminal]
// Prints the CLI --auth JSON and --signature hex. The key file lives OUTSIDE the repo.
import * as P from "../packages/shared/src/index.ts";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const [keyfile, fam, merchant, local, term = "1", cmd] = process.argv.slice(2);
if (!existsSync(keyfile)) { mkdirSync(dirname(keyfile), { recursive: true }); writeFileSync(keyfile, P.toHex(P.generateSecretKey()), { mode: 0o600 }); }
const sk = P.fromHex(readFileSync(keyfile, "utf8").trim());
if (cmd === "pub" || fam === "pub") { console.log(P.toHex(P.publicKeyOf(sk))); process.exit(0); }
const q = { currency: "MXN", localMinor: P.parseLocalAmount(local, 2), minorDigits: 2, rate: "18.4200", source: "ILLUSTRATIVE" };
const now = BigInt(Math.floor(Date.now() / 1000));
const inv = { network: P.TESTNET_PASSPHRASE, vault: process.env.VAULT!, token: process.env.TOKEN!, merchant, merchantName: "CLI shop",
  terminalId: Number(term), invoiceId: P.randomBytes(32), amount: P.computeCharge(q), quote: q, expiresAt: now + 900n };
const a = P.signInvoice(inv, BigInt(fam), sk, now);
if (!P.verifyAuthorization(a)) throw new Error("local verify failed");
console.log(JSON.stringify({ auth: { family_id: Number(fam), signer: P.toHex(a.signer), merchant, terminal_id: inv.terminalId,
  invoice_id: P.toHex(inv.invoiceId), amount: inv.amount.toString(), quote_hash: P.toHex(P.quoteHash(q, inv.amount)),
  expires_at: Number(inv.expiresAt) }, signature: P.toHex(a.signature) }));
