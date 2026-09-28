// Renders store/icon*.svg into the PNG icons referenced by manifest.json.
// Dev-only helper: `node scripts/render-icons.mjs` (needs Playwright + Chromium).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const targets = [
  { svg: "store/icon-small.svg", size: 16 },
  { svg: "store/icon-small.svg", size: 32 },
  { svg: "store/icon.svg", size: 48 },
  { svg: "store/icon.svg", size: 128 }
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const { svg, size } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const markup = readFileSync(root + svg, "utf8").replace("<svg ", `<svg style="width:${size}px;height:${size}px;display:block" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.screenshot({ path: `${root}src/assets/icons/icon-${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("icons rendered");
