# Live release evidence

**Rule:** fill a field only with a value that was actually observed (copied from CLI/explorer/browser output).
Never invent IDs, URLs or hashes. Explorer: `https://stellar.expert/explorer/testnet/tx/<hash>`.

| Item | Value | Verified on | Status |
|---|---|---|---|
| Public GitHub repository URL | `TBD` (private repo `opentab` exists; no remote configured; not pushed) | - | NOT PUBLISHED |
| Vercel application URL | `TBD` | - | NOT DEPLOYED |
| Network | Stellar Testnet (`Test SDF Network ; September 2015`), RPC `https://soroban-testnet.stellar.org` | 2026-11-12 | LIVE |
| **FamilyVault contract ID** | `CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW` | 2026-11-12 | DEPLOYED |
| FamilyVault WASM hash | `e3aac2d991c2c061c134100eefee86db7fbb006b553a1a37d650bc6c8db11190` (14,548 bytes) | 2026-11-12 | BUILT |
| Deploy transaction | `86f91a10b0203358b1f58c95411c3f811af0d868b68ac96c885c86fc07ea5949` | 2026-11-12 | CONFIRMED |
| **Settlement asset** | **OpenTab Demo USD**, code `OTUSD`, issuer `GCZDLLF3OYZVD5HDKN3DRP475ICCKMRN6Q3PHNMTILABZWSGWPS5RCAY`, Stellar Asset Contract `CC6JPD3NL3ZJMWT2JG246ISOG5QB2N72BG77KPVC3OCDEYUHK2TEPL73`, 7 decimals. **Testnet-only, non-redeemable, NOT USDC, no monetary value.** (Circle Testnet USDC needs a manual web faucet; deferred.) | 2026-11-12 | LIVE |
| Admin (deployer) | `GA2GMTC4QN6XKON6CQX6SQSPCSRNY7NGZPXONGDUZBRBUEGJTGK4LXOM` | 2026-11-12 | - |
| Sender | `GBC7D7XKWZZYJ7BRMZGBP44ASRG2ATAKKNI227XA5C4HBHTPRUN5F235` (issued 1,000 OTUSD) | 2026-11-12 | - |
| Merchant A | `GCDSS6VQP6GGTV6K2J6FMG2TQN2G2EG37TSQ5UYQK547ODDYGNPPRWN4` | 2026-11-12 | - |
| Merchant B | `GBIIBDC4PM237AP57I42FO4GGKDUC53ZAQXIOOALVFBNCOLDULKJGEAI` | 2026-11-12 | - |
| Family 1 created | tx `48ef5079c02f05d0a300cacd6e7ab3d69e582cc1f655640e664823bf4b73e67b` | 2026-11-12 | CONFIRMED |
| Deposit 100 OTUSD into family 1 | Deposited event observed; balance read back `1000000000` | 2026-11-12 | CONFIRMED |
| Recipient key registered | pubkey `08e3088e2095f2c939e42d2c6ddcc8dfdb7f0d6d9b67d776160052c26521f6b2`, tx `0a25bee9a98190f72499c2cff89f09a6e97141249e57851e57af5b315074553e` | 2026-11-12 | CONFIRMED |
| **Signed merchant payment #1** (MXN 100.00 at illustrative 18.42 -> 5.4288817 OTUSD, Merchant A, terminal 1) | tx **`0b8d72ed8e267ca31f2fe7179f5afbdcb7586e2c887c18a90a7d2c3b63bbb05f`**. Merchant A balance 0 -> `54288817`; family balance 100.0000000 -> `945711183` | 2026-11-12 | CONFIRMED |
| Replay of payment #1 (same auth + signature) | Rejected at simulation: `HostError: Error(Contract, #4)` = `InvoiceUsed`. Merchant balance unchanged at `54288817` | 2026-11-12 | REJECTED (as intended) |
| Wrong merchant (Merchant B submits #1's signature with merchant swapped, fresh invoice id) | Rejected: `Error(Crypto, InvalidInput)` (signature does not verify) | 2026-11-12 | REJECTED (as intended) |
| **Signed payment #2, same family balance, Merchant B** (MXN 50.00 -> 2.7144409 OTUSD, terminal 7) | tx `009cc536cc3d8c88445b4a07b5d6de0189b843544c0d3ce9a57bddf87280e5f3`; Merchant B `27144409`; family `918566774` | 2026-11-12 | CONFIRMED |
| Overspend / expired / invalid signature | Covered by Rust unit tests (34 passing), not run on chain | 2026-11-12 | LOCAL TESTS |
| One-minute demonstration video URL | `TBD` | - | NOT RECORDED |
| Devpost submission URL + confirmation | `TBD` | - | NOT SUBMITTED |
| Organizer one-page overview submission | `TBD` | - | NOT SUBMITTED |

Exchange rate used (18.42 MXN per demo USD) is **illustrative**, not a live quote.

## Verify yourself

```bash
stellar contract invoke --id CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW --network testnet --source <any-identity> --send=no -- get_family --family_id 1
stellar contract invoke --id CC6JPD3NL3ZJMWT2JG246ISOG5QB2N72BG77KPVC3OCDEYUHK2TEPL73 --network testnet --source <any-identity> --send=no -- balance --id GCDSS6VQP6GGTV6K2J6FMG2TQN2G2EG37TSQ5UYQK547ODDYGNPPRWN4
```
