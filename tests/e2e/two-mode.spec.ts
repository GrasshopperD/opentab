// Two-mode release checks. SPENDS NOTHING and sends no transaction: every check reads the REAL demo (Stellar Testnet,
// Family #7) through the existing public read endpoint; the only mocks are two clearly labeled failure/new-event cases.
import { expect, test, type Page } from "@playwright/test";
import * as P from "../../packages/shared/src/index";

const FAMILY = "7";
const VAULT = "CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW";
const realFamily = async (page: Page) => {
  const j = await (await page.request.get(`/api/family/${FAMILY}`)).json();
  expect(j.error, "real Family #7 read").toBeUndefined();
  return { ...j, newest: [...(j.payments ?? [])].sort((a: any, b: any) => b.ledger - a.ledger) };
};
function noWrites(page: Page) {
  const writes: string[] = [];
  page.on("request", (r) => { if (r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`); });
  return writes;
}
const switcher = (page: Page) => page.getByRole("navigation", { name: "Switch between Demo Mode and Product Mode" });

test("the Demo Mode | Product Mode switch is on every entry page and switches both ways without touching storage", async ({ page }) => {
  // Sentinels standing in for a paired phone's key, a demo sale and sender state: switching must leave them untouched.
  await page.goto("/demo");
  // (No fake current sale: the Demo shop deliberately discards an unparseable saved sale, which is not a switch effect.)
  const sentinel = { "opentab.family.sk": "a".repeat(64), "opentab.family.id": FAMILY, "opentab.shop.receipts": "[]", "opentab.sender.families": "[\"7\"]" };
  await page.evaluate((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, sentinel);
  for (const path of ["/", "/home", "/business", "/dashboard", "/wallet", "/onboarding", "/demo", "/demo/sender", "/demo/family", "/demo/shop", "/sender", "/family", "/shop"]) {
    await page.goto(path);
    await expect(switcher(page), path).toBeVisible();
    // "/" opens Demo Mode (redirects to /demo).
    const demo = path === "/" || ["/demo", "/sender", "/family", "/shop"].some((d) => path === d || path.startsWith(d + "/"));
    await expect(switcher(page).getByRole("link", { name: demo ? "Demo Mode" : "Product Mode" }), path).toHaveAttribute("aria-current", "true");
  }
  await page.goto("/demo/sender");
  await switcher(page).getByRole("link", { name: "Product Mode" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: /Support, closer to home/ })).toBeVisible();
  await switcher(page).getByRole("link", { name: "Demo Mode" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { name: /Pay at the corner shop/ })).toBeVisible();
  expect(await page.evaluate((keys) => keys.map((k) => localStorage.getItem(k)), Object.keys(sentinel))).toEqual(Object.values(sentinel));
});

test("Product dashboard shows the REAL Family #7 balance, totals and confirmed purchases, and never writes", async ({ page }) => {
  const writes = noWrites(page);
  const real = await realFamily(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("dash-amount")).toContainText(P.formatTokenAmount(BigInt(real.family.balance)));
  await expect(page.getByTestId("balance-status")).toContainText("Read live from Stellar Testnet");
  await expect(page.locator(".dash-totals")).toContainText(P.formatTokenAmount(BigInt(real.family.total_deposited)));
  await expect(page.locator(".dash-totals")).toContainText(P.formatTokenAmount(BigInt(real.family.total_paid)));
  const rows = page.getByTestId("dash-activity").locator(".dash-purchases li");
  await expect(rows).toHaveCount(Math.min(5, real.newest.length));
  if (real.newest.length) await expect(rows.first().locator("a.dash-receipt")).toHaveAttribute("href", `https://stellar.expert/explorer/testnet/tx/${real.newest[0].txHash}`);
  await page.getByRole("navigation", { name: "Dashboard navigation" }).getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByTestId("dash-activity").locator(".dash-purchases li")).toHaveCount(real.newest.length);
  // Same Testnet data as Demo Mode: the Demo Sender shows the same Family #7 balance.
  await page.goto("/demo/sender");
  await expect(page.getByTestId("wallet").locator(".big")).toContainText(P.formatTokenAmount(BigInt(real.family.balance)));
  expect(writes).toEqual([]);
});

test("Product wallet shows the same real balance; no key is created by Product Mode", async ({ page }) => {
  const writes = noWrites(page);
  const real = await realFamily(page);
  await page.goto("/wallet");
  await expect(page.getByTestId("wallet-amount")).toContainText(P.formatTokenAmount(BigInt(real.family.balance)));
  expect(await page.evaluate(() => localStorage.getItem("opentab.family.sk"))).toBeNull();
  expect(writes).toEqual([]);
});

test("TEST-ONLY failure: an unreadable family shows 'Balance unavailable', never a number", async ({ page }) => {
  await page.route(`**/api/family/${FAMILY}`, (r) => r.fulfill({ json: { error: "NetworkError" } }));
  for (const [path, amount] of [["/dashboard", "dash-amount"], ["/wallet", "wallet-amount"]] as const) {
    await page.goto(path);
    await expect(page.getByTestId("balance-status")).toContainText("Balance unavailable");
    await expect(page.getByTestId(amount)).toHaveText(/^—/);
  }
});

test("Product buttons open the working Demo Mode screens", async ({ page }) => {
  const nav = (name: string) => page.getByRole("navigation", { name: "Dashboard navigation" }).getByRole("button", { name, exact: true });
  const opensSender = async () => { await expect(page).toHaveURL(/\/demo\/sender$/); await expect(page.getByTestId("wallet")).toContainText(`Family #${FAMILY}`); };
  await page.goto("/dashboard");
  await page.getByTestId("dash-balance").getByRole("link", { name: /Add money/ }).click(); await opensSender();
  await page.goto("/dashboard"); await nav("Add money").click(); await page.getByTestId("add-funds-link").click(); await opensSender();
  await page.goto("/dashboard"); await nav("Add money").click(); await page.getByTestId("create-family-link").click(); await opensSender();
  await page.goto("/dashboard"); await page.getByRole("button", { name: /Add family member/ }).click(); await page.getByTestId("pair-link").click(); await opensSender();
  await page.goto("/dashboard"); await nav("Family").click(); await page.getByTestId("family-wallet-link").click();
  await expect(page).toHaveURL(/\/demo\/family$/); await expect(page.getByRole("heading", { name: /Family Wallet/ })).toBeVisible();
  await page.goto("/wallet"); await page.getByTestId("scan-to-pay").click();
  await expect(page).toHaveURL(/\/demo\/family$/); await expect(page.getByRole("heading", { name: /Family Wallet/ })).toBeVisible();
  await page.goto("/business"); await expect(page.getByTestId("catalog")).toContainText("Milk"); await expect(page.getByTestId("catalog")).toContainText("USD 3.00");
  await page.getByTestId("open-checkout").click();
  await expect(page).toHaveURL(/\/demo\/shop$/); await expect(page.getByRole("heading", { name: "Merchant Checkout" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Milk/ })).toBeVisible();
});

test("Demo Mode shows REAL confirmed transactions; the new-payment notice appears only for a new confirmed hash", async ({ page }) => {
  const real = await realFamily(page);
  await page.goto("/demo");
  await expect(page.getByText(VAULT).first()).toBeVisible();                     // same configured FamilyVault
  const list = page.getByTestId("live-list");
  if (!real.newest.length) test.skip(true, "no confirmed payments in the RPC window right now");
  await expect(list.locator("li")).toHaveCount(Math.min(8, real.newest.length));
  await expect(list.locator("li").first()).toContainText("Confirmed on Stellar");
  await expect(list.locator("li").first().locator("a")).toHaveAttribute("href", `https://stellar.expert/explorer/testnet/tx/${real.newest[0].txHash}`);
  await expect(page.getByTestId("new-payment")).toHaveCount(0);                  // nothing "new" on first load
  // TEST-ONLY: the next read returns one extra confirmed event, as Stellar would after a Demo payment.
  const extra = { ...real.newest[0], txHash: "f".repeat(64), invoiceId: "0".repeat(64), ledger: real.newest[0].ledger + 1, amount: "30000000" };
  await page.route(`**/api/family/${FAMILY}`, (r) => r.fulfill({ json: { ...real, payments: [...real.payments, extra] } }));
  await page.getByTestId("live-activity").getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("new-payment")).toContainText("New confirmed payment: 3.00 OTUSD");
});

