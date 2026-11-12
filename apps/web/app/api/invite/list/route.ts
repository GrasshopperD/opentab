import { guard } from "@/lib/guard.server";
import { ok } from "@/lib/api.server";
import { ctx, inviteFail, invitesAvailable, unavailable } from "@/lib/invites.server";
import * as I from "@/lib/invites.core";

export const dynamic = "force-dynamic";

// Demo operator session required (bound to the inviter session).
export async function POST(req: Request) {
  const avail = invitesAvailable(); if (!avail.ok) return unavailable(avail.reason);
  const g = await guard(req, { auth: true, limit: 60 });
  if ("res" in g) return g.res;
  try { const c = ctx(); return ok(await I.listInvites(c, g.sid, String(g.body.familyId ?? ""))); } catch (e) { return inviteFail(e); }
}