import Link from "next/link";
import { Fragment } from "react";
import type { Metadata } from "next";
import { EXPLORER_CONTRACT, EXPLORER_TX, MERCHANTS, TOKEN_CODE, TOKEN_ID, TOKEN_LABEL, VAULT_ID } from "@/lib/config";
import { EVIDENCE, TOKEN_ISSUER } from "@/lib/evidence";
import { Preflight } from "./preflight";

export const metadata: Metadata = { title: "OpenTab Global: judge demo" };

const FLOW = [
  { who: "Sender", where: "abroad, online", what: "Funds the shared family balance" },
  { who: "Shop", where: "online", what: "Shows an invoice QR: local price + exact charge" },
  { who: "Family phone", where: "OFFLINE", what: "Checks it and signs that exact purchase" },
  { who: "Shop", where: "online", what: "Scans the approval and submits it" },
  { who: "Stellar", where: "FamilyVault contract", what: "Verifies and pays the shop, once" },
];

export default function Demo() {
  return (
    <>
      <p className="eyebrow">Judge demo</p>
      <h1>Pay at the corner shop with a phone that has no data.</h1>
      <p className="lead">A relative abroad funds a family balance on Stellar. At a participating shop, the family member approves the
        purchase on their phone while offline; the connected shop submits that approval and is paid by a smart contract.</p>

      <section className="card" aria-labelledby="flow-h">
        <h2 id="flow-h">The payment flow</h2>
        <ol className="flow">
          {FLOW.map((s, i) => (
            <li key={i} className={s.where === "OFFLINE" ? "offline" : ""}>
              <span className="n">{i + 1}</span>
              <div><b>{s.who}</b> <span className="where">{s.where}</span><br />{s.what}</div>
            </li>
          ))}
        </ol>
        <p className="muted">The shop sees <b>Payment confirmed</b> only after the Stellar transaction succeeds. A second attempt
          with the same approval is refused by the contract.</p>
      </section>

      <section className="grid3" aria-label="Try each role">
        <Link href="/sender" className="card role"><h2>1 · Sender</h2><p className="muted">Create and fund a family, pair a phone. Needs the demo access code.</p></Link>
        <Link href="/family" className="card role"><h2>2 · Family phone</h2><p className="muted">Create a key, scan an invoice, approve offline. Public.</p></Link>
        <Link href="/shop" className="card role"><h2>3 · Shop</h2><p className="muted">Price in pesos, scan the approval, settle on Stellar. Needs the access code.</p></Link>
      </section>

      <section className="card" aria-labelledby="crypto-h">
        <h2 id="crypto-h">How an offline approval can be trusted</h2>
        <ul className="steps">
          <li>The phone creates an Ed25519 key. Only the public key is shared; the sender registers it on chain.</li>
          <li>Approving builds a fixed 340-byte message: Testnet ID, this contract, the token, family, shop, terminal, a random
            invoice ID, the exact amount, a hash of the local price and rate, and an expiry. The phone signs it locally, with no network.</li>
          <li>The contract rebuilds the same bytes from its own state, verifies the signature, refuses used or expired invoices,
            checks the balance, and transfers the tokens in one atomic transaction.</li>
          <li>Change any field (amount, shop, network) and the signature no longer verifies.</li>
        </ul>
      </section>

      <section className="card" aria-labelledby="modes-h">
        <h2 id="modes-h">What works today vs. what is next</h2>
        <div className="modes">
          <div className="mode live"><span className="pill ok">Live on Testnet</span>
            <h3>Connected shop, offline customer</h3>
            <p>One shared family balance spendable at any participating shop with internet. This is what the demo shows.</p></div>
          <div className="mode planned"><span className="pill off">In development</span>
            <h3>Both offline</h3>
            <p>Funds reserved on chain for one named shop; the shop accepts running-total tickets offline and settles later.
              Contract written and unit-tested (24 tests); not deployed and not part of this demo.</p></div>
        </div>
      </section>

      <section className="card" aria-labelledby="ev-h">
        <h2 id="ev-h">Verified on Stellar Testnet</h2>
        <dl className="kv">
          <dt>FamilyVault</dt><dd><a href={EXPLORER_CONTRACT + VAULT_ID} target="_blank" rel="noreferrer"><code>{VAULT_ID}</code></a></dd>
          <dt>Asset</dt><dd>{TOKEN_LABEL} ({TOKEN_CODE}): Testnet only, no value, <b>not USDC</b></dd>
          <dt>Asset contract</dt><dd><code>{TOKEN_ID}</code></dd>
          {TOKEN_ISSUER && <><dt>Issuer</dt><dd><code>{TOKEN_ISSUER}</code></dd></>}
          {MERCHANTS.map((m) => <Fragment key={m.id}><dt>{m.name}</dt><dd><code>{m.address}</code></dd></Fragment>)}
        </dl>
        <ul className="list">
          {EVIDENCE.map((e) => (
            <li key={e.hash}><b>{e.label}</b><br /><span className="muted">{e.detail}</span><br />
              <a className="txlink" href={EXPLORER_TX + e.hash} target="_blank" rel="noreferrer">Open on Stellar Expert ↗ <code>{e.hash.slice(0, 10)}…</code></a></li>
          ))}
        </ul>
      </section>

      <Preflight />

      <p className="muted">Exchange rates are illustrative, not live quotes. No bank payouts exist. Unaudited prototype; not a financial service.</p>
    </>
  );
}
