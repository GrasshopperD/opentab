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

export const isConfigured = () => Boolean(VAULT_ID && TOKEN_ID && MERCHANTS.every((m) => m.address));
