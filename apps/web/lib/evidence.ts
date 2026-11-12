// Verified Testnet evidence (copied from submission/RELEASE_LINKS.md; each was observed as CONFIRMED).
export interface Evidence { label: string; hash: string; detail: string }

export const EVIDENCE: Evidence[] = [
  { label: "First signed merchant payment (CLI)", hash: "0b8d72ed8e267ca31f2fe7179f5afbdcb7586e2c887c18a90a7d2c3b63bbb05f",
    detail: "MXN 100.00 → 5.4288817 OTUSD to Tienda Rosa" },
  { label: "Same family balance, second shop", hash: "009cc536cc3d8c88445b4a07b5d6de0189b843544c0d3ce9a57bddf87280e5f3",
    detail: "MXN 50.00 → 2.7144409 OTUSD to Farmacia Luz" },
  { label: "Payment made through the app UI (recipient offline while signing)", hash: "e42405a85a595d7a9bc347d1f4fa09b2364a76043984746e6ed9a7f8e98811d4",
    detail: "MXN 20.00 → 1.0857764 OTUSD; replay then rejected" },
  { label: "FamilyVault deployment", hash: "86f91a10b0203358b1f58c95411c3f811af0d868b68ac96c885c86fc07ea5949",
    detail: "Contract deployed to Stellar Testnet" },
];

export const TOKEN_ISSUER = process.env.NEXT_PUBLIC_TOKEN_ISSUER || "";
