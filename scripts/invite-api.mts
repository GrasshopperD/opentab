// Invitation security checks against a running app (default http://localhost:3000). SPENDS NOTHING:
// every path here stops before on-chain registration (rejections, refusals, or an explicit sender REJECT).
// Usage: OT_DEMO_CODE=<code> node --experimental-strip-types scripts/invite-api.mts [baseUrl]
import * as fs from "node:fs";
import * as P from "../packages/shared/src/index.ts";

const BASE = process.argv[2] ?? "http://localhost:3000";
const FAMILY = process.env.OT_DEMO_FAMILY ?? "7";
let failures = 0;
const check = (name: string, cond: boolean, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); if (!cond) failures++; };
async function post(p: string, body: unknown, cookie = "", origin = BASE) {
  const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", origin, cookie }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) as any };
}
async function login() {
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ code: process.env.OT_DEMO_CODE ?? "" }) });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const A = await login(), B = await login();               // two separate operator sessions (same shared code)
check("two operator logins get distinct sessions", A.startsWith("ot_demo=") && B.startsWith("ot_demo=") && A !== B);

// --- who may create ---
check("create without session -> 401", (await post("/api/invite/create", { familyId: FAMILY, name: "Ana" })).status === 401);
check("create cross-origin with session -> 403", (await post("/api/invite/create", { familyId: FAMILY, name: "Ana" }, A, "https://evil.example")).status === 403);
const nf = await post("/api/invite/create", { familyId: "999999", name: "Ana" }, A);
check("create for nonexistent family -> 404 FamilyNotFound", nf.status === 404 && nf.j.error === "FamilyNotFound", JSON.stringify(nf.j));
check("create without name -> 400", (await post("/api/invite/create", { familyId: FAMILY, name: "  " }, A)).status === 400);

async function invite(cookie = A) {
  const r = await post("/api/invite/create", { familyId: FAMILY, name: "Ana <script>", contact: "ana@example.com" }, cookie);
  return r.j as { token: string; invite: any };
}
async function proof(token: string, sk: Uint8Array, over: Partial<{ familyId: bigint }> = {}) {
  const o = (await post("/api/invite/open", { token })).j;
  const s = P.signPossession({ network: o.network, vault: o.vault, inviteId: o.inviteId, familyId: over.familyId ?? BigInt(o.familyId), challenge: o.challenge }, sk);
  return { o, pub: P.toHex(s.pub), signature: P.toHex(s.signature) };
}

const inv = await invite();
check("create -> 256-bit token, PENDING, name sanitized + unverified", /^[A-Za-z0-9_-]{43}$/.test(inv.token) && inv.invite.status === "PENDING" && !inv.invite.name.includes("<") && inv.invite.nameVerified === false, inv.invite.name);
const listed = await post("/api/invite/list", { familyId: FAMILY }, A);
check("list never returns tokens or hashes", Array.isArray(listed.j) && !JSON.stringify(listed.j).includes(inv.token) && !JSON.stringify(listed.j).includes("tokenHash") && !JSON.stringify(listed.j).includes("challenge"));
check("other operator session cannot see the invitation", Array.isArray((await post("/api/invite/list", { familyId: FAMILY }, B)).j) && !(await post("/api/invite/list", { familyId: FAMILY }, B)).j.some((v: any) => v.id === inv.invite.id));
const storeFile = "apps/web/.data/invites.json";
check("token is not stored in clear on disk", fs.existsSync(storeFile) && !fs.readFileSync(storeFile, "utf8").includes(inv.token));

// --- recipient: token validity, possession proof ---
check("open with forged token -> 404", (await post("/api/invite/open", { token: "A".repeat(43) })).status === 404);
check("open with malformed token -> 404", (await post("/api/invite/open", { token: "../../etc" })).status === 404);
const sk = P.generateSecretKey();
const p1 = await proof(inv.token, sk);
check("open shows invitation (family bound by server)", p1.o.familyId === FAMILY && /shared demo operator/.test(p1.o.inviter));
const wrongKey = P.toHex(P.publicKeyOf(P.generateSecretKey()));
const bad = await post("/api/invite/accept", { token: inv.token, pub: wrongKey, label: "x", signature: p1.signature });
check("proof for a different key -> 401 BadProof", bad.status === 401 && bad.j.error === "BadProof", JSON.stringify(bad.j));
const replay = await post("/api/invite/accept", { token: inv.token, pub: p1.pub, label: "x", signature: p1.signature });
check("valid proof on a burned challenge -> 409 ChallengeExpired", replay.status === 409 && replay.j.error === "ChallengeExpired");
const pWrongFam = await proof(inv.token, sk, { familyId: BigInt(FAMILY) + 1n });
check("proof bound to another family -> 401", (await post("/api/invite/accept", { token: inv.token, pub: pWrongFam.pub, label: "x", signature: pWrongFam.signature })).status === 401);

// --- stolen link: an attacker redeems first ---
const attackerSk = P.generateSecretKey();
const pa = await proof(inv.token, attackerSk);
const acc = await post("/api/invite/accept", { token: inv.token, pub: pa.pub, label: "Attacker", signature: pa.signature });
check("first valid acceptance -> ACCEPTED (nothing on chain yet)", acc.j.status === "ACCEPTED", JSON.stringify(acc.j));
check("second redemption -> 409 InviteUsed", (await post("/api/invite/open", { token: inv.token })).status === 409);
const st = await post("/api/invite/status", { token: inv.token, pub: P.toHex(P.publicKeyOf(sk)) });
check("legit phone is told the link was used by another device", st.j.status === "USED_BY_OTHER_DEVICE", JSON.stringify(st.j));
const req = (await post("/api/invite/list", { familyId: FAMILY }, A)).j.find((v: any) => v.id === inv.invite.id);
check("sender sees the attacker's fingerprint (differs from legit phone)", req?.device?.fingerprint === P.fingerprint(P.fromHex(pa.pub)) && req.device.fingerprint !== P.fingerprint(P.publicKeyOf(sk)));

// --- unauthorized approval ---
check("approve without session -> 401", (await post("/api/invite/decide", { id: inv.invite.id, decision: "approve" })).status === 401);
const other = await post("/api/invite/decide", { id: inv.invite.id, decision: "approve" }, B);
check("approve from a different operator session -> 403 NotInviter", other.status === 403 && other.j.error === "NotInviter");
check("approve cross-origin -> 403", (await post("/api/invite/decide", { id: inv.invite.id, decision: "approve" }, A, "https://evil.example")).status === 403);
check("revoke from a different session -> 403", (await post("/api/invite/revoke", { id: inv.invite.id }, B)).status === 403);
const rej = await post("/api/invite/decide", { id: inv.invite.id, decision: "reject" }, A);
check("inviter rejects -> REJECTED", rej.j.status === "REJECTED");
check("approve after reject -> 409", (await post("/api/invite/decide", { id: inv.invite.id, decision: "approve" }, A)).status === 409);
const chain = await (await fetch(`${BASE}/api/family/${FAMILY}?key=${pa.pub}`)).json();
check("attacker key was never registered on chain", chain.keyActive === false, String(chain.keyActive));

// --- no private material in responses ---
check("no secret-key patterns in any response", !/\bS[A-Z2-7]{55}\b/.test(JSON.stringify([listed.j, acc.j, req, rej.j])) && !JSON.stringify([acc.j, req]).includes(P.toHex(attackerSk)));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
