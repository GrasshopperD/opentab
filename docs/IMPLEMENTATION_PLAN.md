# OpenTab Global | Implementation Plan

**Status:** APPROVED for implementation (user authorization, 2026-11-12, "Milestone 0 Implementation Authorization").
**Network:** Stellar **Testnet only**. Test assets only. Nothing is redeemable for money.
**Hard deadline:** Devpost + one-page overview, **Fri 13 Nov 2026, 08:30 EST**.

This file records decisions that were already approved in `docs/CLAUDE_PLANNING_HANDOFF.md`, `docs/DECISIONS.md` and the
user's Milestone 0 authorization. It is not a new proposal. Where the handoff left an engineering choice open, the choice
made here is marked **[ENGINEERING DEFAULT]**; changing one does not require re-planning the rest.

---

## 1. Locked decisions (do not redesign)

1. **FamilyVault is the first contract** (Mode A, connected merchant).
2. **OfflineChannel is the second contract** (Mode B, both offline), adapted from `archive/legacy_opentab_starter`.
3. **One shared household balance** in FamilyVault supports multiple connected merchants. The contract's on-chain balance check, not terminal or merchant IDs, is what prevents overspending.
4. **Recipients approve purchases offline** by Ed25519-signing a canonical message on their phone. The phone needs no connectivity.
5. **Connected merchants submit** the signed authorization to Soroban and show PAID only after the transaction is confirmed on chain.
6. **Fully offline merchants require merchant-specific reserved funds** (one OfflineChannel per family-merchant pair). Category labels are budgeting UI, not security partitions.
7. Frontend: **Next.js (App Router) + TypeScript + React**, one codebase, role-based screens.
8. The app is an **installable mobile PWA** hosted on Vercel.
9. **Initial settlement on Stellar Testnet.**
10. **Real fiat payouts disabled** until an approved provider is operational. BVNK / Conduit / MoneyGram are future, conditional adapters; every payout country shows `planned` / `not available`.

Also locked: live FX quotes only in Mode A; Mode B uses fixed pre-agreed units; never retroactively change an approved amount;
fiat-equivalent display != token balance != fiat redemption; never relabel native XLM as dollars.

---

## 2. Ten required architectural amendments

> **Source note:** the handoff does not contain one list literally titled "ten amendments". The ten below consolidate the
> mandatory corrections stated across handoff sections 3-10 and include every amendment named in the Milestone 0
> authorization (network-specific signature domains, device pairing, storage TTL, replay protection, payment
> reconciliation, secure key handling, offline channel expiry protections). If the user's ChatGPT-side list differs,
> update this section; the build order does not change.

