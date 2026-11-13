"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const demo = pathname === "/demo" || pathname.startsWith("/demo/") || ["/sender", "/family", "/shop"].includes(pathname);
  if (!demo) return <div className="ot-experience">{children}</div>;
  return <>
    <div className="banner">STELLAR TESTNET DEMO · Demo USD has no monetary value · Not a licensed financial service</div>
    <header className="top">
      <Link href="/demo/home" className="brand"><span className="logo">◐</span> OpenTab</Link>
      <nav aria-label="Demo navigation"><Link href="/demo">Demo</Link><Link href="/demo/sender">Sender</Link><Link href="/demo/family">Family</Link><Link href="/demo/shop">Shop</Link><Link href="/home">New experience ↗</Link></nav>
    </header>
    <main className="wrap">{children}</main>
  </>;
}
