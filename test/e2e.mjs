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
<ul class="items"><li>One</li><li>Two</li><li>Three</li></ul>
<img id="pic" class="hero-img" alt="Logo" src="/pic.png" srcset="/pic.png 1x, /pic2.png 2x"><div class="banner">Banner</div></main><a class="cta" href="#cta">Visit</a><dialog id="modal"><p class="in-modal">A modal dialog</p><button id="shut">Close</button></dialog><script src="/fixture.js"></script></body></html>`;
const CSS = `:root { --brand: #3366cc; --ink: #222222; } body { margin: 0; font: 16px system-ui; color: var(--ink); background: #ffffff; }
main { padding: 24px; } .btn-a1b2c3d { background: var(--brand); color: #ffffff; border: 0; padding: 8px 16px; } .card { background: #eeeeee; padding: 12px; margin-top: 16px; } .cta { display: inline-block; color: #0000ee; background: #ffffff; padding: 4px 8px; transition: background-color 0.4s; } .cta:hover { background: #ffee00; }
.muted { color: #999999; } .hero-img { display: block; width: 120px; height: 60px; } .banner { height: 50px; background: url(/pic.png) center / cover; }`;
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/pic")) {
    res.setHeader("Content-Type", "image/png");
    res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    return;
  }
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
  const settleOn = async (p) => {   // after a reload the picker may come back on by itself: wait a moment for that before deciding to turn it on
    await p.locator(".dz-toggle.dz-on").waitFor({ timeout: 4000 }).catch(() => {});
    if ((await p.locator(".dz-toggle").innerText()) !== "Design: on") await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
  };
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
  check("the first-time guide opened", (await page.locator(".dz-dock").innerText()).match(/Guide 1 \/ \d+/) !== null);
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

  // ---- reload: with all-sites access (this test build has it) the saved edits come back by themselves, and the picker stays on if it was on
  await page.reload();
  await page.waitForLoadState("load");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("go")).backgroundColor === "rgb(34, 34, 34)", null, { timeout: 10000 }).catch(() => {});
  eq("after a reload the saved edits come back by themselves", await css("#go", "backgroundColor"), "rgb(34, 34, 34)");
  await page.locator(".dz-toggle.dz-on").waitFor({ timeout: 8000 }).catch(() => {});
  eq("and the picker, which was on, comes back on by itself", [await page.locator(".dz-toggle").innerText(), await css("#go", "backgroundColor")], ["Design: on", "rgb(34, 34, 34)"]);

  // ---- a page with no saved edits is left completely alone
  const other = await context.newPage();
  await other.goto(url + "another-page");
  await other.waitForTimeout(1500);
  eq("a page with no saved edits gets no picker at all", await other.evaluate(() => !!document.getElementById("design-picker-extension-root")), false);
  await other.close();

  // ---- the toolbar toggle turns it off and on without losing anything
  await activate();
  eq("the toolbar button turns the picker off", await page.locator(".dz-toggle").innerText(), "Design");
  await page.reload();
  await page.waitForLoadState("load");
  await page.waitForTimeout(2500);
  eq("a picker turned off stays off after a reload (the edits still come back)", [await page.locator(".dz-toggle").innerText(), await css("#go", "backgroundColor")], ["Design", "rgb(34, 34, 34)"]);
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
    await settleOn(sp);
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

  // ---- the Position tool: nudge with the arrows, drag to place, exact numbers; one step each, kept across a reload
  {
    const pp = await context.newPage();
    pp.on("pageerror", (error) => console.log("      [page error]", error.message));
    await pp.goto(url + "position");
    await pp.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await pp.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await pp.keyboard.press("Escape");
    const where = () => pp.evaluate(() => { const c = getComputedStyle(document.getElementById("go")); return [c.position, c.left, c.top, c.zIndex].join(" "); });
    const undoKey = async () => { await pp.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); }); await pp.keyboard.press("Control+z"); };

    await pp.locator("#go").click();
    await pp.keyboard.press("Enter");
    await pp.locator(".dz-dock button:text-is('Position')").click();
    eq("Position starts from how the page placed it", await where(), "static auto auto auto");
    for (let i = 0; i < 3; i++) await pp.keyboard.press("ArrowRight");
    await pp.keyboard.press("Shift+ArrowDown");
    eq("arrow keys nudge (1 px, Shift 10 px) and make a static element relative", await where(), "relative 3px 10px auto");
    await undoKey();
    eq("one Ctrl+Z took back the whole run of nudges", await where(), "static auto auto auto");

    const box = await pp.locator("#go").boundingBox();
    await pp.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await pp.mouse.down();
    await pp.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 8 });
    await pp.mouse.up();
    eq("dragging placed the element where the pointer took it", await where(), "relative 40px 25px auto");
    eq("and the click that ends the drag did not change the selection", await pp.locator(".dz-head strong").first().innerText().then((t) => t.startsWith("button")), true);
    await undoKey();
    eq("one Ctrl+Z took back the whole drag", await where(), "static auto auto auto");
    await pp.keyboard.press("Control+Shift+z");
    eq("and Ctrl+Shift+Z did it again", await where(), "relative 40px 25px auto");

    await pp.locator("[aria-label='Stacking order (z-index)']").fill("7");
    eq("the panel's z-index field sets the layer", await where(), "relative 40px 25px 7");

    await pp.keyboard.press("Escape"); await pp.keyboard.press("Escape"); await pp.keyboard.press("Escape");
    await pp.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    const text = await pp.locator(".dz-preview").innerText();
    check("the export has position, top, left and z-index, before and after", /position: static → relative/.test(text) && /left: auto → 40px/.test(text) && /top: auto → 25px/.test(text) && /z-index: auto → 7/.test(text), text.slice(-300));
    await pp.reload();
    await pp.waitForLoadState("load");
    await pp.waitForFunction(() => getComputedStyle(document.getElementById("go")).left === "40px", null, { timeout: 10000 }).catch(() => {});
    eq("after a reload the placement comes back by itself", await where(), "relative 40px 25px 7");

    await pp.locator(".dz-toggle").waitFor();
    await settleOn(pp);
    await pp.locator("#go").click();
    await pp.keyboard.press("Enter");
    await pp.locator(".dz-dock button:text-is('Position')").click();
    await pp.locator(".dz-dock button:text-matches('Back to where')").click();
    eq("'Back to where the page put it' removes the placement", await where(), "static auto auto auto");
    await pp.close();
  }

  // ---- replacing images: a file chooser, a file dropped on a background picture, srcset handled, one undo each, kept across a reload
  {
    const ip = await context.newPage();
    ip.on("pageerror", (error) => console.log("      [page error]", error.message));
    await ip.goto(url + "images");
    await ip.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await ip.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await ip.keyboard.press("Escape");
    const img = () => ip.evaluate(() => { const e = document.getElementById("pic"); return [e.getAttribute("src").slice(0, 14), e.hasAttribute("srcset")].join(" "); });
    const bg = () => ip.evaluate(() => getComputedStyle(document.querySelector(".banner")).backgroundImage);
    const undoKey = async () => { await ip.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); }); await ip.keyboard.press("Control+z"); };
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

    eq("the page's image starts as the page made it", await img(), "/pic.png true");
    await ip.locator("#pic").click();
    await ip.keyboard.press("Enter");
    await ip.locator(".dz-dock button:text-is('Image')").click();
    check("the Image tool says what it will replace", /replace the picture of/.test(await ip.locator(".dz-dock .dz-note").innerText()), await ip.locator(".dz-dock .dz-note").innerText());
    await ip.locator(".dz-file").setInputFiles({ name: "logo-new.png", mimeType: "image/png", buffer: png });
    await ip.waitForFunction(() => document.getElementById("pic").getAttribute("src").startsWith("data:"), null, { timeout: 5000 }).catch(() => {});   // the file is read asynchronously
    eq("choosing a file replaced the image's source and dropped its srcset (which would hide the new one)", await img(), "data:image/png false");
    await undoKey();
    eq("one Ctrl+Z put back the source and the srcset", await img(), "/pic.png true");
    await ip.keyboard.press("Control+Shift+z");
    eq("and Ctrl+Shift+Z swapped it again", await img(), "data:image/png false");

    await ip.keyboard.press("Escape"); await ip.keyboard.press("Escape"); await ip.keyboard.press("Escape");
    await ip.locator(".banner").click();
    check("before the drop the banner has the page's own CSS picture", (await bg()).includes("/pic.png"), await bg());
    await ip.evaluate((bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], "banner-new.png", { type: "image/png" }));
      document.querySelector(".banner").dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
    }, [...png]);
    await ip.waitForFunction(() => getComputedStyle(document.querySelector(".banner")).backgroundImage.startsWith('url("data:image/png'), null, { timeout: 5000 }).catch(() => {});
    check("dropping a file on the selected banner replaced its background picture", (await bg()).startsWith('url("data:image/png;base64'), (await bg()).slice(0, 60));
    await undoKey();
    check("one Ctrl+Z restored the page's own background", (await bg()).includes("/pic.png"), await bg());
    await ip.keyboard.press("Control+Shift+z");
    await ip.waitForFunction(() => getComputedStyle(document.querySelector(".banner")).backgroundImage.startsWith('url("data:image/png'), null, { timeout: 5000 }).catch(() => {});

    await ip.keyboard.press("Escape"); await ip.keyboard.press("Escape"); await ip.keyboard.press("Escape");
    await ip.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    const text = await ip.locator(".dz-preview").innerText();
    check("the export names the file that replaced the image, and shows the background change", /src "\/pic\.png" → "logo-new\.png"/.test(text) && /srcset/.test(text) && /background-image: url\(/.test(text), text);
    await ip.reload();
    await ip.waitForLoadState("load");
    await ip.waitForFunction(() => document.getElementById("pic").getAttribute("src").startsWith("data:image/png"), null, { timeout: 10000 }).catch(() => {});
    eq("after a reload the replaced image comes back by itself", await img(), "data:image/png false");
    await ip.close();
  }

  // ---- screenshot: a PNG of the selected element at the screen's pixel density, or of the visible page when nothing is selected
  {
    const sh = await context.newPage();
    sh.on("pageerror", (error) => console.log("      [page error]", error.message));
    await sh.goto(url + "shot");
    await sh.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await sh.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await sh.keyboard.press("Escape");
    const pngSize = async (download) => {
      const file = await download.path();
      const bytes = fs.readFileSync(file);
      return { signature: bytes.subarray(0, 8).toString("hex"), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), name: download.suggestedFilename() };
    };
    const dpr = await sh.evaluate(() => window.devicePixelRatio);
    await sh.locator(".title").click();
    const box = await sh.locator(".title").boundingBox();
    await sh.keyboard.press("Enter");
    const [shot] = await Promise.all([sh.waitForEvent("download", { timeout: 15000 }), sh.locator(".dz-dock button:text-is('Screenshot')").click()]);
    const one = await pngSize(shot);
    check("Screenshot saved a PNG of just the selected element, at the screen's pixel density", one.signature === "89504e470d0a1a0a" && Math.abs(one.width - Math.round(box.width * dpr)) <= 2 && Math.abs(one.height - Math.round(box.height * dpr)) <= 2 && /\.png$/.test(one.name), JSON.stringify({ one, box, dpr }));
    check("the picker's dock and outlines are back on screen after the shot", await sh.evaluate(() => document.querySelector("#design-picker-extension-root").shadowRoot.querySelector(".dz-root").style.visibility === ""), "still hidden");
    await sh.keyboard.press("Escape"); await sh.keyboard.press("Escape"); await sh.keyboard.press("Escape");
    const [whole] = await Promise.all([sh.waitForEvent("download", { timeout: 15000 }), sh.keyboard.press("Alt+Shift+KeyS")]);
    const all = await pngSize(whole);
    const view = await sh.evaluate(() => [innerWidth, innerHeight]);
    check("with nothing selected, Alt+Shift+S saves the whole visible page", Math.abs(all.width - Math.round(view[0] * dpr)) <= 2 && Math.abs(all.height - Math.round(view[1] * dpr)) <= 2, JSON.stringify({ all, view, dpr }));
    await sh.close();
  }

  // ---- the keyboard layer: a letter opens a tool, the arrow keys nudge (Shift ten, Alt the other way), ? lists everything
  {
    const kp = await context.newPage();
    kp.on("pageerror", (error) => console.log("      [page error]", error.message));
    await kp.goto(url + "keys");
    await kp.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await kp.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await kp.keyboard.press("Escape");
    const card = (prop) => kp.evaluate((p) => getComputedStyle(document.querySelector(".card"))[p], prop);
    const tool = () => kp.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.querySelector(".dz-tools > .dz-menu:not(.dz-states) .dz-menu-button.dz-active"); return a ? a.textContent : ""; });
    const undoKey = async () => { await kp.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); }); await kp.keyboard.press("Control+z"); };

    await kp.locator(".card").click({ position: { x: 3, y: 3 } });
    await kp.keyboard.press("p");
    eq("P opened the Spacing tool", await tool(), "Spacing");
    eq("the card starts with 12 px of padding all round", await card("padding"), "12px");
    const frames = await kp.evaluate(() => {
      const sr = document.querySelector("#design-picker-extension-root").shadowRoot;
      const m = getComputedStyle(sr.querySelector(".dz-margin")), p2 = getComputedStyle(sr.querySelector(".dz-padding"));
      return { margin: [m.borderTopWidth, m.borderLeftWidth], padding: [p2.borderTopWidth, p2.borderLeftWidth], shown: !sr.querySelector(".dz-margin").hidden };
    });
    eq("the box model is drawn while Spacing is open: margin 16 px above, padding 12 px inside", frames, { margin: ["16px", "0px"], padding: ["12px", "12px"], shown: true });
    await kp.keyboard.press("ArrowUp");
    await kp.keyboard.press("Shift+ArrowRight");
    await kp.keyboard.press("Alt+ArrowLeft");
    eq("arrows change one side each: ▲ +1, Shift ▶ +10, Alt ◀ −1", await card("padding"), "13px 22px 12px 11px");
    await kp.keyboard.press("Control+ArrowUp");
    eq("Ctrl ▲ changes all four sides together", await card("padding"), "14px 23px 13px 12px");
    await undoKey();
    eq("one Ctrl+Z took back the whole run of nudges", await card("padding"), "12px");

    await kp.locator(".dz-dock button:text-is('Margin')").click();
    await kp.keyboard.press("ArrowDown");
    eq("the panel can send the arrows to the margin instead", [await card("marginBottom"), await card("paddingBottom")], ["1px", "12px"]);

    await kp.keyboard.press("f");
    eq("F switched to the Font tool", await tool(), "Font");
    const size0 = parseFloat(await card("fontSize"));
    await kp.keyboard.press("ArrowUp");
    await kp.keyboard.press("Shift+ArrowUp");
    await kp.keyboard.press("ArrowRight");
    eq("in Font, ▲ and Shift ▲ change the size, ▶ the letter spacing", [parseFloat(await card("fontSize")) - size0, await card("letterSpacing")], [11, "0.5px"]);

    await kp.keyboard.press("s");
    eq("S switched to the Size tool", await tool(), "Size");
    const width0 = await kp.evaluate(() => Math.round(document.querySelector(".card").getBoundingClientRect().width));
    for (let i = 0; i < 3; i++) await kp.keyboard.press("ArrowRight");
    eq("in Size, ▶ widens the element", await kp.evaluate(() => Math.round(document.querySelector(".card").getBoundingClientRect().width)) - width0, 3);

    await kp.keyboard.press("Escape"); await kp.keyboard.press("Escape"); await kp.keyboard.press("Escape");
    const dockBox = await kp.locator(".dz-dock").boundingBox();
    const headBox = await kp.locator(".dz-dock .dz-head strong").first().boundingBox();
    await kp.mouse.move(headBox.x + 4, headBox.y + 4);
    await kp.mouse.down();
    await kp.mouse.move(headBox.x - 296, headBox.y - 96, { steps: 6 });
    await kp.mouse.up();
    const moved = await kp.locator(".dz-dock").boundingBox();
    check("the dock can be dragged by its header", Math.abs(moved.x - (dockBox.x - 300)) <= 6 && Math.abs(moved.y - (dockBox.y - 100)) <= 6, JSON.stringify({ dockBox, moved }));
    await kp.mouse.dblclick(headBox.x - 296 + 4, headBox.y - 96 + 4);
    const back = await kp.locator(".dz-dock").boundingBox();
    check("and a double-click on the header puts it back in its corner", Math.abs(back.x - dockBox.x) <= 6 && Math.abs(back.y - dockBox.y) <= 6, JSON.stringify({ dockBox, back }));
    await kp.keyboard.press("?");
    const keys = await kp.locator(".dz-keys").innerText();
    check("? lists the shortcuts, grouped, including the ones just used", /Select/.test(keys) && /Spacing/.test(keys) && /Ctrl D/.test(keys) && /Alt Shift S/.test(keys), keys.slice(0, 200));
    await kp.keyboard.press("Escape");
    eq("Esc closes the list", await kp.locator(".dz-keys").count(), 0);
    await kp.close();
  }

  // ---- a modal dialog opened after the picker: the picker stays on top, stays clickable, and can select inside the dialog
  {
    const dp = await context.newPage();
    dp.on("pageerror", (error) => console.log("      [page error]", error.message));
    await dp.goto(url + "dialog");
    await dp.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await dp.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await dp.keyboard.press("Escape");
    const top = () => dp.evaluate(() => {
      const host = document.getElementById("design-picker-extension-root");
      const box = host.shadowRoot.querySelector(".dz-dock").getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + 30, box.top + 30);
      return { inTopLayer: host.matches(":popover-open"), onTop: !!hit && hit.id === "design-picker-extension-root", home: host.parentNode.tagName.toLowerCase() };
    });
    eq("the picker is in the top layer, on top, in the page", await top(), { inTopLayer: true, onTop: true, home: "html" });
    await dp.evaluate(() => document.getElementById("modal").showModal());
    await dp.waitForTimeout(150);
    eq("with a modal dialog open it is still on top (it lives inside the dialog meanwhile)", await top(), { inTopLayer: true, onTop: true, home: "dialog" });
    await dp.locator(".dz-dock .dz-head button:text-is('Keys')").click({ timeout: 4000 });
    eq("and still clickable", await dp.locator(".dz-keys").count(), 1);
    await dp.keyboard.press("Escape");
    await dp.locator(".in-modal").click();
    eq("it can select an element inside the dialog", await dp.locator(".dz-head strong").first().innerText().then((t) => t.startsWith("p")), true);
    await dp.evaluate(() => document.getElementById("modal").close());
    await dp.waitForTimeout(150);
    eq("when the dialog closes the picker goes back to the page", await top(), { inTopLayer: true, onTop: true, home: "html" });
    await dp.close();
  }

  // ---- colour notation in the export: hex, rgb or hsl, only on colour properties, and remembered
  {
    const np = await context.newPage();
    np.on("pageerror", (error) => console.log("      [page error]", error.message));
    await np.goto(url + "notation");
    await np.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await np.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await np.keyboard.press("Escape");
    await np.locator("#go").click();
    await np.keyboard.press("Enter");
    await np.locator(".dz-dock button:text-is('Fill')").click();
    await np.locator(".dz-chip[title*='--ink']").click();   // #222222
    await np.keyboard.press("Escape"); await np.keyboard.press("Escape");
    await np.locator(".dz-dock button:text-is('Text')").click().catch(() => {});
    await np.keyboard.press("Escape"); await np.keyboard.press("Escape"); await np.keyboard.press("Escape");
    await np.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    const out = () => np.locator(".dz-preview").innerText();
    check("by default colours are written as hex", (await out()).includes("background-color: #3366cc → #222222"), await out());
    await np.locator(".dz-dock button:text-is('hsl')").click();
    check("hsl: the same colours as hsl()", (await out()).includes("background-color: hsl(220, 60%, 50%) → hsl(0, 0%, 13%)"), await out());
    await np.locator(".dz-dock button:text-is('rgb')").click();
    check("rgb: as rgb()", (await out()).includes("background-color: rgb(51, 102, 204) → rgb(34, 34, 34)"), await out());
    await np.reload();
    await np.waitForLoadState("load");
    await np.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await np.waitForFunction(() => getComputedStyle(document.getElementById("go")).backgroundColor === "rgb(34, 34, 34)", null, { timeout: 8000 }).catch(() => {});
    await settleOn(np);
    await np.keyboard.press("Escape");
    await np.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    eq("the choice is remembered across a reload", await np.locator(".dz-dock button.dz-active:text-is('rgb')").count(), 1);
    await np.locator(".dz-dock button:text-is('hex')").click();   // the choice is kept for the browser: leave the default for the sections that follow
    const dockBg = () => np.evaluate(() => getComputedStyle(document.querySelector("#design-picker-extension-root").shadowRoot.querySelector(".dz-dock")).backgroundColor);
    await np.locator(".dz-dock button:text-is('light')").click();
    eq("choosing the light look lightens the dock", await dockBg(), "rgb(255, 255, 255)");
    await np.reload();
    await np.waitForLoadState("load");
    await np.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await settleOn(np);
    await np.keyboard.press("Escape");
    eq("and the look is remembered across a reload", await dockBg(), "rgb(255, 255, 255)");
    await np.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    await np.locator(".dz-dock button:text-is('dark')").click();
    eq("the dark look brings the dark dock back", await dockBg(), "rgb(31, 31, 36)");
    await np.close();
  }

  // ---- hover and focus states: edited while shown, written as a rule for the state, undoable, exported, kept across a reload
  {
    const sp = await context.newPage();
    sp.on("pageerror", (error) => console.log("      [page error]", error.message));
    await sp.goto(url + "states");
    await sp.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await sp.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await sp.keyboard.press("Escape");
    const bg = () => sp.evaluate(() => getComputedStyle(document.querySelector(".cta")).backgroundColor);
    const blurDock = () => sp.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); });
    const hoverBg = async () => { await sp.mouse.move(2, 2); await sp.locator(".cta").hover(); await sp.waitForTimeout(600); const value = await bg(); await sp.mouse.move(2, 2); await sp.waitForTimeout(600); return value; };
    eq("the page's own hover look is yellow, and the link is white at rest", [await hoverBg(), await bg()], ["rgb(255, 238, 0)", "rgb(255, 255, 255)"]);
    await sp.locator(".cta").click();
    await sp.keyboard.press("Enter");
    await sp.locator(".dz-states button:text-is('hover')").click();
    await sp.waitForTimeout(600);
    eq("choosing the hover state shows the page's own hover look on the selected element", await bg(), "rgb(255, 238, 0)");
    await sp.locator(".dz-dock button:text-is('Fill')").click();
    await sp.locator(".dz-chip[title*='--ink']").click();
    await sp.waitForTimeout(600);
    eq("a fill in the hover state shows at once", await bg(), "rgb(34, 34, 34)");
    await sp.locator(".dz-states button:text-is('normal')").click();
    await sp.waitForTimeout(600);
    eq("back in the normal state the link is as it was", await bg(), "rgb(255, 255, 255)");
    eq("the real pointer over it now gets the designer's hover fill", await hoverBg(), "rgb(34, 34, 34)");
    eq("the element's own style attribute was never touched", await sp.evaluate(() => document.querySelector(".cta").getAttribute("style")), null);
    await sp.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    const exported = await sp.locator(".dz-preview").innerText();
    check("the export names the state and starts from the page's hover look", /a\.cta:hover[^\n]*\n\s+background-color: #ffee00 → #222222/.test(exported) && exported.includes("A selector ending in :hover"), JSON.stringify(exported));
    await blurDock();
    await sp.keyboard.press("Escape");
    await sp.keyboard.press("Control+z");
    eq("undo takes the hover edit away again", await hoverBg(), "rgb(255, 238, 0)");
    await blurDock();
    await sp.keyboard.press("Control+Shift+z");
    eq("and redo brings it back", await hoverBg(), "rgb(34, 34, 34)");
    await sp.reload();
    await sp.waitForLoadState("load");
    await sp.waitForTimeout(1500);
    eq("after a reload the hover edit is back without the picker", await hoverBg(), "rgb(34, 34, 34)");
    await sp.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await settleOn(sp);
    await sp.keyboard.press("Escape");
    await sp.locator(".cta").click();
    await sp.keyboard.press("Enter");
    await sp.locator(".dz-states button:text-is('focus')").click();
    await sp.locator(".dz-dock button:text-is('Fill')").click();
    await sp.locator(".dz-chip[title*='--ink']").click();
    await sp.locator(".dz-states button:text-is('normal')").click();
    await sp.evaluate(() => document.querySelector(".cta").focus());
    await sp.waitForTimeout(600);
    eq("a focus edit applies when the link has focus", await bg(), "rgb(34, 34, 34)");
    await sp.evaluate(() => document.querySelector(".cta").blur());
    await sp.waitForTimeout(600);
    eq("and not when it has not", await bg(), "rgb(255, 255, 255)");
    await sp.keyboard.press("Escape");
    await sp.locator(".cta").click();
    await sp.keyboard.press("Enter");
    await sp.locator(".dz-states button:text-is('active')").click();
    await sp.locator(".dz-dock button:text-is('Fill')").click();
    await sp.locator(".dz-chip[title*='--ink']").click();
    await sp.locator(".dz-states button:text-is('normal')").click();
    const box = await sp.locator(".cta").boundingBox();
    const holdAt = [box.x + box.width - 4, box.y + box.height / 2];   // the right of the link: the picker's tab on the page's left edge can cover its left end
    await sp.mouse.move(holdAt[0], holdAt[1]);
    await sp.mouse.down();
    const settles = (colour) => sp.waitForFunction((c) => getComputedStyle(document.querySelector(".cta")).backgroundColor === c, colour, { timeout: 4000 }).catch(() => {});   // the link has a colour transition
    await settles("rgb(34, 34, 34)");
    const pressed = await bg();
    const held = await sp.evaluate(([x, y]) => ({ box: [x, y], under: (() => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + e.className + "#" + e.id : null; })(), viewport: [innerWidth, innerHeight], active: document.querySelector(".cta").matches(":active"), hover: document.querySelector(".cta").matches(":hover"), rules: [...document.adoptedStyleSheets].flatMap((sheet) => [...sheet.cssRules].map((r) => r.cssText)).filter((t) => /active/.test(t)).slice(0, 3) }), holdAt);
    if (pressed !== "rgb(34, 34, 34)") console.log("      [diagnostic] while held:", pressed, JSON.stringify(held));
    await sp.mouse.up();
    await sp.mouse.move(2, 2);
    await settles("rgb(255, 255, 255)");
    eq("an active edit applies while the button is held down, and not after", [pressed, await bg()], ["rgb(34, 34, 34)", "rgb(255, 255, 255)"]);
    await sp.keyboard.press("Escape");
    await sp.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    check("Changes lists the hover and the focus edits", (await sp.locator(".dz-change code").allInnerTexts()).join("|").includes("a.cta:hover") && (await sp.locator(".dz-change code").allInnerTexts()).join("|").includes("a.cta:focus"), (await sp.locator(".dz-change code").allInnerTexts()).join("|"));
    await sp.locator(".dz-dock button:text-is('Reset all')").click();
    await sp.waitForTimeout(300);
    eq("Reset all puts both states back", [await hoverBg(), await bg()], ["rgb(255, 238, 0)", "rgb(255, 255, 255)"]);
    await blurDock();
    await sp.keyboard.press("Control+z");
    eq("and one undo brings both back", await hoverBg(), "rgb(34, 34, 34)");
    // the colour square works from the keyboard, and its arrow keys do not walk the selection through the page
    await sp.keyboard.press("Escape");
    await sp.locator(".cta").click();
    await sp.keyboard.press("Enter");
    await sp.locator(".dz-dock button:text-is('Fill')").click();
    await sp.locator(".dz-sv").focus();
    for (let i = 0; i < 5; i++) await sp.keyboard.press("ArrowDown");
    await sp.waitForTimeout(900);
    const grey = (await bg()).match(/\d+/g).map(Number);   // the link's own transition makes the exact start colour vary: it is darker than white and still grey
    eq("arrow keys in the colour square darken the fill, and the selection stays", [grey[0] < 250 && grey[0] === grey[1] && grey[1] === grey[2], (await sp.locator(".dz-head strong").first().innerText()).startsWith("a")], [true, true]);
    // Tab selects elements, not the picker's own controls; F6 is the way into the panel and back out
    await sp.keyboard.press("Escape"); await sp.keyboard.press("Escape"); await sp.keyboard.press("Escape");
    await sp.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); document.body.focus(); });
    await sp.keyboard.press("Tab");
    const label = () => sp.locator(".dz-head strong").first().innerText();
    check("Tab with nothing selected selects the first element on the page", (await label()).startsWith("main"), await label());
    const inDock = () => sp.evaluate(() => !!document.querySelector("#design-picker-extension-root").shadowRoot.activeElement);
    await sp.keyboard.press("F6");
    eq("F6 moves focus into the picker's panel", await inDock(), true);
    await sp.keyboard.press("F6");
    eq("and F6 again moves it back to the page", await inDock(), false);
    await sp.close();
  }

  // ---- the label on the selected element, and bold and italic (buttons and Ctrl+B, Ctrl+I) in the Font tool
  {
    const bp = await context.newPage();
    bp.on("pageerror", (error) => console.log("      [page error]", error.message));
    await bp.goto(url + "bold");
    await bp.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await bp.locator(".dz-toggle").waitFor({ timeout: 8000 });
    await bp.keyboard.press("Escape");
    const look = () => bp.evaluate(() => { const c = getComputedStyle(document.querySelector(".cta")); return [c.fontWeight, c.fontStyle].join(" "); });
    const labelText = () => bp.locator(".dz-selabel").innerText();
    eq("with nothing selected there is no label on the page", await bp.locator(".dz-selabel").isHidden(), true);
    await bp.locator(".cta").click();
    check("selecting an element puts a label with its name and size next to it", /^a\.cta\s+\d+ × \d+$/.test(await labelText()), await labelText());
    const where = await bp.evaluate(() => { const l = document.querySelector("#design-picker-extension-root").shadowRoot.querySelector(".dz-selabel").getBoundingClientRect(), t = document.querySelector(".cta").getBoundingClientRect(); return { labelBottom: l.bottom, linkTop: t.top, labelLeft: l.left, linkLeft: t.left }; });
    check("and the label sits just above the element", where.labelBottom <= where.linkTop + 1 && where.linkTop - where.labelBottom < 8, JSON.stringify(where));
    await bp.keyboard.press("f");
    eq("the link starts regular and upright", await look(), "400 normal");
    await bp.locator(".dz-bold").click();
    eq("the Bold button makes it bold", [await look(), await bp.locator(".dz-bold").getAttribute("aria-pressed")], ["700 normal", "true"]);
    await bp.locator(".dz-bold").click();
    eq("and again takes it away", [await look(), await bp.locator(".dz-bold").getAttribute("aria-pressed")], ["400 normal", "false"]);
    await bp.locator(".dz-italic").click();
    eq("the Italic button makes it italic", [await look(), await bp.locator(".dz-italic").getAttribute("aria-pressed")], ["400 italic", "true"]);
    await bp.keyboard.press("Control+b");
    eq("Ctrl+B toggles bold from the keyboard", await look(), "700 italic");
    await bp.keyboard.press("Control+i");
    eq("Ctrl+I toggles italic from the keyboard", await look(), "700 normal");
    await bp.waitForTimeout(1500);   // edits of one kind within 1.2 s are one undo step: let this one stand alone
    await bp.locator(".dz-italic").click();
    await bp.locator(".dz-dock .dz-head button:text-matches('Changes')").click();
    const exported = await bp.locator(".dz-preview").innerText();
    check("the export has both, as before and after", /font-weight: 400 → 700/.test(exported) && /font-style: normal → italic/.test(exported), JSON.stringify(exported));
    await bp.keyboard.press("Escape");
    await bp.evaluate(() => { const a = document.querySelector("#design-picker-extension-root").shadowRoot.activeElement; if (a) a.blur(); });
    await bp.keyboard.press("Control+z");
    eq("undo takes the italic away again, and only that", await look(), "700 normal");
    await bp.keyboard.press("Control+Shift+z");
    eq("and redo puts it back", await look(), "700 italic");
    // out of view, the label stays at the edge and points the way
    await bp.evaluate(() => { const spacer = document.createElement("div"); spacer.id = "spacer"; spacer.style.height = "3000px"; document.body.append(spacer); window.scrollTo(0, 2500); });
    await bp.waitForTimeout(300);
    check("scrolled out of view, the label stays on screen and points up at it", (await labelText()).startsWith("↑"), await labelText());
    await bp.evaluate(() => { document.getElementById("spacer").remove(); window.scrollTo(0, 0); });
    // and the edits survive a reload without the picker's help
    await bp.reload();
    await bp.waitForLoadState("load");
    await bp.waitForTimeout(2000);
    eq("after a reload bold and italic come back by themselves", await look(), "700 italic");
    await bp.close();
  }

  // ---- the options page shows the shortcut the browser actually assigned, and how to change it
  {
    const op = await context.newPage();
    await op.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
    await op.waitForFunction(() => document.getElementById("shortcut").textContent !== "…", null, { timeout: 5000 });
    check("the options page shows the picker's shortcut (or says it is not set)", /^(Alt\+Shift\+P|not set)$/.test(await op.locator("#shortcut").innerText()), await op.locator("#shortcut").innerText());
    eq("and offers a way to change it", await op.locator("#shortcuts").count(), 1);
    await op.close();
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
  if (process.env.CI) {   // evidence for whoever reads the run: a picture of each open page, and what the dock says
    fs.mkdirSync("test-artifacts", { recursive: true });
    let n = 0;
    for (const open of context.pages()) {
      n++;
      try { await open.screenshot({ path: `test-artifacts/page-${n}.png` }); } catch (_) { /* a closed page */ }
      try { console.log(`      [diagnostic] page ${n} ${open.url()}: dock says`, JSON.stringify(await open.evaluate(() => { const h = document.getElementById("design-picker-extension-root"); return h ? h.shadowRoot.querySelector(".dz-dock").innerText.slice(0, 160) : "(no picker)"; }))); } catch (_) { /* no picker there */ }
    }
  }
  console.log("FAIL  the test stopped:", error.message, String(error.stack || "").split(/\r?\n/).filter((l) => l.includes("e2e.mjs")).slice(0, 2).join(" "));
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
