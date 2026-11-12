# Claude Code operating instructions: OpenTab Global

**STATUS: IMPLEMENTATION AUTHORIZED (user, 2026-11-12).** The approved architecture is recorded in `docs/IMPLEMENTATION_PLAN.md` and `docs/APPROVED_ARCHITECTURE.md`. Build it in small, tested milestones. Do not restart brainstorming or redesign the approved architecture.

**First action each session:** read `docs/NEXT_STEPS.md` and the latest entry in `docs/BUILD_LOG.md`, then continue the current milestone.

## Context priority

1. Latest explicit user instructions in the conversation, then `docs/IMPLEMENTATION_PLAN.md` (approved plan and ten architectural amendments).
2. Product decisions in `docs/CLAUDE_PLANNING_HANDOFF.md` (its PLAN-ONLY banner is superseded; its product and security content still applies).
3. `docs/DECISIONS.md`, `docs/BUILD_AND_HOSTING.md` and `submission/SUBMISSION_CHECKLIST.md`.
4. Uploaded original source in `archive/legacy_opentab_starter/` (starting point, not guaranteed secure or deployable).
5. Verified live documentation, with explicit citation and as-of dates.

## Locked product direction

- Mode A first: recipient phone has **no connectivity**, merchant terminal **has internet**; family funds one shared on-chain allowance; recipient signs exact invoice/asset/amount/merchant/nonce; merchant submits to Soroban and waits for confirmed settlement. One transaction cannot be replayed; concurrent overspends fail atomically.
- Mode B second: recipient + shop offline; on-chain money **pre-reserved to ONE named merchant**; shop verifies cumulative tickets locally, durably records highest accepted amount; reconnect and settle; explicit acceptance deadline and longer settlement grace. Spending categories are budgeting UI labels, **not** fungible security partitions across disconnected stores.
- Only Mode A gets **live local-currency FX quotes**. In Mode B use agreed fixed units/terms; never retroactively vary what a customer approved.
- On-chain test asset first (genuine Stellar Testnet USDC if feasible or prominently labelled developer token). Fiat-equivalent display != token balance != fiat redemption.
- BVNK (Stellar USDC, potential USD/EUR/GBP bank fiat), Conduit (potential MXN/BRL/COP payouts but supported USDC network ≠ Stellar), MoneyGram Ramps (Stellar USDC cash, not universal bank deposits) are FUTURE/conditional integrations. No real merchant withdrawals until commercial access, fees, provider coverage and KYC/KYB are verified.
- Build one Next.js TypeScript PWA for Vercel and phone home-screen installation, not three standalone native apps.
- No claim of first place guarantee or production safety.

## Deadline strategy

P0 by November 13 8:30 AM EST: meaningful deployed Stellar Testnet contract, verified real QR-authorized payment, public source + README, public demo video, one-page overview, Devpost entry. P1 by Nov 16: Mode B if built and tested, UX polish, on-site board and pitch. P2: production off-ramps, multiasset liquidity routing, commercial identity, fully audited security and native apps.

## Implementation rules

- Work milestone by milestone as listed in `docs/IMPLEMENTATION_PLAN.md`. Avoid unnecessary architecture rewrites.
- Run the relevant tests after every substantial code change (`cargo test --locked`, `stellar contract build`, JS tests). Report actual output, never assumed functionality.
- Always distinguish four evidence levels: (1) local unit tests passed, (2) WASM compiled, (3) contract deployed with a real ID, (4) on-chain transaction confirmed with a hash. Only (4) proves a payment.
- Keep features that are not working clearly labelled incomplete in UI, README and submission text.
- Update `docs/BUILD_LOG.md` (factual, observed results only) and `docs/NEXT_STEPS.md` at the end of every milestone/session.
- **Testnet only.** No Mainnet deployment, real funds, real fiat payouts or production provider credentials.
- `archive/legacy_opentab_starter/` is **read-only** reference. New contracts copy from it into `contracts/`. Only an unavoidable compatibility fix may touch the archive, and it must be documented in BUILD_LOG with the reason and diff.
- Still requires explicit user confirmation each time: pushing to GitHub or making the repo public, creating cloud resources (Vercel project, Supabase), spending money, and anything outside the current milestone. Creating Testnet identities and deploying Testnet contracts proceed only when that milestone is reached and the user has authorized it.
- Never force-push, reset or rewrite Git history.

## Security

Never place private seeds in client bundles or NEXT_PUBLIC env vars. Never equate local balance decrements or QR receipt with settlement; don't let merchant app show paid before confirmed chain transaction. Test invoice replay, duplicate, cross-merchant reuse, concurrent overspend, PWA airplane mode, local data loss, late channel refund and key rotation. Use only test funds for demos. Do not silently replace stablecoin with native XLM while labeling it as dollars.

Never expose private signing keys: no seeds/secret keys (`S...`) in Git, logs, QR codes, screenshots, client bundles or `NEXT_PUBLIC_*` vars. Stellar CLI identities stay in the CLI keystore outside the repo; server-side Testnet secrets only in server-only env vars. Before every commit, scan staged files for secret patterns.
