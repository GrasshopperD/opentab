// API responses are mocked: no financial mutations or Testnet transactions during browser QA.
import { expect, test, type Page } from "@playwright/test";
const HASH = "a".repeat(64);
const family = { family: { balance:"300000000",total_deposited:"400000000",total_paid:"100000000",total_withdrawn:"0" }, payments: [] };
async function mock(page: Page, authorized = true, enabled = true) {
  const posts: { path: string; body: unknown }[] = [];
  await page.route("**/api/**", async route => {
    const r=route.request(), path=new URL(r.url()).pathname;
    if(r.method()==="POST") posts.push({path,body:r.postDataJSON()});
    const data=path==="/api/auth/status" ? {authorized,enabled} : path==="/api/auth/login" ? {authorized:true} : path==="/api/auth/logout" ? {authorized:false} : path.startsWith("/api/family/") ? {...family,keyActive:false} : path==="/api/sender/family" ? {familyId:"43",depositStatus:"CONFIRMED",depositTx:HASH} : {status:"CONFIRMED",hash:HASH};
    await route.fulfill({json:data});
  });
  return posts;
}
async function choose(page: Page) {
  await page.getByRole("button",{name:"Choose a family",exact:true}).click();
  await page.getByLabel("Family number",{exact:true}).fill("42");
  await page.getByRole("button",{name:"Choose",exact:true}).click();
  await expect(page.locator(".dash-amount")).toContainText("30.00");
}
const nav=(page:Page,name:string)=>page.getByRole("navigation",{name:"Dashboard navigation"}).getByRole("button",{name,exact:true});

test("OpenTab browser branding and empty dashboard stay honest",async({page})=>{
  const posts=await mock(page,false,false);await page.goto("/dashboard");
  await expect(page).toHaveTitle("OpenTab");
  await expect(page.locator("link[rel=icon]")).toHaveAttribute("href","/icon.svg?v=opentab");
  await expect(page.locator(".dash-amount")).toContainText("—");
  await expect(page.getByRole("heading",{name:"No purchases yet"})).toBeVisible();
  await nav(page,"Add money").click();await page.getByRole("button",{name:"Continue",exact:true}).click();
  await expect(page.getByRole("button",{name:"Confirm and add"})).toBeDisabled();
  expect(posts).toEqual([]);
});

test("adding funds reviews exact existing API payload and guards double submission",async({page})=>{
  const posts=await mock(page);await page.goto("/dashboard");await choose(page);
  await nav(page,"Add money").click();await page.getByLabel("How much would you like to add?").fill("12.5");
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  expect(posts).toEqual([]);await expect(page.getByRole("heading",{name:"Ready to add?"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Confirm and add"})).toBeEnabled();
  await page.getByRole("button",{name:"Confirm and add"}).evaluate(e=>{(e as HTMLButtonElement).click();(e as HTMLButtonElement).click();});
  await expect(page.getByRole("status")).toContainText("12.5 Demo USD added");
  expect(posts).toEqual([{path:"/api/sender/deposit",body:{familyId:"42",amount:"12.5"}}]);
});

test("creating a family uses the original create-and-fund endpoint",async({page})=>{
  const posts=await mock(page);await page.goto("/dashboard");await nav(page,"Add money").click();
  await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByRole("button",{name:"Confirm and add"}).click();
  await expect(page.getByRole("status")).toContainText("Your family is ready");
  expect(posts).toEqual([{path:"/api/sender/family",body:{amount:"10"}}]);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("opentab.sender.families")||"[]"))).toContain("43");
});

