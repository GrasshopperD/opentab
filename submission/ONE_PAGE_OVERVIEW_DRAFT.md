# OpenTab Global: one-page solution overview (DRAFT, verify organizer template)

**Problem space:** Transnational households / financial inclusion (Problem Space #3)

**Problem**: Relatives working abroad often transfer money digitally, while receiving households still face connectivity barriers, limited convenient cash access and friction using funds for necessities. Neighborhood merchants need reliable payment and, ultimately, usable local fiat.

**Solution**: OpenTab Global lets a sender fund a household allowance with digital assets on Stellar. The recipient approves QR checkout **without mobile internet**. A connected merchant immediately submits the cryptographically signed authorization to a Soroban contract, which verifies the balance, destination and one-time payment ID before moving funds. A second, merchant-specific prepaid mode allows a designated shop to verify cumulative signed purchases while completely offline and settle on Stellar after reconnecting.

**Stellar technology**: Stellar Testnet asset balances; Soroban programmable spending and merchant payouts; signed offline purchase authorizations; on-chain replay and limit enforcement; potential optional path-payment FX routing where real asset liquidity exists. The initial demonstration uses test assets with no real fiat value.

**Who benefits**: Families whose recipients lack consistent mobile connectivity; participating merchants who can receive confirmed digital settlement; senders who want a transparent support allowance. Merchants may ultimately choose eligible bank payout through a licensed partner, but that integration is not live yet.

**Demonstration**: [REPLACE with exactly what works] Sender deposits test funds, recipient disconnects from internet and signs merchant invoice, merchant verifies and submits to Stellar Testnet, then a duplicate/overspend attempt fails. Contract ID: TBD. Explorer link: TBD. App URL: TBD.

**Business viability / evidence**: We expect fewer trips for some household purchases and more reliable settlement for shops. **Not yet established**: merchant willingness to accept stablecoin, country-specific provider payouts, end-to-end fees and user interview validation. These are explicit pilot measurements.

**Team / next steps**: [Fill team names and verified pilot contacts.] Build the functioning Testnet demo, validate with senders/merchants, then test eligible partner fiat payout only after approval.

**Avoid overclaiming**: Do not imply existing BVNK/Conduit/MoneyGram partnerships, live bank settlement, universal global currency acceptance, or a security audit.
