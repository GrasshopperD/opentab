"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fingerprint, formatTokenAmount, parsePairingQR, toHex } from "@opentab/shared";
import { api, DemoAccess, ERROR_TEXT, Scanner, TxLink } from "../components";
import { Invites } from "./invites";
import { DEMO_FAMILY_ID, INVITES_UI, MERCHANTS, TOKEN_CODE } from "@/lib/config";

const LS = "opentab.sender.families";
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } };

export default function Sender() {
  const [families, setFamilies] = useState<string[]>([]);
  const [fam, setFam] = useState(DEMO_FAMILY_ID); // demo preset: an EXISTING family; nothing is created or reset automatically
  const [info, setInfo] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string; hash?: string } | null>(null);
  const [amount, setAmount] = useState("10");
  const [pair, setPair] = useState<{ pub: string; label: string } | null>(null);
  const [authorized, setAuthorized] = useState(false);

  const lock = useRef(false); // synchronous guard: a double-click cannot send two transactions
  const once = (f: () => Promise<void>) => async () => { if (lock.current) return; lock.current = true; try { await f(); } finally { lock.current = false; } };

  useEffect(() => { setFamilies(load()); }, []);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0); // ignore out-of-order responses when the family number changes quickly
  const refresh = useCallback(async () => {
    const n = ++seq.current;
    if (!fam) { setInfo(null); setLoading(false); return; }
    setLoading(true);
    const r = await api(`/api/family/${fam}${pair ? "?key=" + pair.pub : ""}`);
    if (n !== seq.current) return;
    setInfo(r); setLoading(false);
  }, [fam, pair]);
  useEffect(() => { setInfo(null); }, [fam]); // never show one family's balance under another's number
  useEffect(() => { refresh(); }, [refresh]);

  const show = (r: any, okText: string) => {
    if (r.error) setMsg({ kind: "bad", text: ERROR_TEXT[r.error] ?? `${r.error}: ${r.detail ?? ""}` });
    else if (r.status && r.status !== "CONFIRMED") setMsg({ kind: "pending", text: `Status ${r.status}. Check the explorer link; do not repeat yet.`, hash: r.hash });
    else setMsg({ kind: "ok", text: okText, hash: r.hash ?? r.depositTx });
  };

  async function create() {
    setBusy("create"); setMsg(null);
    const r = await api("/api/sender/family", { method: "POST", body: JSON.stringify({ amount }) });
    setBusy("");
    if (r.familyId) {
      const f = [...load(), String(r.familyId)]; localStorage.setItem(LS, JSON.stringify(f)); setFamilies(f); setFam(String(r.familyId));
      show({ ...r, hash: r.depositTx, status: r.depositStatus }, `Family #${r.familyId} created and funded with ${amount} ${TOKEN_CODE}.`);
    } else show(r, "");
  }
  async function deposit() {
    setBusy("deposit"); setMsg(null);
    const r = await api("/api/sender/deposit", { method: "POST", body: JSON.stringify({ familyId: fam, amount }) });
    setBusy(""); show(r, `Deposited ${amount} ${TOKEN_CODE}.`); refresh();
  }
  async function keyAction(action: "register" | "revoke") {
    if (!pair) return;
    setBusy(action); setMsg(null);
    const r = await api("/api/sender/key", { method: "POST", body: JSON.stringify({ familyId: fam, publicKey: pair.pub, action }) });
    setBusy(""); show(r, action === "register" ? "Phone paired: its key is now authorized on chain." : "Key revoked. Past payments stay final."); refresh();
  }
  const onPair = useCallback((t: string) => {
    try { const p = parsePairingQR(t); setPair({ pub: toHex(p.pub), label: p.label }); setMsg(null); }
    catch (e: any) { setMsg({ kind: "bad", text: e.message }); }
  }, []);

  const f = info?.family;
  const name = (a: string) => MERCHANTS.find((m) => m.address === a)?.name ?? a.slice(0, 6) + "…";
  return (
    <>
      <h1>Sender</h1>
      <DemoAccess onChange={setAuthorized} />
      <p className="lead">Fund your family&apos;s spending balance and pair their phone.</p>
      <p className="muted">Demo sender: a Testnet account operated by this server holds {TOKEN_CODE} test tokens (no value).</p>

      <div className="card">
        <h2>1 · Family allowance</h2>
        {fam === DEMO_FAMILY_ID ? (
          <div className="status info" data-testid="demo-family-note">
            Demo uses <b>existing Family #{DEMO_FAMILY_ID}</b>, already created and funded on Stellar Testnet.
            Its balance below is read live from the contract. Nothing is created, funded or reset automatically.
          </div>
        ) : (
          <div className="status pending">Viewing Family #{fam || "?"} (not the demo preset). <button className="btn ghost small" onClick={() => setFam(DEMO_FAMILY_ID)}>Back to demo Family #{DEMO_FAMILY_ID}</button></div>
        )}
        <div className="row">
          <div><label>Family</label>
            <select value={families.includes(fam) || fam === DEMO_FAMILY_ID ? fam : ""} onChange={(e) => setFam(e.target.value)}>
              <option value={DEMO_FAMILY_ID}>Family #{DEMO_FAMILY_ID} (demo)</option>
              {families.filter((x) => x !== DEMO_FAMILY_ID).map((x) => <option key={x} value={x}>Family #{x}</option>)}
              {!families.includes(fam) && fam !== DEMO_FAMILY_ID && <option value="">Other…</option>}
            </select></div>
          <div><label>Or enter family #</label><input inputMode="numeric" value={fam} onChange={(e) => setFam(e.target.value.replace(/\D/g, ""))} /></div>
        </div>
        <label>Top-up amount ({TOKEN_CODE}, max 50)</label>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" disabled={!!busy || !fam || !info?.family} onClick={once(deposit)}>{busy === "deposit" ? "Depositing…" : `Top up Family #${fam || "?"}`}</button>
        <details className="advanced">
          <summary>Advanced: create a new family (not needed for the demo)</summary>
          <p className="muted">Sends real Testnet transactions and funds the new family from the demo sender with the amount above.</p>
          <button className="btn ghost" disabled={!!busy} onClick={once(create)}>{busy === "create" ? "Creating on Stellar…" : "Create new family + fund"}</button>
        </details>
      </div>

      {fam && (
        <div className="famid" aria-live="polite">
          <div className="num">#{fam}</div>
          <div><b>Family number</b><br /><span className="muted">Give this number to your family member. They type it on the Family screen.</span></div>
        </div>
      )}
      {msg && <div className={"status " + msg.kind}>{msg.text}<br /><TxLink hash={msg.hash} /></div>}

      {f && (
        <div className="card">
          <p className="muted">Family #{fam} · on-chain balance · <b>status: active</b> (exists on the vault){loading ? " · refreshing…" : ""}</p>
          <div className="big">{formatTokenAmount(BigInt(f.balance))} <span className="muted">{TOKEN_CODE}</span></div>
          <dl className="kv">
            <dt>Deposited</dt><dd>{formatTokenAmount(BigInt(f.total_deposited))}</dd>
            <dt>Spent at shops</dt><dd>{formatTokenAmount(BigInt(f.total_paid))}</dd>
            <dt>Withdrawn</dt><dd>{formatTokenAmount(BigInt(f.total_withdrawn))}</dd>
          </dl>
          <button className="btn ghost small" onClick={refresh}>Refresh</button>
        </div>
      )}
      {fam && !f && loading && <div className="status pending">Reading Family #{fam} from Stellar Testnet…</div>}
      {info?.error && !loading && (
        <div className="status bad" data-testid="family-error">
          Family #{fam} is unavailable: {ERROR_TEXT[info.error] ?? info.error}
          {fam === DEMO_FAMILY_ID ? " The demo will not create a replacement automatically. Check the vault contract and network, or use Advanced below." : ""}
        </div>
      )}

      {INVITES_UI && <Invites fam={fam} enabled={authorized && !!f} />}

      <div className="card">
        <h2>{INVITES_UI ? "3 · Fallback: manual pairing" : "2 · Pair a family member's phone"}</h2>
        <p className="muted">{INVITES_UI ? "Kept during migration to invitations. " : ""}The family member opens <b>Family</b>, types the family number, and shows a pairing code containing only a public key. Scan it here.</p>
        <Scanner prompt="Scan pairing code" onResult={onPair} />
        {pair && (
          <>
            <p>Device “{pair.label || "unnamed"}”, fingerprint</p>
            <p className="fp">{fingerprint(Uint8Array.from(pair.pub.match(/../g)!.map((h) => parseInt(h, 16))))}</p>
            <p className="muted">Check this matches the fingerprint on their phone. {info?.keyActive === true ? "Status: ACTIVE on chain." : info?.keyActive === false ? "Status: not active." : ""}</p>
            <button className="btn" disabled={!!busy || !fam} onClick={once(() => keyAction("register"))}>{busy === "register" ? "Registering…" : `Authorize for family #${fam || "?"}`}</button>
            <button className="btn danger" disabled={!!busy || !fam} onClick={once(() => keyAction("revoke"))}>Revoke</button>
          </>
        )}
      </div>

      <div className="card">
        <h2>{INVITES_UI ? "4" : "3"} · Purchases confirmed on Stellar</h2>
        {!info?.payments?.length ? <p className="muted">No confirmed purchases in the recent event window.</p> : (
          <ul className="list">{info.payments.map((p: any) => (
            <li key={p.txHash + p.invoiceId}>{formatTokenAmount(BigInt(p.amount))} {TOKEN_CODE} at {name(p.merchant)} · terminal {p.terminalId}<br /><TxLink hash={p.txHash} /></li>
          ))}</ul>
        )}
      </div>
      <p className="muted">Planned: spending categories, withdrawals UI, merchant-reserved offline allowances.</p>
    </>
  );
}
