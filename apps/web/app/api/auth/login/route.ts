import { NextResponse } from "next/server";
import { checkCode, clientIp, guard, newSession, rateLimited, sessionCookie } from "@/lib/guard.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, { auth: false, limit: 10 });
  if ("res" in g) return g.res;
  if (rateLimited(`login:${clientIp(req)}`, 10, 10 * 60_000)) return NextResponse.json({ error: "RateLimited", detail: "Too many attempts. Try again in 10 minutes." }, { status: 429 });
  if (!checkCode(String(g.body.code ?? ""))) return NextResponse.json({ error: "BadCode", detail: "Incorrect demo access code." }, { status: 401 });
  const res = NextResponse.json({ authorized: true });
  res.headers.set("Set-Cookie", sessionCookie(newSession()));
  return res;
}
