# Three-minute pitch

**(0:00) The human problem.**
When someone in Toronto sends money to their mother in Oaxaca, the money arrives. But it usually has to become cash first:
a trip to a pickup counter, a fee, a queue. And then the family still needs to buy groceries and medicine, often at the
same small shop on their street, sometimes on credit the shopkeeper hopes will be repaid. Many of those families have a
phone, but not reliable mobile data.

**(0:30) What we built.**
OpenTab Global turns that remittance into a shared family spending balance on Stellar, spendable directly at local shops.
The sender funds the balance. The family member pays by scanning the shop's QR code and approving on their phone, and the
phone does not need internet to do that. The shop is online; it submits the approval to Stellar and gets paid in seconds.

**(1:00) Demo.** *[play the one-minute video]*
*(Say "in airplane mode" only if the video visibly shows it.)* You just saw a real Stellar Testnet transaction: the phone, with no connection, signed the exact shop, amount and invoice; the
contract checked it and paid the shop; and when we tried to charge the same approval again, the contract refused.

**(2:00) Why this is credible.**
The rules live in a Soroban smart contract, not on our server. Every approval is bound to the Stellar network, this
contract, the token, the family, the shop, the terminal, the invoice, the amount and an expiry. Each invoice can be paid
once. One family balance works across many shops, and two shops can never together spend more than is there. The family
member needs no crypto account and no XLM. We have 34 contract tests, a signing format cross-checked between browser and contract, and live API and browser tests that run real payments on Testnet.

**(2:25) Business and roadmap.**
Shops get paid with certainty instead of carrying informal credit, and senders know their support goes to everyday needs.
A small settlement fee is a possible model, but we have not validated pricing yet. Next: test on more phones; then a fully
offline mode where funds are reserved on chain for one named shop; then real USDC and licensed payout partners so shops
can cash out locally where that is legally available.

**(2:50) Close.**
We are honest about what this is: a Testnet prototype with a demo token. But the core loop, offline approval and on-chain
settlement at a real shop counter, works today. OpenTab Global: your support, their everyday essentials.
