// Product Mode integration checks. SPENDS NOTHING and submits NO Stellar transaction:
//  - Family balances, device authorization reads, invoice/approval signing and verification are REAL.
//  - Responses of the signing routes (deposit, register/revoke key, merchant settlement) are MOCKED where a real call would
//    send a Testnet transaction; each such test says so. Mocks replace the response only; the request payload is asserted.
//  - "real backend refuses" uses the REAL /api/merchant/pay with a phone whose key is NOT registered: the FamilyVault
//    contract rejects it during simulation, so no transaction is built or submitted; the family balance is re-read to prove it.
// Real settlement through these same routes is proven by checkout.spec / demo-catalog.spec (they spend; run only on approval).
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import * as P from "../../packages/shared/src/index";
import { paste, simulateAuthorizedDevice } from "./helpers";

const CODE = process.env.OT_DEMO_CODE ?? "";
const FAMILY = "7";
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const now = () => BigInt(Math.floor(Date.now() / 1000));
const familyBalance = async (page: Page) => BigInt((await (await page.request.get(`/api/family/${FAMILY}`)).json()).family.balance);
const authorizedSession = (ctx: BrowserContext | Page) => ctx.route("**/api/auth/status", (r) => r.fulfill({ json: { enabled: true, authorized: true } }));

/** Product wallet on a phone context: create key, enter family, return { pub, securityCode, pairingCode }. */
async function setUpWallet(phone: Page, family = FAMILY) {
  await phone.goto("/wallet");
  await phone.locator("#wallet-name").fill("Ana");
  await phone.getByRole("button", { name: /Create my key/ }).click();
  // Read the pairing code first: once the family number is set, an authorized phone switches to the wallet view.
  const pairingCode = await phone.getByTestId("qr-text").first().inputValue();
  const securityCode = (await phone.getByTestId("security-code").innerText()).trim();
  await phone.locator("#wallet-family").fill(family);
  return { pairingCode, securityCode, pub: P.toHex(P.parsePairingQR(pairingCode).pub) };
}
/** Product checkout: build a cart and generate the invoice QR; returns the invoice text shown to the customer. */
async function startSale(shop: Page, cart: Record<string, number>) {
  for (const [name, qty] of Object.entries(cart)) for (let i = 0; i < qty; i++) await shop.getByRole("button", { name: `Add one ${name}` }).click();
  await shop.getByRole("button", { name: /Generate invoice QR/ }).click();
  await expect(shop.getByRole("heading", { name: "Show this invoice to the customer" })).toBeVisible();
  return shop.getByTestId("qr-text").first().inputValue();
}

test("organizer: live Family #7 balance → Add money review → exact deposit payload → confirmed → balance re-read (deposit response mocked)", async ({ page }) => {
  const before = await familyBalance(page);                                  // REAL on-chain read
  await authorizedSession(page);
  const posts: unknown[] = []; let added = 0n;
  await page.route("**/api/sender/deposit", async (r) => { posts.push(r.request().postDataJSON()); added = P.parseTokenAmount("2.5"); await r.fulfill({ json: { status: "CONFIRMED", hash: "c".repeat(64) } }); });
  // After the (mocked) confirmation, the real family read is returned with the deposit applied, as Stellar would.
  await page.route((u) => u.pathname === `/api/family/${FAMILY}`, async (r) => {
    try { const res = await r.fetch(); const j = await res.json(); if (!j.error) j.family.balance = String(BigInt(j.family.balance) + added); await r.fulfill({ response: res, json: j }); } catch { }
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: `Family #${FAMILY}`, exact: true })).toBeVisible();     // preselected, nothing created
  await expect(page.locator(".dash-amount")).toContainText(P.formatTokenAmount(before));
  await expect(page.getByTestId("dash-balance")).toContainText("Read live from Stellar Testnet");
  await page.getByRole("navigation", { name: "Dashboard navigation" }).getByRole("button", { name: "Add money", exact: true }).click();
  await page.getByLabel("How much would you like to add?").fill("2.5");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".dash-review-details")).toContainText(`Family #${FAMILY}`);
  const confirm = page.getByRole("button", { name: "Confirm and add" });
  await expect(confirm).toBeEnabled();
  expect(posts).toEqual([]);                                                      // nothing sent before explicit confirmation
  await confirm.click();
  await expect(page.getByRole("status")).toContainText(`2.5 Demo USD added to family #${FAMILY}. Confirmed on Stellar.`);
  expect(posts).toEqual([{ familyId: FAMILY, amount: "2.5" }]);
  await expect(page.locator(".dash-amount")).toContainText(P.formatTokenAmount(before + added));
});

