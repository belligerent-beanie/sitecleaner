// "Keep on this site" (the consumer edition): edits are kept as CSS rules and put back by the small loader, with no picker on the page.
// Offline: node test/keep.mjs (needs a display; xvfb-run on a server). The test build is given every site up front, so no permission window opens here;
// the window itself is a click on a Chrome permission and is tried by hand.
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

const CSS = ".tile { background: #eeeeee; } main .tile { color: #111111; padding: 4px; } .hide { display: none; }";
const PAGES = {
  "/": `<!doctype html><title>site</title><style>${CSS}</style><main><div class="tile">one</div><div class="tile">two</div><div class="tile">three</div><p id="gone-el">Delete me</p><p id="words">Original words</p></main>`,
  "/other": `<!doctype html><title>other</title><style>${CSS}</style><main><div class="tile">one</div><div class="tile">two</div><div class="tile">three</div><p id="gone-el">Delete me</p><p id="words">Original words</p></main>`,
  "/changed-words": `<!doctype html><title>moved on</title><style>${CSS}</style><main><div class="tile">one</div><p id="gone-el">Delete me</p><p id="words">Something else entirely</p></main>`,
  "/gone": `<!doctype html><title>changed</title><style>${CSS}</style><main><p>the site was redesigned</p></main>`,
};
const server = http.createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end(PAGES[req.url.split("?")[0]] || PAGES["/"]); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const dist = path.join(os.tmpdir(), "design-picker-keep-" + process.pid);
execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--test", "--edition", "consumer", "--out", dist], { stdio: "ignore" });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "design-picker-profile-"));
const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--window-size=1280,900"] });
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  await worker.evaluate(() => chrome.storage.local.set({ "dz-tour": "any", "dz-prefs": {} }));
  const key = "site:" + base;
  const entry = () => worker.evaluate(async (k) => (await chrome.storage.local.get(k))[k] || null, key);
  const registered = () => worker.evaluate(async (id) => (await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length, "site-" + base);
  const tileColour = (p) => p.evaluate(() => getComputedStyle(document.querySelector(".tile")).backgroundColor);

  // ---- restyle three tiles in the picker, then keep
  const page = await context.newPage();
  await page.goto(base + "/");
  await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/*" }); await toggle(tab); });
  await page.locator(".dz-toggle.dz-on").waitFor({ timeout: 8000 });
  await page.keyboard.press("Escape");
  await page.locator(".tile").nth(0).click();
  await page.locator(".tile").nth(1).click({ modifiers: ["Shift"] });
  await page.locator(".tile").nth(2).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Enter");
  await page.locator(".dz-dock button:text-is('Fill')").click();
  await page.locator(".dz-hex").fill("#cc3333");
  check("the Keep button is there", (await page.locator(".dz-head button:text-is('Keep')").count()) === 1);
  await page.locator(".dz-head button:text-is('Keep')").click();
  await page.waitForFunction(() => /Kept on/.test(document.getElementById("design-picker-extension-root").shadowRoot.textContent), null, { timeout: 8000 });
  const saved = await entry();
  check("the changes are kept as rules for this site", !!saved && saved.enabled && saved.rules.length === 1, JSON.stringify(saved));
  check("three tiles changed alike are one rule on their shared class", saved && saved.rules[0].b === "div.tile", saved && saved.rules[0].b);
  check("the rule beats the site's own CSS (important)", saved && /background-color:(#cc3333|rgb\(204, 51, 51\)) !important/.test(saved.rules[0].d), saved && saved.rules[0].d);
  check("the loader is registered for this site only", (await registered()) === 1);

  // ---- a new page of the same site: the colour is there at once, and the picker is not
  const fresh = await context.newPage();
  await fresh.goto(base + "/other");
  check("another page of the site has the change without the picker", (await tileColour(fresh)) === "rgb(204, 51, 51)", await tileColour(fresh));
  check("no picker was put on that page", (await fresh.locator("#design-picker-extension-root").count()) === 0);
  check("the site's other styles are untouched", (await fresh.evaluate(() => getComputedStyle(document.querySelector(".tile")).color)) === "rgb(17, 17, 17)");

  // ---- a page where the rules match nothing is reported, not hidden
  const gone = await context.newPage();
  await gone.goto(base + "/gone");
  let stale = [];
  for (let i = 0; i < 40 && !stale.length; i++) { await gone.waitForTimeout(250); stale = ((await entry()) || {}).stale || []; }
  check("rules that match nothing on a page are recorded as stale", stale.length === 1 && stale[0] === "div.tile", JSON.stringify(stale));
  check("and the toolbar badge says so", (await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/gone" }); return chrome.action.getBadgeText({ tabId: tab.id }); })) === "!");

  // ---- switched off: the site is as it was, and the loader is gone; switched on again: it is back
  await worker.evaluate(async (k) => { const all = await chrome.storage.local.get(k); await chrome.storage.local.set({ [k]: { ...all[k], enabled: false } }); await syncSite(new URL(k.slice(5)).origin); }, key);
  check("switched off, the loader is unregistered", (await registered()) === 0);
  const off = await context.newPage();
  await off.goto(base + "/other");
  check("and the site looks as it did", (await tileColour(off)) === "rgb(238, 238, 238)", await tileColour(off));
  await worker.evaluate(async (k) => { const all = await chrome.storage.local.get(k); await chrome.storage.local.set({ [k]: { ...all[k], enabled: true } }); await syncSite(new URL(k.slice(5)).origin); }, key);
  const on = await context.newPage();
  await on.goto(base + "/other");
  check("switched on again, the change is back", (await tileColour(on)) === "rgb(204, 51, 51)", await tileColour(on));

  // ---- keeping again adds to what was kept
  await page.locator(".dz-head button:text-is('Keep')").click();
  await page.waitForTimeout(500);
  check("keeping the same changes again does not duplicate rules", ((await entry()) || {}).rules.length === 1);

  // ---- deleting an element and retyping text are kept too
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.locator("#gone-el").click();
  await page.keyboard.press("Delete");
  await page.locator("#words").dblclick();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Brand new words");
  await page.keyboard.press("Escape");
  await page.locator(".dz-head button:text-is('Keep')").click();
  await page.waitForFunction(() => /Kept on/.test(document.getElementById("design-picker-extension-root").shadowRoot.textContent), null, { timeout: 8000 });
  const more = await entry();
  check("deleting an element is kept as a rule that hides it", more.rules.some((r) => r.b === "p#gone-el" && /display:none !important/.test(r.d)), JSON.stringify(more.rules));
  check("retyped text is kept with what it replaced", more.rules.some((r) => r.k === "text" && r.from === "Original words" && r.to === "Brand new words"), JSON.stringify(more.rules));
  const again = await context.newPage();
  await again.goto(base + "/other");
  check("on another page the deleted element is hidden", (await again.evaluate(() => getComputedStyle(document.getElementById("gone-el")).display)) === "none");
  await again.waitForFunction(() => document.getElementById("words").textContent === "Brand new words", null, { timeout: 4000 }).catch(() => {});
  check("and the retyped text is there", (await again.evaluate(() => document.getElementById("words").textContent)) === "Brand new words");
  const moved = await context.newPage();
  await moved.goto(base + "/changed-words");
  await moved.waitForTimeout(600);
  check("text the page has since changed is left alone", (await moved.evaluate(() => document.getElementById("words").textContent)) === "Something else entirely");

  // ---- what the worker will accept
  const rejected = await worker.evaluate(async () => (validRules([{ s: "a", b: "a", d: "color:red;}body{display:none" }]) ? "accepted" : "rejected"));
  check("a rule with braces in it is refused", rejected === "rejected");
} finally { await context.close(); server.close(); }
console.log(failures ? `${failures} check(s) failed.` : "All keep checks passed.");
process.exit(failures ? 1 : 0);
