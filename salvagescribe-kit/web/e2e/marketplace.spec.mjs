import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { decodeLedger, readiness, correctLedger } from "../lib/platform-engine.js";
const source = JSON.parse(readFileSync("data/existing_records.json", "utf8"));
const records = source.map(l => {const ledger=decodeLedger(l);return {id:l.part_id,part_id:l.part_id,revision:1,ledger,draft:null,readiness:readiness(ledger)};});
const html=readFileSync("public/marketglass/index.html","utf8");

test("guests browse while account data and writes stay protected", async ({request, page}) => {
  const home = await request.get("/", {maxRedirects:0});
  expect(home.status()).toBe(200);
  const catalog = await request.get("/api/catalog");
  expect(catalog.status()).toBe(200);
  const publicRecords = (await catalog.json()).records;
  expect(publicRecords).toHaveLength(20);
  expect(publicRecords.every(r => r.preview && !r.owner_id && !r.draft)).toBe(true);
  for (const url of ["/api/platform", "/api/parts"]) {
    const response = await request.get(url);
    expect(response.status()).toBe(401);
  }
  const mutation = await request.post("/api/platform", {data:{action:"seed"}});
  expect(mutation.status()).toBe(401);
  await page.route("https://images.unsplash.com/**", r=>r.abort());
  await page.goto("/", {waitUntil:"domcontentloaded"});
  await expect(page.locator(".glass-card")).toHaveCount(20);
  await expect(page.locator("#inventoryNotice")).toContainText("as a guest");
  await page.locator("#searchInput").fill("MIR-004");
  await page.getByRole("button", {name:"Review evidence",exact:true}).click();
  await expect(page.locator("#assistantSubHeading")).toContainText("MIR-004");
  await page.locator('[data-tab="stage2"]').click();
  await page.locator("#field-donor_year").fill("2018");
  await page.getByRole("button", {name:"Save corrections & carry over"}).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("link",{name:"Continue as a guest"})).toBeVisible();
});

