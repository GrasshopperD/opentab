"use client";
// ONE Family Wallet implementation shared by Demo Mode (/family) and Product Mode (/wallet).
// Moved here unchanged from app/family/page.tsx so both screens use the same device key, the same storage keys, the same
// Stellar authorization check and the same offline signing code. Switching screens never creates another wallet.
import { useCallback, useEffect, useState } from "react";
import {
  encodeAuthQR, encodePairingQR, fingerprint, formatLocal, fromHex, generateSecretKey,
  parseInvoiceQR, publicKeyOf, signInvoice, toHex, type Invoice,
} from "@opentab/shared";
import { api } from "../components";
import { MERCHANTS, TOKEN_ID, VAULT_ID } from "@/lib/config";

// TESTNET DEMO KEY STORAGE: the private key is kept in this browser's localStorage.
// It never leaves the device. This is NOT production-grade custody.
export const SK = "opentab.family.sk", FAM = "opentab.family.id", NAME = "opentab.family.name", HIST = "opentab.family.history";
// Last answer from Stellar for THIS family + key (balance and authorization) and when it was read. Lets a connected
// phone open its wallet offline without re-pairing; always shown as "last synced", never as freshly checked.
export const SYNC = "opentab.family.sync";
const get = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export interface Hist { invoiceId: string; familyId?: string; merchant: string; amount: string; local: string; at: number; status: "AUTHORIZED_LOCALLY"; settled?: boolean }
export interface Sync { fam: string; pub: string; balance: string; keyActive: boolean; at: number }
/** "" = not checked yet this visit; "checking"; "ok" = Stellar answered now; "offline"; otherwise an API error code. */
export type Check = "" | "checking" | "ok" | "offline" | string;

/** Device key of this browser, if one exists. Never generates one. */
export function storedDeviceKey(): string { const k = get(SK); return /^[0-9a-f]{64}$/.test(k) ? k : ""; }
/** Used by Product onboarding: creates a key ONLY when this browser has none; an existing key is always kept. */
export function ensureDeviceKey(): string {
  const k = storedDeviceKey(); if (k) return k;
  const n = toHex(generateSecretKey()); set(SK, n); return n;
}
export function saveFamilyNumber(v: string) { if (/^\d{0,12}$/.test(v)) set(FAM, v); }
export function saveDisplayName(v: string) { set(NAME, v.slice(0, 40)); }
export const storedFamilyNumber = () => (/^\d{1,12}$/.test(get(FAM)) ? get(FAM) : "");
export const storedDisplayName = () => get(NAME);

