import "server-only";
import * as path from "node:path";
import { NextResponse } from "next/server";
import { ChainError, invoke, read, roleAddress, scv } from "./chain.server";
import { fileStore } from "./invite-store";
import { InviteError, type Chain, type Ctx } from "./invites.core";
import { NETWORK_PASSPHRASE, VAULT_ID } from "./config";
import { fromHex } from "@opentab/shared";

/** Invitations need durable, serialized server state. Fail CLOSED where we cannot provide it:
 *  OFF unless INVITES_ENABLED=1 is set explicitly, and NEVER on Vercel/serverless (the file store is single-process). */
export function invitesAvailable(): { ok: true } | { ok: false; reason: string } {
  if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL || process.env.AWS_LAMBDA_FUNCTION_NAME)
    return { ok: false, reason: "Invitations need a durable database; serverless instance memory/disk is not used. Use manual pairing." };
  if (process.env.INVITES_ENABLED !== "1") return { ok: false, reason: "Invitations are not enabled on this deployment. Use manual pairing." };
  if (!process.env.SENDER_SECRET) return { ok: false, reason: "Server sender signer is not configured." };
  return { ok: true };
}

const chain: Chain = {
  senderAddress: () => roleAddress("sender"),
  async familySender(familyId) {
    try { return (await read(VAULT_ID, "get_family", [scv.u64(BigInt(familyId))])).sender as string; }
    catch (e) { if (e instanceof ChainError && e.code === "FamilyNotFound") return null; throw e; }
  },
  isKeyActive: async (f, pub) => Boolean(await read(VAULT_ID, "is_key_active", [scv.u64(BigInt(f)), scv.bytes(fromHex(pub))])),
  async registerKey(f, pub) {
    try { return await invoke("sender", "register_key", [scv.u64(BigInt(f)), scv.bytes(fromHex(pub))]); }
    catch (e) { if (e instanceof ChainError) return { status: "FAILED", error: e.code }; throw e; }
  },
  async revokeKey(f, pub) {
    try { return await invoke("sender", "revoke_key", [scv.u64(BigInt(f)), scv.bytes(fromHex(pub))]); }
    catch (e) { if (e instanceof ChainError) return { status: "FAILED", error: e.code }; throw e; }
  },
};

// One store per process (kept on globalThis so every route bundle shares the same serialization queue).
const g = globalThis as unknown as { __otInviteStore?: ReturnType<typeof fileStore> };
export function ctx(): Ctx {
  g.__otInviteStore ??= fileStore(process.env.INVITE_STORE_DIR || path.join(process.cwd(), ".data"));
  return { store: g.__otInviteStore, chain, now: Date.now, network: NETWORK_PASSPHRASE, vault: VAULT_ID };
}

export function inviteFail(e: unknown) {
  if (e instanceof InviteError) return NextResponse.json({ error: e.code, detail: e.message }, { status: e.http });
  console.error("invite route error:", e instanceof Error ? e.message : "unknown");   // never logs request bodies/tokens
  return NextResponse.json({ error: "ServerError", detail: "Unexpected error." }, { status: 500 });
}
export const unavailable = (reason: string) => NextResponse.json({ error: "InvitesUnavailable", detail: reason }, { status: 503 });
