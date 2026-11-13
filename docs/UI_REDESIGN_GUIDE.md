# UI redesign guide: preserve the working system

**Implementation update:** the first frontend onboarding pass is now documented in [ONBOARDING_FRONTEND.md](ONBOARDING_FRONTEND.md). New `/` and `/home` experiences coexist with the original demo at `/demo/*`; compatibility routes and backend/payment implementations remain unchanged. The documentation-only descriptions below record the earlier review baseline.

Reviewed against repository source on 2026-11-12. This is the entry point for the upcoming visual redesign. Read [SYSTEM_MAP.md](SYSTEM_MAP.md) for implementation contracts and [FILE_INVENTORY.md](FILE_INVENTORY.md) for the complete tracked-file map.

## Scope agreed with the owner

The intended work is a complete visual redesign of the existing frontend. **Existing backend logic must not change.** This review adds documentation only; it does not start the redesign, deploy anything, or submit transactions.

Treat the existing frontend's business behavior as frozen too. Moving a payment handler, changing an effect dependency, remounting a scanner, or replacing a stored checkout object can break the product even when no server file changes. A file being `.tsx` does not make all of its contents presentation code.

## Change boundary

| Area | Treatment during a visual redesign |
|---|---|
| `apps/web/app/globals.css` | Primary styling surface: typography, palette, spacing, responsive layout, focus states, visual hierarchy. Preserve visibility of essential states and usable QR dimensions. |
| JSX in `app/page.tsx`, `demo/page.tsx`, `sender/page.tsx`, `family/page.tsx`, `shop/page.tsx` | Restyle and rearrange presentation while keeping existing values, conditions, callbacks, disabled states and routes connected. |
| `app/layout.tsx` | Restyle the shell/navigation; retain children, PWA registration, metadata/manifest wiring, viewport behavior and Testnet disclosure. |
| `app/components.tsx`, `demo/preflight.tsx` | Mixed presentation and behavior. Keep API helper, auth flow, camera lifecycle, QR generation, checks, callbacks and effects intact; edit markup/styles only. |
| New presentational components or local visual assets | May receive existing data and callbacks. They should not add API requests, signing, persistence, timers or automatic payment actions. Avoid unrelated dependencies. |
| `apps/web/app/api/**`, `apps/web/lib/**` | Frozen for this redesign, including public config, evidence, server helpers and all route handlers. |
| `packages/shared/**`, `contracts/**`, `archive/**` | Frozen. This includes parsing, serialization, cryptography, integer math, fixtures, tests and contract state. |
| `sw-register.tsx`, `public/sw.js`, `public/manifest.webmanifest`, `next.config.ts` | Preserve offline/PWA behavior and route names. Any necessary cache or manifest change is a separate functional change to identify explicitly, not a styling cleanup. |
| Package manifests, lockfiles, TypeScript/Playwright/Cargo config, environment values, scripts | Preserve. No framework upgrade, dependency refresh, replacement backend, contract redeploy or test relaxation as part of the redesign. |

A visual requirement that cannot work with the existing data/actions should be recorded as a future feature. Do not invent a backend response or silently implement a new capability to make a mockup work.

## What the product actually does

OpenTab Global is one Next.js PWA with three roles. The Sender deposits Testnet tokens into a family vault and authorizes a phone's public key. The Family phone reviews an invoice and signs it locally, including while offline. The connected Shop submits that approval and waits for chain settlement.

The current asset is **OpenTab Demo USD (OTUSD)** with seven decimals, no monetary value, and no redemption. Currency selection is local pricing using illustrative rates. There are no fiat deposits, bank payouts, live FX, email invitations, production wallets, category limits, recovery, or integrated both-offline payments.

## Screen-by-screen preservation requirements

### Shared shell and navigation

- Keep `/`, `/demo`, `/sender`, `/family`, `/shop` reachable. Older planning paths `/recipient` and `/merchant` do not exist.
- Keep the visible Testnet/demo-token disclosure. Design can improve its placement and readability without changing its meaning.
- Keep the family screen usable on a narrow phone and the Shop on a phone or laptop. Existing layout tests cover 320, 375, 390, 430, 768 and 1440 px.
- Avoid loading critical fonts, icons or signing-screen assets from an external origin: the current offline cache only captures same-origin resources.

