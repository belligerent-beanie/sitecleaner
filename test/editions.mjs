// The two editions (designer and consumer) are built from the same files: this checks that the consumer one leaves out what it says it does,
// and that the designer one still has all of it. Offline: node test/editions.mjs (needs a display; xvfb-run on a server).
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
    const page = await context.newPage();
    await page.goto(url);
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/*" }); await toggle(tab); });
    await page.locator(".dz-toggle.dz-on").waitFor({ timeout: 8000 });
    const tourTitle = await page.locator(".dz-tour .dz-head strong").innerText();
    const pages = edition === "designer" ? 9 : 3;
    check(`${edition}: the first-run tutorial has ${pages} pages`, tourTitle === `Tutorial 1 / ${pages}`, tourTitle);
    await page.keyboard.press("Escape");   // close the tutorial
    const dock = async () => (await page.locator(".dz-dock").innerText());
    const links = { find: "Find", classes: "Classes", inspector: "Inspect", compare: "Compare", preview: "Preview" };
    const head = await page.locator(".dz-head").innerText();
    const wanted = edition === "designer";
    for (const [feature, text] of Object.entries(links)) {
      check(`${edition}: the ${text} link is ${wanted ? "there" : "left out"}`, new RegExp(`\\b${text}\\b`).test(head) === wanted, head.replace(/\n/g, " "));
    }
    check(`${edition}: undo, Changes and Keys are always there`, /changes/i.test(head) && /Keys/.test(head) && /Undo/i.test(head), head.replace(/\n/g, " "));
    check(`${edition}: the Keep link is ${wanted ? "left out" : "there"}`, /\bKeep\b/.test(head) === !wanted, head.replace(/\n/g, " "));
    await page.keyboard.press("/");
    check(`${edition}: the / key ${wanted ? "opens" : "does not open"} Find`, (await page.locator(".dz-find").count()) === (wanted ? 1 : 0));
    await page.keyboard.press("Escape");
    await page.keyboard.press("?");
    const keys = await dock();
    check(`${edition}: the shortcut list ${wanted ? "has" : "leaves out"} the export key`, /Alt Shift E/.test(keys) === wanted, keys.replace(/\n/g, " ").slice(0, 200));
    check(`${edition}: the shortcut list always has undo`, /Ctrl Z/.test(keys));
    await page.keyboard.press("Escape");
    await page.locator("#h").click();
    await page.keyboard.press("Enter");
    const tools = await page.locator(".dz-dock .dz-tools").innerText();
    const has = (word) => new RegExp(`(^|\\n)${word}(\\n|$)`).test(tools);
    for (const word of wanted ? ["Fill", "Font", "Size", "Layout", "Position", "Move", "Image"] : ["Background", "Text style", "Corners", "Edit words", "Spacing", "Delete"]) check(`${edition}: the ${word} tool is there`, has(word), tools.replace(/\n/g, " | "));
    if (!wanted) for (const word of ["Fill", "Size", "Layout", "Position", "Move", "Image", "hover", "Hover"]) check(`${edition}: ${word} is left out`, !has(word), tools.replace(/\n/g, " | "));
    if (!wanted) {
      await page.keyboard.press("s");   // the Size tool's key does nothing here
      check("consumer: the key of a tool that is left out does nothing", !/Width|Height/.test(await page.locator(".dz-dock").innerText()));
      await page.locator(".dz-dock .dz-tools button:text-is('Delete')").click();
      check("consumer: the Delete button takes the element off the page", (await page.locator("#h").count()) === 0);
      await page.keyboard.press("Control+z");
      check("consumer: and Undo brings it back", (await page.locator("#h").count()) === 1);
      await page.locator(".dz-head button", { hasText: "My changes" }).click();
      const panel = await page.locator(".dz-dock").innerText();
      check("consumer: the changes panel has no export controls", !/Copy|Download|Export|Colours in the export/.test(panel), panel.replace(/\n/g, " | ").slice(0, 200));
    }
    check(`${edition}: the manifest is named for the edition`, manifest.name === (wanted ? "SiteCleaner" : "SiteCleaner Personal"), manifest.name);
  } finally { await context.close(); }
}
// The studio edition: the designer's tools, but for people used to Canva and Figma: whole objects, no selectors, classes or states, and versions
const eq_ = (got, want, name) => check(name, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
async function runStudio() {
  const dist = path.join(os.tmpdir(), `design-picker-edition-studio-${process.pid}`);
  execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--test", "--edition", "studio", "--out", dist], { stdio: "ignore" });
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "design-picker-profile-"));
  const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--window-size=1280,900"] });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
    const page = await context.newPage();
    await page.goto(url);
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1/*" }); await toggle(tab); });
    await page.locator(".dz-toggle.dz-on").waitFor({ timeout: 8000 });
    await page.keyboard.press("Escape");
    const head = await page.locator(".dz-head").innerText();
    for (const text of ["Find", "Classes", "Inspect"]) check(`studio: the ${text} link is left out`, !new RegExp(`\\b${text}\\b`).test(head), head.replace(/\n/g, " "));
    for (const text of ["Versions", "Whole objects", "Compare", "Preview"]) check(`studio: the ${text} link is there`, new RegExp(`\\b${text}\\b`).test(head), head.replace(/\n/g, " "));
    check("studio: the Elements link is there", /\bElements\b/.test(head), head.replace(/\n/g, " "));
    await page.locator(".dz-head button", { hasText: "Elements" }).click();
    const names = await page.locator(".dz-tile-name").allInnerTexts();
    check("studio: the palette lists the page's own heading and paragraph", names.some((n) => /^H1 Hello/.test(n)) && names.includes("Paragraph"), names.join(" | "));
    check("studio: and the basics", ["Heading", "Button", "Picture", "Box"].every((n) => names.includes(n)), names.join(" | "));
    await page.locator(".dz-tile", { hasText: "Box" }).scrollIntoViewIfNeeded();
    const tile = await page.locator(".dz-tile", { hasText: "Box" }).boundingBox();
    const para = await page.locator("body > p").boundingBox();
    await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2);
    await page.mouse.down();
    await page.mouse.move(para.x + 20, para.y + para.height - 2, { steps: 8 });
    const outlined = await page.evaluate(() => { const r = document.querySelector("#design-picker-extension-root").shadowRoot; const box = r.querySelector(".dz-dropparent"), line = r.querySelector(".dz-dropline"); return [!box.hidden, !line.hidden, box.textContent]; });
    check("studio: while dragging, the container it would go into is outlined, with a line for where it lands", outlined[0] && outlined[1] && /into body/.test(outlined[2]), JSON.stringify(outlined));
    await page.mouse.up();
    check("studio: dropping adds the element to the page", (await page.locator("body > div:text-is('Box')").count()) === 1);
    await page.keyboard.press("Control+z");
    check("studio: and Ctrl+Z takes it away", (await page.locator("body > div:text-is('Box')").count()) === 0);
    // a heading cannot hold a box: the drag says so, Shift turns it into a div and drops inside, and one Ctrl+Z puts it all back
    const shadow = (fn, arg) => page.evaluate(fn, arg);
    const ghostText = () => shadow(() => { const g = document.querySelector("#design-picker-extension-root").shadowRoot.querySelector(".dz-ghost"); return g ? g.textContent : ""; });
    await page.locator(".dz-tile", { hasText: "Box" }).scrollIntoViewIfNeeded();
    const boxTile = await page.locator(".dz-tile", { hasText: "Box" }).boundingBox();
    const heading = await page.locator("#h").boundingBox();
    await page.mouse.move(boxTile.x + boxTile.width / 2, boxTile.y + boxTile.height / 2);
    await page.mouse.down();
    await page.mouse.move(heading.x + 20, heading.y + heading.height / 2, { steps: 8 });
    const warned = await ghostText();
    check("studio: over a heading, the drag explains it can only hold text and offers Shift", /A heading can only hold text/.test(warned) && /Shift/.test(warned), warned);
    await page.keyboard.down("Shift");
    await page.mouse.move(heading.x + 22, heading.y + heading.height / 2, { steps: 2 });
    const converting = await ghostText();
    check("studio: with Shift it says the heading becomes a box", /becomes a box/.test(converting), converting);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    check("studio: dropping with Shift turns the heading into a div and puts the box inside", (await page.locator("div#h > div:text-is('Box')").count()) === 1 && (await page.locator("h1#h").count()) === 0);
    await page.keyboard.press("Control+z");
    check("studio: one Ctrl+Z puts the heading back, without the box", (await page.locator("h1#h").count()) === 1 && (await page.locator("div:text-is('Box')").count()) === 0);
    // pictures: a file chosen in the panel becomes a tile, and is dragged on like any element
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await page.locator("input[aria-label='Add picture files']").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: png });
    await page.locator(".dz-tile", { hasText: "dot.png" }).waitFor({ timeout: 5000 });
    const picTile = await page.locator(".dz-tile", { hasText: "dot.png" }).boundingBox();
    const para2 = await page.locator("body > p").boundingBox();
    await page.mouse.move(picTile.x + picTile.width / 2, picTile.y + picTile.height / 2);
    await page.mouse.down();
    await page.mouse.move(para2.x + 20, para2.y + para2.height - 2, { steps: 8 });
    await page.mouse.up();
    check("studio: a picture added from a file can be dragged onto the page", (await page.locator("body > img[alt='dot.png']").count()) === 1);
    await page.keyboard.press("Control+z");
    check("studio: and undone", (await page.locator("body > img[alt='dot.png']").count()) === 0);
    // pictures as backgrounds: the panel's Background mode, and the Image tool on any selected element
    const bgOf = (sel) => page.evaluate((q) => { const c = getComputedStyle(document.querySelector(q)); return [c.backgroundImage.startsWith("url("), c.backgroundSize, c.backgroundRepeat]; }, sel);
    await page.locator(".dz-dock button", { hasText: /^Background$/ }).click();
    const dotTile = await page.locator(".dz-tile", { hasText: "dot.png" }).boundingBox();
    const para3 = await page.locator("body > p").boundingBox();
    await page.mouse.move(dotTile.x + dotTile.width / 2, dotTile.y + dotTile.height / 2);
    await page.mouse.down();
    await page.mouse.move(para3.x + 30, para3.y + para3.height / 2, { steps: 8 });
    const tagText = await page.evaluate(() => document.querySelector("#design-picker-extension-root").shadowRoot.querySelector(".dz-droptag").textContent);
    check("studio: dragging a picture in Background mode says it will be the background", /background of/.test(tagText), tagText);
    await page.mouse.up();
    eq_(await bgOf("body > p"), [true, "cover", "no-repeat"], "studio: dropping a picture in Background mode sets it behind the paragraph, covering it");
    await page.keyboard.press("Control+z");
    check("studio: and Ctrl+Z takes the background away", !(await bgOf("body > p"))[0]);
    await page.waitForTimeout(600);   // a click right after a drag is ignored on purpose
    await page.locator("#h").click();
    await page.locator(".dz-head button", { hasText: "Elements" }).click();   // close the Elements panel: the tools are behind it
    await page.keyboard.press("Enter");
    await page.locator(".dz-dock .dz-tools button", { hasText: /^Image$/ }).click();
    await page.locator("input[aria-label='Choose a background picture']").setInputFiles({ name: "wash.png", mimeType: "image/png", buffer: png });
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#h")).backgroundImage.startsWith("url("), null, { timeout: 5000 }).catch(() => {});
    eq_((await bgOf("#h"))[0], true, "studio: the Image tool puts a picture behind any element, not only one that has a picture");
    await page.locator(".dz-dock button", { hasText: /^Tile$/ }).click();
    eq_(await bgOf("#h"), [true, "auto", "repeat"], "studio: Tile repeats it at its own size");
    await page.locator(".dz-dock button", { hasText: /^Remove$/ }).click();
    check("studio: Remove takes the background picture off", !(await bgOf("#h"))[0]);
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await page.locator(".dz-head button", { hasText: "Elements" }).click();
    const headTile = await page.locator(".dz-tile", { hasText: "H1 Hello" }).getAttribute("title");
    check("studio: a tile's tooltip names where the component sits, with its full classes", /h1/.test(headTile || ""), headTile);
    check("studio: the manifest is named for the edition", manifest.name === "SiteCleaner Studio", manifest.name);
  } finally { await context.close(); }
}
try { await run("designer"); await run("consumer"); await runStudio(); } finally { server.close(); }
console.log(failures ? `${failures} check(s) failed.` : "All edition checks passed.");
process.exit(failures ? 1 : 0);
