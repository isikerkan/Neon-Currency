// Renders the Chrome Web Store screenshots (1280x800) and promo tile (440x280) into store/.
// Dev-only helper, needs Playwright + Chromium:
//   PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node scripts/render-store-assets.mjs
// Mastercard rates are stubbed so the output is deterministic.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "neon-currency-shots-"));
const server = http.createServer((q, r) => { r.setHeader("content-type","text/html"); r.end(fs.readFileSync(`${REPO}/store/demo-shop.html`)); }).listen(8766);
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`],
  viewport: { width: 1280, height: 800 }
});
const usd = { USD: 1, CHF: 0.8012, EUR: 0.9123, GBP: 0.7815 };
await ctx.route("**/currency-conversions/conversion-rates**", (route) => {
  const u = new URL(route.request().url());
  const s = u.searchParams.get("transaction_currency"), t = u.searchParams.get("cardholder_billing_currency");
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { conversionRate: +(usd[t] / usd[s]).toFixed(6), fxDate: u.searchParams.get("exchange_date") } }) });
});
const isExt = (w) => w.url().startsWith("chrome-extension://");
let sw = ctx.serviceWorkers().find(isExt) || await ctx.waitForEvent("serviceworker", { predicate: isExt });
await new Promise((r) => setTimeout(r, 800));
const extBase = sw.url().replace(/\/src\/.*$/, "");
await sw.evaluate(() => chrome.storage.sync.set({ settings: { mainCurrency: "CHF", quickCurrencies: ["EUR", "USD", "GBP"], bankFeePercent: 1.5 } }));
const page = await ctx.newPage();
await page.goto("http://localhost:8766/"); await page.waitForTimeout(400);
await page.hover("#p1"); await page.waitForTimeout(1200);
await page.screenshot({ path: `${REPO}/store/screenshot-1-tooltip.png` });
await page.mouse.move(0, 0); await page.waitForTimeout(500);
await page.hover("#p2"); await page.waitForTimeout(1200);
await page.screenshot({ path: `${REPO}/store/screenshot-2-tooltip-eur.png` });

// Options page
const opt = await ctx.newPage();
await opt.setViewportSize({ width: 1280, height: 800 });
await opt.goto(`${extBase}/src/options/options.html`); await opt.waitForTimeout(500);
await opt.screenshot({ path: `${REPO}/store/screenshot-3-options.png` });

// Promo tile 440x280
const tile = await ctx.newPage();
await tile.setViewportSize({ width: 440, height: 280 });
const icon = fs.readFileSync(`${REPO}/store/icon.svg`, "utf8").replace("<svg ", '<svg style="width:128px;height:128px" ');
await tile.setContent(`<html><body style="margin:0;width:440px;height:280px;display:flex;align-items:center;gap:8px;padding:0 24px;box-sizing:border-box;background:radial-gradient(circle at 20% 30%,#1c2440,#0b0f1c);font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#e8f1ff">
${icon}<div><div style="font-size:30px;font-weight:800;letter-spacing:-.5px;background:linear-gradient(90deg,#22d3ee,#e879f9);-webkit-background-clip:text;color:transparent">Neon Currency</div>
<div style="font-size:15px;color:#9fb2d6;margin-top:6px;line-height:1.35">Hover any price.<br>See it in your card currency.</div></div></body></html>`);
await tile.screenshot({ path: `${REPO}/store/promo-tile-440x280.png` });
await ctx.close();
server.close();
fs.rmSync(PROFILE, { recursive: true, force: true });
console.log("store assets rendered");
