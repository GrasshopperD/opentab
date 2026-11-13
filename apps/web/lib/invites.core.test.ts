// Unit tests for the invitation state machine with a SIMULATED chain (records calls, injectable failures).
// Real-chain behaviour is covered separately by tests/e2e/invite.spec.ts.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateSecretKey, publicKeyOf, signPossession, toHex, TESTNET_PASSPHRASE, encodePaymentMessage, fieldsFor, verifyAuthorization } from "@opentab/shared";
import * as I from "./invites.core";
import { fileStore, memoryStore } from "./invite-store";

const VAULT = "CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW";
const SENDER = "GBC7D7XKWZZYJ7BRMZGBP44ASRG2ATAKKNI227XA5C4HBHTPRUN5F235";
const OTHER = "GCDSS6VQP6GGTV6K2J6FMG2TQN2G2EG37TSQ5UYQK547ODDYGNPPRWN4";

function fakeChain() {
  const active = new Set<string>();                 // `${family}:${pub}`
  const calls: string[] = [];
  const families: Record<string, string> = { "7": SENDER, "8": SENDER, "9": OTHER };
  const c = {
    active, calls, families,
    registerBehaviour: "ok" as "ok" | "fail" | "unknown" | "unknown-landed" | "slow",
    senderAddress: () => SENDER,
    familySender: async (f: string) => families[f] ?? null,
    isKeyActive: async (f: string, p: string) => active.has(`${f}:${p}`),
    async registerKey(f: string, p: string): Promise<I.ChainResult> {
      calls.push(`register ${f} ${p.slice(0, 8)}`);
      if (c.registerBehaviour === "fail") return { status: "FAILED", hash: "f".repeat(64), error: "SimulationFailed" };
      if (c.registerBehaviour === "unknown") return { status: "UNKNOWN", hash: "u".repeat(64) };
      if (c.registerBehaviour === "unknown-landed") { active.add(`${f}:${p}`); return { status: "UNKNOWN", hash: "l".repeat(64) }; }
      if (c.registerBehaviour === "slow") await new Promise((r) => setTimeout(r, 30));
      if (active.has(`${f}:${p}`)) return { status: "FAILED", error: "KeyAlreadyRegistered" };
      active.add(`${f}:${p}`); return { status: "CONFIRMED", hash: "a".repeat(64) };
    },
    async revokeKey(f: string, p: string): Promise<I.ChainResult> {
      calls.push(`revoke ${f} ${p.slice(0, 8)}`);
      if (!active.delete(`${f}:${p}`)) return { status: "FAILED", error: "KeyNotActive" };
      return { status: "CONFIRMED", hash: "r".repeat(64) };
    },
  };
  return c;
}
function setup(store = memoryStore()) {
  const chain = fakeChain(); let t = 1_800_000_000_000;
  const ctx: I.Ctx = { store, chain, now: () => t, network: TESTNET_PASSPHRASE, vault: VAULT };
  return { ctx, chain, advance: (ms: number) => { t += ms; } };
}
async function acceptAs(ctx: I.Ctx, token: string, sk = generateSecretKey(), tamper?: (f: any) => void) {
  const o = await I.openInvite(ctx, token);
  const fields = { network: o.network, vault: o.vault, inviteId: o.inviteId, familyId: BigInt(o.familyId), challenge: o.challenge };
  tamper?.(fields);
  const { pub, signature } = signPossession(fields, sk);
  return { pub: toHex(pub), res: I.acceptInvite(ctx, { token, pub: toHex(pub), label: "Ana phone", signature: toHex(signature) }) };
}
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e: any) { return e.code ?? e.message; } };

describe("invitations: legitimate flow", () => {
  it("create -> open -> accept with proof -> approve -> CONNECTED (registered on chain, verified)", async () => {
    const { ctx, chain } = setup();
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana", contact: "ana@example.com" });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);                         // 256 bits
    expect(JSON.stringify(invite)).not.toContain(token);
    expect(invite.status).toBe("PENDING"); expect(invite.nameVerified).toBe(false);
    const { pub, res } = await acceptAs(ctx, token);
    expect((await res).status).toBe("ACCEPTED");
    expect(chain.calls).toEqual([]);                                     // nothing on chain before sender approval
    expect((await I.recipientStatus(ctx, token, pub)).status).toBe("ACCEPTED");
    const v = await I.decide(ctx, "sidA", invite.id, "approve");
    expect(v.status).toBe("CONNECTED"); expect(v.regTx).toBe("a".repeat(64));
    expect(chain.calls).toEqual([`register 7 ${pub.slice(0, 8)}`]);
    expect((await I.recipientStatus(ctx, token, pub)).status).toBe("CONNECTED");
  });
  it("store never holds the token in clear", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "otinv-"));
    const { ctx } = setup(fileStore(dir));
    const { token } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const disk = fs.readFileSync(path.join(dir, "invites.json"), "utf8");
    expect(disk).not.toContain(token); expect(disk).toContain(I.hashToken(token));
  });
  it("file store is durable across a restart (new store instance on the same directory)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "otinv-"));
    const a = setup(fileStore(dir));
    const { token } = await I.createInvite(a.ctx, "sidA", { familyId: "7", name: "Ana" });
    await (await acceptAs(a.ctx, token)).res;
    const b = setup(fileStore(dir));                                     // "server restarted"
    expect(await code(acceptAs(b.ctx, token).then((x) => x.res))).toBe("InviteUsed");
  });
});

