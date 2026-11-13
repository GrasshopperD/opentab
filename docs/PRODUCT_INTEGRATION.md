# Product Mode: backend integration

Branch `feat/product-backend-integration` (from `main` at `ca9dece`). Imports Alex's Product UI from branch `UI`
(commit `37aec9b`, "Preserve Product UI before integration with current main") selectively, and connects it to the
existing working backend. Testnet only; OTUSD demo token. Not deployed to production.

## One application, one backend

| Layer | Shared by Demo Mode and Product Mode |
|---|---|
| API routes | unchanged: `/api/auth/*`, `/api/family/{id}`, `/api/sender/{family,deposit,key}`, `/api/merchant/{id,pay}`, `/api/tx/{hash}`, `/api/invoice` |
| Browser request shapes | `app/opentab-api.ts` (typed wrappers; Demo `/sender` and Product `/dashboard` both use it) |
| Sender browser state | `app/sender/sender-store.ts` (`opentab.sender.families`, selected family, phones paired from this browser) |
| Family Wallet | `app/family/use-family-wallet.ts`: device key, pairing code, Stellar authorization check, offline signing, local approval history. Used by Demo `/family` and Product `/wallet`. Same localStorage keys, so switching screens never creates a second wallet. |
| Merchant checkout | `app/shop/use-checkout.ts` + `lib/checkout.ts`: invoice, exact approval verification, `/api/merchant/pay`, PENDING/UNKNOWN reconciliation, receipts only after CONFIRMED, CSV. Used by Demo `/shop` and Product `/business/checkout`. Same localStorage keys, so a sale is the same sale on either screen. |
| Contract, token, protocol, signing keys, server guards | untouched |

The Demo pages were refactored only by moving their logic, unchanged, into those hooks; their markup is unchanged.

## Routes

| Product Mode | Demo Mode (unchanged behavior) |
|---|---|
| `/` and `/home` (welcome), `/business` | `/demo`, `/demo/home` (original landing) |
| `/onboarding` (role setup, real) | `/sender` = `/demo/sender` |
| `/dashboard` (organizer) | `/family` = `/demo/family` |
| `/wallet` (recipient Family Wallet, new) | `/shop` = `/demo/shop` |
| `/business/checkout` (merchant, new) | `/join` (invitations unavailable unless `INVITES_ENABLED=1` locally) |

The PWA start URL stays `/family`; the service worker shell now also caches `/wallet` (cache `opentab-v3`, Alex's
dev-cache fix included; production chunks are content-hashed and navigations are network-first, so a deployed invoice
parser change is picked up on the next online open).

## Onboarding: what is real now

No email, password or personal account is collected (Alex's email/sign-up fields were removed; there is no account backend).
- Organizer: role → demo access code (existing `/api/auth/login`, HttpOnly session) → dashboard.
- Recipient: display name → family number → this phone's signing key, created only if none exists (never replaced) → `/wallet` for pairing. Completing setup is not authorization: the wallet opens only after Stellar reports the key active.
- Merchant: demo access code → choose one of the two real demo shop identities and a terminal number (stored as `opentab.shop.settings`, used by both checkouts).
- "Sign in" = the demo access code. The remembered-role cookie is a display preference only.

## Button audit (Product Mode)

| Page | Button / action | What it does | Backend | Real data | Notes |
|---|---|---|---|---|---|
| Home | Get started / role CTAs | opens `/onboarding` (with role) | none | n/a | navigation |
| Home | Sign in | `/onboarding?mode=signin` → demo access code | `/api/auth/login` | yes | no personal accounts |
| Business | Set up your shop / Open checkout | merchant onboarding / checkout | as below | yes | |
| Onboarding | Unlock | demo session | `/api/auth/login` | yes | rate-limited 10/10 min |
| Onboarding | Create my key / Save and continue | create key only if missing; save name + family no. | none (local) | yes | private key never leaves browser |
| Onboarding | Finish setup (merchant) | shop identity + terminal | none (local) | yes | |
| Dashboard | Family #… switch | choose saved/entered family; #7 preselected | `/api/family/{id}` | yes | nothing auto-created |
| Dashboard | Refresh balance | live read | `/api/family/{id}` | yes | dash when unavailable |
| Dashboard | Add money → Continue → Confirm and add | review (2 s), then deposit; success only on CONFIRMED; balance re-read | `/api/sender/deposit` | yes | max 50; duplicate guard; pending survives reload |
| Dashboard | Start a new family → Create family and add funds | create + required starting deposit, shows new family number | `/api/sender/family` | yes | only when explicitly chosen |
| Dashboard | Check status | read-only reconciliation | `/api/tx/{hash}` | yes | never resubmits |
| Dashboard | Scan phone code / Paste | parse public pairing code, show security code | none | yes | |
| Dashboard | Connect phone → (code matches ✓) → Confirm connection | register_key; Connected only when re-read says active | `/api/sender/key`, `/api/family/{id}?key=` | yes | multiple phones per family |
| Dashboard | Remove access → Confirm removal | revoke_key | `/api/sender/key` | yes | also from "Phones you connected from this browser" |
| Dashboard | Demo access / Sign out | session | `/api/auth/*` | yes | |
| Wallet | Create my key | device key | none (local) | yes | |
| Wallet | Family number / Check again | authorization check, auto every 5 s | `/api/family/{id}?key=` | yes | |
| Wallet | Scan to Pay → scan/paste → Approve payment | local parse + validation + Ed25519 signing, signed QR | none (offline) | yes | "Payment authorized", never "paid" |
| Wallet | Refresh balance | live read or labeled last-synced | `/api/family/{id}?key=` | yes | offline wording kept |
| Wallet | Device: Replace / Delete key | as Demo `/family` | none (local) | yes | confirm prompts |
| Checkout | + / − per product | cart (Milk $3, Bread $2, Water $1, Apples $4) | none | yes | items enter the signed quote hash |
| Checkout | Generate invoice QR | invoice with merchant, terminal, 15-min expiry | none | yes | |
| Checkout | Scan customer approval | signature + exact-invoice check (outdated app / mismatch rejected) | none | yes | |
| Checkout | Submit to Stellar | settlement; PENDING/UNKNOWN reconciled | `/api/merchant/pay`, `/api/tx`, `/api/invoice` | yes | receipt only after CONFIRMED |
| Checkout | Export CSV / Clear log | local receipt log | none | yes | not durable accounting |
| Checkout | Settings: shop / counter, Lock checkout | identity + terminal; sign out | `/api/auth/logout` | yes | |

Preview-only / not available (labeled in the UI): no personal accounts or email sign-in; invitation links (disabled on
Vercel, unchanged); bank payouts; live FX (rates are labeled illustrative); spending categories.

## Remaining limitations

- Product checkout is catalog-only (custom local-currency amounts remain in Demo `/shop`).
- The Demo/Product header switch is not implemented yet (next step). Demo `/sender` still always opens Family #7; Product `/dashboard` remembers the last family opened (`opentab.sender.selected`).
- The "phones you connected" list is local to the browser that authorized them; status is always read from Stellar.
- No physical-phone test of the new screens yet (camera, installed PWA, airplane mode on a real iPhone/Android).
