// OpenTab tickets. Runs in the browser and in Node. Needs no network.
//
// A ticket is the household's signature over the running total of the tab:
//   "OPENTAB1" + contract address (56 ASCII chars) + tab id (u64 BE) + total (i128 BE)
// The contract rebuilds the same bytes in `ticket_message` and checks the signature.
import { Keypair } from "@stellar/stellar-sdk";

const TAG = new TextEncoder().encode("OPENTAB1");

/** @param {string} contractId C... address  @param {bigint} tabId  @param {bigint} cumulative in stroops (7 decimals) */
export function ticketMessage(contractId, tabId, cumulative) {
  if (!/^C[A-Z2-7]{55}$/.test(contractId)) throw new Error("contractId must be a 56 character C... address");
  tabId = BigInt(tabId);
  cumulative = BigInt(cumulative);
  if (tabId < 0n || tabId >= 1n << 64n) throw new Error("tabId out of range");
  if (cumulative <= 0n || cumulative >= 1n << 127n) throw new Error("cumulative out of range");
  const out = new Uint8Array(8 + 56 + 8 + 16);
  out.set(TAG, 0);
  out.set(new TextEncoder().encode(contractId), 8);
  const view = new DataView(out.buffer);
  view.setBigUint64(64, tabId);
  view.setBigUint64(72, cumulative >> 64n);
  view.setBigUint64(80, cumulative & ((1n << 64n) - 1n));
  return out;
}

/** Household phone: sign the new running total. `keypair` is a Stellar Keypair kept on the phone. */
export function signTicket(keypair, contractId, tabId, cumulative) {
  const sig = keypair.sign(Buffer.from(ticketMessage(contractId, tabId, cumulative)));
  return { tabId: String(tabId), cumulative: String(cumulative), signature: Buffer.from(sig).toString("hex") };
}

/** Shop phone: check a ticket with no network. `recipientPublicKey` is the G... key stored when the tab opened. */
export function verifyTicket(recipientPublicKey, contractId, ticket, alreadySettled, funded) {
  const total = BigInt(ticket.cumulative);
  if (total <= BigInt(alreadySettled)) return { ok: false, why: "total does not go up" };
  if (total > BigInt(funded)) return { ok: false, why: "over the funded limit" };
  const ok = Keypair.fromPublicKey(recipientPublicKey).verify(
    Buffer.from(ticketMessage(contractId, ticket.tabId, total)),
    Buffer.from(ticket.signature, "hex"),
  );
  return ok ? { ok: true } : { ok: false, why: "signature is not from this household" };
}