test("signup checks passwords and immediately signs in without sending email", async ({page}) => {
  await page.route("**/api/auth/config",r=>r.fulfill({json:{signupEnabled:true,emailConfirmationRequired:false}}));
  await page.goto("/login");
  await page.getByRole("button",{name:"New here? Create an account"}).click();
  await page.getByLabel("Email address").fill("test@example.com");
  await page.getByLabel("Password",{exact:true}).fill("correct-password-123");
  await page.getByLabel("Confirm password").fill("different-password");
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await expect(page.locator(".auth-error")).toContainText("Passwords do not match");
  let signupRequests=0;
  await page.route("**/auth/v1/signup**", async route => {
    signupRequests++;
    expect(route.request().url()).not.toContain("redirect_to");
    expect(route.request().postDataJSON()).not.toHaveProperty("emailRedirectTo");
    const access_token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:"00000000-0000-4000-8000-000000000001"})).toString("base64url")}.test`;
    await route.fulfill({json:{access_token,refresh_token:"test-refresh-token",expires_in:3600,token_type:"bearer",user:{id:"00000000-0000-4000-8000-000000000001",email:"test@example.com",identities:[{id:"test"}]}}});
  });
  await page.route("**/auth/v1/resend**", () => { throw new Error("No email resend should be requested"); });
  await page.route("http://localhost:3105/",r=>r.fulfill({contentType:"text/html",body:"<h1>Signed in destination</h1>"}));
  await page.getByLabel("Confirm password").fill("correct-password-123");
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Signed in destination"})).toBeVisible();
  expect(signupRequests).toBe(1);
});

test("does not send signup emails when provider confirmation is enabled",async({page})=>{
  let requests=0;
  await page.route("**/api/auth/config",r=>r.fulfill({json:{signupEnabled:true,emailConfirmationRequired:true}}));
  await page.route("**/auth/v1/signup**",r=>{requests++;return r.fulfill({json:{}});});
  await page.goto("/login");await page.getByRole("button",{name:"New here? Create an account"}).click();
  await page.getByLabel("Email address").fill("test@example.com");await page.getByLabel("Password",{exact:true}).fill("correct-password-123");await page.getByLabel("Confirm password").fill("correct-password-123");
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await expect(page.locator(".auth-error")).toContainText("browse as a guest");expect(requests).toBe(0);
});

test("email throttling offers guest browsing without retrying or resending",async({page})=>{
  let requests=0;
  await page.route("**/api/auth/config",r=>r.fulfill({json:{signupEnabled:true,emailConfirmationRequired:false}}));
  await page.route("**/auth/v1/signup**",r=>{requests++;return r.fulfill({status:429,json:{code:"over_email_send_rate_limit",msg:"email rate limit exceeded"}});});
  await page.goto("/login");await page.getByRole("button",{name:"New here? Create an account"}).click();
  await page.getByLabel("Email address").fill("test@example.com");await page.getByLabel("Password",{exact:true}).fill("correct-password-123");await page.getByLabel("Confirm password").fill("correct-password-123");
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await expect(page.locator(".auth-error")).toContainText("Continue as a guest");expect(requests).toBe(1);
  await expect(page.getByRole("button",{name:/resend/i})).toHaveCount(0);
});

test("supplied marketplace displays existing records and persists corrections",async({page})=>{
  const errors=[];page.on("pageerror",e=>errors.push(e.message));let saved;
  // Isolate account data while exercising the exact delivered HTML, CSS and JS.
  await page.route("http://localhost:3105/",route=>route.fulfill({contentType:"text/html",body:html}));
  await page.route("**/api/platform",async route=>{
    if(route.request().method()==="GET")return route.fulfill({json:{user:{id:"00000000-0000-4000-8000-000000000001",email:"seller@example.com"},records,storage:"supabase"}});
    saved=route.request().postDataJSON();const r=structuredClone(records.find(r=>r.part_id===saved.part_id));r.revision++;r.ledger=correctLedger(r.ledger,saved.changes);r.readiness=readiness(r.ledger);return route.fulfill({json:{record:r}});
  });
  await page.route("https://images.unsplash.com/**", r => r.abort());
  await page.goto("/", {waitUntil:"domcontentloaded"});await expect(page.locator(".glass-card")).toHaveCount(20);
  await page.locator("#searchInput").fill("MIR-004");await expect(page.locator(".glass-card")).toHaveCount(1);await expect(page.locator(".glass-card")).toContainText("AED 170");
  await page.getByRole("button",{name:"Review evidence",exact:true}).click();await expect(page.locator("#assistantSubHeading")).toContainText("MIR-004");
  await page.locator('[data-tab="stage2"]').click();await page.locator("#field-donor_year").fill("2018");await page.getByRole("button",{name:"Save corrections & carry over"}).click();
  await expect.poll(()=>saved?.changes?.donor_year).toBe("2018");expect(saved.revision).toBe(1);expect(saved.changes).toEqual({donor_year:"2018"});
  await page.locator('[data-tab="stage4"]').click();await expect(page.locator("#panelStage4")).toContainText("Internal operational checklist");
  await page.keyboard.press("Escape");await page.locator("#btnAnalogueTrigger").click();await expect(page.locator("#btnAnalogueTrigger")).toHaveAttribute("aria-expanded","true");await page.keyboard.press("Escape");
  await page.locator("#themeToggleBtn").click();await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:"test-results/marketplace-mobile.png",fullPage:true});expect(errors).toEqual([]);
});


test("sign-in reports rejected credentials", async ({page}) => {
  await page.route("**/auth/v1/token**", route => route.fulfill({status:400,json:{code:"invalid_credentials",msg:"Invalid login credentials"}}));
  await page.goto("/login");await page.getByLabel("Email address").fill("seller@example.com");await page.getByLabel("Password",{exact:true}).fill("invalid-password");await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.locator(".auth-error")).toContainText("Invalid login credentials");await expect(page.getByRole("button",{name:"Sign in",exact:true})).toBeEnabled();
});
