"use client";
import { useEffect } from "react";
export function SWRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    // Next development chunks are mutable: caching them can mix old module IDs
    // with the current Webpack runtime after Fast Refresh. Retire only our worker
    // and code caches; never clear localStorage (recipient keys / pending checkout).
    if (process.env.NODE_ENV === "development") {
      const ownWorker = (url: string | undefined) => Boolean(url && new URL(url).origin === location.origin && new URL(url).pathname === "/sw.js");
      const controlled = ownWorker(navigator.serviceWorker.controller?.scriptURL);
      (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.filter((r) => ownWorker((r.active ?? r.waiting ?? r.installing)?.scriptURL)).map((r) => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("opentab-")).map((key) => caches.delete(key)));
        // An already controlled tab needs one navigation to detach the old worker.
        if (controlled) location.reload();
      })().catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
      // Cache every script/style this page loaded so the signing screen works offline.
      const urls = [location.pathname, ...performance.getEntriesByType("resource").map((r) => r.name)];
      reg.active?.postMessage({ type: "precache", urls });
    }).catch(() => {});
  }, []);
  return null;
}