test("pending funding survives reload and status checks never resubmit",async({page})=>{
  const posts=await mock(page);
  await page.route("**/api/sender/deposit",async route=>{posts.push({path:"/api/sender/deposit",body:route.request().postDataJSON()});await route.fulfill({json:{status:"PENDING",hash:HASH}});});
  await page.goto("/dashboard");await choose(page);await nav(page,"Add money").click();await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByRole("button",{name:"Confirm and add"}).click();
  await expect(page.getByRole("heading",{name:"Waiting for confirmation"})).toBeVisible();
  // The journal appears before the POST resolves; wait for its returned hash before testing reconciliation.
  await expect(page.getByRole("link",{name:"View request",exact:false})).toBeVisible();
  await page.reload();await expect(page.getByRole("heading",{name:"Waiting for confirmation"})).toBeVisible();
  await nav(page,"Add money").click();await expect(page.getByRole("button",{name:"Continue",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Check status",exact:true}).click();await expect(page.getByRole("status")).toContainText("10 Demo USD added");
  expect(posts).toHaveLength(1);
});

test("unconfirmed family creation is never shown as successful funding",async({page})=>{
  await mock(page);await page.addInitScript(()=>localStorage.setItem("opentab.sender.families",'["42"]'));
  await page.route("**/api/sender/family",route=>route.fulfill({json:{step:"create_family",status:"PENDING",hash:HASH}}));
  await page.goto("/dashboard");await nav(page,"Add money").click();await page.getByRole("button",{name:"Start a new family instead"}).click();
  await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByRole("button",{name:"Confirm and add"}).click();
  await expect(page.getByRole("heading",{name:"Waiting for confirmation"})).toBeVisible();await page.getByRole("button",{name:"Check status",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("funding has not been confirmed");
  await expect(page.getByText("Your family is ready. Demo funds have been added.",{exact:true})).toHaveCount(0);
});

test("phone pairing uses the same public key payload only after review",async({page})=>{
  const posts=await mock(page);await page.goto("/dashboard");await choose(page);await nav(page,"Family").click();
  await page.getByText("Paste code instead",{exact:true}).click();await page.getByPlaceholder("OTI1:… / OTA1:… / OTK1:…").fill(`OTK1:${"ab".repeat(32)}:Ana`);await page.getByRole("button",{name:"Use pasted code"}).click();
  await page.getByRole("button",{name:"Connect phone",exact:true}).click();expect(posts).toEqual([]);
  await page.getByRole("button",{name:"Confirm connection",exact:true}).click();await expect(page.getByRole("status")).toContainText("Phone connected");
  expect(posts).toEqual([{path:"/api/sender/key",body:{familyId:"42",publicKey:"ab".repeat(32),action:"register"}}]);
});

test("demo access uses existing login and logout endpoints",async({page})=>{
  const posts=await mock(page,false);await page.goto("/dashboard");await page.getByRole("button",{name:"Demo access",exact:true}).click();
  await page.getByLabel("Access code",{exact:true}).fill("test-access-only");await page.getByRole("button",{name:"Unlock demo",exact:true}).click();
  await page.getByRole("button",{name:"Demo access",exact:true}).click();await expect(page.getByText("Demo access is active on this browser.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Sign out",exact:true}).click();expect(posts).toEqual([{path:"/api/auth/login",body:{code:"test-access-only"}},{path:"/api/auth/logout",body:{}}]);
  expect(await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage))).not.toContain("test-access-only");
});

for(const width of [320,390,768,1440]) test(`dashboard and money review fit ${width}px`,async({page})=>{
  await mock(page);await page.setViewportSize({width,height:1000});await page.goto("/dashboard");await choose(page);
  for(const name of ["Overview","Family","Activity","Add money"]){await nav(page,name).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0);}
  await page.getByRole("button",{name:"Continue",exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({path:test.info().outputPath(`money-review-${width}.png`)});
});

test("invalid amounts never reach the funding endpoint",async({page})=>{
  const posts=await mock(page);await page.goto("/dashboard");await nav(page,"Add money").click();
  for(const amount of ["0","-1","51","1.00000001","nope"]){
    await page.getByLabel("How much would you like to add?").fill(amount);await page.getByRole("button",{name:"Continue",exact:true}).click();
    await expect(page.locator(".dash-notice.error")).toContainText("Enter an amount greater than 0");
    await expect(page.getByRole("button",{name:"Confirm and add"})).toHaveCount(0);
  }
  expect(posts).toEqual([]);
});

test("a lost funding response stays unresolved after reload",async({page})=>{
  const posts=await mock(page);await page.route("**/api/sender/family",async route=>{posts.push({path:"/api/sender/family",body:route.request().postDataJSON()});await route.abort("failed");});
  await page.goto("/dashboard");await nav(page,"Add money").click();await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByRole("button",{name:"Confirm and add"}).click();
  await expect(page.getByRole("heading",{name:"Waiting for confirmation"})).toBeVisible();await page.reload();
  await expect(page.getByRole("heading",{name:"Waiting for confirmation"})).toBeVisible();await nav(page,"Add money").click();await expect(page.getByRole("button",{name:"Continue",exact:true})).toBeDisabled();expect(posts).toHaveLength(1);
});

test("activity shows only returned purchases and stale balances clear on read errors",async({page})=>{
  await mock(page);await page.route("**/api/family/42",route=>route.fulfill({json:{...family,payments:[{txHash:HASH,invoiceId:"one",amount:"50000000",merchant:"unknown",at:"2026-11-12T12:00:00Z",terminalId:"1"}]}}));
  await page.goto("/dashboard");await choose(page);await nav(page,"Activity").click();await expect(page.locator(".dash-purchases li")).toHaveCount(1);await expect(page.locator(".dash-purchases")).toContainText("5.00");
  await page.route("**/api/family/42",route=>route.fulfill({json:{error:"NetworkError"}}));await nav(page,"Overview").click();await page.getByRole("button",{name:"Refresh balance",exact:true}).click();await expect(page.locator(".dash-amount")).toContainText("—");await expect(page.locator(".dash-notice.error")).toBeVisible();
});

test("a failed pending request clears the wait without showing success",async({page})=>{
  await mock(page);await page.addInitScript(hash=>sessionStorage.setItem("opentab.dashboard.pending",JSON.stringify({kind:"deposit",familyId:"42",amount:"10",hash})),HASH);
  await page.route(`**/api/tx/${HASH}`,route=>route.fulfill({json:{status:"FAILED",error:"Transaction failed on chain",hash:HASH}}));
  await page.goto("/dashboard");await page.getByRole("button",{name:"Check status",exact:true}).click();
  await expect(page.locator(".dash-notice.error")).toContainText("The request failed");await expect(page.getByRole("heading",{name:"Waiting for confirmation"})).toHaveCount(0);
  expect(await page.evaluate(()=>sessionStorage.getItem("opentab.dashboard.pending"))).toBeNull();
});

test("minimal funding flow keeps its destination above the card and waits two seconds on every review",async({page})=>{
  const posts=await mock(page);await page.goto("/dashboard");
  await expect(page.locator(".dash-topbar,.dash-test-note,.dash-page-heading p,.dash-connect-card p")).toHaveCount(0);
  await nav(page,"Add money").click();
  const familyBox=await page.locator(".dash-money-family").boundingBox(), cardBox=await page.locator(".dash-money").boundingBox();
  expect(familyBox!.y+familyBox!.height).toBeLessThan(cardBox!.y);
  for(let attempt=0;attempt<2;attempt++){
    const started=Date.now();await page.getByRole("button",{name:"Continue",exact:true}).click();
    const confirm=page.getByRole("button",{name:"Confirm and add",exact:true});
    await expect(confirm).toBeDisabled();await confirm.evaluate(e=>(e as HTMLButtonElement).click());expect(posts).toEqual([]);
    await expect(confirm).toBeEnabled();expect(Date.now()-started).toBeGreaterThanOrEqual(1950);
    await expect(page.locator(".dash-review-details dt")).toHaveText(["To"]);
    if(attempt===0){await page.getByRole("button",{name:"Back to amount",exact:true}).click();await page.getByLabel("How much would you like to add?").fill("20");}
  }
});
