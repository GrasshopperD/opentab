# OPENTAB GLOBAL | CLAUDE CODE PLANNING HANDOFF

> **SUPERSEDED STATUS (2026-11-12):** the user approved implementation. The PLAN-ONLY instructions in this file no longer apply; see `CLAUDE.md` and `docs/IMPLEMENTATION_PLAN.md`. The product, security and scope content remains authoritative.

**Project:** University of Waterloo / Velocity Blockchain Innovation Challenge powered by Stellar  
**Prepared:** 12 November 2026 (America/Toronto)  
**Purpose:** Complete decision record and planning prompt for Claude Code.  
**STATUS: PLAN-ONLY. DO NOT IMPLEMENT, DEPLOY, MODIFY FILES, PURCHASE SERVICES, CREATE CLOUD RESOURCES, OR INITIATE TRANSACTIONS UNTIL THE USER BRINGS THE PLAN BACK TO CHATGPT AND EXPLICITLY APPROVES IT.**

---

## 0. YOUR MANDATE TO CLAUDE CODE

You are the architect and future engineering lead for **OpenTab Global**, a Stellar-based family-support and retail-payment application. The user is ready to plan a genuine working app, not merely mockups. The implementation environment will be Claude Code, with a mobile-friendly PWA hosted on Vercel if practical, and Stellar Testnet for the blockchain. An installable PWA is the initial mobile delivery format; native iOS/Android packaging is optional after the core works.

**For THIS turn, return only a thorough, build-ready implementation plan in your reply. Do not code yet.** Explain the plan out loud, clearly and completely, in ordinary language that a developer and a non-technical founder can both follow. After presenting the plan, explicitly ask the user to paste the plan back into ChatGPT for a second architecture/security/scope review. Do not begin building until the user returns with approval. The user wants to compare your plan with ChatGPT's before proceeding.

Do not merely say you agree. Challenge unsafe or uneconomic assumptions. Be precise about what the user decided, what still requires technical design, what is verified by official documentation, what is speculative, and what we can credibly demonstrate by the competition deadline. Do not ask the user to repeat any decisions present below. If an essential choice must be made, make a justified recommendation and label the decision for approval.

**Important: The user's latest explicit decision is that LIVE FX LOCAL-CURRENCY PRICING AND CONVERSION ARE OFFERED ONLY IN CONNECTED-MERCHANT MODE. Fully offline merchant mode uses pre-agreed fixed-asset, fixed-unit accounting, with no live FX at checkout.** The merchant may show a previously established price label or already locked conversion parameters, but do not imply it is a live exchange-rate quote. In connected mode, merchant prices in MXN, EUR, BRL etc.; the merchant terminal obtains an actual rate/quote, asks the customer to sign an exact USDC charge, and submits that authorization to Stellar. A display conversion is not an on-chain swap and not a fiat bank payout. The user colloquially calls the experience a 'visual illusion', but the actual UI must remain honest and disclose real token settlement, exchange rates, spreads, fiat-payout status and any applicable risk.

### What I expect in your next response

1. **Repeat back the entire agreed product**, roles, both modes, currencies, geography gating, settlement and payouts.
2. **Architecture diagram and build decisions**: front end, backend, contracts, authentication/keys, databases, transaction plumbing, RPC/indexing, hosting and integrations.
3. **End-to-end flows** for sender, family, merchant, connected checkout, fully offline checkout, failed/replayed payment, refunds, merchant local fiat withdrawal.
4. **Contract interfaces and state machines**, with clear financial invariants and threats.
5. **Exact scope split**: what is P0 for Nov 13 at 08:30 EST, what is P1 by Nov 16 showcase, what is post-hackathon.
6. **Provider/country/currency capability matrix** with country *candidates* distinguished from live product support. State product-level and jurisdiction-specific verification required.
7. **Task-by-task development plan** with dependencies, test criteria, acceptance criteria, files to create, rough effort and owners/parallelism if useful.
8. **Failure modes and go/no-go decisions**: cross-device key compromise, double spending, PWA offline behavior, quote expiry, contract state archival, payout provider access, lack of liquidity.
9. **A specific live demo script** and deliverables checklist complying with Devpost.
10. **Unresolved questions** limited to high-impact decisions; recommend defaults rather than bouncing planning back to the founder.
11. **Say exactly which existing starter files can be reused and which need modifying/replacing**, and note any tests you did or didn't actually run.
12. Finish with: **'This is the plan. Please paste it back into ChatGPT for final review before I write code.'**

No unrequested background tasks. No simulated output described as live. No code edits in planning turn. No first-place guarantee.

---

## 1. WHY THIS PRODUCT EXISTS AND WHAT WE ALREADY DECIDED

We began with two concepts:

**Original idea A, SpendRoute**: a global, multi-currency FX/remittance router using Stellar native path payments, on-chain liquidity and partner fiat/card off-ramps. A sender could hold USDC and route value to EURC or other verified on-Stellar currencies; the real objective is maximize *spendable end value*, not minimize a DEX trading fee in isolation. Rain stablecoin Visa cards, MoneyGram Ramps, BVNK, Conduit, local payment systems and FX routing were considered. Problem: a cheap USDC→EURC trade is not automatically cheap bank EUR, pesos, or spendable card balance. Many partner integrations are unavailable to a student team, making an end-to-end multi-provider routing demo hard.

**Original idea B, savings/yield**: MoneyGram cash-to-USDC, then DeFi lending/LP yield for underbanked users. Rejected as primary idea due to KYC realities, smart-contract/investment risks, uncertain returns and existing Stellar products (e.g., Blend). Do not include yield in the hackathon MVP.