for (const width of [320, 390, 768, 1440]) {
  test(`both modes fit ${width}px with the switch visible`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/home", "/dashboard", "/wallet", "/business", "/onboarding", "/demo", "/demo/sender", "/demo/family", "/demo/shop"]) {
      await page.goto(path); await page.waitForLoadState("networkidle");
      await expect(switcher(page)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
    }
  });
}

test("the site root opens Demo Mode: / redirects to /demo, which introduces the judge demo and points to Product Mode", async ({ page, request }) => {
  const res = await request.get("/", { maxRedirects: 0 });
  expect([307, 308]).toContain(res.status());
  expect(new URL(res.headers()["location"], "http://x").pathname).toBe("/demo");
  await page.goto("/");
  await expect(page).toHaveURL(/\/demo$/);
  const intro = page.getByTestId("judge-intro");
  await expect(intro.getByRole("heading", { level: 1, name: "Judge Demo: OpenTab on Stellar Testnet" })).toBeVisible();
  await expect(intro).toContainText("Stellar Testnet, not Mainnet");
  await expect(intro).toContainText("no monetary value");
  await expect(intro).toContainText("demo access code");
  for (const tab of ["Sender", "Family", "Shop"]) await expect(intro.getByRole("link", { name: tab, exact: true })).toHaveAttribute("href", `/demo/${tab === "Shop" ? "shop" : tab.toLowerCase()}`);
  await expect(page.getByTestId("product-mode-note")).toContainText("read-only preview");
  await expect(switcher(page).getByRole("link", { name: "Demo Mode" })).toHaveAttribute("aria-current", "true");
  await page.getByTestId("product-mode-note").getByRole("link", { name: /Open Product Mode/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: /Support, closer to home/ })).toBeVisible();    // Product pages are not redirected
  for (const path of ["/home", "/dashboard", "/wallet", "/business", "/onboarding"]) {
    await page.goto(path); expect(new URL(page.url()).pathname, path).toBe(path);
  }
});

