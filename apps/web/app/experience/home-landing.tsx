"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Arrow, Brand, Mark, RoleIcon } from "./design";
import { CountryJourney } from "./country-journey";
import { SiteHeader } from "./site-header";
import "./home.css";

const SCENES = [
  { label: "Support", title: "It starts with your people.", text: "An organizer puts support in one shared family allowance. A little help, ready for everyday life.", role: "organizer", caption: "One family. One shared allowance." },
  { label: "Approve", title: "A phone. A scan. A simple yes.", text: "At a participating shop, a family member reviews the purchase and approves on their phone. Their phone can be offline.", role: "recipient", caption: "Your phone can approve without mobile data." },
  { label: "Connect", title: "Around the corner. Full circle.", text: "The connected shop submits the approval to Stellar. Payment is complete only when settlement is confirmed.", role: "merchant", caption: "The shop waits for confirmed settlement." },
] as const;
const ROLES = [
  { id: "organizer", name: "Organizer", title: "Support the people you love.", description: "Give your family a shared space for everyday support, wherever you are.", steps: ["Create your family", "Add support", "Pair their phone"], cta: "Start as an organizer" },
  { id: "recipient", name: "Recipient", title: "Keep your support close.", description: "Join your family and get ready to approve purchases at participating local shops.", steps: ["Join your family", "Pair your phone", "Review and approve"], cta: "Start as a recipient" },
] as const;

function Walkthrough({ scene }: { scene: number }) {
  return <div className={`home-walkthrough home-walkthrough-${scene}`}>
    <div className="home-preview-heading"><span className="home-preview-symbol"><Mark /></span><span>OpenTab</span><span className="home-example-label">Illustrative walkthrough</span></div>
    <div className="home-preview-body" key={scene}>
      {scene === 0 ? <><span className="home-preview-overline">YOUR FAMILY</span><h3>A little support.<br />Everyday possibilities.</h3><div className="home-people"><span>A</span><span>M</span><span>R</span><span>One shared space</span></div><div className="home-preview-row"><span>Groceries & home</span><RoleIcon kind="family" /></div><div className="home-preview-row"><span>Health & wellbeing</span><span>＋</span></div></> : scene === 1 ? <><span className="home-preview-overline">AT YOUR LOCAL SHOP</span><div className="home-scan-illustration"><span /><Mark /><span /></div><h3>Scan. Review.<br />Approve.</h3><div className="home-offline-pill"><span /> Works with your phone offline</div></> : <><div className="home-confirm-illustration"><svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="1.5" /><path d="m25 41 10 10 21-23" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></div><span className="home-preview-overline">AFTER STELLAR CONFIRMS</span><h3>Support becomes<br />everyday essentials.</h3><div className="home-preview-row"><span>Family → Local shop</span><Arrow /></div></>}
    </div>
    <div className="home-preview-caption">{SCENES[scene].caption}</div>
  </div>;
}

