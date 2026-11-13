import { guard } from "@/lib/guard.server";
import { ok } from "@/lib/api.server";
import { ctx, inviteFail, invitesAvailable, unavailable } from "@/lib/invites.server";
import * as I from "@/lib/invites.core";

export const dynamic = "force-dynamic";

// Public: authorized only by the 256-bit invitation token (sent in the JSON body, never in a request URL or query string).
export async function POST(req: Request) {
  const avail = invitesAvailable(); if (!avail.ok) return unavailable(avail.reason);
  const g = await guard(req, { auth: false, limit: 30 });
  if ("res" in g) return g.res;
  try { const c = ctx(); return ok(await I.openInvite(c, g.body.token)); } catch (e) { return inviteFail(e); }
}