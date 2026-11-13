"use client";
import { useCallback, useEffect, useState } from "react";
import {
  encodeAuthQR, encodePairingQR, fingerprint, formatLocal, formatTokenAmount, fromHex, generateSecretKey,
  parseInvoiceQR, publicKeyOf, signInvoice, toHex, type Invoice,
} from "@opentab/shared";
import { api, Online, QR, Scanner } from "../components";
import { MERCHANTS, TOKEN_CODE, TOKEN_ID, VAULT_ID, INVITES_UI } from "@/lib/config";

// TESTNET DEMO KEY STORAGE: the private key is kept in this browser's localStorage.
// It never leaves the device. This is NOT production-grade custody.
const SK = "opentab.family.sk", FAM = "opentab.family.id", NAME = "opentab.family.name", HIST = "opentab.family.history";
// Last answer from Stellar for THIS family + key (balance and authorization) and when it was read. Lets a connected
// phone open its wallet offline without re-pairing; always shown as "last synced", never as freshly checked.
const SYNC = "opentab.family.sync";
const get = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

interface Hist { invoiceId: string; familyId?: string; merchant: string; amount: string; local: string; at: number; status: "AUTHORIZED_LOCALLY"; settled?: boolean }
interface Sync { fam: string; pub: string; balance: string; keyActive: boolean; at: number }
/** "" = not checked yet this visit; "checking"; "ok" = Stellar answered now; "offline"; otherwise an API error code. */
type Check = "" | "checking" | "ok" | "offline" | string;

