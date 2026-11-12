# One-minute demo script (real footage only)

**Setup before recording:** unlock Sender and Shop with the demo access code (server env `DEMO_ACCESS_CODE`). App running (local or Vercel) on a laptop (= shop, online) and a phone (= family).
On the phone, open `/family` once while online, create the key, enter the family number, and make sure the sender has
authorized it (Sender → scan pairing code → Authorize). Have Stellar Expert open in a tab.

| Time | Screen | Narration (spoken) |
|---|---|---|
| 0:00-0:08 | Sender page: family balance on chain | "Maria in Toronto funds her family's OpenTab balance on Stellar. This is the real on-chain balance." |
| 0:08-0:16 | Shop page: type MXN 100, show exact OTUSD charge, invoice QR | "At the corner shop in Oaxaca, the owner prices in pesos. The app shows the exact demo-dollar charge." |
| 0:16-0:22 | Phone: swipe down, **turn on airplane mode** visibly | "Her daughter's phone has no data." |
| 0:22-0:32 | Phone: scan invoice, review screen, Approve, approval QR | "She scans, checks the shop and amount, and approves. The phone signs locally. It says authorized, not paid." |
| 0:32-0:42 | Shop: scan approval, Submit to Stellar, "Payment confirmed" | "The shop submits it. The FamilyVault contract checks the signature and balance and pays the shop." |
| 0:42-0:50 | Click explorer link: transaction on Stellar Expert | "Here is the confirmed Testnet transaction." |
| 0:50-0:58 | Shop: "Replay test: try to charge again" → rejected | "Trying to charge the same approval again fails. The contract allows each invoice once." |
| 0:58-1:00 | Landing page | "OpenTab Global: their everyday essentials, even offline." |

**Caption on screen throughout:** "Stellar Testnet · demo token, no monetary value · illustrative exchange rate".

**Not yet verified, check before recording:** camera scanning on the specific phone, and that `/family` loads from cache in
airplane mode. If the camera fails, use the "Copy as text / Paste code" fallback and say so; do not fake the scan.
