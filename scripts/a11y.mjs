// Audits the picker's own dock with axe-core: every tool panel, the guide, Find, Keys, Changes and Preview.   node scripts/a11y.mjs
// The picker is a tool for checking accessibility, so it should pass the same check. Exits 1 if axe finds a violation.
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { chromium } = require("playwright");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title></head><body style="font-family:sans-serif">
<main><h1>Hello there</h1><p class="lead">Some words to select.</p><a class="cta" href="#x">A link</a></main></body></html>`;
const server = http.createServer((req, res) => { res.setHeader("Content-Type", "text/html"); res.end(PAGE); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const dist = path.join(os.tmpdir(), "dp-a11y-" + process.pid);
execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--test", "--out", dist], { stdio: "ignore" });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dp-a11y-profile-"));
const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--window-size=1280,900"] });
const found = new Map();   // "rule | panel" -> detail
let audits = 0;
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();
  await page.evaluate(axeSource);
  await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
  await page.locator(".dz-toggle").waitFor({ timeout: 8000 });
  const audit = async (panel) => {
    audits++;
    const result = await page.evaluate(async () => {
      const host = document.getElementById("design-picker-extension-root");
      const r = await axe.run(host, { resultTypes: ["violations"] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 120) + " :: " + (n.failureSummary || "").split("\n")[1]) }));
    });
    for (const v of result) found.set(`${v.id} | ${panel}`, v);
  };
  await audit("the first-time tutorial");
  await page.keyboard.press("Escape");
  await page.locator(".dz-dock button:text-is('Close')").click().catch(() => {});
  const setTheme = (name) => page.evaluate((value) => document.getElementById("design-picker-extension-root").shadowRoot.querySelector(".dz-root").setAttribute("data-theme", value), name);
  for (const look of ["dark", "light"]) {
    await setTheme(look);
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await page.locator(".dz-dock .dz-tutorial").click();
    for (let n = 1; n <= 9; n++) { await page.locator(`.dz-step:text-is('${n}')`).click(); await audit(`${look}: tutorial page ${n}`); }
    await page.keyboard.press("Escape");
    await audit(look + ": nothing selected");
    await page.locator(".lead").click();
    await page.keyboard.press("Enter");
    await audit(look + ": the tools");
    for (const tool of ["Fill", "Border", "Shadow", "Radius", "Tone", "Text", "Font", "Image", "Size", "Spacing", "Layout", "Position", "Move"]) {
      const button = page.locator(`.dz-tools > .dz-menu:not(.dz-states) button:text-is('${tool}')`);
      if (await button.isDisabled().catch(() => true)) continue;
      await button.click();
      await audit(`${look}: the ${tool} tool`);
      await button.click();   // closes it
    }
    await page.locator(".dz-states button:text-is('hover')").click();
    await audit(look + ": the hover state");
    await page.locator(".dz-states button:text-is('normal')").click();
    await page.locator(".dz-dock button:text-is('Fill')").click();
    await page.locator(".dz-chip").first().click();
    for (const link of ["Changes", "Keys", "Find", "Preview"]) {
      const button = page.locator(`.dz-dock .dz-head button:text-matches('^${link}')`);
      await button.click();
      await audit(`${look}: the ${link} panel`);
      await button.click();
    }
  }
} finally {
  await context.close();
  server.close();
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log(`${audits} audits of the dock`);
for (const [key, v] of found) console.log(`\n${v.impact.toUpperCase()}  ${key}\n  ${v.help}\n${v.nodes.map((n) => "  - " + n).join("\n")}`);
console.log(found.size ? `\n${found.size} violation(s).` : "\nNo violations.");
process.exit(found.size ? 1 : 0);
