// Invitation + device-approval state machine. Pure logic: storage, chain and clock are injected so every rule
// (expiry, single use, possession proof, inviter binding, approval races, failed registration) is unit-tested.
//
//   PENDING --accept(proof)--> ACCEPTED --approve--> REGISTERING --chain confirmed--> CONNECTED --revoke--> REVOKED
//      |                          |  \--reject--> REJECTED        \--chain failed--> ACCEPTED (retry)
//      \--10 min--> EXPIRED       \--10 min without approval--> EXPIRED
import { createHash, randomBytes } from "node:crypto";
import { fingerprint, fromHex, verifyPossession } from "@opentab/shared";

export const INVITE_TTL_MS = 10 * 60_000;      // invitation link lifetime
export const APPROVAL_TTL_MS = 10 * 60_000;    // device request must be approved within this window after acceptance
export const CHALLENGE_TTL_MS = 2 * 60_000;
export const REGISTER_STALE_MS = 60_000;       // a REGISTERING record older than this is reconciled against the chain
export const MAX_OPEN_INVITES_PER_FAMILY = 5;

export type InviteStatus = "PENDING" | "ACCEPTED" | "REGISTERING" | "CONNECTED" | "REJECTED" | "EXPIRED" | "REVOKED";
export interface InviteRec {
  id: string; tokenHash: string; familyId: string; inviterSid: string;
  name: string; contact?: string;                                  // both UNVERIFIED, typed by the inviter
  createdAt: number; expiresAt: number; updatedAt: number; status: InviteStatus;
  challenge?: { value: string; expiresAt: number; used: boolean };
  device?: { pub: string; label: string; acceptedAt: number };
  approveBy?: number; regStartedAt?: number; regTx?: string; revokeTx?: string; lastError?: string;
}
export interface DB { invites: Record<string, InviteRec> }
export interface Store { transact<T>(fn: (db: DB) => T): Promise<T> }
export interface ChainResult { status: "CONFIRMED" | "FAILED" | "PENDING" | "UNKNOWN"; hash?: string; error?: string }
export interface Chain {
  senderAddress(): string;
  familySender(familyId: string): Promise<string | null>;          // null = family does not exist
  isKeyActive(familyId: string, pubHex: string): Promise<boolean>;
  registerKey(familyId: string, pubHex: string): Promise<ChainResult>;
  revokeKey(familyId: string, pubHex: string): Promise<ChainResult>;
}
export interface Ctx { store: Store; chain: Chain; now: () => number; network: string; vault: string }

export class InviteError extends Error { constructor(public code: string, msg: string, public http = 400) { super(msg); } }
const err = (code: string, msg: string, http = 400) => new InviteError(code, msg, http);

const b64u = (n: number) => randomBytes(n).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("base64url");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;       // 32 random bytes = 256 bits
const PUB_RE = /^[0-9a-f]{64}$/;
const cleanText = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max) : "");

function byToken(db: DB, token: unknown): InviteRec {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) throw err("InviteNotFound", "This invitation link is not valid.", 404);
  const h = hashToken(token);
  const rec = Object.values(db.invites).find((r) => r.tokenHash === h);
  if (!rec) throw err("InviteNotFound", "This invitation link is not valid.", 404);
  return rec;
}
function expire(rec: InviteRec, now: number) {
  if (rec.status === "PENDING" && now > rec.expiresAt) { rec.status = "EXPIRED"; rec.updatedAt = now; }
  if (rec.status === "ACCEPTED" && rec.approveBy !== undefined && now > rec.approveBy) { rec.status = "EXPIRED"; rec.updatedAt = now; }
}
function prune(db: DB, now: number) {
  for (const [k, r] of Object.entries(db.invites)) if (now - r.updatedAt > 7 * 24 * 3600_000 && r.status !== "CONNECTED") delete db.invites[k];
}