### Home `/`

Existing responsibilities: product introduction, three role entry points, purchase explanation, prototype limitations, configured-contract explorer link and a missing-configuration notice.

Safe design opportunities: stronger visual identity, better hierarchy, more intentional role navigation and less repetitive explanatory content. Preserve honest claims and the missing-configuration state; never replace it with example balances presented as live.

### Demo `/demo`

Existing responsibilities: five-step payment explanation, role links, offline authorization explanation, Mode A versus Mode B status, contract/asset/merchant identities, recorded evidence links and read-only preflight checks.

Preserve public and operator-only check separation, loading/checking/result states, last-check time and rerun action. Recorded transaction evidence is historical evidence, not a new payment from the current session. Keep Mode B marked in development.

### Sender `/sender`

Existing responsibilities:

1. Unlock demo operator access; retain enabled, disabled, authorized and bad-code states and sign-out.
2. Select a locally remembered family or manually enter a number.
3. Create a family and fund it, or top up the selected family. Input is a decimal token amount, positive and at most 50 OTUSD per action.
4. Show the family number prominently so the recipient can type it.
5. Show actual balance and deposited/paid/withdrawn totals, with refresh.
6. Scan or paste a public-key pairing code; display device label and fingerprint; register or revoke that key for the selected family.
7. Show recent confirmed on-chain purchases and explorer links.

Preserve `once()` and its synchronous ref lock around all mutations; `busy` state alone does not prevent two rapid invocations. Retain action-specific feedback and transaction links. Create-and-fund is **two chain transactions**; a family can be created while its deposit remains pending or fails. Keep `depositStatus` handling distinct from family creation.

Do not add a working withdrawal button merely because `total_withdrawn` exists: the contract supports withdrawal but the web API does not expose it. The family list is browser-local convenience, not an account membership database.

### Family `/family`

Existing responsibilities:

1. Initial setup: optional name and local key creation.
2. Family number entry and public-key pairing QR/fingerprint.
3. Last-read balance and key-active status, plus refresh and online/offline indicator.
4. Scan/paste invoice; reject a different vault or token.
5. Review shop display name **and address**, local amount/currency, exact seven-decimal token charge, rate/source, expiry and terminal.
6. Explicit approve or decline. Approval calls `signInvoice()` locally; no API request is needed.
7. Display signed approval QR and text/copy fallbacks, with “Authorized. Awaiting merchant settlement.” meaning.
8. Show local approval history, later mark entries settled after online invoice checks.
9. Retain explicit key-deletion confirmation and no-recovery explanation.

Preserve offline approval even when the last-read balance or authorization status cannot be fetched. The chain decides whether a signed purchase can settle. Do not require a fresh API response, online login or a new onboarding endpoint before signing.

Do not equate a generated QR with a paid purchase. `Done` clears the current in-memory invoice/QR only; it does not submit, cancel or reverse payment. The approval QR itself is not restored after reload, while the key and history are persisted. Do not promise QR recovery that the current code does not implement.

Balance and key-active data live in React memory and are not persisted to localStorage. They can remain visible after going offline within the same page session; after a fully offline reload they may be unavailable. Preserve that distinction in copy.

### Shop `/shop`

Existing responsibilities:

1. Operator access, shop A/B selection, terminal entry and actual token settlement balance.
2. Local currency/price input and deterministic exact-token preview.
3. Create and save a unique invoice QR with a 15-minute expiry.
4. Scan/paste approval, match invoice/amount/merchant and verify signature locally.
5. Explicit submission to Stellar with a synchronous double-submit lock.
6. Distinct authorized, submitting, pending/unknown, confirmed, failed and expired presentations.
7. Status reconciliation, explorer link when a hash exists, persisted checkout recovery and recent chain settlements.
8. Replay demonstration after confirmation and explicit new-sale action.

Keep shop and terminal inputs disabled while a current invoice exists. Receipt details must come from the saved invoice, not editable defaults. Keep `Current` serialization intact, including the original invoice and authorization strings.

