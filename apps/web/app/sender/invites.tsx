"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ERROR_TEXT, QR, TxLink } from "../components";

interface View {
  id: string; familyId: string; name: string; contact?: string; status: string; createdAt: number; expiresAt: number; approveBy?: number;
  regTx?: string; revokeTx?: string; lastError?: string; device?: { label: string; pub: string; fingerprint: string; acceptedAt: number };
}
const LABEL: Record<string, string> = {
  PENDING: "Pending", ACCEPTED: "Device request: needs your approval", REGISTERING: "Registering on Stellar…",
  CONNECTED: "Connected", REJECTED: "Rejected", EXPIRED: "Expired", REVOKED: "Revoked",
};
const KIND: Record<string, string> = { PENDING: "pending", ACCEPTED: "info", REGISTERING: "pending", CONNECTED: "ok", REJECTED: "bad", EXPIRED: "bad", REVOKED: "bad" };
const mins = (ms: number) => Math.max(0, Math.ceil((ms - Date.now()) / 60000));

export function Invites({ fam, enabled }: { fam: string; enabled: boolean }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);   // token lives only in this tab's memory
  const [list, setList] = useState<View[]>([]);
  const [msg, setMsg] = useState("");
  const [unavailable, setUnavailable] = useState("");
  const lock = useRef(false);
  const once = (f: () => Promise<void>) => async () => { if (lock.current) return; lock.current = true; try { await f(); } finally { lock.current = false; } };
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!fam || !enabled) return;
    const r = await api("/api/invite/list", { method: "POST", body: JSON.stringify({ familyId: fam }) });
    if (r.error === "InvitesUnavailable") setUnavailable(r.detail);
    else if (Array.isArray(r)) setList(r);
  }, [fam, enabled]);
  useEffect(() => { setList([]); setLink(null); load(); }, [load]);
  const live = list.some((v) => ["PENDING", "ACCEPTED", "REGISTERING"].includes(v.status));
  useEffect(() => { if (!live) return; const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 3000); return () => clearInterval(t); }, [live, load]);

  const show = (r: any) => setMsg(r.error ? (ERROR_TEXT[r.error] ?? r.detail ?? r.error) : "");
  const create = once(async () => {
    setBusy("create"); setMsg("");
    const r = await api("/api/invite/create", { method: "POST", body: JSON.stringify({ familyId: fam, name, contact }) });
    setBusy("");
    if (r.token) { setLink({ id: r.invite.id, url: `${location.origin}/join#t=${r.token}` }); setName(""); setContact(""); load(); }
    else { if (r.error === "InvitesUnavailable") setUnavailable(r.detail); show(r); }
  });
  const decide = (id: string, decision: "approve" | "reject") => once(async () => {
    if (decision === "approve" && !confirm("Approve this device? Only approve if the fingerprint matches the one on the family member's phone.")) return;
    setBusy(id + decision); setMsg("");
    const r = await api("/api/invite/decide", { method: "POST", body: JSON.stringify({ id, decision }) });
    setBusy(""); show(r); load();
  });
  const revoke = (id: string) => once(async () => {
    if (!confirm("Revoke this device on Stellar? It will no longer be able to pay. Past payments stay final.")) return;
    setBusy(id + "revoke"); setMsg("");
    const r = await api("/api/invite/revoke", { method: "POST", body: JSON.stringify({ id }) });
    setBusy(""); show(r); load();
  });

  if (unavailable) return (
    <div className="card"><h2>2 · Invite a family member</h2>
      <div className="status pending">Invitations unavailable here: {unavailable}</div></div>
  );
  return (
    <div className="card" data-testid="invites">
      <h2>2 · Invite a family member</h2>
      <p className="muted">Creates a private, single-use link valid for 10 minutes. The family member opens it on their phone; you then approve their device.</p>
      <p className="hint">Demo limitation: you are signed in with the shared demo operator code, not a personal account. Invitations are bound to this browser session only.</p>
      <label htmlFor="inv-name">Family member&apos;s name</label>
      <input id="inv-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ana" />
      <label htmlFor="inv-contact">Contact (optional, for your reference)</label>
      <input id="inv-contact" value={contact} maxLength={80} onChange={(e) => setContact(e.target.value)} placeholder="phone or email" />
      <p className="muted">Not verified and nothing is sent to it. Share the link yourself over a channel you trust.</p>
      <button className="btn" disabled={!!busy || !fam || !name.trim() || !enabled} onClick={create}>{busy === "create" ? "Creating…" : "Invite family member"}</button>

      {link && (
        <div className="invite-link" data-testid="invite-link">
          <p><b>Private invitation link</b>: anyone with it can request access until it is used or expires, so share it only with {list.find((v) => v.id === link.id)?.name ?? "them"}.</p>
          <QR value={link.url} label="Invitation link" />
        </div>
      )}
      {msg && <div className="status bad">{msg}</div>}

      {list.length > 0 && <ul className="list invites">{list.map((v) => (
        <li key={v.id} data-testid={`invite-${v.id}`}>
          <div><b>{v.name}</b> <span className="muted">(name as you typed it, unverified){v.contact ? ` · ${v.contact} (unverified)` : ""}</span></div>
          <div className={"status " + (KIND[v.status] ?? "info")} data-testid="invite-status">{LABEL[v.status] ?? v.status}
            {v.status === "PENDING" && ` · link expires in ${mins(v.expiresAt)} min`}
            {v.status === "ACCEPTED" && v.approveBy && ` · approve within ${mins(v.approveBy)} min`}</div>
          {v.device && (
            <p>Device “{v.device.label || "unnamed"}”, fingerprint <span className="fp" data-testid="invite-fp">{v.device.fingerprint}</span><br />
              <span className="muted">Approve only if this exactly matches the fingerprint shown on their phone (check in person or on a call).</span></p>
          )}
          {v.lastError && <div className="status bad">{v.lastError}</div>}
          {v.status === "ACCEPTED" && (<>
            <button className="btn" disabled={!!busy} onClick={decide(v.id, "approve")}>{busy === v.id + "approve" ? "Registering on Stellar…" : "Approve device"}</button>
            <button className="btn danger" disabled={!!busy} onClick={decide(v.id, "reject")}>Reject</button>
          </>)}
          {v.status === "CONNECTED" && (<>
            <p className="muted">Public key registered on Stellar. <TxLink hash={v.regTx} /></p>
            <button className="btn danger small" disabled={!!busy} onClick={revoke(v.id)}>{busy === v.id + "revoke" ? "Revoking…" : "Revoke device"}</button>
          </>)}
          {v.status === "REVOKED" && <p className="muted">Key revoked on Stellar. <TxLink hash={v.revokeTx} /></p>}
        </li>
      ))}</ul>}
    </div>
  );
}
