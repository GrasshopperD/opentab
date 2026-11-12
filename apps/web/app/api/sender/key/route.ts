import { invoke, scv } from "@/lib/chain.server";
import { badRequest, fail, ok, parseId } from "@/lib/api.server";
import { fromHex } from "@opentab/shared";

export const dynamic = "force-dynamic";

/** Register (or revoke) a recipient device's PUBLIC key. Private keys never reach the server. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const familyId = parseId(body.familyId);
    if (typeof body.publicKey !== "string" || !/^[0-9a-f]{64}$/.test(body.publicKey)) return badRequest("publicKey must be 64 lowercase hex chars");
    const method = body.action === "revoke" ? "revoke_key" : "register_key";
    const r = await invoke("sender", method, [scv.u64(familyId), scv.bytes(fromHex(body.publicKey))]);
    return ok(r);
  } catch (e) { return fail(e); }
}