/** Public view for the inviter. Never includes the token, its hash, or challenges. */
export function senderView(r: InviteRec) {
  return { id: r.id, familyId: r.familyId, name: r.name, contact: r.contact, nameVerified: false, status: r.status,
    createdAt: r.createdAt, expiresAt: r.expiresAt, approveBy: r.approveBy, regTx: r.regTx, revokeTx: r.revokeTx, lastError: r.lastError,
    device: r.device ? { label: r.device.label, pub: r.device.pub, fingerprint: fingerprint(fromHex(r.device.pub)), acceptedAt: r.device.acceptedAt } : undefined };
}

// ---------- inviter (authenticated demo operator session) ----------
export async function createInvite(ctx: Ctx, sid: string | undefined, input: { familyId: unknown; name: unknown; contact?: unknown }) {
  if (!sid) throw err("Unauthorized", "Operator session required.", 401);
  const familyId = typeof input.familyId === "string" && /^\d{1,12}$/.test(input.familyId) ? input.familyId : null;
  if (!familyId) throw err("BadRequest", "familyId required");
  const name = cleanText(input.name, 40);
  if (!name) throw err("BadRequest", "Enter the family member's name.");
  const contact = cleanText(input.contact, 80) || undefined;
  // Only the family's on-chain funder can register keys for it. This server signs as ONE demo sender account.
  const owner = await ctx.chain.familySender(familyId);
  if (owner === null) throw err("FamilyNotFound", `Family #${familyId} does not exist on this vault.`, 404);
  if (owner !== ctx.chain.senderAddress()) throw err("NotFunder", "This server's sender account does not fund that family.", 403);
  const token = b64u(32);
  const now = ctx.now();
  const rec: InviteRec = { id: b64u(12), tokenHash: hashToken(token), familyId, inviterSid: sid, name, contact,
    createdAt: now, expiresAt: now + INVITE_TTL_MS, updatedAt: now, status: "PENDING" };
  await ctx.store.transact((db) => {
    prune(db, now);
    const open = Object.values(db.invites).filter((r) => { expire(r, now); return r.familyId === familyId && (r.status === "PENDING" || r.status === "ACCEPTED"); });
    if (open.length >= MAX_OPEN_INVITES_PER_FAMILY) throw err("TooManyInvites", "Too many open invitations for this family. Wait for them to expire.", 429);
    db.invites[rec.id] = rec;
  });
  return { token, invite: senderView(rec) };   // the token is returned exactly once and never stored in clear
}

export async function listInvites(ctx: Ctx, sid: string | undefined, familyId: unknown) {
  if (!sid) throw err("Unauthorized", "Operator session required.", 401);
  await reconcileStale(ctx, sid);
  const now = ctx.now();
  return ctx.store.transact((db) => Object.values(db.invites)
    .filter((r) => r.inviterSid === sid && r.familyId === String(familyId))
    .map((r) => { expire(r, now); return senderView(r); })
    .sort((a, b) => b.createdAt - a.createdAt));
}

function ownRecord(db: DB, sid: string | undefined, id: unknown): InviteRec {
  if (!sid) throw err("Unauthorized", "Operator session required.", 401);
  const rec = typeof id === "string" ? db.invites[id] : undefined;
  if (!rec) throw err("InviteNotFound", "Unknown invitation.", 404);
  if (rec.inviterSid !== sid) throw err("NotInviter", "Only the operator session that created this invitation can act on it.", 403);
  return rec;
}

/** Explicit approve / reject of the device request. Approval is the ONLY path to on-chain registration. */
export async function decide(ctx: Ctx, sid: string | undefined, id: unknown, decision: unknown) {
  if (decision !== "approve" && decision !== "reject") throw err("BadRequest", "decision must be approve or reject");
  const now = ctx.now();
  // Phase 1 (atomic): ACCEPTED -> REGISTERING. A concurrent second approval sees REGISTERING and stops.
  const rec = await ctx.store.transact((db) => {
    const r = ownRecord(db, sid, id); expire(r, now);
    if (r.status === "REGISTERING") throw err("InProgress", "Registration already in progress.", 409);
    if (r.status !== "ACCEPTED") throw err("InvalidState", `Invitation is ${r.status}; nothing to ${decision}.`, 409);
    if (decision === "reject") { r.status = "REJECTED"; r.updatedAt = now; return { ...r }; }
    r.status = "REGISTERING"; r.regStartedAt = now; r.lastError = undefined; r.updatedAt = now;
    return { ...r };
  });
  if (decision === "reject") return senderView(rec);
  return senderView(await register(ctx, rec));
}