test("pairing: Product wallet code → organizer checks security code → register_key payload → Connected only after Stellar says so → revoke (key responses mocked)", async ({ browser }) => {
  const phoneCtx = await browser.newContext(PHONE), orgCtx = await browser.newContext();
  let registered = false; const posts: any[] = [];
  // Simulated chain answer for keyActive: false until the mocked register_key confirms, true after, false after revoke.
  for (const ctx of [phoneCtx, orgCtx]) await ctx.route((u) => u.pathname === `/api/family/${FAMILY}` && u.searchParams.has("key"), async (r) => {
    try { const res = await r.fetch(); const j = await res.json(); if (!j.error) j.keyActive = registered; await r.fulfill({ response: res, json: j }); } catch { }
  });
  await authorizedSession(orgCtx);
  await orgCtx.route("**/api/sender/key", async (r) => { const b = r.request().postDataJSON(); posts.push(b); registered = b.action === "register"; await r.fulfill({ json: { status: "CONFIRMED", hash: "d".repeat(64) } }); });

  const phone = await phoneCtx.newPage();
  const { pairingCode, securityCode, pub } = await setUpWallet(phone);
  expect(pairingCode).not.toContain(await phone.evaluate(() => localStorage.getItem("opentab.family.sk")));   // public key only
  await expect(phone.getByTestId("pairing-status")).toContainText(`Waiting for your organizer to authorize this phone on Stellar for family #${FAMILY}`);
  await expect(phone.getByRole("button", { name: /^Scan to Pay/ })).toHaveCount(0);

  const org = await orgCtx.newPage();
  await org.goto("/dashboard");
  await org.getByRole("navigation", { name: "Dashboard navigation" }).getByRole("button", { name: "Family", exact: true }).click();
  await paste(org, pairingCode);
  await expect(org.getByTestId("pair-fingerprint")).toHaveText(securityCode);
  await expect(org.getByTestId("pair-status")).toContainText(`not connected to family #${FAMILY}`);
  await org.getByRole("button", { name: "Connect phone", exact: true }).click();
  await expect(org.getByRole("button", { name: "Confirm connection" })).toBeDisabled();
  await org.getByLabel("The security code matches the one on their phone").check();
  await org.getByRole("button", { name: "Confirm connection" }).click();
  await expect(org.getByRole("status")).toContainText(`Phone connected on Stellar for family #${FAMILY}`);
  expect(posts).toEqual([{ familyId: FAMILY, publicKey: pub, action: "register" }]);
  await expect(org.getByTestId("pair-status")).toContainText(`connected to family #${FAMILY} on Stellar`);
  await expect(org.locator(".dash-devices")).toContainText("Ana");
  await expect(org.locator(".dash-devices")).toContainText("Connected");

  // The phone notices the authorization on its own (polls Stellar) and only then opens the wallet.
  await expect(phone.getByRole("heading", { name: /Family Wallet/ })).toBeVisible({ timeout: 20_000 });
  await expect(phone.getByRole("button", { name: /^Scan to Pay/ })).toBeVisible();
  await expect(phone.getByTestId("wallet-balance")).toContainText(`Family #${FAMILY} · this phone is authorized`);

  // Revoke from the organizer's list of phones (no rescan needed).
  await org.getByRole("button", { name: "Remove access" }).click();
  await org.getByRole("button", { name: "Confirm removal" }).click();
  await expect(org.getByRole("status")).toContainText("Phone access removed on Stellar");
  expect(posts[1]).toEqual({ familyId: FAMILY, publicKey: pub, action: "revoke" });
  await phone.getByRole("button", { name: "Refresh balance" }).click();
  await expect(phone.getByTestId("pairing-status")).toContainText("Waiting for your organizer");
  await phoneCtx.close(); await orgCtx.close();
});

