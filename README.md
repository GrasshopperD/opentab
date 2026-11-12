# OpenTab Global | Stellar Blockchain Innovation Challenge

**Status: IMPLEMENTATION IN PROGRESS, NOT YET A WORKING APPLICATION.** No contract is deployed and no payment has been made yet; verified evidence is listed only in `submission/RELEASE_LINKS.md`.

This repository layout was assembled from the user's OpenTab source and planning pack on November 12, 2026. The active app/contract folders are **placeholders** being implemented per `docs/IMPLEMENTATION_PLAN.md`. The original, unaudited, not-deployed Soroban and ticket scripts are kept in `archive/legacy_opentab_starter/` and must not be mistaken for a deployed product.

## Mission

Build a Stellar Testnet prototype of family-funded merchant spending. **Mode A** (customer offline, merchant online) comes first. **Mode B** (merchant-specific prepaid channel with both sides offline) comes second. Client-side phone UI will be an installable Next.js PWA hosted on Vercel. Fiat payouts with BVNK / Conduit / MoneyGram are **not live** without separate commercial access.

## Start here (Claude Code)

1. Read `CLAUDE.md` and `docs/CLAUDE_PLANNING_HANDOFF.md` in full.
2. Review `archive/legacy_opentab_starter` as untrusted, unaudited reference source.
3. Read `docs/DECISIONS.md` and `docs/BUILD_AND_HOSTING.md`.
4. Follow the approved plan in `docs/IMPLEMENTATION_PLAN.md` milestone by milestone; the current task is in `docs/NEXT_STEPS.md`.
5. After approval, develop inside this workspace, keep feature gates explicit, and record every genuine Testnet contract ID, transaction and URL in `submission/RELEASE_LINKS.md`.

## Proposed repository layout

```text
opentab-global/
  CLAUDE.md                          Claude Code instructions
  apps/web/                          Next.js App Router + PWA (NOT IMPLEMENTED)
  contracts/family_vault/            Connected-mode Soroban contract (NOT IMPLEMENTED)
  contracts/offline_channel/         Offline-mode Soroban contract (NOT IMPLEMENTED)
  packages/stellar/                  RPC, signing, transaction helpers (NOT IMPLEMENTED)
  packages/shared/                   Types, validation (NOT IMPLEMENTED)
  tests/e2e/                         Device/payment scenarios (NOT IMPLEMENTED)
  archive/legacy_opentab_starter/    Original user-provided unmodified prototype
  docs/                              Architecture, setup, official links, handoff
  submission/                        One-pager, Devpost, demo, release checklist
  references/                        Organizer/source materials
```

## Practical deployment target

- Web: Vercel (`apps/web` root directory, once app exists)
- Mobile: same site installed on iOS and Android home screens as a PWA, served over HTTPS
- Chain: Stellar **Testnet**, with explicitly nonredeemable test tokens
- Backend/database: choose during planning (Supabase PostgreSQL is a candidate)
- Source repository: public GitHub repo with source and accurate setup instructions

The `apps/web/` directory has no functional project yet. Running `npm run dev` before Claude implements the application is **not** expected to work.

## Non-negotiable

Do not commit wallet private keys, `household.secret`, API keys, bank details or provider credentials. Don't present unimplemented bank payouts, simulated FX quotes or undeployed contracts as live.

## Key deadlines (Toronto time)

- **Nov 13, 2026, 8:30 AM EST**: Devpost deadline (official) and one-page solution overview (user's organizer Week 2 slide).
- **Nov 16, 2026**: showcase for selected teams; venue/time to be confirmed against organizer notices.
- **Nov 18, 2026**: finals for selected teams.

Official: https://blockchain-stellar-ic.devpost.com/ ; https://www.velocityincubator.com/programs-events/the-blockchain-innovation-challenge-powered-by-stellar