test("all three Product roles: onboarding → role page with real data → its working Demo screen (no writes)", async ({ page }) => {
  const writes = noWrites(page);
  const real = await realFamily(page);
  const balance = P.formatTokenAmount(BigInt(real.family.balance));
  const choose = async (option: RegExp, cta: string) => {
    await page.context().clearCookies();                          // role preference cookie only; storage untouched
    await page.goto("/onboarding");
    await page.getByRole("button", { name: option }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator(".ot-ready .ot-button").filter({ hasText: cta }).click();
  };
  // Organizer → dashboard (real balance + confirmed activity) → Demo Sender
  await choose(/I’m an organizer/, "Open my dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("dash-amount")).toContainText(balance);
  await expect(page.getByTestId("dash-activity").locator(".dash-purchases li")).toHaveCount(Math.min(5, real.newest.length));
  await page.getByTestId("dash-balance").getByRole("link", { name: /Add money/ }).click();
  await expect(page).toHaveURL(/\/demo\/sender$/); await expect(page.getByTestId("wallet")).toContainText(`Family #${FAMILY}`);
  // Family member → wallet (real balance) → Scan to Pay → Demo Family Wallet
  await choose(/I’m a family member/, "Open my Family Wallet");
  await expect(page).toHaveURL(/\/wallet$/);
  await expect(page.getByTestId("wallet-amount")).toContainText(balance);
  await page.getByTestId("scan-to-pay").click();
  await expect(page).toHaveURL(/\/demo\/family$/); await expect(page.getByRole("heading", { name: /Family Wallet/ })).toBeVisible();
  // Merchant → business → Open Merchant Checkout → Demo Merchant Checkout
  await choose(/I’m a merchant/, "See the shop experience");
  await expect(page).toHaveURL(/\/business$/);
  await expect(page.getByTestId("catalog")).toContainText("Milk");
  await page.getByTestId("open-checkout").click();
  await expect(page).toHaveURL(/\/demo\/shop$/); await expect(page.getByRole("heading", { name: "Merchant Checkout" })).toBeVisible();
  expect(writes).toEqual([]);
});
