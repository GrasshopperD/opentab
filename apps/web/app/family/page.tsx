"use client";
import { useCallback, useEffect, useState } from "react";
import {
  encodeAuthQR, encodePairingQR, fingerprint, formatLocal, formatTokenAmount, fromHex, generateSecretKey,
  parseInvoiceQR, publicKeyOf, signInvoice, toHex, type Invoice,
} from "@opentab/shared";
import { api, Online, QR, Scanner } from "../components";
import { MERCHANTS, TOKEN_CODE, TOKEN_ID, VAULT_ID } from "@/lib/config";

// TESTNET DEMO KEY STORAGE: the private key is kept in this browser's localStorage.
// It never leaves the device. This is NOT production-grade custody.
const SK = "opentab.family.sk", FAM = "opentab.family.id", NAME = "opentab.family.name", HIST = "opentab.family.history";
const get = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

interface Hist { invoiceId: string; familyId?: string; merchant: string; amount: string; local: string; at: number; status: "AUTHORIZED_LOCALLY"; settled?: boolean }

export default function Family() {
  const [sk, setSk] = useState("");
  const [fam, setFam] = useState("");
  const [name, setName] = useState("");
  const [bal, setBal] = useState<{ balance?: string; keyActive?: boolean; error?: string } | null>(null);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [err, setErr] = useState("");
  const [authQR, setAuthQR] = useState("");
  const [hist, setHist] = useState<Hist[]>([]);

  useEffect(() => { const k = get(SK); setSk(/^[0-9a-f]{64}$/.test(k) ? k : ""); setFam(/^\d{1,12}$/.test(get(FAM)) ? get(FAM) : ""); setName(get(NAME)); try { setHist(JSON.parse(get(HIST) || "[]")); } catch { } }, []);
  const pub = sk ? toHex(publicKeyOf(fromHex(sk))) : "";

  const refresh = useCallback(async () => {
    if (!fam || !pub || !navigator.onLine) return;
    const r = await api(`/api/family/${fam}?key=${pub}`).catch(() => null);
    if (r) setBal(r.error ? { error: r.error } : { balance: r.family.balance, keyActive: r.keyActive });
  }, [fam, pub]);
  useEffect(() => { refresh(); }, [refresh]);

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
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [checkSettled, refresh]);

  function setup() {
    if (sk && !confirm("Replace this phone's key? Any family must re-authorize the new key.")) return;
    const k = toHex(generateSecretKey()); set(SK, k); setSk(k);
  }
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

  const known = inv && MERCHANTS.find((m) => m.address === inv.merchant);
  const expMin = inv ? Math.max(0, Math.round((Number(inv.expiresAt) * 1000 - Date.now()) / 60000)) : 0;

  return (
    <>
      <h1>Family wallet <Online /></h1>
      <div className="stepper" aria-label="Setup progress">
        <span className={sk ? "on" : ""} /><span className={sk && fam ? "on" : ""} /><span className={bal?.keyActive ? "on" : ""} />
      </div>
      <p className="muted">{!sk ? "Step 1 of 3: create your key" : !fam ? "Step 2 of 3: enter your family number" : !bal?.keyActive ? "Step 3 of 3: ask the sender to pair this phone" : "Ready to pay at participating shops"}</p>
      {!sk ? (
        <div className="card">
          <h2>Set up this phone</h2>
          <p className="muted">Creates a signing key on this phone. Only its public part is ever shared.</p>
          <label>Your name (shown to the sender)</label>
          <input value={name} onChange={(e) => { setName(e.target.value); set(NAME, e.target.value); }} placeholder="e.g. Ana" />
          <button className="btn" onClick={setup}>Create my key</button>
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Spending allowance</h2>
            <p className="muted">Family #{fam || "?"} · {bal?.keyActive ? "this phone is authorized" : bal?.keyActive === false ? "this phone is NOT yet authorized" : "status needs connection"}</p>
            <div className="big">{bal?.balance ? formatTokenAmount(BigInt(bal.balance)) : "—"} <span className="muted">{TOKEN_CODE}</span></div>
            <p className="muted">Shared family balance on Stellar (last seen online). The chain decides what can be spent.</p>
            <label>Family number (from the sender)</label>
            <input inputMode="numeric" value={fam} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setFam(v); set(FAM, v); }} />
            <button className="btn ghost small" onClick={refresh}>Refresh balance</button>
          </div>

          <div className="card">
            <h2>Pay at a shop</h2>
            <p className="muted">Participating shops:</p>
            <div className="shops">{MERCHANTS.map((m) => <span key={m.id}>{m.name}</span>)}</div>
            <p className="hint">No internet needed. Your phone signs the exact amount for that one shop; the shop&apos;s connection settles it on Stellar.</p>
            <Scanner prompt="Scan shop invoice" onResult={onInvoice} />
            {err && <div className="status bad">{err}</div>}
            {inv && !authQR && (
              <>
                <dl className="kv">
                  <dt>Shop</dt><dd>{inv.merchantName}{known ? "" : " (unlisted)"}<br /><code>{inv.merchant.slice(0, 8)}…{inv.merchant.slice(-6)}</code></dd>
                  <dt>Local price</dt><dd><b>{inv.quote.currency} {formatLocal(inv.quote.localMinor, inv.quote.minorDigits)}</b></dd>
                  <dt>Actual charge</dt><dd><b>{formatTokenAmount(inv.amount, 7)} {TOKEN_CODE}</b></dd>
                  <dt>Rate</dt><dd>{inv.quote.rate} {inv.quote.currency}/demo USD · {inv.quote.source === "ILLUSTRATIVE" ? "illustrative, not live" : inv.quote.source}</dd>
                  <dt>Expires</dt><dd>in ~{expMin} min</dd>
                  <dt>Terminal</dt><dd>#{inv.terminalId}</dd>
                </dl>
                {!fam && <p className="warn">Enter your family number first.</p>}
                <button className="btn" disabled={!fam} onClick={approve}>Approve {formatTokenAmount(inv.amount)} {TOKEN_CODE}</button>
                <button className="btn ghost" onClick={() => setInv(null)}>Decline</button>
              </>
            )}
            {authQR && (
              <>
                <div className="status info">Authorized. Awaiting merchant settlement. This is not a payment yet.</div>
                <QR value={authQR} label="Signed approval for the shop" />
                <p className="muted">Show this to the shop. It works only for this shop, this amount and this invoice, once.</p>
                <button className="btn ghost small" onClick={() => { setInv(null); setAuthQR(""); }}>Done</button>
              </>
            )}
          </div>

          <div className="card">
            <h2>Pair with sender</h2>
            <p className="muted">Show this to the sender. It contains only your public key.</p>
            <p className="fp">{fingerprint(publicKeyOf(fromHex(sk)))}</p>
            <QR value={encodePairingQR(name || "phone", publicKeyOf(fromHex(sk)))} label="Pairing code" />
          </div>

          <div className="card">
            <h2>My approvals on this phone</h2>
            {!hist.length ? <p className="muted">None yet.</p> : (
              <ul className="list">{hist.map((h) => (
                <li key={h.invoiceId + h.at}>{h.local} → {formatTokenAmount(BigInt(h.amount))} {TOKEN_CODE} at {h.merchant}<br />
                  {h.settled ? <span className="settled">✓ Settled on Stellar</span>
                    : <span className="waiting">Approved on this phone · waiting for the shop to settle{h.familyId ? "" : " (older entry)"}</span>}</li>
              ))}</ul>
            )}
            <details><summary>Reset this phone</summary>
              <p className="warn">Deletes the key from this browser. Testnet demo only: there is no recovery.</p>
              <button className="btn danger small" onClick={() => { if (confirm("Delete key?")) { localStorage.removeItem(SK); setSk(""); } }}>Delete key</button>
            </details>
          </div>
        </>
      )}
    </>
  );
}
