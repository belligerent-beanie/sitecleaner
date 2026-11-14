// Tries the extension on real websites, where nothing was written to suit it: strict content security policies, web components,
// single-page apps, ads, odd layouts.   node scripts/smoke-real-sites.mjs [url ...]
// Needs the network, so it is not part of the end-to-end test (which must pass offline). For each site it turns the picker on, selects
// a heading, restyles it, selects a paragraph, removes it and takes it back, and reads the export; it reports each step and any error the page raised.
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(path.join(root, "package.json"))("playwright");
const SITES = process.argv.slice(2).length ? process.argv.slice(2) : [
  "https://example.com/",
  "https://en.wikipedia.org/wiki/Web_design",
  "https://news.ycombinator.com/",
  "https://developer.mozilla.org/en-US/docs/Web/CSS/color",   // web components, a strict CSP
  "https://github.com/microsoft/vscode",                      // a single-page app, a strict CSP
  "https://www.bbc.com/news",
];

const dist = path.join(os.tmpdir(), "dp-smoke-" + process.pid);
execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--test", "--out", dist], { stdio: "ignore" });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dp-smoke-profile-"));
const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--window-size=1366,900"] });
const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
const report = [];
async function runSite(site) {
  await worker.evaluate(() => chrome.storage.local.clear());   // nothing saved by an earlier attempt on this page
  const steps = [];
  const errors = [];
  const step = async (name, run) => { try { const result = await run(); steps.push({ name, ok: result !== false }); return result; } catch (error) { steps.push({ name, ok: false, why: error.message.split("\n")[0].slice(0, 90) }); return false; } };
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 100)));
  try {
    await page.goto(site, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(2500);
  } catch (error) { await page.close(); return { site, steps: [{ name: "load the page", ok: false, why: error.message.split("\n")[0].slice(0, 90) }], errors }; }
  await page.bringToFront();
  await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
  const ready = await step("the picker appears", async () => { await page.locator(".dz-toggle").waitFor({ timeout: 8000 }); return true; });
  if (ready === false) { await page.close(); return { site, steps, errors }; }
  await page.keyboard.press("Escape");
  let heading = page.locator("body");   // the first visible heading, level 1 to 3; a link only when the page has no headings at all (a skip link would be unclickable)
  for (const selector of ["h1:visible", "h2:visible", "h3:visible", "a:visible"]) { if (await page.locator(selector).count()) { heading = page.locator(selector).first(); break; } }
  await step("select a heading (or a link) by clicking it", async () => { await heading.scrollIntoViewIfNeeded({ timeout: 6000 }); await heading.click({ timeout: 6000 }); return (await page.locator(".dz-head strong").first().innerText()) !== "SiteCleaner"; });
  await step("restyle it (fill from the page's own colours)", async () => {
    await page.keyboard.press("Enter");
    await page.locator(".dz-dock button:text-is('Fill')").click({ timeout: 5000 });
    await page.locator(".dz-chip").first().click({ timeout: 5000 });
    return /Changes \(1\)/.test(await page.locator(".dz-dock .dz-head").innerText());
  });
  await step("the contrast readout appears (or the element has no text)", async () => { const readout = page.locator(".dz-contrast"); return (await readout.count()) === 0 || (await readout.isHidden()) || /Contrast \d|cannot be measured/.test(await readout.innerText({ timeout: 3000 })); });
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  // "css:light=" does not look inside shadow roots, so the picker's own paragraphs are not counted as the page's
  const paragraph = page.locator("css:light=p:visible").first();
  const before = await page.locator("css:light=p").count();
  if (before) await step("select a paragraph and delete it", async () => { await paragraph.scrollIntoViewIfNeeded(); await paragraph.click({ timeout: 6000 }); await page.keyboard.press("Delete"); return (await page.locator("css:light=p").count()) === before - 1; });
  if (before) await step("Ctrl+Z puts it back", async () => { await page.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); }); await page.keyboard.press("Control+z"); return (await page.locator("css:light=p").count()) === before; });
  await step("the export lists the change", async () => { await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.locator(".dz-dock .dz-head button:text-matches('Changes')").click({ timeout: 4000 }); return /background-color: .* → /.test(await page.locator(".dz-preview").innerText({ timeout: 3000 })); });
  await step("the inspector says what is under the pointer", async () => { await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("i"); await heading.hover({ timeout: 4000 }); const tip = await page.locator(".dz-tip").innerText({ timeout: 3000 }); await page.keyboard.press("i"); return tip.length > 10; });
  await page.close();
  return { site, steps, errors };
}
for (const site of SITES) {
  let entry = await runSite(site);
  if (entry.steps.some((step) => !step.ok)) { entry = await runSite(site); entry.retried = true; }   // one more try before calling it broken
  report.push(entry);
}
await context.close();
fs.rmSync(dist, { recursive: true, force: true });
fs.rmSync(profile, { recursive: true, force: true });

let failed = 0;
for (const { site, steps, errors, retried } of report) {
  console.log(`\n${site}${retried ? "  (second attempt)" : ""}`);
  for (const { name, ok, why } of steps) { if (!ok) failed++; console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : "  -> " + (why || "did not hold")}`); }
  if (errors.length) console.log(`  (the page itself raised ${errors.length} error${errors.length > 1 ? "s" : ""}, e.g. ${JSON.stringify(errors[0])})`);
}
console.log(`\n${failed ? failed + " step(s) did not hold" : "every step held on every site"}.`);
process.exit(failed ? 1 : 0);
