import { invoke, roleAddress, scv } from "@/lib/chain.server";
import { badRequest, fail, ok, parseId } from "@/lib/api.server";
import { parseTokenAmount } from "@opentab/shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const familyId = parseId(body.familyId);
    const amount = parseTokenAmount(String(body.amount));
    if (amount <= 0n || amount > parseTokenAmount("50")) return badRequest("deposit must be between 0 and 50 demo USD");
    const sender = roleAddress("sender");
    const r = await invoke("sender", "deposit", [scv.u64(familyId), scv.addr(sender), scv.i128(amount)]);
    return ok({ ...r, balance: r.result });
  } catch (e) { return fail(e); }
}
