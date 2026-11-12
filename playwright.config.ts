import { defineConfig, devices } from "@playwright/test";
// Runs against an already-running app (npm run build && npm run start) at OT_BASE_URL.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.OT_BASE_URL ?? "http://localhost:3000", ...devices["Desktop Chrome"], trace: "retain-on-failure" },
});
