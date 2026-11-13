# Build log | OpenTab Global

A dated, factual record of what was actually run and what happened. Newest entry first.
Only record results that were genuinely observed. Never record a planned step as done.

---

## 2026-11-12: Session 7, deployment-safety fixes for preset + catalog (local only, uncommitted, branch `ui-demo-catalog`)

- **Invitation gating:** off by default. `invitesAvailable()` requires `INVITES_ENABLED=1` and refuses on Vercel/serverless (`VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `AWS_LAMBDA_FUNCTION_NAME`) even when it is set. UI flag `OT_INVITES_UI` is computed at build time in `next.config.ts` with the same rule. When off: no invitation card on `/sender` (manual card becomes "2 · Pair a family member's phone"), `/family` says "enter your family number", `/join` shows "not available" and strips any `#t=` fragment without storing it. Invitation code kept for local use.
- **Merchant approval check:** new `authorizationMismatch(shown, auth)` in `@opentab/shared` compares every signed field (network, vault, token, merchant, terminal, invoice id, amount, expiry, quote hash incl. items). `/shop` rejects mismatches, and gives an "app is out of date; open OpenTab online once" message when the only difference is a missing item list. This closes the gap found in the audit: a phone with a pre-catalog app version signs an itemized invoice WITHOUT the items (old parser ignores `li`) and the shop previously accepted it. Non-itemized approvals unchanged. No contract or protocol-format change.
- **Tests (observed):** shared 20/20 (4 new incl. the outdated-app regression); invite state machine 23/23; Rust 58/58 (34 + 24); `tsc` OK; `next build` OK (default, `INVITES_ENABLED=1`, and `VERCEL=1 INVITES_ENABLED=1`); security API 18/18 on a fresh server (repeat runs within 10 min return 429 from the rate limiter, by design); Playwright no-spend 14/14 (new `deploy-safety.spec` 2, offline Chromium+WebKit 4, malformed codes, access gate, 6 layouts).
- **Real Testnet:** `demo-catalog.spec` passed, Milk tx `62e128065bf29b47227fa8ec0f2eabc4ee2d7be9082a1c50d98703b10adebf74` (CONFIRMED; Family #7 95.00 -> 92.00 OTUSD). Full `checkout.spec` journey passed on the second run, payment tx `ec8aed7873073aebcf328dec9b21830e60b617dbe244af9ddc45e2cdb662bc58` (CONFIRMED). First run failed at a test selector (`getByText("1.0857764 OTUSD")` matched 6 elements because the shop's recent-payments list holds earlier identical amounts) after it had created/funded a family and registered a key; selector made exact. With `INVITES_ENABLED=1`: invite HTTP checks ALL PASSED, `invite.spec` passed (register_key `5bef33bbc9f9c7daa3a949d586cfd77cf05008d6518918b6e32f6adf31808a11`, then revoked).
- **Vercel simulation:** built and started with `VERCEL=1 INVITES_ENABLED=1`: all 7 invitation endpoints 503 `InvitesUnavailable`; `/sender` renders the manual pairing card only; `/join` shows the unavailable message; gating test passed.
- **Not done:** no physical phone; no Vercel deployment; nothing committed or pushed.

## 2026-11-12: Session 6, demo family preset, product catalog, invitation pairing (local only, uncommitted, branch `ui-demo-catalog`)

- **Sender preset:** `/sender` preselects existing Family #7 (`NEXT_PUBLIC_DEMO_FAMILY_ID`, default 7), balance read live; "Create new family" moved under *Advanced*; missing family shows an error, never auto-creates.
- **Shop catalog:** Milk 3.00 / Bread 2.00 / Water 1.00 / Apples 4.00 USD (illustrative). Line items are an optional `Quote.items` bound into `quoteHash` (absent = identical OTQ1 hash, so the committed JS/Rust vector and the deployed contract are unchanged). Itemized receipt after CONFIRMED; local-only receipt log + CSV export (labelled not durable, not a tax invoice).
- **On chain (Testnet):** Milk purchase from Family #7, tx `6080ba195b90286af39bbb027fa2001629d5e377458df55fd263ce0fc2a733d5` (SUCCESS; family 83.00 -> 80.00 OTUSD); tampered item rejected locally and by server (BadSignature, no submission); replay rejected (InvoiceUsed). Two earlier runs of that test failed on my own ambiguous selectors after a key registration (XLM fees only).
- **Invitations:** `/api/invite/{create,list,decide,revoke,open,accept,status}`, `/join`, sender invite panel; manual pairing kept as labelled fallback. Session cookie now carries a random per-login id (`sid.exp.hmac`); invites are bound to that operator session (not a user identity). 256-bit token in the URL #fragment, stored only as SHA-256; 10-min link expiry; 10-min approval window; single-use 2-min challenge; Ed25519 proof of possession over a domain-separated `OTINV1|...` message; explicit approve/reject; atomic ACCEPTED->REGISTERING transition; failed registration returns to ACCEPTED (retry); unknown outcome reconciled from `is_key_active`; phone shows Connected only when the chain says the key is active. Store: file `apps/web/.data/invites.json` (gitignored, atomic rename, per-process serialization); **disabled on Vercel** (fails closed) until a database adapter exists.
- **On chain (Testnet):** invite flow register_key `bc228d7ec7d4c9055ce6f8868863479ba312fc28413580a520772816774963fb`, revoke_key `bf1bc3c2a54fdeb7b7f13124a20f22e2c937744fdbe5267391dfbe961ac008a4` (both SUCCESS; key inactive afterwards).
- **Tests:** shared 16/16; invite state machine (simulated chain) 23/23, mutation-checked (3 deliberate code breaks each caught); Rust 58/58; tsc OK; build OK; security API 18/18; invite HTTP checks 27/27 (no spend); Playwright no-spend 12/12 and offline Chromium+WebKit 16/16 (x4); real-chain `demo-catalog.spec` 1/1 and `invite.spec` 1/1. One run of the access-gate test failed because repeated logins tripped the login rate limit ("Too many attempts"); passed 12/12 after a server restart reset the in-memory limiter.
- **Test change:** `offline.spec` now ignores Next.js nav prefetch requests (`?_rsc=`, `/_next/static/`) seen intermittently on WebKit; API and all other requests still fail the test.
- **Not done:** full `checkout.spec` journey not rerun (it creates a family); no physical phone; nothing committed/pushed/deployed.

## 2026-11-12: Session 5, demo polish, print materials, Mode B contract (unsupervised sprint)

- **`/demo` judge page** (public): roles, 5-step flow diagram, offline-signing explanation, live vs. in-development modes, contract/asset IDs, verified tx links (`apps/web/lib/evidence.ts`). **Preflight** (`/api/preflight`, read-only, spends nothing): RPC health, vault config + token match, asset name, merchant balances readable, family #1 read, access enabled; operator-only (requires session): server signer accounts exist and match public merchant addresses, sender OTUSD balance. Observed: 6/6 public checks OK.
- **UI polish:** sender numbered sections + prominent family number + synchronous double-submit lock on all three actions; family page 3-step progress, "Spending allowance", participating shops, offline explainer, approval history now shows "✓ Settled on Stellar" (checked via `/api/invoice` when online); shop large success panel with amount, local price, shop, terminal, explorer link. Nav wraps on 320 px; QR sized `min(280px, 78vw)`; 48 px buttons. SW cache bumped to `opentab-v2`, `/demo` precached.
- **Browser tests (Playwright, against `next start`):** layout at 320/375/390/430/768/1440 px for `/ /demo /sender /family /shop`: no horizontal overflow (6/6). New `tests/e2e/offline.spec.ts` (no chain spend): Chromium 2/2; **WebKit (iPhone 13 emulation)** 2/2, but WebKit offline *reload* could not be tested: probe showed SW controlling the page and shell cached, yet navigation failed with "WebKit encountered an internal error" inside the emulator. Recorded as a limitation, not a pass. One intermittent WebKit failure on the first run; 3 subsequent runs passed. Full on-chain journey: 1/1, tx `f1b5d27041aa4a5f3e4afcad1e5c07b0fe257007d5106b112977cdcc2cd76ed9`. Final non-spending suite: 12/12.
- **Screenshots** `submission/screenshots/01-06*.png`: real states from that run (access form asserted absent).
- **Print materials** (HTML sources in `submission/print/`, rendered by `scripts/render-print.mjs`): `OpenTab_Global_One_Page_Overview.pdf` (verified 1 page, Letter), `OpenTab_Global_Trifold_48x36in.pdf` (standard 48x36 in tabletop board, 12|24|12 in panels; no organizer dimensions found in repo), `OpenTab_Global_Pitch_Slides.pdf` (8 slides 16:9).
- **OfflineChannel** (`contracts/offline_channel`): reserved per-merchant/terminal channels, 300-byte `OTOC1` tickets, `accept_until` / `settle_until` (>= accept + 2 days) / `refund_after` (>= settle_until), merchant-only settle, pay-the-difference, bounded retiring keys (max 3) settleable until `settle_until`, merchant early release, deadlines only move later, events, TTL bumps. Bug caught in own draft before tests: a second rotation would have dropped the first retiring key; fixed. **24/24 tests pass; WASM 14,103 B, hash `37e10b7c…3c4d`. NOT deployed; no UI integration.** FamilyVault WASM hash unchanged (`e3aac2d9…`).
- Totals: Rust 58/58 (34 + 24), TS 13/13, security 18/18, tsc clean, build OK, no secrets in build output or Git.

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
