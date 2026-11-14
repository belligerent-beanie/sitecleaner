// Makes the Chrome Web Store small promo tile (440 x 280) from the extension's own icon.   node scripts/promo-tile.mjs
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(path.join(root, "package.json"))("playwright");
const dist = path.join(os.tmpdir(), "dp-tile-" + process.pid);
execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--out", dist], { stdio: "ignore" });
const icon = fs.readFileSync(path.join(dist, "icons", "128.png")).toString("base64");
const html = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: 440px; height: 280px; }
  body { background: linear-gradient(135deg, #2c3aa3, #3546be 60%, #4a5ad6); color: #fff; font-family: system-ui, "Segoe UI", sans-serif; display: flex; align-items: center; gap: 22px; padding: 0 32px; box-sizing: border-box; }
  img { width: 104px; height: 104px; border-radius: 22px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); }
  h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.1; letter-spacing: -0.5px; }
  p { margin: 0; font-size: 16px; line-height: 1.35; color: #dfe3ff; }
</style><img src="data:image/png;base64,${icon}" alt=""><div><h1>SiteCleaner</h1><p>Restyle any page, undo it all, and hand the changes over.</p></div>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 280 } });
await page.setContent(html);
const target = path.join(root, "store", "promo-tile-440x280.png");
await page.screenshot({ path: target });
await browser.close();
fs.rmSync(dist, { recursive: true, force: true });
console.log("wrote", path.relative(root, target));
