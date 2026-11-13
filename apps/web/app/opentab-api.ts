"use client";
// Typed browser wrappers for the EXISTING OpenTab API routes, shared by Demo Mode and Product Mode so both send exactly
// the same requests. No new endpoints, no secrets: every call goes to the same guarded server routes (CSRF origin check,
// demo-session cookie, rate and input limits) and the FamilyVault contract decides what is allowed.
import { api } from "./components";

export interface AccessState { enabled: boolean; authorized: boolean }
export interface FamilyTotals { balance: string; total_deposited: string; total_paid: string; total_withdrawn: string }
export interface Payment { txHash: string; invoiceId: string; amount: string; merchant: string; at?: string; terminalId: string | number; familyId?: string }
export interface FamilyInfo { familyId?: string; family?: FamilyTotals; payments?: Payment[]; keyActive?: boolean; error?: string; detail?: string }
/** Response of the signing routes: hash/status from Stellar, or an error code. create-family adds its own fields. */
export interface TxResult {
  error?: string; detail?: string; status?: "CONFIRMED" | "FAILED" | "PENDING" | "UNKNOWN"; hash?: string;
  familyId?: string; createTx?: string; depositTx?: string; depositStatus?: string; step?: string; balance?: string;
}

const post = <T,>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });

/** GET /api/auth/status → whether the demo access code is configured and this browser holds a valid session. */
export const accessStatus = () => api<AccessState & { error?: string }>("/api/auth/status");
/** POST /api/auth/login → sets the HttpOnly demo-session cookie. The code is never stored in the browser. */
export const accessLogin = (code: string) => post<{ authorized?: boolean; error?: string; detail?: string }>("/api/auth/login", { code });
export const accessLogout = () => post<{ authorized?: boolean; error?: string }>("/api/auth/logout", {});

/** GET /api/family/{id}[?key=] → live on-chain family totals, recent confirmed purchases, and (with key) authorization. */
export const readFamily = (familyId: string, publicKey?: string) =>
  api<FamilyInfo>(`/api/family/${familyId}${publicKey ? `?key=${publicKey}` : ""}`);
/** POST /api/sender/family → create_family THEN deposit (the server has no create-without-deposit call). */
export const createFamily = (amount: string) => post<TxResult>("/api/sender/family", { amount });
/** POST /api/sender/deposit → deposit from the demo sender (Testnet, max 50). */
export const depositFunds = (familyId: string, amount: string) => post<TxResult>("/api/sender/deposit", { familyId, amount });
/** POST /api/sender/key → register_key / revoke_key for a recipient device's PUBLIC key. */
export const setDeviceKey = (familyId: string, publicKey: string, action: "register" | "revoke") =>
  post<TxResult>("/api/sender/key", { familyId, publicKey, action });
/** GET /api/tx/{hash} → read-only reconciliation by hash. Never resubmits. */
export const txStatus = (hash: string) => api<TxResult>(`/api/tx/${hash}`);
