# Build log | OpenTab Global

A dated, factual record of what was actually run and what happened. Newest entry first.
Only record results that were genuinely observed. Never record a planned step as done.

---

## 2026-11-12: Session 4, browser testing, security hardening, release prep

- **Security (new):** `apps/web/lib/guard.server.ts`. Server-only `DEMO_ACCESS_CODE` -> `/api/auth/login` -> HMAC-signed HttpOnly SameSite=Strict cookie (8 h). All 4 signing routes (`sender/family`, `sender/deposit`, `sender/key`, `merchant/pay`) require session + same Origin + JSON + body <= 4 KB + per-route per-IP rate limit. Fails closed if access env is missing. Public GET routes rate limited (120/min/IP). Protocol parse errors now 400 (were 500).
- **Reliability:** shop submit has a synchronous lock (double-click), client-side + server-side expiry pre-check, server in-flight lock per invoice, network errors -> `UNKNOWN` (never FAILED/PAID), reconciliation by tx hash then by on-chain `is_invoice_used` (new public `/api/invoice`), safe retry of the SAME approval only. Status machine: `UNKNOWN -> AUTHORIZED_LOCALLY` allowed (tested).
- **Bug found by browser review:** payment history empty. Cause: Testnet RPC `getEvents` scans a bounded ledger range per call and returned 0 events + cursor for a 17,000-ledger window. Fixed by following the cursor (max 5 pages). Verified by Playwright assertion (merchant history + sender purchase list show the new tx).
- **UI fixes:** kv values broke mid-word on mobile; doubled card spacing on landing page. QR component now has a visible "Show code as text" fallback (clipboard can fail on HTTP).
- **Dependencies:** `npm audit fix` resolved `sharp` (high). Remaining: `postcss` via `next` (moderate/high); fix requires Next 16 (major); it processes only our own CSS at build time; deferred and documented.
- **Results (all against `next start`, real Testnet):** `cargo test --locked` 34/34 · `npm test` 13/13 · `tsc --noEmit` clean · `next build` OK · `scripts/e2e-api.mts` 18/18 · `scripts/security-api.mts` 18/18 · Playwright 5/5 (full journey with phone context offline while signing, zero `/api` requests during signing, offline reload keeps key, double-click charges once, replay rejected, malformed codes, access gate, 390/430 px no overflow). Secrets and access code not found in `.next/static` or rendered HTML.
- Stale `next start` processes from earlier sessions were holding port 3000; stopped (they were this project's own servers).
- NOT done: physical phones, camera scanning, PWA install prompt, GitHub push, Vercel deploy, video, Devpost.

---

## 2026-11-12: Session 3, implementation sprint (Testnet)

- Testnet identities created + Friendbot-funded: opentab-admin/sender/merchant/merchant2/issuer (keys in CLI keystore outside repo).
- Circle Testnet USDC not used (manual web faucet). Issued labelled demo asset **OTUSD** ("OpenTab Demo USD", no value); trustlines for sender + 2 merchants; 1,000 OTUSD to sender (balance read back `10000000000`); SAC `CC6JPD3N…PL73` deployed.
- FamilyVault implemented (`contracts/family_vault`): `cargo test --locked` **34 passed**; `stellar contract build` -> 14,548 B WASM, hash `e3aac2d9…11190`.
- Deployed `CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW`. CLI flow: family 1, deposit 100, key registered, **payment tx `0b8d72ed…bb05f` confirmed** (merchant 0 -> 54288817; family 1000000000 -> 945711183). Replay -> `Error(Contract, #4)`. Wrong merchant -> `Error(Crypto, InvalidInput)`. Merchant B payment `009cc536…80e5f3`.
- `packages/shared` TS protocol: **13 vitest tests pass**; shared JS/Rust vector verified both sides. One test had a wrong byte offset (280 vs 284); test fixed, code unchanged.
- `apps/web` Next.js 15.5.29 (15.5.4 flagged with a CVE by npm; upgraded): `tsc` clean, `next build` OK, client bundle scanned: no secrets.
- `scripts/e2e-api.mts` against `next start`: **17/17 PASS** (family 2 created/funded, key registered, pay A `2c66e75f…eb4e`, replay rejected, cross-merchant rejected, pay B `29d15fc4…ac51`, overspend rejected, tamper rejected, exact balance).
- `npm run dev` from repo root: `/`, `/sender`, `/family`, `/shop`, APIs return 200 with live chain data.
- NOT done: browser click-through, physical phones, ESLint, GitHub push, Vercel, video, Devpost, Mode B.

---

## 2026-11-12: Session 2, Milestone 0 (environment, docs, local Git)

**Scope:** local only. No GitHub push, no Vercel, no Stellar identities, no deployments, no transactions.

### Environment (observed)

- Working directory: `C:\Users\14168\dev\opentab-global` (not inside OneDrive; issue 2 from session 1 is resolved).
- `rustup target add wasm32v1-none`: installed (downloaded rust-std). `rustup target list --installed`: `wasm32v1-none`, `x86_64-pc-windows-msvc`.
- rustc/cargo 1.99.1, Stellar CLI 30.0.1 (unchanged).

### Tests and build, run in place in `archive/legacy_opentab_starter`

| Command | Result |
| --- | --- |
| `cargo test --locked` | **17 passed, 0 failed** (1m13s build) |
| `stellar contract build` | **Success.** `target/wasm32v1-none/release/open_tab.wasm`, 12,403 bytes optimized (15,357 original), WASM hash `4985bad7c61a11bdb9a32941a74e5cc18b52e7cd4ef5938b125381eb0aa90f89`, 10 exported functions |
| `stellar contract info interface --wasm ...` | Contract spec readable (open, close, config, extend, settle, top_up, get_tab, rotate_key, ticket_message, __constructor); meta shows soroban-sdk 29.0.1 |
| `web/`: `npm ci && npm test` | **3 passed, 0 failed**; `package-lock.json` byte-identical afterwards |

- Evidence level reached: (1) unit tests and (2) compiled WASM only. **Nothing deployed; no on-chain transaction.** This WASM is the legacy single-shop channel, not FamilyVault.
- Archive integrity: SHA-256 of `Cargo.toml`, `Cargo.lock`, `contracts/open_tab/Cargo.toml`, `src/lib.rs`, `src/test.rs` identical before and after. **No compatibility fixes were needed; archive source unmodified.**
- Side effect: `cargo test` wrote `contracts/open_tab/test_snapshots/` (17 JSON files, soroban-sdk default). Deleted (generated by this run) and added `**/test_snapshots/` to `.gitignore`. Build outputs `target/` and `web/node_modules/` remain locally and are ignored.

### Documentation and repo

- Created `docs/IMPLEMENTATION_PLAN.md`, `docs/APPROVED_ARCHITECTURE.md`.
- Updated `CLAUDE.md` (plan-only gate replaced by implementation rules; security rules kept and extended), `docs/NEXT_STEPS.md`, `submission/RELEASE_LINKS.md`, `.gitignore`, `README.md`, superseded-status banners on `docs/CLAUDE_PLANNING_HANDOFF.md` and `docs/CLAUDE_START_HERE.md`, pointer in `docs/DECISIONS.md`.
- Redacted the personal Git email previously written in this log.
- `references/` excluded from Git pending user decision (organizer slides and internal decision PDFs).
- `git init` + first local commit. Not pushed; no remote configured.

---

## 2026-11-12: Session 1, environment verification (no app code written)

**Scope:** local checks and tests only. No GitHub push, no Vercel deploy, no Stellar accounts created, no transactions, no money.

### Tool versions (observed)

| Tool | Version | Status |
| --- | --- | --- |
| Git | 2.54.0.windows.1 | OK |
| Node.js | v22.19.0 | OK |
| npm | 10.9.3 | OK |
| rustup | 1.29.3 | OK |
| rustc / cargo | 1.99.1 (stable, x86_64-pc-windows-msvc) | OK |
| Stellar CLI | 30.0.1 (stellar-xdr 30.0.0) | OK |
| Rust target `wasm32v1-none` | **not installed** | MISSING (blocks WASM build) |
| Visual Studio 2022 Community (C++ tools) + Windows SDK 10.0.26100 | present | OK (Rust MSVC linker) |
| GitHub CLI `gh` | not installed | optional |
| Vercel CLI | not installed | optional (web import works without it) |
| Windows long paths | enabled | OK |

### Tests (run on a copy of `archive/legacy_opentab_starter` in a temp folder, so the archive was not modified)

| Command | Result |
| --- | --- |
| `cargo test --locked` | **17 passed, 0 failed** (soroban-sdk 29.0.1, first build 1m37s) |
| `stellar contract build` | **FAILED**: `can't find crate for core ... wasm32v1-none target may not be installed` |
| `npm ci` then `npm test` (web/) | **3 passed, 0 failed** (@stellar/stellar-sdk 17.4.0 from lockfile) |
| Cross-language check | JS signature `b181ddcf...0004` and public key `ea4a6c63...d22c` exactly match the values hard-coded in Rust test `browser_and_contract_agree_on_a_ticket` |

### Network checks (read-only, no accounts)

- Testnet RPC `https://soroban-testnet.stellar.org`: reachable, passphrase `Test SDF Network ; September 2015`, **protocol 30**, latest ledger 5,692,439.
- Friendbot `https://friendbot.stellar.org`: reachable.
- Circle Testnet USDC found on Horizon Testnet: code `USDC`, issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, home domain `centre.io`, Stellar Asset Contract ID `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`, `auth_revocable: true` (issuer can freeze trustlines).
- `stellar keys ls`: no identities exist on this machine.

### Issues found

1. `wasm32v1-none` target missing, so no contract can be compiled for deployment yet.
2. The project lives inside OneDrive. Build folders (`target/`, `node_modules/`, `.next/`) synced by OneDrive cause slow builds and "file in use" errors.
3. The project folder is not yet a Git repository.
4. A global Git identity is configured (name/email redacted from this log); confirm this is the identity the user wants on public commits.
5. `archive/.../web/package.json` declares `@stellar/stellar-sdk: "latest"` (unpinned); only the lockfile pins 17.4.0.
6. `ticket.mjs` uses Node's `Buffer`, which is not available in browsers without a polyfill.
7. Disk C: is 92% full (42 GB free). Enough for now; watch it.
