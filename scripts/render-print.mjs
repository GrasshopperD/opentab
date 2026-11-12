// Renders submission/print/*.html to PDF with Playwright Chromium.
// Usage: node scripts/render-print.mjs
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const jobs = [
  ["submission/print/one-page-overview.html", "submission/OpenTab_Global_One_Page_Overview.pdf"],
  ["submission/print/trifold.html", "submission/OpenTab_Global_Trifold_48x36in.pdf"],
  ["submission/print/pitch-slides.html", "submission/OpenTab_Global_Pitch_Slides.pdf"],
];
const browser = await chromium.launch();
for (const [src, out] of jobs) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(src)).href, { waitUntil: "load" });
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  const pages = (readFileSync(out, "latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`${out}: ${pages} page(s)`);
  await page.close();
}
await browser.close();
