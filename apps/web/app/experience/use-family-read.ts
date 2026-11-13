"use client";
// READ-ONLY view of one family, straight from the existing public endpoint GET /api/family/{id} (FamilyVault on Stellar
// Testnet: balance, totals, and confirmed "paid" events from roughly the last day). Used by Product Mode and by the Demo
// activity card. Never writes, never caches values as if they were fresh, never invents data.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../components";

export interface FamilyPayment { txHash: string; ledger?: number; at?: string; familyId?: string | number; merchant: string; amount: string; terminalId?: number | string; invoiceId: string }
export interface FamilyRead {
  family?: { balance: string; total_deposited: string; total_paid: string; total_withdrawn: string };
  payments?: FamilyPayment[]; error?: string; detail?: string;
}

/** Newest first (the RPC returns events oldest first). */
export const newestFirst = (p: FamilyPayment[] = []) => [...p].sort((a, b) => (b.ledger ?? 0) - (a.ledger ?? 0));

export function useFamilyRead(familyId: string, { pollMs = 0 }: { pollMs?: number } = {}) {
  const [info, setInfo] = useState<FamilyRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    const r = await api<FamilyRead>(`/api/family/${familyId}`);
    if (n !== seq.current) return;           // ignore out-of-order answers
    setInfo(r); setLoading(false);
    if (!r.error) setCheckedAt(Date.now());
  }, [familyId]);
  useEffect(() => { refresh(); }, [refresh]);
  // Fresh read whenever the page becomes visible again (e.g. after a payment in Demo Mode), plus optional polling.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const t = pollMs > 0 ? setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) refresh(); }, pollMs) : undefined;
    return () => { document.removeEventListener("visibilitychange", onVisible); if (t) clearInterval(t); };
  }, [refresh, pollMs]);
  return { info, loading, checkedAt, refresh, payments: newestFirst(info?.payments), ok: !!info?.family && !info.error };
}
