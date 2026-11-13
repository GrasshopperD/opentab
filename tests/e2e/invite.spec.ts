// REAL browser + REAL Stellar Testnet: invitation -> acceptance with key proof -> sender approval -> on-chain registration
// -> revoke. Spends NO OTUSD; costs Testnet XLM fees for two transactions (register_key + revoke_key) on the demo family.
import { expect, test } from "@playwright/test";

const CODE = process.env.OT_DEMO_CODE ?? "";
const FAMILY = process.env.OT_DEMO_FAMILY ?? "7";
const OUT = "test-results/invite";

test("invite link -> accept with key proof -> sender approves -> Connected on Stellar -> revoke", async ({ browser, request, baseURL }) => {
  const probe = await request.post("/api/invite/open", { data: { token: "A".repeat(43) }, headers: { origin: new URL(baseURL!).origin } });
  test.skip(probe.status() === 503, "invitations disabled: build and start with INVITES_ENABLED=1 (local only) to run this");
  expect(CODE, "set OT_DEMO_CODE").not.toBe("");
  const sender = await browser.newContext();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  const op = await sender.newPage();
  op.on("dialog", (d) => d.accept());                                    // approve/revoke confirmations
  const login = await sender.request.post("/api/auth/login", { data: { code: CODE }, headers: { origin: new URL(baseURL!).origin } });
  expect(login.status(), "operator login (invitations are operator-only)").toBe(200);
  await op.goto("/sender");
  await expect(op.getByTestId("demo-family-note")).toContainText(`Family #${FAMILY}`);
  await op.getByRole("button", { name: "Pair Family Member" }).click();
  const panel = op.getByTestId("invites");
  await panel.locator("#inv-name").fill("Ana");
  await panel.getByRole("button", { name: "Invite family member" }).click();
  const linkBox = panel.getByTestId("invite-link");
  await expect(linkBox.locator(".qr img")).toBeVisible();
  const link = await linkBox.getByTestId("qr-text").inputValue();
  expect(link).toMatch(/\/join#t=[A-Za-z0-9_-]{43}$/);                  // token only in the #fragment
  await expect(panel.getByTestId("invite-status").first()).toContainText("Pending");
  await op.screenshot({ path: `${OUT}/1-sender-invite.png`, fullPage: true });

  // Recipient opens the link; never types a family number, contract or key.
  const ph = await phone.newPage();
  const serverSawToken: string[] = [];
  const token = link.split("#t=")[1];
  ph.on("request", (r) => { if (r.url().includes(token)) serverSawToken.push(r.url()); });
  await ph.goto(link);
  await expect(ph.getByText("You're invited")).toBeVisible();
  await expect(ph.getByText(/invited Ana/)).toBeVisible();
  expect(new URL(ph.url()).hash, "token stripped from the address bar").toBe("");
  await ph.getByRole("button", { name: "Create my signing key" }).click();
  await ph.locator("#devname").fill("Ana phone");
  const fp = await ph.getByTestId("join-fp").innerText();
  await ph.screenshot({ path: `${OUT}/2-phone-invitation.png`, fullPage: true });
  await ph.getByRole("button", { name: "Accept invitation" }).click();
  await expect(ph.getByTestId("join-status")).toContainText("Waiting for the sender to approve");
  expect(serverSawToken, "token never appears in any request URL").toEqual([]);
  const sk = await ph.evaluate(() => localStorage.getItem("opentab.family.sk"));
  expect(await ph.evaluate(() => localStorage.getItem("opentab.family.id"))).toBe(FAMILY);

  // Sender sees the device request with the SAME fingerprint, and explicitly approves.
  const item = panel.locator("li", { hasText: "Ana phone" }).first();
  await expect(item.getByTestId("invite-status")).toContainText("needs your approval", { timeout: 15_000 });
  await expect(item.getByTestId("invite-fp")).toHaveText(fp);
  expect(await op.content()).not.toContain(sk!);                        // private key never reaches the sender
  await op.screenshot({ path: `${OUT}/3-sender-device-request.png`, fullPage: true });
  await item.getByRole("button", { name: "Approve device" }).click();
  await expect(item.getByTestId("invite-status")).toContainText("Connected", { timeout: 90_000 });
  const regHref = await item.locator("a.txlink").first().getAttribute("href");
  console.log("register_key tx:", regHref);

  // Phone shows Connected only after the chain confirms; the wallet works without typing the family number.
  await expect(ph.getByTestId("join-status")).toContainText("Connected", { timeout: 20_000 });
  await ph.screenshot({ path: `${OUT}/4-phone-connected.png`, fullPage: true });
  await ph.getByRole("link", { name: "Open my family wallet" }).click();
  await expect(ph.getByText(`Family #${FAMILY} · this phone is authorized`)).toBeVisible({ timeout: 20_000 });
  const pairing = await ph.getByTestId("qr-text").last().inputValue();   // manual fallback code shows this phone's public key
  const pubHex = pairing.split(":")[1];
  expect((await (await sender.request.get(`/api/family/${FAMILY}?key=${pubHex}`)).json()).keyActive).toBe(true);

  // Revoke from the invitation entry.
  await item.getByRole("button", { name: "Revoke device" }).click();
  await expect(item.getByTestId("invite-status")).toContainText("Revoked", { timeout: 90_000 });
  expect((await (await sender.request.get(`/api/family/${FAMILY}?key=${pubHex}`)).json()).keyActive).toBe(false);
  await ph.goto("/join");                                                // token kept in this tab's sessionStorage
  await expect(ph.getByTestId("join-status")).toContainText(/revoked/i, { timeout: 20_000 });
  await op.screenshot({ path: `${OUT}/5-sender-revoked.png`, fullPage: true });
  await sender.close(); await phone.close();
});
