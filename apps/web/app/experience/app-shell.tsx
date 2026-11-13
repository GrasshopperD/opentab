"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./mode-switch.css";

/** Demo Mode = the working Stellar Testnet payment app. Product Mode = the consumer showcase (same Testnet data). */
export const isDemoPath = (pathname: string) =>
  pathname === "/demo" || pathname.startsWith("/demo/") || ["/sender", "/family", "/shop", "/join"].includes(pathname);

/** Plain links between the two entry pages. Switching never touches browser storage, keys or the network config. */
export function ModeSwitch({ mode }: { mode: "demo" | "product" }) {
  return <nav className={`mode-switch is-${mode}`} aria-label="Switch between Demo Mode and Product Mode">
    <div className="mode-switch-track">
      <Link href="/demo" prefetch={false} className={mode === "demo" ? "is-on" : ""} aria-current={mode === "demo" ? "true" : undefined}>Demo Mode</Link>
      <Link href="/home" prefetch={false} className={mode === "product" ? "is-on" : ""} aria-current={mode === "product" ? "true" : undefined}>Product Mode</Link>
    </div>
    <span className="mode-switch-hint">{mode === "demo" ? "Working payments on Stellar Testnet" : "Consumer preview · live Family #7 data from the same Testnet demo"}</span>
  </nav>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const demo = isDemoPath(pathname);
  if (!demo) return <div className="ot-experience"><ModeSwitch mode="product" />{children}</div>;
  return <>
    <ModeSwitch mode="demo" />
    <div className="banner">STELLAR TESTNET DEMO · Demo USD has no monetary value · Not a licensed financial service</div>
    <header className="top">
      <Link href="/demo/home" className="brand"><span className="logo">◐</span> OpenTab</Link>
      <nav aria-label="Demo navigation"><Link href="/demo">Demo</Link><Link href="/demo/sender">Sender</Link><Link href="/demo/family">Family</Link><Link href="/demo/shop">Shop</Link></nav>
    </header>
    <main className="wrap">{children}</main>
  </>;
}