**Claude's research discovered OpenTab**, a merchant-backed prepaid remittance for neighborhood shops. A relative abroad funds a Soroban escrow. The household signs cumulative purchase commitments offline via QR. Shop verifies locally and later settles the latest cumulative ticket in one on-chain transaction. This is concrete, compelling and fits the transnational household problem. Claude wrote prototype contract/signature code but, as uploaded, it was not deployed to Testnet and no mobile web app was built. A key weakness of original OpenTab is expiry: refund can make previously signed offline purchases unredeemable. Other weaknesses: merchant fiat conversion; replay/local state; phone loss/key rotation; simplistic single-shop-only approach.

**Final agreed product, OpenTab Global**: **one family spending platform with two modes**. People abroad fund a family allowance on Stellar. Recipients use an app that looks like everyday payments rather than a crypto exchange. Stores use a merchant dashboard/checkout. The wallet and settlement are handled by Stellar/Soroban, with digital-to-fiat payouts *only* where an appropriate licensed provider has approved the corridor and merchant.

**User's latest priorities**:
- **Mode A / primary:** family member's phone can be offline, merchant's device/server is online. One shared family balance across participating merchants. QR-based merchant payment request, offline signature on recipient device, merchant submits to Soroban for definitive real-time check and token settlement. More scalable and safer. Never treat unsigned/unsigned-confirmed payment as complete.
- **Mode B / secondary:** BOTH customer and merchant have no connectivity. Fixed allowance is reserved **on-chain for one exact merchant** *in advance*. Budget categories like groceries/pharmacy are organizational labels, NOT the financial isolation boundary. Use a merchant-specific cumulative signed voucher/channel. One trusted/registered offline checkout device per shop for MVP, or explicit independently reserved terminal allocations if multiple truly disconnected registers are required. Shop checks signature and local highest accepted amount, durably stores tickets/order IDs, later settles cumulative total. No live FX quotes in Mode B. Hardware/offline double-spend risks cannot be wished away.
- Sender can invite family via phone or email, with embedded-wallet-like onboarding and local device signing; design for both modes available to one household. Sender can set whether offline allocations are enabled, but avoid a hard permanent mode toggle because individual merchants have different connectivity.
- Supported **connected-mode local pricing** should be determined by verified fiat payout providers/country coverage; merchants register country, currency, payout preference. Show merchant local currency and exact signed USDC charge, disclose pricing. When a genuine *on-chain* FX swap is wanted (e.g. USDC→EURC), use Stellar's available path-payment liquidity and strict limits, but don't make a swap mandatory for local fiat display.
- Merchants who hold USDC may want to keep digital-dollar exposure; others need fiat. Offer settlement/withdrawal choice where eligible, do not pretend stablecoin = bank deposit or that every merchant can/should hold USDC.
- **Priority:** connected mode first, fully offline second; both designed in system architecture; Vercel-hosted PWA, Testnet, real on-chain transactions, usable phone UX. An actual iOS/Android mobile app could come later.

**Positioning**: 'Family members abroad can fund everyday purchases back home. Recipients approve payments without mobile data. Connected merchants receive verified Stellar settlement; designated offline shops can accept prefunded signed tickets and settle later. Approved fiat payout providers can then convert merchant digital earnings into local bank money.'

**Don't claim** that OpenTab directly bypasses all KYC; that fiat withdrawals are free; that a QR scan is already money received; that cash pickup and bank payout are interchangeable; that a local-currency *display* means holding that currency; that every merchant in every country can join; or that full global multi-merchant offline payments are possible from a single unconstrained balance without specialized trust/hardware.

---

## 2. HACKATHON AND JUDGING CONTEXT

Competition: **Blockchain Innovation Challenge powered by Stellar**, University of Waterloo Velocity, **Problem Space 3: Transnational Households / cross-border remittances and last-mile access** (problem-space description from uploaded organizer research PDF, not independently opened live). Focus is not just moving money, but household access after arrival: local spending, rural/low-connectivity settings, trusted shops, user control, cash-pickup friction. Strongest solutions must make serving underserved customers structurally economical, not dependent on perpetual subsidies.

**Confirmed official Devpost cutoff:** **Friday 13 November 2026 at 08:30 EST**. **Project Showcase:** planned Monday 16 November 2026; organizer venue/times have been inconsistent in research. **Finals:** planned Wednesday 18 November 2026, check directly. **Prize:** C$15,000 total / three C$5,000 winners according to Devpost at time of research, not necessarily a single first-place prize.

Judging rubric from organizer PDF: **37.5% business impact / problem relevance, 37.5% technology and implementation, 25% presentation**. Claude's old research could not open Notion organizer rubric page, so reconfirm with team organizer copy. No point in sophisticated code that doesn't demonstrate a real improvement or cannot be explained in three minutes.

Devpost specifies: **working Stellar Testnet prototype** and live app/contract reference, **public GitHub repository with full code plus README/setup**, **public one-minute working demo video**, **three-minute spoken pitch including that video**, **trifold board** for showcase. Slides-only videos do not meet video rule. **A user-provided photograph of an organizer 'Week 2' slide (IMG_2048.jpg) explicitly states 'One Page Solution Overview DUE: Nov 13 | 8:30 AM Online'.** This is direct organizer-slide evidence of that separate deliverable. Prepare and submit the one-page overview as well as Devpost as required; confirm the correct form/link with organizers, since the slide does not specify the destination. Ensure AI assistance disclosure per event rules.

Competition URL: https://blockchain-stellar-ic.devpost.com/