export function HomeLanding() {
  const root = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLElement>(null);
  const [scene, setScene] = useState(0);
  const [role, setRole] = useState(0);
  const chosen = ROLES[role];

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add("is-visible"); }); }, { threshold: .12 });
    element.querySelectorAll("[data-reveal]").forEach(item => observer.observe(item));
    const update = () => {
      frame = 0;
      element.style.setProperty("--hero-progress", motion.matches ? "0" : String(Math.min(1, scrollY / innerHeight)));
      element.style.setProperty("--page-progress", String(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)));
      const bounds = story.current?.getBoundingClientRect();
      if (bounds && bounds.top < innerHeight * .5 && bounds.bottom > innerHeight * .5) {
        const rows = [...element.querySelectorAll<HTMLElement>("[data-story-step]")];
        let closest = 0, distance = Infinity;
        rows.forEach((row, i) => { const r = row.getBoundingClientRect(); const d = Math.abs(r.top + r.height * .5 - innerHeight * .5); if (d < distance) { distance = d; closest = i; } });
        setScene(closest);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const preferences = () => { element.classList.toggle("home-motion", !motion.matches); schedule(); };
    preferences(); window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule); motion.addEventListener("change", preferences);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); motion.removeEventListener("change", preferences); };
  }, []);

  return <div className="ot-landing" ref={root}>
    <a className="ot-skip" href="#main">Skip to content</a>
    <SiteHeader />
    <main id="main">
      <CountryJourney intro={
        <div className="home-intro-content"><div className="home-intro-mark"><Mark /></div><h1 id="hero-heading">Support, closer to home.</h1><p>A shared family allowance.<br className="home-phone-break" /> For the everyday things that matter.</p><Link className="ot-button home-primary" href="/onboarding">Get started <Arrow /></Link><span className="home-stellar">Built on <b><img src="/stellar-symbol.svg" alt="" width="21" height="19" /> Stellar</b></span></div>
      } />

      <section id="how-it-works" className="home-story-section" ref={story} aria-labelledby="story-heading">
        <div className="home-story-heading" data-reveal><h2 id="story-heading">One connection.<br />Three everyday moments.</h2></div>
        <div className="home-story-layout"><div className="home-story-copy">{SCENES.map((item, i) => <article key={item.label} data-story-step={i} className={scene === i ? "is-active" : ""}><span className="home-story-number">0{i + 1} / {item.label}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
          <div className="home-story-sticky"><div className="home-scene-controls" role="group" aria-label="Walkthrough steps">{SCENES.map((item, i) => <button key={item.label} onClick={() => setScene(i)} aria-pressed={scene === i}>{item.label}</button>)}</div><Walkthrough scene={scene} /></div>
        </div>
      </section>

      <section id="your-role" className="home-role-section" aria-labelledby="role-heading">
        <div className="home-role-intro" data-reveal><h2 id="role-heading">Where do you come in?</h2><p>Choose your role. We’ll keep the next steps simple.</p></div>
        <div className="home-role-tabs" role="tablist" aria-label="Explore your role">{ROLES.map((item, i) => <button key={item.id} id={`role-tab-${item.id}`} role="tab" aria-selected={role === i} aria-controls={`role-panel-${chosen.id}`} tabIndex={role === i ? 0 : -1} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? ROLES.length - 1 : (role + (event.key === "ArrowRight" ? 1 : ROLES.length - 1)) % ROLES.length; setRole(next); document.getElementById(`role-tab-${ROLES[next].id}`)?.focus(); } }} onClick={() => setRole(i)}><RoleIcon kind={item.id} />{item.name}</button>)}</div>
        <div className={`home-role-panel home-role-${chosen.id}`} role="tabpanel" id={`role-panel-${chosen.id}`} aria-labelledby={`role-tab-${chosen.id}`}>
          <div className="home-role-graphic" aria-hidden="true"><div className="home-role-rings"><span /><span /><span /></div><div className="home-role-emblem"><RoleIcon kind={chosen.id} /></div><div className="home-role-floating"><span className="home-dot" />{chosen.name}</div></div>
          <div className="home-role-copy" key={chosen.id}><h3>{chosen.title}</h3><p>{chosen.description}</p><ol>{chosen.steps.map((step, i) => <li key={step}><span>0{i + 1}</span>{step}</li>)}</ol><Link className="ot-button" href={`/onboarding?role=${chosen.id}`}>{chosen.cta} <Arrow /></Link></div>
        </div>
      </section>

      <section className="home-questions" aria-labelledby="questions-heading" data-reveal><h2 id="questions-heading">A few simple answers.</h2><div>
        <details><summary>Does the family phone need internet?<span aria-hidden="true">＋</span></summary><p>The phone can approve a purchase offline once its signing screen has been loaded and cached. The shop needs internet to submit the approval and confirm payment.</p></details>
        <details><summary>Does this use real money?<span aria-hidden="true">＋</span></summary><p>The working demo uses OTUSD on Stellar Testnet. These demo tokens have no monetary value. Exchange rates are illustrative, and bank payouts are not available.</p></details>
        <details><summary>Can I try getting started?<span aria-hidden="true">＋</span></summary><p>Yes. Product Mode shows the demo’s real Family #7 balance and purchases from Stellar Testnet. Real payments run in Demo Mode: use the switch at the top of the page. No account is created and nothing personal is collected.</p></details>
      </div></section>
      <section className="home-final" data-reveal><Mark /><h2>A little closer starts here.</h2><Link href="/onboarding" className="ot-button home-primary">Get started <Arrow /></Link></section>
    </main>
    <footer className="ot-footer home-footer"><Brand /><p>Product Mode preview · Testnet tokens have no value.</p><Link href="/demo" prefetch={false}>Working demo <Arrow /></Link></footer>
  </div>;
}
