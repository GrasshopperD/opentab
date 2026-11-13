"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../components";

interface Check { name: string; ok: boolean; detail: string }
const ROUTES = ["/", "/sender", "/family", "/shop", "/manifest.webmanifest", "/sw.js"];

export function Preflight() {
  const [data, setData] = useState<{ public: Check[]; operator: Check[] | null; authorized: boolean; checkedAt: string } | null>(null);
  const [routes, setRoutes] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const runAll = useCallback(async () => {
    setBusy(true);
    const [d, r] = await Promise.all([
      api("/api/preflight"),
      Promise.all(ROUTES.map(async (p) => {
        try { const res = await fetch(p, { cache: "no-store" }); return { name: `Route ${p}`, ok: res.ok, detail: `HTTP ${res.status}` }; }
        catch { return { name: `Route ${p}`, ok: false, detail: "unreachable" }; }
      })),
    ]);
    setData(d.error ? { public: [{ name: "Preflight API", ok: false, detail: d.detail ?? d.error }], operator: null, authorized: false, checkedAt: "" } : d);
    setRoutes(r); setBusy(false);
  }, []);
  useEffect(() => { runAll(); }, [runAll]);

  const row = (c: Check) => (
    <li key={c.name} className={"check " + (c.ok ? "pass" : "fail")}>
      <span aria-hidden>{c.ok ? "✓" : "✗"}</span><div><b>{c.name}</b><br /><span className="muted">{c.detail}</span></div>
    </li>
  );
  const all = [...(data?.public ?? []), ...routes];
  const okCount = all.filter((c) => c.ok).length;
  return (
    <section className="card" aria-labelledby="pf-h">
      <h2 id="pf-h">Demo preflight <span className="muted">(read-only, spends nothing)</span></h2>
      {!data ? <p className="muted">Running checks…</p> : (
        <>
          <p className={"status " + (okCount === all.length ? "ok" : "bad")}>{okCount}/{all.length} public checks passed</p>
          <h3>Public</h3>
          <ul className="checks">{data.public.map(row)}{routes.map(row)}</ul>
          <h3>Operator only</h3>
          {data.operator ? <ul className="checks">{data.operator.map(row)}</ul>
            : <p className="muted">Signer and funding checks are shown to demo operators only. Sender and Shop need no access code.</p>}
          <p className="muted">Checked {data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString() : "-"}</p>
        </>
      )}
      <button className="btn ghost small" onClick={runAll} disabled={busy}>{busy ? "Checking…" : "Run again"}</button>
    </section>
  );
}
