# Hosting and phone demonstration guide

## Accounts to prepare now

1. **GitHub**: one public repository named `opentab-global`; do not commit provider keys, wallet seeds, household secrets or actual customer data. Add every collaborator.
2. **Vercel**: create/log in; later import the GitHub repository as a new Vercel project. Set the *Root Directory* to `apps/web` once that Next.js app has been generated. Use Vercel-generated HTTPS URL for judging; custom domain optional.
3. **Devpost**: ensure correct team members are registered. Begin draft before the cutoff. Submission goes to https://blockchain-stellar-ic.devpost.com/.
4. **Stellar tools**: development machine with Node.js matching SDK requirements, npm, Git, Rust and WASM target, current Stellar CLI. Have an isolated Testnet identity only, never real funds or production keys.
5. **Optional Supabase**: prepare a project if the plan needs users/invoices; don't delay the first Testnet transaction to implement full authentication.
6. **Public video host**: YouTube unlisted/publicly viewable or Loom with a link judges can open logged out. Do not use private links.

## Vercel deployment, after Claude writes the Next.js app

- Push the working repository to GitHub.
- In https://vercel.com/new import the repository.
- Framework: Next.js; Root Directory: `apps/web` (the actual path matters).
- Configure client-side Testnet contract addresses with `NEXT_PUBLIC_` ONLY for public identifiers; never put wallet seeds or provider secrets there. Store server secrets in Vercel server-side environment variables only.
- Ensure browser-based Stellar signing remains on the client. Check the app in a fresh anonymous/private browser.
- Make sure API handlers, service workers and offline page resources run on HTTPS. Serverless functions are **not** a perpetual background process; don't design them as permanent chain polling workers.

## Phone-app display

A Progressive Web App is a website with a manifest, app icons, an HTTPS origin and a functioning service worker/cache strategy. For OpenTab the offline signer and QR screen must be genuinely cached and require no network after activation. IndexedDB access must be tested in airplane mode and after phone reboot.

- Android: open deployed URL in Chrome, use `Install app` / `Add to Home screen`.
- iPhone: open deployed URL in Safari, Share > `Add to Home Screen` (if available).
- Test physical devices, not just desktop browser emulator. iOS limitations may affect camera use, local storage and private-key persistence.
- Demo props: customer phone, merchant phone or laptop, optional second shop terminal. Connect merchant to Wi-Fi. Put customer in airplane mode. Show QR signing without internet, merchant on-chain submission, then explorer confirmation.
- For Mode B, if demonstrated: both devices need app cached first, separate funded channel verified in advance, later reconnect merchant to redeem. Do not falsely label an unconfirmed voucher as settled.

Official platform docs:
- https://nextjs.org/docs/app/guides/progressive-web-apps
- https://nextjs.org/docs/app/getting-started/deploying
- https://vercel.com/docs/deployments/overview

## What does *not* require an account before the MVP

- Apple Developer Program, Google Play Console, App Store review, domain name purchase, real bank accounts in Mexico, BVNK/Conduit/MoneyGram production API access or card issuance. The judged prototype can be a verifiable TESTNET application and an installable PWA.
