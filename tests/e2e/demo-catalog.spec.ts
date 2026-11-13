// REAL browser + REAL Stellar Testnet against the EXISTING demo family (default #7).
// SPENDS demo OTUSD: one Milk purchase (3 OTUSD) from that family + Testnet XLM fees for one key registration and one payment.
// Never creates, funds or resets a family. Needs OT_DEMO_CODE and a running app.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import * as fs from "node:fs";
import { paste } from "./helpers";

const CODE = process.env.OT_DEMO_CODE ?? "";
const FAMILY = process.env.OT_DEMO_FAMILY ?? "7";
const OUT = "test-results/demo-catalog";

async function unlock(page: Page) {
  await page.locator("#democode").fill(CODE);
  await page.getByRole("button", { name: "Unlock demo" }).click();
  await expect(page.getByText("Demo operator access active")).toBeVisible();
}
const api = async (ctx: BrowserContext, path: string) => (await ctx.request.get(path)).json();
const familyBalance = async (ctx: BrowserContext) => BigInt((await api(ctx, `/api/family/${FAMILY}`)).family.balance);
const merchantBalance = async (ctx: BrowserContext) => BigInt((await api(ctx, "/api/merchant/A")).balance);
const fmt2 = (n: bigint) => `${n / 10_000_000n}.${(n % 10_000_000n).toString().padStart(7, "0").slice(0, 2)}`;

