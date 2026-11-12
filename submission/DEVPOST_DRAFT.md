# Devpost submission draft: OpenTab Global

**Tagline:** Family support spendable at the corner shop, approved on a phone with no data, settled on Stellar.

## Inspiration
Remittances arrive, but turning them into groceries usually means a cash pickup first. Many recipients have phones without
reliable data, and small shops carry informal credit. We wanted the money to be spendable where families already shop.

## What it does
A sender funds a shared family balance held by a Soroban contract. A shop prices goods in local currency and shows an
invoice QR with the exact token charge. The family member's phone, offline, verifies and signs that exact purchase. The
shop submits the signed approval; the FamilyVault contract checks the key, signature, expiry, one-time invoice and balance,
and transfers tokens to the shop. The shop shows "Payment confirmed" only after Stellar confirms. One balance works at
multiple shops; replays and overspends are rejected by the contract.

## How we built it
- **Contract:** Rust + soroban-sdk 29.0.1, deployed on Stellar Testnet (`CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW`).
  Direct Ed25519 verification of a 340-byte canonical message binding network, contract, token, family, signer, merchant,
  terminal, invoice, amount, quote hash and expiry. Persistent replay records with TTL management.
- **Protocol package:** TypeScript (@noble/curves), browser-safe, cross-checked against Rust with a shared test vector.
- **App:** Next.js 15 installable PWA with Sender, Family and Shop screens; QR generation and camera scanning (jsQR) with
  paste fallback; service worker for an offline signing screen; server-only Testnet relay for the demo sender and shops.
- **Asset:** OpenTab Demo USD (OTUSD), a Testnet classic asset wrapped by a Stellar Asset Contract. Not USDC, no value.

## Challenges
Designing a signing format that is identical in the browser and in the contract; making sure a timeout is shown as
"pending/unknown" and reconciled rather than retried as a new charge; keeping every secret off the client.

## Accomplishments
Real Testnet payments at two different shops from one family balance, a replayed approval rejected on chain, and 34 + 13
automated tests plus a 17-step live end-to-end test passing. Evidence: `submission/RELEASE_LINKS.md`.

## What we learned
On-chain rules make offline approval safe only when the shop is online; when both sides are offline you need funds
reserved for one named shop, which is why that is a separate, later mode.

## What's next
Physical-device airplane-mode testing and hardened key storage; both-offline shop channels; real USDC; licensed payout
partners where available; audit and pilots.

## Built with
stellar, soroban, rust, typescript, next.js, react, pwa, ed25519

## Links (fill only when real)
- GitHub: TBD · Live demo: TBD · Video: TBD
- Contract: https://stellar.expert/explorer/testnet/contract/CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW
- Example payment: https://stellar.expert/explorer/testnet/tx/0b8d72ed8e267ca31f2fe7179f5afbdcb7586e2c887c18a90a7d2c3b63bbb05f

*Testnet prototype; demo token has no value; illustrative exchange rates; no bank payouts; built with AI assistance.*