test("journey without spending: Product checkout invoice → Product wallet signs OFFLINE → checkout verifies → real backend requires access, then the real contract refuses the unregistered phone", async ({ browser }) => {
  expect(CODE, "set OT_DEMO_CODE").not.toBe("");
  const shopCtx = await browser.newContext(), phoneCtx = await browser.newContext(PHONE);
  await simulateAuthorizedDevice(phoneCtx);          // UI-only: the key is NOT registered on chain (see helpers.ts)
  const shop = await shopCtx.newPage();
  const balanceBefore = await familyBalance(shop);

  await shop.goto("/business/checkout");
  await expect(shop.getByTestId("checkout-access")).toBeVisible();
  const invoiceText = await startSale(shop, { Milk: 1, Water: 2 });
  const invoice = P.parseInvoiceQR(invoiceText);
  expect(invoice.quote.items).toEqual([{ name: "Milk", qty: 1, unitMinor: 300n }, { name: "Water", qty: 2, unitMinor: 100n }]);
  expect(invoice.quote.localMinor).toBe(500n);

  const phone = await phoneCtx.newPage();
  const { pub } = await setUpWallet(phone);
  await expect(phone.getByRole("button", { name: /^Scan to Pay/ })).toBeVisible();
  await phoneCtx.setOffline(true);
  const offlineRequests: string[] = []; phone.on("request", (r) => offlineRequests.push(r.url()));
  await phone.getByRole("button", { name: /^Scan to Pay/ }).click();
  await paste(phone, invoiceText);
  await expect(phone.getByTestId("items")).toContainText("Milk × 1 @ USD 3.00");
  await expect(phone.getByTestId("items")).toContainText("Water × 2 @ USD 1.00");
  await expect(phone.getByTestId("pay-review")).toContainText("USD 5.00");
  await expect(phone.getByTestId("pay-review")).toContainText("Tienda Rosa");
  await phone.getByRole("button", { name: /Approve payment/ }).click();
  await expect(phone.getByRole("heading", { name: "Payment authorized" })).toBeVisible();
  await expect(phone.getByText("Waiting for merchant settlement. Not paid yet.")).toBeVisible();
  const approval = await phone.getByTestId("qr-text").first().inputValue();
  const auth = P.parseAuthQR(approval);
  expect(P.verifyAuthorization(auth)).toBe(true);
  expect(P.toHex(auth.signer)).toBe(pub);
  expect(auth.familyId).toBe(BigInt(FAMILY));
  expect(P.authorizationMismatch(invoice, auth)).toBeNull();                  // signs EXACTLY the invoice, items included
  expect(offlineRequests.filter((u) => new URL(u).pathname.startsWith("/api/")), "no API calls while signing offline").toEqual([]);

  // Merchant verifies the approval locally.
  await paste(shop, approval);
  await expect(shop.getByText(/Authorization Verified: .* NOT PAID until Stellar confirms\./)).toBeVisible();
  // 1) No demo session: the REAL server refuses before anything reaches Stellar.
  await shop.getByRole("button", { name: /Submit to Stellar/ }).click();
  await expect(shop.getByTestId("checkout-note")).toContainText("Demo access code required");
  await expect(shop.getByRole("button", { name: /Submit to Stellar/ })).toBeVisible();
  // 2) Unlock with the REAL demo access code, submit: the REAL FamilyVault contract refuses (key not registered), in simulation.
  await shop.locator("#checkout-code").fill(CODE);
  await shop.getByRole("button", { name: /Unlock checkout/ }).click();
  await expect(shop.getByTestId("checkout-access")).toHaveCount(0);
  await shop.getByRole("button", { name: /Submit to Stellar/ }).click();
  await expect(shop.getByRole("heading", { name: "Payment failed" })).toBeVisible({ timeout: 60_000 });
  await expect(shop.getByRole("alert").filter({ hasText: "Payment failed" })).toContainText(/not registered/);
  await expect(shop.getByText(/Payment confirmed/)).toHaveCount(0);
  await expect(shop.getByTestId("receipt")).toHaveCount(0);
  expect(await familyBalance(shop)).toBe(balanceBefore);                      // nothing was spent
  await shopCtx.close(); await phoneCtx.close();
});

