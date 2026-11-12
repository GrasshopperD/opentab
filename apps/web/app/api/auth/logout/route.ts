import { NextResponse } from "next/server";
import { guard, sessionCookie } from "@/lib/guard.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, { auth: false });
  if ("res" in g) return g.res;
  const res = NextResponse.json({ authorized: false });
  res.headers.set("Set-Cookie", sessionCookie("", 0));
  return res;
}