export function useFamilyWallet() {
  const [sk, setSk] = useState("");
  const [fam, setFam] = useState("");
  const [name, setName] = useState("");
  const [sync, setSync] = useState<Sync | null>(null);
  const [check, setCheck] = useState<Check>("");
  const [paying, setPaying] = useState(false);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [err, setErr] = useState("");
  const [authQR, setAuthQR] = useState("");
  const [hist, setHist] = useState<Hist[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const k = get(SK); setSk(/^[0-9a-f]{64}$/.test(k) ? k : ""); setFam(/^\d{1,12}$/.test(get(FAM)) ? get(FAM) : ""); setName(get(NAME));
    try { setHist(JSON.parse(get(HIST) || "[]")); } catch { }
    try { const s = JSON.parse(get(SYNC) || "null"); if (s && typeof s.fam === "string" && typeof s.pub === "string") setSync(s); } catch { }
    setLoaded(true);
  }, []);
  const pub = sk ? toHex(publicKeyOf(fromHex(sk))) : "";
  const synced = sync && sync.fam === fam && sync.pub === pub ? sync : null;   // cache is only valid for this family + key
  const connected = !!sk && !!fam && synced?.keyActive === true;

  const refresh = useCallback(async () => {
    if (!fam || !pub) return;
    if (!navigator.onLine) { setCheck("offline"); return; }
    setCheck("checking");
    const r = await api(`/api/family/${fam}?key=${pub}`);
    if (r.error) { setCheck(r.error === "NetworkError" ? "offline" : r.error); return; }
    const s: Sync = { fam, pub, balance: String(r.family.balance), keyActive: r.keyActive === true, at: Date.now() };
    setSync(s); set(SYNC, JSON.stringify(s)); setCheck("ok");
  }, [fam, pub]);
  useEffect(() => { refresh(); }, [refresh]);

  // Onboarding step 3: while waiting for the sender, re-check Stellar every few seconds (online, page visible).
  useEffect(() => {
    if (connected || !sk || !fam) return;
    const t = setInterval(() => { if (navigator.onLine && document.visibilityState === "visible") refresh(); }, 5000);
    return () => clearInterval(t);
  }, [connected, sk, fam, refresh]);

  // When online, ask the chain whether each local approval has been settled by the shop.
  const checkSettled = useCallback(async () => {
    if (!navigator.onLine) return;
    const pending = hist.filter((h) => !h.settled && h.familyId && /^[0-9a-f]{64}$/.test(h.invoiceId));
    if (!pending.length) return;
    const results = await Promise.all(pending.map((h) => api(`/api/invoice?family=${h.familyId}&id=${h.invoiceId}`)));
    if (!results.some((r: any) => r.used === true)) return;
    const used = new Set(pending.filter((_, i) => (results[i] as any).used === true).map((h) => h.invoiceId));
    const nh = hist.map((h) => used.has(h.invoiceId) ? { ...h, settled: true } : h);
    setHist(nh); set(HIST, JSON.stringify(nh));
  }, [hist]);
  useEffect(() => {
    checkSettled();
    const on = () => { refresh(); checkSettled(); };
    const off = () => setCheck("offline");   // the shown balance is now a last-synced value, not a fresh check
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [checkSettled, refresh]);
  // While the signed approval is on screen and the phone happens to be online, notice the shop's settlement.
  useEffect(() => {
    if (!authQR) return;
    const t = setInterval(checkSettled, 5000);
    return () => clearInterval(t);
  }, [authQR, checkSettled]);

  /** Creates this device's key; replacing an existing key always asks first (the sender must pair the new key again). */
  function setup() {
    if (sk && !confirm("Replace this phone's key? Any family must re-authorize the new key.")) return;
    const k = toHex(generateSecretKey()); set(SK, k); setSk(k);
  }
  function deleteKey() { if (confirm("Delete key?")) { localStorage.removeItem(SK); setSk(""); } }
  const changeFam = (v: string) => { setFam(v); set(FAM, v); setCheck(""); };
  const changeName = (v: string) => { setName(v); set(NAME, v); };
  const onInvoice = useCallback((t: string) => {
    setErr(""); setAuthQR("");
    try {
      const i = parseInvoiceQR(t);
      if (i.vault !== VAULT_ID || i.token !== TOKEN_ID) throw new Error("This invoice is for a different vault or token. Do not approve.");
      setInv(i);
    } catch (e: any) { setErr(e.message); setInv(null); }
  }, []);

  function approve() {
    if (!inv || !sk || !fam) return;
    try {
      // Signing happens locally. No network request is made here.
      const a = signInvoice(inv, BigInt(fam), fromHex(sk), BigInt(Math.floor(Date.now() / 1000)));
      setAuthQR(encodeAuthQR(a));
      const h: Hist = { invoiceId: toHex(inv.invoiceId), familyId: fam, merchant: inv.merchantName, amount: inv.amount.toString(),
        local: `${inv.quote.currency} ${formatLocal(inv.quote.localMinor, inv.quote.minorDigits)}`, at: Date.now(), status: "AUTHORIZED_LOCALLY" };
      const nh = [h, ...hist].slice(0, 20); setHist(nh); set(HIST, JSON.stringify(nh));
    } catch (e: any) { setErr(e.message); }
  }
  const startPay = () => { setErr(""); setInv(null); setAuthQR(""); setPaying(true); };
  const endPay = () => { setErr(""); setInv(null); setAuthQR(""); setPaying(false); refresh(); };
  const cancelReview = () => { setErr(""); setInv(null); };

  const known = inv ? MERCHANTS.find((m) => m.address === inv.merchant) : undefined;
  const expMin = inv ? Math.max(0, Math.round((Number(inv.expiresAt) * 1000 - Date.now()) / 60000)) : 0;
  const thisApproval = inv ? hist.find((h) => h.invoiceId === toHex(inv.invoiceId)) : undefined;
  const fp = sk ? fingerprint(publicKeyOf(fromHex(sk))) : "";
  /** Public pairing code: label + PUBLIC key only. Never contains the private key. */
  const pairingCode = sk ? encodePairingQR(name || "phone", publicKeyOf(fromHex(sk))) : "";

  return {
    loaded, sk, fam, name, pub, fp, pairingCode, sync, synced, connected, check, hist,
    paying, inv, err, authQR, known, expMin, thisApproval,
    refresh, setup, deleteKey, changeFam, changeName, onInvoice, approve, startPay, endPay, cancelReview,
  };
}
