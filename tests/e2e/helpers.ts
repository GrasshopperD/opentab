import type { BrowserContext, Page } from "@playwright/test";

/** TEST-ONLY. Lets a UI test reach the connected Family wallet without a real on-chain key registration (which would
 *  spend Testnet fees on every run). The real /api/family response is fetched from the server and ONLY its `keyActive`
 *  field is rewritten to true; the balance stays the real on-chain value. Real authorization is exercised end to end
 *  by checkout.spec and demo-catalog.spec against Stellar Testnet. */
export async function simulateAuthorizedDevice(ctx: BrowserContext) {
  await ctx.route("**/api/family/**", async (route) => {
    try {
      if (!route.request().url().includes("key=")) return await route.continue();
      const res = await route.fetch();
      const json = await res.json();
      if (!json.error) json.keyActive = true;
      await route.fulfill({ response: res, json });
    } catch { /* the page's 5-second status poll can still be in flight when the test closes its context */ }
  });
}

/** Opens the scanner's "Paste code instead" fallback if it is closed, then submits `text`. */
export async function paste(page: Page, text: string) {
  const box = page.getByPlaceholder("OTI1:… / OTA1:… / OTK1:…");
  if (!(await box.isVisible())) await page.getByText("Paste code instead").click();
  await box.fill(text);
  await page.getByRole("button", { name: "Use pasted code" }).click();
}