/** Phase 2: talk to the chain outside the lock, then record the outcome. Registers ONLY rec.familyId + rec.device.pub. */
async function register(ctx: Ctx, rec: InviteRec): Promise<InviteRec> {
  const { familyId } = rec; const pub = rec.device!.pub;
  let res: ChainResult;
  try {
    res = (await ctx.chain.isKeyActive(familyId, pub)) ? { status: "CONFIRMED" } : await ctx.chain.registerKey(familyId, pub);
  } catch (e: any) { res = { status: "UNKNOWN", error: String(e?.message ?? e) }; }
  if (res.status === "FAILED") {
    // The contract refused (or the tx failed). If the key is nevertheless active (e.g. KeyAlreadyRegistered), it is connected.
    const active = await ctx.chain.isKeyActive(familyId, pub).catch(() => false);
    if (active) res = { status: "CONFIRMED", hash: res.hash };
  }
  return ctx.store.transact((db) => {
    const r = db.invites[rec.id]; const now = ctx.now();
    if (res.status === "CONFIRMED") { r.status = "CONNECTED"; r.regTx = res.hash ?? r.regTx; r.lastError = undefined; }
    else if (res.status === "FAILED") { r.status = "ACCEPTED"; r.lastError = `Registration failed: ${res.error ?? "rejected"}. You can retry.`; r.regTx = res.hash; }
    else { r.regTx = res.hash; r.lastError = `Registration status ${res.status}; checking the chain before allowing a retry.`; } // stays REGISTERING
    r.updatedAt = now;
    return { ...r };
  });
}

/** A REGISTERING record whose outcome was unknown is resolved from the chain, never by blind resubmission. */
async function reconcileStale(ctx: Ctx, sid?: string) {
  const now = ctx.now();
  const stale = await ctx.store.transact((db) => Object.values(db.invites)
    .filter((r) => r.status === "REGISTERING" && (!sid || r.inviterSid === sid) && now - (r.regStartedAt ?? 0) > REGISTER_STALE_MS).map((r) => ({ ...r })));
  for (const s of stale) {
    const active = await ctx.chain.isKeyActive(s.familyId, s.device!.pub).catch(() => null);
    if (active === null) continue;
    await ctx.store.transact((db) => {
      const r = db.invites[s.id]; if (r.status !== "REGISTERING") return;
      if (active) { r.status = "CONNECTED"; r.lastError = undefined; }
      else { r.status = "ACCEPTED"; r.approveBy = Math.max(r.approveBy ?? 0, ctx.now() + 60_000); r.lastError = "Previous registration did not land on chain. Safe to approve again."; }
      r.updatedAt = ctx.now();
    });
  }
}

export async function revokeDevice(ctx: Ctx, sid: string | undefined, id: unknown) {
  const rec = await ctx.store.transact((db) => {
    const r = ownRecord(db, sid, id);
    if (r.status !== "CONNECTED") throw err("InvalidState", `Invitation is ${r.status}; only a connected device can be revoked.`, 409);
    return { ...r };
  });
  let res: ChainResult;
  try { res = await ctx.chain.revokeKey(rec.familyId, rec.device!.pub); } catch (e: any) { res = { status: "UNKNOWN", error: String(e?.message ?? e) }; }
  const stillActive = await ctx.chain.isKeyActive(rec.familyId, rec.device!.pub).catch(() => null);
  return ctx.store.transact((db) => {
    const r = db.invites[rec.id];
    if (stillActive === false) { r.status = "REVOKED"; r.revokeTx = res.hash; r.lastError = undefined; }
    else r.lastError = `Revocation not confirmed (${res.status}${res.error ? ": " + res.error : ""}). The key may still be active.`;
    r.updatedAt = ctx.now();
    return senderView(r);
  });
}

