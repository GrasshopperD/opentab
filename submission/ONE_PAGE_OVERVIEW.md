# OpenTab Global: one-page solution overview

**Team project, Blockchain Innovation Challenge powered by Stellar, Problem Space 3: Transnational Households**

**Problem.** Money sent home often has to be collected as cash at a pickup counter before it can buy groceries or medicine.
Recipients may have a phone but unreliable or costly mobile data. Senders cannot easily earmark support for essentials, and
neighbourhood shops carry informal credit risk.

**Solution.** OpenTab Global turns a remittance into a **shared family spending balance on Stellar** that can be spent
directly at participating local shops. The family member approves each purchase on their phone **without internet**; the
shop, which is online, submits that approval to a Soroban smart contract that pays the shop in seconds.

**Target users.** (1) Senders abroad supporting a household. (2) Family members who need to buy everyday essentials, with
limited data. (3) Small local merchants who want to be paid with certainty instead of extending credit.

**How it works.** Shop shows an invoice QR (local price + exact token charge) → family phone, offline, checks and signs
exactly that shop, amount and invoice → shop scans the approval and submits → contract verifies key, signature, expiry,
one-time invoice and balance, then transfers the tokens → shop sees "Payment confirmed" only after Stellar confirms.

**Why Stellar.** Soroban enforces the spending rules on chain; Stellar Asset Contracts let the contract hold and pay a
dollar token; fees are low and finality ~5 s; Soroban's native Ed25519 verification means the recipient key needs no
account or XLM; Stellar's anchor ecosystem is the path to regulated cash-out.

**What the prototype demonstrates (Testnet, verifiable).** Deployed FamilyVault contract
`CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW`; real signed payments to two different shops from one family
balance; the same approval replayed and rejected by the contract; overspend rejected; 34 contract tests, 13 protocol tests, an 18-check live API test, 18 security checks and 5 real-browser tests (including signing in an emulated offline browser) passing. Settlement token is a clearly labelled demo asset (OTUSD), not USDC.

**Technical components.** Rust/Soroban contract · TypeScript protocol package shared by browser and tests (340-byte
canonical message, cross-checked against Rust) · Next.js installable PWA with Sender, Family and Shop screens, QR
generation and camera scanning (not yet verified on a physical phone) with paste fallback · server-only Testnet relay for demo accounts.

**How it differs.** Unlike a remittance app, money is spendable at the shop without a cash pickup. Unlike a gift card, one
balance works across many independent shops, every rule is enforced by a public contract, and payments settle on chain.
Unlike typical crypto wallets, the shopper needs no data, no XLM and no crypto knowledge.

**Roadmap.** Physical-device offline testing and hardened key storage → both-offline mode with funds reserved for one
named shop → real Testnet USDC → licensed payout partners where available → audit and pilots.

*Honest limits: Testnet only; demo token has no value; exchange rates illustrative; no bank payouts yet; unaudited.*