**Crucial time planning:** as of Nov 12, 2026, the deadline is imminent. The PLAN must prioritize P0 deliverability and a hard scope cut if needed. It is better to ship ONE verifiably working connected-merchant payment than an app showing two modes and eight countries with no real transactions. The showcase may permit extending the prototype afterward, but confirm whether edits after the submission cutoff are allowed. Do not describe post-cutoff features as submitted functionality.

---

## 3. PRODUCT ROLES, APP, AND USER EXPERIENCES

### Roles

**Sender** (may be in Canada/US/another allowed funding jurisdiction): signs up, creates/links family, sets recipient device authorization, deposits test USDC, optionally sets category limits (groceries, pharmacy etc.), sees shared available balance, creates/offline merchant allocations and top-ups, sees real settled/pending amounts, initiates closure/refund subject to outstanding commitments. Sender may enable use of Mode B but should not blindly choose one mode for all merchants.

**Recipient / family spender**: accepts invite, registers a device signing key (distinct from mere phone number or login), sees allowance and any reservations, scans a connected merchant's QR request, verifies correct merchant/amount/asset, approves and signs with no internet on their phone, presents response QR. For Mode B, uses a prefunded named-merchant channel and signs cumulative commitments. Clear states: available vs allocated vs pending vs confirmed. Offline local amounts are a best-effort view; on-chain settlement determines spendable funds.

**Merchant**: registers verified business and region, configures merchant payout wallet, supported payment mode, checkout terminal IDs, pricing currency, and payout bank details when provider available; creates unique invoices, quotes local-price→USDC in Mode A only, scans signed response, submits on-chain, waits for confirmation; for Mode B stores highest accepted cumulative amount locally, signs/records merchant request, later settles; views real token balances and a clearly separate local fiat *estimated* amount; can ask for bank payout only if available/approved. Multiple shop terminals share the same merchant settlement wallet, but each invoice has terminal and order ID. A terminal identifier alone does NOT prevent overcommitting the shared offline balance.

### App delivery

- One responsive **Next.js + TypeScript** installable **PWA**, deployed on **Vercel**, one backend and role-based dashboard. Mobile browser support essential. For real offline Mode B use service worker, pre-cached app assets, offline key operations, IndexedDB durable state, state-expiry alerts and real airplane-mode tests. Beware iOS PWA camera, data persistence, installation and crypto API constraints. No false 'offline-ready' badge without full testing.
- Auth with phone OTP/email desired; for competition, select pragmatic demo flow. Phone OTP requires paid/approved SMS provider; email/invite or demo logins can suffice for MVP. Distinguish login identity from on-chain spending authorization. Do not send wallet private keys through QR or ordinary backend. Design secure embedded wallet/signing-key generation, device registration, encrypted storage and recovery. For Testnet demo, disclose shortcuts and never reuse demo keys on Mainnet.
- Merchant login and real KYB/provider onboarding are distinct processes. Country information not enough to activate a payout feature.
- Database e.g. Postgres/Supabase: users, families, member identities, public signing keys, merchant records, terminals, offline allocations, categories, invoices, local FX quotes, ticket acceptance ledgers, payment status, payout-provider capability flags, bank-account token references, webhook events. Secrets only in server-side secret manager; never expose private keys/provider API keys in public Next.js bundle or GitHub.
- On-chain contract owns actual money/balances; backend can index/cache but cannot independently mint account balances or mark transfer confirmed without observing final chain outcome. Use idempotent operations and reconcile from contract events and RPC, not from optimistic 'submitted' statuses.

---

## 4. MODE A: CONNECTED MERCHANT, OFFLINE CUSTOMER (PRIMARY)

### Desired flow

1. Sender funds the family vault (Soroban SEP-41 token, default **Stellar Testnet USDC** or clearly labeled demo USD asset). Family recipient signing key is registered with the vault. Funded balance is authoritative on-chain.
2. Merchant (online) registers and verifies merchant wallet and terminal. They price goods in the legally relevant local fiat currency, e.g. **MXN 100**.
3. Merchant app gets **fresh, source-attributed conversion quote** or a clearly labeled locked demonstration rate for `MXN → exact USDC amount`. The asset actually held/transferred can remain USDC. Merchant chooses whether to accept this exposure; merchant's downstream fiat bank payout is a separate later operation. Quoted USDC charge and any service/FX spread are displayed to customer and merchant; amounts use exact decimal/integer base-unit math, not floats or rounded illusions. Quote has a TTL and deterministic rounding rule. Requote before issuing if expired.
4. Merchant creates a uniquely identifiable **invoice challenge** (merchant account, registered merchant wallet, terminal ID, invoice ID/nonce, family vault/contract ID, Stellar network passphrase ID, asset contract, local amount, rate/quote reference, exact USDC amount, expiration, optionally category). Merchant QR may contain public data only, no merchant secrets.
5. Family member's offline phone scans it and presents a clear confirmation screen with *local price AND actual exact USDC deduction*. It constructs a canonical signed authorization over all security-relevant fields using its locally stored key. The response QR contains the authorization and signature. No internet is needed on customer phone.
6. Merchant's online device scans and validates format. It submits the signed authorization and pays (or sponsors) the transaction fee. Soroban contract authenticates the registered family public key, checks full domain separation, contract/network/asset, destination merchant, exact amount, limits, nonce/invoice uniqueness, revoked keys, and unspent family balance; it atomically debits the vault and transfers tokens to merchant. Duplicate submissions fail idempotently and cannot produce another payment. On-chain checks are still necessary even if frontend/backend checked.
7. Merchant waits for final confirmed settlement before showing **PAID** and releasing goods. Handle RPC timeout as **UNKNOWN/PENDING**, not **FAILED** or **PAID**, then query status by tx hash/idempotency key. The customer's offline display may show a locally submitted/authorized state until it eventually reconnects.
8. Several terminals/stores can independently submit requests. Sequential ledger state prevents overspending shared balance. Merely making each merchant/terminal ID unique is not a replacement for the on-chain balance check.

