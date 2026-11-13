"use client";
import { useEffect, useRef, useState } from "react";
import { formatTokenAmount } from "@opentab/shared";
import { DEMO_FAMILY_ID, EXPLORER_TX, MERCHANTS, TOKEN_CODE } from "@/lib/config";
import { useFamilyRead } from "../experience/use-family-read";

// Confirmed Stellar Testnet payments for the demo family, read from the existing GET /api/family/{id} (contract "paid"
// events, roughly the last day). Only on-chain confirmed events are listed; the notice appears only when a NEW confirmed
// transaction hash shows up in a later read. Nothing here is simulated.
const name = (a: string) => MERCHANTS.find((m) => m.address === a)?.name ?? `${a.slice(0, 6)}…`;

export function LiveActivity() {
  const { info, loading, checkedAt, refresh, payments } = useFamilyRead(DEMO_FAMILY_ID, { pollMs: 20_000 });
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<{ hash: string; text: string } | null>(null);
  useEffect(() => {
    if (!info || info.error) return;
    const hashes = new Set(payments.map((p) => p.txHash));
    if (seen.current) {
      const n = payments.find((p) => !seen.current!.has(p.txHash));
      if (n) setFresh({ hash: n.txHash, text: `New confirmed payment: ${formatTokenAmount(BigInt(n.amount))} ${TOKEN_CODE} at ${name(n.merchant)} (Family #${DEMO_FAMILY_ID}).` });
    }
    seen.current = hashes;
  }, [info]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card" aria-labelledby="live-h" data-testid="live-activity">
      <div className="wallet-head"><h2 id="live-h">Live activity · Family #{DEMO_FAMILY_ID}</h2>
        <button className="linkbtn" onClick={refresh} disabled={loading}>{loading ? "Checking…" : "Refresh"}</button></div>
      {fresh && <div className="status ok" role="status" data-testid="new-payment">{fresh.text} <a href={EXPLORER_TX + fresh.hash} target="_blank" rel="noreferrer">View transaction ↗</a>
        <button className="linkbtn" onClick={() => setFresh(null)} aria-label="Dismiss">×</button></div>}
      <p className="muted">Confirmed payments read from the FamilyVault contract on Stellar Testnet (about the last day). Updates every 20 seconds while this page is open{checkedAt ? ` · checked ${new Date(checkedAt).toLocaleTimeString()}` : ""}.</p>
      {info?.error ? <p className="warn">Activity is unavailable right now ({info.error}). Try Refresh.</p>
        : !payments.length ? <p className="muted">{loading ? "Reading Stellar Testnet…" : "No confirmed payments in the recent window."}</p> : (
        <ul className="list" data-testid="live-list">{payments.slice(0, 8).map((p) => (
          <li key={p.txHash + p.invoiceId}><b>{formatTokenAmount(BigInt(p.amount))} {TOKEN_CODE}</b> at {name(p.merchant)} · Family #{String(p.familyId ?? DEMO_FAMILY_ID)} · <span className="settled">Confirmed on Stellar</span>
            {p.at && !Number.isNaN(Date.parse(p.at)) ? <span className="muted"> · {new Date(p.at).toLocaleString()}</span> : null}<br />
            <a className="txlink" href={EXPLORER_TX + p.txHash} target="_blank" rel="noreferrer">View on Stellar Expert ↗ <code>{p.txHash.slice(0, 10)}…{p.txHash.slice(-6)}</code></a></li>
        ))}</ul>
      )}
    </section>
  );
}
