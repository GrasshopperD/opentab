# OpenTab Global

**Family support that works at the corner shop, even when the phone is offline.**

A relative abroad funds a shared family balance on Stellar. A family member back home pays at participating local shops by
scanning the shop's QR invoice and approving it on their phone, **with no mobile data**. The connected shop submits that
signed approval to a Soroban smart contract, which checks it and pays the shop in a single transaction on chain.

> **Stellar Testnet prototype.** The settlement token is **OpenTab Demo USD (`OTUSD`)**: a Testnet asset with no value,
> **not USDC**. Exchange rates are **illustrative**, not live quotes. No bank payouts exist. Unaudited. Not a financial service.

Built for the Blockchain Innovation Challenge powered by Stellar (University of Waterloo / Velocity), Problem Space 3:
Transnational Households.

## The problem

Remittances arrive, but turning them into groceries and medicine often means a trip to a cash-pickup counter, fees, and
cash that is hard to earmark. Many recipients have phones but patchy or expensive mobile data. Small shops extend informal
credit (*fiado*) and carry the risk.

## What works today (verified on Stellar Testnet)

| Capability | Status | Evidence |
|---|---|---|
| FamilyVault Soroban contract (shared balance, key registry, signed payments, replay protection) | **Deployed** | `CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW` |
| Real QR-style signed payment, merchant receives tokens | **Confirmed on chain** | tx [`0b8d72ed…bb05f`](https://stellar.expert/explorer/testnet/tx/0b8d72ed8e267ca31f2fe7179f5afbdcb7586e2c887c18a90a7d2c3b63bbb05f) |
| Same family balance spent at a second shop | **Confirmed on chain** | tx [`009cc536…80e5f3`](https://stellar.expert/explorer/testnet/tx/009cc536cc3d8c88445b4a07b5d6de0189b843544c0d3ce9a57bddf87280e5f3) |
| Replaying the same approval | **Rejected by contract** (`InvoiceUsed`) | `submission/RELEASE_LINKS.md` |
| Web app: Sender, Family, Shop screens wired to the contract | **Works locally**, real Testnet txs | `scripts/e2e-api.mts` 17/17 pass |
| Recipient signing with no network call | Implemented (pure local Ed25519); **physical airplane-mode test pending** | `apps/web/app/family/page.tsx` |
| Installable PWA + offline shell | Implemented; **not yet verified on a physical phone** | `apps/web/public/sw.js` |
| Both shop and customer offline (merchant-reserved channel) | **Planned** (design done, legacy prototype archived) | `docs/IMPLEMENTATION_PLAN.md` |
| Local bank payouts (MXN, BRL, …) | **Not available** | needs a licensed provider |

All evidence: [`submission/RELEASE_LINKS.md`](submission/RELEASE_LINKS.md).

## How a purchase works

1. **Sender** creates a family vault and deposits demo USD. They pair a family member's phone by scanning its public-key
   QR and registering that key on chain.
2. **Shop** (online) types a local price, e.g. `MXN 100.00`. The app shows the exact charge (`5.4288817 OTUSD` at an
   illustrative 18.42) and displays an invoice QR with a random 32-byte invoice ID and a 15-minute expiry.
3. **Family member** (phone may be offline) scans it, sees shop, local price, exact token charge and expiry, and approves.
   The phone signs a 340-byte canonical message with its Ed25519 key and shows an approval QR. It says
   *"Authorized. Awaiting merchant settlement"*, not "paid".
4. **Shop** scans the approval and submits it. The FamilyVault contract verifies: registered and unrevoked key, Ed25519
   signature over network + contract + token + family + merchant + terminal + invoice + amount + quote hash + expiry,
   invoice never used, not expired, enough balance. Then it transfers the tokens to the shop, atomically.
5. Only after the transaction is confirmed does the shop see **Payment confirmed**, with an explorer link. Timeouts show
   `PENDING/UNKNOWN` and are reconciled by transaction hash, never resubmitted as a new charge.

## Why Stellar

- **Soroban** enforces the rules on chain: replay protection, per-family balances, key revocation, merchant binding.
- **Stellar Asset Contracts** let a classic asset (today the demo token, later USDC) be held and moved by the contract.
- Low, predictable fees and ~5 s finality make per-purchase settlement practical.
- Native Ed25519 verification in Soroban means the recipient's key **needs no Stellar account and no XLM**.
- An ecosystem of regulated anchors and on/off-ramps is the path to real payouts (future, not claimed here).

## Repository

```text
contracts/family_vault/      Soroban contract (Rust, soroban-sdk 29.0.1) + 34 tests
packages/shared/             Canonical message encoder, signing, QR payloads, integer FX math (13 tests)
packages/shared/vectors/     JS-generated test vector, also verified by the Rust tests
apps/web/                    Next.js 15 PWA: / /sender /family /shop + API routes
scripts/                     Testnet helpers and the real end-to-end test
archive/legacy_opentab_starter/  Original single-shop offline prototype (reference only, unmodified)
docs/                        Plan, architecture, build log, session handoff
submission/                  Overview, pitch, demo script, trifold, Devpost draft, evidence
```

## Run locally (Windows, macOS, Linux)

Requirements: Node.js 22+, npm. For contracts: Rust 1.99+, `rustup target add wasm32v1-none`, Stellar CLI 30+.

```powershell
git clone <repo-url> opentab-global
cd opentab-global
npm install
copy .env.example apps\web\.env.local     # macOS/Linux: cp .env.example apps/web/.env.local
# Fill SENDER_SECRET, MERCHANT_A_SECRET, MERCHANT_B_SECRET with YOUR OWN Testnet identities
# (stellar keys generate ... --fund, then add OTUSD trustlines; see docs/SESSION_HANDOFF.md).
npm run dev                                # http://localhost:3000
```

Tests:

```powershell
cargo test --locked          # 34 contract tests
stellar contract build       # target/wasm32v1-none/release/family_vault.wasm
npm test                     # 13 TypeScript protocol tests
npm run build                # production Next.js build
# With the app running: real Testnet end-to-end (spends demo tokens)
node --experimental-strip-types scripts/e2e-api.mts http://localhost:3000
```

Without the server-side secrets the app clearly reports `NOT_CONFIGURED` instead of showing invented balances.

## Security model and limitations (honest)

- **Testnet only.** Demo token has no value. Never reuse these keys or this code with real funds.
- The **recipient private key is generated in the browser and stored in `localStorage`**. It never leaves the phone,
  but browser storage is not production custody; there is no recovery. Production needs non-extractable keys / passkeys.
- **Sender and shop are demo Testnet identities operated by the server** (secrets in server-only env vars, never in the
  client bundle; checked by scanning the build). Anyone using the public demo acts as these demo identities.
- Contract-level guarantees are enforced on chain; the server pre-checks only for better error messages.
- Merchant address and amount are public on chain. No item lists are stored.
- Payment history in the UI comes from recent RPC events (limited retention window).
- No rate limiting or abuse controls on the demo API. Unaudited contract.

## Roadmap

1. Physical two-phone airplane-mode test; non-extractable keys; wallet-based sender and merchant signing.
2. **Mode B: both offline.** Funds reserved on chain for one named shop; cumulative signed tickets; acceptance cutoff,
   settlement grace and safe refunds (design in `docs/IMPLEMENTATION_PLAN.md`, amendments A8-A10).
3. Real Testnet USDC, then licensed payout partners where available (BVNK, Conduit, MoneyGram are candidates, not partners).
4. Spending categories enforced on chain, audits, pilots.

## Disclosure

Built with substantial AI assistance (Claude Code). All on-chain evidence listed above was produced by actually running
the commands and is independently checkable on the Testnet explorer.
