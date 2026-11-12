# Live demo and on-site preparation

## 60-second demo outline (adapt to real working build)

- 0–10s: Introduce senders/families and payment barrier; show testnet-funded allowance.
- 10–22s: Merchant creates invoice in connected terminal; customer phone is visibly offline.
- 22–35s: Customer scans and signs exact requested token amount, shows a new signed QR.
- 35–47s: Merchant scans; show genuine Stellar transaction and updated on-chain balance.
- 47–54s: Try replaying the same signed QR; contract rejects it.
- 54–60s: Show actual contract ID/explorer proof and briefly name second offline-merchant mode, **only if truly built/tested**.

## Practical show-kit

- [ ] Two charged phones and one laptop
- [ ] Customer phone PWA installed and preloaded, offline mode tested
- [ ] Merchant phone/laptop online via stable Wi-Fi/hotspot
- [ ] Permission for camera and QR scan checked
- [ ] Pre-funded Stellar Testnet account and correct token issuer
- [ ] Demo merchant and family records seeded with test identities
- [ ] Public contract address and live explorer transaction link
- [ ] Screen recording and one-minute public demo video on device as backup
- [ ] Printed QR to URL and GitHub; trifold board
- [ ] A second flow if the Testnet RPC or venue Wi-Fi is temporarily unavailable, clearly labeled as replay/video not a live transaction

## Do not misrepresent

- 'Signed' != 'Settled'; show intermediate pending status.
- A demo fiat quote != an actual bank payout.
- A simulated token != redeemable Circle USDC.
