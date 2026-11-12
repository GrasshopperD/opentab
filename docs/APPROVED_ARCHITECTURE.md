# OpenTab Global | Approved Architecture (summary)

**Approved:** 2026-11-12. Detailed design, ten amendments, milestones and tests: `docs/IMPLEMENTATION_PLAN.md`.
**Implementation status:** NOTHING BELOW IS DEPLOYED YET. See `submission/RELEASE_LINKS.md` for verified evidence only.

## Components

```text
 Sender (online)            Recipient phone (OFFLINE ok)        Merchant terminal (ONLINE)
 /sender  PWA               /recipient  PWA                     /merchant  PWA
   | create family            | generate Ed25519 key (device)     | create invoice (nonce, amount, expiry)
   | deposit USDC             | show pubkey + fingerprint         | show invoice QR  -------------------+
   | register recipient key   | scan invoice QR  <----------------+                                     |
   v                          | sign canonical message (A1/A2)    |                                     |
 +--------------------------+ | show response QR  --------------->| scan response                       |
 | FamilyVault (Soroban)    | |                                   | POST /api/merchant/pay (server-only |
 |  shared family balance   |<------------------------------------+  Testnet submitter key, A7)         |
 |  keys, used nonces       |   pay(): verify sig, consume nonce, debit, transfer token -> merchant     |
 +--------------------------+   merchant shows CONFIRMED only after on-chain success (A6)              |
        |  allocate_offline (P1)                                                                       |
        v                                                                                              |
 +--------------------------+   Mode B (P1): both offline, one named merchant, cumulative tickets,      |
 | OfflineChannel (Soroban) |   shop keeps durable highest-accepted ledger, settles later (A8-A10)     |
 +--------------------------+                                                                          |
 Token: Circle Testnet USDC SAC (or prominently labelled demo token). Testnet only.
 Fiat payouts: DISABLED (BVNK / Conduit / MoneyGram are future, conditional).
```

## Layers

| Layer | Choice | State |
|---|---|---|
| Contracts | Rust `soroban-sdk 29.0.1`; `contracts/family_vault` (P0), `contracts/offline_channel` (P1) | not implemented |
| Signing | Ed25519 over fixed-layout canonical bytes, verified on chain with `ed25519_verify`; recipient key needs no Stellar account | design approved |
| Shared TS | `packages/shared` message encoder (browser-safe `Uint8Array`), schemas, integer amount math | not implemented |
| Frontend | Next.js App Router + TypeScript + React, installable PWA | not implemented |
| Server | Next.js route handlers on Vercel; server-only Testnet merchant submitter secret | not implemented |
| Data | On-chain state is authoritative; device IndexedDB; no DB for P0 | not implemented |
| Hosting | Vercel, root directory `apps/web` | not created |
| Network | Stellar Testnet, RPC `https://soroban-testnet.stellar.org` (protocol 30 observed 2026-11-12) | reachable |

## Invariants

- `available = deposited - withdrawn - paid - allocated_offline >= 0`, checked atomically on chain.
- One invoice nonce -> at most one transfer, from any terminal.
- A signature is valid only for one network, vault contract, token, family, merchant, terminal, invoice, amount and expiry.
- Merchant UI never shows PAID before a confirmed on-chain result; timeouts are UNKNOWN until reconciled.
- Revocation affects future payments only. Mode B refunds never preempt the settlement grace window.
