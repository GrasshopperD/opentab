"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { fingerprint, fromHex, publicKeyOf } from "@opentab/shared";
import { Arrow, Brand, RoleIcon } from "./design";
import { accessLogin, accessStatus, type AccessState } from "../opentab-api";
import { ensureDeviceKey, saveDisplayName, saveFamilyNumber, storedDeviceKey, storedDisplayName, storedFamilyNumber } from "../family/use-family-wallet";
import { loadShopSettings, saveShopSettings } from "../shop/use-checkout";
import { MERCHANTS } from "@/lib/config";

// Product Mode setup. There are NO personal accounts in this Testnet demo: no email, password or identity is collected.
// Each role's steps do real work with the existing system:
//  - organizer / merchant: unlock the existing protected demo session (/api/auth/login, HttpOnly cookie);
//  - recipient: display name + family number + this phone's signing key (created only if none exists, never replaced);
//  - merchant: which demo shop identity and terminal number the checkout uses.
// The remembered-role cookie is a display preference only; it never authenticates anything.
type Role = "organizer" | "recipient" | "merchant";
type Stage = "signin" | "family-role" | "access" | "details" | "preferences" | "review" | "ready";
const ROLE_COPY = {
  organizer: { label: "Organizer", demo: "/dashboard", action: "Open my dashboard" },
  recipient: { label: "Recipient", demo: "/wallet", action: "Open my Family Wallet" },
  merchant: { label: "Merchant", demo: "/business/checkout", action: "Open checkout" },
};
const FLOW: Record<Role, Stage[]> = {
  organizer: ["family-role", "access", "ready"],
  recipient: ["family-role", "details", "preferences", "review", "ready"],
  merchant: ["access", "details", "ready"],
};

