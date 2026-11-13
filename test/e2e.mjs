// End-to-end test: loads the built extension into real Chrome and drives it on a page that is nothing like the game's: strict content
// security policy, generated class names, its own CSS variables.   node extension/test/e2e.mjs   (opens a Chromium window)
//
// Playwright cannot click a toolbar button, so the test build (build.mjs --test) also gets host access, and the test calls the same
// toggle() the button calls. Everything after that is the real thing.
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import os from "node:os";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const { chromium } = createRequire(path.join(root, "package.json"))("playwright");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

// ---- a site that is not ours
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title><link rel="stylesheet" href="/fixture.css"></head>
<body><main class="css-1x2y3z"><h1 class="title">Hello there</h1><p class="lede">A paragraph of text to restyle.</p>
<button id="go" class="btn-a1b2c3d">Go</button><div class="card"><span class="muted">Muted words</span></div>
<ul class="items"><li>One</li><li>Two</li><li>Three</li></ul></main><script src="/fixture.js"></script></body></html>`;
const CSS = `:root { --brand: #3366cc; --ink: #222222; } body { margin: 0; font: 16px system-ui; color: var(--ink); background: #ffffff; }
main { padding: 24px; } .btn-a1b2c3d { background: var(--brand); color: #ffffff; border: 0; padding: 8px 16px; } .card { background: #eeeeee; padding: 12px; margin-top: 16px; }
.muted { color: #999999; }`;
const server = http.createServer((req, res) => {
  const type = req.url === "/fixture.css" ? "text/css" : req.url === "/fixture.js" ? "text/javascript" : "text/html";
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'");   // no inline anything
  res.end(req.url === "/fixture.css" ? CSS : req.url === "/fixture.js" ? "window.__fixtureLoaded = true;" : PAGE);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

// ---- build and load
const dist = path.join(os.tmpdir(), "design-picker-e2e-" + process.pid);
execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--test", "--out", dist], { stdio: "inherit" });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "design-picker-profile-"));
const context = await chromium.launchPersistentContext(profile, {
  headless: false, viewport: null,   // no emulated viewport: a preview window must really be the size asked for   // Playwright's Chromium: branded Chrome no longer loads unpacked extensions from the command line
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--window-size=1280,900"],
});
let failed = false;
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  check("the extension loads and its service worker starts", /background\.js$/.test(worker.url()), worker.url());

  const page = await context.newPage();
  await page.goto(url);
  const activate = () => worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/*" }); await toggle(tab); });
  const css = (selector, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [selector, prop]);
  const editsInStorage = () => worker.evaluate(async () => { const all = await chrome.storage.local.get(null); return Object.keys(all).filter((k) => k.startsWith("dz-changes:")).length; });

  // ---- the picker appears, inside a shadow root, styled, on a page whose CSP forbids inline styles
  await activate();
  await page.locator(".dz-toggle").waitFor({ timeout: 8000 });
  eq("the page has one picker element, and its UI is in a shadow root", await page.evaluate(() => {
    const host = document.getElementById("design-picker-extension-root");
    return [document.querySelectorAll("#design-picker-extension-root").length, !!host.shadowRoot, !!document.querySelector(".dz-toggle")];
  }), [1, true, false]);   // .dz-toggle is not in the page's own DOM
  const toggleBox = await page.locator(".dz-toggle").boundingBox();
  check("its styles applied despite the page's content security policy (the tab sits on the left edge)", toggleBox && toggleBox.x < 4 && toggleBox.height > 40, JSON.stringify(toggleBox));
  eq("the picker is on", await page.locator(".dz-toggle").innerText(), "Design: on");
  check("the first-time guide opened", (await page.locator(".dz-dock").innerText()).includes("Guide 1 / 4"));
  await page.keyboard.press("Escape");
  check("no Patches link (those belong to the game's server)", !(await page.locator(".dz-dock .dz-head").innerText()).includes("Patches"));

  // ---- select a button by clicking it; the click must not reach the page
  await page.evaluate(() => { window.__clicks = 0; document.getElementById("go").addEventListener("click", () => window.__clicks++); });
  await page.locator("#go").click();
  eq("the click selected the button and did not reach the page", [(await page.locator(".dz-head strong").first().innerText()).startsWith("button"), await page.evaluate(() => window.__clicks)], [true, 0]);

  // ---- Fill from the page's own palette (its CSS variable shows up with its name)
  await page.keyboard.press("Enter");
  await page.locator(".dz-dock button:text-is('Fill')").click();
  const chips = await page.locator(".dz-chip").evaluateAll((els) => els.map((e) => e.title));
  check("the colour picker lists the page's own variables by name", chips.some((t) => t.includes("--brand")) && chips.some((t) => t.includes("--ink")), chips.join(" | "));
  await page.locator(".dz-chip[title*='--ink']").click();
  eq("clicking a palette chip changed the button's fill", await css("#go", "backgroundColor"), "rgb(34, 34, 34)");
  check("the contrast readout is there and measured it", /Contrast \d+\.\d\d:1/.test(await page.locator(".dz-contrast").innerText()));
  check("the edit was written with CSSOM, not an inline <style> (the page CSP would have blocked that)", (await page.evaluate(() => document.getElementById("go").getAttribute("style"))).includes("background-color"));

  // ---- typing inside the shadow root: focus, keys and undo behave
  await page.locator(".dz-dock button:text-is('Text')").click();
  await page.locator(".dz-text").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" now");
  eq("typing in the Text field changed the page's text and the field kept what was typed", [await page.evaluate(() => document.getElementById("go").textContent), await page.locator(".dz-text").inputValue()], ["Go now", "Go now"]);
  await page.locator(".dz-dock button:text-is('Size')").click();
  await page.locator("[aria-label='Width in pixels']").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("222");
  eq("typing a width, the field was not overwritten while typing", [await page.locator("[aria-label='Width in pixels']").inputValue(), Math.round((await page.locator("#go").boundingBox()).width)], ["222", 222]);

  // ---- undo, compare, measure
  await page.evaluate(() => document.querySelector("#design-picker-extension-root").shadowRoot.activeElement?.blur());
  await page.keyboard.down("\\");
  const held = await css("#go", "backgroundColor");
  await page.keyboard.up("\\");
  check("holding backslash shows the original while held (before the edit: the page's blue)", held === "rgb(51, 102, 204)", held);

  // ---- the edits are kept by the extension, out of the page's reach
  eq("the edits are in chrome.storage (one page)", await editsInStorage(), 1);
  eq("the page's own localStorage holds nothing of the picker's", await page.evaluate(() => Object.keys(localStorage).filter((k) => /dz|designer/i.test(k))), []);

  // ---- reload: with all-sites access (this test build has it) the saved edits come back by themselves, and the picker stays off
  await page.reload();
  await page.waitForLoadState("load");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("go")).backgroundColor === "rgb(34, 34, 34)", null, { timeout: 10000 }).catch(() => {});
  eq("after a reload the saved edits come back by themselves", await css("#go", "backgroundColor"), "rgb(34, 34, 34)");
  eq("and the picker is there but off", await page.locator(".dz-toggle").innerText(), "Design");
  await activate();
  eq("the toolbar button then turns it on, with the edits still in place", [await page.locator(".dz-toggle").innerText(), await css("#go", "backgroundColor")], ["Design: on", "rgb(34, 34, 34)"]);

  // ---- a page with no saved edits is left completely alone
  const other = await context.newPage();
  await other.goto(url + "another-page");
  await other.waitForTimeout(1500);
  eq("a page with no saved edits gets no picker at all", await other.evaluate(() => !!document.getElementById("design-picker-extension-root")), false);
  await other.close();

  // ---- the toolbar toggle turns it off and on without losing anything
  await activate();
  eq("the toolbar button turns the picker off", await page.locator(".dz-toggle").innerText(), "Design");
  await activate();
  eq("and back on", await page.locator(".dz-toggle").innerText(), "Design: on");

  // ---- the export names the page it came from
  await page.keyboard.press("Escape");
  await page.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
  const exported = await page.locator(".dz-preview").innerText();
  check("the Markdown export names this page and the change", exported.includes(url) && exported.includes("background-color") && exported.includes("#222222"), exported.slice(0, 300));

  // ---- multi-select: Shift-click adds, and a tool then changes all of them (inside the shadow root, on a foreign page)
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.locator(".title").click();
  await page.keyboard.down("Shift");
  await page.locator(".lede").click();
  await page.locator(".muted").click();
  await page.keyboard.up("Shift");
  eq("Shift-click built a selection of three, drawn as three outlines", [await page.locator(".dz-head strong").first().innerText(), await page.locator(".dz-picked").count()], ["3 elements", 3]);
  await page.keyboard.press("Enter");
  await page.locator(".dz-dock button:text-is('Font')").click();
  await page.locator("[aria-label='Font size in pixels']").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("21");
  eq("one Font edit changed all three elements", [await css(".title", "fontSize"), await css(".lede", "fontSize"), await css(".muted", "fontSize")], ["21px", "21px", "21px"]);
  await page.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); });
  await page.keyboard.press("Control+z");
  eq("and one undo took it off all three", [await css(".title", "fontSize"), await css(".lede", "fontSize"), await css(".muted", "fontSize")], ["32px", "16px", "16px"]);

  // ---- the hover inspector, with APCA contrast, and a name for what a screen reader would announce
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.keyboard.press("i");
  await page.locator(".muted").hover();
  const tip = await page.locator(".dz-tip").innerText();
  check("the inspector says what is under the pointer, with WCAG and APCA contrast", /span\.muted/.test(tip) && /WCAG AA/.test(tip) && /APCA Lc -?\d+/.test(tip), tip);
  await page.keyboard.press("i");

  // ---- find: "/" then a selector selects every match; Tone shifts their colours together and puts them back
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  await page.locator(".dz-find").waitFor();
  await page.keyboard.type("h1, p");
  eq("Find selected everything that matches the selector, and said how many", await page.locator(".dz-dock .dz-note").innerText(), "2 found");
  await page.keyboard.press("Enter");
  eq("Enter turns the matches into the selection", await page.locator(".dz-head strong").first().innerText(), "2 elements");
  await page.locator(".dz-dock button:text-is('Tone')").click();
  const inks = () => page.evaluate(() => [getComputedStyle(document.querySelector(".title")).color, getComputedStyle(document.querySelector(".lede")).color]);
  const before = await inks();
  await page.locator("[aria-label='Brightness shift']").focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowLeft");
  const darker = await inks();
  await page.locator(".dz-dock button:text-is('Back to start')").click();
  eq("Tone changed both elements together, and Back to start returned them exactly", [darker.every((c) => c === "rgb(0, 0, 0)"), (await inks()).join()], [true, before.join()]);

  // ---- alignment guides
  await page.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); });
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.locator("#go").click();
  await page.keyboard.down("g");
  const lines = await page.locator(".dz-g-line").count();
  await page.keyboard.up("g");
  eq("holding G draws the six guide lines and they go when it is released", [lines, await page.locator(".dz-g-line").count()], [6, 0]);

  // ---- structure: delete, duplicate, group, copy and paste, select similar, in-place text; all undoable, in the export, kept across a reload
  {
    const sp = await context.newPage();
    sp.on("pageerror", (error) => console.log("      [page error]", error.message));
    await sp.goto(url + "structure");
    await sp.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await sp.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await sp.keyboard.press("Escape");
    const items = () => sp.evaluate(() => [...document.querySelectorAll("ul.items > *")].map((el) => el.tagName.toLowerCase() + ":" + el.textContent.trim()).join(" "));
    const pick = async (selector, shift = false, position) => { if (shift) await sp.keyboard.down("Shift"); await sp.locator(selector).click(position ? { position } : {}); if (shift) await sp.keyboard.up("Shift"); };
    const undoKey = async () => { await sp.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); }); await sp.keyboard.press("Control+z"); };

    const original = await items();
    await pick("ul.items li:nth-child(2)");
    await sp.keyboard.press("Delete");
    eq("Delete removed the selected element", await items(), "li:One li:Three");
    await undoKey();
    eq("Ctrl+Z put it back, where it was", await items(), original);
    await sp.keyboard.press("Control+Shift+z");
    eq("and Ctrl+Shift+Z removed it again", await items(), "li:One li:Three");
    await undoKey();

    await pick("ul.items li:nth-child(1)");
    await sp.keyboard.press("Control+d");
    eq("Ctrl+D duplicated it (the copy sits right after, and is selected)", [await items(), await sp.locator(".dz-head strong").first().innerText().then((t) => t.startsWith("li"))], ["li:One li:One li:Two li:Three", true]);
    await sp.keyboard.press("Control+g");
    eq("Ctrl+G grouped the selected copy in a new div", await sp.evaluate(() => document.querySelector("ul.items > div > li") ? "grouped" : "not grouped"), "grouped");
    await sp.keyboard.press("Control+Shift+g");
    eq("Ctrl+Shift+G ungrouped it again", await sp.evaluate(() => document.querySelector("ul.items > div") ? "still grouped" : "ungrouped"), "ungrouped");

    await sp.keyboard.press("Escape"); await sp.keyboard.press("Escape");
    await pick("ul.items li:nth-child(1)");
    await sp.keyboard.press("Control+Shift+e");
    eq("Ctrl+Shift+E selected every similar element", await sp.locator(".dz-head strong").first().innerText(), "4 elements");

    await sp.keyboard.press("Escape"); await sp.keyboard.press("Escape");
    await pick(".title");
    await sp.evaluate(() => { document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() })); });
    await sp.keyboard.press("Escape"); await sp.keyboard.press("Escape");
    await pick("ul.items", false, { x: 4, y: 4 });   // the list itself (its padding), not an item in it
    const pasted = await sp.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/html", '<h6 class="pasted" onclick="alert(1)">Pasted<script>window.__ran = 1</script></h6>');
      document.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
      const h6 = document.querySelector("ul.items > h6.pasted");
      return { there: !!h6, onclick: h6 && h6.hasAttribute("onclick"), script: !!document.querySelector("ul.items script"), ran: window.__ran === 1 };
    });
    eq("pasting markup puts it in the selected element, with scripts and event handlers stripped", pasted, { there: true, onclick: false, script: false, ran: false });

    await sp.keyboard.press("Escape"); await sp.keyboard.press("Escape");
    await sp.locator(".lede").dblclick();
    await sp.keyboard.press("End");
    await sp.keyboard.type(" plus");
    await sp.keyboard.press("Enter");
    eq("double-click edits text in place, and Enter finishes", [await sp.locator(".lede").innerText(), await sp.evaluate(() => document.querySelector(".lede").hasAttribute("contenteditable"))], ["A paragraph of text to restyle. plus", false]);
    await undoKey();
    eq("one Ctrl+Z took back everything typed", await sp.locator(".lede").innerText(), "A paragraph of text to restyle.");
    await sp.keyboard.press("Control+Shift+z");

    await sp.keyboard.press("Escape"); await sp.keyboard.press("Escape");
    await sp.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    const exported = await sp.locator(".dz-preview").innerText();
    check("the export lists the structure changes, in order, with the selectors", exported.includes("## Structure changes") && /duplicated `[^`]*li[^`]*`/.test(exported) && /inserted markup as child \d+ of `ul/.test(exported) && exported.includes("text: \"A paragraph of text to restyle.\" → \"A paragraph of text to restyle. plus\""), exported.slice(-600));
    const before = await items();

    await sp.reload();
    await sp.waitForLoadState("load");
    await sp.waitForFunction((want) => [...document.querySelectorAll("ul.items > *")].map((el) => el.tagName.toLowerCase() + ":" + el.textContent.trim()).join(" ") === want, before, { timeout: 10000 }).catch(() => {});
    eq("after a reload the structure changes come back by themselves", [await items(), await sp.locator(".lede").innerText()], [before, "A paragraph of text to restyle. plus"]);

    await sp.locator(".dz-dock .dz-head button:text-matches('Changes')").click().catch(() => {});
    await sp.keyboard.press("Alt+Shift+KeyP").catch(() => {});
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await sp.locator(".dz-toggle").waitFor();
    if ((await sp.locator(".dz-toggle").innerText()) !== "Design: on") await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await sp.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    await sp.locator(".dz-dock button:text-is('Reset all')").click();
    eq("Reset all puts the structure and the text back as the page had them", [await items(), await sp.locator(".lede").innerText()], [original, "A paragraph of text to restyle."]);
    await undoKey();
    eq("and one Ctrl+Z brings all of it back", await items(), before);
    await sp.close();
  }

  // ---- the Move tool: arrow keys through the structure, and dragging to reorder (one move, one undo)
  {
    const mp = await context.newPage();
    mp.on("pageerror", (error) => console.log("      [page error]", error.message));
    await mp.goto(url + "move");
    await mp.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await mp.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await mp.keyboard.press("Escape");
    const order = () => mp.evaluate(() => [...document.querySelectorAll("ul.items > li")].map((el) => el.textContent.trim()).join(" "));
    const undoKey = async () => { await mp.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); }); await mp.keyboard.press("Control+z"); };

    await mp.locator("ul.items li:nth-child(2)").click();
    await mp.keyboard.press("Enter");
    await mp.locator(".dz-dock button:text-is('Move')").click();
    await mp.keyboard.press("ArrowLeft");
    eq("Move: the left arrow moved the element past its previous sibling", await order(), "Two One Three");
    await mp.keyboard.press("ArrowRight");
    eq("and the right arrow moved it back", await order(), "One Two Three");
    await mp.keyboard.press("ArrowUp");
    eq("the up arrow moved it out of its parent, to just before it", await mp.evaluate(() => [document.querySelector("main > li") && document.querySelector("main > li").nextElementSibling.className, document.querySelectorAll("ul.items > li").length]), ["items", 2]);
    await undoKey();
    eq("one Ctrl+Z put it back in the list", await order(), "One Two Three");

    await mp.keyboard.press("Escape"); await mp.keyboard.press("Escape");
    await mp.locator("ul.items li:nth-child(1)").click();
    await mp.keyboard.press("Enter");
    await mp.locator(".dz-dock button:text-is('Move')").click();
    const one = await mp.locator("ul.items li:nth-child(1)").boundingBox();
    const three = await mp.locator("ul.items li:nth-child(3)").boundingBox();
    await mp.mouse.move(one.x + one.width / 2, one.y + one.height / 2);
    await mp.mouse.down();
    await mp.mouse.move(three.x + three.width / 2, three.y + three.height * 0.75, { steps: 8 });
    await mp.mouse.up();
    eq("dragging the first item below the last reordered the list", await order(), "Two Three One");
    eq("and the selection is the element that was dragged", await mp.locator(".dz-head strong").first().innerText().then((t) => t.startsWith("li")), true);
    await undoKey();
    eq("one Ctrl+Z undid the whole drag", await order(), "One Two Three");
    await mp.keyboard.press("Control+Shift+z");
    eq("and Ctrl+Shift+Z did it again", await order(), "Two Three One");

    await mp.keyboard.press("Escape"); await mp.keyboard.press("Escape"); await mp.keyboard.press("Escape");
    await mp.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    const text = await mp.locator(".dz-preview").innerText();
    check("the export says what moved, from where and to where", /moved `[^`]*li[^`]*` \("One"\) from child 1 of `[^`]*` to child 3 of `[^`]*`/.test(text), text.slice(-300));
    await mp.reload();
    await mp.waitForLoadState("load");
    await mp.waitForFunction(() => [...document.querySelectorAll("ul.items > li")].map((el) => el.textContent.trim()).join(" ") === "Two Three One", null, { timeout: 10000 }).catch(() => {});
    eq("after a reload the new order comes back by itself", await order(), "Two Three One");
    await mp.close();
  }

  // ---- a screen-size preview opens as a real window of that size and shows the edits, without the picker
  await page.locator(".dz-dock .dz-head button:text-is('Preview')").click();
  const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 15000 }), page.locator(".dz-dock button:text-matches('Phone')").click()]);
  await popup.waitForLoadState("load");
  await popup.locator(".dz-size-badge").waitFor({ timeout: 10000 });
  const info = await popup.evaluate(() => ({ width: window.innerWidth, picker: !!document.querySelector(".dz-dock"), bg: getComputedStyle(document.getElementById("go")).backgroundColor }));
  eq("the preview window is the size asked for, has no picker, and shows the edit", [info.picker, info.bg, Math.abs(info.width - 390) <= 2], [false, "rgb(34, 34, 34)", true]);
  console.log("      (the preview window is " + info.width + " wide inside)");
  await popup.close();
} catch (error) {
  failed = true;
  console.log("FAIL  the test stopped:", error.message);
} finally {
  await context.close();
  server.close();
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });
}
// ---- the real build (no host access up front: only the tab the designer clicks it on) also loads
{
  const real = path.join(os.tmpdir(), "design-picker-real-" + process.pid);
  execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--out", real], { stdio: "inherit" });
  const manifest = JSON.parse(fs.readFileSync(path.join(real, "manifest.json"), "utf8"));
  check("the shipping manifest asks for nothing broad", !manifest.host_permissions && manifest.permissions.join() === "activeTab,scripting,storage" && manifest.optional_host_permissions.join() === "<all_urls>");
  const profile2 = fs.mkdtempSync(path.join(os.tmpdir(), "design-picker-profile-"));
  const second = await chromium.launchPersistentContext(profile2, { headless: false, viewport: null, args: [`--disable-extensions-except=${real}`, `--load-extension=${real}`] });
  try {
    const worker2 = second.serviceWorkers()[0] || (await second.waitForEvent("serviceworker", { timeout: 15000 }));
    check("the shipping build loads and its service worker starts", /background\.js$/.test(worker2.url()), worker2.url());
    const options = await second.newPage();
    await options.goto(`chrome-extension://${new URL(worker2.url()).host}/options.html`);
    eq("its options page says previews are not allowed until asked for", await options.locator("#state").innerText(), "not allowed");
  } catch (error) {
    check("the shipping build loads", false, error.message);
  } finally {
    await second.close();
    fs.rmSync(real, { recursive: true, force: true });
    fs.rmSync(profile2, { recursive: true, force: true });
  }
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} of ${results.length} checks passed${failed ? " (and the run stopped early)" : ""}.`);
process.exit(bad.length || failed ? 1 : 0);
