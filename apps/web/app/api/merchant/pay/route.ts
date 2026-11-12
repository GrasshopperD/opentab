import { invoke, authStruct, scv, read, ChainError } from "@/lib/chain.server";
import { badRequest, fail, ok } from "@/lib/api.server";
import { MERCHANTS, TOKEN_ID, VAULT_ID, NETWORK_PASSPHRASE } from "@/lib/config";
import { parseAuthQR, quoteHash, verifyAuthorization, ProtocolError } from "@opentab/shared";

export const dynamic = "force-dynamic";

/**
 * Merchant terminal submits a recipient-signed authorization. The server only
 * relays as the merchant's Testnet signer; the CONTRACT enforces every rule.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const m = MERCHANTS.find((x) => x.id === body.merchantId);
    if (!m) return badRequest("unknown merchant");
    let a;
    try { a = parseAuthQR(String(body.authorization ?? "")); } catch (e) {
      return badRequest(e instanceof ProtocolError ? e.message : "malformed authorization");
    }
    const inv = a.invoice;
    if (inv.network !== NETWORK_PASSPHRASE || inv.vault !== VAULT_ID || inv.token !== TOKEN_ID)
      return badRequest("authorization is for a different network, vault or token");
    if (inv.merchant !== m.address) return badRequest("authorization names a different merchant than this terminal");
    if (!verifyAuthorization(a)) return badRequest("signature does not verify locally (tampered or wrong key)");

    // Idempotency: if this invoice is already settled, do not submit again.
    const used = await read(VAULT_ID, "is_invoice_used", [scv.u64(a.familyId), scv.bytes(inv.invoiceId)]);
    if (used && !body.forceSubmitForDemo) return ok({ status: "FAILED", error: "InvoiceUsed", detail: "This invoice has already been paid. No second charge." });

    const args = authStruct({
      familyId: a.familyId, signer: a.signer, merchant: inv.merchant, terminalId: inv.terminalId,
      invoiceId: inv.invoiceId, amount: inv.amount, quoteHash: quoteHash(inv.quote, inv.amount), expiresAt: inv.expiresAt,
    });
    const role = m.id === "A" ? "merchantA" : "merchantB";
    try {
      const r = await invoke(role, "pay", [args, scv.bytes(a.signature)]);
      return ok({ ...r, familyBalance: r.result });
    } catch (e) {
      if (e instanceof ChainError) return ok({ status: "FAILED", error: e.code, detail: "Rejected by the FamilyVault contract (simulation)." });
      throw e;
    }
  } catch (e) { return fail(e); }
}