### What needs engineering

- Architect and implement a **new connected-merchant FamilyVault contract**; uploaded existing `lib.rs` is a **one-shop cumulative offline channel**, NOT a shared-balance multi-merchant payment contract.
- Privacy: don't store grocery item lists on chain. Consider amount + merchant visible on public chain, disclose that. Family member should have say in participating merchants, rather than sender constraining all purchases unilaterally. If category caps are enabled, enforce them on chain if presented as hard limits, not only in UI.
- Define cancellation/withdrawal/escrow states so sender cannot pull funds from an in-flight checkout unfairly. For connected mode, only call success after atomic settlement; refund/cancellation policies can be simpler.
- Customer can have no internet, merchant must. If both are offline and no merchant-specific reservation exists, decline or prompt to use Mode B after pre-setup. Do not fall back to blind acceptance on shared balance.
- Potential use of Stellar's auth infrastructure, fee sponsorship, Soroban auth entries, smart account/delegated signing methods, or direct verified Ed25519 authorizations; choose the simplest safe Testnet route and justify choice. The MPP SDK is worth examining but is not automatically a drop-in retail solution.

---

## 5. MODE B: BOTH CUSTOMER AND SHOP OFFLINE (SECONDARY)

### User's latest definitive design decision

The funding sender dedicates allowances such as **grocery, pharmacy, school** AND, more importantly, locks each offline amount to **one specific merchant and one contract/channel**. This is not a universal offline wallet. Example: a household's 100 USDC is divided into 60 USDC connected merchant shared balance, 25 USDC pre-reserved at Grocery A, 15 USDC pre-reserved at Pharmacy B. The sums cannot overlap. Same category across two stores still needs separate allocations. Both sides preload the verified channel terms while connected. Fully offline checkout uses **fixed USDC-denominated amounts or previously agreed fixed local price conversion**, **no live FX and no unbounded later FX calculation**.

### Voucher flow

1. Sender/responsible person creates `OfflineChannel(family, merchant, recipient_key, asset, funded_amount, acceptance_deadline, claim_deadline)` and deposits the merchant-specific amount (or moves reserved funds atomically from family vault to a channel), while online.
2. Merchant pre-syncs recipient public key, contract/network ID, funding amount, channel/merchant identity, and deadlines. App must show it is genuinely ready for offline acceptance only when that cached state exists.
3. Shop creates a unique order request, ideally terminal-bound. Recipient scans, approves new spend, locally increments the channel's cumulative authorized amount and signs canonical bytes including channel, network, merchant, order/terminal, amount, updated cumulative and appropriate parameters. Shopper local UI also tracks cumulative, but that local ledger is not a globally trusted balance.
4. Shop scans, cryptographically verifies signature and authentic channel, checks `new cumulative > last accepted cumulative` and `<= channel funded`, checks expected order/merchant ID and accepted-period rules, and atomically persists highest accepted commitment + order/receipt. Reject identical/replayed/decreasing commitments, **never charge a duplicate again**. This must work across app restart. For initial Mode B, support **one offline checkout device per merchant channel**; multiple terminals without synchronizing state need independently reserved per-terminal funds or explicitly designed local atomic single-writer architecture.
5. Shop hands over goods in exchange for a valid but *not yet settled* claim. Clearly label `ACCEPTED OFFLINE — PENDING SETTLEMENT`, not `PAID`. When online, submit latest valid cumulative voucher; Soroban verifies and pays only `cumulative - previously settled`, while enforcing funded maximum and destination merchant.
6. Expiry: existing starter contract is unsafe for offline stores because it immediately rejects after expiry and allows refund. Separate `last_acceptable_purchase_time`, `settlement_grace_end`, and `final_refund_after`. A shop can be disconnected past grace period; some residual nonpayment risk remains. Note that offline signature timestamp can't be independently trusted if it comes from an ordinary phone; design verifiable risk limits, clock-skew policy, warnings and clear settlement terms. Do not falsely assert a grace period proves when vouchers were signed. Consider contract close/challenge/finalization state machine instead of naïve timer.
7. Lost device / key rotation: never invalidate legitimate unsettled vouchers without a settlement/dispute resolution step. Existing `rotate_key` immediately changes the key; this is a major UX/security risk. Define recovery policy and scenario tests.
8. Double spending by cloned key or state rollback at multiple offline merchants remains impossible to fully eliminate with one unsegmented balance. Merchant-specific funded escrow contains the damage; remaining single-channel multiple-terminal risks require proper local coordination. Do not use the proposal of intentionally repeatedly charging duplicates 'until zero'. It is unsafe: replay attempts should be rejected, and merchants must not be able to drain balances by replaying once-authorized messages.

### Current existing starter code