test("merchant: PENDING is never shown as paid; receipt + CSV only after Stellar CONFIRMED; mismatched approvals rejected (settlement responses mocked)", async ({ page }) => {
  await authorizedSession(page);
  const HASH = "e".repeat(64); let txChecks = 0; const pays: any[] = [];
  await page.route("**/api/merchant/pay", async (r) => { pays.push(r.request().postDataJSON()); await r.fulfill({ json: { status: "PENDING", hash: HASH } }); });
  await page.route(`**/api/tx/${HASH}`, (r) => r.fulfill({ json: { status: ++txChecks >= 2 ? "CONFIRMED" : "PENDING", hash: HASH } }));
  await page.goto("/business/checkout");
  const invoiceText = await startSale(page, { Bread: 2, Apples: 1 });
  const inv = P.parseInvoiceQR(invoiceText);
  const sk = P.generateSecretKey();

  // Different terminal, same invoice id: validly signed but NOT this invoice.
  await paste(page, P.encodeAuthQR(P.signInvoice({ ...inv, terminalId: inv.terminalId + 1 }, 7n, sk, now())));
  await expect(page.getByTestId("checkout-note")).toContainText("does not match the invoice on screen");
  // Outdated app (signed the total without the item list).
  const legacy = JSON.parse(invoiceText.slice(5)); delete legacy.li;
  await paste(page, P.encodeAuthQR(P.signInvoice(P.parseInvoiceQR("OTI1:" + JSON.stringify(legacy)), 7n, sk, now())));
  await expect(page.getByTestId("checkout-note")).toContainText("app is out of date");
  await expect(page.getByRole("button", { name: /Submit to Stellar/ })).toHaveCount(0);

  // Exact approval → verified → submit → PENDING → reconciled by hash → CONFIRMED → receipt.
  const approval = P.encodeAuthQR(P.signInvoice(inv, 7n, sk, now()));
  await paste(page, approval);
  await page.getByRole("button", { name: /Submit to Stellar/ }).click();
  await expect(page.getByRole("heading", { name: "Waiting for Stellar" })).toBeVisible();
  await expect(page.getByText(/Payment confirmed/)).toHaveCount(0);
  await expect(page.getByTestId("receipt")).toHaveCount(0);
  expect(pays).toEqual([{ merchantId: "A", authorization: approval, forceSubmitForDemo: false }]);
  await expect(page.getByText("Payment confirmed on Stellar.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("receipt")).toContainText("Bread");
  await expect(page.getByTestId("receipt")).toContainText("Apples");
  await expect(page.getByTestId("receipt")).toContainText("USD 8.00");
  await expect(page.getByTestId("receipt-hash")).toHaveText(HASH);
  expect(pays).toHaveLength(1);                                                // reconciliation never resubmits

  await page.getByRole("button", { name: /New sale/ }).click();
  await page.getByRole("navigation", { name: "Checkout navigation" }).getByRole("button", { name: "Receipts" }).click();
  await expect(page.getByTestId("receipt-log")).toContainText("Bread × 2, Apples × 1");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const csv = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
  expect(csv).toContain("Bread"); expect(csv).toContain(HASH); expect(csv).toContain("CONFIRMED");
});

test("one application: Product and Demo screens share the same wallet key and the same sale", async ({ page }) => {
  await authorizedSession(page);
  const { securityCode } = await setUpWallet(page);
  await page.goto("/demo/family");
  await expect(page.locator(".fp").first()).toHaveText(securityCode);        // same device key, no second wallet
  await page.goto("/business/checkout");
  const invoiceText = await startSale(page, { Milk: 2 });
  await page.goto("/shop");                                                    // Demo checkout continues the same sale
  await expect(page.getByTestId("sale-summary")).toContainText("Milk × 2");
  expect(await page.getByTestId("qr-text").first().inputValue()).toBe(invoiceText);
  await page.getByRole("button", { name: "Cancel sale" }).click();
  await page.goto("/business/checkout");
  await expect(page.getByRole("heading", { name: "New sale" })).toBeVisible();
});

for (const width of [320, 390, 768, 1440]) {
  test(`Product screens fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await authorizedSession(page);
    for (const path of ["/wallet", "/business/checkout", "/business", "/dashboard"]) {
      await page.goto(path); await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
    }
    await page.goto("/business/checkout"); await startSale(page, { Milk: 1, Bread: 1, Water: 1, Apples: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "invoice stage").toBeLessThanOrEqual(0);
  });
}
