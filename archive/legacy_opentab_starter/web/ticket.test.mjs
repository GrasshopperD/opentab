import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { ticketMessage, signTicket, verifyTicket } from "./ticket.mjs";

// Same fixtures as the Rust test `browser_and_contract_agree_on_a_ticket`.
const CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const household = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));
const UNIT = 10_000_000n;

test("message layout", () => {
  const m = ticketMessage(CONTRACT, 3n, 125n * UNIT / 10n);
  assert.equal(m.length, 88);
  assert.equal(Buffer.from(m.slice(0, 8)).toString(), "OPENTAB1");
  assert.equal(Buffer.from(m.slice(8, 64)).toString(), CONTRACT);
  assert.equal(Buffer.from(m.slice(64)).toString("hex"), "0000000000000003" + "00000000000000000000000007735940");
});

test("known answer shared with the contract tests", () => {
  const t = signTicket(household, CONTRACT, 3n, 125n * UNIT / 10n);
  console.log("PUBKEY_HEX", Buffer.from(household.rawPublicKey()).toString("hex"));
  console.log("SIG_HEX", t.signature);
  assert.equal(t.signature.length, 128);
});

test("shop side checks", () => {
  const t = signTicket(household, CONTRACT, 3n, 20n * UNIT);
  const pk = household.publicKey();
  assert.deepEqual(verifyTicket(pk, CONTRACT, t, 0n, 50n * UNIT), { ok: true });
  assert.equal(verifyTicket(pk, CONTRACT, t, 20n * UNIT, 50n * UNIT).ok, false);
  assert.equal(verifyTicket(pk, CONTRACT, t, 0n, 10n * UNIT).ok, false);
  assert.equal(verifyTicket(pk, CONTRACT, { ...t, cumulative: String(30n * UNIT) }, 0n, 50n * UNIT).ok, false);
  assert.equal(verifyTicket(Keypair.random().publicKey(), CONTRACT, t, 0n, 50n * UNIT).ok, false);
});