export default function Family() {
  const [sk, setSk] = useState("");
  const [fam, setFam] = useState("");
  const [name, setName] = useState("");
  const [sync, setSync] = useState<Sync | null>(null);
  const [check, setCheck] = useState<Check>("");
  const [paying, setPaying] = useState(false);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [err, setErr] = useState("");
  const [authQR, setAuthQR] = useState("");
  const [hist, setHist] = useState<Hist[]>([]);

  useEffect(() => {
    const k = get(SK); setSk(/^[0-9a-f]{64}$/.test(k) ? k : ""); setFam(/^\d{1,12}$/.test(get(FAM)) ? get(FAM) : ""); setName(get(NAME));
    try { setHist(JSON.parse(get(HIST) || "[]")); } catch { }
    try { const s = JSON.parse(get(SYNC) || "null"); if (s && typeof s.fam === "string" && typeof s.pub === "string") setSync(s); } catch { }
  }, []);
  const pub = sk ? toHex(publicKeyOf(fromHex(sk))) : "";
  const synced = sync && sync.fam === fam && sync.pub === pub ? sync : null;   // cache is only valid for this family + key
  const connected = !!sk && !!fam && synced?.keyActive === true;

  const refresh = useCallback(async () => {
    if (!fam || !pub) return;
    if (!navigator.onLine) { setCheck("offline"); return; }
    setCheck("checking");
    const r = await api(`/api/family/${fam}?key=${pub}`);
    if (r.error) { setCheck(r.error === "NetworkError" ? "offline" : r.error); return; }
    const s: Sync = { fam, pub, balance: String(r.family.balance), keyActive: r.keyActive === true, at: Date.now() };
    setSync(s); set(SYNC, JSON.stringify(s)); setCheck("ok");
  }, [fam, pub]);
  useEffect(() => { refresh(); }, [refresh]);

  // Onboarding step 3: while waiting for the sender, re-check Stellar every few seconds (online, page visible).
  useEffect(() => {
    if (connected || !sk || !fam) return;
    const t = setInterval(() => { if (navigator.onLine && document.visibilityState === "visible") refresh(); }, 5000);
    return () => clearInterval(t);
  }, [connected, sk, fam, refresh]);

  // When online, ask the chain whether each local approval has been settled by the shop.
  const checkSettled = useCallback(async () => {
    if (!navigator.onLine) return;
    const pending = hist.filter((h) => !h.settled && h.familyId && /^[0-9a-f]{64}$/.test(h.invoiceId));
    if (!pending.length) return;
    const results = await Promise.all(pending.map((h) => api(`/api/invoice?family=${h.familyId}&id=${h.invoiceId}`)));
    if (!results.some((r: any) => r.used === true)) return;
    const used = new Set(pending.filter((_, i) => (results[i] as any).used === true).map((h) => h.invoiceId));
    const nh = hist.map((h) => used.has(h.invoiceId) ? { ...h, settled: true } : h);
    setHist(nh); set(HIST, JSON.stringify(nh));
  }, [hist]);
  useEffect(() => {
    checkSettled();
    const on = () => { refresh(); checkSettled(); };
    const off = () => setCheck("offline");   // the shown balance is now a last-synced value, not a fresh check
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [checkSettled, refresh]);
  // While the signed approval is on screen and the phone happens to be online, notice the shop's settlement.
  useEffect(() => {
    if (!authQR) return;
    const t = setInterval(checkSettled, 5000);
    return () => clearInterval(t);
  }, [authQR, checkSettled]);

  function setup() {
    if (sk && !confirm("Replace this phone's key? Any family must re-authorize the new key.")) return;
    const k = toHex(generateSecretKey()); set(SK, k); setSk(k);
  }
  const changeFam = (v: string) => { setFam(v); set(FAM, v); setCheck(""); };
  const onInvoice = useCallback((t: string) => {
    setErr(""); setAuthQR("");
    try {
      const i = parseInvoiceQR(t);
      if (i.vault !== VAULT_ID || i.token !== TOKEN_ID) throw new Error("This invoice is for a different vault or token. Do not approve.");
      setInv(i);
    } catch (e: any) { setErr(e.message); setInv(null); }
  }, []);

  function approve() {
    if (!inv || !sk || !fam) return;
    try {
      // Signing happens locally. No network request is made here.
      const a = signInvoice(inv, BigInt(fam), fromHex(sk), BigInt(Math.floor(Date.now() / 1000)));
      setAuthQR(encodeAuthQR(a));
      const h: Hist = { invoiceId: toHex(inv.invoiceId), familyId: fam, merchant: inv.merchantName, amount: inv.amount.toString(),
        local: `${inv.quote.currency} ${formatLocal(inv.quote.localMinor, inv.quote.minorDigits)}`, at: Date.now(), status: "AUTHORIZED_LOCALLY" };
      const nh = [h, ...hist].slice(0, 20); setHist(nh); set(HIST, JSON.stringify(nh));
    } catch (e: any) { setErr(e.message); }
  }
  const startPay = () => { setErr(""); setInv(null); setAuthQR(""); setPaying(true); };
  const endPay = () => { setErr(""); setInv(null); setAuthQR(""); setPaying(false); refresh(); };

  const known = inv && MERCHANTS.find((m) => m.address === inv.merchant);
  const expMin = inv ? Math.max(0, Math.round((Number(inv.expiresAt) * 1000 - Date.now()) / 60000)) : 0;
  const thisApproval = inv && hist.find((h) => h.invoiceId === toHex(inv.invoiceId));
  const fp = sk ? fingerprint(publicKeyOf(fromHex(sk))) : "";
  const pairingQR = sk ? <QR value={encodePairingQR(name || "phone", publicKeyOf(fromHex(sk)))} label="Pairing code" /> : null;
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
              <button className="btn ghost" onClick={() => { setErr(""); setInv(null); }}>Cancel</button>
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
          <input value={name} onChange={(e) => { setName(e.target.value); set(NAME, e.target.value); }} />
          <p className="warn">Testnet demo: the signing key is stored unencrypted in this browser and has no backup. Replacing or deleting it means the sender must pair this phone again.</p>
          <button className="btn danger small" onClick={setup}>Replace key</button>
          <button className="btn danger small" onClick={() => { if (confirm("Delete key?")) { localStorage.removeItem(SK); setSk(""); } }}>Delete key</button>
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
            <input value={name} onChange={(e) => { setName(e.target.value); set(NAME, e.target.value); }} placeholder="e.g. Ana" />
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
          <button className="btn danger small" onClick={() => { if (confirm("Delete key?")) { localStorage.removeItem(SK); setSk(""); } }}>Delete key</button>
        </details>
      )}
    </>
  );
}
