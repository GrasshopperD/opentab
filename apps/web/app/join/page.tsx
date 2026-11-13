"use client";
import { useCallback, useEffect, useState } from "react";
import { fingerprint, fromHex, generateSecretKey, publicKeyOf, signPossession, toHex } from "@opentab/shared";
import { api, ERROR_TEXT } from "../components";
import { INVITES_UI } from "@/lib/config";

// Same local key storage as the Family screen (TESTNET DEMO: plain localStorage, not production custody).
const SK = "opentab.family.sk", FAM = "opentab.family.id", NAME = "opentab.family.name", JOIN = "opentab.join.token";
const get = (k: string, s: Storage | null = null) => { try { return (s ?? localStorage).getItem(k) || ""; } catch { return ""; } };
const set = (k: string, v: string, s: Storage | null = null) => { try { (s ?? localStorage).setItem(k, v); } catch { } };

interface Opened { inviteId: string; familyId: string; name: string; inviter: string; expiresAt: number; challenge: string; network: string; vault: string }
const STATUS_TEXT: Record<string, string> = {
  ACCEPTED: "Waiting for the sender to approve this phone…",
  CONNECTED: "Connected. This phone's key is registered on Stellar for your family.",
  REJECTED: "The sender rejected this request. Ask them for a new invitation if this was a mistake.",
  EXPIRED: "This invitation expired before it was approved. Ask the sender for a new one.",
  USED_BY_OTHER_DEVICE: "This invitation was already used by a DIFFERENT device. Tell the sender now: do not approve it. Ask for a new invitation.",
  NOT_ACTIVE: "This phone's key is not active on Stellar (it may have been revoked).",
  REVOKED: "The sender revoked this phone's access on Stellar. It can no longer pay.",
  CHECKING: "Checking Stellar…",
};

export default function Join() {
  return INVITES_UI ? <JoinFlow /> : <JoinUnavailable />;
}

/** Shown on deployments without invitations (always on Vercel). Never reads, stores or sends a token. */
function JoinUnavailable() {
  useEffect(() => { if (location.hash) history.replaceState(null, "", "/join"); }, []);  // do not leave a token in the address bar
  return (
    <>
      <h1>Family invitation</h1>
      <div className="status pending" data-testid="join-unavailable">
        Invitation links are not available on this version of OpenTab.
      </div>
      <div className="card">
        <p>To connect this phone, open <a href="/family">Family</a>, create your signing key and enter the family number the sender gives you.
          The sender then scans your pairing code to approve this phone.</p>
        <a className="btn" href="/family">Set up this phone</a>
      </div>
    </>
  );
}

function JoinFlow() {
  const [token, setToken] = useState("");
  const [inv, setInv] = useState<Opened | null>(null);
  const [sk, setSk] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // The token travels in the URL #fragment (never sent to any server or logged). Move it to this tab's sessionStorage
  // and strip it from the address bar so it does not linger in history or get shared by accident.
  useEffect(() => {
    const m = /[#&]t=([A-Za-z0-9_-]{43})/.exec(location.hash);
    const t = m?.[1] || get(JOIN, sessionStorage);
    if (m) { set(JOIN, m[1], sessionStorage); history.replaceState(null, "", "/join"); }
    setToken(t);
    const k = get(SK); setSk(/^[0-9a-f]{64}$/.test(k) ? k : ""); setLabel(get(NAME));
    if (!t) setErr("Open the invitation link the sender gave you (or scan their QR code).");
  }, []);
  const pub = sk ? toHex(publicKeyOf(fromHex(sk))) : "";

  const open = useCallback(async () => {
    const r = await api("/api/invite/open", { method: "POST", body: JSON.stringify({ token }) });
    if (r.error) { return { error: r.error === "InviteUsed" ? "" : (ERROR_TEXT[r.error] ?? r.detail ?? r.error), code: r.error }; }
    return { ok: r as Opened };
  }, [token]);

  const poll = useCallback(async () => {
    if (!token || !pub) return;
    const r = await api("/api/invite/status", { method: "POST", body: JSON.stringify({ token, pub }) });
    if (r.status) { setStatus(r.status); if (r.familyId) set(FAM, r.familyId); }
  }, [token, pub]);

  useEffect(() => {
    if (!token) return;
    open().then(async (o) => {
      if (o.ok) setInv(o.ok);
      else if (o.code === "InviteUsed") await poll();     // already accepted (maybe by this phone): show its status
      else setErr(o.error!);
    });
  }, [token, open, poll]);
  useEffect(() => {
    if (!["ACCEPTED", "CHECKING"].includes(status)) return;
    const t = setInterval(poll, 3000); return () => clearInterval(t);
  }, [status, poll]);

  function createKey() { const k = toHex(generateSecretKey()); set(SK, k); setSk(k); }

  async function accept() {
    if (!sk || busy) return;
    setBusy(true); setErr("");
    try {
      const o = await open();                                // fresh single-use challenge right before signing
      if (!o.ok) { setErr(o.error || "This invitation has already been used."); if (o.code === "InviteUsed") await poll(); return; }
      const c = o.ok;
      const { signature } = signPossession({ network: c.network, vault: c.vault, inviteId: c.inviteId, familyId: BigInt(c.familyId), challenge: c.challenge }, fromHex(sk));
      set(NAME, label);
      const r = await api("/api/invite/accept", { method: "POST", body: JSON.stringify({ token, pub, label, signature: toHex(signature) }) });
      if (r.error) { setErr(ERROR_TEXT[r.error] ?? r.detail ?? r.error); return; }
      set(FAM, r.familyId); setStatus("ACCEPTED");
    } finally { setBusy(false); }
  }

  const fp = pub ? fingerprint(fromHex(pub)) : "";
  return (
    <>
      <h1>Family invitation</h1>
      {err && <div className="status bad" data-testid="join-error">{err}</div>}
      {inv && !status && (
        <div className="card">
          <h2>You&apos;re invited</h2>
          <p><b>{inv.inviter}</b> invited <b>{inv.name}</b> <span className="muted">(name typed by the sender, not verified)</span> to spend from a shared family allowance at participating shops.</p>
          <p className="muted">Invitation expires in {Math.max(0, Math.ceil((inv.expiresAt - Date.now()) / 60000))} min and works once.</p>
          {!sk ? (
            <>
              <p>This phone needs a payment signing key. It is created and kept on this phone; only its public part is shared.</p>
              <button className="btn" onClick={createKey}>Create my signing key</button>
            </>
          ) : (
            <>
              <p>Using this phone&apos;s existing signing key. <span className="muted">(Demo keys are not PIN-locked.)</span></p>
              <label htmlFor="devname">Name for this phone (shown to the sender)</label>
              <input id="devname" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Ana's phone" />
              <p>Your security code: <span className="fp" data-testid="join-fp">{fp}</span></p>
              <button className="btn" disabled={busy} onClick={accept}>{busy ? "Sending…" : "Accept invitation"}</button>
            </>
          )}
        </div>
      )}
      {status && (
        <div className="card" data-testid="join-status">
          <div className={"status " + (status === "CONNECTED" ? "ok" : status === "ACCEPTED" || status === "CHECKING" ? "pending" : "bad")}>{STATUS_TEXT[status] ?? status}</div>
          {status === "ACCEPTED" && <p>Tell the sender your security code: <span className="fp">{fp}</span>. They should approve only if it matches.</p>}
          {status === "CONNECTED" && <a className="btn" href="/family">Open my family wallet</a>}
        </div>
      )}
    </>
  );
}
