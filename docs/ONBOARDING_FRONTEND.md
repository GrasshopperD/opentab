# Frontend onboarding: first design pass

**Integration update (branch `feat/product-backend-integration`):** Product Mode is now connected to the working backend; onboarding is no longer preview-only and no email is collected. See [PRODUCT_INTEGRATION.md](PRODUCT_INTEGRATION.md), which supersedes the preview-only statements below.

Implemented locally on branch `feat/frontend-onboarding`, 2026-11-12. This supersedes the prior documentation-only workstream for the new home/onboarding surfaces. Existing payment/backend constraints remain in force.

**Latest revision:** removed the route footer, shop captions, decorative small headings, and login/setup helper copy. Home and regular setup are Family-only (Organizer/Recipient); Merchant setup is reached from Business. A separate 30-day browser cookie remembers only the completed preview role; it does not authenticate an account. Earlier descriptions below are historical iterations.

## Routes

| Route | Purpose |
|---|---|
| `/`, `/home` | New public welcome page, role introductions and sign-in/get-started entry points |
| `/dashboard` | Organizer balance, funding, phone access and recent purchases using existing guarded APIs; see [DASHBOARD_FRONTEND.md](DASHBOARD_FRONTEND.md) |
| `/business` | Separate shop-focused presentation, checkout explanation and merchant setup links |
| `/onboarding` | Family design preview: introduction → Organizer/Recipient → details → preferences → review → completion |
| `/onboarding?mode=signin` | Sign-in design preview; same role/setup exploration without account authentication |
| `/onboarding?role=organizer` | Organizer selection preselected within Family setup |
| `/onboarding?role=recipient` | Recipient selection and visual theme preselected |
| `/onboarding?role=merchant` | Business-only merchant setup: introduction → shop details → checkout preferences → review → completion |
| `/demo` | Existing judge/evidence/preflight page, role links now point into `/demo/*` |
| `/demo/home` | Original public landing page, preserved with its role links updated |
| `/demo/sender` | Re-exports the original Sender component |
| `/demo/family` | Re-exports the original Family component |
| `/demo/shop` | Re-exports the original Shop component |
| `/sender`, `/family`, `/shop` | Original compatibility routes remain available, including `/family` for the existing PWA start/offline shell |

The entire old demo is accessible under `/demo`; the new experience does not replace or invoke its payment handlers. The shared shell chooses the old demo layout for the demo/compatibility routes and the new visual canvas for home/onboarding.

## Intentional frontend boundary

- Sign-up/sign-in remain **frontend previews**; completion identifies the selected role as a preview. No authentication API calls, email sending, OTP, password collection, account creation or verified sign-in occurs.
- All entered profile/setup fields live only in React memory. They are not sent to a server, placed in URLs, saved to localStorage/sessionStorage or transferred into the working demo. After completion, reload restores a generic role preview from a separate cookie, without restoring personal fields.
- `opentab_family_preview` / `opentab_business_preview` store only an allowlisted role for 30 days, with Path=/, SameSite=Lax and Secure on HTTPS. They are independent of the existing HttpOnly demo authentication cookie, never authorize server requests, and are deleted by “Forget this preview” / “Start over.” Family and Business memories are isolated.
- Organizer: family space name, country and a personal support preference. No deposit, category enforcement or family contract creation.
- Recipient: display name, country and optional family number. The number is labeled not linked; no device key is created or registered by this flow.
- Merchant: business name, country, local pricing currency and counter name. These do not register a merchant, configure settlement or enable bank payouts.
- Completion screens introduce each role's feel and link to the corresponding existing demo. The demo retains its existing configuration/access requirements; this change does not fix or bypass “Interactive demo is disabled.”
- No new external fonts, asset calls, packages, database, endpoints, wallet logic or signing logic. The orbit/logo/icon illustrations are local SVG/CSS.
- The production offline shell and manifest retain their existing purpose. A follow-up runtime fix retires the app worker/code caches during development and excludes mutable dev chunks/HMR from caching; cache version is now `opentab-v3`. It never clears localStorage or pending checkout data. New onboarding is an online frontend preview; its offline availability is not promised. The original `/family` route remains the established offline-shell target.

## Design direction and source references

