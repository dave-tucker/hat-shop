import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT  = "./screenshots";

const browser = await chromium.launch();
const ctx     = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page    = await ctx.newPage();

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`📸 ${name}.png`);
}

// 1. Home — cluster badge visible
await page.goto(BASE, { waitUntil: "networkidle" });
await shot("01-home");

// 2. Catalogue — hats from CockroachDB via catalogue service
await page.goto(`${BASE}/catalogue`, { waitUntil: "networkidle" });
await page.waitForSelector("h1");
await shot("02-catalogue");

// 3. Register
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.click("text=No account? Register");
await page.waitForSelector("input[placeholder='Ada Lovelace']");
await page.fill("input[placeholder='Ada Lovelace']", "Hat Shopper");
await page.fill("input[type='email']", "demo@hatshop.dev");
await page.fill("input[type='password']", "password123");
await shot("03-register");
await page.click("button[type='submit']");
await page.waitForTimeout(1000); // allow register to complete

// 4. Login form filled
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("input[type='email']", "demo@hatshop.dev");
await page.fill("input[type='password']", "password123");
await shot("04-login");
await page.click("button[type='submit']");
await page.waitForURL(`${BASE}/catalogue`, { timeout: 15000 });

// 5. Catalogue — logged in, add hats to cart
await page.waitForSelector("text=Add to Cart");
await shot("05-catalogue-logged-in");

// Add first two hats
const addButtons = page.locator("button", { hasText: "Add to Cart" });
await addButtons.first().click();
await page.waitForSelector("text=✓ Added!");
await page.waitForTimeout(600);
await addButtons.nth(1).click();
await page.waitForSelector("text=✓ Added!");
await page.waitForTimeout(600);
await shot("06-added-to-cart");

// 6. Cart — review
await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Your Cart");
await shot("07-cart");

// 7. Place order → redirect to orders
await page.click("text=Place Order");
await page.waitForURL(`${BASE}/orders`, { timeout: 15000 });
await page.waitForSelector("text=My Orders");

// 8. Orders — money shot: order listed with "placed on local"
await page.waitForSelector("text=placed on", { timeout: 10000 });
await shot("08-orders");

await browser.close();
console.log("\n✅ All screenshots saved to ./screenshots/");
