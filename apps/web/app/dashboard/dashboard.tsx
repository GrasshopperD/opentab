"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { fingerprint, formatTokenAmount, fromHex, parsePairingQR, parseTokenAmount, toHex } from "@opentab/shared";
import { ERROR_TEXT, Scanner } from "../components";
import { DEMO_FAMILY_ID, EXPLORER_TX, MERCHANTS } from "@/lib/config";
import { accessLogin, accessLogout, accessStatus, createFamily, depositFunds, readFamily, setDeviceKey, txStatus, type FamilyInfo, type TxResult } from "../opentab-api";
import { pairedDevices, rememberDevice, rememberFamily as storeFamily, savedFamilies, selectFamily, selectedFamily, validFamilyId as validId, type PairedDevice } from "../sender/sender-store";
import { Arrow, Brand, RoleIcon } from "../experience/design";
import "./dashboard.css";

// Product Mode organizer dashboard. Same backend as Demo Mode /sender: the existing guarded /api/sender/* routes, the demo
// access session, and live FamilyVault reads. Nothing is shown as done until Stellar has CONFIRMED it.
type View = "overview" | "money" | "family" | "activity";
type Operation = { kind: "create" | "deposit" | "register" | "revoke"; familyId: string; amount: string; hash?: string; pub?: string; label?: string };
const PENDING = "opentab.dashboard.pending";
const validHash = (hash?: string) => !!hash && /^[0-9a-f]{64}$/.test(hash);
function money(value?: string) { try { return value === undefined ? "—" : formatTokenAmount(BigInt(value)); } catch { return "—"; } }
function issue(r: { error?: string; detail?: string }) {
  if (r.error === "Unauthorized") return "Enter the demo access code to continue.";
  if (r.error === "DemoLocked") return "Adding funds is unavailable on this deployment.";
  if (r.error === "NOT_CONFIGURED") return "This demo hasn’t been connected yet.";
  return ERROR_TEXT[r.error || ""] || r.detail || "We couldn’t complete that request. Please try again later.";
}
function NavIcon({ view }: { view: View }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{view === "overview" ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : view === "money" ? <><path d="M12 4v16M4 12h16" /><circle cx="12" cy="12" r="9" /></> : view === "family" ? <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" /></> : <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM9 8h6M9 12h6" /></>}</svg>;
}

/** One phone this browser authorized earlier; its status is read from Stellar, never assumed. */
function DeviceRow({ d, onSelect, disabled }: { d: PairedDevice; onSelect: (d: PairedDevice) => void; disabled: boolean }) {
  const [active, setActive] = useState<boolean | null | "error">(null);
  useEffect(() => { let live = true; readFamily(d.familyId, d.pub).then((r) => { if (live) setActive(r.error ? "error" : r.keyActive === true); }); return () => { live = false; }; }, [d.familyId, d.pub]);
  return <li><span className="dash-shop-icon"><RoleIcon kind="recipient" /></span><div><b>{d.label || "Family phone"}</b><span className="dash-fingerprint-inline">{fingerprint(fromHex(d.pub))}</span></div>
    <strong>{active === null ? "Checking…" : active === "error" ? "Unavailable" : active ? "Connected" : "Not connected"}<span>on Stellar</span></strong>
    {active === true && <button className="dash-text-button" disabled={disabled} onClick={() => onSelect(d)}>Manage</button>}</li>;
}

