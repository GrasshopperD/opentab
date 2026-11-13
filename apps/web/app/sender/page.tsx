"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fingerprint, formatTokenAmount, parsePairingQR, toHex } from "@opentab/shared";
import { DemoAccess, ERROR_TEXT, Scanner, TxLink } from "../components";
import { createFamily, depositFunds, readFamily, setDeviceKey } from "../opentab-api";
import { rememberFamily, savedFamilies } from "./sender-store";
import { Invites } from "./invites";
import { DEMO_FAMILY_ID, INVITES_UI, MERCHANTS, TOKEN_CODE } from "@/lib/config";

type View = "home" | "fund" | "pair";

export default function Sender() {
  const [families, setFamilies] = useState<string[]>([]);
  const [fam, setFam] = useState(DEMO_FAMILY_ID); // demo preset: an EXISTING family; nothing is created or reset automatically
  const [info, setInfo] = useState<any>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string; hash?: string } | null>(null);
  const [amount, setAmount] = useState("10");
  const [createAmount, setCreateAmount] = useState("10");
  const [pair, setPair] = useState<{ pub: string; label: string } | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [view, setView] = useState<View>("home");

  const lock = useRef(false); // synchronous guard: a double-click cannot send two transactions
  const once = (f: () => Promise<void>) => async () => { if (lock.current) return; lock.current = true; try { await f(); } finally { lock.current = false; } };

  useEffect(() => { setFamilies(savedFamilies()); }, []);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0); // ignore out-of-order responses when the family number changes quickly
  const refresh = useCallback(async () => {
    const n = ++seq.current;
    if (!fam) { setInfo(null); setLoading(false); return; }
    setLoading(true);
    const r = await readFamily(fam, pair?.pub);
    if (n !== seq.current) return;
    setInfo(r); setLoading(false); if (!r.error) setCheckedAt(Date.now());
  }, [fam, pair]);
  // Never show one family's balance (or a scanned device) under another family's number.
  useEffect(() => { setInfo(null); setPair(null); setView("home"); }, [fam]);
  useEffect(() => { refresh(); }, [refresh]);

  /** Shows the result; returns true only when Stellar CONFIRMED (or the call had no on-chain status to wait for). */
  const show = (r: any, okText: string): boolean => {
    if (r.error) { setMsg({ kind: "bad", text: ERROR_TEXT[r.error] ?? `${r.error}: ${r.detail ?? ""}` }); return false; }
    if (r.status && r.status !== "CONFIRMED") { setMsg({ kind: "pending", text: `Status ${r.status}. Check the explorer link; do not repeat yet.`, hash: r.hash }); return false; }
    setMsg({ kind: "ok", text: okText, hash: r.hash ?? r.depositTx }); return true;
  };
  const open = (v: View) => { setMsg(null); setView(v); };

  async function create() {
    setBusy("create"); setMsg(null);
    const r: any = await createFamily(createAmount);
    setBusy("");
    if (r.familyId) {
      setFamilies(rememberFamily(String(r.familyId))); setFam(String(r.familyId));
      show({ ...r, hash: r.depositTx, status: r.depositStatus }, `Family #${r.familyId} created and funded with ${createAmount} ${TOKEN_CODE}.`);
    } else show(r, "");
  }
  async function deposit() {
    setBusy("deposit"); setMsg(null);
    const r = await depositFunds(fam, amount);
    setBusy("");
    if (show(r, `Deposited ${amount} ${TOKEN_CODE} to Family #${fam}. Confirmed on Stellar.`)) setView("home"); // back to the dashboard only after confirmation
    refresh();
  }
  async function keyAction(action: "register" | "revoke") {
    if (!pair) return;
    setBusy(action); setMsg(null);
    const r = await setDeviceKey(fam, pair.pub, action);
    setBusy("");
    const done = show(r, action === "register"
      ? `Phone paired: “${pair.label || "unnamed"}” is now authorized on Stellar for Family #${fam}.`
      : `Device revoked for Family #${fam}. Past payments stay final.`);
    if (done) { setPair(null); setView("home"); } // return to the family overview after a confirmed change
    refresh();
  }
  const onPair = useCallback((t: string) => {
    try { const p = parsePairingQR(t); setPair({ pub: toHex(p.pub), label: p.label }); setMsg(null); }
    catch (e: any) { setMsg({ kind: "bad", text: e.message }); }
  }, []);

  const f = info?.family;
  const name = (a: string) => MERCHANTS.find((m) => m.address === a)?.name ?? a.slice(0, 6) + "…";
  const payments: any[] = info?.payments ?? [];
  const back = <button className="btn ghost" onClick={() => open("home")}>← Back to family</button>;
  const activity = (p: any) => (
    <li key={p.txHash + p.invoiceId}>{formatTokenAmount(BigInt(p.amount))} {TOKEN_CODE} at {name(p.merchant)} · terminal {p.terminalId}<br /><TxLink hash={p.txHash} /></li>
  );

  return (
    <>
      <h1>Sender</h1>
      <p className="lead">Manage your family&apos;s funds and who can spend.</p>
      <DemoAccess onChange={setAuthorized} />

      {/* Main family wallet card: the selected family, its confirmed balance and the two primary actions. */}
      <div className="card" data-testid="wallet">
        <div className="wallet-head">
          <h2>Family #{fam || "?"}</h2>
          {fam === DEMO_FAMILY_ID && <span className="pill ok">Demo family</span>}
        </div>
        {f ? (
          <>
            <p className="label">Confirmed balance</p>
            <div className="big">{formatTokenAmount(BigInt(f.balance))} <span className="muted">{TOKEN_CODE}</span></div>
            <p className="muted">Read live from the FamilyVault contract · <b>status: active</b>
              {checkedAt ? ` · checked ${new Date(checkedAt).toLocaleTimeString()}` : ""}{loading ? " · refreshing…" : ""}{" "}
              <button className="linkbtn" onClick={refresh}>Refresh</button></p>
          </>
        ) : fam && loading ? <div className="status pending">Reading Family #{fam} from Stellar Testnet…</div> : null}
        {info?.error && !loading && (
          <div className="status bad" data-testid="family-error">
            Family #{fam} is unavailable: {ERROR_TEXT[info.error] ?? info.error}
            {fam === DEMO_FAMILY_ID ? " The demo will not create a replacement automatically. Check the vault contract and network, or use Advanced below." : ""}
          </div>
        )}
        {view === "home" && (
          <div className="actions">
            <button className="btn" disabled={!f} onClick={() => open("fund")}>Add Funds</button>
            <button className="btn" disabled={!f} onClick={() => open("pair")}>Pair Family Member</button>
          </div>
        )}
        {fam === DEMO_FAMILY_ID ? (
          <p className="muted" data-testid="demo-family-note">Demo uses existing Family #{DEMO_FAMILY_ID}, already created and funded on Stellar Testnet. Nothing is created, funded or reset automatically.</p>
        ) : (
          <p className="muted">Viewing Family #{fam || "?"} (not the demo preset). <button className="linkbtn" onClick={() => setFam(DEMO_FAMILY_ID)}>Back to demo Family #{DEMO_FAMILY_ID}</button></p>
        )}
      </div>

      {msg && <div className={"status " + msg.kind} data-testid="sender-msg">{msg.text}<br /><TxLink hash={msg.hash} /></div>}

      {view === "fund" && (
        <div className="card" data-testid="fund-panel">
          <h2>Add funds to Family #{fam}</h2>
          <p className="muted">Sends {TOKEN_CODE} test tokens (no value) from the demo sender, a Testnet account operated by this server, to the family balance. The balance above updates after Stellar confirms.</p>
          <label htmlFor="amount">Amount ({TOKEN_CODE}, max 50)</label>
          <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn" disabled={!!busy || !fam || !f} onClick={once(deposit)}>{busy === "deposit" ? "Adding funds on Stellar…" : `Add ${amount || "0"} ${TOKEN_CODE} to Family #${fam}`}</button>
          {back}
        </div>
      )}

      {view === "pair" && (
        <>
          <div className="card" data-testid="pair-panel">
            <h2>Pair a family member with Family #{fam}</h2>
            <ol className="steps">
              <li>On their phone they open <b>Family</b>, set up the device, and enter family number <b>#{fam}</b>.</li>
              <li>Scan the pairing code their phone shows. It contains only a public key, never a secret.</li>
              <li>Check the security code matches their screen, then authorize. Stellar records the authorization.</li>
            </ol>
            {!pair ? <Scanner prompt="Scan pairing code" onResult={onPair} /> : (
              <>
                <p>Device “{pair.label || "unnamed"}” · security code</p>
                <p className="fp">{fingerprint(Uint8Array.from(pair.pub.match(/../g)!.map((h) => parseInt(h, 16))))}</p>
                {info?.keyActive === true ? (
                  <>
                    <div className="status ok">This device is already authorized for Family #{fam} on Stellar.</div>
                    <button className="btn danger" disabled={!!busy} onClick={once(() => keyAction("revoke"))}>{busy === "revoke" ? "Revoking on Stellar…" : "Revoke this device"}</button>
                  </>
                ) : (
                  <>
                    <p className="muted">Only authorize if this code matches the one on their phone.{info?.keyActive === false ? " Status: not yet authorized." : ""}</p>
                    <button className="btn" disabled={!!busy || !fam} onClick={once(() => keyAction("register"))}>{busy === "register" ? "Authorizing on Stellar…" : `Authorize for family #${fam || "?"}`}</button>
                  </>
                )}
                <button className="btn ghost" disabled={!!busy} onClick={() => setPair(null)}>Scan a different code</button>
              </>
            )}
            {back}
          </div>
          {INVITES_UI && <Invites fam={fam} enabled={authorized && !!f} />}
        </>
      )}

      {view === "home" && (
        <>
          <div className="card">
            <h2>Recent activity</h2>
            <p className="muted">Purchases at shops for Family #{fam}, confirmed on Stellar (recent on-chain events; top-ups are not listed).</p>
            {!payments.length ? <p className="muted">No confirmed purchases in the recent event window.</p> : (
              <>
                <ul className="list">{payments.slice(0, 5).map(activity)}</ul>
                {payments.length > 5 && <details><summary>Show all {payments.length}</summary><ul className="list">{payments.slice(5).map(activity)}</ul></details>}
              </>
            )}
          </div>

          <details className="card">
            <summary>Advanced: family management</summary>
            <h3>Open an existing family</h3>
            <div className="row">
              <div><label>Family</label>
                <select value={families.includes(fam) || fam === DEMO_FAMILY_ID ? fam : ""} onChange={(e) => setFam(e.target.value)}>
                  <option value={DEMO_FAMILY_ID}>Family #{DEMO_FAMILY_ID} (demo)</option>
                  {families.filter((x) => x !== DEMO_FAMILY_ID).map((x) => <option key={x} value={x}>Family #{x}</option>)}
                  {!families.includes(fam) && fam !== DEMO_FAMILY_ID && <option value="">Other…</option>}
                </select></div>
              <div><label>Or enter family #</label><input inputMode="numeric" value={fam} onChange={(e) => setFam(e.target.value.replace(/\D/g, ""))} /></div>
            </div>
            {f && (
              <>
                <h3>Family #{fam} totals (on chain)</h3>
                <dl className="kv">
                  <dt>Deposited</dt><dd>{formatTokenAmount(BigInt(f.total_deposited))}</dd>
                  <dt>Spent at shops</dt><dd>{formatTokenAmount(BigInt(f.total_paid))}</dd>
                  <dt>Withdrawn</dt><dd>{formatTokenAmount(BigInt(f.total_withdrawn))}</dd>
                </dl>
              </>
            )}
            <h3>Create a new family</h3>
            <p className="muted">Not needed for the demo. Sends real Testnet transactions: the server creates the family and makes the starting deposit below in the same step (it has no create-without-deposit call).</p>
            <label htmlFor="create-amount">Starting deposit ({TOKEN_CODE}, max 50)</label>
            <input id="create-amount" inputMode="decimal" value={createAmount} onChange={(e) => setCreateAmount(e.target.value)} />
            <button className="btn ghost" disabled={!!busy} onClick={once(create)}>{busy === "create" ? "Creating on Stellar…" : "Create new family + fund"}</button>
          </details>
          <p className="muted">Planned: spending categories, withdrawals UI, merchant-reserved offline allowances.</p>
        </>
      )}
    </>
  );
}
