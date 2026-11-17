// Stress tests: the cases that were slow or huge before scripts/scale.mjs found them (docs/PERFORMANCE.md), now with limits that fail.
//   node test/stress.mjs          (needs a display; xvfb-run on a server)
// scripts/scale.mjs measures how things grow; this checks that they still do not grow the old way. Each limit sits well between the old number
// and the new one, so a slow machine does not trip it but going back to the old behaviour does.
//   1. many kept sites: the worker registers and syncs them in batches (it was one round trip per site, faster than linear)
//   2. many edits in one designer session: storage is written once the edits pause, not once per edit (N edits wrote N times N bytes)
//   3. many rules on one site: all of them apply, and the page still loads
//   4. a full store: the person gets a plain message (also checked from the Keep window in test/keep.mjs)
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

const SITES = 300, EDITS = 600, RULES = 1500;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sitecleaner-stress-"));
const build = (name, extra) => { const dir = path.join(tmp, name); execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--test", "--out", dir, ...extra], { stdio: "ignore" }); return dir; };

const server = http.createServer((req, res) => {
  const n = Number(new URL(req.url, "http://x").searchParams.get("e")) || 300;
  res.setHeader("content-type", "text/html");
  res.end(`<!doctype html><title>p</title><main>${Array.from({ length: n }, (_, i) => `<div class="item-${i}">t ${i}</div>`).join("")}</main>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = (host) => `http://${host}.test:${server.address().port}`;

async function launch(dist, profile) {
  const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--host-resolver-rules=MAP *.test 127.0.0.1", "--window-size=1200,800"] });
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 20000 }));
  return { context, worker };
}
const colour = (i) => `#${(((i + 1) * 2654435761) >>> 0).toString(16).slice(0, 6).padStart(6, "0")}`;
const rules = (n) => Array.from({ length: n }, (_, i) => ({ s: `.item-${i}`, b: `.item-${i}`, d: `background-color:${colour(i)} !important;` }));
async function seed(worker, hosts, n) {
  for (let i = 0; i < hosts.length; i += 100) {
    const items = {};
    for (const h of hosts.slice(i, i + 100)) items["site:" + origin(h)] = { enabled: true, rules: rules(n), stale: [], updated: Date.now() };
    await worker.evaluate((it) => chrome.storage.local.set(it), items);
  }
}
const timed = (worker) => worker.evaluate(async () => { const t = performance.now(); await syncAllSites(); return performance.now() - t; });
const registered = (worker) => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).filter((s) => s.id.startsWith("site-")).length);

