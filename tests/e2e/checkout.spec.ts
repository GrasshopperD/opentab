// REAL browser + REAL Stellar Testnet. Spends demo OTUSD. Needs OT_DEMO_CODE and a running app.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const CODE = process.env.OT_DEMO_CODE ?? "";
const SHOTS = "submission/screenshots";
// Screenshots are taken only of real states; the access-code form is never visible in them.
async function shot(page: Page, name: string) {
  await expect(page.locator("#democode")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function unlock(page: Page) {
  await page.locator("#democode").fill(CODE);
  await page.getByRole("button", { name: "Unlock demo" }).click();
  await expect(page.getByText("Demo operator access active")).toBeVisible();
}
async function paste(page: Page, text: string) {
  await page.getByText("Paste code instead").click();
  await page.getByPlaceholder("OTI1:… / OTA1:… / OTK1:…").fill(text);
  await page.getByRole("button", { name: "Use pasted code" }).click();
}
const merchantBalance = async (ctx: BrowserContext) => BigInt((await (await ctx.request.get("/api/merchant/A")).json()).balance);
const familyBalance = async (ctx: BrowserContext, f: string) => BigInt((await (await ctx.request.get(`/api/family/${f}`)).json()).family.balance);

test("full journey: fund, pair, offline approve, settle on Stellar, replay rejected", async ({ browser }) => {
  expect(CODE, "set OT_DEMO_CODE").not.toBe("");
  const operator = await browser.newContext();              // sender + shop terminal (online)
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  // 1. Original demo landing page (the public root now hosts frontend onboarding).
  const op = await operator.newPage();
  await op.goto("/demo/home");
  await expect(op.getByRole("heading", { name: /Your support/ })).toBeVisible();
  await expect(op.getByText("STELLAR TESTNET DEMO")).toBeVisible();
  await shot(op, "01-landing");

  // 2. Sender creates + funds a family (real transactions)
  await op.goto("/sender");
  await unlock(op);
  await op.locator('label:has-text("Amount") + input').fill("3");
  await op.getByRole("button", { name: "Create new family + fund" }).click();
  const created = op.getByText(/Family #\d+ created and funded/);
  await expect(created).toBeVisible({ timeout: 90_000 });
  const familyId = (await created.innerText()).match(/#(\d+)/)![1];

  // 3. Recipient generates a key on the phone
  const ph = await phone.newPage();
  await ph.goto("/family");
  await ph.locator('label:has-text("Your name") + input').fill("Ana");
  await ph.getByRole("button", { name: "Create my key" }).click();
  const fingerprint = await ph.locator(".fp").innerText();
  const pairing = await ph.getByTestId("qr-text").first().inputValue();
  expect(pairing).toMatch(/^OTK1:[0-9a-f]{64}:Ana$/);
  const sk = await ph.evaluate(() => localStorage.getItem("opentab.family.sk"));
  expect(pairing).not.toContain(sk!);                       // pairing code carries no private key

  // 4-5. Pair and register the public key on chain
  await paste(op, pairing);
  await expect(op.locator(".fp")).toHaveText(fingerprint);
  await op.getByRole("button", { name: `Authorize for family #${familyId}` }).click();
  await expect(op.getByText("Phone paired")).toBeVisible({ timeout: 90_000 });

  // 6. Deposit more OTUSD
  await op.locator('label:has-text("Amount") + input').fill("2");
  await op.getByRole("button", { name: "Top up selected family" }).click();
  await expect(op.getByText("Deposited 2 OTUSD")).toBeVisible({ timeout: 90_000 });
  expect(await familyBalance(operator, familyId)).toBe(50_000_000n);
  await shot(op, "02-sender-dashboard");

  // Recipient sees the balance and authorization while online; let the service worker take control.
  await ph.locator('label:has-text("Family number") + input').fill(familyId);
  await ph.reload();
  await ph.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
  await ph.getByRole("button", { name: "Refresh balance" }).click();
  await expect(ph.getByText("this phone is authorized")).toBeVisible();
  await expect(ph.locator(".big")).toContainText("5.00");
  await shot(ph, "03-family-allowance");

  // 7-8. Merchant creates an invoice
  const shop = await operator.newPage();
  await shop.goto("/shop");
  await expect(shop.getByText("Demo operator access active")).toBeVisible();
  await shop.locator('label:has-text("Price") + input').fill("20.00");
  await expect(shop.getByText("1.0857764 OTUSD")).toBeVisible();   // 20 MXN / 18.42, rounded up at 7 dp
  await shop.getByRole("button", { name: "Show invoice QR" }).click();
  await expect(shop.locator(".qr img")).toBeVisible();
  const invoice = await shop.getByTestId("qr-text").first().inputValue();
  await shot(shop, "04-shop-invoice");
  expect(invoice.startsWith("OTI1:")).toBe(true);

  // 9-10. Phone goes OFFLINE, imports invoice, signs locally
  await phone.setOffline(true);
  const offlineRequests: string[] = [];
  ph.on("request", (r) => offlineRequests.push(r.url()));
  await expect(ph.getByText("Offline")).toBeVisible();
  await paste(ph, invoice);
  await expect(ph.getByText("MXN 20.00")).toBeVisible();
  await expect(ph.getByText("1.0857764 OTUSD")).toBeVisible();
  await expect(ph.getByText(/illustrative, not live/)).toBeVisible();
  await ph.getByRole("button", { name: /^Approve / }).click();
  await expect(ph.getByText("Authorized. Awaiting merchant settlement.")).toBeVisible();
  await expect(ph.locator(".qr img").first()).toBeVisible();     // QR generated locally
  const auth = await ph.getByTestId("qr-text").first().inputValue();
  expect(auth.startsWith("OTA1:")).toBe(true);
  expect(offlineRequests.filter((u) => u.includes("/api/")), "no API calls while signing offline").toEqual([]);
  await shot(ph, "05-family-offline-authorization");

  // Offline reload: the signing screen and key survive without network.
  await ph.reload();
  await expect(ph.getByRole("heading", { name: /Family wallet/ })).toBeVisible();
  await expect(ph.locator(".fp")).toHaveText(fingerprint);

  // 11-13. Merchant imports approval, submits (double-click), waits for confirmation
  const mBefore = await merchantBalance(operator);
  await paste(shop, auth);
  await expect(shop.getByText(/NOT PAID until Stellar confirms/)).toBeVisible();
  await shop.getByRole("button", { name: "Submit to Stellar" }).dblclick();
  await expect(shop.getByText(/Payment confirmed on Stellar/)).toBeVisible({ timeout: 90_000 });
  const href = await shop.locator(".success a.txlink").getAttribute("href");
  expect(href).toMatch(/stellar\.expert\/explorer\/testnet\/tx\/[0-9a-f]{64}$/);
  console.log("UI payment tx:", href);
  await shot(shop, "06-shop-payment-confirmed");

  // 14-15. Balances moved by exactly the charge, once (double-click did not double charge)
  expect(await familyBalance(operator, familyId)).toBe(50_000_000n - 10_857_764n);
  expect(await merchantBalance(operator)).toBe(mBefore + 10_857_764n);

  // 16-17. Replay attempt is rejected by the contract
  await shop.getByRole("button", { name: /Replay test/ }).click();
  await expect(shop.getByText(/Replay blocked: This invoice has already been paid/)).toBeVisible({ timeout: 60_000 });
  expect(await merchantBalance(operator)).toBe(mBefore + 10_857_764n);

  // Payment history comes from on-chain events (merchant API + sender UI)
  const hash = href!.split("/").pop()!;
  await expect.poll(async () => JSON.stringify((await (await operator.request.get("/api/merchant/A")).json()).payments), { timeout: 30_000 }).toContain(hash);
  await op.goto("/sender");
  await op.locator('label:has-text("Or enter family #") + input').fill(familyId);
  await expect(op.locator(`a.txlink[href$="${hash}"]`)).toBeVisible({ timeout: 30_000 });

  // Reconnect
  await phone.setOffline(false);
  await ph.getByRole("button", { name: "Refresh balance" }).click();
  await expect(ph.locator(".big")).toContainText("3.91");
  await operator.close(); await phone.close();
});

test("malformed and foreign codes are rejected without crashing", async ({ page }) => {
  await page.goto("/family");
  await page.getByRole("button", { name: "Create my key" }).click();
  await paste(page, "OTI1:{not json");
  await expect(page.locator(".status.bad")).toContainText(/malformed/i);
  await page.getByPlaceholder("OTI1:… / OTA1:… / OTK1:…").fill("hello world");
  await page.getByRole("button", { name: "Use pasted code" }).click();
  await expect(page.locator(".status.bad")).toContainText(/not an OpenTab invoice/);
  await expect(page.getByRole("heading", { name: /Family wallet/ })).toBeVisible();
});

test("interactive screens require demo access", async ({ page }) => {
  await page.goto("/sender");
  await expect(page.getByText("Demo operator access")).toBeVisible();
  await page.locator("#democode").fill("definitely-wrong");
  await page.getByRole("button", { name: "Unlock demo" }).click();
  await expect(page.getByText("Incorrect demo access code.")).toBeVisible();
  await page.getByRole("button", { name: "Create new family + fund" }).click();
  await expect(page.getByText(/Demo access code required/)).toBeVisible();
});

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`mobile layout ${width}px has no horizontal overflow`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: true });
    const page = await ctx.newPage();
    for (const path of ["/", "/demo", "/sender", "/family", "/shop"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/mobile-${width}${path === "/" ? "-home" : path.replace("/", "-")}.png`, fullPage: true });
    }
    await ctx.close();
  });
}