export function Onboarding() {
  const params = useSearchParams();
  const requestedRole = params.get("role");
  const initialRole = requestedRole === "organizer" || requestedRole === "recipient" || requestedRole === "merchant" ? requestedRole : null;
  const business = initialRole === "merchant";
  const signin = params.get("mode") === "signin";
  const [role, setRole] = useState<Role | null>(initialRole);
  const [stage, setStage] = useState<Stage>(signin ? "signin" : business ? "access" : "family-role");
  const cookieName = business ? "opentab_business_preview" : "opentab_family_preview";
  const [remembered, setRemembered] = useState(false);
  const [access, setAccess] = useState<AccessState | null>(null);
  const [code, setCode] = useState(""), [codeError, setCodeError] = useState(""), [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [familyNumber, setFamilyNumber] = useState("");
  const [hasKey, setHasKey] = useState(false), [keyFp, setKeyFp] = useState("");
  const [shop, setShop] = useState<"A" | "B">("A"), [terminal, setTerminal] = useState("1");
  const heading = useRef<HTMLHeadingElement>(null);
  const copy = role ? ROLE_COPY[role] : null;
  const steps = role ? FLOW[role] : FLOW.organizer;
  const progress = Math.max(1, steps.indexOf(stage) + 1);

  useEffect(() => { heading.current?.focus(); }, [stage]);
  useEffect(() => {
    accessStatus().then(r => { if (!r.error) setAccess(r); });
    setName(storedDisplayName()); setFamilyNumber(storedFamilyNumber());
    const k = storedDeviceKey(); setHasKey(!!k); if (k) setKeyFp(fingerprint(publicKeyOf(fromHex(k))));
    const s = loadShopSettings(); setShop(s.mid); setTerminal(s.terminal);
    if (signin) return;
    const saved = document.cookie.split("; ").find(c => c.startsWith(`${cookieName}=`))?.split("=")[1];
    if ((business && saved === "merchant") || (!business && (saved === "organizer" || saved === "recipient"))) {
      setRole(saved); setRemembered(true); setStage("ready");
    }
  }, [business, cookieName, signin]);

  function next(from: Stage, r: Role | null = role) {
    if (!r) return;
    const flow = FLOW[r]; const i = flow.indexOf(from);
    setStage(flow[Math.min(flow.length - 1, i + 1)]);
  }
  function back() {
    if (!role) { setStage("family-role"); return; }
    const i = steps.indexOf(stage);
    if (i > 0) setStage(steps[i - 1]);
  }
  function rememberRole(r: Role) {
    document.cookie = `${cookieName}=${r}; Path=/; Max-Age=2592000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  function reset() {
    document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
    setRemembered(false); setRole(initialRole); setStage(business ? "access" : "family-role");
  }
  async function unlock(e: FormEvent) {
    e.preventDefault(); if (busy || !code) return; setBusy(true); setCodeError("");
    try {
      const r = await accessLogin(code);
      if (r.authorized) {
        setAccess({ enabled: true, authorized: true }); setCode("");
        if (stage === "signin") setStage(business ? "details" : "family-role");
        else if (role === "organizer") finishOther("organizer");
        else next("access");
      }
      else setCodeError(r.detail || (r.error === "RateLimited" ? "Too many attempts. Try again later." : "That code didn’t work."));
    } finally { setBusy(false); }
  }
  function finishRecipient() {
    // Real setup on this phone: keeps an existing key, creates one only if missing. Pairing still needs the organizer.
    const k = ensureDeviceKey();
    saveDisplayName(name.trim()); saveFamilyNumber(familyNumber);
    setHasKey(true); setKeyFp(fingerprint(publicKeyOf(fromHex(k))));
    rememberRole("recipient"); setStage("ready");
  }
  function finishOther(r: Role) {
    if (r === "merchant") saveShopSettings({ mid: shop, terminal: terminal || "1" });
    rememberRole(r); setStage("ready");
  }

  const title = stage === "signin" ? "Welcome back" : stage === "family-role" ? "How will you use OpenTab?" : stage === "access" ? role === "merchant" ? "Unlock your checkout" : "Unlock organizer tools"
    : stage === "details" ? role === "merchant" ? "Set up your checkout" : "Tell us about yourself" : stage === "preferences" ? "Join your family" : stage === "review" ? "Check your details"
    : remembered ? "Welcome back" : role === "recipient" ? "Your phone is ready to pair" : "You’re ready";
  const accessForm = <form onSubmit={unlock} className="ot-form">
    <div className="ot-field"><label htmlFor="ot-code">Demo access code</label><input id="ot-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required maxLength={200} /></div>
    {codeError && <p className="ot-form-error" role="alert">{codeError}</p>}
    <button className="ot-button ot-button-full" type="submit" disabled={busy || !code}>{busy ? "Checking…" : "Unlock"}<Arrow /></button>
    <p className="ot-form-note">This Testnet demo has no personal accounts. The code unlocks the demo’s server-held Testnet accounts for this browser session; it is never stored on the page.</p>
  </form>;
  const merchantName = MERCHANTS.find(m => m.id === shop)?.name ?? "Demo shop";

  return <>
    <a className="ot-skip" href="#onboarding-main">Skip to setup</a>
    <header className="ot-header ot-setup-header ot-simple-header"><Brand /></header>
    <main id="onboarding-main" className={`ot-onboarding ot-simple-onboarding ${role ? `ot-theme-${role}` : ""}`}>
      <section className="ot-setup-panel" aria-label="Role setup">
        {stage !== "signin" && stage !== steps[0] && !remembered && <div className="ot-setup-topline"><button className="ot-back" onClick={back}><Arrow back /> Back</button><span className="ot-simple-step">Step {progress} of {steps.length}</span></div>}
        <div className="ot-setup-content">
          <h1 ref={heading} tabIndex={-1}>{title}</h1>

          {stage === "signin" && <>
            <p className="ot-setup-subtitle">Organizers and merchants sign in with the demo access code. Family members don’t sign in: their phone holds its own key.</p>
            {access?.authorized ? <><p className="ot-form-note">Demo access is already active on this browser.</p><button className="ot-button ot-button-full" onClick={() => setStage(business ? "details" : "family-role")}>Continue <Arrow /></button></> : accessForm}
            <div className="ot-form-switch">Family member? <Link href="/wallet">Open your Family Wallet</Link></div>
          </>}

          {stage === "family-role" && <div className="ot-choice-form">
            <div className="ot-options" role="group" aria-label="Choose family role">
              <button className={`ot-option ${role === "organizer" ? "is-selected" : ""}`} aria-pressed={role === "organizer"} onClick={() => setRole("organizer")}><span className="ot-option-icon"><RoleIcon kind="organizer" /></span><span><b>I’m an organizer</b><span>I want to set up and support my family.</span></span><span className="ot-radio" /></button>
              <button className={`ot-option ${role === "recipient" ? "is-selected" : ""}`} aria-pressed={role === "recipient"} onClick={() => setRole("recipient")}><span className="ot-option-icon"><RoleIcon kind="recipient" /></span><span><b>I’m a recipient</b><span>I’m joining a family that supports me.</span></span><span className="ot-radio" /></button>
            </div>
            <button className="ot-button ot-button-full" disabled={role !== "organizer" && role !== "recipient"} onClick={() => next("family-role")}>Continue <Arrow /></button>
            <p className="ot-form-note">No account is created. Your role choice is remembered on this browser only.</p>
          </div>}

          {stage === "access" && <>
            {!access ? <p className="ot-form-note" role="status">Checking demo access…</p>
              : !access.enabled ? <><p className="ot-setup-subtitle">Demo access isn’t configured on this deployment, so funding, pairing and payments are unavailable here.</p><button className="ot-button ot-button-full" onClick={() => next("access")}>Continue anyway <Arrow /></button></>
              : access.authorized ? <><p className="ot-setup-subtitle">Demo access is active on this browser.</p><button className="ot-button ot-button-full" onClick={() => role === "organizer" ? finishOther("organizer") : next("access")}>Continue <Arrow /></button></>
              : <><p className="ot-setup-subtitle">{role === "merchant" ? "Accepting payments uses the demo shop’s Testnet account." : "Adding funds and connecting phones use the demo sender’s Testnet account."}</p>{accessForm}{role === "organizer" && <button className="ot-start-over" onClick={() => finishOther("organizer")}>I’ll unlock it later <Arrow /></button>}</>}
          </>}

          {stage === "details" && role === "recipient" && <form className="ot-form" onSubmit={e => { e.preventDefault(); next("details"); }}>
            <div className="ot-field"><label htmlFor="ot-space">Your display name</label><input id="ot-space" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ana" required maxLength={40} /></div>
            <span className="ot-field-hint">Shown to your organizer when they connect this phone.</span>
            <button className="ot-button ot-button-full" type="submit">Continue <Arrow /></button>
          </form>}

          {stage === "details" && role === "merchant" && <form className="ot-form" onSubmit={e => { e.preventDefault(); finishOther("merchant"); }}>
            <div className="ot-field"><label htmlFor="ot-shop">Shop</label><select id="ot-shop" value={shop} onChange={e => setShop(e.target.value as "A" | "B")}>{MERCHANTS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div className="ot-field"><label htmlFor="ot-terminal">Counter (terminal number)</label><input id="ot-terminal" inputMode="numeric" value={terminal} onChange={e => setTerminal(e.target.value.replace(/\D/g, "").slice(0, 4))} required /></div>
            <span className="ot-field-hint">Demo shops are Testnet accounts run by this demo. Prices are in USD; settlement is in OTUSD test tokens.</span>
            <button className="ot-button ot-button-full" type="submit">Finish setup <Arrow /></button>
          </form>}

          {stage === "preferences" && <form className="ot-form" onSubmit={e => { e.preventDefault(); next("preferences"); }}>
            <div className="ot-field"><label htmlFor="ot-family-number">Family number <span className="ot-optional">optional</span></label><input id="ot-family-number" inputMode="numeric" pattern="[0-9]{1,12}" maxLength={12} placeholder="The number your organizer shared" value={familyNumber} onChange={e => setFamilyNumber(e.target.value.replace(/\D/g, ""))} /></div>
            <span className="ot-field-hint">A family number alone never lets anyone spend. Your organizer must also scan this phone’s pairing code and authorize it on Stellar.</span>
            <button className="ot-button ot-button-full" type="submit">Review my setup <Arrow /></button>
          </form>}

          {stage === "review" && <div className="ot-review">
            <div className="ot-profile"><span className="ot-option-icon"><RoleIcon kind="recipient" /></span><div><span>RECIPIENT PHONE</span><h2>{name}</h2></div></div>
            <dl><div><dt>Family number</dt><dd>{familyNumber ? `#${familyNumber} · not connected yet` : "Add later"}</dd></div><div><dt>Signing key</dt><dd>{hasKey ? `Keep this phone’s key · ${keyFp}` : "Create one on this phone"}</dd></div></dl>
            <p className="ot-form-note">The private key stays in this browser and is never sent anywhere. Testnet demo storage: unencrypted, no backup.</p>
            <button className="ot-button ot-button-full" onClick={finishRecipient}>{hasKey ? "Save and continue" : "Create my key"} <Arrow /></button>
          </div>}

          {stage === "ready" && role && <div className="ot-ready">
            <div className="ot-ready-space"><div className="ot-ready-space-top"><span className="ot-space-avatar"><RoleIcon kind={role} /></span><span className="ot-preview-tag">{copy?.label}</span></div>
              {role === "recipient" ? <><h2>{name || storedDisplayName() || "This phone"}</h2><p>{hasKey ? `Security code ${keyFp}. ` : ""}Next: open your Family Wallet and show its pairing code to your organizer. Payments work only after Stellar confirms the authorization.</p><span className="ot-space-location">{familyNumber ? `Family #${familyNumber}` : "Family number not set yet"}</span></>
                : role === "merchant" ? <><h2>{merchantName}</h2><p>Counter #{terminal || "1"} · USD prices · settles in OTUSD on Stellar Testnet. A sale is paid only when Stellar confirms it.</p><span className="ot-space-location">{access?.authorized ? "Demo access active" : "Demo access needed at checkout"}</span></>
                : <><h2>Your organizer dashboard</h2><p>Opens on the demo’s existing Family #7, with its live balance from Stellar. Nothing is created or funded automatically.</p><span className="ot-space-location">{access?.authorized ? "Demo access active" : "Demo access needed to add funds"}</span></>}
            </div>
            <Link className="ot-button ot-button-full" prefetch={false} href={copy!.demo}>{copy?.action} <Arrow /></Link>
            <button className="ot-start-over" onClick={reset}>{remembered ? "Choose a different role" : "Start over"} <Arrow /></button>
          </div>}
        </div>
      </section>
    </main>
  </>;
}
