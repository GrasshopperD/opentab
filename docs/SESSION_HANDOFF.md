# Session handoff | OpenTab Global

**Last updated:** 2026-11-12, session 4 (browser testing + security hardening). Deadline: **Fri 13 Nov 2026, 08:30 EST**.
History of earlier sessions: `docs/BUILD_LOG.md` (append-only).

## Working right now (verified this session, real Stellar Testnet)

| Area | Evidence |
|---|---|
| FamilyVault `CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW` | `cargo test --locked` 34/34; deployed; many confirmed payments (see `submission/RELEASE_LINKS.md`) |
| Protocol `packages/shared` | `npm test` 13/13; JS/Rust vector shared |
| Web app `apps/web` | `tsc` clean, `next build` OK |
| Browser journey (Playwright, `tests/e2e/checkout.spec.ts`) | 5/5. UI payment tx `e42405a85a595d7a9bc347d1f4fa09b2364a76043984746e6ed9a7f8e98811d4` |
| Live API e2e (`scripts/e2e-api.mts`) | 18/18 |
| Access control / CSRF / limits (`scripts/security-api.mts`) | 18/18 |
| Secrets | none in `.next/static`, rendered HTML, or Git |

## Demo access model

Server env `DEMO_ACCESS_CODE` (≥ 8 chars) + `DEMO_SESSION_SECRET` (≥ 32 chars). `/sender` and `/shop` show an unlock
form; `/`, `/family`, and GET APIs are public. Missing env = all signing endpoints return 503 (fail closed).
Local values are in `apps/web/.env.local` (gitignored). Tests read the code from env `OT_DEMO_CODE`.

## Commands

```powershell
npm install
npm run build; npm run start                  # production server on http://localhost:3000 (needed for SW/offline tests)
npm run dev                                    # development server
cargo test --locked; stellar contract build
npm test
$env:OT_DEMO_CODE = "<code from apps/web/.env.local>"
npm run test:api; npm run test:security; npm run test:e2e
```

If port 3000 is busy, an old `next start` is probably still running: find it with
`Get-NetTCPConnection -LocalPort 3000 -State Listen` and stop that PID.

## Not verified (do not claim)

- Physical iPhone / Android: camera scanning, airplane mode, PWA install, offline reload. Only **emulated** offline in Chromium was tested.
- Vercel deployment, public GitHub, demo video, Devpost.
- Mode B (both offline): not started.

## Manual phone test (the remaining acceptance test)

Requires HTTPS (Vercel URL) for camera and service worker on phones.
1. Laptop: open `<url>/sender`, unlock, create a family (amount 5). Note the family number.
2. Phone (online): open `<url>/family`, enter a name, **Create my key**, enter the family number. Reload once.
   - Android Chrome: menu → *Install app*. iPhone Safari: Share → *Add to Home Screen*. Open from the home screen.
3. Laptop Sender: **Scan pairing code** with the laptop camera (or paste the phone's "Show code as text"). Check the
   fingerprint matches the phone. **Authorize**. Phone: **Refresh balance** shows "this phone is authorized" and 5.00.
4. Laptop: open `<url>/shop`, price `20.00 MXN`, **Show invoice QR**.
5. Phone: turn on **airplane mode** (Wi-Fi off too). Close and reopen the app; confirm it loads.
6. Phone: **Scan shop invoice** (camera). Check shop, MXN 20.00, 1.0857764 OTUSD, "illustrative". **Approve**.
   Expect "Authorized. Awaiting merchant settlement." and an approval QR.
7. Laptop Shop: **Scan customer approval** with the camera, **Submit to Stellar**, expect "Payment confirmed" + explorer link.
8. Laptop Shop: **Replay test** → "Replay blocked". Phone: airplane mode off → Refresh balance shows 3.91.
Record pass/fail per step (and phone model/OS) in `docs/BUILD_LOG.md`.

## Push to GitHub (user action; repo `opentab` already exists, private)

Get the URL: github.com → your `opentab` repo → green **Code** button → copy HTTPS URL. Local branch is **`master`**.
```powershell
git remote add origin <PASTE-URL>
git ls-remote --heads origin           # empty output = empty repo
# If empty:
git push -u origin master:main         # creates 'main' on GitHub from local master
# If the repo already has commits (e.g. a README): do NOT force-push. Tell Claude; it will merge safely.
```
Keep the repo private until you decide to publish; Devpost needs it public by submission time.

## Deploy to Vercel (user action)

See README → "Deploy to Vercel". Root Directory `apps/web`; set all env vars from `.env.example` with real values
(`SENDER_SECRET`/`MERCHANT_*_SECRET` from `stellar keys show <name>`, a new `DEMO_ACCESS_CODE`, a random
`DEMO_SESSION_SECRET`). Never prefix secrets with `NEXT_PUBLIC_`. After deploy, run against it:
`npm run test:security -- https://<url>` style: `node --experimental-strip-types scripts/security-api.mts https://<url>`.

## Next exact task

1. User: push to GitHub, deploy to Vercel, share the URL. 2. Run `security-api.mts` + Playwright against the Vercel URL
(`$env:OT_BASE_URL="https://<url>"`). 3. Manual phone test above. 4. Record video, submit Devpost + one-page overview.
5. After submission: Mode B (OfflineChannel).

**Resume prompt:** "Read docs/SESSION_HANDOFF.md and docs/NEXT_STEPS.md. Continue with the next exact task. Testnet only."
