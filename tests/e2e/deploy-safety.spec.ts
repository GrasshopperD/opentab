// Deployment-safety checks. SPENDS NOTHING: no transaction is submitted (every approval here is only checked locally by
// the shop terminal, then discarded with "New sale").
//  1. Invitations are hidden/unavailable unless explicitly enabled (default and Vercel builds).
//  2. REGRESSION: an approval from an outdated phone app (signed the total WITHOUT the item list) is rejected, as is any
//     approval that differs from the invoice on screen; a valid non-itemized approval is still accepted.
import { expect, test, type Page } from "@playwright/test";
import * as P from "../../packages/shared/src/index";

const FAMILY = BigInt(process.env.OT_DEMO_FAMILY ?? "7");

async function paste(page: Page, text: string) {
  const box = page.getByPlaceholder("OTI1:… / OTA1:… / OTK1:…");
  if (!(await box.isVisible())) await page.getByText("Paste code instead").click();   // <details> toggles: open only if closed
  await box.fill(text);
  await page.getByRole("button", { name: "Use pasted code" }).click();
}
const now = () => BigInt(Math.floor(Date.now() / 1000));
/** What a phone running an app version from BEFORE itemized quotes produces: its parser drops `li`, signs, re-encodes. */
function staleApproval(invoiceQR: string, sk: Uint8Array) {
  const legacy = JSON.parse(invoiceQR.slice(5)); delete legacy.li;
  return P.encodeAuthQR(P.signInvoice(P.parseInvoiceQR("OTI1:" + JSON.stringify(legacy)), FAMILY, sk, now()));
}

test("invitations are hidden and the invitation API fails closed when not enabled", async ({ page, request, baseURL }) => {
  const probe = await request.post("/api/invite/open", { data: { token: "A".repeat(43) }, headers: { origin: new URL(baseURL!).origin } });
  test.skip(probe.status() !== 503, "this server was started with INVITES_ENABLED=1 (local invitation preview)");
  expect((await probe.json()).error).toBe("InvitesUnavailable");

  await page.goto("/sender");
  await page.getByRole("button", { name: "Pair Family Member" }).click();
  await expect(page.getByTestId("pair-panel")).toContainText("Scan the pairing code");
  await expect(page.getByTestId("invites")).toHaveCount(0);
  await expect(page.getByText("Invite a family member")).toHaveCount(0);
  await expect(page.getByText("Kept during migration")).toHaveCount(0);

  await page.goto("/family");
  await expect(page.getByText(/invitation/i)).toHaveCount(0);

  await page.goto("/join#t=" + "B".repeat(43));
  await expect(page.getByTestId("join-unavailable")).toContainText("not available");
  expect(new URL(page.url()).hash, "token-like fragment stripped").toBe("");
  await expect(page.getByRole("link", { name: "Set up this phone" })).toHaveAttribute("href", "/family");
});

test("REGRESSION: shop rejects outdated or mismatched approvals, accepts exact ones (no submission)", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.locator("#democode")).toHaveCount(0);                  // public demo: no access-code form
  const sk = P.generateSecretKey();
  const bad = page.locator(".status.bad");

  // Itemized Milk x1 invoice.
  await page.getByRole("radio", { name: /Milk/ }).click();
  await page.locator("#qty").fill("1");
  await page.getByRole("button", { name: "Generate Invoice QR" }).click();
  const invoiceQR = await page.getByTestId("qr-text").first().inputValue();
  const inv = P.parseInvoiceQR(invoiceQR);
  expect(inv.quote.items).toEqual([{ name: "Milk", qty: 1, unitMinor: 300n }]);

  // (a) Outdated app: validly signed, same amount, but no item list -> rejected with an update message.
  const stale = staleApproval(invoiceQR, sk);
  expect(P.verifyAuthorization(P.parseAuthQR(stale))).toBe(true);
  await paste(page, stale);
  await expect(bad).toContainText("app is out of date");
  await expect(bad).toContainText("open OpenTab once while online");
  await expect(page.getByText(/NOT PAID until Stellar confirms/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit to Stellar" })).toHaveCount(0);

  // (b) Validly signed but for a different terminal / quantity of the same invoice id -> mismatch.
  for (const v of [{ ...inv, terminalId: inv.terminalId + 1 },
    (() => { const q = { ...inv.quote, localMinor: 600n, items: [{ name: "Milk", qty: 2, unitMinor: 300n }] }; return { ...inv, quote: q, amount: P.computeCharge(q) }; })()]) {
    await paste(page, P.encodeAuthQR(P.signInvoice(v, FAMILY, sk, now())));
    await expect(bad).toContainText("does not match the invoice on screen");
    await expect(page.getByRole("button", { name: "Submit to Stellar" })).toHaveCount(0);
  }

  // (c) Exact itemized approval (current app) is accepted locally. NOT submitted.
  await paste(page, P.encodeAuthQR(P.signInvoice(inv, FAMILY, sk, now())));
  await expect(page.getByText(/NOT PAID until Stellar confirms/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel sale" }).click();

  // (d) Backward compatibility: a non-itemized (custom amount) invoice + matching approval is accepted locally. NOT submitted.
  await page.getByRole("tab", { name: "Custom amount" }).click();
  await page.getByRole("button", { name: "Generate Invoice QR" }).click();
  const plainQR = await page.getByTestId("qr-text").first().inputValue();
  const plain = P.parseInvoiceQR(plainQR);
  expect(plain.quote.items).toBeUndefined();
  await paste(page, staleApproval(plainQR, sk));            // an outdated app is fine for non-itemized invoices
  await expect(page.getByText(/NOT PAID until Stellar confirms/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel sale" }).click();
  await expect(page.getByRole("button", { name: "Generate Invoice QR" })).toBeVisible();   // back to product selection
});