| # | Amendment | Applies to | Where enforced | Required test(s) |
|---|---|---|---|---|
| A1 | **Network- and contract-specific signature domain.** Every signed message starts with a versioned domain tag and binds `network_id` (SHA-256 of the network passphrase, read on chain via `env.ledger().network_id()`), the contract address, and the token contract address. A Testnet signature can never verify on Mainnet or on another deployment. | FamilyVault, OfflineChannel | Contract rebuilds the message from its own state + arguments; it never trusts a client-supplied message blob. | wrong network id, wrong contract, wrong asset -> rejected |
| A2 | **Full invoice binding.** The Mode A message binds family id, merchant address, terminal id, invoice nonce, exact amount in base units (i128, 7 decimals), and invoice expiry. Changing any field invalidates the signature. | FamilyVault | Contract | per-field tamper test; cross-merchant reuse; amount inflation; JS/Rust fixture tamper |
| A3 | **Device pairing / key registration.** The recipient signing key is generated on the recipient device; only the 32-byte public key leaves it. The sender registers that public key on chain (`register_key`, sender auth). Pairing is confirmed by showing a short fingerprint of the public key on both devices. Login identity (email/demo login) is never spending authority. | FamilyVault, PWA | Contract (key must be registered and active); PWA (private key never serialized into QR, network or logs) | unregistered key rejected; revoked key rejected; fingerprint matches |
| A4 | **Replay protection.** Each invoice nonce is consumed atomically on chain in persistent storage keyed by `(family_id, invoice_id)` in the same transaction that moves money. Invoices must have `expires_at <= now + MAX_INVOICE_WINDOW` (default 1 h) and the nonce record's TTL is extended past that window. If a nonce entry is ever archived, a replay fails (archived entries must be restored before access), it never succeeds. Duplicate submissions from any terminal produce zero additional transfers. | FamilyVault | Contract | same signature twice; same invoice from second terminal; expired invoice; too-far-future expiry |
| A5 | **Atomic shared-balance accounting.** `available = deposited - withdrawn - paid - allocated_offline`; every payment checks and debits `available` in the same invocation as the token transfer. Concurrent payments are serialized by the ledger; the one that would overdraw fails. | FamilyVault | Contract | two payments whose sum exceeds balance: exactly one succeeds; conservation test |
| A6 | **Payment reconciliation.** Merchant UI states: `AWAITING_SIGNATURE -> SUBMITTING -> PENDING/UNKNOWN -> CONFIRMED` or `FAILED(reason)`. RPC timeout is `UNKNOWN`, never `PAID` or `FAILED`; resolve by polling `getTransaction(hash)` and by reading `is_invoice_used`. Re-submission of an invoice whose nonce is already consumed is impossible on chain, so retry is safe. Off-chain records may cache but never declare `CONFIRMED` without an observed successful on-chain result. | PWA, API routes | Client/server logic + contract idempotency | RPC timeout simulation; reload during pending; duplicate submit |
| A7 | **Secure key handling.** No secret in client bundles or `NEXT_PUBLIC_*`. Merchant Testnet submitter secret lives only in a server-side Vercel env var (or the CLI keystore for scripts). Recipient key in IndexedDB on the device (Testnet demo shortcut, disclosed); non-extractable WebCrypto Ed25519 where supported is a P1 hardening. No seeds in Git, logs, QR codes or analytics. CI/grep check for `S[A-Z2-7]{55}` secret patterns before every commit. | All | `.gitignore`, env separation, pre-commit review | secret-pattern scan; bundle scan of `.next/` for secrets |
| A8 | **Offline channel expiry protections.** Replace the legacy single `expires_at` with three times: `accept_until` (shop stops accepting tickets), `settle_until` (shop may still settle tickets signed before acceptance ended), `refund_after >= settle_until` (sender may reclaim the remainder). Refund can never preempt the settlement grace window. Phone clocks are untrusted, so the grace window is a policy bound, not proof of signing time; this residual risk is disclosed. | OfflineChannel | Contract | settle after `accept_until` but before `settle_until` succeeds; refund before `refund_after` fails; refund after settles remainder only |
| A9 | **Key rotation / revocation without stealing earned claims.** FamilyVault: revoking a key blocks future payments only; completed transfers are final. OfflineChannel: rotation records the old key as `retiring` until `settle_until`; tickets signed by the old key up to the last cumulative remain settleable; new tickets require the new key. | Both | Contract | revoke then pay fails; completed payment unaffected; old-key ticket settles in grace; old-key ticket after grace fails |
| A10 | **Merchant-specific offline reservation + single-writer acceptance ledger.** Mode B funds are moved atomically from the vault (or deposited directly) into a channel bound to one merchant address and one recipient key. One registered checkout device per channel (MVP). The shop persists the highest accepted cumulative + order IDs in IndexedDB before releasing goods and shows `ACCEPTED OFFLINE - PENDING SETTLEMENT`, never `PAID`. No live FX in Mode B. | OfflineChannel, PWA | Contract cap + local durable ledger | decreasing/equal cumulative rejected; app restart keeps highest; over-cap rejected; airplane-mode two-phone test |

---

## 3. FamilyVault contract design (Mode A) [ENGINEERING DEFAULT]

**Location:** `contracts/family_vault/` (new crate in a new root Cargo workspace; the archive keeps its own workspace).
**SDK:** `soroban-sdk = 29.0.1` (same as the archive, verified to build to `wasm32v1-none` with Stellar CLI 30.0.1). Do not upgrade under deadline.

**Authorization model:** direct Ed25519 verification (`env.crypto().ed25519_verify`) of the canonical message, the same
pattern the archive already proved cross-language. Recipient keys need no Stellar account or XLM. The merchant account
calls `pay` and must `require_auth()`; it pays the network fee. Smart accounts / passkeys / MPP SDK are not used for P0.

**Storage**
- Instance: `Config { admin, token }`, `NextFamilyId`.
- Persistent: `Family(id) -> { sender, balance, paid_total, allocated_offline }`, `Key(id, pubkey) -> Active|Revoked`,
  `Used(id, invoice_id) -> ()`.
- Every write extends TTL (A4/A5); a `bump(family_id)` view-free maintenance function is available to anyone.

**Interface (P0)**

