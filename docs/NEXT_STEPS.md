# Next steps | OpenTab Global

The current to-do list between Claude Code sessions. Update at the end of every session.
Items marked **[USER]** need the user to do or approve something.

**Hard deadline:** Devpost + one-page overview, Fri 13 Nov 2026, 08:30 EST.
**Current milestone:** M7 (submission). M1-M4 DONE; app live at https://opentabglobal.vercel.app. See `docs/SESSION_HANDOFF.md`.

## Before 08:30 EST Nov 13 (priority order)

- [x] Sender preset (Family #7) + product catalog + deployment-safety fixes (sessions 6-7, branch `ui-demo-catalog`, PR #1).
- [x] Demo UI layout/flow cleanup (session 8, branch `demo-ui-polish`, based on `ui-demo-catalog`). **[USER]** review the Vercel preview; merge order would be PR #1 then this branch.
- [x] `ui-demo-catalog` (PR #1) and `demo-ui-polish` (PR #2) merged; production `opentabglobal` deployed from main `ca9dece` (session 8). `INVITES_ENABLED` unset on Vercel.
- [ ] Two-mode release (session 9, branch `release/two-mode`): Demo Mode | Product Mode switch, Alex's Product UI as a read-only showcase of live Family #7 data. Tested locally (see BUILD_LOG); merge + production deploy authorized by the user. Record the production verification in BUILD_LOG.
- [ ] Confirm the new short production domain in the Vercel dashboard (the CLI account has no access to team `open-tab1`).
- [ ] Later (not in this release): fuller Product Mode backend integration is preserved on `feat/product-backend-integration` (`494b802`, tests incomplete).
- [ ] Before the demo: open the deployed site online on the demo phone once (updates the cached app so it signs item lists); re-pair the phone to Family #7 via manual pairing.
- [ ] Invitations for production: database-backed store, real funder accounts, contact verification (see BUILD_LOG session 6).

- [x] Browser click-through of Sender -> Family -> Shop (Playwright, real Testnet, 5/5) and UI fixes (session 4).
- [x] Demo access control + CSRF/rate/input limits on all signing endpoints (session 4, 18/18 checks).
- [x] GitHub remote `GrasshopperD/opentab` added and pushed. **[USER]** Make public when ready to submit (if not already).
- [x] Vercel project `opentabglobal` (team `open-tab1`, root `apps/web`) with server-only env vars.
- [ ] Re-run `scripts/security-api.mts` and Playwright against the Vercel URL.
- [ ] **[USER]** Manual phone test (procedure in `docs/SESSION_HANDOFF.md`): camera, airplane mode, PWA install.
- [ ] **[USER]** Record 1-minute video (`submission/DEMO_SCRIPT.md`), submit one-page overview (`submission/OpenTab_Global_One_Page_Overview.pdf`) + Devpost.
- [ ] Add QR codes for the live URL / GitHub / explorer to the trifold once URLs exist; print `submission/OpenTab_Global_Trifold_48x36in.pdf`.

## Mode B (after submission)
- [x] OfflineChannel contract + 24 tests (session 5). Not deployed.
- [ ] Security review of OfflineChannel, then Testnet deploy.
- [ ] Shop offline acceptance ledger (IndexedDB, highest cumulative, single terminal) + phone ticket signing UI + JS/Rust ticket vector.

---

## Open user items

- [ ] **[USER]** Confirm the Git author name/email for public commits before the first push (a global identity is configured; it was used for the local M0 commit). If a different identity or a GitHub noreply address is wanted, say so before pushing.
- [ ] **[USER]** Provide the exact GitHub remote URL for the existing `opentab` repository (not guessed). Push only on explicit instruction.
- [ ] **[USER]** Decide whether `references/` (organizer slides, internal decision PDFs) may be published. It is currently excluded by `.gitignore`.
- [ ] **[USER]** Optional: switch from demo OTUSD to genuine Circle Testnet USDC (manual faucet step; requires redeploying FamilyVault with the USDC SAC).

## (Completed) FamilyVault to first genuine Testnet payment

Implementation order (each step: code -> tests -> BUILD_LOG entry):

1. **Testnet identities and genuine demo asset (M1).** `stellar keys generate opentab-admin|opentab-sender|opentab-merchant --network testnet --fund`; keys stay in the CLI keystore (outside repo). Add USDC trustlines for sender and merchant; fund sender from Circle's Testnet faucet. Verify the USDC SAC ID with `stellar contract id asset`. Fallback: clearly labelled non-redeemable demo token.
2. **FamilyVault contract implementation (M2).** Create root `Cargo.toml` workspace (members `contracts/family_vault`), pin `soroban-sdk = 29.0.1`, implement interface from plan section 3.
3. **Secure recipient key registration (M2/M3).** `register_key` / `revoke_key` with sender auth; key generated on device only; fingerprint display.
4. **Vault funding (M2).** `create_family`, `deposit`, `withdraw` with conservation checks.
5. **Signed merchant payments (M2/M3).** `pay` verifying the canonical v1 message (A1/A2), nonce consumption (A4), atomic debit + transfer (A5). `packages/shared` TS encoder + cross-language fixture.
6. **Replay and authorization tests (M2/M3).** Full list in plan section 7; all must pass, plus `stellar contract build` producing `family_vault.wasm`.
7. **Actual Testnet deployment (M4).** Deploy with constructor `--admin --token <USDC SAC>`; record contract ID + WASM hash in `submission/RELEASE_LINKS.md`.
8. **Verified token transfers (M4).** CLI smoke: create family, deposit, register key, sign with JS helper, merchant `pay`, confirm on explorer; repeat same invoice and record the on-chain rejection.

Then M5 (PWA screens), M6 (Vercel), M7 (submission) per the plan.

## Done

- [x] M1-M4 + app + e2e (2026-11-12, session 3; see BUILD_LOG).

- [x] M0: `wasm32v1-none` installed; archive `cargo test --locked` 17/17, `npm test` 3/3, `stellar contract build` produced a 12,403-byte WASM; docs written; local Git commit (2026-11-12, see BUILD_LOG).
- [x] Project is in `C:\Users\14168\dev\opentab-global` (not OneDrive).