User supplied these exact source files, separately mounted/attached in conversation:
- `lib.rs`: original OpenTab Rust/Soroban single-shop channel contract, methods `open`, `top_up`, `extend`, `settle`, `close`, `rotate_key`, `ticket_message`, `get_tab`. Uses Ed25519 signature over domain tag `OPENTAB1`, contract ID, `tab_id`, cumulative amount. `settle` requires shop authorization, pays `(new cumulative - already settled)` minus configured basis-points fee.
- `test.rs`: ~17 contract tests reported by Claude (cumulative, replay, signature, overlimit, fee, early close, after-expiry refund, key rotation, conservation, JS/Rust compatibility).
- `ticket.mjs`: JS ticket construction/signature/verification; Node-oriented `Buffer` usage must be reviewed for browser/PWA compatibility; signature currently lacks full merchant terminal/order/expiry context because merchant is fixed by channel contract state.
- `ticket.test.mjs`, `make-ticket.mjs`: test fixture/CLI helper.
- `Cargo.toml`, `Cargo (1).toml`, `Cargo.lock`, `package.json`, `package-lock.json`, `README.md`: current Rust workspace/package/setup details. Rust workspace pins `soroban-sdk = 29.0.1`; JS lock file has `@stellar/stellar-sdk` 17.4.0. Check current CLI and compatibility on Testnet; do not blindly upgrade dependencies under deadline.
- `Stellar Challenge Winning Project Decision.pdf`: Claude's 25-page reasoning/documentation, competitor scans, 33 concepts, original OpenTab rationale, old deadlines and MVP plan.
- `Context.pdf`: prior 9-page challenge/track context, if in available attachments.

**Current state**: code and reported native unit tests, **no independently verified WASM build, on-chain Testnet deployment, or functional web app**. No known audited contract. Do not describe these as deployed/production code. Original README specifically says Testnet deployment and browser app not done. The initial test suite includes behavior that *intentionally* rejects settlement immediately after expiry; this must be changed before showcasing Mode B as safe. Check `Cargo.toml` structure, target path and dependency versions when execution starts.

---

## 6. CURRENCIES, COUNTRIES, AND RATE RULES

### Nonnegotiable distinction

1. **Display/pricing currency**: local fiat number merchant types, e.g., MXN 100.
2. **Actual on-chain token**: e.g., Stellar USDC. This is the asset the Soroban contract holds and pays.
3. **Fiat payout currency**: actual funds in merchant bank account after partner payout, e.g., MXN. This is a *separate regulated process*.
4. **Optional on-chain FX swap**: USDC→EURC (or other authentic Stellar asset) using Stellar order-book/AMM path payments. Requires issuer authenticity, trustlines, liquidity, quoted execution price, max-spend/min-receive, and asset/network compatibility. No point swapping to EURC if payout partner wants USDC and performs EUR conversion cheaper.

**Latest user rule**: Only **Mode A (online merchant)** can use live FX quote APIs and rate refresh. Offline Mode B may use a preagreed fixed token-denominated price or safely constrained preloaded rate, with no claim of live pricing. If the merchant expects an exact local fiat amount, provider quote expiration and future redemption FX risk must be disclosed. Do not call a dynamic displayed MXN estimate a guaranteed MXN payout.

### Provider capability research, verified official pages (Nov 12, 2026)

**BVNK**:
- Its currencies docs explicitly list **Stellar USDC** as available for deposit/payout, subject to jurisdiction/account status; supported fiat currencies for ordinary account payout are **USD, EUR, GBP**, and local rails include USD in the US, GBP in the UK and EUR in eligible SEPA countries. Other local networks, including BRL, MXN, COP, CAD, PHP, are marked *upcoming* in BVNK's published fiat currency table.
- Important nuance: BVNK's **Global Money Platform / Mastercard Move** marketing/documentation additionally discusses payouts to **40+ local currencies**. This is a **different product/capability** and NOT proof that a new OpenTab client can directly convert Stellar USDC into each local bank currency using the same APIs and eligibility. Ask BVNK which exact program, corridor and pricing would apply; do not incorrectly say BVNK can *never* pay these currencies either.
- Docs: https://docs.bvnk.com/bvnk/references/currencies/ ; https://docs.bvnk.com/bvnk/get-started/global-money-platform

**Conduit**:
- Official supported assets page includes fiat payout currencies **USD, EUR, GBP, BRL, MXN, COP**. Its stated USDC networks for ramp/off-ramp are **Ethereum, Base, Solana, Polygon**, not Stellar. Additional bridge/network transfer and fee/issuer compatibility needed from Stellar; don't invent direct compatibility. Merchant country/bank country requirements and negotiated access still must be checked.
- Docs: https://docs.conduit.financial/guides/supported-assets ; https://docs.conduit.financial/core-concepts/payment-methods
- Any previously mentioned '$35 below $10,000' pricing must be reverified from primary commercial or product documentation; don't hardcode unverified pricing/thresholds.

**MoneyGram**:
- Official MoneyGram Ramps supports **Stellar USDC** wallet cash-in/cash-out, and typically relies on **participating physical cash locations**, KYC and qualified partners. Cash payout is not the same as a direct local-bank USDC off-ramp.
- MoneyGram also has **separate** money transfer/bank/digital payout APIs for authorized business clients, but do NOT assume those APIs can be combined into a single direct 'Stellar USDC → any bank worldwide' payout without a commercial agreement and technical verification.
- Docs: https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps ; https://developer.moneygram.com/moneygram-developer/docs/transfer-api

### Country and asset policy

**Production payouts: every country disabled until approved provider access and end-to-end quote are verified.** For UI/testnet demonstrations, can show prospective corridors with honest 'planned / simulation' labels. Payout provider capabilities are NOT an OpenTab supported-country list.