// ---------- recipient (public, holds only the invitation token) ----------
/** Shows the invitation and issues a fresh single-use challenge. Does not consume the invitation. */
export async function openInvite(ctx: Ctx, token: unknown) {
  const now = ctx.now();
  return ctx.store.transact((db) => {
    const r = byToken(db, token); expire(r, now);
    if (r.status === "EXPIRED") throw err("InviteExpired", "This invitation has expired. Ask the sender for a new one.", 410);
    if (r.status !== "PENDING") throw err("InviteUsed", "This invitation has already been used.", 409);
    r.challenge = { value: b64u(32), expiresAt: Math.min(now + CHALLENGE_TTL_MS, r.expiresAt), used: false };
    r.updatedAt = now;
    return { inviteId: r.id, familyId: r.familyId, name: r.name, inviter: "Demo sender (shared demo operator account)",
      expiresAt: r.expiresAt, challenge: r.challenge.value, network: ctx.network, vault: ctx.vault };
  });
}

/** Redeems the invitation exactly once, with proof the device holds the private key for `pub`. */
export async function acceptInvite(ctx: Ctx, input: { token: unknown; pub: unknown; label: unknown; signature: unknown }) {
  const now = ctx.now();
  const pub = typeof input.pub === "string" && PUB_RE.test(input.pub) ? input.pub : null;
  if (!pub) throw err("BadRequest", "pub must be 64 lowercase hex characters");
  const sig = typeof input.signature === "string" && /^[0-9a-f]{128}$/.test(input.signature) ? fromHex(input.signature) : null;
  if (!sig) throw err("BadRequest", "signature must be 128 lowercase hex characters");
  const label = cleanText(input.label, 40);
  const out = await ctx.store.transact((db) => {
    const r = byToken(db, input.token); expire(r, now);
    if (r.status === "EXPIRED") throw err("InviteExpired", "This invitation has expired. Ask the sender for a new one.", 410);
    if (r.status !== "PENDING") throw err("InviteUsed", "This invitation has already been used.", 409);
    const ch = r.challenge;
    if (!ch || ch.used || now > ch.expiresAt) throw err("ChallengeExpired", "The security challenge expired or was already used. Try again.", 409);
    ch.used = true;                                   // burned whether or not the proof is valid: no replay, no retry-grinding
    r.updatedAt = now;
    const ok = verifyPossession({ network: ctx.network, vault: ctx.vault, inviteId: r.id, familyId: BigInt(r.familyId), challenge: ch.value, pub: fromHex(pub) }, sig);
    if (!ok) return { bad: true as const };            // returned (not thrown) so the burned challenge is committed
    r.status = "ACCEPTED"; r.device = { pub, label, acceptedAt: now }; r.approveBy = now + APPROVAL_TTL_MS;
    return { bad: false as const, status: r.status, familyId: r.familyId, fingerprint: fingerprint(fromHex(pub)), approveBy: r.approveBy };
  });
  if (out.bad) throw err("BadProof", "Key possession proof failed.", 401);
  const { bad: _b, ...result } = out;
  return result;
}

/** Recipient polling. "CONNECTED" is reported only if the chain confirms the key is active right now. */
export async function recipientStatus(ctx: Ctx, token: unknown, pub: unknown) {
  await reconcileStale(ctx);
  const now = ctx.now();
  const snap = await ctx.store.transact((db) => { const r = byToken(db, token); expire(r, now); return { ...r }; });
  if (!snap.device) return { status: snap.status === "EXPIRED" ? "EXPIRED" : "PENDING" };
  if (snap.device.pub !== pub) return { status: "USED_BY_OTHER_DEVICE" };   // e.g. a stolen link was redeemed first
  if (snap.status === "CONNECTED") {
    const active = await ctx.chain.isKeyActive(snap.familyId, snap.device.pub).catch(() => null);
    if (active !== true) return { status: active === false ? "NOT_ACTIVE" : "CHECKING", familyId: snap.familyId };
    return { status: "CONNECTED", familyId: snap.familyId, regTx: snap.regTx };
  }
  return { status: snap.status === "REGISTERING" ? "ACCEPTED" : snap.status, familyId: snap.familyId };
}
