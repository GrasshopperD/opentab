# Next steps | OpenTab Global

The current to-do list between Claude Code sessions. Update at the end of every session.
Items marked **[USER]** need the user to do or approve something.

**Hard deadline:** Devpost + one-page overview, Fri 13 Nov 2026, 08:30 EST.
**Current milestone:** M5-M7 (UI verification on devices, Vercel, submission). M1-M4 DONE. See `docs/SESSION_HANDOFF.md`.

## Before 08:30 EST Nov 13 (priority order)

- [ ] Browser click-through of Sender -> Family -> Shop; fix UI bugs.
- [ ] **[USER]** Add GitHub remote for `opentab` (`git remote add origin <url>`), push, make public when ready.
- [ ] **[USER]** Vercel import (root `apps/web`), set env vars (server-only secrets!), confirm HTTPS URL.
- [ ] Phone test over HTTPS: camera scan, airplane-mode signing, PWA install.
- [ ] **[USER]** Record 1-minute video (`submission/DEMO_SCRIPT.md`), submit one-page overview + Devpost.

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
