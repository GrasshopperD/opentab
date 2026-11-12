import { invoke, roleAddress, scv } from "@/lib/chain.server";
import { fail, ok } from "@/lib/api.server";
import { parseTokenAmount } from "@opentab/shared";

export const dynamic = "force-dynamic";

/** Demo sender (server-held Testnet identity) creates a family and funds it. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const amount = parseTokenAmount(String(body.amount ?? "20"));
    if (amount <= 0n || amount > parseTokenAmount("50")) return ok({ error: "BadRequest", detail: "deposit must be 0-50" });
    const sender = roleAddress("sender");
    const created = await invoke("sender", "create_family", [scv.addr(sender)]);
    if (created.status !== "CONFIRMED") return ok({ step: "create_family", ...created });
    const familyId = BigInt(created.result);
    const dep = await invoke("sender", "deposit", [scv.u64(familyId), scv.addr(sender), scv.i128(amount)]);
    return ok({ familyId, sender, createTx: created.hash, depositTx: dep.hash, depositStatus: dep.status, balance: dep.result });
  } catch (e) { return fail(e); }
}