Reviewed [Stellar](https://stellar.org/) live in a desktop browser: spacious layout, restrained black/white palette, large editorial type and bright accent CTAs. [Axiom](https://axiom.trade/) live browsing encountered Cloudflare verification; public screenshot search results were used only as general context for the simple dark account-entry pattern, not as proof of its exact current design. No verification challenge was bypassed, reference-site accounts created, or third-party assets copied into the app.

The new home uses charcoal, warm white, yellow accents and an original connection/orbit illustration. Setup pairs a quiet editorial side panel with one focused form. Organizer, Recipient and Merchant use yellow, blue and peach accents respectively. Phone layouts prioritize the form and hide the decorative side panel.

### Current design update: simpler entry and readable setup

The owner requested a simpler Axiom-style opening and much less visual clutter for older users. The current home now uses a centered sans-serif headline, blue accent, short description and one primary Get started action. The former “See it in action” action is removed. `home-landing.tsx` and `home.css` provide a local particle globe, scroll-linked layered backdrop and progress indicator, desktop sticky three-scene walkthrough, keyboard-accessible role tabs, FAQ disclosures and reveal transitions. Reduced-motion preferences disable decorative movement. Phone layouts use a normal reading flow instead of pinning a large preview over the text. All walkthroughs are illustrative UI, with no network/payment actions.

Setup now has a single centered form with plain headings, 18px inputs, larger labels and 60px primary actions. The decorative sidebar, slogans, uppercase progress codes, preview badges and bottom footer links are removed. A brief readable notice retains the preview-only boundary. Role selection, back navigation, native validation, review and local-only state remain unchanged. The initial account actions are simply labeled Continue; sign-in/sign-up switching appears once below the form.

`tests/e2e/home.spec.ts` covers the simple hero, absence of the removed action, setup readability, scroll-driven walkthrough, role tab mouse/keyboard behavior, FAQ and reduced motion. Existing onboarding/cache tests retain their behavioral assertions with updated plain-language labels. Current source changes are restricted to the new frontend and related tests/docs; backend, payment, dependency and offline-cache implementation files are unchanged in this design update.

## Implementation map

- `apps/web/app/experience/design.tsx`: presentational brand, SVG icons, arrow and orbit art.
- `apps/web/app/experience/experience.css`: scoped new styles; existing `globals.css` untouched.
- `apps/web/app/experience/app-shell.tsx`: pathname-based presentation shell; demo navigation aliases.
- `apps/web/app/experience/onboarding.tsx`: local-only setup state, role-specific forms, native input validation, back/review/completion and focus management.
- `apps/web/app/onboarding/page.tsx`: Suspense boundary for query-param selection.
- `apps/web/app/page.tsx`, `home/page.tsx`: new welcome page and alias.
- `apps/web/app/demo/{home,sender,family,shop}/page.tsx`: old landing and aliases.
- `apps/web/app/layout.tsx`: retains metadata, viewport and service-worker registration; mounts the presentation shell and scoped CSS.
- `tests/e2e/onboarding.spec.ts`: non-transacting flow, privacy, navigation, validation, route and responsive checks.
- `tests/e2e/checkout.spec.ts`: original live journey now opens `/demo/home` for its first landing assertion. Its financial/offline/replay assertions remain intact.

## Verification

- TypeScript typecheck passed.
- `npm test`: 13/13 protocol tests passed.
- Production build passed in `/tmp/opentab-onboarding-build`, using a source copy and the existing installed dependencies; no secrets were copied. This avoided overwriting `.next` for the user's already-running dev server.
- New Playwright suite: 11/11 checks passed against development and production servers. Checks cover all three full setup paths, back navigation, email validation, sign-in switching, preview reset on reload, no onboarding API requests/POSTs, no saved account details, demo aliases, and 320/375/390/430/768/1440 entry layouts. Detail/preference/review/completion screens also checked at 320/390/768/1440.
- Visually reviewed desktop and phone screenshots. No real account login, Testnet spend, contract deployment, live-chain verification or physical-device camera/PWA test was performed.
- Compared SHA-256 fingerprints for 63 protected source/config files against the start-of-turn baseline: unchanged. This includes every API/server helper, contracts, shared protocol, original Sender/Family/Shop pages, shared payment components, offline worker, manifest, configuration and dependencies. Existing root lockfile changes were preserved.

## Continue from here

### Warm palette, Business page and country journey

- `experience/site-header.tsx` provides Home/Business navigation on desktop and phone. `business/page.tsx` and `business.css` introduce merchants with an original pixel-style shop illustration, checkout steps and links to the existing setup/demo. There is no merchant registration or settlement change.
- `experience/country-journey.tsx` and `journey.css` replace the particle globe with a pinned, scroll-driven trip from Toronto, Canada, to Oaxaca, Mexico. The yellow coin follows an SVG curve; its trail and copy advance with scroll and reverse when scrolling back. Reduced-motion mode keeps the route illustration static. The route is labeled illustrative/Testnet, with no real-money transfer or bank payout implied.
- `experience/country-map.ts` contains pixel silhouettes derived from [Natural Earth 110m country boundaries](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson), public-domain map data. It is bundled locally and performs no geolocation or runtime map requests.
- `public/stellar-symbol.svg` uses the two unchanged symbol paths extracted from the black RGB SDF SVG in the [official Stellar brand resource hub](https://stellar.org/brand-resources) [logo-pack archive](https://cdn.sanity.io/files/e2r40yh6/production-i18n/9ef5ab890833c2571489b41a23a0ffc29307300c.zip). Only the viewBox was fitted around the symbol, with padding. It is presented as the network symbol on a decorative coin, not as the demo settlement asset or a claim of sponsorship.
- `tests/e2e/business-journey.spec.ts` checks restored button styling, Home/Business navigation, merchant links, actual scroll movement/endpoints, no API/POST activity, reduced motion, and layouts at 320/390/768/1440px. Browser scroll rounding is compared with a small numeric tolerance, not exact fractional strings.
- Existing APIs, server helpers, contracts, shared protocol, payment pages, onboarding and offline-cache implementation files remain unchanged in this revision. No new dependency or runtime third-party request was added.

### Follow-up: returning-browser runtime crash

An existing browser reported Webpack `originalFactory is undefined` at the new layout. The previous worker also cached mutable Next development chunks, including unversioned `app/layout.js`, allowing a stale bundle to mix with the current runtime. The fix in `sw-register.tsx` unregisters only this app's worker and deletes only `opentab-*` code caches in development; an already controlled tab gets one reload to detach it. `public/sw.js` now skips mutable/unhashed dev chunks and HMR in fetch/precache paths, while hashed production chunks remain cacheable. Keys, local history and pending checkout storage are not cleared.

Verification: typecheck and isolated production build passed; a new opt-in `tests/e2e/dev-cache.spec.ts` installs a worker plus a poisoned legacy layout cache, verifies recovery without runtime errors, verifies stored key/checkout sentinels survive, and navigates/reloads onboarding. The regression passed. Production Chromium browser suite passed 13/13 (11 onboarding + two existing offline tests), including signing, offline reload and reconnect. No backend/payment source changes or transactions.

Review the new home and all three setup paths locally. Subsequent dashboard design can reuse this visual language while preserving the existing payment callbacks and state semantics. Implementing real sign-up/sign-in or connecting these profile fields to backend state would be a separate scope change; this pass does neither. No commits, pushes or deployments were made.

### Opening-hero journey and storefront refinement

- The welcome headline and country map now share one pinned opening stage. Canada and the Stellar coin are visible on arrival; the first scroll moves the coin and fades the welcome into the route heading. Scrolling back restores the entry. Reduced-motion mode retains the static welcome and route.
- Shared header navigation uses equal-width side columns, independently centering Home/Business links between the logo and account actions. Phone navigation occupies its own centered row.
- The Business illustration now has a balanced facade, striped/scalloped awning, framed shop sign, display window, glass entrance, steps and plants. This is local SVG presentation only.
- Isolated production build passed. Browser checks: 22/22 passed, including first-scroll coin movement, independently centered navigation on both pages, responsive layouts, reduced motion and existing onboarding/demo access. Typecheck passed. Desktop/phone screenshots reviewed.
- SHA-256 comparison against this pass's baseline found only four frontend presentation files and two frontend browser tests changed before documentation updates; the other 132 baseline files were unchanged, including backend/payment/offline/config/dependency files.

### Minimal-copy and remembered-role verification

Final browser suite: 22/22 passed, including role cookie persistence after reload, forgetting/resetting, separation between Family and Business, no personal details in browser storage/cookies and no account/payment API calls. Typecheck and isolated production build passed. Desktop/phone login, home, shop and returning-preview screenshots reviewed. Before documentation updates, 130 baseline files were byte-identical; only five presentation files and three browser tests changed.

### Organizer dashboard handoff

Organizer completion now links to `/dashboard`. This page consumes the existing funding, family, phone and authentication endpoints with the existing payloads. Onboarding itself still creates no account and sends no API request. Recipient and Merchant completion links remain unchanged. Browser/app branding is now OpenTab with the yellow mark on charcoal. Details and verification: [DASHBOARD_FRONTEND.md](DASHBOARD_FRONTEND.md).
