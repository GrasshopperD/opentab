# Build log | OpenTab Global

A dated, factual record of what was actually run and what happened. Newest entry first.
Only record results that were genuinely observed. Never record a planned step as done.

---

## 2026-11-13: Session 12, public demo without an access code (branch `fix/public-demo-no-code` from `main` @ `c148cde`)

- **Change (user request, Devpost accessibility):** the access-code form is removed from Sender and Merchant Checkout,
  and the server no longer requires the operator session for the supported demo actions. No contract, signing protocol,
  service worker, environment variable or Vercel configuration change. Product Mode files are unchanged.
- **New access policy (server-enforced, `lib/guard.server.ts` + routes):**
  - Public, no code: `POST /api/sender/deposit` and `POST /api/sender/key` (register) **for the demo family only**
    (`NEXT_PUBLIC_DEMO_FAMILY_ID`, default 7); `POST /api/merchant/pay` (the customer's signature is the authorization).
  - Still operator-only (existing session cookie from `/api/auth/login`; there is no UI form any more): revoking a device
    (403 `OperatorOnly`), creating a family (401), depositing to or pairing with any other family (403 `DemoFamilyOnly`),
    invitations.
  - Unchanged: same-origin + JSON (CSRF), 4 KB body limit, per-path per-IP rate limits (deposit 10/min, key 10/min,
    pay 20/min), 50 OTUSD deposit cap, off-chain signature, network, vault, token, merchant and expiry pre-checks, the
    contract's signature, replay and balance checks, Testnet-only config. The fail-closed kill switch is kept: if
    `DEMO_ACCESS_CODE` or `DEMO_SESSION_SECRET` is missing, every signing endpoint, public ones included, returns 503.
- **Local results (production build, `next start` on port 3100, Stellar Testnet):**
  - `npm run typecheck -w apps/web` clean; `npm run build` OK; `npm test` 20/20 + 23/23.
  - `scripts/security-api.mts` (rewritten for the new policy, spends nothing): **23/23 PASS**. Public actions without a
    code reach input validation (400); create family 401; other family 403 `DemoFamilyOnly`; revoke 403 `OperatorOnly`;
    cross-origin 403; wrong code and forged cookie 401; operator session still works.
  - Playwright without spending (`--grep-invert "full journey|preset family, Milk"`): **48 passed, 2 skipped**.
  - Fresh browser contexts, **no code, no cookies**, real Testnet (level 4, all `successful: true` on Horizon):
    - `demo-catalog.spec` (pair a new key on Family #7, Milk 3.00 OTUSD at Tienda Rosa, replay and tamper rejected):
      passed on the third run; payment `09dbca2f7408b26c0468369d5c18383f54323d3a5dbf0d3854c6076d319b871b`. The first two
      runs failed on a leftover test assertion for the removed access banner, after pairing; three `register_key`
      transactions in total (`5074297e…`, `5cbffc03…`, `0f104509…`), fees only.
    - Add Funds 1 OTUSD to Family #7 (scratch script, not committed): deposit
      `965bbc477ca35d3370149e7b21639bfc4a7fa84db71a45b53c7d0325272c9a9b`; balance 57.00 -> 58.00 OTUSD.
  - Not run: `checkout.spec` full journey (creates a new family, operator-only; updated to log in through the API) and
    `invite.spec` (skipped unless invitations are enabled locally).
- **Residual risk (not removable without new features):** anyone can pair a phone with Family #7 and spend its balance,
  at the demo shops or, by calling the contract directly, to their own account, and can refill it from the demo sender
  (50 OTUSD per request, 10 requests/min per IP per instance). At the start of this session the pool was 719 OTUSD
  (sender) + 60 OTUSD (Family #7). Demo tokens have no value; recovery is re-issuing OTUSD from `opentab-issuer`.

## 2026-11-13: Session 11, pre-publication security audit and judge README (branch `docs/public-readme` from `main` @ `1688c08`)

- **Scope:** documentation only (`README.md`, this log, `NEXT_STEPS.md`). No code, contract, config, environment or Vercel
  changes. No Testnet transactions; all chain checks used read-only simulation (`--send=no`) or Horizon reads.
- **What was scanned:** all 22 commits on all refs: 7 remote branches, the PR refs `refs/pull/1..4/head` and local
  branches. No tags or releases exist. That covers 320 blobs.
- **gitleaks 8.30.1** (official release, SHA-256 checked) over full history (`--log-opts=--all`): 5 findings, all
  `generic-api-key` on the public OTUSD/FamilyVault contract IDs (`C…` addresses) in tests, scripts and the test vector,
  so all false positives. The working-tree scan's findings were all in git-ignored, untracked files (`apps/web/.env.local`,
  `.data/`, `.next/`, `target/`).
- **Own blob scan** (all reachable blobs plus commit messages):
  - Found 0 checksum-valid Stellar secret seeds.
  - Found 0 matches of the 10 real local secrets: the 5 server-only `.env.local` values and the 5 Stellar CLI identities.
    Each was also checked in raw hex and base64 form.
  - Found 0 PEM keys and 0 GitHub, AWS, Slack, OpenAI/Anthropic or Vercel-style tokens.
  - The two "assigned secret" pattern hits were an empty template value followed by a newline, and a
    `secret: Uint8Array` type.
- **Test vector:** `packages/shared/vectors/payment_v1.json` contains only a public key, a message and a signature. It
  was made from the deliberately public seed of 32 bytes of `0x07`. `is_key_active` for that key returned `false` on all
  12 existing families.
- **No committed `.env` files with values.** `.env.example` has empty secret fields in every version. `references/`
  (organizer material) was never committed.
- **Screenshots** (`submission/screenshots/*`): reviewed visually. They show only public keys, single-use approvals and
  transaction hashes.
- **GitHub-side content:** 4 PRs and 4 `vercel[bot]` comments, with no secrets. There are 0 Actions workflows or runs,
  repository secrets or variables, releases, deploy keys or webhooks. All 7 PR preview aliases redirect to Vercel SSO
  (HTTP 302).
- **Result: PASS.** Commit metadata includes the author name and e-mail of two contributors. These will be visible once
  the repository is public; that is not a credential.
- **Facts checked for the README:**
  - Token `name` is `OTUSD:GCZDLLF3…RCAY`, `symbol` is `OTUSD`, `decimals` is `7`.
  - Vault `config.token` is `CC6JPD3N…PL73`.
  - Horizon reports `successful: true` for the deploy transaction (`86f91a10…`), the key registration (`0a25bee9…`) and
    payments `0b8d72ed…`, `009cc536…` and `e42405a8…`.
  - `cargo test --locked`: FamilyVault 34 passed, OfflineChannel 24 passed.
  - `npm test`: 20 and 23 passed.
  - Production `/api/auth/status` returns `enabled: true`, and invitation creation returns 503.
  - `npm audit --omit=dev`: 1 high and 1 moderate advisory, both PostCSS through Next. The fix is Next 16.
- **README rewritten for judges:**
  - What we built, the problem and the solution.
  - The Sender → Family → Merchant → Stellar flow, with a diagram.
  - Why an offline approval is not settlement.
  - Verified contract and token IDs, and on-chain evidence.
  - Architecture and stack.
  - The live app, and Demo Mode vs Product Mode.
  - Accurate setup, environment and test commands, including which tests spend Testnet tokens.
  - Security considerations and limitations.
  - A clearly marked demo-video placeholder.
- **Release:**
  - PR #5 was merged normally as main `13c243c`, whose tree is identical to the tested `aaa7ee2`. Only those 3
    documentation files changed since `1688c08`.
  - The history rescan covered all 24 commits: 0 seeds and 0 real-secret matches. gitleaks reported only the same 5
    public contract-ID false positives.
  - Vercel `opentabglobal` production deployment `HyehPVEzNKSbyJ2ehWub2juoPetm` succeeded.
- **Production check:**
  - `/` returns 307 → `/demo`, and the judge intro is present.
  - The 4 Demo pages and 5 Product pages each return 200.
  - `/api/family/7` reads live, `/api/auth/status` returns `enabled: true`, and invite creation returns 503.
- **Visibility:** `GrasshopperD/opentab` was switched from PRIVATE to **PUBLIC** with `gh repo edit` (admin account).
- **Signed-out verification:**
  - Repository page returns 200, the anonymous API shows `private: false`, and raw `README.md` on main returns 200.
  - In a fresh Chromium with no GitHub session, the README shows all 14 sections and the Mermaid sequence diagram
    renders.
- **After publishing, against production:**
  - Playwright without spending: 48 passed, 2 skipped (Chromium plus emulated iPhone WebKit).
  - `scripts/security-api.mts`: ALL PASSED.

## 2026-11-13: Session 10, Demo Mode as the default judge experience (branch `release/demo-default` from `main` @ `213e496`)

- **Change:** `/` now redirects (HTTP 307, `redirect()` in `app/page.tsx`) to `/demo` on every domain of the project;
  `/home` renders Alex's Product landing directly (it used to re-export the root page). `/demo` opens with a judge
  introduction ("Judge Demo: OpenTab on Stellar Testnet": primary technical demonstration, Testnet not Mainnet, OTUSD has
  no monetary value, Sender/Family/Shop tabs, which actions need the demo access code) and a "Want to see the consumer
  experience?" note linking to Product Mode (read-only preview with real Family #7 data). Existing Demo content, Live
  activity and mode switch unchanged. No API, signing, contract, security, config or service-worker change (verified with
  `git diff` against main).
- **Local results (production build):** typecheck clean; build OK; `/` → `307 location: /demo`; route sweep of 15 routes:
  no page/console errors, no 5xx, no overflow at 390 px; unit 20/20 + 23/23; Playwright non-spending (Chromium + emulated
  iPhone WebKit) **48 passed, 2 skipped, 0 failed**, including the new root-redirect/judge-intro test and the three Product
  role journeys (onboarding → dashboard / wallet / business → Demo Sender / Family / Shop, real Family #7 balance, no
  writes); security API 18/18; client bundles: no secrets. No Testnet transactions.

## 2026-11-13: Session 9 production verification (two-mode release, PR #3)

- PR #3 merged normally → main `213e496` (tree identical to tested `c434bb3`). Vercel `opentabglobal` production
  deployment `3R3yCdUuhA21VvaBwcizPYbqgzua` succeeded (rollback reference `A8QX9y4rydzSkvL84Z7zgu49gfS1`, main `ca9dece`).
- On https://opentabglobal.vercel.app: 16 routes without page/console errors or 5xx; all 7 invitation endpoints 503;
  preflight public checks OK; Playwright non-spending suite **46 passed, 2 skipped**; security API 18/18; 23 production JS
  files contain no secret values or `S…` keys. Live Family #7 at the time: balance 74.00, deposited 116.00, paid 42.00,
  9 confirmed payments in the RPC window. The shorter custom domain could not be read (CLI account lacks `open-tab1`).

---

## 2026-11-12: Session 9, two-mode release (branch `release/two-mode` from `main` @ `ca9dece`)

- **Scope (user, final release):** one site with Demo Mode (the existing working Stellar Testnet app) and Product Mode
  (Alex's consumer UI as a read-only showcase of the same demo), plus a visible Demo Mode | Product Mode switch. Product Mode
  sends no transactions.
- **Preserved first:** the unfinished backend-integration work (shared payment hooks, Product wallet/checkout with signing)
  was committed as `494b802` on `feat/product-backend-integration` and pushed; its browser tests had NOT completed. It is
  not part of this release. Alex's branch `UI` (`37aec9b`) untouched.
- **Imported from `UI@37aec9b`:** `experience/*` (home, journey map, onboarding, header, design), `/home`, `/business`,
  `/dashboard`, `/onboarding`, `/demo/{home,sender,family,shop}` aliases, layout/branding, icons/manifest, dev-only SW
  cleanup in `sw-register.tsx`, his docs and home/business/dev-cache tests, his build-log entries (below, labeled).
  **Not imported:** his `public/sw.js` change (the production service worker stays byte-identical to main), lockfile change.
- **Unchanged vs main (verified with `git diff`):** `public/sw.js`, Demo `/sender`, `/family`, `/shop` pages, every API
  route, `lib/`, `packages/shared`, contracts.
- **New:** mode switch in the shared app shell (every page; Demo → `/demo`, Product → `/home`; plain links, no storage
  changes); read-only hook `useFamilyRead` (GET `/api/family/7`, fresh read when the tab becomes visible); dashboard
  balance/totals/purchases from it, "Balance unavailable" on read failure; dashboard Add money / Create family / Pair →
  `/demo/sender`, Family Wallet → `/demo/family`; read-only `/wallet` (live balance, Scan to Pay → `/demo/family`; creates
  no key); `/business` catalog from config + Open Merchant Checkout → `/demo/shop`; onboarding = role choice (organizer /
  family member / merchant), no email, "not payment authorization"; `/demo` Live activity card (confirmed Family #7
  payments with explorer links, 20 s refresh while visible, notice only when a new confirmed tx hash appears).
- **Local results (production build on localhost, real Testnet reads, nothing spent):** typecheck clean; `next build` OK;
  protocol tests 20/20, web lib 23/23; security API 18/18 (the "landing page public" check now matches the "OpenTab" brand
  instead of the old title "OpenTab Global"; all access/CSRF/limit checks unchanged); Playwright two-mode 10/10 and
  onboarding 11/11 (Chromium); full non-spending Playwright run on Chromium + emulated iPhone WebKit (existing Demo,
  offline, deploy-safety, Alex's home/business tests): 44 passed, 2 skipped (invite flow: invitations disabled;
  dev-cache: dev-server only), 2 failed in Alex's `home.spec`, both fixed and re-run 3/3: (1) it expected his removed email
  field; (2) at the last story step his scene buttons sit under his sticky header, so a pointer click scrolls first and the
  scroll re-selects scene 1 (reproduced with the mode bar hidden, so not a regression); the test now triggers the button
  directly. Final full re-run on the final code: **46 passed, 2 skipped, 0 failed**. Spending journeys
  (`checkout.spec` full journey, `demo-catalog.spec`) not run. Client bundles (57 JS files) and
  prerendered HTML scanned: no server secret values, no Stellar secret keys.
- No physical phone test.

---

## 2026-11-12 (Alex, branch `UI` @ 37aec9b): Simplified dashboard and smoother funding review

- Removed decorative top bar/avatar/test badge, page subtitles/repeated disclaimer, connect-card caption, empty-state helper text and redundant funding review For/Type rows. Retained Demo USD unit labels and functional access/error states. Demo access moved to the sidebar, including mobile.
- Family destination/choice is above the funding card. Amount/review use a stable-height card with short fade/slide transitions, quicker pressed feedback, consistent button weight and reduced-motion support. Heading focus no longer causes scroll jumps between money steps.
- Confirmation has a two-second delay every time review is entered; a handler guard also prevents early funding submission. Editing/back/destination changes reset it. No API or payload changes.
- Typecheck and isolated production build passed. Dashboard browser checks **16/16 passed**, including delay/re-entry/no early request, destination placement, exact request bodies, duplicate/pending/failed behavior, pairing/auth, validation, stale data and four viewport widths. Mutation responses mocked; no transactions sent. Desktop/phone screenshots reviewed.
- Before documentation, only dashboard.tsx, dashboard.css and dashboard.spec.ts changed; 140 other baseline files byte-identical, including all backend/payment/configuration/offline/dependency files. No commits, pushes or deployments.

---

## 2026-11-12 (Alex, branch `UI` @ 37aec9b): OpenTab branding and first organizer dashboard

- Browser metadata/app name now OpenTab; SVG and 192px/512px icons match the existing yellow mark on charcoal. Branding-versioned metadata/manifest icon URLs refresh the previous teal assets. PWA start URL/scope and worker behavior retained.
- Added `/dashboard`: consistent organizer Overview, two-step Add money, Family phone access and Activity. Uses existing API helper/routes/payloads, shared amount validation/formatting and Scanner/parser/fingerprint. Original payment pages/components/backend are unchanged. Organizer preview completion now opens the dashboard; recipient/merchant completion remains unchanged.
- Funding and phone changes require review; duplicate-click ref guard and session-scoped in-flight marker prevent automatic resubmission. Pending/unknown responses survive reload; hash status checks are read-only. A create-family confirmation alone is never labeled funded. Unknown balances display a dash; stale balances clear on refresh/errors. No fake purchases/balances or fiat-transfer claims.
- Typecheck and final isolated production build passed. Production browser suite: **36 passed**, one pending/reload check initially raced its own in-flight marker before the mocked response supplied a hash. Corrected that test to await the returned request link before reload; targeted rerun **1/1 passed**. All 37 checks covered. Earlier development checks exposed an accessible-name omission on the family chooser (fixed with aria-label) and two test selectors also matching Next's route announcer (scoped to the app error notice).
- Checks cover exact payloads, review, duplicate clicks, create/fund, partial creation, pending/lost response/reload, failure reconciliation, validation, auth login/logout, pairing, purchases/read errors, four dashboard widths and existing home/onboarding/demo flows. All mutation responses mocked: no real funds or Testnet transactions. Desktop/phone screenshots and icon render inspected.
- SHA-256 checks: all 36 protected backend/API/lib/contracts/protocol/original-payment/offline/lock files unchanged against this pass's baseline. No dependency/configuration changes, commits, pushes or deployments. Documentation: DASHBOARD_FRONTEND.md.

---

## 2026-11-12 (Alex, branch `UI` @ 37aec9b): Minimal copy, Family-only home and remembered preview role

- Removed the journey's numbered caption/footer and disclosure line, shop art captions/overline, decorative section kickers and setup subtitle/helper/preview paragraphs. The existing demo's disclosures and access controls remain unchanged; Home FAQ and Business details retain the Testnet explanation.
- Home role tabs and regular setup offer only Organizer/Recipient. Removed the Family/Merchant selection stage. Business setup/sign-in links select merchant directly. Updated keyboard tab cycling for the two Family roles.
- Added independent 30-day Family/Business preview-role cookies. Only organizer/recipient/merchant values are accepted; no email, personal profile, key, token or authentication grant is stored. Reload restores a generic role preview. Reset/Forget clears it. Existing code-based demo login already has its own HttpOnly session cookie, unchanged; no real email authentication was added.
- Typecheck and final isolated production build passed. Final development browser suite **22/22 passed**, including cookie reload/clear/channel separation, three complete setup paths, Family-only home, navigation, responsive layouts and original demo aliases. Removed one obsolete caption assertion after intentionally deleting that caption. Reviewed desktop/phone screenshots including returning-preview state.
- Before documentation, exactly five frontend presentation files and three browser tests changed; 130 baseline files were unchanged, including backend/API/payment/protocol/offline/configuration/dependencies. No transactions, commits, pushes or deployments.

---

## 2026-11-12 (Alex, branch `UI` @ 37aec9b): Journey begins in the hero; centered headers and refined shop

- Combined the welcome and country journey in one pinned opening stage. Canada and coin are present immediately; the first scroll advances the coin while the welcome fades into the route. Preserved static reduced-motion presentation.
- Centered shared Home/Business navigation with equal-width side columns and a dedicated phone row. Rebuilt the local Business shop SVG with balanced facade, striped awning, window display, welcoming entrance and plants.
- Typecheck and isolated production build passed; development Playwright **22/22 passed**, including new first-scroll movement and header-centering checks on both pages. Reviewed desktop/phone hero, route midpoint and Business screenshots.
- Fingerprints: only four presentation files and two frontend test files changed before documentation updates; 132 other baseline files unchanged. Backend/payment/offline/config/dependencies untouched in this pass. No transactions, commits, pushes or deployments.

---

## 2026-11-12 (Alex, branch `UI` @ 37aec9b): Warm palette, Business page and Canada-to-Mexico journey

- Restored original charcoal/yellow/warm-neutral homepage colors and six-pixel-radius yellow buttons; retained the simple centered entry and minimal login/setup. Added Home/Business navigation on desktop/mobile and separate `/business` merchant presentation with original pixel-style shop art, checkout explanation and existing merchant setup/demo links.
- Replaced the particle globe with a sticky SVG pixel-map journey from Toronto, Canada, to Oaxaca, Mexico. Coin/trail/caption follow scroll progress; reduced-motion mode uses a static route. Country silhouettes derive from Natural Earth public-domain boundaries. Downloaded the official Stellar logo pack linked from stellar.org; extracted its two unchanged black symbol paths into local `public/stellar-symbol.svg`. Sources/derivation recorded in ONBOARDING_FRONTEND. The route is explicitly illustrative/Testnet; no real transfer or bank payout.
- Typecheck and isolated production build passed. Production Playwright **21/21 passed** (new style/navigation/map/reduced-motion/responsive tests plus existing home/onboarding suites). Development checks found exact half-way string assertions off by 0.001 due to rounded scroll offsets; corrected the new layout test to use a numeric tolerance, then affected three viewport checks **3/3 passed**. Desktop/mobile screenshots reviewed for both pages and route start/middle/end.
- Before documentation updates, only two pre-existing files changed in this pass: `experience/home-landing.tsx` and `experience/home.css`; other changes are new frontend files/asset/test and documentation. Existing backend/API/protocol/contracts/payment pages/dependencies/configuration/onboarding/offline files byte-identical to this turn's baseline. No transactions, commits, pushes, deployment or new dependencies.

---

## 2026-11-12 (Alex, branch `UI` @ 37aec9b): Interactive home and simpler setup

- Owner requested a centered Axiom-like welcome with one Get started action, removal of “See it in action,” scroll interaction inspired by Stellar, and simpler login/setup for older users. Inspected Stellar's scrolled layout and the owner's supplied Axiom screenshots.
- New local `experience/home-landing.tsx` + `home.css`: centered sans-serif opening, blue pill CTA, layered scroll backdrop, local canvas particle globe, reveal effects, page progress, desktop sticky three-scene walkthrough, mouse/keyboard role tabs, FAQ and reduced-motion support. Mobile uses normal reading flow for the story. No new dependencies, external assets, API requests or payment actions; previews labeled illustrative.
- Setup is now a single centered form: removed sidebar/art/slogans, duplicate sign-in links, progress codes, top preview badge and bottom footer. Plain headings, larger labels, 18px inputs and 60px primary actions. Kept a short readable preview notice and existing local-only roles/back/validation/review flow.
- Typecheck and final isolated production build passed. Browser tests **14/14** on development and **14/14** on production (home interactions + all setup/viewport/demo-alias checks); stale-cache regression **1/1**. Desktop/mobile screenshots reviewed. Fingerprint comparison: **58 protected source/config files unchanged in this pass**, including backend/API/protocol/contracts/payment pages/dependencies and the preceding offline-cache fix. No transactions, commits, pushes or deployments.

---

## 2026-11-12 (Alex, branch `UI` @ 37aec9b): Frontend development cache runtime fix

- User reported Webpack `originalFactory is undefined` at `AppShell`. Found the offline worker also cached mutable Next development JS; the regression reproduced a stale unversioned `app/layout.js` being served. Initial clean-context checks did not cover this returning-browser condition.
- `sw-register.tsx` now retires only this app's worker and `opentab-*` code caches during development, with one navigation to detach an active controller. `public/sw.js` cache bumped to `opentab-v3`; dev/HMR and unhashed chunk URLs bypass both precache and fetch caching. Production hashed resources/offline shell remain supported. No key, local history, checkout, session or other localStorage clearing.
- Added opt-in `tests/e2e/dev-cache.spec.ts`; poisoned-legacy-cache regression **1/1 passed**, zero page errors and stored test key/pending-checkout sentinels preserved. Typecheck clean, isolated production build passed, production Chromium onboarding + existing offline suite **13/13 passed**, including offline signing/reload/reconnect. No Testnet transactions or backend/API/protocol/contract/payment logic changes; protected source fingerprints verified.

---

## 2026-11-12 (Alex, branch `UI` @ 37aec9b): First frontend onboarding pass

- Created local branch `feat/frontend-onboarding`. Added a new welcome page at `/` and `/home`, sign-up/sign-in design preview at `/onboarding`, Family → Organizer/Recipient selection, and distinct Merchant setup. Setup uses focused detail/preference/review/completion screens with back navigation and three role themes. All new profile state is React memory only; no account APIs, credentials, persistence, wallet creation or payment handlers.
- Kept original demo at `/demo`; added `/demo/home` for the original landing and `/demo/sender`, `/demo/family`, `/demo/shop` as re-exports of original components. Original `/sender`, `/family`, `/shop` remain for compatibility/offline shell. Updated only demo role links, shared presentation shell, root page and new frontend files. Original role components, shared payment components, global demo CSS and all API/server/protocol/contract logic unchanged.
- Inspected Stellar's live desktop reference. Axiom live page hit browser verification; public screenshot search supplied general account-entry context. Created original local SVG/CSS visuals; no copied site assets or new dependencies.
- `npm run typecheck -w apps/web` clean; `npm test` **13/13**; production Next.js build passed in isolated `/tmp/opentab-onboarding-build` without copying secrets or disrupting the user's dev server. New Playwright suite **11/11** on dev and **11/11** on isolated production. All three setup paths checked for no API/POST activity and no persisted email; sign-in validation/mode switching, back/reload, demo aliases and responsive layouts passed. Entry widths 320/375/390/430/768/1440; setup details/preferences/review/completion additionally checked at 320/390/768/1440. Desktop/mobile screenshots reviewed.
- Original live-checkout test first navigation now points to `/demo/home`; financial, offline and replay assertions retained. No live payment suite, chain mutations, deployments, physical camera/PWA tests, commits or pushes. Demo remains disabled without existing server configuration; no access guards were changed.
- SHA-256 comparison against start of this turn: **63 protected source/config files byte-identical**, including original Sender/Family/Shop, APIs, server helpers, shared protocol, contracts, scripts, dependency/config files, worker/manifest and pre-existing root lockfile content. See `docs/ONBOARDING_FRONTEND.md` for implementation details and next review point.

---

## 2026-11-12 (Alex, branch `UI` @ 37aec9b): Frontend redesign preparation (documentation only)

- Owner requested source understanding and documentation before a full visual redesign, with existing backend logic unchanged. Reviewed active app, API/server helpers, shared protocol, both current contracts, tests, configuration, scripts, existing project/submission docs, print HTML/CSS and legacy source. Parsed dependency lockfiles, visually inspected existing PNG screenshots/icons, and extracted submission PDF text/page metadata; no PDF layout audit. Ignored dependencies/build output, IDE files, Git internals and private environment/keystore files were excluded.
- Added `docs/UI_REDESIGN_GUIDE.md` (scope and behavior-preserving screen/component checklist), `docs/SYSTEM_MAP.md` (implemented API/protocol/storage/payment/PWA map and caveats) and `docs/FILE_INVENTORY.md` (all 111 pre-existing tracked files). Added a current-scope pointer to NEXT_STEPS without removing the earlier deployment queue.
- Documented stale-plan differences and current edge cases without changing behavior. No application, backend, protocol, contract, test, dependency, config, script, asset or archive changes. Root `package-lock.json` was already modified at session start and was preserved.
- Ran `npm test`: **13/13 protocol tests passed**, one test file. No app build, contract tests/build, live API/e2e mutation checks, browser/device tests, fresh deployment verification or transactions in this review. Existing evidence remains historical.
- Captured SHA-256 fingerprints of all 111 tracked files before documentation edits; final comparison verifies all non-documentation content unchanged. Next work is the requested visual redesign using the documented boundaries; redesign implementation has not started.

---

## 2026-11-12: Session 8, demo UI layout and flow cleanup (branch `demo-ui-polish` from `5b45fee`)

- **Scope:** structure, copy and progressive disclosure only. No change to contracts, protocol, quote hashing, replay protection, API routes, auth, key handling, service worker or invitation rules. Styling reuses the existing CSS tokens (a few layout helpers added).
- **Sender:** wallet card first (Family #7, confirmed live balance, last-checked time) with two primary actions, **Add Funds** (existing deposit; returns to the dashboard only after Stellar confirms) and **Pair Family Member** (existing scan + register; shows the family being paired; Authorize hidden once the key is active, Revoke shown instead; returns to the overview after confirmation). Recent activity = the existing on-chain purchase events (top 5 + "Show all"). Family selection, on-chain totals and "Create new family + fund" moved into a collapsed *Advanced: family management*. Limitation: the existing create route always makes a starting deposit; the UI states this instead of changing the API.
- **Family (recipient):** two layouts. Onboarding (1 Set up device, 2 Connect: family number + pairing QR, 3 Confirm: polls `is_key_active` every 5 s while waiting). Connected dashboard once Stellar has confirmed the key: balance with "Confirmed on Stellar at …" or "Last synced … you are offline, so this is not a fresh check", one large **Scan to Pay**, recent payments (local approvals + on-chain settled check), *Device settings* (security code, pairing QR, family number, replace/delete key). Scan to Pay = Step 1 scan (camera auto-opens, paste fallback) -> Step 2 review (merchant, items, total, charge, wallet) -> **Approve Payment** (same local signing) -> **Payment Authorized** QR with "Waiting for merchant settlement." The last Stellar answer is cached per family+key (`opentab.family.sync`) so a connected phone opens its wallet offline without re-pairing. Offline fallback "Scan to Pay anyway" only when the phone cannot check.
- **Shop:** *Merchant Checkout* with product selection + order summary + **Generate Invoice QR**; then numbered stages (1 customer scans invoice, 2 scan approval, 3 Submit to Stellar after "Authorization Verified", 4 receipt + **New Sale**). Receipt history/CSV and shop account shown only when no sale is in progress. Shop/terminal settings collapsed.
- **Tests (observed):** tsc OK; build OK; shared 20/20; invite state machine 23/23; Rust 58/58; security 18/18; Playwright no-spend 14/14 (offline Chromium+WebKit, deploy-safety, malformed codes, access gate, 6 layouts) and offline 12/12 over 3 repeats. Real Testnet: `demo-catalog.spec` passed (Milk tx `6bd2aee4ebc3cbe5ff632168dfb34db9132c53aca72120e36955bc85a057426a` CONFIRMED, Family #7 83.00 -> 80.00); full `checkout.spec` journey passed on the second run (tx `d98131e44f8312941ff5c5e46501557c587f3e8e023b9bd311c74e6b27619263` CONFIRMED). First run failed on my test selector `getByText("Offline")` (it also matched the new "you are offline" text) after creating/funding/pairing a family.
- **Test changes:** new `tests/e2e/helpers.ts` (`simulateAuthorizedDevice` rewrites ONLY `keyActive` in the real /api/family response so no-spend UI tests reach the connected wallet; real authorization is covered by the two Testnet specs). On WebKit, the offline spec blocks the service worker because WebKit sends requests from SW-controlled pages outside Playwright interception (WebKit offline reload was already untestable in emulation). `checkout.spec` screenshots now go to `test-results/checkout-shots` instead of overwriting `submission/screenshots`.
- **Not done:** no physical phone; `invite.spec` selector updated but not re-run (local-only feature, costs Testnet fees).

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
