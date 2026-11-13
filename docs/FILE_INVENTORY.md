# Tracked-file inventory for the UI redesign

**Current frontend additions:** see [ONBOARDING_FRONTEND.md](ONBOARDING_FRONTEND.md) for the new home/onboarding files and `/demo/*` route aliases. The 111-file inventory below is the pre-redesign review snapshot.

Reviewed 2026-11-12. All 111 pre-existing tracked files are accounted for below. Application, protocol, contract, script, test and prose sources were read; lockfiles were parsed as dependency graphs; PNG assets were inspected visually; PDF text and page metadata were extracted. PDFs were not re-rendered or audited for layout. Empty placeholders contain no implementation.

The review excludes installed `node_modules`, generated build/cache output, Git internals, ignored IDE state and private environment/keystore files. Those are not project source, and reading secrets is unnecessary for documentation. No remote service connection or fresh deployment check was performed. The existing local checkout is the source for this map.

Start with [UI_REDESIGN_GUIDE.md](UI_REDESIGN_GUIDE.md), then [SYSTEM_MAP.md](SYSTEM_MAP.md). This inventory distinguishes current code, historical plans and supporting media; the presence of a design or screenshot is not proof of current runtime behavior.

| File | Responsibility / review note |
|---|---|
| [`.env.example`](../.env.example) | Public Testnet identifiers and empty server-secret/access configuration template; never fill with secrets in Git. |
| [`.gitattributes`](../.gitattributes) | Line endings and binary file classification. |
| [`.gitignore`](../.gitignore) | Excludes credentials, build output, local editor state and private references. |
| [`CLAUDE.md`](../CLAUDE.md) | Existing operating/product/security instructions; current user frontend-only scope takes precedence. |
| [`Cargo.lock`](../Cargo.lock) | Resolved active Rust dependencies; includes both current contracts. |
| [`Cargo.toml`](../Cargo.toml) | Active Rust workspace and release profile. |
| [`README.md`](../README.md) | Product explanation, recorded evidence, local setup, deployment and limitations. |
| [`apps/web/app/api/auth/login/route.ts`](../apps/web/app/api/auth/login/route.ts) | Frozen POST /api/auth/login handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/auth/logout/route.ts`](../apps/web/app/api/auth/logout/route.ts) | Frozen POST /api/auth/logout handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/auth/status/route.ts`](../apps/web/app/api/auth/status/route.ts) | Frozen GET /api/auth/status handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/family/[id]/route.ts`](../apps/web/app/api/family/[id]/route.ts) | Frozen GET /api/family/[id] handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/invoice/route.ts`](../apps/web/app/api/invoice/route.ts) | Frozen GET /api/invoice handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/merchant/[id]/route.ts`](../apps/web/app/api/merchant/[id]/route.ts) | Frozen GET /api/merchant/[id] handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/merchant/pay/route.ts`](../apps/web/app/api/merchant/pay/route.ts) | Frozen POST /api/merchant/pay handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/preflight/route.ts`](../apps/web/app/api/preflight/route.ts) | Frozen GET /api/preflight handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/sender/deposit/route.ts`](../apps/web/app/api/sender/deposit/route.ts) | Frozen POST /api/sender/deposit handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/sender/family/route.ts`](../apps/web/app/api/sender/family/route.ts) | Frozen POST /api/sender/family handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/sender/key/route.ts`](../apps/web/app/api/sender/key/route.ts) | Frozen POST /api/sender/key handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/api/tx/[hash]/route.ts`](../apps/web/app/api/tx/[hash]/route.ts) | Frozen GET /api/tx/[hash] handler; exact payload/result in SYSTEM_MAP.md. |
| [`apps/web/app/components.tsx`](../apps/web/app/components.tsx) | Mixed UI and behavior: QR, camera/paste scanner, API helper, access gate, links, connectivity and error copy. |
| [`apps/web/app/demo/page.tsx`](../apps/web/app/demo/page.tsx) | Public judge explanation, implementation status, historical chain evidence and preflight presentation. |
| [`apps/web/app/demo/preflight.tsx`](../apps/web/app/demo/preflight.tsx) | Read-only route/API checks, public/operator results and rerun UI. |
| [`apps/web/app/family/page.tsx`](../apps/web/app/family/page.tsx) | Local key custody, setup/pairing, offline invoice signing, last-read allowance and approval history. |
| [`apps/web/app/globals.css`](../apps/web/app/globals.css) | All active app visual styling, responsive layout and status/QR treatments. |
| [`apps/web/app/layout.tsx`](../apps/web/app/layout.tsx) | Shared shell, navigation, disclosure, metadata, viewport and service-worker mount. |
| [`apps/web/app/page.tsx`](../apps/web/app/page.tsx) | Public landing, role links, explanation, configuration warning and prototype limitations. |
| [`apps/web/app/sender/page.tsx`](../apps/web/app/sender/page.tsx) | Family create/fund/top-up/key management, synchronous mutation locks, browser family list and chain history. |
| [`apps/web/app/shop/page.tsx`](../apps/web/app/shop/page.tsx) | Local invoice/quote, approval validation, submission, persisted checkout/status recovery and receipt. |
| [`apps/web/app/sw-register.tsx`](../apps/web/app/sw-register.tsx) | Registers worker and requests caching of loaded same-origin resources. |
| [`apps/web/lib/api.server.ts`](../apps/web/lib/api.server.ts) | HTTP response/error helpers, ID checks, public read limiting and bounded recent paid-event queries. |
| [`apps/web/lib/chain.server.ts`](../apps/web/lib/chain.server.ts) | Server-only signers, ABI builders, simulation/invocation, token reads, polling and chain error mapping. |
| [`apps/web/lib/config.ts`](../apps/web/lib/config.ts) | Public Testnet constants, merchant profiles and illustrative exchange rates. |
| [`apps/web/lib/evidence.ts`](../apps/web/lib/evidence.ts) | Historical transaction hashes/details and public issuer config for demo page. |
| [`apps/web/lib/guard.server.ts`](../apps/web/lib/guard.server.ts) | Server-only session HMAC/cookie, CSRF, content/body checks and process-local rate limits. |
| [`apps/web/next-env.d.ts`](../apps/web/next-env.d.ts) | Next.js-generated type references; not a presentation file. |
| [`apps/web/next.config.ts`](../apps/web/next.config.ts) | Shared-package transpilation and service-worker headers. |
| [`apps/web/package.json`](../apps/web/package.json) | Next.js app scripts and pinned frontend/SDK dependencies. |
| [`apps/web/public/icon-192.png`](../apps/web/public/icon-192.png) | Existing raster installation icon (visually a solid teal square). |
| [`apps/web/public/icon-512.png`](../apps/web/public/icon-512.png) | Existing larger raster installation icon (visually a solid teal square). |
| [`apps/web/public/icon.svg`](../apps/web/public/icon.svg) | Vector app icon used by metadata and cached shell. |
| [`apps/web/public/manifest.webmanifest`](../apps/web/public/manifest.webmanifest) | PWA identity, icons, standalone display and /family start URL. |
| [`apps/web/public/sw.js`](../apps/web/public/sw.js) | Offline shell/static caching and navigation fallback; deliberately excludes APIs. |
| [`apps/web/tsconfig.json`](../apps/web/tsconfig.json) | Strict app compilation and @ path alias. |
| [`archive/legacy_opentab_starter/Cargo.lock`](../archive/legacy_opentab_starter/Cargo.lock) | Resolved legacy Rust graph. |
| [`archive/legacy_opentab_starter/Cargo.toml`](../archive/legacy_opentab_starter/Cargo.toml) | Separate reference Rust workspace; not an active dependency. |
| [`archive/legacy_opentab_starter/README.md`](../archive/legacy_opentab_starter/README.md) | Original single-shop product/setup/interface documentation; historical only. |
| [`archive/legacy_opentab_starter/contracts/open_tab/Cargo.toml`](../archive/legacy_opentab_starter/contracts/open_tab/Cargo.toml) | Reference contract crate dependencies. |
| [`archive/legacy_opentab_starter/contracts/open_tab/src/lib.rs`](../archive/legacy_opentab_starter/contracts/open_tab/src/lib.rs) | Old single-shop cumulative escrow, fee/treasury, single expiry and 88-byte ticket domain. |
| [`archive/legacy_opentab_starter/contracts/open_tab/src/test.rs`](../archive/legacy_opentab_starter/contracts/open_tab/src/test.rs) | 17 reference contract tests, including original expiry/key behavior and JS fixture. |
| [`archive/legacy_opentab_starter/web/make-ticket.mjs`](../archive/legacy_opentab_starter/web/make-ticket.mjs) | Reference CLI household-secret/key/ticket helper; do not run as current app setup. |
| [`archive/legacy_opentab_starter/web/package-lock.json`](../archive/legacy_opentab_starter/web/package-lock.json) | Resolved legacy npm graph; manifest latest SDK resolves to 17.4.0 in lock. |
| [`archive/legacy_opentab_starter/web/package.json`](../archive/legacy_opentab_starter/web/package.json) | Reference Node ticket-test package. |
| [`archive/legacy_opentab_starter/web/ticket.mjs`](../archive/legacy_opentab_starter/web/ticket.mjs) | Old Node Buffer-based 88-byte ticket encoder/signer/verifier; unused by active app. |
| [`archive/legacy_opentab_starter/web/ticket.test.mjs`](../archive/legacy_opentab_starter/web/ticket.test.mjs) | Three reference ticket tests and Rust-compatible original fixture. |
| [`assets/.gitkeep`](../assets/.gitkeep) | Empty tracked directory placeholder; no executable behavior. |
| [`contracts/family_vault/Cargo.toml`](../contracts/family_vault/Cargo.toml) | FamilyVault crate metadata and runtime/test dependencies. |
| [`contracts/family_vault/src/lib.rs`](../contracts/family_vault/src/lib.rs) | Mode A balance/key/replay/payment contract and 340-byte canonical message. |
| [`contracts/family_vault/src/test.rs`](../contracts/family_vault/src/test.rs) | 34 contract tests covering authority, payment binding/replay, balances, TTL and TS/Rust fixture. |
| [`contracts/offline_channel/Cargo.toml`](../contracts/offline_channel/Cargo.toml) | OfflineChannel crate metadata and runtime/test dependencies. |
| [`contracts/offline_channel/src/lib.rs`](../contracts/offline_channel/src/lib.rs) | Unintegrated Mode B reserved-channel contract, cumulative settlement, grace/refund and retiring keys. |
| [`contracts/offline_channel/src/test.rs`](../contracts/offline_channel/src/test.rs) | 24 Mode B tests covering reservation, cumulative settlement, deadlines, key rotation and conservation. |
| [`docs/.gitkeep`](../docs/.gitkeep) | Empty tracked directory placeholder; no executable behavior. |
| [`docs/APPROVED_ARCHITECTURE.md`](../docs/APPROVED_ARCHITECTURE.md) | Historical approved summary; stale implementation status and planned paths/storage; do not treat as current runtime map. |
| [`docs/BUILD_AND_HOSTING.md`](../docs/BUILD_AND_HOSTING.md) | Historical hosting/account/phone demonstration guidance; includes planned behavior. |
| [`docs/BUILD_LOG.md`](../docs/BUILD_LOG.md) | Observed previous build/test/evidence history; documentation review entry added this session. |
| [`docs/CLAUDE_PLANNING_HANDOFF.md`](../docs/CLAUDE_PLANNING_HANDOFF.md) | Detailed historical product/architecture/research handoff with superseded plan-only gate. |
| [`docs/CLAUDE_START_HERE.md`](../docs/CLAUDE_START_HERE.md) | Historical resume prompt, explicitly superseded plan-only status and stale unimplemented-app claim. |
| [`docs/DECISIONS.md`](../docs/DECISIONS.md) | Accepted product decisions and earlier verification snapshot; several status notes are historical. |
| [`docs/IMPLEMENTATION_PLAN.md`](../docs/IMPLEMENTATION_PLAN.md) | Approved milestone/amendment plan; contains design details that differ from implementation. |
| [`docs/NEXT_STEPS.md`](../docs/NEXT_STEPS.md) | Existing competition/deployment work queue; current frontend-only review scope note added. |
| [`docs/SESSION_HANDOFF.md`](../docs/SESSION_HANDOFF.md) | Prior session 5 behavior/evidence, deployment and manual phone procedure. |
| [`package-lock.json`](../package-lock.json) | Resolved npm workspace dependency graph; already modified before this review; preserved byte-for-byte. |
| [`package.json`](../package.json) | npm workspaces and root scripts; smoke:pay currently points to a missing file. |
| [`packages/shared/package.json`](../packages/shared/package.json) | Browser-safe protocol package exports, crypto dependencies and test script. |
| [`packages/shared/src/index.test.ts`](../packages/shared/src/index.test.ts) | 13 protocol tests: fixture, tampering, validation, QR, amount precision and status invariants. |
| [`packages/shared/src/index.ts`](../packages/shared/src/index.ts) | Frozen signing, canonical bytes, QR codecs, key helpers, amount math and status helper. |
| [`packages/shared/tsconfig.json`](../packages/shared/tsconfig.json) | Shared TypeScript compilation settings. |
| [`packages/shared/vectors/payment_v1.json`](../packages/shared/vectors/payment_v1.json) | Known Mode A message/key/signature fixture shared with Rust; test-only seed. |
| [`packages/shared/vitest.config.ts`](../packages/shared/vitest.config.ts) | Node test environment for protocol tests. |
| [`playwright.config.ts`](../playwright.config.ts) | Production-server browser test setup, Chromium and offline-only iPhone WebKit project. |
| [`scripts/.gitkeep`](../scripts/.gitkeep) | Empty tracked directory placeholder; no executable behavior. |
| [`scripts/e2e-api.mts`](../scripts/e2e-api.mts) | LIVE Testnet integration checks; creates/funds family, registers key, pays two merchants and tests rejection paths. |
| [`scripts/gen-vector.mts`](../scripts/gen-vector.mts) | Produces deterministic test-only Mode A fixture JSON. |
| [`scripts/render-print.mjs`](../scripts/render-print.mjs) | Playwright HTML-to-PDF rendering; overwrites existing submission PDFs when run. |
| [`scripts/security-api.mts`](../scripts/security-api.mts) | HTTP access/CSRF/input/security checks against configured running server; no token transfers in intended checks. |
| [`scripts/sign-invoice.mts`](../scripts/sign-invoice.mts) | CLI signing helper; generates/reads a recipient key file outside repo and prints payment auth/signature. |
| [`submission/.gitkeep`](../submission/.gitkeep) | Empty tracked directory placeholder; no executable behavior. |
| [`submission/DEMO_AND_SHOWCASE.md`](../submission/DEMO_AND_SHOWCASE.md) | Live-demo outline, show-kit and honesty requirements. |
| [`submission/DEMO_SCRIPT.md`](../submission/DEMO_SCRIPT.md) | One-minute real-footage script and phone setup procedure. |
| [`submission/DEVPOST_DRAFT.md`](../submission/DEVPOST_DRAFT.md) | Draft competition description, recorded evidence and missing public links. |
| [`submission/ONE_PAGE_OVERVIEW.md`](../submission/ONE_PAGE_OVERVIEW.md) | Written product/technology/evidence overview. |
| [`submission/ONE_PAGE_OVERVIEW_DRAFT.md`](../submission/ONE_PAGE_OVERVIEW_DRAFT.md) | Older overview draft with placeholders; not a runtime specification. |
| [`submission/OpenTab_Global_One_Page_Overview.pdf`](../submission/OpenTab_Global_One_Page_Overview.pdf) | Existing generated PDF; extracted text reviewed, 1 page, Letter; no edits or visual-layout audit. |
| [`submission/OpenTab_Global_Pitch_Slides.pdf`](../submission/OpenTab_Global_Pitch_Slides.pdf) | Existing generated PDF; extracted text reviewed, 8 pages, 960x540 pt each; no edits or visual-layout audit. |
| [`submission/OpenTab_Global_Trifold_48x36in.pdf`](../submission/OpenTab_Global_Trifold_48x36in.pdf) | Existing generated PDF; extracted text reviewed, 1 page, 48x36 inches; no edits or visual-layout audit. |
| [`submission/PITCH.md`](../submission/PITCH.md) | Three-minute spoken pitch. |
| [`submission/RELEASE_LINKS.md`](../submission/RELEASE_LINKS.md) | Recorded deployment/asset/payment evidence and not-yet-published artifacts; not freshly verified here. |
| [`submission/SUBMISSION_CHECKLIST.md`](../submission/SUBMISSION_CHECKLIST.md) | Competition deliverables/status and organizer references. |
| [`submission/TRIFOLD_CONTENT.md`](../submission/TRIFOLD_CONTENT.md) | Board copy, flow, historical proof and limitations. |
| [`submission/print/one-page-overview.html`](../submission/print/one-page-overview.html) | Letter-size overview print source; separate from app. |
| [`submission/print/pitch-slides.html`](../submission/print/pitch-slides.html) | Eight-slide print source, including references to existing screenshots. |
| [`submission/print/shared.css`](../submission/print/shared.css) | Shared print-only styles; changing it does not restyle the app. |
| [`submission/print/trifold.html`](../submission/print/trifold.html) | 48x36-inch board print source and screenshot crops. |
| [`submission/screenshots/01-landing.png`](../submission/screenshots/01-landing.png) | Historical landing screenshot inspected visually; not a fresh app run. |
| [`submission/screenshots/02-sender-dashboard.png`](../submission/screenshots/02-sender-dashboard.png) | Historical funded/paired Sender screenshot inspected visually. |
| [`submission/screenshots/03-family-allowance.png`](../submission/screenshots/03-family-allowance.png) | Historical phone allowance/pairing screenshot inspected visually. |
| [`submission/screenshots/04-shop-invoice.png`](../submission/screenshots/04-shop-invoice.png) | Historical Shop invoice QR screenshot inspected visually. |
| [`submission/screenshots/05-family-offline-authorization.png`](../submission/screenshots/05-family-offline-authorization.png) | Historical offline Family authorization QR screenshot inspected visually. |
| [`submission/screenshots/06-shop-payment-confirmed.png`](../submission/screenshots/06-shop-payment-confirmed.png) | Historical confirmed Shop receipt screenshot inspected visually. |
| [`tests/e2e/checkout.spec.ts`](../tests/e2e/checkout.spec.ts) | Full LIVE Testnet UI journey plus malformed/access/layout cases; full journey overwrites tracked screenshots. |
| [`tests/e2e/offline.spec.ts`](../tests/e2e/offline.spec.ts) | Non-spending offline signing/validation/reconnect tests; configured IDs required; WebKit offline reload explicitly limited. |

## Documentation added by this review

- [UI_REDESIGN_GUIDE.md](UI_REDESIGN_GUIDE.md): scope, frozen boundaries, screen/component preservation requirements and verification workflow.
- [SYSTEM_MAP.md](SYSTEM_MAP.md): current architecture, API payloads, protocol, storage, payment states, PWA behavior and known caveats.
- [FILE_INVENTORY.md](FILE_INVENTORY.md): this complete review index.

Only existing documentation pointers/logs were updated alongside these new files. The pre-existing root `package-lock.json` modification was left intact. Application files, contracts, protocol, tests, scripts, config, assets and dependency files were not edited by this review.
