import { read, scv } from "@/lib/chain.server";
import { readLimited, badRequest, fail, ok, parseId } from "@/lib/api.server";
import { VAULT_ID } from "@/lib/config";
import { fromHex } from "@opentab/shared";

export const dynamic = "force-dynamic";

/** Public read: has this family's invoice been settled? Used to reconcile UNKNOWN payments. */
export async function GET(req: Request) {
  const limited = readLimited(req); if (limited) return limited;
  try {
    const u = new URL(req.url);
    const familyId = parseId(u.searchParams.get("family"));
    const id = u.searchParams.get("id") ?? "";
    if (!/^[0-9a-f]{64}$/.test(id)) return badRequest("id must be 64 hex chars");
    const used = await read(VAULT_ID, "is_invoice_used", [scv.u64(familyId), scv.bytes(fromHex(id))]);
    return ok({ used: Boolean(used) });
  } catch (e) { return fail(e); }
}