try {
  // ---- 1. many kept sites (before: 24 s to register 500 and 76 s to sync 1,000, because each site was its own round trip)
  {
    const consumer = build("consumer", ["--edition", "consumer"]);
    const profile = fs.mkdtempSync(path.join(tmp, "p-"));
    const a = await launch(consumer, profile);
    await seed(a.worker, Array.from({ length: SITES }, (_, i) => `s${i}`), 20);
    const first = await timed(a.worker);
    check(`${SITES} kept sites are all registered`, (await registered(a.worker)) === SITES, String(await registered(a.worker)));
    check(`registering ${SITES} sites takes under 15 s`, first < 15000, `${Math.round(first)} ms`);
    const again = await timed(a.worker);
    check(`a start-up pass over ${SITES} registered sites takes under 3 s`, again < 3000, `${Math.round(again)} ms`);
    check("and changes nothing", (await registered(a.worker)) === SITES);
    // a few go away, a few are switched off: the batch removes them, and one bad entry does not stop the rest
    await a.worker.evaluate(async (o) => { await chrome.storage.local.remove(o.map((h) => "site:" + h)); }, Array.from({ length: 50 }, (_, i) => origin(`s${i}`)));
    await a.worker.evaluate(() => chrome.storage.local.set({ "site:not an origin": { enabled: true, rules: [{ s: "a", b: "a", d: "color:red;" }] } }));
    await timed(a.worker);
    check("sites that were removed lose their loader, in one pass, past a bad entry", (await registered(a.worker)) === SITES - 50, String(await registered(a.worker)));
    // a page on a kept site still gets its rules with this many loaders registered
    const page = await a.context.newPage();
    await page.goto(`${origin("s100")}/?e=50`);
    const ok = await page.waitForFunction(() => getComputedStyle(document.querySelector(".item-0")).backgroundColor !== "rgba(0, 0, 0, 0)", null, { timeout: 8000 }).then(() => true, () => false);
    check(`a kept site still has its rules put back with ${SITES - 50} loaders registered`, ok);
    await a.context.close();
    // a new browser on the same profile: the start-up pass
    const b = await launch(consumer, profile);
    const start = await timed(b.worker);
    check(`start-up after a restart, ${SITES - 50} sites: under 3 s`, start < 3000, `${Math.round(start)} ms`);
    await b.context.close();
  }

  // ---- 2. many edits in one session (before: 1,000 edits wrote 394 MB; 3,000 took the browser to 16 GB)
  {
    const dir = build("designer", ["--no-minify"]);
    const file = path.join(dir, "designer.js");
    const script = fs.readFileSync(file, "utf8");
    const tail = script.lastIndexOf("})();");
    fs.writeFileSync(file, script.slice(0, tail) + "  window.__prof = { applyFill, changeCount };\n" + script.slice(tail));
    const profile = fs.mkdtempSync(path.join(tmp, "p-"));
    const { context, worker } = await launch(dir, profile);
    const page = await context.newPage();
    const url = `${origin("edits")}/?e=${EDITS}`;
    await page.goto(url, { waitUntil: "load" });
    await page.bringToFront();
    await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await toggle(tab); });
    await page.locator(".dz-toggle").waitFor({ timeout: 8000 });
    const cdp = await context.newCDPSession(page);
    const ctxs = [];
    cdp.on("Runtime.executionContextCreated", (e) => ctxs.push(e.context));
    await cdp.send("Runtime.enable");
    await page.waitForTimeout(300);
    let contextId = null;
    for (const c of ctxs.filter((x) => /^chrome-extension:/.test(x.origin))) { const r = await cdp.send("Runtime.evaluate", { expression: "!!window.__prof", contextId: c.id, returnByValue: true }); if (r.result.value) { contextId = c.id; break; } }
    check("the picker's probe is on the page", contextId !== null);
    const run = async (expression) => { const r = await cdp.send("Runtime.evaluate", { expression, contextId, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
    await run("window.__designerApi.set(true)");
    await run("(() => { window.__writes = { n: 0, bytes: 0 }; const l = chrome.storage.local; const o = l.set.bind(l); l.set = function (items) { window.__writes.n++; try { window.__writes.bytes += JSON.stringify(items).length; } catch (e) {} return o(items); }; })()");
    const t = Date.now();
    for (let from = 0; from < EDITS; from += 60) {   // ten bursts, the way a person edits in runs
      await run(`(() => { const cells = [...document.querySelectorAll('main > div')]; const c = ['#aa3344', '#33aa44', '#3344aa']; for (let i = ${from}; i < ${Math.min(EDITS, from + 60)}; i++) window.__prof.applyFill(cells[i], c[i % 3]); })()`);
    }
    const editsMs = Date.now() - t;
    const writes = await run("window.__writes");
    const mb = writes.bytes / 1048576;
    check(`${EDITS} edits write under 25 MB to storage in all (before: about ${Math.round(EDITS * EDITS * 0.0004 * 1.1)} MB)`, mb < 25, `${mb.toFixed(1)} MB in ${writes.n} writes`);
    check(`${EDITS} edits in ten bursts take under 30 s`, editsMs < 30000, `${editsMs} ms`);
    check("the page shows all of them", (await page.evaluate((n) => [...document.querySelectorAll("main > div")].filter((d) => getComputedStyle(d).backgroundColor !== "rgba(0, 0, 0, 0)").length === n, EDITS)));
    // the last write lands once the edits pause, and a reload puts every one back
    const stored = async () => worker.evaluate(async () => { const all = await chrome.storage.local.get(null); const k = Object.keys(all).find((x) => /^dz|designer/i.test(x) && !/prefs|tour/.test(x)); return k ? JSON.stringify(all[k]).length : 0; });
    let size = 0;
    for (let i = 0; i < 50 && size === 0; i++) { await page.waitForTimeout(100); size = await stored(); }
    check("once the edits pause, the session is in storage", size > EDITS * 20, String(size));
    const restore = await context.newPage();
    await page.close();
    await restore.goto(url, { waitUntil: "load" });
    const back = await restore.waitForFunction((n) => [...document.querySelectorAll("main > div")].filter((d) => getComputedStyle(d).backgroundColor !== "rgba(0, 0, 0, 0)").length === n, EDITS, { timeout: 30000 }).then(() => true, () => false);
    check(`reloading puts back all ${EDITS} edits`, back);
    await context.close();
  }

  // ---- 3. many rules on one site (before: about 0.08 ms of page work per rule above 500, and a flash on big pages)
  {
    const consumer = build("consumer-rules", ["--edition", "consumer"]);
    const profile = fs.mkdtempSync(path.join(tmp, "p-"));
    const { context, worker } = await launch(consumer, profile);
    await seed(worker, ["big"], RULES);
    await timed(worker);
    const page = await context.newPage();
    const t = Date.now();
    await page.goto(`${origin("big")}/?e=${RULES}`, { waitUntil: "load" });
    const loadMs = Date.now() - t;
    check(`a ${RULES}-element page with ${RULES} rules loads in under 10 s`, loadMs < 10000, `${loadMs} ms`);
    const applied = await page.waitForFunction((n) => [...document.querySelectorAll("main > div")].filter((d) => getComputedStyle(d).backgroundColor !== "rgba(0, 0, 0, 0)").length === n, RULES, { timeout: 10000 }).then(() => true, () => false);
    check(`all ${RULES} rules are applied`, applied);
    const first = await page.evaluate(() => getComputedStyle(document.querySelector(".item-0")).backgroundColor);
    const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
    check("a rule sets the colour it was kept with", first === rgb(colour(0)), first);
    // a full store: the message is plain
    const message = await worker.evaluate(() => friendlyError(new Error("Resource::kQuotaBytes quota exceeded")));
    check("a full store reads as plain words", /storage for this extension is full/.test(message) && !/kQuotaBytes/.test(message), message);
    await context.close();
  }
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} stress check(s) failed` : "\nAll stress checks passed");
process.exit(failures ? 1 : 0);