describe("invitations: expiry and single use", () => {
  it("expires after 10 minutes", async () => {
    const { ctx, advance } = setup();
    const { token } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    advance(I.INVITE_TTL_MS + 1);
    expect(await code(I.openInvite(ctx, token))).toBe("InviteExpired");
  });
  it("cannot be accepted after expiry even with a challenge issued before", async () => {
    const { ctx, advance } = setup();
    const { token } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    advance(I.INVITE_TTL_MS - 1000);
    const o = await I.openInvite(ctx, token);
    advance(2000);
    const sk = generateSecretKey();
    const { pub, signature } = signPossession({ network: o.network, vault: o.vault, inviteId: o.inviteId, familyId: 7n, challenge: o.challenge }, sk);
    expect(await code(I.acceptInvite(ctx, { token, pub: toHex(pub), label: "x", signature: toHex(signature) }))).toBe("InviteExpired");
  });
  it("is single use: second redemption (other device or same device) is refused", async () => {
    const { ctx } = setup();
    const { token } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const sk = generateSecretKey();
    await (await acceptAs(ctx, token, sk)).res;
    expect(await code(I.openInvite(ctx, token))).toBe("InviteUsed");
    expect(await code(acceptAs(ctx, token, generateSecretKey()).then((x) => x.res))).toBe("InviteUsed");
  });
  it("device request expires if the sender never approves", async () => {
    const { ctx, advance, chain } = setup();
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    await (await acceptAs(ctx, token)).res;
    advance(I.APPROVAL_TTL_MS + 1);
    expect(await code(I.decide(ctx, "sidA", invite.id, "approve"))).toBe("InvalidState");
    expect(chain.calls).toEqual([]);
  });
  it("limits open invitations per family", async () => {
    const { ctx } = setup();
    for (let i = 0; i < I.MAX_OPEN_INVITES_PER_FAMILY; i++) await I.createInvite(ctx, "sidA", { familyId: "7", name: "N" + i });
    expect(await code(I.createInvite(ctx, "sidA", { familyId: "7", name: "Z" }))).toBe("TooManyInvites");
  });
});

