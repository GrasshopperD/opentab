import { waitFor } from "@/lib/chain.server";
import { readLimited, badRequest, fail, ok } from "@/lib/api.server";

export const dynamic = "force-dynamic";

/** Reconcile a PENDING/UNKNOWN payment by hash. Never resubmits. */
export async function GET(_req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const limited = readLimited(_req); if (limited) return limited;
  try {
    const hash = (await ctx.params).hash;
    if (!/^[0-9a-f]{64}$/.test(hash)) return badRequest("bad hash");
    return ok(await waitFor(hash, 4000));
  } catch (e) { return fail(e); }
}