Provisional country/currency rows for research and demonstration:
- **US (USD)**: BVNK domestic USD payout candidate. Business/jurisdiction eligibility must be confirmed.
- **UK (GBP)**: BVNK GBP Faster Payments candidate.
- **Eligible SEPA countries (EUR)**: BVNK EUR SEPA candidate, verify exact eligibility per country and business type. Examples: Germany, France, Netherlands, Spain, Italy (not an exhaustive eligibility whitelist).
- **Mexico (MXN), Brazil (BRL), Colombia (COP)**: Conduit bank payout *candidates*; requires Stellar→supported-network conversion and account approval. BVNK Mastercard Move may have other capability; request confirmation instead of presuming.
- **MoneyGram cash locations in eligible countries**: separate physical cash-out route only; cash pickup business model may be poor for small rural merchants and shouldn't be used to claim universal online banking.
- **CAD (Canada), PHP (Philippines), JPY (Japan)**: showcase as pricing/display examples only if helpful, but **do not promise supported local bank payout** absent verification. Actual on-chain GYEN, JPYC, CAD tokens must be individually verified before mentioning as usable paths.

### Capability gating algorithm (conceptual)

A merchant may request payout only if all pass:
`country and recipient business type allowed` + `merchant compliance approved` + `bank country/currency/rail supported` + `provider account enabled` + `source token and blockchain supported or explicitly configured lawful bridge route` + `min/max amounts` + `actual fee quote available` + `net amount and FX rate accepted` + `provider transfer initiated and reconciled`. If not, payout unavailable with human-readable reason. Backend service should not rely solely on a hardcoded country flag.

### On-chain currencies

**Build Testnet USDC first** (or transparent demo USD-token if authentic Circle Testnet USDC access is inconvenient). Real Circle USDC and EURC are familiar, but Testnet tokens have no fiat value. Optional USDC→EURC path swap is strictly post-core and only if actual verified Testnet liquidity exists. The sender can use USD/CAD/other fiat in an envisioned on-ramp eventually, but the hackathon MVP begins with already-funded Testnet assets and does not imply a working CAD bank on-ramp.

Do not pretend that having a USDC balance labelled 'EUR' makes it EURC. Do not make FX routing central to every purchase. Quote-to-exact-USDC connected checkout is the priority.

---

## 7. TECHNICAL STACK AND INTEGRATIONS TO EVALUATE

**Front end:** Next.js App Router + TypeScript + Tailwind or a lightweight component system; responsive/inclusive PWA, accessible checkout, clear family/merchant modes. Vercel for hosting. Camera QR scanner and QR generator. Test on two actual phones with family phone airplane mode and merchant phone online.

**Backend:** Next.js server routes/server actions for non-sensitive services, or separate minimal service if needed; Postgres/Supabase; secret management, webhook signature verification, idempotent provider records; Stellar RPC reads and state reconciliation. Vercel serverless functions may not guarantee always-on background pollers or a single atomic in-memory store; use durable Postgres transactions, event-driven jobs or an appropriate managed scheduler/worker. Never use unshared in-memory state for replay prevention in a multi-instance deployment.

**Contracts:** Rust `soroban-sdk` on Stellar Testnet, with a **FamilyVault connected payment contract** and **OfflineChannel** based on uploaded code. Decide whether to use one contract or two based on simplest safe interface; justify any merging/segregation. Store actual integer base units and address/nonce records, not floating-point balances. Contract needs security tests for concurrent payments/overspend, replay, wrong network, wrong merchant, wrong asset, mismatched terminal/order, revoked keys, unexpected token transfer failures, fees, refunds and archival TTL.

**Stellar features to use meaningfully:** Soroban escrow/vaults; SEP-41 token contracts / Stellar Asset Contracts; official JS SDK and RPC; fees paid by online merchant/relayer/sponsored fee flow; native path payments only if useful and executable; asset identity and trustlines; ledger events and verifiable transaction receipts. Consider Soroban smart accounts/passkey auth if compatible with the offline signer, but avoid a huge dependency change unless justified.

**Official Stellar MPP SDK**: https://github.com/stellar/stellar-mpp-sdk. It supports one-time on-chain charge and one-way cumulative signed channel payments. Its patterns are instructive, not necessarily a drop-in. Current docs emphasize atomic, linearizable compare-and-set storage for challenge/replay protection across server instances, and channel pinning. Review applicability. Do not sell cumulative commitments as an invention unique to OpenTab.

**On/off ramps:** BVNK, Conduit, MoneyGram as *adapters behind a provider-capability registry*, only sandbox/production once the team has API access. Country/currency names in a UI without a working backend must be visibly `planned`, `ineligible`, or `simulation`, never `available`.

**Security:** Security review before any real-money use; TLS, rate limiting, authentication/authorization, strict object ownership, signed QR canonical encoding and schema validation, per-invoice nonces, public key pinning, key rotation/recovery and dispute handling, safe merchant wallets, offline device persistence tests, pending/confirmed state separation, logs devoid of private keys/identifying sensitive data. Explicit threat model for malicious shopper, malicious merchant, compromised frontend, copied signing keys, lost terminal, stale FX quotes, network partitions, payout failure.

**Compliance:** A pure Testnet demo is not a licensed financial service. Mainnet deployment, real fiat on-ramp/off-ramp, marketing to residents of a jurisdiction, custody, money transmission, consumer protection, stablecoin disclosures, privacy, business KYC/KYB and sanctions screening require counsel and provider commercial onboarding. Do not claim a smart contract makes the operator automatically noncustodial or exempt.

---

## 8. COSTS, PRODUCT METRICS, AND WHY JUDGES WOULD CARE

User has compared cross-border provider FX costs, but **avoid unsupported claims like 'Stellar reduces remittance fees from 6% to 0.1%'**. End-to-end amount = sender fiat amount, minus on-ramp fee/spread, minus any on-chain routing cost, minus app fee, minus merchant redemption/off-ramp fee/spread, minus transfers/FX, plus time/travel/friction. Rates are corridor-, amount-, provider-, time- and qualification-specific. Low blockchain transaction fee is only one item.

