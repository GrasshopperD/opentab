# Architecture decision record | November 12, 2026

## Decisions accepted in conversation

- Target: Velocity Stellar challenge Problem Space 3, transnational household financial access and spendability.
- Single installable mobile-friendly web app with sender, family recipient, merchant roles.
- Host frontend on Vercel. Testnet payments verified independently by explorer/RPC.
- **Mode A is P0**: customer offline, merchant online. Shared family allowance across participating merchants. Merchant creates QR invoice, customer signs exact token amount, merchant submits to on-chain contract and waits for confirmed settlement. Unique order ID, domain-separated signature, replay resistance, contract-enforced balance.
- **Mode B is P1**: both offline with separately escrowed merchant-specific allowance, category labels allowed for UX. Cumulative ticket signing, trusted preloaded state, shop durable highest-accepted tally, late settlement / refund safety. No fully shared cross-merchant offline balance.
- Only connected merchants can use live FX pricing. User must see local price and exact authorized USDC amount. Do not misrepresent displayed currency as held asset.
- USDC Testnet or explicitly marked non-redeemable demo USD token in hackathon. Optional verified path-payment extension after demo.
- Payout markets are **candidate research**, not live OpenTab support. Strict gate actual provider commercial access, asset/network compatibility, bank destination, KYC/KYB and quote.

## Engineering decisions still to make in the written Claude plan

> Resolved as engineering defaults in `docs/IMPLEMENTATION_PLAN.md` (2026-11-12): two contracts; direct Ed25519 canonical-message auth verified on chain; merchant pays fees via a server-only Testnet submitter; no database for P0; Circle Testnet USDC first, labelled demo token as fallback.

- Single contract with two modules vs dedicated FamilyVault and OfflineChannel contract instances, and exact atomic escrow transfer boundaries.
- Signature format, nonce/order-ID scheme, merchant terminal ID binding, claim receipt/replay structures.
- Recipient signing-key local protection and recovery design appropriate to demo; choose low-risk fallback for PWA mobile limitations.
- Whether to include Supabase/auth before first Testnet demo, or simulate user profiles while keeping real on-chain payment.
- Official Testnet issuer/token and safe Soroban asset handling.
- Off-chain fiat-rate source, rate freshness policy, unavailability fallback and merchant FX risk disclosure.
- Who pays for Stellar network fees and how client obtains signed transaction submission without exposing server keys.

## Things not yet verified

- Existing original Rust and JavaScript code reportedly passed 17+3 tests in Claude's earlier environment; not run here.
- No verified live OpenTab Testnet contract or Vercel deployment.
- No live bank-payout partners. BVNK/Conduit/MoneyGram options depend on separate access.
- Details in organizer Notion not fully confirmed; consult the team and organizer.
