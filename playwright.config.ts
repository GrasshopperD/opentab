import { defineConfig, devices } from "@playwright/test";
// Runs against an already-running production app (npm run build && npm run start) at OT_BASE_URL.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.OT_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Emulated iPhone on WebKit: offline recipient flow only. NOT proof that physical Safari works.
    { name: "webkit-iphone", use: { ...devices["iPhone 13"] }, testMatch: /offline\.spec\.ts/ },
  ],
});
