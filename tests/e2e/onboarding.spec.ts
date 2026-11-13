// Frontend-only onboarding: these checks must never create accounts or transact.
import { expect, test, type Page } from "@playwright/test";

async function checkSetupWidths(page: Page) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
}

async function account(page: Page, merchant = false) {
  await page.goto(merchant ? "/onboarding?role=merchant" : "/onboarding");
  await page.getByLabel("Your name").fill("Alex");
  await page.getByLabel("Email address").fill("alex@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: merchant ? "Tell us about your shop" : "How will you use OpenTab?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Merchant Set up/ })).toHaveCount(0);
}

for (const role of ["organizer", "recipient", "merchant"] as const) {
  test(`${role} completes a frontend setup without API calls or saved credentials`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname.startsWith("/api/") || request.method() !== "GET") requests.push(`${request.method()} ${request.url()}`);
    });
    await account(page, role === "merchant");
    if (role !== "merchant") {
      await page.getByRole("button", { name: role === "organizer" ? /I’m an organizer/ : /I’m a recipient/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();
    }
    const label = role === "merchant" ? "Business name" : role === "recipient" ? "Your display name" : "Family space name";
    const space = role === "merchant" ? "Tienda Rosa" : role === "recipient" ? "Ana" : "The Rivera family";
    await page.getByLabel(label, { exact: true }).fill(space);
    await page.getByLabel(role === "merchant" ? "Where is your shop?" : "Where are you based?").selectOption("Mexico");
    await checkSetupWidths(page);
    // Back navigation retains entered presentation state.
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(space);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    if (role === "organizer") await page.getByLabel("Groceries & home", { exact: true }).check();
    if (role === "recipient") await page.getByLabel("Family number", { exact: false }).fill("42");
    if (role === "merchant") {
      await page.getByLabel("Pricing currency").selectOption("MXN");
      await page.getByLabel("Counter name").fill("Front counter");
    }
    await checkSetupWidths(page);
    await page.getByRole("button", { name: "Review my setup" }).click();
    await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible();
    await expect(page.getByText("alex@example.com", { exact: true })).toBeVisible();
    await checkSetupWidths(page);
    if (role === "recipient") await expect(page.getByText("#42 · not linked", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Explore my (family|shop) space/ }).click();
    const demoLink = page.getByRole("link", { name: role === "organizer" ? "Open my dashboard" : `Open ${role} demo` });
    await expect(demoLink).toHaveAttribute("href", role === "organizer" ? "/dashboard" : `/demo/${role === "merchant" ? "shop" : "family"}`);
    await expect(page.getByRole("heading", { name: space, exact: true })).toBeVisible();
    await checkSetupWidths(page);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("alex@example.com");
    expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain("alex@example.com");
    await page.screenshot({ path: test.info().outputPath(`${role}-ready.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: test.info().outputPath(`${role}-ready-mobile.png`), fullPage: true });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(demoLink).toBeVisible();
    const cookies = await page.context().cookies();
    const remembered = cookies.find(c => c.name === (role === "merchant" ? "opentab_business_preview" : "opentab_family_preview"));
    expect(remembered?.value).toBe(role);
    expect(remembered?.sameSite).toBe("Lax");
    expect(JSON.stringify(cookies)).not.toContain("alex@example.com");
    await page.goto(role === "merchant" ? "/onboarding" : "/onboarding?role=merchant");
    await expect(page.getByRole("heading", { name: "Welcome to OpenTab" })).toBeVisible();
    await page.goto(role === "merchant" ? "/onboarding?role=merchant" : "/onboarding");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByRole("button", { name: "Forget this preview" }).click();
    await page.reload();
    await expect(page.getByLabel("Email address")).toHaveValue("");
    await expect(page.getByRole("heading", { name: "Welcome to OpenTab" })).toBeVisible();
  });
}

test("sign-in preview validates email and can switch to sign-up", async ({ page }) => {
  await page.goto("/onboarding?mode=signin");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Email address").fill("invalid");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Email address").fill("alex@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Sign up", exact: true }).first().click();
  await expect(page.getByLabel("Your name")).toBeVisible();
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
  for (const [path, heading] of [["/demo/home", /Your support/], ["/demo/sender", "Sender"], ["/demo/family", /Family wallet/], ["/demo/shop", "Shop checkout"]] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: heading, exact: typeof heading === "string" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Demo navigation" }).getByRole("link", { name: "Shop", exact: true })).toHaveAttribute("href", "/demo/shop");
  }
});
