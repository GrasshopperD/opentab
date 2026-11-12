"use client";
import { useCallback, useEffect, useState } from "react";
import { fingerprint, formatTokenAmount, parsePairingQR, toHex } from "@opentab/shared";
import { api, DemoAccess, ERROR_TEXT, Scanner, TxLink } from "../components";
import { MERCHANTS, TOKEN_CODE } from "@/lib/config";

const LS = "opentab.sender.families";
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } };

export default function Sender() {
  const [families, setFamilies] = useState<string[]>([]);
  const [fam, setFam] = useState("");
  const [info, setInfo] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string; hash?: string } | null>(null);
  const [amount, setAmount] = useState("10");
  const [pair, setPair] = useState<{ pub: string; label: string } | null>(null);

  useEffect(() => { const f = load(); setFamilies(f); if (f.length) setFam(f[f.length - 1]); }, []);
  const refresh = useCallback(async () => {
    if (!fam) return;
    const r = await api(`/api/family/${fam}${pair ? "?key=" + pair.pub : ""}`);
    setInfo(r);
  }, [fam, pair]);
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
      <DemoAccess />
      <p className="muted">Demo sender: a Testnet account operated by this server holds {TOKEN_CODE} test tokens.</p>

      <div className="card">
        <h2>Family vault</h2>
        <div className="row">
          <div><label>Family</label>
            <select value={fam} onChange={(e) => setFam(e.target.value)}>
              <option value="">Choose…</option>{families.map((x) => <option key={x} value={x}>Family #{x}</option>)}
            </select></div>
          <div><label>Or enter family #</label><input inputMode="numeric" value={fam} onChange={(e) => setFam(e.target.value.replace(/\D/g, ""))} /></div>
        </div>
        <label>Amount ({TOKEN_CODE}, max 50)</label>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" disabled={!!busy} onClick={create}>{busy === "create" ? "Creating on Stellar…" : "Create new family + fund"}</button>
        <button className="btn ghost" disabled={!!busy || !fam} onClick={deposit}>{busy === "deposit" ? "Depositing…" : "Top up selected family"}</button>
      </div>

      {msg && <div className={"status " + msg.kind}>{msg.text}<br /><TxLink hash={msg.hash} /></div>}

      {f && (
        <div className="card">
          <p className="muted">Family #{fam} · on-chain balance</p>
          <div className="big">{formatTokenAmount(BigInt(f.balance))} <span className="muted">{TOKEN_CODE}</span></div>
          <dl className="kv">
            <dt>Deposited</dt><dd>{formatTokenAmount(BigInt(f.total_deposited))}</dd>
            <dt>Spent at shops</dt><dd>{formatTokenAmount(BigInt(f.total_paid))}</dd>
            <dt>Withdrawn</dt><dd>{formatTokenAmount(BigInt(f.total_withdrawn))}</dd>
          </dl>
          <button className="btn ghost small" onClick={refresh}>Refresh</button>
        </div>
      )}
      {info?.error && <div className="status bad">{ERROR_TEXT[info.error] ?? info.error}</div>}

      <div className="card">
        <h2>Pair a family member&apos;s phone</h2>
        <p className="muted">On their phone open <b>Family</b> → it shows a pairing code containing only a public key. Scan it here.</p>
        <Scanner prompt="Scan pairing code" onResult={onPair} />
        {pair && (
          <>
            <p>Device “{pair.label || "unnamed"}”, fingerprint</p>
            <p className="fp">{fingerprint(Uint8Array.from(pair.pub.match(/../g)!.map((h) => parseInt(h, 16))))}</p>
            <p className="muted">Check this matches the fingerprint on their phone. {info?.keyActive === true ? "Status: ACTIVE on chain." : info?.keyActive === false ? "Status: not active." : ""}</p>
            <button className="btn" disabled={!!busy || !fam} onClick={() => keyAction("register")}>{busy === "register" ? "Registering…" : `Authorize for family #${fam || "?"}`}</button>
            <button className="btn danger" disabled={!!busy || !fam} onClick={() => keyAction("revoke")}>Revoke</button>
          </>
        )}
      </div>

      <div className="card">
        <h2>Purchases (confirmed on chain)</h2>
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
