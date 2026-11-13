"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { COUNTRY_MAP } from "./country-map";
import "./journey.css";

const FROM = COUNTRY_MAP.canada.pin, TO = COUNTRY_MAP.mexico.pin;
const ROUTE = `M ${FROM[0]} ${FROM[1]} C 500 65, 745 60, ${TO[0]} ${TO[1]}`;

export function CountryJourney({ intro }: { intro?: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const route = useRef<SVGPathElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const coin = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const element = section.current, path = route.current;
    if (!element || !path) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const length = path.getTotalLength();
    let frame = 0;
    const draw = () => {
      frame = 0;
      const bounds = element.getBoundingClientRect();
      const headerHeight = element.closest(".ot-landing")?.querySelector(".home-header")?.getBoundingClientRect().height ?? 88;
      const progress = preference.matches ? .5 : Math.max(0, Math.min(1, (headerHeight - bounds.top) / Math.max(1, bounds.height - innerHeight + headerHeight)));
      const point = path.getPointAtLength(length * progress);
      setReduced(preference.matches);
      element.dataset.progress = progress.toFixed(3);
      element.style.setProperty("--journey-progress", String(progress));
      if (coin.current) { coin.current.style.left = `${point.x / 11}%`; coin.current.style.top = `${point.y / 5.4}%`; }
      if (trail.current) { trail.current.style.strokeDasharray = String(length); trail.current.style.strokeDashoffset = String(length * (1 - progress)); }
      setPhase(progress < .2 ? 0 : progress > .8 ? 2 : 1);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule); preference.addEventListener("change", schedule); schedule();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); preference.removeEventListener("change", schedule); };
  }, []);

  return <section ref={section} className={`home-connection country-journey ${intro ? "home-intro country-journey-hero" : ""}`} id="the-journey" aria-labelledby={intro ? "hero-heading" : "connection-heading"}>
    <div className="journey-stage">
      {intro && <div className="journey-introduction" aria-hidden={phase > 0 && !reduced} inert={phase > 0 && !reduced}>{intro}</div>}
      <div className="journey-heading" aria-hidden={Boolean(intro) && (phase === 0 || reduced)}><h2 id="connection-heading">Across the world.<br /><span>Right by their side.</span></h2><p>{phase === 0 ? "It begins with you, in Canada." : phase === 1 ? "A little support crosses a little distance." : "And becomes everyday essentials in Mexico."}</p></div>
      <div className="journey-map" role="img" aria-label="Illustrative journey of support from Toronto, Canada, to Oaxaca, Mexico. The Stellar symbol follows the route as you scroll.">
        <svg viewBox="0 0 1100 540" className="journey-map-svg" fill="none" aria-hidden="true">
          <defs><pattern id="journey-grid" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#55594a" /></pattern></defs>
          <rect width="1100" height="540" fill="url(#journey-grid)" opacity=".35" />
          <path d={COUNTRY_MAP.canada.path} fill="#727860" className="journey-country journey-canada" />
          <path d={COUNTRY_MAP.mexico.path} fill="#727860" className="journey-country journey-mexico" />
          <path ref={route} d={ROUTE} stroke="#696e50" strokeWidth="1.5" strokeDasharray="3 9" />
          <path ref={trail} d={ROUTE} stroke="#f4e65d" strokeWidth="2" className="journey-trail" />
          <circle cx={FROM[0]} cy={FROM[1]} r="6" fill="#f4e65d" /><circle cx={TO[0]} cy={TO[1]} r="6" fill="#f4e65d" />
          <g className="journey-map-label"><text x="65" y="70">CANADA</text><text x="775" y="175">MEXICO</text></g>
          <g className="journey-city-label"><text x={FROM[0] - 8} y={FROM[1] + 34} textAnchor="end">Toronto</text><text x={TO[0] - 15} y={TO[1] + 34} textAnchor="end">Oaxaca</text></g>
          <path d="M 64 84 h50 M 775 189 h50" stroke="#b9bf9a" strokeWidth="1" />
        </svg>
        <div ref={coin} className="journey-coin" aria-hidden="true" style={{ left: `${FROM[0] / 11}%`, top: `${FROM[1] / 5.4}%` }}><img src="/stellar-symbol.svg" alt="" width="39" height="35" /></div>
      </div>
    </div>
  </section>;
}