export function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [families, setFamilies] = useState<string[]>([]), [familyId, setFamilyId] = useState("");
  const [info, setInfo] = useState<FamilyInfo | null>(null), [loading, setLoading] = useState(false);
  const [access, setAccess] = useState<{ enabled: boolean; authorized: boolean } | null>(null);
  const [accessOpen, setAccessOpen] = useState(false), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [accessBusy, setAccessBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [pending, setPending] = useState<Operation | null>(null);
  const [chooseOpen, setChooseOpen] = useState(false), [enteredId, setEnteredId] = useState("");
  const [amount, setAmount] = useState("10"), [newFamily, setNewFamily] = useState(false), [review, setReview] = useState(false);
  const [pair, setPair] = useState<{ pub: string; label: string; fingerprint: string } | null>(null);
  const [keyReview, setKeyReview] = useState<"register" | "revoke" | null>(null);
  const [codeMatches, setCodeMatches] = useState(false);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [checkError, setCheckError] = useState("");
  const [reviewReady, setReviewReady] = useState(false);
  const reviewDeadline = useRef(0);
  const lock = useRef(false), accessLock = useRef(false), sequence = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null), reviewHeading = useRef<HTMLHeadingElement>(null);
  const ready = access?.enabled && access.authorized;
  const canMutate = Boolean(ready && !pending && !busy);

  useEffect(() => {
    // Preselect the demo's EXISTING Family #7 (or the family last opened here). Nothing is created or funded automatically.
    const saved = savedFamilies(); setFamilies(saved); setFamilyId(selectedFamily()); setDevices(pairedDevices());
    try { const p = JSON.parse(sessionStorage.getItem(PENDING) || "null"); if (p && ["create", "deposit", "register", "revoke"].includes(p.kind) && typeof p.familyId === "string" && typeof p.amount === "string" && (!p.hash || validHash(p.hash))) setPending(p); } catch { /* No stored request. */ }
    accessStatus().then(r => { if (r.error) setNotice({ kind: "error", text: issue(r) }); else setAccess(r); });
  }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [view]);
  useEffect(() => {
    setReviewReady(false);
    if (view !== "money" || !review) return;
    reviewHeading.current?.focus({ preventScroll: true });
    reviewDeadline.current = performance.now() + 2000;
    const timer = window.setTimeout(() => setReviewReady(true), 2000);
    return () => window.clearTimeout(timer);
  }, [view, review, amount, familyId, newFamily]);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!validId(familyId)) { setInfo(null); setLoading(false); return; }
    setLoading(true); setInfo(null);
    const r = await readFamily(familyId, pair?.pub);
    if (sequence.current === request) { setInfo(r); setLoading(false); }
  }, [familyId, pair]);
  useEffect(() => { refresh(); return () => { sequence.current++; }; }, [refresh]);
  function chooseFamily(id: string) {
    if (!validId(id)) return;
    setFamilies(storeFamily(id)); setFamilyId(id); selectFamily(id);
  }
  function track(operation: Operation | null) {
    setPending(operation);
    try { if (operation) sessionStorage.setItem(PENDING, JSON.stringify(operation)); else sessionStorage.removeItem(PENDING); } catch { /* In-memory duplicate guard remains active. */ }
  }
  function open(view: View) { setView(view); setReview(false); setKeyReview(null); setNotice(null); }
  function addMoney() { setNewFamily(false); open("money"); }
  function startNewFamily() { setNewFamily(true); open("money"); }
  function success(op: Operation) {
    setNotice({ kind: "ok", text: op.kind === "create" ? `Family #${op.familyId} created on Stellar with a starting deposit of ${op.amount} Demo USD.` : op.kind === "deposit" ? `${op.amount} Demo USD added to family #${op.familyId}. Confirmed on Stellar.` : op.kind === "register" ? `Phone connected on Stellar for family #${op.familyId}. Your family member can now approve purchases.` : "Phone access removed on Stellar. Previous purchases are unchanged." });
    if (op.kind === "register" && op.pub) setDevices(rememberDevice({ familyId: op.familyId, pub: op.pub, label: op.label || "" }));
    if (op.kind === "revoke") setDevices(pairedDevices());
    setReview(false); setKeyReview(null); setCodeMatches(false); setNewFamily(false); setView(op.kind === "register" || op.kind === "revoke" ? "family" : "overview"); refresh();
  }
  async function send(kind: Operation["kind"]) {
    if (lock.current || !canMutate) return;
    if ((kind === "create" || kind === "deposit") && (!review || !reviewReady || performance.now() < reviewDeadline.current)) return;
    if (kind !== "create" && !validId(familyId)) return;
    if ((kind === "register" || kind === "revoke") && !pair) return;
    if (kind === "register" && !codeMatches) return;
    lock.current = true; setBusy(true); setNotice(null);
    const op: Operation = { kind, familyId: kind === "create" ? "" : familyId, amount, ...(pair && (kind === "register" || kind === "revoke") ? { pub: pair.pub, label: pair.label } : {}) };
    // Write the in-flight marker before sending. Returning to this page never resubmits.
    track(op);
    try {
      const r: TxResult = kind === "create" ? await createFamily(amount) : kind === "deposit" ? await depositFunds(familyId, amount) : await setDeviceKey(familyId, pair!.pub, kind);
      if (r.familyId && validId(String(r.familyId))) { op.familyId = String(r.familyId); chooseFamily(op.familyId); }
      const hash = r.depositTx || r.hash; if (validHash(hash)) op.hash = hash;
      const status = kind === "create" ? r.depositStatus || r.status : r.status;
      if (status === "FAILED") { track(null); setNotice({ kind: "error", text: "The request wasn’t completed. No confirmed change is shown." }); }
      else if (r.error) {
        if (r.error === "Unauthorized") { setAccess(previous => previous ? { ...previous, authorized: false } : previous); setAccessOpen(true); }
        if (r.error === "DemoLocked") setAccess({ enabled: false, authorized: false });
        // An unavailable response may follow a submitted request; don't offer an automatic retry.
        if (["NetworkError", "BadResponse", "ServerError"].includes(r.error)) { track(op); setNotice({ kind: "error", text: "We couldn’t confirm the result. Check the request below before trying again." }); }
        else { track(null); setNotice({ kind: "error", text: issue(r) }); }
      } else {
        if (status === "CONFIRMED") { track(null); success(op); }
        else { track(op); setReview(false); setKeyReview(null); }
      }
    } finally { lock.current = false; setBusy(false); }
  }
  async function checkPending() {
    if (!pending?.hash || lock.current) return;
    lock.current = true; setBusy(true); setCheckError("");
    try {
      const r = await txStatus(pending.hash);
      if (r.status === "FAILED") { track(null); setNotice({ kind: "error", text: "The request failed. No confirmed change is shown." }); }
      else if (r.error) setCheckError(issue(r));
      else if (r.status === "CONFIRMED") {
        // create_family can confirm before a deposit is attempted; don't call that funding success.
        if (pending.kind === "create" && !pending.familyId) { setCheckError("Family creation was confirmed, but funding has not been confirmed. Check the original demo before continuing."); }
        else { const op = pending; track(null); success(op); }
      } else setCheckError("Still waiting for a result. Please check again later.");
    } finally { lock.current = false; setBusy(false); }
  }
  async function authenticate(e: FormEvent) {
    e.preventDefault(); if (accessLock.current || !code) return; accessLock.current = true; setAccessBusy(true); setNotice(null);
    try { const r = await accessLogin(code); if (r.authorized) { setAccess({ enabled: true, authorized: true }); setAccessOpen(false); setCode(""); } else setNotice({ kind: "error", text: r.detail || issue(r) }); }
    finally { accessLock.current = false; setAccessBusy(false); }
  }
  const onPair = useCallback((text: string) => {
    try { const p = parsePairingQR(text); setPair({ pub: toHex(p.pub), label: p.label, fingerprint: fingerprint(p.pub) }); setKeyReview(null); setCodeMatches(false); setNotice(null); }
    catch { setNotice({ kind: "error", text: "That isn’t a phone connection code. Use the code on your family member’s Family Wallet screen." }); }
  }, []);
  const manageDevice = useCallback((d: PairedDevice) => {
    setPair({ pub: d.pub, label: d.label, fingerprint: fingerprint(fromHex(d.pub)) }); setKeyReview(null); setCodeMatches(false); setNotice(null);
  }, []);
  function reviewMoney(e: FormEvent) {
    e.preventDefault();
    try { const n = parseTokenAmount(amount); if (n <= 0n || n > parseTokenAmount("50")) throw new Error(); setNotice(null); setReviewReady(false); setReview(true); }
    catch { setNotice({ kind: "error", text: "Enter an amount greater than 0 and no more than 50, with up to 7 decimal places." }); }
  }
  const payments = info?.payments || [];
  const familyDevices = devices.filter(d => d.familyId === familyId);
  const familyOptions = [...new Set([DEMO_FAMILY_ID, ...families])];
  const activity = <section className="dash-card dash-activity"><div className="dash-card-heading"><h2>Recent purchases</h2>{view === "overview" && <button className="dash-text-button" onClick={() => open("activity")}>View all <Arrow /></button>}</div>{loading ? <p className="dash-empty">Loading purchases…</p> : info?.error ? <p className="dash-empty">Purchases are unavailable. Refresh to try again.</p> : !payments.length ? <div className="dash-empty"><span className="dash-empty-icon"><NavIcon view="activity" /></span><h3>No purchases yet</h3><p>Confirmed shop payments from the last day appear here.</p></div> : <><ul className="dash-purchases">{(view === "overview" ? payments.slice(0, 5) : payments).map(p => <li key={p.txHash + p.invoiceId}><span className="dash-shop-icon"><RoleIcon kind="merchant" /></span><div><b>{MERCHANTS.find(m => m.address && m.address === p.merchant)?.name || "Family purchase"}</b><span>{p.at && !Number.isNaN(Date.parse(p.at)) ? new Date(p.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Confirmed purchase"} · confirmed on Stellar</span></div><strong>−{money(p.amount)}<span>Demo USD</span></strong>{validHash(p.txHash) && <a className="dash-receipt" href={EXPLORER_TX + p.txHash} target="_blank" rel="noreferrer" aria-label="View purchase on Stellar Expert">↗</a>}</li>)}</ul></>}</section>;

  return <div className="dash-app">
    <a className="ot-skip" href="#dashboard-main">Skip to dashboard</a>
    <aside className="dash-sidebar"><Brand /><div className="dash-workspace"><span className="dash-family-avatar"><RoleIcon kind="family" /></span><div><b>{familyId ? `Family #${familyId}` : "My family"}</b><span>Organizer</span></div></div><nav aria-label="Dashboard navigation">{([["overview", "Overview"], ["money", "Add money"], ["family", "Family"], ["activity", "Activity"]] as const).map(([id, label]) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => id === "money" ? addMoney() : open(id)}><NavIcon view={id} />{label}{view === id && <span className="dash-nav-dot" />}</button>)}</nav><div className="dash-sidebar-bottom"><button className="dash-text-button" onClick={() => setAccessOpen(!accessOpen)} aria-expanded={accessOpen}>Demo access <Arrow /></button><Link href="/home">Back to Home <Arrow back /></Link><Link href="/demo/sender">Original demo <Arrow /></Link></div></aside>
    <div className="dash-main-shell">
    <main id="dashboard-main" className="dash-main">
      <div className="dash-page-heading"><h1 ref={heading} tabIndex={-1}>{view === "overview" ? "Your family" : view === "money" ? newFamily ? "Start a new family" : "Add money" : view === "family" ? "Your family phones" : "Your activity"}</h1>{view !== "money" && <button className="dash-family-switch" aria-label={familyId ? `Family #${familyId}` : "Choose a family"} onClick={() => { setChooseOpen(!chooseOpen); setEnteredId(familyId); }} aria-expanded={chooseOpen}><RoleIcon kind="family" />{familyId ? `Family #${familyId}` : "Choose a family"}<span>⌄</span></button>}</div>
      {accessOpen && <section className="dash-card dash-access"><h2>Demo access</h2>{!access ? <p>Checking access…</p> : !access.enabled ? <p>Interactive funding is disabled on this deployment.</p> : access.authorized ? <><p>Demo access is active on this browser.</p><button className="dash-secondary" disabled={accessBusy} onClick={async () => { if (accessLock.current) return; accessLock.current = true; setAccessBusy(true); try { const r = await accessLogout(); if (r.error) setNotice({ kind: "error", text: issue(r) }); else setAccess({ ...access, authorized: false }); } finally { accessLock.current = false; setAccessBusy(false); } }}>Sign out</button></> : <form onSubmit={authenticate}><p>Enter your existing demo access code to add funds or connect a phone. This Testnet demo has no personal accounts; the code unlocks the demo sender for this browser session.</p><label htmlFor="dash-code">Access code</label><input id="dash-code" autoFocus type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required /><button className="ot-button" disabled={accessBusy || !code}>Unlock demo <Arrow /></button></form>}</section>}
      {chooseOpen && <section className="dash-card dash-choose"><h2>Choose your family</h2><label htmlFor="dash-saved">Families on this browser</label><select id="dash-saved" value={familyOptions.includes(familyId) ? familyId : ""} onChange={e => { if (!e.target.value) return; chooseFamily(e.target.value); setNewFamily(false); setChooseOpen(false); setReview(false); setKeyReview(null); setNotice(null); }}>{!familyOptions.includes(familyId) && <option value="">Choose a family</option>}{familyOptions.map(id => <option key={id} value={id}>Family #{id}{id === DEMO_FAMILY_ID ? " (demo)" : ""}</option>)}</select><form onSubmit={e => { e.preventDefault(); if (validId(enteredId)) { chooseFamily(enteredId); setNewFamily(false); setChooseOpen(false); setReview(false); setKeyReview(null); setNotice(null); } }}><label htmlFor="dash-family-number">Family number</label><div className="dash-inline"><input id="dash-family-number" inputMode="numeric" pattern="[0-9]{1,12}" maxLength={12} value={enteredId} onChange={e => setEnteredId(e.target.value.replace(/\D/g, ""))} required /><button className="ot-button" disabled={!validId(enteredId)}>Choose <Arrow /></button></div></form><button className="dash-text-button dash-create-switch" disabled={busy || Boolean(pending)} onClick={() => { setChooseOpen(false); startNewFamily(); }}>Start a new family instead <Arrow /></button></section>}
      {notice && <div className={`dash-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}
      {pending && <section className="dash-card dash-pending" role="status"><h2>Waiting for confirmation</h2><p>This request hasn’t been confirmed on Stellar yet. Don’t send it again.</p><div className="dash-inline">{pending.hash && <><button className="dash-secondary" disabled={busy} onClick={checkPending}>{busy ? "Checking…" : "Check status"}</button><a href={EXPLORER_TX + pending.hash} target="_blank" rel="noreferrer">View request ↗</a></>}<Link href="/demo/sender">Open original demo <Arrow /></Link></div>{checkError && <p>{checkError}</p>}</section>}
      {info?.error && <div className="dash-notice error" role="alert">{info.error === "FamilyNotFound" ? `Family #${familyId} does not exist on this vault. Choose another family.` : issue(info)} <button className="dash-text-button" onClick={refresh}>Try again</button></div>}
      <div className="dash-view" key={view}>
      {view === "overview" && <><div className="dash-overview-grid"><section className="dash-balance" data-testid="dash-balance"><div className="dash-balance-top"><span>Available for family #{familyId}</span><RoleIcon kind="family" /></div><div className="dash-amount">{loading ? "…" : money(info?.family?.balance)}<span>Demo USD</span></div><p className="dash-balance-note">{info?.family ? "Read live from Stellar Testnet." : loading ? "Reading Stellar Testnet…" : "Balance unavailable."}{familyId === DEMO_FAMILY_ID ? " Demo family, already created and funded." : ""}</p><div className="dash-balance-bottom"><button className="ot-button" disabled={!info?.family} onClick={addMoney}>Add money <Arrow /></button><button className="dash-text-button" onClick={refresh} disabled={loading || !familyId}>{loading ? "Refreshing…" : "Refresh balance"}</button></div></section><section className="dash-connect-card"><div className="dash-connection-art" aria-hidden="true"><span><RoleIcon kind="organizer" /></span><i /><span><RoleIcon kind="recipient" /></span></div><h2>One family.<br />A shared everyday.</h2><button className="dash-text-button" disabled={!info?.family} onClick={() => open("family")}>Add family member <Arrow /></button></section></div><section className="dash-totals" aria-label="Family balance summary"><div><span>Total added</span><b>{money(info?.family?.total_deposited)} <small>Demo USD</small></b></div><div><span>Spent at shops</span><b>{money(info?.family?.total_paid)} <small>Demo USD</small></b></div><div><span>Withdrawn</span><b>{money(info?.family?.total_withdrawn)} <small>Demo USD</small></b></div></section>{activity}</>}
      {view === "activity" && <>{activity}<button className="dash-secondary" onClick={refresh} disabled={loading || !familyId}>Refresh purchases</button></>}
      {view === "money" && <div className="dash-money-flow">
        <div className="dash-money-family"><button className="dash-destination" aria-label="Choose funding family" disabled={newFamily} onClick={() => { setChooseOpen(!chooseOpen); setEnteredId(familyId); }} aria-expanded={chooseOpen}><span className="dash-family-avatar"><RoleIcon kind="family" /></span><b>{newFamily ? "A new family" : familyId ? `Family #${familyId}` : "Choose a family"}</b><span className="dash-destination-arrow">⌄</span></button><button className="dash-text-button" type="button" disabled={busy} onClick={() => { setNewFamily(!newFamily); setReview(false); setNotice(null); }}>{newFamily ? "Use an existing family instead" : "Start a new family instead"}</button></div>
        <section className="dash-card dash-money">{!review ? <form className="dash-money-step" key="amount" onSubmit={reviewMoney}><div className="dash-card-heading"><label htmlFor="dash-amount">{newFamily ? "Starting deposit for the new family" : "How much would you like to add?"}</label><div className="dash-flow-progress" aria-label="Step 1 of 2"><i className="is-current" /><i /></div></div><div className="dash-amount-field"><input id="dash-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} required maxLength={16} /><span>Demo USD</span></div><div className="dash-quick-amounts">{["5", "10", "20", "50"].map(v => <button type="button" key={v} aria-pressed={amount === v} onClick={() => setAmount(v)}>{v}</button>)}</div><p className="dash-limit">{newFamily ? "A new family needs a starting deposit: OpenTab creates it on Stellar and funds it in the same step. Maximum 50 Demo USD." : "Maximum 50 Demo USD."}</p><button className="ot-button ot-button-full" disabled={Boolean(pending) || (!newFamily && !familyId)}>Continue <Arrow /></button></form> : <div className="dash-money-step" key="review"><div className="dash-card-heading"><h2 tabIndex={-1} ref={reviewHeading}>{newFamily ? "Create this family?" : "Ready to add?"}</h2><div className="dash-flow-progress" aria-label="Step 2 of 2"><i /><i className="is-current" /></div></div><div className="dash-review-amount">{amount}<span>Demo USD</span></div><dl className="dash-review-details">{newFamily ? <><div><dt>Creates</dt><dd>A new family on Stellar Testnet</dd></div><div><dt>Starting deposit</dt><dd>{amount} Demo USD (required)</dd></div></> : <div><dt>To</dt><dd>Family #{familyId}</dd></div>}</dl>{!ready && <div className="dash-inline-access"><p>{access?.enabled === false ? "Funding is unavailable." : "Demo access required."}</p><button className="dash-text-button" onClick={() => setAccessOpen(true)}>Demo access <Arrow /></button></div>}<button className={`ot-button ot-button-full dash-confirm ${!reviewReady ? "is-waiting" : ""}`} disabled={!canMutate || !reviewReady} onClick={() => send(newFamily ? "create" : "deposit")}>{busy ? newFamily ? "Creating on Stellar…" : "Adding funds…" : newFamily ? "Create family and add funds" : "Confirm and add"}<Arrow />{!reviewReady && <span className="dash-confirm-progress" aria-hidden="true" />}</button><button className="dash-text-button dash-create-switch" disabled={busy} onClick={() => setReview(false)}>Back to amount</button></div>}</section>
      </div>}
      {view === "family" && <div className="dash-family-layout"><section className="dash-card"><h2>Add a family member</h2><ol className="dash-phone-steps"><li><span>1</span><div><b>On their phone, open the Family Wallet</b><p>They set up the phone and enter family number #{familyId}. Their pairing code holds only a public key.</p><Link className="dash-text-button" href="/wallet">Open Family Wallet <Arrow /></Link></div></li><li><span>2</span><div><b>Scan their pairing code here</b></div></li><li><span>3</span><div><b>Check the security code, then authorize</b><p>Stellar records the authorization. Several phones can spend from one family.</p></div></li></ol><Scanner prompt="Scan phone code" onResult={onPair} />{familyDevices.length > 0 && <div className="dash-devices"><h3>Phones you connected from this browser</h3><ul className="dash-purchases">{familyDevices.map(d => <DeviceRow key={d.pub} d={d} onSelect={manageDevice} disabled={Boolean(pending) || busy} />)}</ul></div>}</section><section className="dash-card dash-phone-detail">{!pair ? <div className="dash-empty"><RoleIcon kind="recipient" /><h2>A place for their phone</h2><p>Scan a pairing code, or choose a phone you connected before.</p></div> : <><span className="dash-family-avatar"><RoleIcon kind="recipient" /></span><h2>{pair.label || "Family phone"}</h2><p>Match this security code with the one on their phone.</p><p className="dash-fingerprint" data-testid="pair-fingerprint">{pair.fingerprint}</p><p data-testid="pair-status">{loading ? "Checking phone access on Stellar…" : info?.keyActive === true ? `This phone is connected to family #${familyId} on Stellar.` : info?.keyActive === false ? `This phone is not connected to family #${familyId}.` : "Choose a family and refresh to check access."}</p>{keyReview ? <div className="dash-key-review"><h3>{keyReview === "register" ? "Connect this phone?" : "Remove this phone’s access?"}</h3><p>{keyReview === "register" ? `It will be able to approve purchases for family #${familyId}, up to the family balance.` : "It will no longer be able to approve new purchases. Previous purchases remain final."}</p>{keyReview === "register" && <label className="dash-check"><input type="checkbox" checked={codeMatches} onChange={e => setCodeMatches(e.target.checked)} /> The security code matches the one on their phone</label>}<button className="ot-button" disabled={!canMutate || !familyId || (keyReview === "register" && !codeMatches)} onClick={() => send(keyReview)}>{busy ? "Waiting for Stellar…" : keyReview === "register" ? "Confirm connection" : "Confirm removal"}<Arrow /></button><button className="dash-text-button" disabled={busy} onClick={() => { setKeyReview(null); setCodeMatches(false); }}>Cancel</button></div> : <div className="dash-phone-actions"><button className="ot-button" disabled={!familyId || Boolean(pending) || loading || info?.keyActive !== false} onClick={() => setKeyReview("register")}>Connect phone <Arrow /></button><button className="dash-text-button" disabled={!familyId || Boolean(pending) || loading || info?.keyActive !== true} onClick={() => setKeyReview("revoke")}>Remove access</button><button className="dash-text-button" disabled={busy} onClick={() => { setPair(null); setKeyReview(null); }}>Choose a different phone</button></div>}{keyReview && !ready && <button className="dash-text-button" onClick={() => setAccessOpen(true)}>Unlock demo access <Arrow /></button>}</>}</section></div>}
      </div>
    </main></div>
  </div>;
}
