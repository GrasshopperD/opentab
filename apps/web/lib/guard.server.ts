// SERVER-ONLY demo access control, CSRF defence, rate limiting and input limits.
//
// Model: an operator-chosen DEMO_ACCESS_CODE (server env) is exchanged at /api/auth/login
// for an HMAC-signed, HttpOnly, SameSite=Strict session cookie. Every state-changing route
// (anything that signs with a server-held Testnet key) calls `guard(req)`.
// Fails CLOSED: if DEMO_ACCESS_CODE or DEMO_SESSION_SECRET is missing, mutations are disabled.
import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const COOKIE = "ot_demo";
const SESSION_S = 8 * 3600;
export const MAX_BODY_BYTES = 4096;

const code = () => process.env.DEMO_ACCESS_CODE || "";
const secret = () => process.env.DEMO_SESSION_SECRET || "";
export const accessConfigured = () => code().length >= 8 && secret().length >= 32;

function hmac(data: string) { return createHmac("sha256", secret()).update(data).digest("base64url"); }
function eq(a: string, b: string) {
  const x = createHash("sha256").update(a).digest(), y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function checkCode(c: string) { return accessConfigured() && typeof c === "string" && eq(c, code()); }
export function newSession(nowS = Math.floor(Date.now() / 1000)) { const exp = nowS + SESSION_S; return `${exp}.${hmac(String(exp))}`; }
export function validSession(v: string | undefined, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!v || !accessConfigured()) return false;
  const [exp, sig] = v.split(".");
  if (!/^\d+$/.test(exp ?? "") || !sig) return false;
  return Number(exp) > nowS && eq(sig, hmac(exp));
}
export function sessionCookie(value: string, maxAge = SESSION_S) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
export function readCookie(req: Request, name = COOKIE) {
  const m = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(name + "="));
  return m?.slice(name.length + 1);
}

// ---- rate limiting (best effort: per serverless instance, in memory) ----
const buckets = new Map<string, { n: number; reset: number }>();
export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return false; }
  b.n++;
  return b.n > limit;
}

/** CSRF: browsers always send Origin on cross-site POSTs; require same origin + JSON. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

const deny = (status: number, error: string, detail: string) => NextResponse.json({ error, detail }, { status });

/** Guard a state-changing request. Returns the parsed JSON body, or a Response to return. */
export async function guard(req: Request, opts: { limit?: number; auth?: boolean } = {}): Promise<{ body: any } | { res: Response }> {
  const { limit = 20, auth = true } = opts;
  if (req.method !== "POST") return { res: deny(405, "MethodNotAllowed", "POST only") };
  if (!sameOrigin(req)) return { res: deny(403, "CrossOrigin", "Request must come from this site.") };
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return { res: deny(415, "BadContentType", "JSON required") };
  if (rateLimited(`m:${new URL(req.url).pathname}:${clientIp(req)}`, limit, 60_000)) return { res: deny(429, "RateLimited", "Too many requests. Wait a minute.") };
  if (auth) {
    if (!accessConfigured()) return { res: deny(503, "DemoLocked", "Interactive demo is disabled on this deployment.") };
    if (!validSession(readCookie(req))) return { res: deny(401, "Unauthorized", "Demo access code required.") };
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return { res: deny(413, "TooLarge", "Request body too large.") };
  try { return { body: text ? JSON.parse(text) : {} }; } catch { return { res: deny(400, "BadJSON", "Malformed JSON") }; }
}
