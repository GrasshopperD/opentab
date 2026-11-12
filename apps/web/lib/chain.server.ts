// SERVER-ONLY. Holds Testnet demo signers read from server env vars.
// Never import this file from a client component.
import "server-only";
import { Contract, Keypair, rpc, TransactionBuilder, xdr, nativeToScVal, scValToNative, Address, BASE_FEE } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, RPC_URL, VAULT_ID, TOKEN_ID } from "./config";

const server = new rpc.Server(RPC_URL);

export type Role = "sender" | "merchantA" | "merchantB";
function signer(role: Role): Keypair {
  const env = { sender: "SENDER_SECRET", merchantA: "MERCHANT_A_SECRET", merchantB: "MERCHANT_B_SECRET" }[role];
  const s = process.env[env];
  if (!s) throw new ChainError("NOT_CONFIGURED", `Server is missing ${env} (Testnet demo signer).`);
  return Keypair.fromSecret(s);
}
export const roleAddress = (role: Role) => signer(role).publicKey();

export class ChainError extends Error {
  constructor(public code: string, message: string, public hash?: string) { super(message); }
}

const CONTRACT_ERRORS: Record<number, string> = {
  1: "FamilyNotFound", 2: "NonPositiveAmount", 3: "KeyNotActive", 4: "InvoiceUsed", 5: "InvoiceExpired",
  6: "InvoiceWindowTooLong", 7: "InsufficientFunds", 8: "KeyAlreadyRegistered", 9: "UnsupportedAddress", 10: "Overflow",
};
export function mapError(msg: string): string {
  const m = /Error\(Contract, #(\d+)\)/.exec(msg);
  if (m) return CONTRACT_ERRORS[Number(m[1])] ?? `Contract#${m[1]}`;
  if (/Crypto, InvalidInput|ed25519/i.test(msg)) return "BadSignature";
  if (/Auth, InvalidAction/.test(msg)) return "Unauthorized";
  return "SimulationFailed";
}

const u64 = (n: bigint) => nativeToScVal(n, { type: "u64" });
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const bytes = (b: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(b));
const addr = (s: string) => new Address(s).toScVal();

export interface AuthArgs {
  familyId: bigint; signer: Uint8Array; merchant: string; terminalId: number; invoiceId: Uint8Array;
  amount: bigint; quoteHash: Uint8Array; expiresAt: bigint;
}
export function authStruct(a: AuthArgs): xdr.ScVal {
  // Soroban struct = ScMap with symbol keys in sorted order.
  const entries: [string, xdr.ScVal][] = [
    ["amount", i128(a.amount)], ["expires_at", u64(a.expiresAt)], ["family_id", u64(a.familyId)],
    ["invoice_id", bytes(a.invoiceId)], ["merchant", addr(a.merchant)], ["quote_hash", bytes(a.quoteHash)],
    ["signer", bytes(a.signer)], ["terminal_id", nativeToScVal(a.terminalId, { type: "u32" })],
  ];
  return xdr.ScVal.scvMap(entries.map(([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v })));
}
export const scv = { u64, i128, bytes, addr };

/** Read-only call via simulation. */
export async function read(contractId: string, method: string, args: xdr.ScVal[]): Promise<any> {
  const src = await server.getAccount(roleAddress("sender"));
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new ChainError(mapError(sim.error), sim.error);
  return sim.result ? scValToNative(sim.result.retval) : undefined;
}

export interface Submitted { hash: string; status: "CONFIRMED" | "FAILED" | "PENDING" | "UNKNOWN"; result?: any; error?: string }

/** Simulate, sign server-side, submit, then wait (bounded) for the final result. */
export async function invoke(role: Role, method: string, args: xdr.ScVal[], contractId = VAULT_ID): Promise<Submitted> {
  const kp = signer(role);
  const src = await server.getAccount(kp.publicKey());
  const raw = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args)).setTimeout(60).build();
  const sim = await server.simulateTransaction(raw);
  if (rpc.Api.isSimulationError(sim)) throw new ChainError(mapError(sim.error), sim.error);
  const tx = rpc.assembleTransaction(raw, sim).build();
  tx.sign(kp);
  const hash = Buffer.from(tx.hash()).toString("hex");
  try {
    const sent = await server.sendTransaction(tx);
    if (sent.status === "ERROR") return { hash, status: "FAILED", error: "Rejected by network" };
  } catch (e: any) {
    return { hash, status: "UNKNOWN", error: String(e?.message ?? e) }; // never "failed" on a transport error
  }
  return waitFor(hash, 25_000);
}

export async function waitFor(hash: string, ms: number): Promise<Submitted> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await server.getTransaction(hash);
      if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return { hash, status: "CONFIRMED", result: r.returnValue ? scValToNative(r.returnValue) : undefined };
      }
      if (r.status === rpc.Api.GetTransactionStatus.FAILED) return { hash, status: "FAILED", error: "Transaction failed on chain" };
    } catch { /* transient: keep polling */ }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { hash, status: "PENDING" };
}

export async function tokenBalance(address: string): Promise<bigint> {
  return BigInt(await read(TOKEN_ID, "balance", [addr(address)]));
}

export function jsonSafe(v: any): any {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]));
  return v;
}
