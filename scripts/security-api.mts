// Access-control / CSRF / input-limit tests against a running app. Spends nothing on chain: every request that passes
// the guard carries an invalid input, so nothing is signed or submitted. Usage: OT_DEMO_CODE=<code> node --experimental-strip-types scripts/security-api.mts [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3000";
let failures = 0;
const check = (n: string, c: boolean, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); if (!c) failures++; };
const J = { "content-type": "application/json" };
const req = (p: string, h: Record<string, string>, body: string) => fetch(BASE + p, { method: "POST", headers: h, body });

const DEMO = process.env.OT_DEMO_FAMILY ?? "7";
const anon = (p: string, b: any) => req(p, { ...J, origin: BASE }, JSON.stringify(b));
const err = async (r: Response) => { try { return (await r.json()).error; } catch { return ""; } };

// 1. PUBLIC demo actions need NO access code: they pass the guard and reach input validation. Every input below is
//    invalid, so nothing is signed or submitted.
const pDep = await anon("/api/sender/deposit", { familyId: DEMO, amount: "999" });
check("no code: deposit to demo family reaches validation (over cap -> 400)", pDep.status === 400, String(pDep.status));
const pKey = await anon("/api/sender/key", { familyId: DEMO, publicKey: "zz" });
check("no code: pairing on demo family reaches validation -> 400", pKey.status === 400, String(pKey.status));
const pPay = await anon("/api/merchant/pay", { merchantId: "A", authorization: "OTA1:{not json" });
check("no code: shop settlement reaches validation -> 400", pPay.status === 400, String(pPay.status));

// 2. Without an operator session everything else stays closed, refused BEFORE anything is signed.
const cFam = await anon("/api/sender/family", { amount: "1" });
check("no session: create family -> 401", cFam.status === 401, String(cFam.status));
const oDep = await anon("/api/sender/deposit", { familyId: "1", amount: "1" });
check("no session: deposit to a non-demo family -> 403 DemoFamilyOnly", oDep.status === 403 && (await err(oDep)) === "DemoFamilyOnly", String(oDep.status));
const oKey = await anon("/api/sender/key", { familyId: "1", publicKey: "00".repeat(32) });
check("no session: pairing on a non-demo family -> 403 DemoFamilyOnly", oKey.status === 403 && (await err(oKey)) === "DemoFamilyOnly", String(oKey.status));
const rev = await anon("/api/sender/key", { familyId: DEMO, publicKey: "00".repeat(32), action: "revoke" });
check("no session: revoke a device -> 403 OperatorOnly", rev.status === 403 && (await err(rev)) === "OperatorOnly", String(rev.status));
const xoAnon = await req("/api/sender/deposit", { ...J, origin: "https://evil.example" }, JSON.stringify({ familyId: DEMO, amount: "1" }));
check("cross-origin public action -> 403 (CSRF)", xoAnon.status === 403, String(xoAnon.status));
const bad = await req("/api/auth/login", { ...J, origin: BASE }, JSON.stringify({ code: "wrong-code-123" }));
check("wrong access code -> 401", bad.status === 401);
const forged = await req("/api/sender/family", { ...J, origin: BASE, cookie: "ot_demo=9999999999.forgedsignature" }, "{}");
check("forged session cookie -> 401", forged.status === 401);

const login = await req("/api/auth/login", { ...J, origin: BASE }, JSON.stringify({ code: process.env.OT_DEMO_CODE ?? "" }));
const setCookie = login.headers.get("set-cookie") ?? "";
const cookie = setCookie.split(";")[0];
check("correct code -> 200 + HttpOnly SameSite=Strict cookie", login.status === 200 && /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie));

const xo = await req("/api/sender/deposit", { ...J, origin: "https://evil.example", cookie }, JSON.stringify({ familyId: "1", amount: "1" }));
check("cross-origin with valid cookie -> 403 (CSRF)", xo.status === 403, String(xo.status));
const noOrigin = await req("/api/sender/deposit", { ...J, cookie }, JSON.stringify({ familyId: "1", amount: "1" }));
check("missing Origin -> 403", noOrigin.status === 403);
const form = await req("/api/sender/deposit", { "content-type": "application/x-www-form-urlencoded", origin: BASE, cookie }, "familyId=1&amount=1");
check("form content-type -> 415", form.status === 415);
const big = await req("/api/merchant/pay", { ...J, origin: BASE, cookie }, JSON.stringify({ merchantId: "A", authorization: "x".repeat(5000) }));
check("oversized body -> 413", big.status === 413);
const badAmt = await req("/api/sender/deposit", { ...J, origin: BASE, cookie }, JSON.stringify({ familyId: "1", amount: "999" }));
check("deposit over cap -> 400", badAmt.status === 400);
const badJunk = await req("/api/sender/deposit", { ...J, origin: BASE, cookie }, JSON.stringify({ familyId: "1", amount: "1e9" }));
check("non-decimal amount -> 400", badJunk.status === 400, String(badJunk.status));
const malformed = await req("/api/merchant/pay", { ...J, origin: BASE, cookie }, JSON.stringify({ merchantId: "A", authorization: "OTA1:{not json" }));
check("malformed authorization -> 400, no crash", malformed.status === 400);
const opRev = await req("/api/sender/key", { ...J, origin: BASE, cookie }, JSON.stringify({ familyId: DEMO, publicKey: "zz", action: "revoke" }));
check("operator session: revoke reaches validation -> 400", opRev.status === 400, String(opRev.status));
const status = await (await fetch(BASE + "/api/auth/status", { headers: { cookie } })).json();
check("status reports authorized", status.authorized === true);
const pub = await fetch(BASE + "/api/family/1");
check("public read works without credentials", pub.status === 200);
const homeRes = await fetch(BASE + "/");
const home = await homeRes.text();
check("landing page public", homeRes.status === 200 && home.includes("OpenTab"));   // brand is "OpenTab" since the Product UI
check("access code not in landing HTML", !!process.env.OT_DEMO_CODE && !home.includes(process.env.OT_DEMO_CODE));
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