Only `CONFIRMED` may display the paid/success treatment or permission to release goods. `AUTHORIZED_LOCALLY` means signature checked; it does not mean sufficient funds or settled tokens. `PENDING` and `UNKNOWN` must remain visible and reconcilable. An error banner or elapsed timer is not proof that the chain rejected a payment.

The existing `New sale` action clears local checkout even during unresolved states. This review records that behavior; it does not fix it. Do not make clearing automatic or disguise it as confirmation. See the caveats in [SYSTEM_MAP.md](SYSTEM_MAP.md).

## Shared UI capabilities that must survive

| Component | Behavior to retain |
|---|---|
| `QR` | Local QR generation, descriptive alt text, copy fallback, text reveal/select and `data-testid="qr-text"`. Keep black/white contrast, quiet zone and scan size; do not decorate over the encoded area. |
| `Scanner` | Rear-camera preference, inline video, start/stop, track cleanup on effect teardown, readable camera errors and paste fallback. Preserve stable callback identities where currently provided. |
| `TxLink` | Testnet explorer URL built from actual hash. Missing hash means no fabricated receipt link. |
| `Online` | Browser online/offline events. Indicator is connectivity information, not proof that RPC or settlement works. |
| `DemoAccess` | HttpOnly-cookie login/status/logout. It displays access status; server guards enforce it. Buttons currently remain rendered while locked. |
| `api` | Same-origin credentials, JSON headers, JSON body handling and error objects for network/non-JSON responses. It does not throw ordinary network failures. |
| `Preflight` | Existing read-only checks and per-check pass/fail details. No funding or deployment from a health-check button. |

## Design approach for the later implementation

Start with the shell, typography, spacing, colors and static home/demo presentation. Then restyle one role at a time around its existing handlers. Keep effects, refs, state definitions, protocol imports, payloads and persistence code unchanged. Avoid a controller/hook refactor bundled with the visual work.

Use layout and hierarchy to make each role's primary task obvious: family funding/pairing, recipient review/approval, merchant invoice/settlement. Critical amounts and state labels need readable text as well as color. Preserve keyboard access, meaningful labels, disabled states, visible focus and screen-reader status feedback.

Keep every current action reachable. Secondary information can be visually quieter, but hiding a control must not unmount active payment state or stop reconciliation. Do not add automatic approve/submit-on-scan behavior, optimistic balance debits or success animations that start before confirmation.

## Verification for the redesign

This review ran `npm test`: **13/13 protocol tests passed**. It did not run the app, live API checks, contract tests, browser journeys, device tests or current Testnet verification. Existing build logs describe earlier results; those are historical.

For a future implementation, verify the following without changing backend behavior:

- Review the diff against the redesign's own starting point. Backend, protocol, contracts, config, dependency files, scripts and archive should be unchanged. Preserve any unrelated owner modifications.
- Run `npm test`, `npm run typecheck -w apps/web`, and `npm run build` after UI implementation. Inspect generated tracked files rather than accepting incidental changes.
- Run existing offline/browser checks against an already-running production server. Offline tests need configured public IDs; the existing full browser suite also includes a real Testnet payment and requires `OT_DEMO_CODE` plus server configuration.
- Preserve existing assertions when adjusting selectors for redesigned markup. Existing tests rely on text, adjacent labels/inputs, `.fp`, `.big`, `.status.bad`, `.success a.txlink`, QR ordering and `qr-text`. Selector maintenance must not remove replay, exact-balance, offline or confirmation assertions.
- Check every role at the six existing viewport widths, including expanded paste inputs, QR views, long identifiers, access forms, errors, pending and confirmed states.
- Check camera-denied/paste paths, cold setup, remembered key/family, offline signing, offline reload and reconnect. Test physical iPhone/Android camera and installation separately; emulation does not establish these.
- When running the configured real Testnet journey, verify actual family/merchant balance differences, double-click behavior, replay rejection and event history. API e2e and full checkout tests mutate Testnet and some overwrite tracked screenshots; do not run them as a casual documentation check.
- Add targeted browser coverage for pending/unknown/reload behavior if changing its presentation. The current suite does not comprehensively automate those failure paths.

Do not claim that unchanged server code alone proves an unchanged payment experience. Both source diff review and behavior checks matter.
