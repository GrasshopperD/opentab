"use client";
// Sender-side browser state shared by Demo Mode (/sender) and Product Mode (/dashboard). Convenience only: the family
// balance, totals and device authorization are always read live from Stellar; nothing here grants any permission.
import { DEMO_FAMILY_ID } from "@/lib/config";

export const FAMILIES = "opentab.sender.families";        // families created/opened on this browser (same key as before)
export const SELECTED = "opentab.sender.selected";        // family last opened in Product Mode
export const DEVICES = "opentab.sender.devices";          // phones this browser authorized (public keys only)
export const validFamilyId = (id: string) => /^\d{1,12}$/.test(id);

export function savedFamilies(): string[] {
  try { const s = JSON.parse(localStorage.getItem(FAMILIES) || "[]"); return Array.isArray(s) ? [...new Set(s.filter((v): v is string => typeof v === "string" && validFamilyId(v)))] : []; } catch { return []; }
}
export function rememberFamily(id: string): string[] {
  const list = [...new Set([...savedFamilies(), id].filter(validFamilyId))];
  try { localStorage.setItem(FAMILIES, JSON.stringify(list)); } catch { /* storage blocked: the UI still works */ }
  return list;
}
/** The demo preset (an EXISTING funded family) unless another family was opened here before. Never creates anything. */
export function selectedFamily(): string {
  try { const s = localStorage.getItem(SELECTED) || ""; return validFamilyId(s) ? s : DEMO_FAMILY_ID; } catch { return DEMO_FAMILY_ID; }
}
export function selectFamily(id: string) { if (validFamilyId(id)) try { localStorage.setItem(SELECTED, id); } catch { } }

export interface PairedDevice { familyId: string; pub: string; label: string; at: number }
export function pairedDevices(): PairedDevice[] {
  try {
    const s = JSON.parse(localStorage.getItem(DEVICES) || "[]");
    return Array.isArray(s) ? s.filter((d) => d && validFamilyId(String(d.familyId)) && /^[0-9a-f]{64}$/.test(String(d.pub))).slice(0, 50) : [];
  } catch { return []; }
}
/** Records a phone after Stellar CONFIRMED its registration. Public key and label only. */
export function rememberDevice(d: Omit<PairedDevice, "at">): PairedDevice[] {
  const list = [{ ...d, label: d.label.slice(0, 40), at: Date.now() }, ...pairedDevices().filter((x) => !(x.familyId === d.familyId && x.pub === d.pub))].slice(0, 50);
  try { localStorage.setItem(DEVICES, JSON.stringify(list)); } catch { }
  return list;
}