| Function | Auth | Effect |
|---|---|---|
| `__constructor(admin, token)` | deployer | fixes the single token contract (Circle Testnet USDC SAC or labelled demo token) |
| `create_family(sender) -> u64` | sender | new family id |
| `deposit(family_id, from, amount)` | from | token transfer in, `balance += amount` |
| `register_key(family_id, pubkey)` | sender | key Active |
| `revoke_key(family_id, pubkey)` | sender | key Revoked (future payments only) |
| `pay(family_id, merchant, terminal_id, invoice_id, amount, expires_at, pubkey, signature)` | merchant | checks A1-A5, marks nonce used, `balance -= amount`, transfers token to merchant, emits event |
| `withdraw(family_id, amount)` | sender | returns available funds to sender |
| `payment_message(...) -> Bytes` | none | exact bytes to sign (for cross-language fixtures) |
| `get_family`, `is_key_active`, `is_invoice_used`, `config` | none | reads |

**Canonical message v1 (fixed-length, big-endian)** - final byte layout is fixed in code and locked by fixtures:

```
"OTFV1\0\0\0"          8   domain tag + version
network_id            32   sha256(network passphrase)
vault contract        56   strkey ASCII (C...)
token contract        56   strkey ASCII (C...)
family_id              8   u64
merchant              56   strkey ASCII (G... or C...)
terminal_id            4   u32
invoice_id            32   random 32-byte nonce chosen by merchant
amount                16   i128 base units (7 decimals)
expires_at             8   u64 unix seconds (ledger time)
```

**Errors:** distinct codes for NotFound, KeyNotActive, BadSignature, InvoiceUsed, InvoiceExpired, InvoiceWindowTooLong,
Insufficient, NonPositiveAmount, Unauthorized.

**Events:** `deposit`, `key_registered`, `key_revoked`, `paid(family_id, merchant, invoice_id, amount)`, `withdrawn`.

**Privacy disclosure:** merchant address and amount are public on chain. No item lists on chain.

Category caps (P1) are enforced on chain if displayed as hard limits; otherwise labelled "budget label only".

---

## 4. OfflineChannel contract design (Mode B, P1)

Adapted from the archived `open_tab` contract (copy into `contracts/offline_channel/`, never edit the archive):
keep cumulative-ticket settlement, pay-the-difference, signature check; change: A1 domain (add network id + token, new tag
`OTOC1`), A8 three deadlines, A9 retiring key, funding via `FamilyVault.allocate_offline` (atomic move) or direct deposit,
remove the legacy behaviour that rejects settlement the moment expiry passes. Ticket binds channel id, merchant, cumulative,
and order id of the newest purchase.

---

## 5. Application design

- `apps/web`: Next.js App Router, TypeScript, React, PWA manifest + service worker (verified offline only after real airplane-mode tests).
- Roles: `/sender` (create family, deposit, register recipient key by pasted/scanned public key, balances, revoke),
  `/recipient` (generate key, show fingerprint, scan invoice QR, confirm local price + exact USDC, sign, show response QR - all offline),
  `/merchant` (create invoice with random nonce + 1 h expiry, show QR, scan response, submit, reconcile to CONFIRMED with explorer link).
- QR fallback: copy/paste text payload if camera fails (labelled as fallback).
- `packages/shared`: canonical message encoder (browser-safe, `Uint8Array` only, no Node `Buffer`), payload schemas, amount math in integer base units.
- `packages/stellar` (or `apps/web/lib/stellar`): RPC client, invocation builders, tx polling.
- Server: Next.js route `POST /api/merchant/pay` builds, simulates, signs (server-only `MERCHANT_SECRET`, Testnet) and submits; `GET /api/tx/[hash]` status. Browser may also read RPC directly.
- Database: **none for P0** [ENGINEERING DEFAULT]; truth is on chain, device state in IndexedDB. Supabase only if P1 needs shared invoices.
- FX (P1, Mode A only): source-attributed quote with TTL; if no real API, show "DEMO RATE - not a live quote". Expired quote requires a new signature.

---

## 6. Milestone sequence

Time estimates assume one developer + Claude Code; deadline is ~24 h away, so **P0 = M1-M7 only**. Scope-cut rule from the
handoff applies: if M4 is not on chain by 18:00 EST Nov 12, cut everything except the minimal Mode A flow.

