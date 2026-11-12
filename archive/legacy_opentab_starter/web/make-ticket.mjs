// Command line helper for smoke tests, before the web app exists.
//   node make-ticket.mjs key                         -> makes a household key, prints its public key as hex
//   node make-ticket.mjs sign <contractId> <tabId> <cumulativeStroops>
// The key is written to ./household.secret (Testnet demo only, never commit it).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Keypair } from "@stellar/stellar-sdk";
import { signTicket } from "./ticket.mjs";

const FILE = new URL("./household.secret", import.meta.url);
const [cmd, contractId, tabId, cumulative] = process.argv.slice(2);

if (cmd === "key") {
  const kp = existsSync(FILE) ? Keypair.fromSecret(readFileSync(FILE, "utf8").trim()) : Keypair.random();
  writeFileSync(FILE, kp.secret());
  console.log("recipient_key (hex):", Buffer.from(kp.rawPublicKey()).toString("hex"));
  console.log("recipient public key:", kp.publicKey());
} else if (cmd === "sign") {
  const kp = Keypair.fromSecret(readFileSync(FILE, "utf8").trim());
  const t = signTicket(kp, contractId, BigInt(tabId), BigInt(cumulative));
  console.log(JSON.stringify(t, null, 2));
} else {
  console.error("usage: node make-ticket.mjs key | sign <contractId> <tabId> <cumulativeStroops>");
  process.exit(1);
}
