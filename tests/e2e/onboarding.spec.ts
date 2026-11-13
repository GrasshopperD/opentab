// Product Mode onboarding. SPENDS NOTHING: no transaction is sent. The demo-access login is mocked here (the real login is
// exercised in product.spec.ts) so these checks never consume the login rate limit.
import { expect, test, type Page } from "@playwright/test";

async function checkSetupWidths(page: Page) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
}
/** Mocks ONLY the demo-access routes; records every non-GET request and every /api call. */
async function track(page: Page, authorized = false) {
  const calls: string[] = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") || r.method() !== "GET") calls.push(`${r.method()} ${u.pathname}`); });
  await page.route("**/api/auth/status", route => route.fulfill({ json: { enabled: true, authorized } }));
  await page.route("**/api/auth/login", route => { const ok = route.request().postDataJSON()?.code === "right-code"; return route.fulfill({ status: ok ? 200 : 401, json: ok ? { authorized: true } : { error: "BadCode", detail: "Incorrect demo access code." } }); });
  return calls;
}

test("no email or personal account is collected anywhere in setup", async ({ page }) => {
  await track(page);
  for (const path of ["/onboarding", "/onboarding?mode=signin", "/onboarding?role=merchant", "/onboarding?mode=signin&role=merchant"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toHaveCount(0);
    await expect(page.locator("input[type=email]")).toHaveCount(0);
  }
});

test("recipient setup creates ONE device key, keeps it on repeat, and hands off to the real wallet", async ({ page }) => {
  const calls = await track(page);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /I’m a recipient/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Your display name").fill("Ana");
  await checkSetupWidths(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Family number", { exact: false }).fill("7");
  await page.getByRole("button", { name: "Review my setup" }).click();
  await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible();
  await expect(page.getByText("#7 · not connected yet", { exact: true })).toBeVisible();
  await expect(page.getByText("Create one on this phone", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("opentab.family.sk"))).toBeNull();     // nothing created before confirming
  await page.getByRole("button", { name: /Create my key/ }).click();
  await expect(page.getByRole("heading", { name: "Your phone is ready to pair" })).toBeVisible();
  const sk = await page.evaluate(() => localStorage.getItem("opentab.family.sk"));
  expect(sk).toMatch(/^[0-9a-f]{64}$/);
  expect(await page.evaluate(() => [localStorage.getItem("opentab.family.name"), localStorage.getItem("opentab.family.id")])).toEqual(["Ana", "7"]);
  const wallet = page.getByRole("link", { name: "Open my Family Wallet" });
  await expect(wallet).toHaveAttribute("href", "/wallet");
  await checkSetupWidths(page);

  // Repeat setup: the existing key is shown and kept, never regenerated.
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("button", { name: /I’m a recipient/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Review my setup" }).click();
  await expect(page.getByText(/Keep this phone’s key ·/)).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  expect(await page.evaluate(() => localStorage.getItem("opentab.family.sk"))).toBe(sk);

  // The wallet shows the same device: pairing step, not a connected wallet (setup is not authorization).
  await wallet.click();
  await expect(page).toHaveURL(/\/wallet$/);
  await expect(page.getByRole("heading", { name: /Almost there/ })).toBeVisible();
  await expect(page.locator("#wallet-family")).toHaveValue("7");
  await expect(page.getByRole("button", { name: /Scan to Pay/ })).toHaveCount(0);
  expect(calls.filter(c => !c.startsWith("GET /api/auth/status") && !c.startsWith("GET /api/family/7") && !c.startsWith("GET /api/invoice"))).toEqual([]);
});

test("organizer unlocks with the existing demo access code, then opens the dashboard; the role cookie is a preference only", async ({ page }) => {
  const calls = await track(page);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /I’m an organizer/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unlock organizer tools" })).toBeVisible();
  await page.getByLabel("Demo access code").fill("wrong-code");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Incorrect demo access code." })).toBeVisible();
  await page.getByLabel("Demo access code").fill("right-code");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: "You’re ready" })).toBeVisible();
  await expect(page.getByText("Demo access active")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open my dashboard" })).toHaveAttribute("href", "/dashboard");
  expect(calls.filter(c => c.startsWith("POST"))).toEqual(["POST /api/auth/login", "POST /api/auth/login"]);
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain("right-code");
  const cookies = await page.context().cookies();
  expect(cookies.find(c => c.name === "opentab_family_preview")?.value).toBe("organizer");
  expect(JSON.stringify(cookies)).not.toContain("right-code");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("button", { name: "Choose a different role" }).click();
  await expect(page.getByRole("heading", { name: "How will you use OpenTab?" })).toBeVisible();
});

test("merchant setup picks a real demo shop + counter that the checkout then uses", async ({ page }) => {
  await track(page, true);
  await page.goto("/onboarding?role=merchant");
  await expect(page.getByRole("heading", { name: "Unlock your checkout" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Shop").selectOption({ label: "Farmacia Luz" });
  await page.getByLabel("Counter (terminal number)").fill("3");
  await checkSetupWidths(page);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Farmacia Luz" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open checkout" })).toHaveAttribute("href", "/business/checkout");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("opentab.shop.settings") || "null"))).toEqual({ mid: "B", terminal: "3" });
  await page.getByRole("link", { name: "Open checkout" }).click();
  await expect(page.getByText("Farmacia Luz · counter #3")).toBeVisible();
  expect((await page.context().cookies()).find(c => c.name === "opentab_business_preview")?.value).toBe("merchant");
});

test("sign in uses the demo access code and points family members to their wallet", async ({ page }) => {
  await track(page);
  await page.goto("/onboarding?mode=signin");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open your Family Wallet" })).toHaveAttribute("href", "/wallet");
  await page.getByLabel("Demo access code").fill("right-code");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: "How will you use OpenTab?" })).toBeVisible();
});

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`new entry pages fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/home", "/onboarding", "/onboarding?mode=signin", "/onboarding?role=merchant", "/onboarding?role=recipient"]) {
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
