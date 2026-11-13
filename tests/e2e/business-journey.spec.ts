import { expect, test } from "@playwright/test";

test("Home restores yellow buttons and links to a separate Business page", async ({ page }) => {
  await page.goto("/home");
  const action = page.locator(".home-intro").getByRole("link", { name: "Get started", exact: true });
  expect(await action.evaluate(e => getComputedStyle(e).backgroundColor)).toBe("rgb(244, 230, 93)");
  expect(await action.evaluate(e => getComputedStyle(e).borderRadius)).toBe("6px");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Business", exact: true }).click();
  await expect(page).toHaveURL(/\/business$/);
  await expect(page.getByRole("heading", { name: /Your local shop/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Set up your shop", exact: true })).toHaveAttribute("href", "/onboarding?role=merchant");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Support, closer to home." })).toBeVisible();
});

test("scroll carries the Stellar symbol from Canada to Mexico without API calls", async ({ page }) => {
  const calls: string[] = [], errors: string[] = [];
  page.on("request", r => { if (new URL(r.url()).pathname.startsWith("/api/") || r.method() !== "GET") calls.push(r.url()); });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/home");
  const journey = page.locator(".country-journey");
  const scroll = async (progress: number) => {
    await journey.evaluate((e, p) => { const top = e.getBoundingClientRect().top + scrollY; const header = document.querySelector(".home-header")!.getBoundingClientRect().height; scrollTo(0, top - header + (e.getBoundingClientRect().height - innerHeight + header) * p); }, progress);
    await expect.poll(async () => Number(await journey.getAttribute("data-progress"))).toBeCloseTo(progress, 1);
  };
  await scroll(0);
  const start = await page.locator(".journey-coin").boundingBox();
  await scroll(.5);
  await expect(journey).toContainText("A little support crosses a little distance.");
  await scroll(1);
  const end = await page.locator(".journey-coin").boundingBox();
  expect(end!.x - start!.x).toBeGreaterThan(100);
  await expect(journey).toContainText("everyday essentials in Mexico");
  await expect(page.locator(".journey-coin img")).toHaveAttribute("src", "/stellar-symbol.svg");

  expect(calls).toEqual([]); expect(errors).toEqual([]);
});

test("reduced motion keeps the country journey static", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/home");
  const journey = page.locator(".country-journey");
  await expect(journey).toHaveAttribute("data-progress", "0.500");
  const left = await page.locator(".journey-coin").evaluate(e => e.style.left);
  await journey.scrollIntoViewIfNeeded();
  await expect(journey).toHaveAttribute("data-progress", "0.500");
  expect(await page.locator(".journey-coin").evaluate(e => e.style.left)).toBe(left);
});

for (const width of [320, 390, 768, 1440]) {
  test(`Business navigation and country map fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/home", "/business"]) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Business", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
    await page.goto("/home");
    await page.locator(".country-journey").evaluate(e => { const header = document.querySelector(".home-header")!.getBoundingClientRect().height; scrollTo(0, e.getBoundingClientRect().top + scrollY - header + (e.getBoundingClientRect().height - innerHeight + header) * .5); });
    // Browser scroll offsets round to device pixels, so half-way can be 0.501.
    await expect.poll(async () => Number(await page.locator(".country-journey").getAttribute("data-progress"))).toBeCloseTo(.5, 2);
    await page.screenshot({ path: test.info().outputPath(`journey-${width}.png`) });
  });
}


test("first scroll moves the coin in the opening hero, and headers are centered", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/home", "/business"]) {
      await page.goto(path);
      const nav = await page.getByRole("navigation", { name: "Main navigation" }).boundingBox();
      expect(Math.abs(nav!.x + nav!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    }
  }
  await page.goto("/home");
  await expect(page.locator(".home-intro .journey-coin")).toBeVisible();
  const start = await page.locator(".journey-coin").boundingBox();
  await page.mouse.wheel(0, 140);
  await expect.poll(async () => Number(await page.locator(".country-journey").getAttribute("data-progress"))).toBeGreaterThan(0.05);
  expect((await page.locator(".journey-coin").boundingBox())!.x).toBeGreaterThan(start!.x + 5);
});
