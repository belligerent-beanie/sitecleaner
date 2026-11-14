// The two editions (designer and consumer) are built from the same files: this checks that the consumer one leaves out what it says it does,
// and that the designer one still has all of it. Offline: node test/editions.mjs (needs a display; xvfb-run on a server).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + detail}`); if (!ok) failures++; };

const server = http.createServer((_q, res) => { res.setHeader("content-type", "text/html"); res.end("<!doctype html><title>t</title><h1 id=h>Hello</h1><p>some words</p>"); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

async function run(edition) {
  const dist = path.join(os.tmpdir(), `design-picker-edition-${edition}-${process.pid}`);
  execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--test", "--edition", edition, "--out", dist], { stdio: "ignore" });
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "design-picker-profile-"));
  const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--window-size=1280,900"] });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
    await worker.evaluate(() => chrome.storage.local.set({ "dz-tour": "any", "dz-prefs": {} }));
    const page = await context.newPage();
    await page.goto(url);
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/*" }); await toggle(tab); });
    await page.locator(".dz-toggle.dz-on").waitFor({ timeout: 8000 });
    await page.keyboard.press("Escape");   // close the tutorial if it opened
    const dock = async () => (await page.locator(".dz-dock").innerText());
    const links = { find: "Find", inspector: "Inspect", compare: "Compare", preview: "Preview" };
    const head = await page.locator(".dz-head").innerText();
    const wanted = edition === "designer";
    for (const [feature, text] of Object.entries(links)) {
      check(`${edition}: the ${text} link is ${wanted ? "there" : "left out"}`, new RegExp(`\\b${text}\\b`).test(head) === wanted, head.replace(/\n/g, " "));
    }
    check(`${edition}: undo, Changes and Keys are always there`, /Changes/.test(head) && /Keys/.test(head) && /Undo/i.test(head), head.replace(/\n/g, " "));
    await page.keyboard.press("/");
    check(`${edition}: the / key ${wanted ? "opens" : "does not open"} Find`, (await page.locator(".dz-find").count()) === (wanted ? 1 : 0));
    await page.keyboard.press("Escape");
    await page.keyboard.press("?");
    const keys = await dock();
    check(`${edition}: the shortcut list ${wanted ? "has" : "leaves out"} the export key`, /Alt Shift E/.test(keys) === wanted, keys.replace(/\n/g, " ").slice(0, 200));
    check(`${edition}: the shortcut list always has undo`, /Ctrl Z/.test(keys));
    await page.keyboard.press("Escape");
    await page.locator("#h").click();
    check(`${edition}: an element can be selected and edited either way`, /Fill/.test(await page.locator(".dz-dock").innerText()) || (await page.keyboard.press("Enter"), /Fill/.test(await page.locator(".dz-dock").innerText())));
    check(`${edition}: the manifest is named for the edition`, manifest.name === (wanted ? "SiteCleaner" : "SiteCleaner Personal"), manifest.name);
  } finally { await context.close(); }
}
try { await run("designer"); await run("consumer"); } finally { server.close(); }
console.log(failures ? `${failures} check(s) failed.` : "All edition checks passed.");
process.exit(failures ? 1 : 0);
