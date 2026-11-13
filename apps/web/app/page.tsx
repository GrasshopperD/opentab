import Link from "next/link";
import { VAULT_ID, EXPLORER_CONTRACT, TOKEN_LABEL, isConfigured } from "@/lib/config";

export default function Home() {
  return (
    <>
      <h1>Your support.<br />Their everyday essentials.</h1>
      <p className="lead">Send funds to a shared family spending balance. Loved ones can pay participating local merchants, even when their phone is offline.</p>
      {!isConfigured() && <div className="status bad">This deployment is not configured with a FamilyVault contract. Nothing below will show live data.</div>}
      <div className="grid3">
        <Link href="/sender" className="card role"><h2>Sender</h2><p className="muted">See your family&apos;s balance, add funds, and pair a family member&apos;s phone.</p></Link>
        <Link href="/family" className="card role"><h2>Family</h2><p className="muted">Scan a shop&apos;s invoice and approve it on your phone, no mobile data needed.</p></Link>
        <Link href="/shop" className="card role"><h2>Shop</h2><p className="muted">Select a product, show the invoice, scan the approval, get settled on Stellar.</p></Link>
      </div>
      <div className="card">
        <h2>How a purchase works</h2>
        <ol className="steps">
          <li>The shop (online) shows an invoice QR: local price and the exact {TOKEN_LABEL} charge.</li>
          <li>The family member&apos;s phone (can be offline) checks it and signs an approval for exactly that shop, amount and invoice.</li>
          <li>The shop scans the approval and submits it to the FamilyVault contract on Stellar.</li>
          <li>The contract checks the signature, the invoice has never been used, and the balance, then pays the shop. Only then does the shop see <b>Payment confirmed</b>.</li>
        </ol>
      </div>
      <div className="card">
        <h2>What this prototype is, honestly</h2>
        <ul className="steps">
          <li>Runs on <b>Stellar Testnet</b> with <b>{TOKEN_LABEL} (OTUSD)</b>: a test token with no value. It is not USDC.</li>
          <li>Exchange rates are <b>illustrative</b>, not live quotes. No bank payouts exist yet.</li>
          <li>Works now: customer offline + shop online. Planned: both offline with merchant-reserved funds.</li>
          <li>Sender and shop accounts are demo Testnet identities operated by this server. The family key lives only in the phone&apos;s browser.</li>
        </ul>
        {VAULT_ID && <p className="muted">Contract: <a href={EXPLORER_CONTRACT + VAULT_ID} target="_blank" rel="noreferrer"><code>{VAULT_ID}</code></a></p>}
      </div>
    </>
  );
}