Plausible impact: recipient avoids cash pickup trip for covered purchases; sender purpose-based budgets; shop gains pre-funded certainty instead of some unpaid `fiado`/`khata`/`lista` credit; no need for every family member to learn crypto; offline customers can use participating online merchants. **Prepaid allowance does not replace all informal credit**, because families cannot borrow before money arrives. Merchants still need local cash or supplier acceptance. Holding USD stablecoin may be advantageous in volatile-currency markets for some shops, but entails issuer, legal, security and FX risk and is not universally desired.

Potential business pricing: small transparent payment/settlement fee, only if economics work. Earlier Claude proposal assumed 0.5%, but that was hypothetical; cannot assume 30 households/shop or uncollected credit losses. Gather 3–5 real interviews if possible, sender/household/shop, record factual quotes with consent. Compelling demo: customer phone in airplane mode, merchant verifies/payment on Stellar, replay attempt fails; separate fully offline voucher demo if built. Demonstrate measurement: transaction hash, actual transferred token amount, speed, replay rejection, fee/ledger metrics; user-tested checkout; honest provider country flags.

**Likely objections from judges**:
- 'Isn't this just a gift card?' Answer: cross-border funding, independent on-chain spend authority, multi-merchant mode and no-data customer checkout, verifiable settlement.
- 'How can shop use USDC?' Answer: some opt to hold/spend it; verified provider may convert to bank fiat if eligible; current MVP does not yet include commercial payout.
- 'Offline double spend?' Answer: two distinct modes; shared balance requires online merchant confirmation; both-offline is limited to separately reserved merchant channels and per-channel persistent, monotonic vouchers, with explicit residual risk.
- 'Why Stellar?' Answer: Soroban programmable trust, fast inexpensive settlement, native assets/path payment primitives, sponsorship, anchored fiat/USDC ecosystem, client SDK.
- 'Is any of this working?' Prove by explorer hash; state exactly which features are live and which are storyboard.

---

## 9. MVP ROADMAP WITH HARD PHASE GATES

**P0, before Devpost cutoff Nov 13, 08:30 EST:**

- Agree minimum contract semantics on paper and choose Testnet asset.
- Confirm Rust toolchain/CLI builds; deploy a *minimal safe* FamilyVault connected merchant payment on Testnet (if that is feasible fastest). If not, use tested original channel after fixing critical expiry issues, but DO NOT show fake flow as live.
- Build a usable sender fund screen, recipient offline key/sign screen, merchant invoice/scan/submit screen. Prioritize one end-to-end payment with actual Stellar transaction hash. If camera fails, offer paste/share-QR fallback without misrepresenting feature.
- Confirm customer can sign a purchase with cellular data off while merchant submits it. Test duplicate / overspend rejection. Persist status across reload.
- Public Vercel URL, GitHub README/setup, contract IDs, one-minute working demo video with genuine footage, public links, submission by cutoff. Include clearly labeled limitations and AI-use disclosure.
- A small number of genuine user interviews if reachable; do not fabricate. Prepare and submit the **one-page solution overview** using the organizer form/link, confirmed on user photo IMG_2048.jpg; also verify any additional showcase form.

**P1, for Nov 16 showcase if allowed:**

- Harden Mode A, multi-merchant terminal IDs, category limits and embedded signing UX.
- Finish Mode B with adapted original code, merchant-scoped reserve and bounded expiration/settlement; two-phone airplane-mode proof, durable merchant records, recovery cases.
- Optional convincing local-currency checkout (fresh online merchant quote, customer offline signs exact USDC) with demo rate explicitly labeled if no real API. Rate spread and quote TTL clear.
- Merchant dashboard balances in on-chain USDC vs illustrative bank fiat, payout eligibility registry that returns `not yet available` for everyone until provider approved. If sandbox available, integrate as sandbox, not live.
- Trifold and three-minute pitch with 60-second video, actual metrics, candid risk sheet and pilot approach.

**P2, after competition / only with partner access:**

- Real payment-provider compliance and bank payouts, provider choice/routing and quote aggregation, cryptographically safe embedded accounts and recovery, persistent secure offline storage across devices, automated reconciliation, multiple currencies, production smart-contract audit, field pilots, possible native app.

### Explicit scope-cut rule

If there is no functioning end-to-end Testnet checkout with verifiable confirmation, cut all nonessential add-ons (multi-currency swaps, Mode B, broad country selector, MoneyGram, Rain, BVNK, Conduit frontends, native apps) until Mode A works. If Mode A proves harder than expected, it is acceptable to pivot to the original working single-shop channel + a true Testnet settlement, transparently labeled, rather than miss submission. No misleading 'live fiat payout' buttons or fictitious confirmations.

---

## 10. FINANCIAL INVARIANTS / ACCEPTANCE TESTS CLAUDE MUST DESIGN

### FamilyVault connected checkout

- On-chain accounting: `total deposited - refunds - settled payments - separately allocated offline funds == available`, modulo explicit agreed fees and state transitions.
- Two simultaneous payments drawing on the same amount cannot both succeed if their sum exceeds balance.
- Replaying the exact same signature/invoice ID never results in two transfers, regardless of which terminal submits.
- A signature cannot be repurposed to another merchant, terminal, network, token, amount, contract or invoice.
- Quote expiry/requote: merchant accepts exact token amount; after quote expiry, client must request new signature, not silently change charge.
- A customer device with stale balance may sign a payment, but on-chain validation declines if insufficient; merchant never shows `PAID` before confirmed finality.
- Device key removal/revocation and family membership updates cannot make already completed transfers reversible.
- Pending/ambiguous RPC results must reconcile without double submission/double transfer.
- Test browser signing algorithm and Rust verification against the same bytes (cross-language fixtures), including malicious alteration of fields.

