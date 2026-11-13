# OpenTab organizer dashboard

The first organizer dashboard lives at `/dashboard`, on `feat/frontend-onboarding`. The completed organizer onboarding preview now links to it. Recipient and merchant workflows continue to use their existing demo screens.

The interface follows the existing charcoal, warm yellow, muted olive and cream design. Desktop navigation becomes a four-item row on phones. It uses everyday language: Add money, Family, phone connection and Purchases. It labels amounts **Demo USD**. Decorative subtitles/top bar and repeated demo disclaimers are removed; functional demo access is in the sidebar. This backend has no real fiat transfers or bank payouts.

## Existing backend connections

No API, server helper, contract, protocol, payment component or original Sender/Family/Shop implementation was modified.

| Screen/action | Existing request |
| --- | --- |
| Check demo access | `GET /api/auth/status` |
| Unlock / sign out | `POST /api/auth/login` with `{code}` / `POST /api/auth/logout` with `{}` |
| Family balance / purchases | `GET /api/family/{familyId}`; optional `?key={publicKey}` for phone access |
| Create and fund a family | `POST /api/sender/family` with `{amount}` |
| Add to an existing family | `POST /api/sender/deposit` with `{familyId, amount}` |
| Connect / remove phone access | `POST /api/sender/key` with `{familyId, publicKey, action}`; action `register` / `revoke` |
| Reconcile a request | `GET /api/tx/{hash}`; never resubmits |

The new page reuses the existing `api` fetch helper, pairing-code parser, fingerprint generation, amount parsing/formatting, merchant configuration, explorer configuration and QR Scanner. It sends the same body shapes and original unit amounts. There is no conversion into local currency, fee calculation, withdrawal action, direct recipient transfer or change in settlement behavior.

## Interaction and state

- Overview shows real returned balances and recent confirmed purchases. An unknown balance displays a dash. Refreshing clears the old balance; read errors cannot leave a stale balance presented as current. The backend's purchase event window is bounded, so Activity describes recent purchases rather than claiming complete account history.
- Funding is two steps: amount/destination, then explicit review/confirmation. Family selection stays above the card. The two steps share a stable card height with short fade/slide transitions; reduced motion disables animation. Review shows the amount and destination only, and confirmation is disabled for two seconds on each entry. The handler also checks the delay before sending; back/edit or destination changes restart it. Amount validation uses the shared parser and existing server limit (greater than zero, maximum 50, at most seven decimal places). A synchronous ref blocks duplicate submissions from rapid clicks.
- Existing saved family IDs use the same `opentab.sender.families` localStorage key as Sender. Manually entered IDs are restricted to the existing 1–12 digit format. This is browser convenience, not proof of ownership.
- An in-flight marker in `sessionStorage["opentab.dashboard.pending"]` is written before mutation. It stores operation type, family ID, amount and a response hash when available. Returning or reloading does not resubmit. Pending/unknown results and unavailable responses block another mutation; a hash allows a read-only status check. A confirmed create-family transaction without a returned family ID does not count as confirmed funding. Failed status clears the marker and displays failure. No request is automatically retried.
- Create-and-fund is a multi-step existing endpoint. If its response is lost, this frontend cannot recover the newly created family ID from that response. It preserves an unresolved state and links to the original demo for investigation. The journal is per browser tab/session; it does not provide global idempotency across browsers/devices or alter backend guarantees.
- Phone access shows the same public-key fingerprint as the recipient screen, requires a confirmation step, and never receives or creates the recipient's private key. The backend does not expose an enumerable phone directory; the page displays the currently scanned phone only.
- Demo access uses the existing HttpOnly session cookie and code-based login. The onboarding role cookie never grants access to funding. Email onboarding remains an unverified design preview. No access code or credential is persisted by the dashboard.

## Branding

Browser metadata title and installed-app name are **OpenTab**. SVG/192px/512px icons use the existing yellow OpenTab mark on charcoal. Icon/manifest URLs have a branding query version so an old browser favicon cache does not retain the teal mark. The PWA start URL, scope and offline worker behavior remain unchanged.

## Verification

Browser checks use mocked API responses; no funds were moved and no real Testnet transaction was submitted. They cover exact mutation payloads, review, double clicks, creation, pending/reload reconciliation, partial creation, validation, unavailable responses, failed confirmations, access login/logout, phone pairing, recent purchases, read-error clearing, responsive widths and the existing home/onboarding/demo routes. Desktop and phone screenshots were inspected. See BUILD_LOG for observed final results.

Final checks: TypeScript and isolated production build passed. Production browser checks: 36 passed in the full run; the remaining pending/reload test passed after its response-readiness wait was corrected (1/1 targeted rerun). The complete set of 37 scenarios is covered. SHA-256 comparison verified 36 protected backend/payment/offline/lock files unchanged.

Latest polish verification: 16/16 dashboard browser checks passed (mocked API responses), including the two-second delay on first review and re-entry, no early request, top destination placement, existing request bodies/duplicate guards, pending/error handling and 320/390/768/1440px layouts. Typecheck and isolated production build passed. Desktop/phone screenshots reviewed. Before documentation, only dashboard.tsx, dashboard.css and dashboard.spec.ts changed; the other 140 baseline files were unchanged.
