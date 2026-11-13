import Link from "next/link";
import { Arrow, Brand } from "./design";

export function SiteHeader({ active = "home" }: { active?: "home" | "business" }) {
  return <header className="ot-header home-header">
    <Brand />
    <nav className="ot-nav" aria-label="Main navigation"><Link href="/home" aria-current={active === "home" ? "page" : undefined}>Home</Link><Link href="/business" aria-current={active === "business" ? "page" : undefined}>Business</Link>{active === "home" && <a href="#how-it-works">How it works</a>}</nav>
    <div className="ot-header-actions"><Link className="home-login" href={active === "business" ? "/onboarding?mode=signin&role=merchant" : "/onboarding?mode=signin"}>Sign in</Link><Link className="ot-button ot-button-small" href={active === "business" ? "/onboarding?role=merchant" : "/onboarding"}>Get started <Arrow /></Link></div>
    <div className="home-scroll-progress" />
  </header>;
}
