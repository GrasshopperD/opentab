import { NextResponse } from "next/server";
import { accessConfigured, readCookie, validSession } from "@/lib/guard.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json({ authorized: validSession(readCookie(req)), enabled: accessConfigured() });
}
