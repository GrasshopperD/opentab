import { read, scv } from "@/lib/chain.server";
import { fail, ok, parseId, recentPayments } from "@/lib/api.server";
import { VAULT_ID } from "@/lib/config";
import { fromHex } from "@opentab/shared";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const familyId = parseId((await ctx.params).id);
    const family = await read(VAULT_ID, "get_family", [scv.u64(familyId)]);
    const key = new URL(req.url).searchParams.get("key");
    const keyActive = key && /^[0-9a-f]{64}$/.test(key)
      ? await read(VAULT_ID, "is_key_active", [scv.u64(familyId), scv.bytes(fromHex(key))]) : undefined;
    const payments = await recentPayments({ familyId }).catch(() => []);
    return ok({ familyId, family, keyActive, payments });
  } catch (e) { return fail(e); }
}
