"use client";
import { useEffect } from "react";
export function SWRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
      // Cache every script/style this page loaded so the signing screen works offline.
      const urls = [location.pathname, ...performance.getEntriesByType("resource").map((r) => r.name)];
      reg.active?.postMessage({ type: "precache", urls });
    }).catch(() => {});
  }, []);
  return null;
}
