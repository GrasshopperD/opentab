"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { fingerprint, formatTokenAmount, parsePairingQR, parseTokenAmount, toHex } from "@opentab/shared";
import { api, ERROR_TEXT, Scanner } from "../components";
import { EXPLORER_TX, MERCHANTS } from "@/lib/config";
import { Arrow, Brand, RoleIcon } from "../experience/design";
import "./dashboard.css";

type View = "overview" | "money" | "family" | "activity";
type Payment = { txHash: string; invoiceId: string; amount: string; merchant: string; at?: string; terminalId: string };
type FamilyInfo = { family?: { balance: string; total_deposited: string; total_paid: string; total_withdrawn: string }; payments?: Payment[]; keyActive?: boolean; error?: string; detail?: string };
type Operation = { kind: "create" | "deposit" | "register" | "revoke"; familyId: string; amount: string; hash?: string };
type Result = { error?: string; detail?: string; status?: string; hash?: string; familyId?: string; depositTx?: string; depositStatus?: string; step?: string };
const FAMILIES = "opentab.sender.families", PENDING = "opentab.dashboard.pending";
const validId = (id: string) => /^\d{1,12}$/.test(id);
const validHash = (hash?: string) => !!hash && /^[0-9a-f]{64}$/.test(hash);
function savedFamilies(): string[] {
  try { const saved = JSON.parse(localStorage.getItem(FAMILIES) || "[]"); return Array.isArray(saved) ? [...new Set(saved.filter((v): v is string => typeof v === "string" && validId(v)))] : []; } catch { return []; }
}
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
  const [checkError, setCheckError] = useState("");
  const [reviewReady, setReviewReady] = useState(false);
  const reviewDeadline = useRef(0);
  const lock = useRef(false), accessLock = useRef(false), sequence = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null), reviewHeading = useRef<HTMLHeadingElement>(null);
  const ready = access?.enabled && access.authorized;
  const canMutate = Boolean(ready && !pending && !busy);

  useEffect(() => {
    const saved = savedFamilies(); setFamilies(saved); if (saved.length) setFamilyId(saved[saved.length - 1]);
    try { const p = JSON.parse(sessionStorage.getItem(PENDING) || "null"); if (p && ["create", "deposit", "register", "revoke"].includes(p.kind) && typeof p.familyId === "string" && typeof p.amount === "string" && (!p.hash || validHash(p.hash))) setPending(p); } catch { /* No stored request. */ }
    api("/api/auth/status").then(r => { if (r.error) setNotice({ kind: "error", text: issue(r) }); else setAccess(r); });
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
    const r = await api<FamilyInfo>(`/api/family/${familyId}${pair ? `?key=${pair.pub}` : ""}`);
    if (sequence.current === request) { setInfo(r); setLoading(false); }
  }, [familyId, pair]);
  useEffect(() => { refresh(); return () => { sequence.current++; }; }, [refresh]);
  function rememberFamily(id: string) {
    if (!validId(id)) return;
    const list = [...new Set([...savedFamilies(), id])];
    try { localStorage.setItem(FAMILIES, JSON.stringify(list)); } catch { /* Display still works if storage is unavailable. */ }
    setFamilies(list); setFamilyId(id);
  }
  function track(operation: Operation | null) {
    setPending(operation);
    try { if (operation) sessionStorage.setItem(PENDING, JSON.stringify(operation)); else sessionStorage.removeItem(PENDING); } catch { /* In-memory duplicate guard remains active. */ }
  }
  function open(view: View) { setView(view); setReview(false); setKeyReview(null); setNotice(null); }
  function addMoney() { setNewFamily(!familyId); open("money"); }
  function success(op: Operation) {
    setNotice({ kind: "ok", text: op.kind === "create" ? "Your family is ready. Demo funds have been added." : op.kind === "deposit" ? `${op.amount} Demo USD added to family #${op.familyId}.` : op.kind === "register" ? "Phone connected. Your family member can now approve purchases." : "Phone access removed. Previous purchases are unchanged." });
    setReview(false); setKeyReview(null); setView(op.kind === "register" || op.kind === "revoke" ? "family" : "overview"); refresh();
  }
  async function send(kind: Operation["kind"]) {
    if (lock.current || !canMutate) return;
    if ((kind === "create" || kind === "deposit") && (!review || !reviewReady || performance.now() < reviewDeadline.current)) return;
    if (kind !== "create" && !validId(familyId)) return;
    if ((kind === "register" || kind === "revoke") && !pair) return;
    lock.current = true; setBusy(true); setNotice(null);
    const op: Operation = { kind, familyId: kind === "create" ? "" : familyId, amount };
    // Write the in-flight marker before sending. Returning to this page never resubmits.
    track(op);
    const path = kind === "create" ? "/api/sender/family" : kind === "deposit" ? "/api/sender/deposit" : "/api/sender/key";
    const body = kind === "create" ? { amount } : kind === "deposit" ? { familyId, amount } : { familyId, publicKey: pair!.pub, action: kind };
    try {
      const r = await api<Result>(path, { method: "POST", body: JSON.stringify(body) });
      if (r.familyId && validId(String(r.familyId))) { op.familyId = String(r.familyId); rememberFamily(op.familyId); }
      const hash = r.depositTx || r.hash; if (validHash(hash)) op.hash = hash;
      const status = kind === "create" ? r.depositStatus || r.status : r.status;
      if (status === "FAILED") { track(null); setNotice({ kind: "error", text: "The request wasn’t completed. No confirmed addition is shown." }); }
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
      const r = await api<Result>(`/api/tx/${pending.hash}`);
      if (r.status === "FAILED") { track(null); setNotice({ kind: "error", text: "The request failed. No confirmed addition is shown." }); }
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
    try { const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ code }) }); if (r.authorized) { setAccess({ enabled: true, authorized: true }); setAccessOpen(false); setCode(""); } else setNotice({ kind: "error", text: r.detail || issue(r) }); }
    finally { accessLock.current = false; setAccessBusy(false); }
  }
  const onPair = useCallback((text: string) => {
    try { const p = parsePairingQR(text); setPair({ pub: toHex(p.pub), label: p.label, fingerprint: fingerprint(p.pub) }); setKeyReview(null); setNotice(null); }
    catch { setNotice({ kind: "error", text: "That isn’t a phone connection code. Use the code on your family member’s Family screen." }); }
  }, []);
  function reviewMoney(e: FormEvent) {
    e.preventDefault();
    try { const n = parseTokenAmount(amount); if (n <= 0n || n > parseTokenAmount("50")) throw new Error(); setNotice(null); setReviewReady(false); setReview(true); }
    catch { setNotice({ kind: "error", text: "Enter an amount greater than 0 and no more than 50, with up to 7 decimal places." }); }
  }
  const payments = info?.payments || [];
  const activity = <section className="dash-card dash-activity"><div className="dash-card-heading"><h2>Recent purchases</h2>{view === "overview" && <button className="dash-text-button" onClick={() => open("activity")}>View all <Arrow /></button>}</div>{loading ? <p className="dash-empty">Loading purchases…</p> : info?.error ? <p className="dash-empty">Purchases are unavailable. Refresh to try again.</p> : !payments.length ? <div className="dash-empty"><span className="dash-empty-icon"><NavIcon view="activity" /></span><h3>No purchases yet</h3></div> : <><ul className="dash-purchases">{payments.map(p => <li key={p.txHash + p.invoiceId}><span className="dash-shop-icon"><RoleIcon kind="merchant" /></span><div><b>{MERCHANTS.find(m => m.address && m.address === p.merchant)?.name || "Family purchase"}</b><span>{p.at && !Number.isNaN(Date.parse(p.at)) ? new Date(p.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Confirmed purchase"}</span></div><strong>−{money(p.amount)}<span>Demo USD</span></strong>{validHash(p.txHash) && <a className="dash-receipt" href={EXPLORER_TX + p.txHash} target="_blank" rel="noreferrer" aria-label="View purchase receipt">↗</a>}</li>)}</ul></>}</section>;

  return <div className="dash-app">
    <a className="ot-skip" href="#dashboard-main">Skip to dashboard</a>
    <aside className="dash-sidebar"><Brand /><div className="dash-workspace"><span className="dash-family-avatar"><RoleIcon kind="family" /></span><div><b>My family</b><span>Organizer</span></div></div><nav aria-label="Dashboard navigation">{([["overview", "Overview"], ["money", "Add money"], ["family", "Family"], ["activity", "Activity"]] as const).map(([id, label]) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => id === "money" ? addMoney() : open(id)}><NavIcon view={id} />{label}{view === id && <span className="dash-nav-dot" />}</button>)}</nav><div className="dash-sidebar-bottom"><button className="dash-text-button" onClick={() => setAccessOpen(!accessOpen)} aria-expanded={accessOpen}>Demo access <Arrow /></button><Link href="/home">Back to Home <Arrow back /></Link><Link href="/demo/sender">Original demo <Arrow /></Link></div></aside>
    <div className="dash-main-shell">
    <main id="dashboard-main" className="dash-main">
      <div className="dash-page-heading"><h1 ref={heading} tabIndex={-1}>{view === "overview" ? "Your family" : view === "money" ? "Add money" : view === "family" ? "Your family phones" : "Your activity"}</h1>{view !== "money" && <button className="dash-family-switch" aria-label={familyId ? `Family #${familyId}` : "Choose a family"} onClick={() => { setChooseOpen(!chooseOpen); setEnteredId(familyId); }} aria-expanded={chooseOpen}><RoleIcon kind="family" />{familyId ? `Family #${familyId}` : "Choose a family"}<span>⌄</span></button>}</div>
      {accessOpen && <section className="dash-card dash-access"><h2>Demo access</h2>{!access ? <p>Checking access…</p> : !access.enabled ? <p>Interactive funding is disabled on this deployment.</p> : access.authorized ? <><p>Demo access is active on this browser.</p><button className="dash-secondary" disabled={accessBusy} onClick={async () => { if (accessLock.current) return; accessLock.current = true; setAccessBusy(true); try { const r = await api("/api/auth/logout", { method: "POST", body: "{}" }); if (r.error) setNotice({ kind: "error", text: issue(r) }); else setAccess({ ...access, authorized: false }); } finally { accessLock.current = false; setAccessBusy(false); } }}>Sign out</button></> : <form onSubmit={authenticate}><p>Enter your existing demo access code to add funds or connect a phone.</p><label htmlFor="dash-code">Access code</label><input id="dash-code" autoFocus type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required /><button className="ot-button" disabled={accessBusy || !code}>Unlock demo <Arrow /></button></form>}</section>}
      {chooseOpen && <section className="dash-card dash-choose"><h2>Choose your family</h2>{families.length > 0 && <><label htmlFor="dash-saved">Saved on this browser</label><select id="dash-saved" value={familyId} onChange={e => { setFamilyId(e.target.value); setNewFamily(false); setChooseOpen(false); setReview(false); setKeyReview(null); setNotice(null); }}><option value="">Choose a family</option>{families.map(id => <option key={id} value={id}>Family #{id}</option>)}</select></>}<form onSubmit={e => { e.preventDefault(); if (validId(enteredId)) { rememberFamily(enteredId); setNewFamily(false); setChooseOpen(false); setReview(false); setKeyReview(null); setNotice(null); } }}><label htmlFor="dash-family-number">Family number</label><div className="dash-inline"><input id="dash-family-number" inputMode="numeric" pattern="[0-9]{1,12}" maxLength={12} value={enteredId} onChange={e => setEnteredId(e.target.value.replace(/\D/g, ""))} required /><button className="ot-button" disabled={!validId(enteredId)}>Choose <Arrow /></button></div></form></section>}
      {notice && <div className={`dash-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}
      {pending && <section className="dash-card dash-pending" role="status"><h2>Waiting for confirmation</h2><p>This request hasn’t been confirmed yet. Don’t send it again.</p><div className="dash-inline">{pending.hash && <><button className="dash-secondary" disabled={busy} onClick={checkPending}>{busy ? "Checking…" : "Check status"}</button><a href={EXPLORER_TX + pending.hash} target="_blank" rel="noreferrer">View request ↗</a></>}<Link href="/demo/sender">Open original demo <Arrow /></Link></div>{checkError && <p>{checkError}</p>}</section>}
      {info?.error && <div className="dash-notice error" role="alert">{issue(info)} <button className="dash-text-button" onClick={refresh}>Try again</button></div>}
      <div className="dash-view" key={view}>
      {view === "overview" && <><div className="dash-overview-grid"><section className="dash-balance"><div className="dash-balance-top"><span>Available for your family</span><RoleIcon kind="family" /></div><div className="dash-amount">{loading ? "…" : money(info?.family?.balance)}<span>Demo USD</span></div><div className="dash-balance-bottom"><button className="ot-button" onClick={addMoney}>Add money <Arrow /></button><button className="dash-text-button" onClick={refresh} disabled={loading || !familyId}>{loading ? "Refreshing…" : "Refresh balance"}</button></div></section><section className="dash-connect-card"><div className="dash-connection-art" aria-hidden="true"><span><RoleIcon kind="organizer" /></span><i /><span><RoleIcon kind="recipient" /></span></div><h2>One family.<br />A shared everyday.</h2><button className="dash-text-button" onClick={() => open("family")}>Manage family <Arrow /></button></section></div><section className="dash-totals" aria-label="Family balance summary"><div><span>Total added</span><b>{money(info?.family?.total_deposited)} <small>Demo USD</small></b></div><div><span>Spent at shops</span><b>{money(info?.family?.total_paid)} <small>Demo USD</small></b></div><div><span>Withdrawn</span><b>{money(info?.family?.total_withdrawn)} <small>Demo USD</small></b></div></section>{activity}</>}
      {view === "activity" && <>{activity}<button className="dash-secondary" onClick={refresh} disabled={loading || !familyId}>Refresh purchases</button></>}
      {view === "money" && <div className="dash-money-flow">
        <div className="dash-money-family"><button className="dash-destination" aria-label="Choose funding family" onClick={() => { setChooseOpen(!chooseOpen); setEnteredId(familyId); }} aria-expanded={chooseOpen}><span className="dash-family-avatar"><RoleIcon kind="family" /></span><b>{newFamily ? "A new family" : familyId ? `Family #${familyId}` : "Choose a family"}</b><span className="dash-destination-arrow">⌄</span></button><button className="dash-text-button" type="button" disabled={busy} onClick={() => { setNewFamily(!newFamily); setReview(false); setNotice(null); }}>{newFamily ? "Use an existing family instead" : "Start a new family instead"}</button></div>
        <section className="dash-card dash-money">{!review ? <form className="dash-money-step" key="amount" onSubmit={reviewMoney}><div className="dash-card-heading"><label htmlFor="dash-amount">How much would you like to add?</label><div className="dash-flow-progress" aria-label="Step 1 of 2"><i className="is-current" /><i /></div></div><div className="dash-amount-field"><input id="dash-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} required maxLength={16} /><span>Demo USD</span></div><div className="dash-quick-amounts">{["5", "10", "20", "50"].map(v => <button type="button" key={v} aria-pressed={amount === v} onClick={() => setAmount(v)}>{v}</button>)}</div><p className="dash-limit">Maximum 50 Demo USD.</p><button className="ot-button ot-button-full" disabled={Boolean(pending) || (!newFamily && !familyId)}>Continue <Arrow /></button></form> : <div className="dash-money-step" key="review"><div className="dash-card-heading"><h2 tabIndex={-1} ref={reviewHeading}>Ready to add?</h2><div className="dash-flow-progress" aria-label="Step 2 of 2"><i /><i className="is-current" /></div></div><div className="dash-review-amount">{amount}<span>Demo USD</span></div><dl className="dash-review-details"><div><dt>To</dt><dd>{newFamily ? "A new family" : `Family #${familyId}`}</dd></div></dl>{!ready && <div className="dash-inline-access"><p>{access?.enabled === false ? "Funding is unavailable." : "Demo access required."}</p><button className="dash-text-button" onClick={() => setAccessOpen(true)}>Demo access <Arrow /></button></div>}<button className={`ot-button ot-button-full dash-confirm ${!reviewReady ? "is-waiting" : ""}`} disabled={!canMutate || !reviewReady} onClick={() => send(newFamily ? "create" : "deposit")}>{busy ? "Adding funds…" : "Confirm and add"}<Arrow />{!reviewReady && <span className="dash-confirm-progress" aria-hidden="true" />}</button><button className="dash-text-button dash-create-switch" disabled={busy} onClick={() => setReview(false)}>Back to amount</button></div>}</section>
      </div>}
      {view === "family" && <div className="dash-family-layout"><section className="dash-card"><h2>Connect a family phone</h2><ol className="dash-phone-steps"><li><span>1</span><div><b>Open Family on their phone</b><Link className="dash-text-button" href="/demo/family">Open Family screen <Arrow /></Link></div></li><li><span>2</span><div><b>Scan their code here</b></div></li></ol><Scanner prompt="Scan phone code" onResult={onPair} /></section><section className="dash-card dash-phone-detail">{!pair ? <div className="dash-empty"><RoleIcon kind="recipient" /><h2>A place for their phone</h2></div> : <><span className="dash-family-avatar"><RoleIcon kind="recipient" /></span><h2>{pair.label || "Family phone"}</h2><p>Match this code with the one on their phone.</p><p className="dash-fingerprint">{pair.fingerprint}</p><p>{loading ? "Checking phone access…" : info?.keyActive === true ? "This phone is connected." : info?.keyActive === false ? "This phone is not connected." : "Choose a family and refresh to check access."}</p>{keyReview ? <div className="dash-key-review"><h3>{keyReview === "register" ? "Connect this phone?" : "Remove this phone’s access?"}</h3><p>{keyReview === "register" ? `It will be able to approve purchases for family #${familyId}.` : "It will no longer be able to approve new purchases. Previous purchases remain final."}</p><button className="ot-button" disabled={!canMutate || !familyId} onClick={() => send(keyReview)}>{busy ? "Please wait…" : keyReview === "register" ? "Confirm connection" : "Confirm removal"}<Arrow /></button><button className="dash-text-button" disabled={busy} onClick={() => setKeyReview(null)}>Cancel</button></div> : <div className="dash-phone-actions"><button className="ot-button" disabled={!familyId || Boolean(pending) || loading || info?.keyActive === true} onClick={() => setKeyReview("register")}>Connect phone <Arrow /></button><button className="dash-text-button" disabled={!familyId || Boolean(pending) || loading || info?.keyActive !== true} onClick={() => setKeyReview("revoke")}>Remove access</button></div>}{keyReview && !ready && <button className="dash-text-button" onClick={() => setAccessOpen(true)}>Unlock demo access <Arrow /></button>}</>}</section></div>}
      </div>
    </main></div>
  </div>;
}
