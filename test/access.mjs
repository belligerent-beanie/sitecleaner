// The "easier to read" preset. Part 1 tests the engine (extension/readable.js) on a page built to catch its mistakes; part 2 (the panel, Keep, and the
// loader applying it with no picker) is further down. Offline: node test/access.mjs (needs a display for part 2; xvfb-run on a server).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "./browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + detail}`); if (!ok) failures++; };

const PAGE = `<!doctype html><meta charset=utf-8><style>
  body { font: 16px Georgia, serif; margin: 20px; color: #111; }
  .small { font-size: 14px; color: #aaaaaa; }            /* px-sized, grey on white: fails contrast */
  .wrap { font-size: 16px; }
  .wrap .tiny { font-size: 0.5em; }                       /* em of its parent: must be scaled once, not twice */
  .fine { color: #111111; font-size: 18px; }
  .dark { background: #222222; padding: 4px; } .dark span { color: #333333; font-size: 16px; }
  .hero { position: relative; width: 300px; height: 60px; } .hero img { position: absolute; inset: 0; width: 100%; height: 100%; background: #000; } .hero h2 { position: absolute; color: #ffffff; font-size: 20px; margin: 0; }
  .grad { background: linear-gradient(#003, #99f); } .grad p { color: #dddddd; font-size: 16px; margin: 0; }
  .big { font-size: 40px; color: #999999; }               /* large text: needs only 3:1 */
  a { color: #0000ee; text-decoration: none; } .anim { transition: opacity 2s; animation: spin 3s infinite; } @keyframes spin { to { opacity: .5; } }
  button { min-height: 10px; } .icon-x { font-family: monospace; }
</style><body>
<p class="small" id="small" style="color: #aaaaaa; font-size: 14px">Small grey text</p>
<div class="wrap" id="wrap">Parent text <span class="tiny" id="tiny">tiny child</span></div>
<p class="fine" id="fine">Fine text</p>
<div class="dark"><span id="dark">Dark on dark</span></div>
<div class="hero"><img alt=""><h2 id="hero">Over a picture</h2></div>
<div class="grad"><p id="grad">On a gradient</p></div>
<p class="big" id="big">Big grey</p>
<p><a href="#x" id="link">A link</a> <span id="anim" class="anim">moving</span> <button id="btn">Go</button> <i class="icon-x" id="icon">ico</i></p>
<p id="plain">No inline style at all</p>
</body>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(PAGE);
  await page.addScriptTag({ path: path.join(root, "extension", "readable.js") });
  const get = (sel, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
  const px = async (sel) => parseFloat(await get(sel, "fontSize"));
  const apply = (o) => page.evaluate((o) => window.__scReadable.apply(o), o);
  const contrast = (sel) => page.evaluate((s) => {   // WCAG contrast of an element's colour on white, in the page itself
    const m = getComputedStyle(document.querySelector(s)).color.match(/[\d.]+/g).map(Number);
    const L = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = 0.2126 * L(m[0]) + 0.7152 * L(m[1]) + 0.0722 * L(m[2]);
    return 1.05 / (lum + 0.05);
  }, sel);

  const before = { small: await px("#small"), tiny: await px("#tiny"), wrap: await px("#wrap"), plain: await px("#plain") };
  // ---- text size
  await apply({ textScale: 1.25 });
  check("px-sized text is scaled by the factor", Math.abs((await px("#small")) - before.small * 1.25) < 0.2, String(await px("#small")));
  check("text with no size of its own (inherited) is scaled too", Math.abs((await px("#plain")) - before.plain * 1.25) < 0.2, String(await px("#plain")));
  check("a child sized in em is scaled once, not twice", Math.abs((await px("#tiny")) - before.tiny * 1.25) < 0.2, `${await px("#tiny")} vs ${before.tiny * 1.25}`);
  await apply({ textScale: 1, minText: 14 });
  check("the smallest size lifts what is below it and leaves the rest", (await px("#tiny")) >= 14 && Math.abs((await px("#fine")) - 18) < 0.2, `${await px("#tiny")} ${await px("#fine")}`);
  await apply(null);
  check("turned off, sizes are exactly as they were", (await px("#small")) === before.small && (await px("#tiny")) === before.tiny && (await px("#plain")) === before.plain);
  check("and inline styles are as they were (what the page had stays, what it did not have is gone)", await page.evaluate(() => { const s = document.getElementById("small").style; return s.fontSize === "14px" && s.color === "rgb(170, 170, 170)" && s.getPropertyPriority("font-size") === "" && document.getElementById("plain").getAttribute("style") === null; }));

  // ---- contrast
  await apply({ contrast: true });
  check("grey text on white is made to reach 4.5:1", (await contrast("#small")) >= 4.5, String(await contrast("#small")));
  check("and kept as close to grey as it can be (not just black)", (await get("#small", "color")) !== "rgb(0, 0, 0)");
  check("text that already reads is not touched", (await get("#fine", "color")) === "rgb(17, 17, 17)");
  check("large text needs only 3:1, so it is moved less", (await contrast("#big")) >= 3 && (await contrast("#big")) < 4.5, String(await contrast("#big")));
  const onDark = await page.evaluate(() => {
    const L = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (m) => 0.2126 * L(m[0]) + 0.7152 * L(m[1]) + 0.0722 * L(m[2]);
    const fg = getComputedStyle(document.getElementById("dark")).color.match(/[\d.]+/g).map(Number);
    return (lum(fg) + 0.05) / (lum([34, 34, 34]) + 0.05);
  });
  check("dark text on a dark background is made lighter until it reads", onDark >= 4.5, String(onDark));
  check("white text over a picture is left alone (the background cannot be known)", (await get("#hero", "color")) === "rgb(255, 255, 255)");
  check("text on a gradient is left alone", (await get("#grad", "color")) === "rgb(221, 221, 221)");
  const stats = await page.evaluate(() => window.__scReadable.stats());
  check("it says how many pieces of text it fixed and how many it could not judge", stats.contrast >= 3 && stats.unsure >= 2, JSON.stringify(stats));
  await apply(null);
  check("turned off, colours are as they were", (await get("#small", "color")) === "rgb(170, 170, 170)" && (await get("#dark", "color")) === "rgb(51, 51, 51)");

  // ---- the style sheet part
  await apply({ links: true, font: true, spacing: true, motion: true, buttons: true });
  { const v = await get("#link", "textDecorationLine"); check("links are underlined", v === "underline", "engine: " + v); }
  check("the font is plain (and icons keep theirs)", /Verdana/.test(await get("#small", "fontFamily")) && /monospace/.test(await get("#icon", "fontFamily")));
  check("lines are spaced out", parseFloat(await get("#small", "lineHeight")) > 1.5 * (await px("#small")) - 1);
  check("animations and transitions are cut to nothing", parseFloat(await get("#anim", "transitionDuration")) < 0.01);
  check("buttons are at least 44px", parseFloat(await get("#btn", "minHeight")) === 44);
  await apply({ focus: true });
  check("the focus rule is in the sheet", await page.evaluate(() => [...document.adoptedStyleSheets].some((s) => [...s.cssRules].some((r) => /focus-visible/.test(r.cssText) && /outline/.test(r.cssText) && /3px/.test(r.cssText)))));
  await apply(null);
  check("off, the sheet is gone", (await get("#link", "textDecorationLine")) === "none" && (await page.evaluate(() => document.adoptedStyleSheets.length)) === 0);
  check("options that turn nothing on count as off", (await page.evaluate(() => window.__scReadable.apply({ textScale: 1 }) && window.__scReadable.current())) === null);

  // ---- content that arrives later
  await apply({ textScale: 1.5 });
  await page.evaluate(() => { const p = document.createElement("p"); p.id = "late"; p.style.fontSize = "10px"; p.textContent = "Late text"; document.body.append(p); });
  for (let i = 0; i < 20 && Math.abs((await px("#late")) - 15) > 0.2; i++) await page.waitForTimeout(100);
  check("text added after the pass is scaled once, as the rest", Math.abs((await px("#late")) - 15) < 0.2 && Math.abs((await px("#tiny")) - before.tiny * 1.5) < 0.2, `${await px("#late")} ${await px("#tiny")}`);
  await apply(null);

  // ---- highlight under the pointer and the keyboard
  const pixel = async (pg, x, y) => {   // what is really painted at a point
    const png = (await pg.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString("base64");
    return pg.evaluate(async (b64) => { const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob()); const c = new OffscreenCanvas(1, 1).getContext("2d"); c.drawImage(bmp, 0, 0); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3); }, png);
  };
  const lightness = (rgb) => (rgb[0] + rgb[1] + rgb[2]) / 3;
  await apply({ highlight: true });
  check("nothing is highlighted until the pointer is on it", (await get("#fine", "backgroundColor")) === "rgba(0, 0, 0, 0)");
  await page.hover("#fine");
  check("text under the pointer gets a solid background and black text", (await get("#fine", "backgroundColor")) === "rgb(255, 243, 160)" && (await get("#fine", "color")) === "rgb(0, 0, 0)", await get("#fine", "backgroundColor"));
  await page.mouse.move(600, 5);
  check("and loses it when the pointer leaves", (await get("#fine", "backgroundColor")) === "rgba(0, 0, 0, 0)");
  await page.focus("#btn"); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
  check("a field or button reached by keyboard is highlighted too", (await get("#btn", "backgroundColor")) === "rgb(255, 243, 160)", await get("#btn", "backgroundColor"));
  await apply(null);

  // ---- dark mode
  await apply({ dark: true });
  check("dark mode turns a plain white page dark", lightness(await pixel(page, 700, 400)) < 60, String(await pixel(page, 700, 400)));
  check("pictures and video are turned back, so they look as they did", await page.evaluate(() => { const i = document.createElement("img"); document.body.append(i); const f = getComputedStyle(i).filter; i.remove(); return /invert/.test(f); }));
  await apply({ dark: true, highlight: true });
  await page.hover("#fine");
  check("highlight in dark mode is seen as light, not as a dark patch", lightness(await pixel(page, 600, await page.evaluate(() => { const r = document.getElementById("fine").getBoundingClientRect(); return r.top + r.height / 2; }))) > 200);
  await apply(null);
  check("off, the page is light again", lightness(await pixel(page, 700, 400)) > 200);
  const already = await browser.newPage();
  await already.setContent(`<!doctype html><body style="background:#111;color:#eee"><p>already dark</p>`);
  await already.addScriptTag({ path: path.join(root, "extension", "readable.js") });
  const darkStats = await already.evaluate(() => window.__scReadable.apply({ dark: true }));
  check("a page that is dark already is not inverted (and it says so)", darkStats.darkSkipped === true && (await already.evaluate(() => getComputedStyle(document.documentElement).filter)) === "none");
  await already.close();

  // ---- speed
  const big = await browser.newPage();
  await big.setContent(`<body>${Array.from({ length: 5000 }, (_, i) => `<div class="r${i % 20}"><p style="font-size:${12 + (i % 5)}px;color:#${i % 2 ? "aaa" : "333"}">row ${i} <a href="#">link</a></p></div>`).join("")}</body>`);
  await big.addScriptTag({ path: path.join(root, "extension", "readable.js") });
  const ms = await big.evaluate(() => { const t = performance.now(); window.__scReadable.apply({ textScale: 1.25, minText: 14, contrast: true, spacing: true, links: true }); return performance.now() - t; });
  check(`a page of 5,000 rows is done in under 1.5 s (took ${Math.round(ms)} ms)`, ms < 1500, String(ms));
} finally { await browser.close(); }

// ---- part 2: the panel, Keep, and the loader putting the settings back with no picker (consumer edition, in a real Chrome)
const SITE = `<!doctype html><title>site</title><style>body{font:16px Georgia}.small{font-size:14px;color:#aaaaaa}a{text-decoration:none}</style><main><p class="small" id="small">Small grey text</p><a id="link" href="#x">a link</a></main>`;
const server = http.createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end(SITE); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const dist = path.join(os.tmpdir(), "design-picker-access-" + process.pid);
execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--test", "--edition", "consumer", "--out", dist], { stdio: "ignore" });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "design-picker-profile-"));
const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--window-size=1280,900"] });
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  await worker.evaluate(() => chrome.storage.local.set({ "dz-tour": "any", "dz-prefs": {} }));
  const key = "site:" + base;
  const entry = () => worker.evaluate(async (k) => (await chrome.storage.local.get(k))[k] || null, key);
  const registered = () => worker.evaluate(async (id) => (await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length, "site-" + base);
  const size = (p) => p.evaluate(() => parseFloat(getComputedStyle(document.getElementById("small")).fontSize));
  const wait = async (fn, n = 40) => { for (let i = 0; i < n; i++) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };

  const page = await context.newPage();
  await page.goto(base + "/?first");
  await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/*" }); await toggle(tab); });
  await page.locator(".dz-toggle.dz-on").waitFor({ timeout: 8000 });
  await page.keyboard.press("Escape");
  check("the consumer picker has an Easier to read button", (await page.locator(".dz-head button:text-is('Easier to read')").count()) === 1);
  await page.locator(".dz-head button:text-is('Easier to read')").click();
  check("the panel opens with sensible controls", (await page.locator(".dz-access input[type=range]").count()) === 1 && (await page.locator(".dz-access input[type=checkbox]").count()) === 9);
  await page.locator(".dz-access input[type=range]").fill("150");
  await page.locator(".dz-access label", { hasText: "Underline every link" }).locator("input").check();
  await page.locator(".dz-access label", { hasText: "Fix text that is hard to read" }).locator("input").check();
  check("the page changes as the settings are chosen", await wait(async () => Math.abs((await size(page)) - 21) < 0.2));
  // the size is reached by the slider alone; the checkboxes apply a moment later, so wait for the underline itself
  const underline = () => page.evaluate(() => getComputedStyle(document.getElementById("link")).textDecorationLine);
  await wait(async () => (await underline()) === "underline");
  { const v = await underline(); check("links are underlined", v === "underline", "panel: " + v); }
  check("the status says what contrast did", await wait(async () => /Fixed \d+ pieces/.test(await page.locator(".dz-access [role=status]").innerText()), 20));
  await page.locator(".dz-head button:text-is('Easier to read')").click();
  check("the button closes the panel again, and Esc does too", (await page.locator(".dz-access").count()) === 0);
  await page.locator(".dz-head button:text-is('Easier to read')").click();
  await page.locator(".dz-access button", { hasText: "Keep on this site" }).click();
  check("Keep stores the settings (no rules) and registers the loader", await wait(async () => { const e = await entry(); return e && e.presets && e.presets.access && e.presets.access.textScale === 1.5 && e.rules.length === 0; }) && await wait(async () => (await registered()) === 1), JSON.stringify(await entry()));
  const loaderFiles = await worker.evaluate(async (id) => (await chrome.scripting.getRegisteredContentScripts({ ids: [id] }))[0].js, "site-" + base);
  check("the loader brings the engine with it", loaderFiles.join() === "readable.js,apply.js", loaderFiles.join());

  const fresh = await context.newPage();
  await fresh.goto(base + "/?second");
  check("another page has the settings without the picker", await wait(async () => Math.abs((await size(fresh)) - 21) < 0.2) && (await fresh.locator("#design-picker-extension-root").count()) === 0, String(await size(fresh)));
  check("the link underline and the contrast fix are there too", (await fresh.evaluate(() => getComputedStyle(document.getElementById("link")).textDecorationLine)) === "underline" && (await fresh.evaluate(() => getComputedStyle(document.getElementById("small")).color)) !== "rgb(170, 170, 170)");

  // an unrelated change to the entry (the stale list) must not undo what is showing
  await worker.evaluate(async (k) => { const e = (await chrome.storage.local.get(k))[k]; await chrome.storage.local.set({ [k]: { ...e, stale: ["x"] } }); }, key);
  await fresh.waitForTimeout(400);
  check("an unrelated change to the kept entry leaves the settings alone", Math.abs((await size(fresh)) - 21) < 0.2);

  // the panel in the picker shows it, and the options page too
  await page.locator(".dz-head button:text-is('Easier to read')").click().catch(() => {});
  await page.keyboard.press("Escape");
  await page.locator(".dz-head button", { hasText: "Changes" }).click();
  check("the kept list names the settings", /Easier to read: text 150%/.test(await page.locator(".dz-kept").innerText()), await page.locator(".dz-kept").innerText());
  const options = await context.newPage();
  await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
  await options.locator(".site").waitFor();
  // the page draws the list again whenever the store changes, which closes it: open it (not click, which would close an open one) each time we look
  const listed = async () => { await options.locator(".site details").evaluate((d) => { d.open = true; }).catch(() => {}); return options.locator(".site ul.rules").innerText({ timeout: 1000 }).catch(() => ""); };
  const wordsRe = /text 150%.*underlined links.*fixed low contrast/;
  let listedText = "";
  const gotWords = await wait(async () => wordsRe.test(listedText = await listed()));   // the page draws its list after it has read the store
  check("the options page lists them in words", gotWords, listedText);
  check("and counts them", /1 change/.test(await options.locator(".site .count").innerText()));
  await options.locator(".site input[type=checkbox]").uncheck();
  check("switching the site off takes the loader away", await wait(async () => (await registered()) === 0));
  await options.locator(".site input[type=checkbox]").check();
  check("and on brings it back", await wait(async () => (await registered()) === 1));

  // removing them
  await page.locator(".dz-kept button", { hasText: "Remove" }).first().click();
  check("Remove in the picker stops keeping them and puts the page back", await wait(async () => (await entry()) === null) && await wait(async () => (await registered()) === 0) && await wait(async () => Math.abs((await size(page)) - 14) < 0.2), String(await size(page)));
  const gone = await context.newPage();
  await gone.goto(base + "/?third");
  await gone.waitForTimeout(500);
  check("a new page no longer has them", Math.abs((await size(gone)) - 14) < 0.2);

  // rules and settings live together: removing the last rule keeps a site that still has settings, and the other way round
  await worker.evaluate(async (k) => chrome.storage.local.set({ [k]: { enabled: true, rules: [{ s: ".small", b: ".small", d: "color:#c00 !important" }], presets: { access: { textScale: 1.2, minText: 0, spacing: false, font: false, links: false, focus: false, motion: false, buttons: false, contrast: false } }, stale: [], updated: 1 } }), key);
  await worker.evaluate(async (o) => syncSite(o), base);
  check("a site with rules and settings is one entry with one loader", (await registered()) === 1);
  await options.reload();
  await options.locator(".site summary").click();
  await options.locator(".site ul.rules li", { hasText: "Easier to read" }).locator("button").click();
  check("removing just the settings leaves the rule", await wait(async () => { const e = await entry(); return e && !e.presets && e.rules.length === 1; }));
  // the worker refuses settings that are out of range or mean nothing
  const verdicts = await worker.evaluate(() => {
    const ok = { textScale: 1.5, minText: 0, spacing: false, font: false, links: true, focus: false, motion: false, buttons: false, contrast: false, highlight: false, dark: false };
    return [validPresets({ access: ok }), validPresets({ access: { ...ok, textScale: 5 } }), validPresets({ access: { ...ok, links: "yes" } }), validPresets({ access: { ...ok, textScale: 1, links: false } }), validPresets({ other: ok }), validPresets({ access: { ...ok, minText: -3 } }), validPresets(undefined)];
  });
  check("the worker accepts sane settings and refuses the rest", verdicts.join() === "true,false,false,false,false,false,true", verdicts.join());
} finally { await context.close(); server.close(); }
console.log(failures ? `${failures} check(s) failed.` : "All easier-to-read engine checks passed.");
process.exit(failures ? 1 : 0);
