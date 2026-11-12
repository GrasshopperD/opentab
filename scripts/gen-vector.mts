import * as P from "../packages/shared/src/index.ts";
const S = new Uint8Array(32).fill(7);
const q = { currency: "MXN", localMinor: 10000n, minorDigits: 2, rate: "18.4200", source: "ILLUSTRATIVE" };
const inv = { network: P.TESTNET_PASSPHRASE, vault: "CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW", token: "CC6JPD3NL3ZJMWT2JG246ISOG5QB2N72BG77KPVC3OCDEYUHK2TEPL73", merchant: "GCDSS6VQP6GGTV6K2J6FMG2TQN2G2EG37TSQ5UYQK547ODDYGNPPRWN4", merchantName: "Tienda Rosa", terminalId: 1, invoiceId: new Uint8Array(32).fill(0x11), amount: P.computeCharge(q), quote: q, expiresAt: 1_800_000_600n };
const a = P.signInvoice(inv, 1n, S, 1_800_000_000n);
const msg = P.encodePaymentMessage(P.fieldsFor(inv, 1n, a.signer));
console.log(JSON.stringify({ note: "Test-only key: 32 bytes of 0x07. Never use with real funds.", vault: inv.vault, token: inv.token, merchant: inv.merchant, family_id: 1, terminal_id: 1, invoice_id_hex: P.toHex(inv.invoiceId), amount: inv.amount.toString(), quote_hash_hex: P.toHex(P.quoteHash(q, inv.amount)), expires_at: 1800000600, network_id_hex: P.toHex(P.networkId(P.TESTNET_PASSPHRASE)), public_key_hex: P.toHex(a.signer), message_hex: P.toHex(msg), signature_hex: P.toHex(a.signature) }, null, 2));
