import { NextResponse } from "next/server";
import { rpc } from "@stellar/stellar-sdk";
import { read, roleAddress, scv, tokenBalance, type Role } from "@/lib/chain.server";
import { readLimited } from "@/lib/api.server";
import { accessConfigured, readCookie, validSession } from "@/lib/guard.server";
import { DEMO_FAMILY_ID, MERCHANTS, RPC_URL, TOKEN_ID, VAULT_ID } from "@/lib/config";

export const dynamic = "force-dynamic";

interface Check { name: string; ok: boolean; detail: string }
async function run(name: string, f: () => Promise<string>): Promise<Check> {
  try { return { name, ok: true, detail: await f() }; }
  catch (e: any) { return { name, ok: false, detail: String(e?.code ?? e?.message ?? e).slice(0, 120) }; }
}

/** Read-only health checks. Spends nothing. Never returns secrets. */
export async function GET(req: Request) {
  const limited = readLimited(req); if (limited) return limited;
  const server = new rpc.Server(RPC_URL);
  const pub: Check[] = await Promise.all([
    run("Stellar Testnet RPC reachable", async () => {
      const [h, l] = await Promise.all([server.getHealth(), server.getLatestLedger()]);
      return `${h.status}, ledger ${l.sequence}, protocol ${l.protocolVersion}`;
    }),
    run("FamilyVault contract configured and readable", async () => {
      if (!VAULT_ID) throw new Error("NEXT_PUBLIC_FAMILY_VAULT_CONTRACT_ID missing");
      const cfg = await read(VAULT_ID, "config", []);
      if (cfg.token !== TOKEN_ID) throw new Error("vault token does not match configured token");
      return `${VAULT_ID.slice(0, 6)}…${VAULT_ID.slice(-6)} uses the configured token`;
    }),
    run("Settlement asset configured", async () => {
      if (!TOKEN_ID) throw new Error("NEXT_PUBLIC_TOKEN_CONTRACT_ID missing");
      const name = await read(TOKEN_ID, "name", []);
      return String(name).split(":")[0] + " (Testnet demo asset, no value)";
    }),
    run("Merchant identities configured", async () => {
      const missing = MERCHANTS.filter((m) => !/^G[A-Z2-7]{55}$/.test(m.address));
      if (missing.length) throw new Error(`missing: ${missing.map((m) => m.name).join(", ")}`);
      await Promise.all(MERCHANTS.map((m) => tokenBalance(m.address)));
      return MERCHANTS.map((m) => m.name).join(", ") + " (balances readable)";
    }),
    run("Public contract read (family #1)", async () => {
      const f = await read(VAULT_ID, "get_family", [scv.u64(1n)]);
      return `family #1 exists, ${f.total_paid > 0n ? "has settled payments" : "no payments yet"}`;
    }),
    run("Public demo enabled", async () => {
      if (!accessConfigured()) throw new Error("DEMO_ACCESS_CODE / DEMO_SESSION_SECRET not set: signing disabled");
      return `Sender and Shop open without an access code (demo Family #${DEMO_FAMILY_ID})`;
    }),
  ]);
  const authorized = validSession(readCookie(req));
  let operator: Check[] | null = null;
  if (authorized) {
    const roles: [Role, string, string | undefined][] = [
      ["sender", "Demo sender signer", undefined],
      ["merchantA", "Shop A signer", MERCHANTS[0].address],
      ["merchantB", "Shop B signer", MERCHANTS[1].address],
    ];
    operator = await Promise.all(roles.map(([role, name, expect]) => run(name, async () => {
      const addr = roleAddress(role);
      if (expect && addr !== expect) throw new Error("server signer does not match the public merchant address");
      const acct = await server.getAccount(addr);
      return `account ${addr.slice(0, 4)}…${addr.slice(-4)} exists (seq ${acct.sequenceNumber().slice(-4)})`;
    })));
    operator.push(await run("Demo sender OTUSD available", async () => {
      const b = await tokenBalance(roleAddress("sender"));
      if (b < 50_000_000n) throw new Error("less than 5 OTUSD left: issue more from opentab-issuer");
      return `${(Number(b / 100_000n) / 100).toFixed(2)} OTUSD`;
    }));
  }
  return NextResponse.json({ checkedAt: new Date().toISOString(), public: pub, operator, authorized });
}