test("preset family, Milk $3.00, offline approval, settlement, itemized receipt, replay + tamper rejected", async ({ browser }) => {
  expect(CODE, "set OT_DEMO_CODE").not.toBe("");
  fs.mkdirSync(OUT, { recursive: true });
  const operator = await browser.newContext({ acceptDownloads: true });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  // 1. Sender preselects the existing family and shows its live on-chain balance. Nothing is created.
  const createCalls: string[] = [];
  const op = await operator.newPage();
  op.on("request", (r) => { if (r.url().includes("/api/sender/family")) createCalls.push(r.url()); });
  await op.goto("/sender");
  await unlock(op);
  await expect(op.getByTestId("demo-family-note")).toContainText(`existing Family #${FAMILY}`);
  await expect(op.locator('label:has-text("Or enter family #") + input')).toHaveValue(FAMILY);
  const before = await familyBalance(operator);
  await expect(op.locator(".big")).toContainText(fmt2(before));            // displayed value == chain value
  await expect(op.getByText("status: active")).toBeVisible();
  await expect(op.getByRole("button", { name: "Create new family + fund" })).toBeHidden(); // tucked under Advanced
  await op.screenshot({ path: `${OUT}/1-sender-preset.png`, fullPage: true });

  // 2. Phone creates a key and is paired to the preset family (one on-chain key registration).
  const ph = await phone.newPage();
  await ph.goto("/family");
  await ph.locator('label:has-text("Your name") + input').fill("Ana");
  await ph.getByRole("button", { name: "Create my key" }).click();
  const pairing = await ph.getByTestId("qr-text").first().inputValue();
  await ph.locator('label:has-text("Family number") + input').fill(FAMILY);
  await expect(ph.getByText("Waiting for your sender to authorize this device")).toBeVisible();
  await ph.screenshot({ path: `${OUT}/5-phone-before-pairing.png`, fullPage: true });
  await op.getByRole("button", { name: "Pair Family Member" }).click();
  await paste(op, pairing);
  await op.getByRole("button", { name: `Authorize for family #${FAMILY}` }).click();
  await expect(op.getByText("Phone paired")).toBeVisible({ timeout: 90_000 });
  await op.screenshot({ path: `${OUT}/6-sender-after-pairing.png`, fullPage: true });
  await ph.reload();
  await ph.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
  await ph.getByRole("button", { name: "Refresh balance" }).click();
  await expect(ph.getByText("this phone is authorized")).toBeVisible();
  await expect(ph.getByRole("button", { name: "Scan to Pay" })).toBeVisible();
  await ph.screenshot({ path: `${OUT}/7-phone-connected-wallet.png`, fullPage: true });

  // 3. Shop: catalog is the default; Milk x1 = USD 3.00 = 3.0000000 OTUSD at the illustrative 1.0000 rate.
  const shop = await operator.newPage();
  await shop.goto("/shop");
  await expect(shop.getByText("Demo operator access active")).toBeVisible();
  for (const p of ["Milk", "Bread", "Water", "Apples"]) await expect(shop.getByRole("radio", { name: new RegExp(p) })).toBeVisible();
  await shop.getByRole("radio", { name: /Water/ }).click();
  await shop.locator("#qty").fill("3");
  await expect(shop.getByTestId("line")).toHaveText("Water × 3 @ USD 1.00");
  await shop.getByRole("radio", { name: /Milk/ }).click();
  await shop.locator("#qty").fill("1");
  await expect(shop.getByTestId("line")).toHaveText("Milk × 1 @ USD 3.00");
  await expect(shop.locator(".kv dd b", { hasText: /^USD 3\.00$/ })).toBeVisible();   // Total row
  await expect(shop.getByText("3.0000000 OTUSD", { exact: true })).toBeVisible();   // charge row (balance line also ends in ...3.0000000)
  await shop.getByRole("button", { name: "Generate Invoice QR" }).click();
  await expect(shop.locator(".qr img")).toBeVisible();
  const invoice = await shop.getByTestId("qr-text").first().inputValue();
  expect(JSON.parse(invoice.slice(5)).li).toEqual([["Milk", 1, "300"]]);
  await shop.screenshot({ path: `${OUT}/2-shop-milk-invoice.png`, fullPage: true });

  // 4. Phone OFFLINE: imports the invoice, sees the item, signs locally.
  await phone.setOffline(true);
  const offlineApi: string[] = [];
  ph.on("request", (r) => { if (r.url().includes("/api/")) offlineApi.push(r.url()); });
  await ph.getByRole("button", { name: "Scan to Pay" }).click();
  await paste(ph, invoice);
  await expect(ph.getByTestId("items")).toHaveText("Milk × 1 @ USD 3.00");
  await ph.screenshot({ path: `${OUT}/8-phone-review-payment.png`, fullPage: true });
  await expect(ph.getByText("3.0000000 OTUSD", { exact: true })).toBeVisible();
  await ph.getByRole("button", { name: /^Approve / }).click();
  await expect(ph.getByRole("heading", { name: "Payment Authorized" })).toBeVisible();
  await expect(ph.getByText("Waiting for merchant settlement.")).toBeVisible();
  const auth = await ph.getByTestId("qr-text").first().inputValue();
  expect(offlineApi, "no API calls while signing offline").toEqual([]);
  await ph.screenshot({ path: `${OUT}/3-phone-offline-approval.png`, fullPage: true });

  // 5. Tampered item (Milk -> Water, same price) is rejected locally by the shop and by the server. Nothing is submitted.
  const t = JSON.parse(auth.slice(5)); t.i.li = [["Water", 3, "100"]];
  const tampered = "OTA1:" + JSON.stringify(t);
  await paste(shop, tampered);
  await expect(shop.locator(".status.bad")).toContainText(/Signature check failed/);
  const origin = new URL(shop.url()).origin;
  const srv = await shop.evaluate(async ([a, o]) => (await fetch(o + "/api/merchant/pay", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchantId: "A", authorization: a }) })).json(), [tampered, origin] as const);
  expect(srv.error).toBe("BadSignature");

  // 6. Genuine approval: submit and wait for Stellar confirmation.
  const mBefore = await merchantBalance(operator);
  await paste(shop, auth);
  await expect(shop.getByText(/Authorization Verified/)).toBeVisible();
  await expect(shop.getByText(/NOT PAID until Stellar confirms/)).toBeVisible();
  await shop.screenshot({ path: `${OUT}/9-shop-authorization-verified.png`, fullPage: true });
  await shop.getByRole("button", { name: "Submit to Stellar" }).dblclick();
  await expect(shop.getByText(/Payment confirmed on Stellar/)).toBeVisible({ timeout: 90_000 });
  const href = await shop.locator(".success a.txlink").first().getAttribute("href");
  const hash = href!.split("/").pop()!;
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  console.log("Milk payment tx:", hash);

  // 7. Itemized receipt
  const r = shop.getByTestId("receipt");
  await expect(r).toContainText("Tienda Rosa");
  await expect(r.locator("tbody tr")).toHaveCount(1);
  await expect(r.locator("tbody tr td")).toHaveText(["Milk", "1", "USD 3.00", "USD 3.00"]);
  await expect(r.locator("tfoot")).toContainText("USD 3.00");
  await expect(r).toContainText("3.0000000 OTUSD");
  await expect(r).toContainText("Confirmed on Stellar Testnet");
  await expect(r.getByTestId("receipt-hash")).toHaveText(hash);
  await expect(r).toContainText(String(new Date().getFullYear()));     // timestamp rendered
  await expect(r).toContainText("not a tax invoice");
  await shop.screenshot({ path: `${OUT}/4-shop-receipt.png`, fullPage: true });

  // 8. Exact balance movement (double-click did not double charge)
  expect(await familyBalance(operator)).toBe(before - 30_000_000n);
  expect(await merchantBalance(operator)).toBe(mBefore + 30_000_000n);

  // 9. Replay of the same signed approval is rejected by the contract
  await shop.getByRole("button", { name: /Replay test/ }).click();
  await expect(shop.getByText(/Replay blocked: This invoice has already been paid/)).toBeVisible({ timeout: 60_000 });
  expect(await familyBalance(operator)).toBe(before - 30_000_000n);
  expect(await merchantBalance(operator)).toBe(mBefore + 30_000_000n);

  // 10. Receipt survives reload (local record) and exports as CSV
  await shop.getByRole("button", { name: "New Sale" }).click();
  await expect(shop.getByRole("button", { name: "Generate Invoice QR" })).toBeVisible();   // reset to product selection
  await shop.reload();
  await expect(shop.getByTestId("receipt-log")).toContainText("Milk × 1");
  const [dl] = await Promise.all([shop.waitForEvent("download"), shop.getByRole("button", { name: "Export CSV" }).click()]);
  const csvPath = `${OUT}/receipts.csv`; await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, "utf8");
  expect(csv.split("\r\n")[0]).toContain("product,quantity,unit_price");
  expect(csv).toContain(`"Milk","1","3.00","3.00","USD","3.00","3.0000000","${hash}","CONFIRMED"`);

  // 11. Unavailable family shows a clear error and creates nothing
  await op.getByText("Advanced: family management").click();
  await op.locator('label:has-text("Or enter family #") + input').fill("999999");
  await expect(op.getByTestId("family-error")).toContainText("Family #999999 is unavailable");
  expect(createCalls, "no family was created").toEqual([]);

  await phone.setOffline(false);
  await operator.close(); await phone.close();
});
