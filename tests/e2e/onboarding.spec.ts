// Product Mode onboarding is role selection only: no account, no email, no API calls, no payment authorization.
import { expect, test, type Page } from "@playwright/test";

function track(page: Page) {
  const calls: string[] = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (r.method() !== "GET" || u.pathname.startsWith("/api/")) calls.push(`${r.method()} ${u.pathname}`); });
  return calls;
}

for (const [role, option, product, demo, demoText] of [
  ["organizer", /I’m an organizer/, "/dashboard", "/demo/sender", "Add funds or pair a phone in Demo Mode"],
  ["recipient", /I’m a family member/, "/wallet", "/demo/family", "Set up this phone in Demo Mode"],
  ["merchant", /I’m a merchant/, "/business", "/demo/shop", "Open Merchant Checkout in Demo Mode"],
] as const) {
  test(`${role}: choosing a role leads to its Product page and its working Demo page, with no account and no API calls`, async ({ page }) => {
    const calls = track(page);
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "How will you use OpenTab?" })).toBeVisible();
    await expect(page.locator("input[type=email], input[type=password]")).toHaveCount(0);
    await expect(page.getByText("Choosing a role is not payment authorization.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await page.getByRole("button", { name: option }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "You’re all set" })).toBeVisible();
    await expect(page.getByText("Role choice saved on this browser only · not an account")).toBeVisible();
    await expect(page.locator(".ot-ready .ot-button")).toHaveAttribute("href", product);
    await expect(page.getByRole("link", { name: demoText })).toHaveAttribute("href", demo);
    expect((await page.context().cookies()).find((c) => c.name === "opentab_role_preview")?.value).toBe(role);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByRole("button", { name: "Choose a different role" }).click();
    await expect(page.getByRole("heading", { name: "How will you use OpenTab?" })).toBeVisible();
    expect(calls).toEqual([]);
  });
}

test("sign in explains there are no accounts; business link preselects merchant", async ({ page }) => {
  await page.goto("/onboarding?mode=signin");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText(/no personal accounts/)).toBeVisible();
  await expect(page.locator("input")).toHaveCount(0);
  await page.goto("/onboarding?role=merchant");
  await expect(page.getByRole("button", { name: /I’m a merchant/ })).toHaveAttribute("aria-pressed", "true");
});

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`new entry pages fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/home", "/onboarding", "/onboarding?mode=signin", "/onboarding?role=merchant", "/onboarding?role=recipient"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "OpenTab home", exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
    }
  });
}

test("all original demo pages remain reachable under /demo", async ({ page }) => {
  for (const [path, heading] of [["/demo/home", /Your support/], ["/demo/sender", "Sender"], ["/demo/family", /Family Wallet/], ["/demo/shop", "Merchant Checkout"]] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: heading, exact: typeof heading === "string" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Demo navigation" }).getByRole("link", { name: "Shop", exact: true })).toHaveAttribute("href", "/demo/shop");
  }
});
