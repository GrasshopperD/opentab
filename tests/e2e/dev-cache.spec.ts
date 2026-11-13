// Opt in only against `npm run dev`: OT_DEV_CACHE_TEST=1 npx playwright test dev-cache.spec.ts --project=chromium
// Does not transact. Test sentinels belong to an isolated browser context.
import { expect, test } from "@playwright/test";

test("development retires stale app caches without deleting keys or pending checkout", async ({ page }) => {
  test.skip(process.env.OT_DEV_CACHE_TEST !== "1", "Requires a development server; production must retain its offline worker.");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/home", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /Support, closer to home/ })).toBeVisible();
  // Let the initial development cleanup complete before installing the prior-session state.
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await page.evaluate(async () => {
    localStorage.setItem("opentab.family.sk", "test-key-sentinel");
    localStorage.setItem("opentab.shop.current", "test-pending-sentinel");
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const cache = await caches.open("opentab-v2");
    await cache.put("/_next/static/chunks/app/layout.js", new Response('throw new Error("STALE LAYOUT CHUNK");', { headers: { "content-type": "application/javascript" } }));
  });
  await page.reload();
  await expect.poll(async () => {
    try {
      return await page.evaluate(async () => ({ workers: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).filter(k => k.startsWith("opentab-")).length }));
    } catch { return null; } // one automatic navigation detaches an already controlling worker
  }).toEqual({ workers: 0, caches: 0 });
  await expect(page.getByRole("heading", { name: /Support, closer to home/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("opentab.family.sk"))).toBe("test-key-sentinel");
  expect(await page.evaluate(() => localStorage.getItem("opentab.shop.current"))).toBe("test-pending-sentinel");
  await page.getByRole("link", { name: "Get started", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Welcome to OpenTab" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome to OpenTab" })).toBeVisible();
  expect(errors).toEqual([]);
});
