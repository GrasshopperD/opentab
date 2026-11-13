"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Arrow, Brand, RoleIcon } from "./design";

// Product Mode setup: choose a role. There are NO personal accounts in this Testnet demo (no email, password or identity
// is collected or sent). The role only decides where Product Mode takes you; it is NOT payment authorization.
// The remembered-role cookie is a display preference only.
type Role = "organizer" | "recipient" | "merchant";
const ROLES: Record<Role, { label: string; option: string; text: string; product: string; productAction: string; demo: string; demoAction: string; next: string }> = {
  organizer: { label: "Organizer", option: "I’m an organizer", text: "I want to set up and support my family.", product: "/dashboard", productAction: "Open my dashboard",
    demo: "/demo/sender", demoAction: "Add funds or pair a phone in Demo Mode", next: "Your dashboard shows the demo’s real Family #7 balance and purchases from Stellar Testnet. Adding funds and pairing phones happen in Demo Mode with the demo access code." },
  recipient: { label: "Family member", option: "I’m a family member", text: "I’m joining a family that supports me.", product: "/wallet", productAction: "Open my Family Wallet",
    demo: "/demo/family", demoAction: "Set up this phone in Demo Mode", next: "To pay, this phone needs its own signing key, paired by your organizer on Stellar. Set it up in the Family Wallet (Demo Mode); then Scan to Pay works even offline." },
  merchant: { label: "Merchant", option: "I’m a merchant", text: "I run a shop that accepts OpenTab.", product: "/business", productAction: "See the shop experience",
    demo: "/demo/shop", demoAction: "Open Merchant Checkout in Demo Mode", next: "Merchant Checkout (Demo Mode) shows the invoice QR, verifies the customer’s signed approval and settles on Stellar Testnet. Payment shows only after Stellar confirms." },
};

export function Onboarding() {
  const params = useSearchParams();
  const requested = params.get("role");
  const initialRole: Role | null = requested === "organizer" || requested === "recipient" || requested === "merchant" ? requested : null;
  const signin = params.get("mode") === "signin";
  const [role, setRole] = useState<Role | null>(initialRole);
  const [stage, setStage] = useState<"role" | "ready">("role");
  const [remembered, setRemembered] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const cookieName = "opentab_role_preview";
  useEffect(() => { heading.current?.focus(); }, [stage]);
  useEffect(() => {
    if (initialRole) return;
    const saved = document.cookie.split("; ").find(c => c.startsWith(`${cookieName}=`))?.split("=")[1];
    if (saved === "organizer" || saved === "recipient" || saved === "merchant") { setRole(saved); setRemembered(true); setStage("ready"); }
  }, [initialRole]);
  function finish() {
    if (!role) return;
    document.cookie = `${cookieName}=${role}; Path=/; Max-Age=2592000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setStage("ready");
  }
  function reset() { document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`; setRemembered(false); setRole(null); setStage("role"); }
  const r = role ? ROLES[role] : null;
  const title = stage === "role" ? signin ? "Welcome back" : "How will you use OpenTab?" : remembered ? "Welcome back" : "You’re all set";

  return <>
    <a className="ot-skip" href="#onboarding-main">Skip to setup</a>
    <header className="ot-header ot-setup-header ot-simple-header"><Brand /></header>
    <main id="onboarding-main" className={`ot-onboarding ot-simple-onboarding ${role ? `ot-theme-${role}` : ""}`}>
      <section className="ot-setup-panel" aria-label="Role setup">
        {stage === "ready" && !remembered && <div className="ot-setup-topline"><button className="ot-back" onClick={() => setStage("role")}><Arrow back /> Back</button><span className="ot-simple-step">Step 2 of 2</span></div>}
        <div className="ot-setup-content">
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          {stage === "role" && <div className="ot-choice-form">
            {signin && <p className="ot-setup-subtitle">This Testnet demo has no personal accounts, so there is nothing to sign in to. Choose your role to continue.</p>}
            <div className="ot-options" role="group" aria-label="Choose your role">
              {(Object.keys(ROLES) as Role[]).map(id => <button key={id} className={`ot-option ${role === id ? "is-selected" : ""}`} aria-pressed={role === id} onClick={() => setRole(id)}>
                <span className="ot-option-icon"><RoleIcon kind={id} /></span><span><b>{ROLES[id].option}</b><span>{ROLES[id].text}</span></span><span className="ot-radio" /></button>)}
            </div>
            <button className="ot-button ot-button-full" disabled={!role} onClick={finish}>Continue <Arrow /></button>
            <p className="ot-form-note">No account is created and nothing is sent. Choosing a role is not payment authorization.</p>
          </div>}
          {stage === "ready" && r && role && <div className="ot-ready">
            <div className="ot-ready-space"><div className="ot-ready-space-top"><span className="ot-space-avatar"><RoleIcon kind={role} /></span><span className="ot-preview-tag">{r.label}</span></div>
              <h2>{r.productAction}</h2><p>{r.next}</p><span className="ot-space-location">Role choice saved on this browser only · not an account</span></div>
            <Link className="ot-button ot-button-full" prefetch={false} href={r.product}>{r.productAction} <Arrow /></Link>
            <Link className="ot-start-over" prefetch={false} href={r.demo}>{r.demoAction} <Arrow /></Link>
            <button className="ot-start-over" onClick={reset}>Choose a different role <Arrow /></button>
          </div>}
        </div>
      </section>
    </main>
  </>;
}
