# OpenTab

A relative abroad prepays the family's tab at their own corner shop. The family buys on that tab with a phone that needs no signal. The shop collects a week of purchases in one Stellar transaction.

Built for the Blockchain Innovation Challenge powered by Stellar (Waterloo, November 2026), Problem Space 3.

**Status:** Stellar Testnet prototype. Test assets only. Nothing here is redeemable for money.

## How it works

1. **Sender opens a tab.** They deposit a dollar token into the OpenTab contract, name one shop and set an expiry.
2. **Household buys.** For each purchase the household phone signs a *ticket*: the new running total of the tab. Signing needs no network.
3. **Shop checks the ticket.** The shop phone verifies the signature and the limit, also with no network, and hands over the goods.
4. **Shop redeems.** Whenever it is online, the shop sends only the newest ticket to the contract. The contract pays the difference since the last redemption.
5. **Unspent money returns.** After expiry anyone can close the tab and the remainder goes back to the sender.

Money can move in two directions only: to the shop against a household signature, or back to the sender.

## What is in this repo

| Path | What it is | State |
| --- | --- | --- |
| `contracts/open_tab/src/lib.rs` | The Soroban contract | Done. 17 tests pass on soroban-sdk 29.0.1 |
| `contracts/open_tab/src/test.rs` | Contract tests | Done |
| `web/ticket.mjs` | Ticket building, signing and offline checking for browser and Node | Done. 3 tests pass on @stellar/stellar-sdk 17.4.0 |
| `web/make-ticket.mjs` | Command line helper to make a key and sign a ticket | Done |
| Web app (sender, household and shop screens) | | **Not built yet** |
| Testnet deployment | | **Not done yet.** The contract was tested natively, not built to wasm or deployed |

## Run the tests

```bash
cargo test                 # contract, 17 tests
cd web && npm install && npm test   # ticket code, 3 tests
```

One contract test (`browser_and_contract_agree_on_a_ticket`) feeds the contract a signature produced by `web/ticket.mjs`, so the two sides are known to agree on the ticket bytes.

## Deploy to Testnet

These commands were written from the Stellar CLI documentation and **were not run** where this repo was prepared. Check flags with `stellar contract deploy --help` if one fails. Use a current Stellar CLI. Testnet is on Protocol 30.

```bash
# tools, once
rustup target add wasm32v1-none
# install the Stellar CLI: https://developers.stellar.org/docs/tools/cli/install-cli

# three funded Testnet accounts
stellar keys generate admin  --network testnet --fund
stellar keys generate sender --network testnet --fund
stellar keys generate shop   --network testnet --fund

# build
stellar contract build

# token for the first smoke test: native XLM through its asset contract (no trustlines needed)
TOKEN=$(stellar contract id asset --asset native --network testnet)

# deploy with constructor arguments (fee is 50 basis points = 0.5%)
ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/open_tab.wasm \
  --source admin --network testnet \
  -- --admin admin --token $TOKEN --treasury admin --fee_bps 50)
echo $ID
```

### Smoke test from the command line

```bash
cd web && npm install
node make-ticket.mjs key          # prints recipient_key as 64 hex characters
cd ..

# open a tab of 50 units (7 decimals), valid for 7 days
stellar contract invoke --id $ID --source sender --network testnet -- open \
  --sender sender --shop shop \
  --recipient_key <64 hex from above> \
  --amount 500000000 \
  --expires_at $(( $(date +%s) + 604800 ))
# returns the tab id, 1 on a fresh contract

# household signs a running total of 12.5 units
node web/make-ticket.mjs sign $ID 1 125000000

# shop redeems it
stellar contract invoke --id $ID --source shop --network testnet -- settle \
  --tab_id 1 --cumulative 125000000 --signature <128 hex from the ticket>

stellar contract invoke --id $ID --source shop --network testnet -- get_tab --tab_id 1
```

For the demo, replace native XLM with a dollar fixture: Circle Testnet USDC, or your own clearly labelled test asset. Get its contract id with `stellar contract id asset --asset CODE:ISSUER --network testnet` and redeploy with that `--token`. Sender and shop need trustlines to a classic asset.

## Contract interface

| Function | Who must sign | What it does |
| --- | --- | --- |
| `open(sender, shop, recipient_key, amount, expires_at) -> tab_id` | Sender | Deposits, names one shop and one household key |
| `top_up(tab_id, from, amount)` | Whoever pays | Adds money to a live tab |
| `settle(tab_id, cumulative, signature) -> paid` | Shop | Verifies the household signature over the running total, pays the difference, takes the fee |
| `close(tab_id) -> refunded` | Nobody after expiry. The shop before expiry | Returns the unspent balance to the sender |
| `extend(tab_id, new_expires_at)` | Sender | Moves expiry later, never earlier |
| `rotate_key(tab_id, new_key)` | Sender and shop | Replaces the household key after a lost phone |
| `ticket_message(tab_id, cumulative) -> bytes` | Nobody | The exact bytes a ticket signs |
| `get_tab(tab_id)`, `config()` | Nobody | Read state |

### Ticket format

```
"OPENTAB1"                       8 bytes, ASCII
contract address (C...)         56 bytes, ASCII
tab id                           8 bytes, big endian u64
running total                   16 bytes, big endian i128, in stroops (7 decimals)
```

The signature is plain Ed25519 over those 88 bytes, made with a Stellar keypair. The household key never needs an on-chain account or any XLM.

## What the tests prove

- Many purchases settle in one payment.
- A later ticket pays only the difference. Old tickets pay nothing.
- A ticket signed by anyone else is rejected.
- The shop cannot raise a signed total.
- A ticket for one tab does not work on another.
- Spending cannot exceed what was deposited. A top up raises the limit.
- The fee comes out of the shop's share.
- The sender cannot pull money before expiry without the shop.
- After expiry anyone can refund the remainder, and tickets stop working.
- Rotating the key disables the old phone.
- Every unit deposited ends up with the sender, the shop or the treasury.
- A ticket signed by the browser code is accepted by the contract.

## Known limits

- The household needs a phone with a browser. It does not need signal at the moment of purchase.
- The shop receives a digital dollar token. Turning that into local money needs a licensed payout partner, which this prototype does not have.
- The shop must redeem before the tab expires. The app should stop taking tickets a day before expiry.
- A stolen household phone can spend only at the one named shop, up to the remaining balance, until the key is rotated.
- The contract is unaudited.

## Disclosure

Parts of this code were written with AI assistance.
