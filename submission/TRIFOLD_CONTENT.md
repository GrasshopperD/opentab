# Trifold board content

## Left panel: the problem and a user story
**Headline:** Money arrives. Spending it shouldn't need a cash trip.
- Remittances often become cash at a pickup counter before they can buy food or medicine.
- Many recipients have phones but patchy or expensive data.
- Neighbourhood shops extend informal credit and carry the risk.

**User story:** *Maria (Toronto) supports her mother Rosa (Oaxaca). Rosa buys groceries at Tienda Rosa down the street.
With OpenTab, Rosa scans the shop's QR, approves on her phone with no data, and the shop is paid on Stellar in seconds.*

Visual: simple map line Toronto → Oaxaca; photo/illustration of a corner shop counter with two phones.

## Center panel: the product and demo flow
**Headline:** Scan. Approve offline. Settled on Stellar.
1. Sender funds a shared family balance.
2. Shop shows invoice QR: local price + exact token charge.
3. Family phone, offline, signs that exact purchase.
4. Shop submits, contract verifies and pays.
5. "Payment confirmed" only after on-chain confirmation. Replays are rejected.

Visuals: four real app screenshots in a row (Shop invoice QR · Family review screen in airplane mode · Family approval QR ·
Shop "Payment confirmed"); a printed QR to the live demo and one to the explorer transaction.

## Right panel: Stellar architecture, validation, roadmap
**Architecture:** Phone (Ed25519 key, offline) → QR → Shop terminal (online) → FamilyVault Soroban contract → Stellar
Asset Contract (demo USD) → shop account.

**Technical validation (real, Testnet):**
- Contract `CAUCH3MN…ABYLGW` deployed; payments confirmed at two shops from one balance.
- Replay of the same approval rejected by the deployed contract (`InvoiceUsed`); overspend rejected.
- 34 contract tests · 13 protocol tests · 18 live API checks · 18 security checks · 5 browser tests.
- Same signing bytes verified in browser code and in Rust.

**Roadmap:** both-offline shop channels with reserved funds → real USDC → licensed local payouts → audit and pilots.

**Small print (keep visible):** Stellar Testnet prototype. Demo token has no value. Exchange rates illustrative. No bank
payouts. Unaudited.
