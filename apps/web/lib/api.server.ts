import "server-only";
import { NextResponse } from "next/server";
import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { ChainError, jsonSafe, scv } from "./chain.server";
import { RPC_URL, VAULT_ID } from "./config";
import { ProtocolError } from "@opentab/shared";
import { clientIp, rateLimited } from "./guard.server";

/** Public read endpoints: generous per-IP limit to stop scraping/RPC abuse. */
export function readLimited(req: Request): Response | null {
  return rateLimited(`r:${clientIp(req)}`, 120, 60_000)
    ? NextResponse.json({ error: "RateLimited", detail: "Too many requests." }, { status: 429 }) : null;
}

export function ok(data: any) { return NextResponse.json(jsonSafe(data)); }
export function fail(e: unknown) {
  if (e instanceof ProtocolError) return NextResponse.json({ error: "BadRequest", detail: e.message }, { status: 400 });
  if (e instanceof ChainError) return NextResponse.json({ error: e.code, detail: e.message.slice(0, 300) }, { status: 400 });
  return NextResponse.json({ error: "ServerError", detail: String((e as any)?.message ?? e).slice(0, 300) }, { status: 500 });
}
export function badRequest(msg: string) { return NextResponse.json({ error: "BadRequest", detail: msg }, { status: 400 }); }

export function parseId(s: unknown): bigint {
  if (typeof s !== "string" || !/^\d{1,12}$/.test(s)) throw new ChainError("BadRequest", "invalid family id");
  return BigInt(s);
}

/** Recent `paid` events from the vault (RPC keeps a limited event window). */
export async function recentPayments(filter: { familyId?: bigint; merchant?: string }) {
  const server = new rpc.Server(RPC_URL);
  const latest = await server.getLatestLedger();
  const topics = [
    xdr.ScVal.scvSymbol("paid").toXDR("base64"),
    filter.familyId !== undefined ? scv.u64(filter.familyId).toXDR("base64") : "*",
    filter.merchant ? scv.addr(filter.merchant).toXDR("base64") : "*",
  ];
  // RPC scans a bounded ledger range per call and returns a cursor; follow it (~1 day window, max 5 pages).
  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [VAULT_ID], topics: [topics] }];
  const events: rpc.Api.EventResponse[] = [];
  let res = await server.getEvents({ startLedger: Math.max(1, latest.sequence - 17_000), filters, limit: 50 });
  for (let page = 0; ; page++) {
    events.push(...res.events);
    if (events.length >= 50 || page >= 4 || !res.cursor) break;
    const next = await server.getEvents({ cursor: res.cursor, filters, limit: 50 });
    if (next.cursor === res.cursor && next.events.length === 0) break;
    res = next;
  }
  return events.map((ev) => {
    const body = scValToNative(ev.value) as any;
    return {
      txHash: ev.txHash, ledger: ev.ledger, at: ev.ledgerClosedAt,
      familyId: scValToNative(ev.topic[1]), merchant: scValToNative(ev.topic[2]),
      amount: body.amount, terminalId: body.terminal_id,
      invoiceId: Buffer.from(body.invoice_id).toString("hex"),
    };
  }).reverse();
}
