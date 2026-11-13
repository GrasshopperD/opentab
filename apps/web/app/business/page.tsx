import Link from "next/link";
import { formatLocal } from "@opentab/shared";
import { CATALOG, CATALOG_CURRENCY, MERCHANTS } from "@/lib/config";
import { Arrow, Brand, RoleIcon } from "../experience/design";
import { SiteHeader } from "../experience/site-header";
import "../experience/home.css";
import "../experience/journey.css";
import "./business.css";

function ShopFront() {
  return <svg viewBox="0 0 520 460" fill="none" role="img" aria-label="Illustration of a neighborhood shop with a striped awning, display window and welcoming entrance">
    <defs>
      <linearGradient id="shop-glass" x1="120" y1="235" x2="275" y2="365" gradientUnits="userSpaceOnUse"><stop stopColor="#c3d0b4" /><stop offset="1" stopColor="#8d9e7d" /></linearGradient>
      <clipPath id="shop-awning"><path d="M101 174H419L442 223H78L101 174Z" /></clipPath>
    </defs>
    <ellipse cx="260" cy="411" rx="202" ry="12" fill="#bec7ad" opacity=".55" />
    <rect x="100" y="143" width="320" height="247" rx="3" fill="#f2efdb" />
    <path d="M100 261H420M100 293H420M100 325H420M100 357H420" stroke="#e1ddc7" />
    <rect x="92" y="106" width="336" height="70" rx="5" fill="#35482d" /><rect x="100" y="114" width="320" height="54" rx="2" stroke="#7e9067" strokeWidth="1" />
    <text x="260" y="148" textAnchor="middle" fill="#f6f2d9" fontFamily="Arial, sans-serif" fontSize="28" letterSpacing="-.5">OpenTab</text>
    <rect x="100" y="220" width="320" height="12" fill="#d1ceb3" />
    <g clipPath="url(#shop-awning)"><rect x="75" y="173" width="370" height="52" fill="#e6d85c" />{Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${94 + i * 62} 173h30l9 52h-45z`} fill="#faf1bb" />)}</g>
    <path d="M78 223H442V231C442 239 426 239 426 231C426 239 409 239 409 231C409 239 392 239 392 231C392 239 375 239 375 231C375 239 358 239 358 231C358 239 341 239 341 231C341 239 324 239 324 231C324 239 307 239 307 231C307 239 290 239 290 231C290 239 273 239 273 231C273 239 256 239 256 231C256 239 239 239 239 231C239 239 222 239 222 231C222 239 205 239 205 231C205 239 188 239 188 231C188 239 171 239 171 231C171 239 154 239 154 231C154 239 137 239 137 231C137 239 120 239 120 231C120 239 103 239 103 231C103 239 86 239 86 231L78 231Z" fill="#c5b747" />
    <rect x="119" y="250" width="151" height="121" rx="2" fill="#405436" /><rect x="126" y="257" width="137" height="105" fill="url(#shop-glass)" />
    <path d="M132 262H174L132 304V262ZM263 289V331L232 362H190L263 289Z" fill="#e8eddb" opacity=".3" />
    <path d="M130 342H259" stroke="#5e7351" strokeWidth="5" /><rect x="139" y="329" width="41" height="25" rx="2" fill="#bca67b" /><rect x="192" y="329" width="53" height="25" rx="2" fill="#a89268" />
    {[147, 160, 173, 201, 214, 227, 239].map((x, i) => <circle key={x} cx={x} cy={328 + i % 2 * 4} r="6" fill={i % 2 ? "#adba6e" : "#e3cf83"} />)}
    <path d="M194 257V342M126 310H263" stroke="#405436" strokeWidth="5" /><rect x="114" y="370" width="161" height="8" rx="2" fill="#acb799" />
    <rect x="291" y="249" width="105" height="141" rx="2" fill="#3e5334" /><rect x="300" y="258" width="87" height="100" rx="1" fill="url(#shop-glass)" /><path d="M306 264H340L306 298V264Z" fill="#e8eddb" opacity=".35" />
    <path d="m325 295 18-16 18 16" stroke="#506346" strokeWidth="1.5" /><rect x="316" y="295" width="55" height="29" rx="3" fill="#f6efd2" /><text x="343.5" y="315" textAnchor="middle" fill="#405333" fontFamily="Arial, sans-serif" fontSize="15">Open</text>
    <rect x="377" y="365" width="4" height="13" rx="2" fill="#e9d96a" /><rect x="285" y="390" width="119" height="9" rx="2" fill="#a8b49a" /><rect x="278" y="399" width="133" height="7" rx="2" fill="#bbc5ad" />
    <path d="M57 369H90L86 404H61L57 369Z" fill="#9b8967" /><path d="M74 372V325M74 348C42 347 42 326 46 319C64 319 74 333 74 348ZM74 337C98 333 102 314 99 308C80 311 73 324 74 337ZM74 325C58 311 62 294 68 288C82 297 85 313 74 325Z" fill="#6d8653" stroke="#5b7649" strokeWidth="2" />
    <path d="M435 377H465L461 404H439L435 377Z" fill="#9b8967" /><path d="M450 380V346M450 364C427 364 426 347 430 343C445 342 452 352 450 364ZM450 354C470 353 474 336 471 331C455 334 449 343 450 354Z" fill="#819563" stroke="#657e50" strokeWidth="2" />
    <path d="M45 407H475" stroke="#aeb99c" strokeWidth="1" />
  </svg>;
}

export default function Business() {
  return <div className="ot-landing business-page">
    <a className="ot-skip" href="#business-main">Skip to content</a><SiteHeader active="business" />
    <main id="business-main">
      <section className="business-hero" aria-labelledby="business-title"><div className="business-hero-copy"><h1 id="business-title">Your local shop.<br /><span>A bigger connection.</span></h1><p>Be the place where a family’s support becomes their everyday essentials.</p><div className="business-hero-actions"><Link className="ot-button" href="/demo/shop" prefetch={false} data-testid="open-checkout">Open Merchant Checkout <Arrow /></Link><Link className="business-secondary" href="/onboarding?role=merchant">Set up your shop <Arrow /></Link></div><span className="business-preview-note">Checkout runs in Demo Mode on Stellar Testnet (demo access code required).</span></div><div className="business-hero-art"><ShopFront /></div></section>
      <section className="business-how" aria-labelledby="business-how-title"><div className="business-section-intro"><h2 id="business-how-title">One purchase.<br />Three simple steps.</h2><p>Your shop stays connected. The customer’s phone can be offline.</p></div><div className="business-step-list">{[
        { number: "01", title: "Show the price", text: "Create an invoice with a local price and an exact token charge. Show the customer your QR code." },
        { number: "02", title: "Scan their approval", text: "The customer checks the purchase on their phone. You scan their signed approval." },
        { number: "03", title: "Wait for confirmation", text: "Submit the approval to Stellar. Release the goods only after the payment is confirmed." },
      ].map(step => <article key={step.number}><span>{step.number}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></article>)}</div></section>
      <section className="business-catalog" id="catalog" aria-labelledby="catalog-title"><div className="business-section-intro"><h2 id="catalog-title">Today’s shelf.</h2><p>The demo catalog used by Merchant Checkout. Prices are illustrative; settlement is in OTUSD test tokens with no monetary value.</p></div>
        <div><ul className="business-products" data-testid="catalog">{CATALOG.map(p => <li key={p.sku}><span>{p.name}</span><b>{CATALOG_CURRENCY} {formatLocal(p.unitMinor, 2)}</b></li>)}</ul>
        <p className="business-shops">Demo shops: {MERCHANTS.map(m => m.name).join(" · ")}</p>
        <Link className="ot-button" href="/demo/shop" prefetch={false}>Start a sale in Merchant Checkout <Arrow /></Link></div></section>
      <section className="business-counter"><div><RoleIcon kind="merchant" /><h2>Built around your shop.<br />One step at a time.</h2><p>Show the invoice, scan the customer’s approval, and wait for Stellar to confirm. The working checkout is one tap away.</p></div><Link className="ot-button" href="/demo/shop" prefetch={false}>Open Merchant Checkout <Arrow /></Link></section>
      <section className="business-details"><h2>Before you try the demo.</h2><div><p><b>Stellar Testnet only.</b> Merchant Checkout (Demo Mode) settles OTUSD test tokens with no monetary value.</p><p><b>No bank payouts.</b> Local prices use illustrative exchange rates. A local-currency display is separate from token settlement.</p><Link href="/demo/shop" prefetch={false}>Explore the existing shop demo <Arrow /></Link></div></section>
    </main>
    <footer className="ot-footer home-footer"><Brand /><p>Product Mode preview · Testnet tokens have no value.</p><Link href="/home">Back to Home <Arrow /></Link></footer>
  </div>;
}
