import Link from "next/link";

export function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={back ? { transform: "rotate(180deg)" } : undefined}><path d="M4 12h15M13 5l7 7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Mark() {
  return <svg width="29" height="29" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 19.5 19.5 5H27v7.5L12.5 27H5v-7.5Z" stroke="currentColor" strokeWidth="2" /><path d="M5 27 27 5M5 12.5V5h7.5M19.5 27H27v-7.5" stroke="currentColor" strokeWidth="2" /></svg>;
}

export function Brand() {
  return <Link href="/home" className="ot-brand" aria-label="OpenTab home"><Mark /><span>opentab<span className="ot-brand-dot">.</span></span></Link>;
}

export function RoleIcon({ kind }: { kind: "family" | "organizer" | "recipient" | "merchant" }) {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {kind === "family" ? <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" /></> : kind === "organizer" ? <><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" /><circle cx="12" cy="12" r="4" /></> : kind === "recipient" ? <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4M10 9l2 2 4-4" /></> : <><path d="m3 9 2-6h14l2 6M3 9v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9H3ZM5 15v6h14v-6M10 21v-5h4v5" /></>}
  </svg>;
}

export function Orbit({ compact = false }: { compact?: boolean }) {
  return <div className={`ot-orbit ${compact ? "ot-orbit-compact" : ""}`} aria-hidden="true">
    <div className="ot-orbit-grid" />
    <svg className="ot-orbit-lines" viewBox="0 0 620 620" fill="none"><circle cx="310" cy="310" r="245" stroke="currentColor" /><circle cx="310" cy="310" r="181" stroke="currentColor" /><ellipse cx="310" cy="310" rx="245" ry="88" transform="rotate(-40 310 310)" stroke="currentColor" /><ellipse cx="310" cy="310" rx="245" ry="88" transform="rotate(40 310 310)" stroke="currentColor" /><path d="M65 310h490M310 65v490" stroke="currentColor" strokeDasharray="3 7" /></svg>
    <div className="ot-orbit-core"><Mark /></div>
    <div className="ot-orbit-node ot-node-home"><RoleIcon kind="family" /><span>Family</span><i /></div>
    <div className="ot-orbit-node ot-node-shop"><RoleIcon kind="merchant" /><span>Local shop</span><i /></div>
    <div className="ot-orbit-caption"><span className="ot-dot" /> DISTANCE, RECONSIDERED.</div>
    <span className="ot-coordinate ot-coordinate-top">43.65° N &nbsp; 79.38° W</span><span className="ot-coordinate ot-coordinate-bottom">17.07° N &nbsp; 96.73° W</span>
  </div>;
}
