import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { decodeLedger, readiness, correctLedger } from "../lib/platform-engine.js";
import { marketplaceRecords } from "../lib/marketplace-catalog.js";
const supplied = JSON.parse(readFileSync("data/marketplace_listings.json", "utf8"));
const records = marketplaceRecords().map(r => ({...r, id:r.part_id, revision:1, preview:false}));
const html=readFileSync("public/marketglass/index.html","utf8");

test("guests browse while account data and writes stay protected", async ({request, page}) => {
  const home = await request.get("/", {maxRedirects:0});
  expect(home.status()).toBe(200);
  const catalog = await request.get("/api/catalog");
  expect(catalog.status()).toBe(200);
  const publicRecords = (await catalog.json()).records;
  expect(publicRecords).toHaveLength(10);
  expect(publicRecords.every(r => r.preview && !r.owner_id && !r.draft)).toBe(true);
  for (const url of ["/api/platform", "/api/parts"]) {
    const response = await request.get(url);
    expect(response.status()).toBe(401);
  }
  const mutation = await request.post("/api/platform", {data:{action:"seed"}});
  expect(mutation.status()).toBe(401);
  await page.route("https://images.unsplash.com/**", r=>r.abort());
  await page.goto("/", {waitUntil:"domcontentloaded"});
  await expect(page.locator(".glass-card")).toHaveCount(10);
  await expect(page.locator("#inventoryNotice")).toContainText("as a guest");
  await page.locator("#searchInput").fill("87910-02G90");
  await page.getByRole("button", {name:"Review evidence",exact:true}).click();
  await expect(page.locator("#assistantSubHeading")).toContainText("SALVAGE-1");
  await page.locator('[data-tab="stage2"]').click();
  await page.locator("#field-donor_year").fill("2017");
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
  await page.goto("/", {waitUntil:"domcontentloaded"});await expect(page.locator(".glass-card")).toHaveCount(10);
  await page.locator("#searchInput").fill("87910-02G90");await expect(page.locator(".glass-card")).toHaveCount(1);await expect(page.locator(".glass-card")).toContainText("AED 310");
  await page.getByRole("button",{name:"Review evidence",exact:true}).click();await expect(page.locator("#assistantSubHeading")).toContainText("SALVAGE-1");
  await page.locator('[data-tab="stage2"]').click();await page.locator("#field-donor_year").fill("2017");await page.getByRole("button",{name:"Save corrections & carry over"}).click();
  await expect.poll(()=>saved?.changes?.donor_year).toBe("2017");expect(saved.revision).toBe(1);expect(saved.changes).toEqual({donor_year:"2017"});
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


test("all inventory thumbnails load in grid and list views, with a broken-image fallback", async ({page}) => {
  await page.route("https://images.unsplash.com/**", r => r.abort());
  // Simulate an unavailable original thumbnail while using real local assets.
  await page.route("**/marketglass/images/salvage-2.jpg", r => r.abort());
  await page.goto("/", {waitUntil:"domcontentloaded"});
  await expect(page.locator("#listingsContainer .card-img")).toHaveCount(10);
  const loadedImages = () => page.locator("#listingsContainer .card-img").evaluateAll(images => {
    images.forEach(img => img.loading = "eager");
    return images.filter(img => img.complete && img.naturalWidth > 0).length;
  });
  await expect.poll(loadedImages).toBe(10);
  await expect(page.locator('.card-img[alt*="SALVAGE-2"]')).toHaveAttribute("data-fallback-applied", "true");
  await page.locator("#layoutBtnList").click();
  await expect.poll(loadedImages).toBe(10);
  await page.locator("#layoutBtnBox").click();
  await page.locator("#searchInput").fill("87910-02G90");
  await expect.poll(loadedImages).toBe(1);
  await page.getByRole("button",{name:"Review evidence",exact:true}).click();
  await expect.poll(() => page.locator(".record-thumbnail img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.keyboard.press("Escape");
  await page.locator(".glass-card [data-chat]").click();
  await expect.poll(() => page.locator("#anchorThumb").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
});


test("each supplied listing keeps its exact title, price, category and thumbnail", async ({page,request}) => {
  const response=await request.get("/api/catalog");
  const {records:catalog}=await response.json();
  expect(catalog.map(r=>r.listing)).toEqual(supplied);
  await page.route("https://images.unsplash.com/**",r=>r.abort());
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await expect(page.locator(".glass-card")).toHaveCount(supplied.length);
  for (const item of supplied) {
    const card=page.locator(`[data-listing-id="${item.id}"]`);
    await expect(card.locator(".card-title")).toHaveText(item.title);
    await expect(card.locator(".card-price")).toHaveText(`AED ${item.price.toLocaleString()}`);
    await expect(card.locator(".card-img")).toHaveAttribute("src",`/marketglass/images/${item.id}.jpg`);
    await expect(card.locator(".card-img")).toHaveAttribute("data-thumbnail-source",item.imageUrl);
  }
  for(const category of ["mirrors","lights","body"]) {
    await page.locator(`.chip[data-category="${category}"]`).click();
    await expect(page.locator(".glass-card")).toHaveCount(supplied.filter(r=>r.category===category).length);
  }
});

test("an existing account still sees the supplied catalog instead of the old demo",async({page})=>{
  const legacy=JSON.parse(readFileSync("data/existing_records.json","utf8")).map(ledger=>({part_id:ledger.part_id,ledger}));
  await page.route("**/api/platform",route=>route.fulfill({json:{user:{id:"test-account",email:"seller@example.com"},records:legacy,storage:"supabase"}}));
  await page.route("https://images.unsplash.com/**",r=>r.abort());
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await expect(page.locator(".glass-card")).toHaveCount(10);
  await expect(page.locator('[data-listing-id="salvage-2"] .card-title')).toHaveText(supplied[1].title);
  await expect(page.locator("#importExisting")).toBeVisible();
});
