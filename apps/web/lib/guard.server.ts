// SERVER-ONLY demo access control, CSRF defence, rate limiting and input limits.
//
// Model: every state-changing route (anything that signs with a server-held Testnet key) calls `guard(req)`.
// PUBLIC demo actions (`auth: "public"`: fund, pair and settle on the preset demo family) need no access code; the
// routes themselves restrict anonymous callers to that family. OPERATOR actions (`auth: true`: create family, revoke
// a device, other families, invitations) need the session cookie that /api/auth/login issues for DEMO_ACCESS_CODE.
// Fails CLOSED: if DEMO_ACCESS_CODE or DEMO_SESSION_SECRET is missing, ALL signing routes (public too) are disabled.
import "server-only";
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
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
/** Cookie value: `<sid>.<exp>.<hmac(sid.exp)>`. `sid` (128 random bits) identifies ONE operator login (browser
 *  session). It is NOT a user identity: everyone who knows the shared demo code is the same "demo operator". */
export function newSession(nowS = Math.floor(Date.now() / 1000)) {
  const sid = randomBytes(16).toString("base64url"); const exp = nowS + SESSION_S;
  return `${sid}.${exp}.${hmac(`${sid}.${exp}`)}`;
}
export function sessionId(v: string | undefined, nowS = Math.floor(Date.now() / 1000)): string | null {
  if (!v || !accessConfigured()) return null;
  const [sid, exp, sig, extra] = v.split(".");
  if (extra !== undefined || !/^[A-Za-z0-9_-]{22}$/.test(sid ?? "") || !/^\d+$/.test(exp ?? "") || !sig) return null;
  return Number(exp) > nowS && eq(sig, hmac(`${sid}.${exp}`)) ? sid : null;
}
export function validSession(v: string | undefined, nowS = Math.floor(Date.now() / 1000)): boolean { return sessionId(v, nowS) !== null; }
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
/** Anonymous public-demo callers may only fund or pair the preset demo family. */
export const demoFamilyOnly = (id: string) => deny(403, "DemoFamilyOnly", `The public demo can only fund or pair demo Family #${id}.`);
export const operatorOnly = (detail: string) => deny(403, "OperatorOnly", detail);

/** Guard a state-changing request. Returns the parsed JSON body (and `sid` only for a valid operator session), or a Response.
 *  auth: true = operator session required; "public" = open public-demo action (kill switch still applies); false = no access check. */
export async function guard(req: Request, opts: { limit?: number; auth?: boolean | "public" } = {}): Promise<{ body: any; sid?: string } | { res: Response }> {
  const { limit = 20, auth = true } = opts;
  if (req.method !== "POST") return { res: deny(405, "MethodNotAllowed", "POST only") };
  if (!sameOrigin(req)) return { res: deny(403, "CrossOrigin", "Request must come from this site.") };
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return { res: deny(415, "BadContentType", "JSON required") };
  if (rateLimited(`m:${new URL(req.url).pathname}:${clientIp(req)}`, limit, 60_000)) return { res: deny(429, "RateLimited", "Too many requests. Wait a minute.") };
  if (auth) {
    if (!accessConfigured()) return { res: deny(503, "DemoLocked", "Interactive demo is disabled on this deployment.") };
    if (auth === true && !validSession(readCookie(req))) return { res: deny(401, "Unauthorized", "Operator-only action: turned off in the public demo.") };
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return { res: deny(413, "TooLarge", "Request body too large.") };
  const sid = sessionId(readCookie(req)) ?? undefined;
  try { return { body: text ? JSON.parse(text) : {}, sid }; } catch { return { res: deny(400, "BadJSON", "Malformed JSON") }; }
}
