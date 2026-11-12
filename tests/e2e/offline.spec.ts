// Offline recipient flow. Spends NOTHING on chain: the invoice is built locally (as a shop terminal would)
// and the resulting signed approval is verified with the same protocol code the server uses.
import { expect, test } from "@playwright/test";
import * as P from "../../packages/shared/src/index";

const VAULT = "CAUCH3MNJGIYDLOY3OB3YCKRCBWWY3J3HZB5QCHPJXUWXBMK5IABYLGW";
const TOKEN = "CC6JPD3NL3ZJMWT2JG246ISOG5QB2N72BG77KPVC3OCDEYUHK2TEPL73";
const MERCHANT_A = "GCDSS6VQP6GGTV6K2J6FMG2TQN2G2EG37TSQ5UYQK547ODDYGNPPRWN4";

function invoiceText(price: string) {
  const q = { currency: "MXN", localMinor: P.parseLocalAmount(price, 2), minorDigits: 2, rate: "18.4200", source: "ILLUSTRATIVE" };
  return P.encodeInvoiceQR({ network: P.TESTNET_PASSPHRASE, vault: VAULT, token: TOKEN, merchant: MERCHANT_A, merchantName: "Tienda Rosa",
    terminalId: 2, invoiceId: P.randomBytes(32), amount: P.computeCharge(q), quote: q, expiresAt: BigInt(Math.floor(Date.now() / 1000) + 600) });
}

test("recipient signs offline, survives offline reload, recovers on reconnect", async ({ page, context, browserName }) => {
  // Online first load + key creation
  await page.goto("/family");
  await page.locator('label:has-text("Your name") + input').fill("Ana");
  await page.getByRole("button", { name: "Create my key" }).click();
  await page.locator('label:has-text("Family number") + input').fill("1");
  const fingerprint = await page.locator(".fp").innerText();
  const pub = (await page.getByTestId("qr-text").last().inputValue()).split(":")[1];

  // Let the service worker install and take control (needed for offline reload)
  await page.reload();
  const swControlled = await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 })
    .then(() => true).catch(() => false);
  test.info().annotations.push({ type: "service-worker", description: `${browserName}: controlled=${swControlled}` });

  // Disconnect
  await context.setOffline(true);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();

  // Import invoice (paste fallback), review, sign
  await page.getByText("Paste code instead").click();
  await page.getByPlaceholder("OTI1:… / OTA1:… / OTK1:…").fill(invoiceText("35.50"));
  await page.getByRole("button", { name: "Use pasted code" }).click();
  await expect(page.getByText("MXN 35.50")).toBeVisible();
  await expect(page.getByText(/illustrative, not live/)).toBeVisible();
  await page.getByRole("button", { name: /^Approve / }).click();
  await expect(page.getByText("Authorized. Awaiting merchant settlement.")).toBeVisible();
  await expect(page.getByText(/PAID|Payment confirmed/)).toHaveCount(0);       // never claims payment
  await expect(page.locator(".qr img").first()).toBeVisible();                  // QR rendered without a server
  const auth = P.parseAuthQR(await page.getByTestId("qr-text").first().inputValue());
  expect(P.verifyAuthorization(auth)).toBe(true);
  expect(P.toHex(auth.signer)).toBe(pub);
  expect(auth.familyId).toBe(1n);
  // Next.js nav-link prefetches (?_rsc= route payloads, hashed /_next/static chunks) may fire on WebKit's idle timing
  // and simply fail offline; they carry no data. Everything else (any /api/ call, any other request) must be absent.
  const prefetch = (u: string) => /[?&]_rsc=/.test(u) || new URL(u).pathname.startsWith("/_next/static/");
  expect(requests.filter((u) => !prefetch(u)), "no network requests while importing and signing offline").toEqual([]);
  expect(requests.filter((u) => u.includes("/api/")), "no API calls while signing offline").toEqual([]);
  await expect(page.getByText("waiting for the shop to settle")).toBeVisible();

  // Offline reload: works when the service worker controls the page
  // Playwright's WebKit offline emulation fails navigations with "internal error" before the service worker can answer
  // (probe 2026-11-12: SW controlled, shell cached, navigation still failed). Chromium verifies offline reload; a real
  // iPhone must verify Safari. Recorded as a limitation, not a pass.
  if (browserName === "webkit") {
    test.info().annotations.push({ type: "limitation", description: "webkit emulation: offline reload not testable; verify on physical iPhone" });
  } else if (swControlled) {
    await page.reload();
    await expect(page.getByRole("heading", { name: /Family wallet/ })).toBeVisible();
    await expect(page.locator(".fp")).toHaveText(fingerprint);
    await expect(page.getByText("waiting for the shop to settle")).toBeVisible();   // local history persisted
  } else {
    test.info().annotations.push({ type: "limitation", description: `${browserName}: no service worker control in this emulation; offline reload not tested` });
  }

  // Reconnect: online indicator returns; unsettled approval stays unsettled (it was never submitted)
  await context.setOffline(false);
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh balance" }).click();
  await expect(page.locator(".big")).not.toHaveText("—");
  await expect(page.getByText("waiting for the shop to settle")).toBeVisible();
});

test("expired or tampered invoices cannot be approved", async ({ page }) => {
  await page.goto("/family");
  await page.getByRole("button", { name: "Create my key" }).click();
  await page.locator('label:has-text("Family number") + input').fill("1");
  const q = { currency: "MXN", localMinor: 1000n, minorDigits: 2, rate: "18.4200", source: "ILLUSTRATIVE" };
  const expired = P.encodeInvoiceQR({ network: P.TESTNET_PASSPHRASE, vault: VAULT, token: TOKEN, merchant: MERCHANT_A, merchantName: "Tienda Rosa",
    terminalId: 1, invoiceId: P.randomBytes(32), amount: P.computeCharge(q), quote: q, expiresAt: BigInt(Math.floor(Date.now() / 1000) - 5) });
  await page.getByText("Paste code instead").click();
  await page.getByPlaceholder("OTI1:… / OTA1:… / OTK1:…").fill(expired);
  await page.getByRole("button", { name: "Use pasted code" }).click();
  await page.getByRole("button", { name: /^Approve / }).click();
  await expect(page.locator(".status.bad")).toContainText(/expired/);
  // Amount that does not match the quoted local price
  const o = JSON.parse(invoiceText("10.00").slice(5)); o.a = "1";
  await page.getByPlaceholder("OTI1:… / OTA1:… / OTK1:…").fill("OTI1:" + JSON.stringify(o));
  await page.getByRole("button", { name: "Use pasted code" }).click();
  await page.getByRole("button", { name: /^Approve / }).click();
  await expect(page.locator(".status.bad")).toContainText(/does not match quote/);
  // Foreign vault
  const f = JSON.parse(invoiceText("10.00").slice(5)); f.v = TOKEN;
  await page.getByPlaceholder("OTI1:… / OTA1:… / OTK1:…").fill("OTI1:" + JSON.stringify(f));
  await page.getByRole("button", { name: "Use pasted code" }).click();
  await expect(page.locator(".status.bad")).toContainText(/different vault/);
});
