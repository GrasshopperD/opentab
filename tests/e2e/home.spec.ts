// Landing-page interactions are local presentation only; no account/payment endpoints.
import { expect, test } from "@playwright/test";

test("simple hero leads to setup and has no secondary demo action", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Support, closer to home." })).toBeVisible();
  await expect(page.getByText("See it in action", { exact: true })).toHaveCount(0);
  const hero = page.locator(".home-intro");
  await expect(hero.getByRole("link", { name: "Get started", exact: true })).toHaveAttribute("href", "/onboarding");
  await hero.getByRole("link", { name: "Get started", exact: true }).click();
  // Release: setup is role selection only (no email/name fields); large readable options kept.
  await expect(page.getByRole("heading", { name: "How will you use OpenTab?" })).toBeVisible();
  await expect(page.locator(".ot-story, .ot-setup-footer, .ot-setup-topline .ot-preview-tag")).toHaveCount(0);
  await expect(page.locator("input[type=email]")).toHaveCount(0);
  expect(await page.locator(".ot-option b").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
  expect(errors).toEqual([]);
});

test("scrolling advances the walkthrough and roles can be explored by mouse and keyboard", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", r => { if (new URL(r.url()).pathname.startsWith("/api/") || r.method() !== "GET") apiCalls.push(r.url()); });
  await page.goto("/home");
  for (const [index, label] of [[0, "Support"], [1, "Approve"], [2, "Connect"]] as const) {
    await page.locator(`[data-story-step="${index}"]`).evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  // At the last story step the scene buttons sit under the sticky header, so a pointer click would first scroll the page
  // (and the scroll re-selects the nearest scene). Trigger the button itself to test its handler.
  await page.getByRole("button", { name: "Support", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
  await expect(page.locator(".home-walkthrough")).toHaveClass(/home-walkthrough-0/);
  await expect(page.getByRole("tab", { name: "Merchant", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Organizer", exact: true }).click();
  await page.getByRole("tab", { name: "Organizer", exact: true }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Recipient", exact: true })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("Keep your support close.");
  await page.locator("summary").filter({ hasText: "Does this use real money?" }).click();
  await expect(page.locator("details[open]")).toContainText("no monetary value");
  expect(apiCalls).toEqual([]);
});

test("reduced-motion preference keeps content visible and disables hero parallax", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/home");
  await expect(page.locator(".ot-landing")).not.toHaveClass(/home-motion/);
  await page.locator(".home-connection").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Support, closer to home." })).toBeVisible();
  expect(await page.locator(".ot-landing").evaluate(el => el.style.getPropertyValue("--hero-progress"))).toBe("0");
});
