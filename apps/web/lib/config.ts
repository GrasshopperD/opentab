// PUBLIC configuration only. Nothing secret may be added here.
import { TESTNET_PASSPHRASE } from "@opentab/shared";

export const NETWORK_PASSPHRASE = TESTNET_PASSPHRASE;
export const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
export const VAULT_ID = process.env.NEXT_PUBLIC_FAMILY_VAULT_CONTRACT_ID || "";
export const TOKEN_ID = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID || "";
export const TOKEN_LABEL = process.env.NEXT_PUBLIC_TOKEN_LABEL || "OpenTab Demo USD";
export const TOKEN_CODE = process.env.NEXT_PUBLIC_TOKEN_CODE || "OTUSD";
export const EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx/";
export const EXPLORER_CONTRACT = "https://stellar.expert/explorer/testnet/contract/";

export interface MerchantProfile { id: "A" | "B"; name: string; address: string; city: string }
export const MERCHANTS: MerchantProfile[] = [
  { id: "A", name: "Tienda Rosa", city: "Oaxaca (demo)", address: process.env.NEXT_PUBLIC_MERCHANT_A_ADDRESS || "" },
  { id: "B", name: "Farmacia Luz", city: "Oaxaca (demo)", address: process.env.NEXT_PUBLIC_MERCHANT_B_ADDRESS || "" },
];

/** Illustrative rates: local units per 1 demo USD. NOT live quotes. */
export const DEMO_RATES: Record<string, { rate: string; digits: number }> = {
  MXN: { rate: "18.4200", digits: 2 },
  BRL: { rate: "5.6100", digits: 2 },
  PHP: { rate: "58.2500", digits: 2 },
  CAD: { rate: "1.3900", digits: 2 },
  USD: { rate: "1.0000", digits: 2 },
};
export const RATE_SOURCE = "ILLUSTRATIVE";

/** Existing, already-funded family used by the judging demo. Its balance is always read live from the chain. */
export const DEMO_FAMILY_ID = (process.env.NEXT_PUBLIC_DEMO_FAMILY_ID || "7").replace(/\D/g, "") || "7";

/** Invitation pairing UI (local preview only). Set at BUILD time from INVITES_ENABLED=1 via next.config.ts; always off on Vercel.
 *  The invitation API checks independently at runtime and fails closed. */
export const INVITES_UI = process.env.OT_INVITES_UI === "1";

/** Illustrative demo catalog, priced in USD cents. Names must match the protocol's item-name rule [A-Za-z0-9 ]. */
export const CATALOG: { sku: string; name: string; unitMinor: bigint }[] = [
  { sku: "milk", name: "Milk", unitMinor: 300n },
  { sku: "bread", name: "Bread", unitMinor: 200n },
  { sku: "water", name: "Water", unitMinor: 100n },
  { sku: "apples", name: "Apples", unitMinor: 400n },
];
export const CATALOG_CURRENCY = "USD";

export const isConfigured = () => Boolean(VAULT_ID && TOKEN_ID && MERCHANTS.every((m) => m.address));
