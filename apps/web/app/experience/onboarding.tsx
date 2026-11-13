"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Arrow, Brand, RoleIcon } from "./design";

type Role = "organizer" | "recipient" | "merchant";
type Stage = "account" | "family-role" | "details" | "preferences" | "review" | "ready";
const COUNTRIES = ["Canada", "United States", "Mexico", "Brazil", "Philippines", "United Kingdom", "Other"];
const CURRENCIES = ["MXN", "USD", "CAD", "BRL", "PHP"];
const ROLE_COPY = {
  organizer: { label: "Organizer", demo: "/dashboard", action: "Open my dashboard" },
  recipient: { label: "Recipient", demo: "/demo/family", action: "Open recipient demo" },
  merchant: { label: "Merchant", demo: "/demo/shop", action: "Open merchant demo" },
};

export function Onboarding() {
  const params = useSearchParams();
  const requestedRole = params.get("role");
  const initialRole = requestedRole === "organizer" || requestedRole === "recipient" || requestedRole === "merchant" ? requestedRole : null;
  const [mode, setMode] = useState<"signup" | "signin">(params.get("mode") === "signin" ? "signin" : "signup");
  const [stage, setStage] = useState<Stage>("account");
  const [role, setRole] = useState<Role | null>(initialRole);
  const business = initialRole === "merchant";
  const cookieName = business ? "opentab_business_preview" : "opentab_family_preview";
  const [remembered, setRemembered] = useState(false);
  // Presentation only. The role cookie never authenticates or connects to payment code.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [spaceName, setSpaceName] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [familyNumber, setFamilyNumber] = useState("");
  const [terminal, setTerminal] = useState("Main counter");
  const [purpose, setPurpose] = useState("Everyday essentials");
  const heading = useRef<HTMLHeadingElement>(null);
  const copy = role ? ROLE_COPY[role] : null;
  const progress = stage === "account" ? 1 : stage === "family-role" ? 2 : stage === "details" ? 3 : stage === "preferences" ? 4 : 5;

  useEffect(() => { heading.current?.focus(); }, [stage]);
  useEffect(() => {
    const saved = document.cookie.split("; ").find(c => c.startsWith(`${cookieName}=`))?.split("=")[1];
    if ((business && saved === "merchant") || (!business && (saved === "organizer" || saved === "recipient"))) {
      setRole(saved); setRemembered(true); setStage("ready");
      setSpaceName(business ? "Your shop" : "Your family");
    }
  }, [business, cookieName]);
  function finish() {
    if (!role) return;
    document.cookie = `${cookieName}=${role}; Path=/; Max-Age=2592000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setStage("ready");
  }
  function reset() {
    document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
    setRemembered(false); setStage("account"); setRole(initialRole);
    setSpaceName(""); setCountry(""); setFamilyNumber(""); setName(""); setEmail("");
  }

  function back() {
    if (stage === "family-role") setStage("account");
    else if (stage === "details") setStage(role === "merchant" ? "account" : "family-role");
    else if (stage === "preferences") setStage("details");
    else if (stage === "review") setStage("preferences");
    else if (stage === "ready") setStage("review");
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (stage === "account") setStage(business ? "details" : "family-role");
    else if (stage === "details") setStage("preferences");
    else if (stage === "preferences") setStage("review");
  }
  function switchMode() { setMode(mode === "signup" ? "signin" : "signup"); setStage("account"); }
  const title = stage === "account" ? mode === "signin" ? "Welcome back" : "Welcome to OpenTab" : stage === "family-role" ? "How will you use OpenTab?" : stage === "details" ? role === "merchant" ? "Tell us about your shop" : role === "recipient" ? "Tell us about yourself" : "Name your family" : stage === "preferences" ? role === "merchant" ? "Set up your checkout" : role === "recipient" ? "Join your family" : "Choose your support" : stage === "review" ? "Check your details" : remembered ? "Welcome back" : "Your preview is ready";


  return <>
    <a className="ot-skip" href="#onboarding-main">Skip to setup</a>
    <header className="ot-header ot-setup-header ot-simple-header"><Brand /></header>
    <main id="onboarding-main" className={`ot-onboarding ot-simple-onboarding ${role ? `ot-theme-${role}` : ""}`}>
      <section className="ot-setup-panel" aria-label="Account and role setup">
        {stage !== "account" && !remembered && <div className="ot-setup-topline"><button className="ot-back" onClick={back}><Arrow back /> Back</button><span className="ot-simple-step">Step {business && progress > 2 ? progress - 1 : progress} of {business ? 4 : 5}</span></div>}
        <div className="ot-setup-content">
          <h1 ref={heading} tabIndex={-1}>{title}</h1>


          {stage === "account" && <form onSubmit={submit} className="ot-form">
            {mode === "signup" && <div className="ot-field"><label htmlFor="ot-name">Your name</label><input id="ot-name" name="name" autoComplete="given-name" placeholder="Your first name" value={name} onChange={e => setName(e.target.value)} required maxLength={60} /></div>}
            <div className="ot-field"><label htmlFor="ot-email">Email address</label><input id="ot-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></div>
            <button className="ot-button ot-button-full" type="submit">Continue<Arrow /></button>
            <div className="ot-form-switch">{mode === "signup" ? "Already have an account?" : "Don’t have an account?"} <button type="button" onClick={switchMode}>{mode === "signup" ? "Sign in" : "Sign up"}</button></div>
          </form>}

          {stage === "family-role" && <div className="ot-choice-form">
            <div className="ot-options" role="group" aria-label="Choose family role">
              <button className={`ot-option ${role === "organizer" ? "is-selected" : ""}`} aria-pressed={role === "organizer"} onClick={() => setRole("organizer")}><span className="ot-option-icon"><RoleIcon kind="organizer" /></span><span><b>I’m an organizer</b><span>I want to set up and support my family.</span></span><span className="ot-radio" /></button>
              <button className={`ot-option ${role === "recipient" ? "is-selected" : ""}`} aria-pressed={role === "recipient"} onClick={() => setRole("recipient")}><span className="ot-option-icon"><RoleIcon kind="recipient" /></span><span><b>I’m a recipient</b><span>I’m joining a family that supports me.</span></span><span className="ot-radio" /></button>
            </div>
            <button className="ot-button ot-button-full" disabled={role !== "organizer" && role !== "recipient"} onClick={() => setStage("details")}>Continue <Arrow /></button>
          </div>}

          {stage === "details" && <form className="ot-form" onSubmit={submit}>
            <div className="ot-field"><label htmlFor="ot-space">{role === "merchant" ? "Business name" : role === "recipient" ? "Your display name" : "Family space name"}</label><input id="ot-space" value={spaceName} onChange={e => setSpaceName(e.target.value)} placeholder={role === "merchant" ? "e.g. Tienda Rosa" : role === "recipient" ? "e.g. Ana" : "e.g. The Rivera family"} required maxLength={80} /></div>
            <div className="ot-field"><label htmlFor="ot-country">{role === "merchant" ? "Where is your shop?" : "Where are you based?"}</label><select id="ot-country" value={country} onChange={e => setCountry(e.target.value)} required><option value="" disabled>Select a country</option>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select></div>
            <button className="ot-button ot-button-full" type="submit">Continue <Arrow /></button>
          </form>}

          {stage === "preferences" && <form className="ot-form" onSubmit={submit}>
            {role === "organizer" ? <fieldset className="ot-purpose"><legend>A starting point for your support</legend>{["Everyday essentials", "Groceries & home", "Health & wellbeing"].map(p => <label key={p} className={purpose === p ? "is-selected" : ""}><input type="radio" name="purpose" value={p} checked={purpose === p} onChange={() => setPurpose(p)} /><span>{p}</span><span className="ot-radio" /></label>)}</fieldset> : role === "recipient" ? <><div className="ot-field"><label htmlFor="ot-family-number">Family number <span className="ot-optional">optional</span></label><input id="ot-family-number" inputMode="numeric" pattern="[0-9]{1,12}" maxLength={12} placeholder="The number your organizer shared" value={familyNumber} onChange={e => setFamilyNumber(e.target.value.replace(/\D/g, ""))} /></div></> : <><div className="ot-field"><label htmlFor="ot-currency">Pricing currency</label><select id="ot-currency" value={currency} onChange={e => setCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></div><div className="ot-field"><label htmlFor="ot-terminal">Counter name</label><input id="ot-terminal" value={terminal} onChange={e => setTerminal(e.target.value)} required maxLength={50} placeholder="e.g. Main counter" /></div></>}
            <button className="ot-button ot-button-full" type="submit">Review my setup <Arrow /></button>
          </form>}

          {stage === "review" && role && <div className="ot-review">
            <div className="ot-profile"><span className="ot-option-icon"><RoleIcon kind={role} /></span><div><span>{copy?.label.toUpperCase()} SPACE</span><h2>{spaceName}</h2></div></div>
            <dl><div><dt>Name</dt><dd>{name || spaceName}</dd></div><div><dt>Email</dt><dd>{email}</dd></div><div><dt>Based in</dt><dd>{country}</dd></div>{role === "organizer" ? <div><dt>Your focus</dt><dd>{purpose}</dd></div> : role === "recipient" ? <div><dt>Family number</dt><dd>{familyNumber ? `#${familyNumber} · not linked` : "Add later"}</dd></div> : <><div><dt>Local pricing</dt><dd>{currency}</dd></div><div><dt>Counter</dt><dd>{terminal}</dd></div></>}</dl>
            <button className="ot-button ot-button-full" onClick={finish}>Explore my {role === "merchant" ? "shop" : "family"} space <Arrow /></button>
          </div>}

          {stage === "ready" && role && <div className="ot-ready">
            <div className="ot-ready-space"><div className="ot-ready-space-top"><span className="ot-space-avatar">{spaceName.trim().slice(0, 1).toUpperCase()}</span><span className="ot-preview-tag">{copy?.label} preview</span></div><h2>{spaceName}</h2><p>{role === "organizer" ? "A space for your people. Built around the everyday." : role === "recipient" ? "Your family connection, ready to explore." : `${terminal} · ${currency} local pricing`}</p><span className="ot-space-location">{country}</span></div>
            <Link className="ot-button ot-button-full" prefetch={false} href={copy!.demo}>{copy?.action} <Arrow /></Link>
            <button className="ot-start-over" onClick={reset}>{remembered ? "Forget this preview" : "Start over"} <Arrow /></button>
          </div>}
        </div>

      </section>
    </main>
  </>;
}
