import { tokenBalance } from "@/lib/chain.server";
import { readLimited, badRequest, fail, ok, recentPayments } from "@/lib/api.server";
import { MERCHANTS } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = readLimited(_req); if (limited) return limited;
  try {
    const id = (await ctx.params).id;
    const m = MERCHANTS.find((x) => x.id === id);
    if (!m) return badRequest("unknown merchant");
    const [balance, payments] = await Promise.all([tokenBalance(m.address), recentPayments({ merchant: m.address }).catch(() => [])]);
    return ok({ merchant: m, balance, payments });
  } catch (e) { return fail(e); }
}