describe("invitations: key possession", () => {
  it("rejects a proof signed by a different key than the one claimed", async () => {
    const { ctx } = setup();
    const { token } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const o = await I.openInvite(ctx, token);
    const real = signPossession({ network: o.network, vault: o.vault, inviteId: o.inviteId, familyId: 7n, challenge: o.challenge }, generateSecretKey());
    const claimed = toHex(publicKeyOf(generateSecretKey()));
    expect(await code(I.acceptInvite(ctx, { token, pub: claimed, label: "x", signature: toHex(real.signature) }))).toBe("BadProof");
  });
  it("challenge is single use: a failed proof burns it; a captured valid proof cannot be replayed", async () => {
    const { ctx } = setup();
    const { token } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const o = await I.openInvite(ctx, token);
    const sk = generateSecretKey();
    const good = signPossession({ network: o.network, vault: o.vault, inviteId: o.inviteId, familyId: 7n, challenge: o.challenge }, sk);
    expect(await code(I.acceptInvite(ctx, { token, pub: toHex(good.pub), label: "x", signature: "00".repeat(64) }))).toBe("BadProof");
    expect(await code(I.acceptInvite(ctx, { token, pub: toHex(good.pub), label: "x", signature: toHex(good.signature) }))).toBe("ChallengeExpired");
  });
  it("an older challenge is invalid once a new one is issued; challenges expire", async () => {
    const { ctx, advance } = setup();
    const { token } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const o1 = await I.openInvite(ctx, token); await I.openInvite(ctx, token);
    const sk = generateSecretKey();
    const s1 = signPossession({ network: o1.network, vault: o1.vault, inviteId: o1.inviteId, familyId: 7n, challenge: o1.challenge }, sk);
    expect(await code(I.acceptInvite(ctx, { token, pub: toHex(s1.pub), label: "x", signature: toHex(s1.signature) }))).toBe("BadProof");
    const o3 = await I.openInvite(ctx, token); advance(I.CHALLENGE_TTL_MS + 1);
    const s3 = signPossession({ network: o3.network, vault: o3.vault, inviteId: o3.inviteId, familyId: 7n, challenge: o3.challenge }, sk);
    expect(await code(I.acceptInvite(ctx, { token, pub: toHex(s3.pub), label: "x", signature: toHex(s3.signature) }))).toBe("ChallengeExpired");
  });
  it("possession signatures are domain-separated from payment approvals", async () => {
    const sk = generateSecretKey();
    const { signature } = signPossession({ network: TESTNET_PASSPHRASE, vault: VAULT, inviteId: "A".repeat(16), familyId: 7n, challenge: "B".repeat(43) }, sk);
    const inv = { network: TESTNET_PASSPHRASE, vault: VAULT, token: VAULT, merchant: OTHER, merchantName: "x", terminalId: 1, invoiceId: new Uint8Array(32),
      amount: 1n, quote: { currency: "USD", localMinor: 1n, minorDigits: 2, rate: "100", source: "X" }, expiresAt: 1n };
    expect(encodePaymentMessage(fieldsFor(inv, 7n, publicKeyOf(sk))).length).toBe(340);
    expect(verifyAuthorization({ invoice: inv, familyId: 7n, signer: publicKeyOf(sk), signature })).toBe(false);
  });
});

describe("invitations: binding and authorization", () => {
  it("wrong family: a proof bound to another family is rejected; registration targets only the invited family", async () => {
    const { ctx, chain } = setup();
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    expect(await code(acceptAs(ctx, token, generateSecretKey(), (f) => { f.familyId = 8n; }).then((x) => x.res))).toBe("BadProof");
    const { pub, res } = await acceptAs(ctx, token); await res;
    await I.decide(ctx, "sidA", invite.id, "approve");
    expect(chain.active.has(`7:${pub}`)).toBe(true); expect(chain.active.has(`8:${pub}`)).toBe(false);
  });
  it("cannot invite to a family this server does not fund, or that does not exist", async () => {
    const { ctx } = setup();
    expect(await code(I.createInvite(ctx, "sidA", { familyId: "9", name: "Ana" }))).toBe("NotFunder");
    expect(await code(I.createInvite(ctx, "sidA", { familyId: "404", name: "Ana" }))).toBe("FamilyNotFound");
    expect(await code(I.createInvite(ctx, undefined, { familyId: "7", name: "Ana" }))).toBe("Unauthorized");
  });
  it("unauthorized approval: no session, or a different operator session, cannot approve/reject/revoke or list", async () => {
    const { ctx, chain } = setup();
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    await (await acceptAs(ctx, token)).res;
    expect(await code(I.decide(ctx, undefined, invite.id, "approve"))).toBe("Unauthorized");
    expect(await code(I.decide(ctx, "sidB", invite.id, "approve"))).toBe("NotInviter");
    expect(await code(I.decide(ctx, "sidB", invite.id, "reject"))).toBe("NotInviter");
    expect(await I.listInvites(ctx, "sidB", "7")).toEqual([]);
    expect(chain.calls).toEqual([]);
    expect((await I.decide(ctx, "sidA", invite.id, "approve")).status).toBe("CONNECTED");
    expect(await code(I.revokeDevice(ctx, "sidB", invite.id))).toBe("NotInviter");
  });
  it("stolen link: attacker redeems first -> legitimate phone is told, sender sees a different fingerprint and rejects; nothing registered", async () => {
    const { ctx, chain } = setup();
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const attacker = await acceptAs(ctx, token); await attacker.res;
    const legitSk = generateSecretKey(); const legitPub = toHex(publicKeyOf(legitSk));
    expect(await code(acceptAs(ctx, token, legitSk).then((x) => x.res))).toBe("InviteUsed");
    expect((await I.recipientStatus(ctx, token, legitPub)).status).toBe("USED_BY_OTHER_DEVICE");
    const [req] = await I.listInvites(ctx, "sidA", "7");
    expect(req.device!.pub).toBe(attacker.pub); expect(req.device!.pub).not.toBe(legitPub);   // fingerprint mismatch is visible
    expect((await I.decide(ctx, "sidA", invite.id, "reject")).status).toBe("REJECTED");
    expect(await code(I.decide(ctx, "sidA", invite.id, "approve"))).toBe("InvalidState");
    expect(chain.calls).toEqual([]);
  });
  it("approval race: two concurrent approvals produce exactly one on-chain registration", async () => {
    const { ctx, chain } = setup(); chain.registerBehaviour = "slow";
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    await (await acceptAs(ctx, token)).res;
    const results = await Promise.all([code(I.decide(ctx, "sidA", invite.id, "approve")), code(I.decide(ctx, "sidA", invite.id, "approve"))]);
    expect(results.sort()).toEqual(["InProgress", "OK"]);
    expect(chain.calls.length).toBe(1);
  });
  it("approve vs reject race: exactly one wins", async () => {
    const { ctx, chain } = setup(); chain.registerBehaviour = "slow";
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    await (await acceptAs(ctx, token)).res;
    const r = await Promise.all([code(I.decide(ctx, "sidA", invite.id, "approve")), code(I.decide(ctx, "sidA", invite.id, "reject"))]);
    expect(r).toEqual(["OK", "InProgress"]);
    expect((await I.listInvites(ctx, "sidA", "7"))[0].status).toBe("CONNECTED");
  });
});

