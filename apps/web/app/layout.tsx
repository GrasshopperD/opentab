import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { SWRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "OpenTab Global",
  description: "Family-funded everyday spending on Stellar. Testnet prototype.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "OpenTab", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="banner">STELLAR TESTNET DEMO · Demo USD has no monetary value · Not a licensed financial service</div>
        <header className="top">
          <Link href="/" className="brand"><span className="logo">◐</span> OpenTab Global</Link>
          <nav aria-label="Main"><Link href="/demo">Demo</Link><Link href="/sender">Sender</Link><Link href="/family">Family</Link><Link href="/shop">Shop</Link></nav>
        </header>
        <main className="wrap">{children}</main>
        <SWRegister />
      </body>
    </html>
  );
}