| M | Name | Deliverables | Tests / evidence required | Acceptance criteria |
|---|---|---|---|---|
| **M0** | Environment & repo (this checkpoint) | WASM target, archive tests + WASM build, docs, `.gitignore`, local Git commit | `cargo test --locked`, `stellar contract build`, `npm test` outputs in BUILD_LOG | all pass; WASM file exists; no secrets staged; nothing pushed |
| **M1** | Testnet identities + genuine demo asset | CLI identities `opentab-admin`, `opentab-sender`, `opentab-merchant` (keys in CLI keystore outside repo), USDC trustlines, Circle faucet USDC for sender; else labelled demo token | `stellar keys ls`; Horizon balance shows USDC for sender | sender holds Testnet USDC (or labelled token); asset SAC ID verified via `stellar contract id asset` and recorded |
| **M2** | FamilyVault contract + unit tests | `Cargo.toml` (root workspace), `contracts/family_vault/src/{lib.rs,test.rs}` | test list in section 7 | all tests pass; `stellar contract build` produces `family_vault.wasm` |
| **M3** | Cross-language message + recipient key registration | `packages/shared/src/paymentMessage.ts` + tests; fixture consumed by a Rust test | JS-signed fixture verified by contract test; tamper tests | identical bytes JS/Rust; register/revoke tests pass |
| **M4** | Testnet deploy + CLI funding + CLI payment | `scripts/deploy-testnet.sh`, `scripts/smoke-pay.sh` | real tx hashes | contract ID on stellar.expert; deposit tx, pay tx confirmed; replay tx fails on chain with InvoiceUsed |
| **M5** | PWA: sender / recipient / merchant | `apps/web` screens, API routes | manual run on desktop + two phones; customer in airplane mode | one QR-authorized payment confirmed on chain from the app; merchant never shows PAID before confirmation |
| **M6** | Vercel deploy | Vercel project, root `apps/web`, server-only env vars | open URL in private window + phones; bundle secret scan | public HTTPS URL works; no secret in client bundle |
| **M7** | Submission | README, one-minute video (real footage), one-page overview, Devpost, RELEASE_LINKS filled | links open logged out | submitted before 08:30 EST Nov 13 with confirmation saved |
| M8 | P1: OfflineChannel | `contracts/offline_channel`, shop offline ledger | section 7 Mode B tests; two-phone airplane test | settlement after reconnect; refund cannot preempt grace |
| M9 | P1: FX quote, category caps, UX polish, non-extractable keys | | | labelled honestly |
| P2 | post-hackathon | payouts via approved provider, audit, recovery, native apps | | |

---

## 7. Required tests

**FamilyVault unit tests (M2/M3)** - each must exist and pass before deploy:
`deposit_increases_balance`, `pay_with_valid_signature_transfers_exact_amount`, `replay_same_invoice_fails`,
`same_invoice_second_terminal_fails`, `signature_for_other_merchant_fails`, `tampered_amount_fails`,
`tampered_terminal_fails`, `wrong_network_id_fails` (message built with other network id), `wrong_contract_fails`,
`wrong_token_fails`, `expired_invoice_fails`, `invoice_window_too_long_fails`, `unregistered_key_fails`,
`revoked_key_fails`, `revocation_does_not_reverse_completed_payment`, `overspend_fails`,
`two_payments_exceeding_balance_only_one_succeeds`, `merchant_auth_required`, `only_sender_registers_and_withdraws`,
`withdraw_cannot_exceed_available`, `money_is_conserved`, `nonpositive_amount_rejected`,
`browser_and_contract_agree_on_payment_message`.

**On-chain evidence (M4):** deposit hash, payment hash, failed replay hash (or simulation error with InvoiceUsed), all on Testnet explorer.

**App tests (M5/M6):** recipient signs in airplane mode; reload during PENDING reconciles; double-tap submit gives one transfer;
stale-balance signature declined on chain and shown as FAILED(Insufficient); camera fallback works.

**Mode B (M8):** handoff section 10 OfflineChannel list, plus local data loss, app restart, phone-clock manipulation, late refund.

---

## 8. Commands (reference)

```bash
# build / test (from repo root once the root workspace exists)
cargo test --locked
stellar contract build

# M1 (requires explicit go-ahead in that milestone; Testnet only)
stellar keys generate opentab-admin --network testnet --fund
stellar contract id asset --asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 --network testnet

# M4
stellar contract deploy --wasm target/wasm32v1-none/release/family_vault.wasm \
  --source opentab-admin --network testnet -- --admin opentab-admin --token <USDC_SAC_ID>
```

## 9. Evidence rules

Always distinguish: (1) native Rust/JS unit test passed, (2) WASM compiled, (3) deployed contract ID exists,
(4) transaction confirmed on Testnet with hash. Only (4) proves a payment. Non-working features stay labelled incomplete.