describe("invitations: failed or uncertain on-chain registration", () => {
  it("failed registration returns to ACCEPTED with an error; retry succeeds; recipient never saw CONNECTED", async () => {
    const { ctx, chain } = setup(); chain.registerBehaviour = "fail";
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const { pub, res } = await acceptAs(ctx, token); await res;
    const v1 = await I.decide(ctx, "sidA", invite.id, "approve");
    expect(v1.status).toBe("ACCEPTED"); expect(v1.lastError).toMatch(/failed/);
    expect((await I.recipientStatus(ctx, token, pub)).status).toBe("ACCEPTED");
    chain.registerBehaviour = "ok";
    expect((await I.decide(ctx, "sidA", invite.id, "approve")).status).toBe("CONNECTED");
    expect(chain.calls.length).toBe(2);
  });
  it("unknown outcome stays REGISTERING (no blind retry), then reconciles from the chain", async () => {
    const { ctx, chain, advance } = setup(); chain.registerBehaviour = "unknown";
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    await (await acceptAs(ctx, token)).res;
    expect((await I.decide(ctx, "sidA", invite.id, "approve")).status).toBe("REGISTERING");
    expect(await code(I.decide(ctx, "sidA", invite.id, "approve"))).toBe("InProgress");
    advance(I.REGISTER_STALE_MS + 1);
    const [v] = await I.listInvites(ctx, "sidA", "7");                  // did not land -> retry allowed
    expect(v.status).toBe("ACCEPTED"); expect(v.lastError).toMatch(/Safe to approve again/);
    chain.registerBehaviour = "ok";
    expect((await I.decide(ctx, "sidA", invite.id, "approve")).status).toBe("CONNECTED");
  });
  it("unknown outcome that actually landed reconciles to CONNECTED without a second registration", async () => {
    const { ctx, chain, advance } = setup(); chain.registerBehaviour = "unknown-landed";
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const { pub, res } = await acceptAs(ctx, token); await res;
    await I.decide(ctx, "sidA", invite.id, "approve");
    advance(I.REGISTER_STALE_MS + 1);
    expect((await I.recipientStatus(ctx, token, pub)).status).toBe("CONNECTED");
    expect(chain.calls.length).toBe(1);
  });
  it("CONNECTED is reported to the phone only while the chain says the key is active", async () => {
    const { ctx, chain } = setup();
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const { pub, res } = await acceptAs(ctx, token); await res;
    await I.decide(ctx, "sidA", invite.id, "approve");
    chain.active.clear();                                               // e.g. revoked via the manual fallback
    expect((await I.recipientStatus(ctx, token, pub)).status).toBe("NOT_ACTIVE");
  });
  it("revoke: CONNECTED -> REVOKED only when the chain confirms the key is no longer active", async () => {
    const { ctx, chain } = setup();
    const { token, invite } = await I.createInvite(ctx, "sidA", { familyId: "7", name: "Ana" });
    const { pub, res } = await acceptAs(ctx, token); await res;
    await I.decide(ctx, "sidA", invite.id, "approve");
    const r = await I.revokeDevice(ctx, "sidA", invite.id);
    expect(r.status).toBe("REVOKED"); expect(chain.active.has(`7:${pub}`)).toBe(false);
    expect(await code(I.revokeDevice(ctx, "sidA", invite.id))).toBe("InvalidState");
  });
});
