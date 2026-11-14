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
  await page.locator(".dz-dock button:text-is('Background')").click();
  await page.locator(".dz-hex").fill("#cc3333");
  check("the Keep button is there", (await page.locator(".dz-head button:text-is('Keep')").count()) === 1);
  await page.locator(".dz-head button:text-is('Keep')").click();
  await page.waitForFunction(() => /Kept on/.test(document.getElementById("design-picker-extension-root").shadowRoot.textContent), null, { timeout: 8000 });
  const saved = await entry();
  check("the changes are kept as rules for this site", !!saved && saved.enabled && saved.rules.length === 1, JSON.stringify(saved));
  check("three tiles changed alike are one rule on their shared class", saved && saved.rules[0].b === "div.tile", saved && saved.rules[0].b);
  check("the rule beats the site's own CSS (important)", saved && /background-color:(#cc3333|rgb\(204, 51, 51\)) !important/.test(saved.rules[0].d), saved && saved.rules[0].d);
  check("the loader is registered for this site only", (await registered()) === 1);
  check("the first time anything is kept, the panel opens with a note on where it goes from there", await page.locator(".dz-kept-intro").isVisible());
  await page.keyboard.press("Escape");   // close the panel again

  // ---- the options page lists the site, what is kept, and has a switch
  const options = await context.newPage();
  await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
  check("the options page of the consumer edition shows the site as a card", (await options.locator(".site").count()) === 1 && (await options.locator(".site").innerText()).includes(new URL(base).host));
  check("and hides what is for designers", !(await options.locator("#allow").isVisible()));
  await options.locator(".site summary").click();
  check("it says what is kept, in words", /background-color (#cc3333|rgb\(204, 51, 51\))/.test(await options.locator(".site ul.rules").innerText()), await options.locator(".site ul.rules").innerText());
  await options.locator(".site input[type=checkbox]").uncheck();
  for (let i = 0; i < 20 && (await registered()) === 1; i++) await options.waitForTimeout(150);
  check("the switch there turns the site off", (await registered()) === 0 && (await entry()).enabled === false);
  await options.locator(".site input[type=checkbox]").check();
  for (let i = 0; i < 20 && (await registered()) === 0; i++) await options.waitForTimeout(150);
  check("and back on", (await registered()) === 1);

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

  // ---- the toolbar icon says what is kept here, and its menu action switches it off and on without the picker
  const goneId = await worker.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/gone" }))[0].id);
  const titleOf = () => worker.evaluate(async (id) => { await refreshSiteUi(id); return chrome.action.getTitle({ tabId: id }); }, goneId);
  check("hovering the icon says the site's changes are on, and how many no longer match", /my changes are on for 127\.0\.0\.1:\d+ \(1\); 1 no longer match/.test(await titleOf()), await titleOf());
  await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/gone" }); await toggleSite(tab); });
  check("the toolbar action switches the site off", ((await entry()) || {}).enabled === false && (await registered()) === 0 && /are off for/.test(await titleOf()));
  await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/gone" }); await toggleSite(tab); });
  check("and on again", ((await entry()) || {}).enabled === true && (await registered()) === 1);

  // ---- a rule whose element is gone can be pointed at another element
  await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/gone" }); await toggle(tab); });
  await gone.locator(".dz-toggle.dz-on").waitFor({ timeout: 8000 });
  await gone.keyboard.press("Escape");
  await gone.locator(".dz-head button", { hasText: "Changes" }).click();
  check("a rule that matches nothing here is marked and offers Re-pick", (await gone.locator(".dz-kept .dz-lost").count()) === 1 && (await gone.locator(".dz-kept .dz-lost button", { hasText: "Re-pick" }).count()) === 1);
  await gone.locator(".dz-kept .dz-lost button", { hasText: "Re-pick" }).click();
  await gone.locator("main > p").click();
  let repicked = null;
  for (let i = 0; i < 30; i++) { await gone.waitForTimeout(200); repicked = await entry(); if (repicked && repicked.rules[0].b !== "div.tile") break; }
  check("the rule now names the element that was picked, and is no longer stale", repicked && repicked.rules.length === 1 && repicked.rules[0].b !== "div.tile" && /p/.test(repicked.rules[0].b) && !(repicked.stale || []).includes("div.tile"), JSON.stringify(repicked));
  for (let i = 0; i < 20 && (await gone.evaluate(() => getComputedStyle(document.querySelector("main > p")).backgroundColor)) !== "rgb(204, 51, 51)"; i++) await gone.waitForTimeout(150);
  check("and the change is there on the picked element", (await gone.evaluate(() => getComputedStyle(document.querySelector("main > p")).backgroundColor)) === "rgb(204, 51, 51)");
  await gone.keyboard.press("Escape");
  await worker.evaluate(async (k) => { const all = await chrome.storage.local.get(k); const e = all[k]; e.rules[0] = { ...e.rules[0], s: "div.tile", b: "div.tile" }; e.stale = []; await chrome.storage.local.set({ [k]: e }); }, key);   // put the original rule back for the rest

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

  // ---- the Changes panel lists what is kept, and rules can be removed one by one
  await page.locator(".dz-head button", { hasText: "Changes" }).click();
  const rows = page.locator(".dz-kept .dz-change");
  check("the panel lists every kept rule", (await rows.count()) === (await entry()).rules.length, String(await rows.count()));
  check("a rule is described in words", (await page.locator(".dz-kept").innerText()).includes("Brand new words") && /Hidden: /.test(await page.locator(".dz-kept").innerText()));
  const before = (await entry()).rules.length;
  await rows.filter({ hasText: "Brand new words" }).locator("button", { hasText: "Remove" }).click();
  for (let i = 0; i < 20 && ((await entry()) || {}).rules.length === before; i++) await page.waitForTimeout(150);
  const afterRemove = await entry();
  check("Remove takes that one rule away and keeps the others", afterRemove.rules.length === before - 1 && !afterRemove.rules.some((r) => r.k === "text") && afterRemove.rules.some((r) => /display:none/.test(r.d || "")));
  check("the panel follows", (await page.locator(".dz-kept .dz-change").count()) === before - 1);
  const reverted = await context.newPage();
  await reverted.goto(base + "/other");
  check("on the site the removed rule no longer applies, the others still do", (await reverted.evaluate(() => document.getElementById("words").textContent)) === "Original words" && (await tileColour(reverted)) === "rgb(204, 51, 51)");
  await page.locator(".dz-kept input[type=checkbox]").uncheck();
  for (let i = 0; i < 20 && (await registered()) === 1; i++) await page.waitForTimeout(150);
  check("the switch in the panel turns the site's changes off", (await registered()) === 0 && (await entry()).enabled === false);
  await page.locator(".dz-kept input[type=checkbox]").check();
  for (let i = 0; i < 20 && (await registered()) === 0; i++) await page.waitForTimeout(150);
  check("and on again", (await registered()) === 1);
  while ((await page.locator(".dz-kept .dz-change").count()) > 0) { await page.locator(".dz-kept .dz-change button", { hasText: "Remove" }).first().click(); await page.waitForTimeout(300); }
  check("removing the last rule forgets the site and unregisters the loader", (await entry()) === null && (await registered()) === 0);

  await options.reload();
  check("with nothing kept, the options page explains how to start", await options.locator("#empty").isVisible());

  // ---- a screenshot of an edited page says so
  const shotPage = await context.newPage();
  await shotPage.goto(base + "/shot");
  await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/shot" }); await toggle(tab); });
  await shotPage.locator(".dz-toggle.dz-on").waitFor({ timeout: 8000 });
  await shotPage.keyboard.press("Escape");
  await shotPage.locator(".tile").nth(0).click();
  const box = await shotPage.locator(".tile").nth(0).boundingBox();
  const dpr = await shotPage.evaluate(() => devicePixelRatio);
  await shotPage.keyboard.press("Enter");
  const [shot] = await Promise.all([shotPage.waitForEvent("download", { timeout: 15000 }), shotPage.locator(".dz-dock button:text-is('Screenshot')").click()]);
  const bytes = fs.readFileSync(await shot.path());
  const read = await shotPage.evaluate(async (list) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(list)], { type: "image/png" }));
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const c = canvas.getContext("2d"); c.drawImage(bitmap, 0, 0);
    const px = (x, y) => [...c.getImageData(x, y, 1, 1).data];
    return { width: bitmap.width, height: bitmap.height, bottom: px(Math.floor(bitmap.width / 2), bitmap.height - 2), edge: px(2, bitmap.height - 2) };
  }, [...bytes]);
  check("the picture is taller than the element by a strip that says it is edited", read.height > Math.round(box.height * dpr) + 10 && Math.abs(read.width - Math.round(box.width * dpr)) <= 2, JSON.stringify({ read, box, dpr }));
  check("the strip is dark, so it reads on any page", read.edge[0] < 40 && read.edge[1] < 40 && read.edge[2] < 40 && read.edge[3] === 255, JSON.stringify(read.edge));

  // ---- a full store gets a plain message, not the browser's own words
  await worker.evaluate(() => { globalThis.__realSet = chrome.storage.local.set.bind(chrome.storage.local); chrome.storage.local.set = () => Promise.reject(new Error("Resource::kQuotaBytes quota exceeded")); });
  await page.locator(".tile").nth(0).click();
  await page.keyboard.press("Enter");
  await page.locator(".dz-dock button:text-is('Background')").click();
  await page.locator(".dz-hex").fill("#3355cc");
  await page.locator(".dz-head button:text-is('Keep')").click();
  await page.waitForFunction(() => /storage for this extension is full/.test(document.getElementById("design-picker-extension-root").shadowRoot.textContent), null, { timeout: 8000 }).catch(() => {});
  const fullText = await page.evaluate(() => document.getElementById("design-picker-extension-root").shadowRoot.textContent);
  check("Keep on a full store says so in plain words", /storage for this extension is full/.test(fullText), fullText.slice(0, 200));
  check("and does not show the browser's raw error", !/kQuotaBytes/.test(fullText));
  await worker.evaluate(() => { chrome.storage.local.set = globalThis.__realSet; });

  // ---- what the worker will accept
  const rejected = await worker.evaluate(async () => (validRules([{ s: "a", b: "a", d: "color:red;}body{display:none" }]) ? "accepted" : "rejected"));
  check("a rule with braces in it is refused", rejected === "rejected");
} finally { await context.close(); server.close(); }
console.log(failures ? `${failures} check(s) failed.` : "All keep checks passed.");
process.exit(failures ? 1 : 0);