### OfflineChannel

- Fixed, on-chain merchant-specific funded cap; categories alone not sufficient.
- Monotonic cumulative authorizations. Same/older commitment gets no additional payout. Merchant local acceptance state updates atomically/persistently; multiple disconnected checkout devices prohibited by default.
- Refund cannot immediately steal already earned but unsubmitted offline purchase claims. Design accepting/claim deadlines and honest residual risk.
- Store rejects stale/wrong recipient key/wrong channel/wrong merchant/wrong order and corrupted ticket; simulate data loss/reload/phone time manipulation.
- Key rotation/loss has an orderly settlement and dispute path.
- Fee conservation and rounding, no overwithdrawn reserves or negative balances. Soroban persistent/instance TTL handled.
- True offline PWA demo: both devices in airplane mode after cached install, QR present/scannable, signature checked locally. Then one reconnects and performs actual chain settlement.

### Payout systems (only sandbox/live after access)

- No payout API credentials in client.
- Idempotent withdrawal and duplicate webhook processing.
- Reject unsupported country, bank currency, asset network, sanctions/eligibility and insufficient funds.
- Actual quote freshness, max fees/min payout, bank settlement callbacks, failed payout reconciliation.
- If bridging from Stellar USDC to a network Conduit accepts, explicitly price, authorize and track that step; no invented seamless network compatibility.

---

## 11. REFERENCED INTEGRATIONS AND MATERIALS

Primary sources reviewed for the planning brief (as of Nov 12, 2026; the next model should reverify if material):

1. **Challenge/Devpost**: https://blockchain-stellar-ic.devpost.com/ (deadline, requirements, Demo)
2. **Stellar developer docs**: https://developers.stellar.org/ (Stellar transactions, path payments, Soroban, accounts, fee sponsorship)
3. **Stellar MPP SDK**: https://github.com/stellar/stellar-mpp-sdk (one-time charges and one-way cumulative signed channels; atomic replay-store design)
4. **BVNK currencies and crypto chains**: https://docs.bvnk.com/bvnk/references/currencies/ (Stellar USDC, fiat payout core currencies, 'upcoming' locals)
5. **BVNK Global Money Platform**: https://docs.bvnk.com/bvnk/get-started/global-money-platform (additional Mastercard Move claims; product-specific availability must be verified)
6. **Conduit assets**: https://docs.conduit.financial/guides/supported-assets (fiat currencies and USDC chain support)
7. **Conduit payment methods**: https://docs.conduit.financial/core-concepts/payment-methods
8. **MoneyGram Ramps**: https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps
9. **MoneyGram other Transfer APIs**: https://developer.moneygram.com/moneygram-developer/docs/transfer-api (distinct bank payout APIs; not automatically a crypto-bank bridge)
10. **CashReady competition peer**: https://github.com/tzeshuo/cashready (cash pickup reservation, not our OpenTab architecture)

User-provided attachments: `Context.pdf`, `Stellar Challenge Winning Project Decision.pdf`, `IMG_2047.jpg`, `IMG_2048.jpg`, `IMG_2049.jpg`, `lib.rs`, `test.rs`, `ticket.mjs`, `ticket.test.mjs`, `make-ticket.mjs`, `README.md`, `Cargo.toml`, `Cargo (1).toml`, `Cargo.lock`, `package.json`, `package-lock.json`. These are *files provided by the user*, and not necessarily located in an identical directory structure when handed to you. Ask for files only if not attached to your current Claude session; don't invent test results.

The older Claude report rated OpenTab 80/100 without a partner and gave 17 Rust tests / 3 JS tests. Treat those as **claims in the provided files**, not proof that a public deployed product is live. The old report had a cash-reservation competitor and a single-shop fallback called `Tab Link`; use only if appropriate.

---

## 12. REQUIRED NEXT ANSWER: OUT LOUD PLAN, THEN STOP

In **your immediate answer to the founder**:

- Explain your entire interpretation of OpenTab Global, including the new **online-merchant-only live FX** rule and why it exists.
- Clarify what a merchant receiving USDC means, what a real bank payout is, and the false confidence of thinking a quote/country flag alone equals provider access.
- Show the complete **technical architecture**, logical data model, QR payloads, signing/auth model, contracts, two state machines and workflows.
- Pick a pragmatic Stack/hosting plan, recommending a Vercel-deployed installable PWA; explain whether PWA offline scanning/signing and Web Crypto can actually work under browser/platform limitations, and how you will test it.
- Clearly distinguish Mode A shared-balance payments vs Mode B prefunded merchant-specific channels. Explicitly resolve replay and overspend vulnerabilities.
- Give a priority-ranked **file-by-file, step-by-step build plan**, with exact tests and evidence required to claim functionality.
- Address the approaching Devpost deadline, and identify what can realistically be done before it and what cannot.
- Give a clean, ranked integration plan for BVNK, Conduit, MoneyGram, and optional genuine on-chain FX. Include explicit country/asset gating and sandbox vs production credentials; don't enable live payouts prematurely.
- Provide a thorough demo plan with public source, Vercel URL, Stellar Explorer proof and a concise value story for judges.
- List a few decisions needing approval and your recommended defaults, and be willing to say the current desired scope is too large.
- **Do not write, edit, or deploy anything yet. No transactions, no secrets, no repo scaffolding.** This message is planning only.
- End your response with exactly: **'This is the plan. Please paste it back into ChatGPT for final review before I write code.'**

This plan should be the canonical reference when coding begins after founder approval.
