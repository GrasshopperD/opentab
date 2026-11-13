"use client";
import { formatLocal, formatTokenAmount } from "@opentab/shared";
import { Online, QR, Scanner } from "../components";
import { MERCHANTS, TOKEN_CODE, INVITES_UI } from "@/lib/config";
import { useFamilyWallet } from "./use-family-wallet";

// Demo Mode Family Wallet. All state, storage, Stellar checks and offline signing live in useFamilyWallet (shared with
// Product Mode /wallet); this file is presentation only.
export default function Family() {
  const {
    sk, fam, name, fp, pairingCode, synced, connected, check, hist, paying, inv, err, authQR, known, expMin, thisApproval,
    refresh, setup, deleteKey, changeFam, changeName, onInvoice, approve, startPay, endPay, cancelReview,
  } = useFamilyWallet();
  const pairingQR = sk ? <QR value={pairingCode} label="Pairing code" /> : null;
  const syncLine = synced && (check === "ok"
    ? `Confirmed on Stellar at ${new Date(synced.at).toLocaleTimeString()}.`
    : `Last synced with Stellar ${new Date(synced.at).toLocaleString()}${check === "offline" ? " · you are offline, so this is not a fresh check" : ""}.`);

  // ---------------- Scan to Pay: scan -> review -> signed approval ----------------
  if (paying) {
    const step = authQR ? 2 : inv ? 1 : 0;
    return (
      <>
        <h1>Family Wallet <Online /></h1>
        <ol className="progress" style={{ gridTemplateColumns: "repeat(3, 1fr)" }} aria-label="Payment steps">
          {["Scan merchant QR", "Review payment", "Show approval"].map((s, i) => <li key={s} className={i < step ? "done" : i === step ? "on" : ""}>{i + 1}. {s}</li>)}
        </ol>
        <div className="card">
          {step === 0 && (
            <>
              <h2>Step 1 · Scan merchant QR</h2>
              <p className="muted">Point the camera at the shop&apos;s invoice QR. No internet needed: this phone checks and signs locally.</p>
              <Scanner prompt="Open camera" onResult={onInvoice} autoStart />
              {err && <div className="status bad">{err}</div>}
              <button className="btn ghost" onClick={endPay}>← Back to wallet</button>
            </>
          )}
          {step === 1 && inv && (
            <>
              <h2>Step 2 · Review payment</h2>
              <dl className="kv">
                <dt>Merchant</dt><dd><b>{inv.merchantName}</b>{known ? "" : " (unlisted)"}<br /><code>{inv.merchant.slice(0, 8)}…{inv.merchant.slice(-6)}</code></dd>
                {inv.quote.items && <><dt>Items</dt><dd data-testid="items">{inv.quote.items.map((i, k) => <div key={k}>{i.name} × {i.qty} @ {inv.quote.currency} {formatLocal(i.unitMinor, inv.quote.minorDigits)}</div>)}</dd></>}
                <dt>{inv.quote.items ? "Total" : "Price"}</dt><dd><b>{inv.quote.currency} {formatLocal(inv.quote.localMinor, inv.quote.minorDigits)}</b></dd>
                <dt>You pay</dt><dd><b>{formatTokenAmount(inv.amount, 7)} {TOKEN_CODE}</b></dd>
                <dt>Paid from</dt><dd>Family #{fam} wallet</dd>
              </dl>
              <p className="muted">Rate {inv.quote.rate} {inv.quote.currency} per demo USD ({inv.quote.source === "ILLUSTRATIVE" ? "illustrative, not live" : inv.quote.source}) · expires in ~{expMin} min · terminal #{inv.terminalId}</p>
              {err && <div className="status bad">{err}</div>}
              <button className="btn xl" disabled={!fam} onClick={approve}>Approve Payment</button>
              <button className="btn ghost" onClick={cancelReview}>Cancel</button>
            </>
          )}
          {step === 2 && (
            <>
              <h2>Payment Authorized</h2>
              <p><b>Show this QR code to the merchant to complete your purchase.</b></p>
              <QR value={authQR} label="Signed payment approval for the shop" />
              {thisApproval?.settled
                ? <div className="status ok">✓ Settled on Stellar. The shop has been paid.</div>
                : <div className="status pending">Waiting for merchant settlement.</div>}
              <p className="muted">This approval is not a payment yet. It works only for this shop, this amount and this invoice, once; the shop submits it to Stellar.</p>
              <button className="btn ghost" onClick={endPay}>← Back to wallet</button>
            </>
          )}
        </div>
      </>
    );
  }

  // ---------------- Connected wallet dashboard ----------------
  if (connected && synced) {
    return (
      <>
        <h1>Family Wallet <Online /></h1>
        <div className="card">
          <p className="muted">Family #{fam} · this phone is authorized</p>
          <p className="label">Available balance</p>
          <div className="big">{formatTokenAmount(BigInt(synced.balance))} <span className="muted">{TOKEN_CODE}</span></div>
          <p className="muted">{syncLine} Shared family balance; Stellar decides what can be spent.{" "}
            <button className="linkbtn" onClick={refresh}>{check === "checking" ? "Checking…" : "Refresh balance"}</button></p>
          <button className="btn xl" onClick={startPay}>Scan to Pay</button>
          <p className="muted">Works without internet at participating shops: {MERCHANTS.map((m) => m.name).join(", ")}.</p>
        </div>

        <div className="card">
          <h2>Recent payments</h2>
          {!hist.length ? <p className="muted">No payments approved on this phone yet.</p> : (
            <ul className="list">{hist.map((h) => (
              <li key={h.invoiceId + h.at}>{h.local} → {formatTokenAmount(BigInt(h.amount))} {TOKEN_CODE} at {h.merchant}<br />
                {h.settled ? <span className="settled">✓ Settled on Stellar</span>
                  : <span className="waiting">Approved on this phone · waiting for the shop to settle{h.familyId ? "" : " (older entry)"}</span>}</li>
            ))}</ul>
          )}
        </div>

        <details className="card">
          <summary>Device settings</summary>
          <p>Security code: <span className="fp">{fp}</span></p>
          <h3>Pairing code</h3>
          <p className="muted">Show this to a sender to authorize this device again or for another family. It contains only the public key.</p>
          {pairingQR}
          <label>Family number (from the sender)</label>
          <input inputMode="numeric" value={fam} onChange={(e) => changeFam(e.target.value.replace(/\D/g, ""))} />
          <label>Your name (shown to the sender)</label>
          <input value={name} onChange={(e) => changeName(e.target.value)} />
          <p className="warn">Testnet demo: the signing key is stored unencrypted in this browser and has no backup. Replacing or deleting it means the sender must pair this phone again.</p>
          <button className="btn danger small" onClick={setup}>Replace key</button>
          <button className="btn danger small" onClick={deleteKey}>Delete key</button>
        </details>
      </>
    );
  }

  // ---------------- Onboarding: set up -> connect -> confirm ----------------
  return (
    <>
      <h1>Welcome to your Family Wallet <Online /></h1>
      <p className="lead">Connect to your family to start spending.</p>
      <div className="stepper" aria-label="Setup progress">
        <span className={sk ? "on" : ""} /><span className={sk && fam ? "on" : ""} /><span className={connected ? "on" : ""} />
      </div>

      <div className="card">
        <h2>1 · Set up this device</h2>
        {!sk ? (
          <>
            <p className="muted">Creates a signing key on this phone. Only its public part is ever shared.</p>
            <label>Your name (shown to the sender)</label>
            <input value={name} onChange={(e) => changeName(e.target.value)} placeholder="e.g. Ana" />
            <button className="btn" onClick={setup}>Create my key</button>
          </>
        ) : <p className="done-step">✓ This device has its signing key.</p>}
      </div>

      <div className={"card" + (sk ? "" : " dim")}>
        <h2>2 · Connect to your family</h2>
        {!sk ? <p className="muted">Available after step 1.</p> : (
          <>
            <label>Family number (from the sender)</label>
            <input inputMode="numeric" value={fam} onChange={(e) => changeFam(e.target.value.replace(/\D/g, ""))} />
            {INVITES_UI && <p className="muted">Or open the invitation link from your sender.</p>}
            <p>Show this pairing code to your sender. They open <b>Sender → Pair Family Member</b> and scan it.</p>
            <p>Security code: <span className="fp">{fp}</span></p>
            {pairingQR}
          </>
        )}
      </div>

      <div className={"card" + (sk && fam ? "" : " dim")}>
        <h2>3 · Confirm connection</h2>
        {!sk || !fam ? <p className="muted">Available after step 2.</p> : (
          <>
            {check === "checking" && !synced && <div className="status pending">Checking Stellar…</div>}
            {synced && !synced.keyActive && check !== "offline" && (
              <div className="status pending">Waiting for your sender to authorize this device on Stellar for Family #{fam} (not authorized yet, or the authorization was revoked). This page checks automatically.</div>
            )}
            {check === "FamilyNotFound" && <div className="status bad">Family #{fam} does not exist on this vault. Check the number with your sender.</div>}
            {check && !["ok", "checking", "offline", "FamilyNotFound"].includes(check) && <div className="status bad">Could not check Stellar ({check}). Try again.</div>}
            {check === "offline" && (
              <>
                <div className="status pending">You are offline, so this device cannot confirm its authorization yet. Connect once after your sender pairs it.</div>
                <p className="muted">Already authorized by your sender? You can still pay; the payment only goes through if Stellar confirms this device is authorized.</p>
                <button className="btn ghost small" onClick={startPay}>Scan to Pay anyway</button>
              </>
            )}
            <button className="btn ghost small" onClick={refresh}>Check again</button>
          </>
        )}
      </div>

      {hist.length > 0 && (
        <details className="card">
          <summary>Payments approved on this phone ({hist.length})</summary>
          <ul className="list">{hist.map((h) => (
            <li key={h.invoiceId + h.at}>{h.local} → {formatTokenAmount(BigInt(h.amount))} {TOKEN_CODE} at {h.merchant}<br />
              {h.settled ? <span className="settled">✓ Settled on Stellar</span> : <span className="waiting">Approved on this phone · waiting for the shop to settle</span>}</li>
          ))}</ul>
        </details>
      )}
      {sk && (
        <details className="card">
          <summary>Device settings</summary>
          <p className="warn">Testnet demo: the signing key is stored unencrypted in this browser and has no backup.</p>
          <button className="btn danger small" onClick={setup}>Replace key</button>
          <button className="btn danger small" onClick={deleteKey}>Delete key</button>
        </details>
      )}
    </>
  );
}
