// How the extension behaves as the work grows, along the two axes that matter: how many sites have kept changes, and how many changes each one has.
//   node scripts/scale.mjs [sites] [rules] [changes] [limits] [--quick] [--json FILE]
// With no experiment named, all four run. Needs a display (xvfb-run on a server) and, for the memory figures, Windows (they come from the process list).
//   sites    consumer edition, N kept sites with a few rules each: storage, the worker's start-up sync, memory, and what a page load costs on a kept
//            site and on a site that is not kept
//   rules    consumer edition, one site with R rules (and then T retyped-text rules on a page that keeps changing): what the loader costs the page
//   changes  designer edition, M separate edits in one session: the cost of each edit as the session grows, what is stored, the export, and the restore
//   limits   the 10 MB storage quota: how many sites fit, and what the Keep path does when it is full
//   both     sites and rules growing together (they meet in the quota and in the start-up sync)
// Times are medians of several runs, in milliseconds. This measures; it does not judge: docs/PERFORMANCE.md has the judgement.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const quick = argv.includes("--quick");
const jsonFile = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;
const named = argv.filter((a) => ["sites", "rules", "changes", "limits", "both"].includes(a));
const want = (name) => !named.length || named.includes(name);
const SITES = quick ? [1, 10, 50] : [1, 10, 100, 500, 1000];
const RULES = quick ? [10, 100, 500] : [10, 100, 500, 2000, 5000];
const gridArg = argv.find((a) => a.startsWith("--grid="));   // --grid=10,100,300 replaces the changes axis
const CHANGES = gridArg ? gridArg.slice(7).split(",").map(Number) : quick ? [10, 100, 300] : [10, 100, 500, 1000, 3000];
const TEXTS = quick ? [0, 100] : [0, 100, 1000];
const LOADS = quick ? 3 : 5;
const results = {};

// ---------- builds
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sitecleaner-scale-"));
const build = (name, extra) => { const dir = path.join(tmp, name); execFileSync("node", [path.join(root, "scripts", "build.mjs"), "--test", "--out", dir, ...extra], { stdio: "ignore" }); return dir; };
let consumerDist = null, designerDist = null;
function designerWithProbes() {   // the picker with a few of its internals exposed (the way scripts/profile.mjs does), so each can be timed on its own
  const dir = build("designer", ["--no-minify"]);
  const file = path.join(dir, "designer.js");
  const script = fs.readFileSync(file, "utf8");
  const tail = script.lastIndexOf("})();");
  const probe = "  window.__prof = { applyFill, undo, redo, save, exportCompact, exportDetailed, changeCount, pagePalette, buildClassIndex: typeof buildClassIndex === 'function' ? buildClassIndex : null };\n";
  fs.writeFileSync(file, script.slice(0, tail) + probe + script.slice(tail));
  return dir;
}

// ---------- the pages
const rowsHtml = (n, text = true) => { const out = []; for (let i = 0; i < n; i++) out.push(`<div class="item-${i} k${i % 20}">${text ? "t " + i : ""}</div>`); return out.join(""); };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const e = Number(u.searchParams.get("e")) || 300;
  const mut = u.searchParams.get("mut") === "1";
  res.setHeader("content-type", "text/html");
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>p</title><style>body{font:14px sans-serif} .k1{color:#223}</style></head><body><main id="m">${rowsHtml(e)}</main><div id="last" class="item-${e - 1}"></div>
${mut ? `<script>let n=0;const t=setInterval(()=>{for(let i=0;i<5;i++){const s=document.createElement('span');s.textContent='x'+n++;document.getElementById('m').appendChild(s)} if(n>400)clearInterval(t)},40)</script>` : ""}</body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const PORT = server.address().port;
const origin = (host) => `http://${host}.test:${PORT}`;

// ---------- the browser
const INIT = `(() => { if (window.__perf) return; const t = window.__perf = { sheetAt: null, longtasks: 0, longCount: 0, paints: {}, restoredAt: null };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { t.longtasks += e.duration; t.longCount++; } }).observe({ type: "longtask", buffered: true }); } catch (_) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) t.paints[e.name] = e.startTime; }).observe({ type: "paint", buffered: true }); } catch (_) {}
  const poll = () => { const now = performance.now();
    if (t.sheetAt === null && document.adoptedStyleSheets && document.adoptedStyleSheets.length) t.sheetAt = now;
    const last = document.getElementById && document.getElementById("last");
    if (t.restoredAt === null && last && last.dataset.watch && getComputedStyle(last).backgroundColor !== "rgba(0, 0, 0, 0)") t.restoredAt = now;
    if (now < 20000 && (t.sheetAt === null || t.restoredAt === null)) setTimeout(poll, 2); };
  poll(); })();`;
async function launch(dist, profile) {
  const t0 = Date.now();
  const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--host-resolver-rules=MAP *.test 127.0.0.1", "--enable-precise-memory-info", "--window-size=1200,800"] });
  await context.addInitScript(INIT);
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 20000 }));
  return { context, worker, readyMs: Date.now() - t0 };
}
const median = (a) => { const s = [...a].filter((x) => x !== null && x !== undefined).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
function browserMemory() {   // private memory of every process of the browser the harness started, by kind (MB). Windows only.
  try {
    const ps = "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.ExecutablePath -like '*ms-playwright*' } | Select-Object CommandLine,PrivatePageCount | ConvertTo-Json -Compress";
    const raw = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", timeout: 20000 }).trim();
    const list = raw ? [].concat(JSON.parse(raw)) : [];
    const sum = { total: 0, extension: 0, renderer: 0, other: 0 };
    for (const p of list) {
      const mb = (p.PrivatePageCount || 0) / 1048576;
      const cmd = p.CommandLine || "";
      const kind = /--extension-process/.test(cmd) ? "extension" : /--type=renderer/.test(cmd) ? "renderer" : "other";
      sum[kind] += mb; sum.total += mb;
    }
    return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round(v)]));
  } catch (_) { return null; }
}

// ---------- keeping sites, seeded straight into storage (the loader and the worker see exactly what a Keep leaves)
const ruleSet = (R, texts = 0) => {
  const out = Array.from({ length: R }, (_, i) => ({ s: `.item-${i}`, b: `.item-${i}`, d: `background-color:#${(((i + 1) * 2654435761) >>> 0).toString(16).slice(0, 6).padStart(6, "0")} !important;` }));
  for (let i = 0; i < texts; i++) out.push({ k: "text", s: `.item-${R + i}`, b: `.item-${R + i}`, from: `t ${R + i}`, to: `changed ${R + i}` });
  return out;
};
async function seed(worker, hosts, R, texts = 0) {
  for (let i = 0; i < hosts.length; i += 100) {
    const items = {};
    for (const h of hosts.slice(i, i + 100)) items["site:" + origin(h)] = { enabled: true, rules: ruleSet(R, texts), stale: [], updated: Date.now() };
    await worker.evaluate((it) => chrome.storage.local.set(it), items);
  }
}
const sync = (worker) => worker.evaluate(async () => { const t = performance.now(); await syncAllSites(); return performance.now() - t; });
const registered = (worker) => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).filter((s) => s.id.startsWith("site-")).length);
const bytes = (worker) => worker.evaluate(() => chrome.storage.local.getBytesInUse(null));

async function loadMetrics(context, url, settleMs) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(settleMs);
  const m = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; const t = window.__perf; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, fcp: t.paints["first-contentful-paint"] ?? null, sheetAt: t.sheetAt, longTotal: t.longtasks, longCount: t.longCount, heap: performance.memory.usedJSHeapSize / 1048576, text: document.querySelector(".item-0") ? document.querySelector(".item-0").textContent : "" }; });
  const cm = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  await page.close();
  return { ...m, task: cm.TaskDuration * 1000, script: cm.ScriptDuration * 1000, style: cm.RecalcStyleDuration * 1000, layout: cm.LayoutDuration * 1000 };
}
async function repeat(context, url, n, settleMs) {
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(await loadMetrics(context, url, settleMs));
  const med = (k) => r1(median(runs.map((r) => r[k])));
  return { dcl: med("dcl"), load: med("load"), fcp: med("fcp"), sheetAt: med("sheetAt"), longTotal: med("longTotal"), longCount: med("longCount"), task: med("task"), script: med("script"), style: med("style"), layout: med("layout"), heap: med("heap") };
}
const table = (title, rows) => { console.log(`\n${title}`); console.table(rows); };

// =====================================================================================================================================
// 1. how many sites
// =====================================================================================================================================
async function sitesExperiment(points = SITES.map((n) => [n, 20]), title = "1. Number of kept sites (20 rules each, a 300-element page)", key = "sites") {
  consumerDist ||= build("consumer", ["--edition", "consumer"]);
  const rows = [];
  for (const [N, RPS] of points) {
    const profile = fs.mkdtempSync(path.join(tmp, "p-"));
    const hosts = Array.from({ length: N }, (_, i) => `s${i}`);
    let a = await launch(consumerDist, profile);
    const seedStart = Date.now();
    await seed(a.worker, hosts, RPS);
    const seedMs = Date.now() - seedStart;
    const firstSync = await sync(a.worker);          // registers N loaders
    const secondSync = await sync(a.worker);         // what a start-up pass costs once they are registered
    const store = await bytes(a.worker);
    const count = await registered(a.worker);
    const memA = browserMemory();
    const kept = await repeat(a.context, `${origin("s0")}/?e=300`, LOADS, 600);
    const unkept = await repeat(a.context, `${origin("u0")}/?e=300`, LOADS, 600);
    await a.context.close();
    // a new browser on the same profile: what a start costs
    const b = await launch(consumerDist, profile);
    const startSync = await sync(b.worker);
    const memB = browserMemory();
    await b.context.close();
    rows.push({ sites: N, "rules each": RPS, "seed ms": seedMs, "storage KB": Math.round(store / 1024), registered: count, "register-all ms": r1(firstSync), "start-up sync ms": r1(startSync), "re-sync ms": r1(secondSync),
      "browser MB": memA && memA.total, "extension proc MB": memA && memA.extension, "browser MB after restart": memB && memB.total, "extension proc MB after restart": memB && memB.extension,
      "kept load ms": kept.load, "unkept load ms": unkept.load, "kept FCP ms": kept.fcp, "rules applied at ms": kept.sheetAt, "kept task ms": kept.task, "unkept task ms": unkept.task, "kept heap MB": kept.heap, "unkept heap MB": unkept.heap });
    console.log("  ROW " + JSON.stringify(rows[rows.length - 1]));
  }
  table(title, rows);
  results[key] = rows;
}

// =====================================================================================================================================
// 2. how many rules on one site
// =====================================================================================================================================
async function rulesExperiment() {
  consumerDist ||= build("consumer", ["--edition", "consumer"]);
  const profile = fs.mkdtempSync(path.join(tmp, "p-"));
  const { context, worker } = await launch(consumerDist, profile);
  const E = quick ? 2000 : 5000;
  const rows = [];
  for (const R of RULES.filter((r) => r <= E)) {
    const host = `r${R}`;
    await seed(worker, [host], R);
    await sync(worker);
    const base = await repeat(context, `${origin("base" + R)}/?e=${E}`, LOADS, 4200);   // the same page, not kept, measured next to the kept one each time
    const kept = await repeat(context, `${origin(host)}/?e=${E}`, LOADS, 4200);
    const size = await worker.evaluate((k) => chrome.storage.local.getBytesInUse(k), "site:" + origin(host));
    const saveMs = await worker.evaluate(async ({ o, rules }) => { const t = performance.now(); await saveSite(o, rules); return performance.now() - t; }, { o: origin(host), rules: ruleSet(R) });
    rows.push({ rules: R, "entry KB": r1(size / 1024), "save (merge) ms": r1(saveMs), "load ms": kept.load, "unkept load ms": base.load, "rules applied at ms": kept.sheetAt, "FCP ms": kept.fcp, "unkept FCP ms": base.fcp,
      "long tasks ms": kept.longTotal, "unkept long tasks ms": base.longTotal, "main-thread ms": kept.task, "unkept main-thread ms": base.task, "script ms": kept.script, "style recalc ms": kept.style, "unkept style ms": base.style, "page heap MB": kept.heap, "unkept heap MB": base.heap });
    console.log("  ROW " + JSON.stringify(rows[rows.length - 1]));
  }
  table(`2a. Rules on one site (a ${E}-element page; the loader runs a querySelector per rule at load and again 3 s later)`, rows);
  results.rules = rows;
  // retyped text on a page that keeps changing
  const trows = [];
  for (const T of TEXTS) {
    const host = `t${T}`;
    await seed(worker, [host], 100, T);
    await sync(worker);
    const kept = await repeat(context, `${origin(host)}/?e=${E}&mut=1`, LOADS, 4200);
    trows.push({ "text rules": T, "long tasks ms": kept.longTotal, "long task count": kept.longCount, "main-thread ms": kept.task, "script ms": kept.script, "load ms": kept.load, "page heap MB": kept.heap });
  }
  const baseMut = await repeat(context, `${origin("basemut")}/?e=${E}&mut=1`, LOADS, 4200);
  trows.unshift({ "text rules": "(not kept)", "long tasks ms": baseMut.longTotal, "long task count": baseMut.longCount, "main-thread ms": baseMut.task, "script ms": baseMut.script, "load ms": baseMut.load, "page heap MB": baseMut.heap });
  table(`2b. Retyped-text rules, on a ${E}-element page that adds 400 nodes over 3 s (the loader re-checks every text rule after each burst of changes)`, trows);
  results.texts = trows;
  await context.close();
}

// =====================================================================================================================================
// 3. how many changes in one designer session
// =====================================================================================================================================
async function changesExperiment() {
  designerDist ||= designerWithProbes();
  const rows = [];
  const MAX_MB = Number((argv.find((a) => a.startsWith("--max-mb=")) || "").slice(9)) || 4000;   // a point is stopped when the browser holds more than this
  const scenarios = argv.includes("--no-bulk") ? ["separate"] : ["separate", "bulk"];
  for (const scenario of scenarios) {
    for (const M of CHANGES) {
      const profile = fs.mkdtempSync(path.join(tmp, "p-"));
      const { context, worker } = await launch(designerDist, profile);
      const page = await context.newPage();
      const url = `${origin("d" + scenario + M)}/?e=${Math.max(M, 300)}`;
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
      for (const c of ctxs.filter((x) => /^chrome-extension:/.test(x.origin))) { const ok = await cdp.send("Runtime.evaluate", { expression: "!!window.__prof", contextId: c.id, returnByValue: true }); if (ok.result.value) { contextId = c.id; break; } }
      if (contextId === null) throw new Error("the picker's probe was not found in the page");
      const run = async (expression) => { const r = await cdp.send("Runtime.evaluate", { expression, contextId, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : "evaluation failed"); return r.result.value; };
      await run("window.__designerApi.set(true)");
      // count what is written to storage: how many writes, and how many bytes in all
      await run("(() => { window.__writes = { n: 0, bytes: 0 }; const l = chrome.storage.local; const o = l.set.bind(l); l.set = function (items) { window.__writes.n++; try { window.__writes.bytes += JSON.stringify(items).length; } catch (e) {} return o(items); }; return true; })()");
      const heap0 = await page.evaluate(() => performance.memory.usedJSHeapSize / 1048576);
      const mem0 = browserMemory();
      const curve = [];
      const blocks = [];
      let done = 0, aborted = false;
      const colours = "['#aa3344', '#33aa44', '#3344aa']";
      if (scenario === "separate") {   // M separate edits, each a different element
        const chunk = Math.max(1, Math.floor(M / 10));
        while (done < M) {
          const n = Math.min(chunk, M - done);
          blocks.push(await run(`(() => { const P = window.__prof; const cells = [...document.querySelectorAll('main > div')]; const c = ${colours}; const t = performance.now(); for (let i = ${done}; i < ${done + n}; i++) P.applyFill(cells[i], c[i % 3]); return performance.now() - t; })()`));
          done += n;
          const m = browserMemory(); curve.push(m ? m.total : null);
          if (m && m.total > MAX_MB) { aborted = true; break; }
        }
      } else {   // one action on M selected elements (Find, Select similar, Tone, Paste look: one gesture, M elements)
        blocks.push(await run(`(() => { const P = window.__prof; const cells = [...document.querySelectorAll('main > div')].slice(0, ${M}); const t = performance.now(); P.applyFill(cells, '#aa3344'); return performance.now() - t; })()`));
        done = M;
        const m = browserMemory(); curve.push(m ? m.total : null);
      }
      const writes = await run("window.__writes");
      const memPeak = browserMemory();
      await page.waitForTimeout(1500);
      const memAfter = browserMemory();
      const storedBytes = await worker.evaluate(() => chrome.storage.local.getBytesInUse(null));
      const heap1 = await page.evaluate(() => performance.memory.usedJSHeapSize / 1048576);
      let exportTimes = null, restoredAt = null;
      if (!aborted) {
        exportTimes = await run(`(() => { const P = window.__prof; const t = performance.now(); const c = P.exportCompact(); const t1 = performance.now(); const d = P.exportDetailed(); const t2 = performance.now(); const s0 = performance.now(); P.save(); const s1 = performance.now(); return { compact: t1 - t, compactLen: c.length, detailed: t2 - t1, detailedLen: d.length, save: s1 - s0 }; })()`);
        const restore = await context.newPage();
        await page.close();
        await restore.goto(url, { waitUntil: "load" });
        restoredAt = await restore.evaluate((n) => new Promise((resolve) => {   // from the start of the navigation until the last edited element has its colour again
          const poll = () => { const c = document.querySelectorAll("main > div")[n - 1]; if (c && getComputedStyle(c).backgroundColor !== "rgba(0, 0, 0, 0)") resolve(performance.now()); else if (performance.now() > 40000) resolve(null); else setTimeout(poll, 5); };
          poll();
        }), M);
      }
      await context.close();
      const per = Math.max(1, Math.floor(M / 10));
      const row = { scenario, changes: M, done, aborted, "session ms": r1(blocks.reduce((a, b) => a + b, 0)), "ms per edit": r1(blocks.reduce((a, b) => a + b, 0) / Math.max(1, done)),
        "first tenth ms/edit": scenario === "separate" ? r1(blocks[0] / per) : null, "last tenth ms/edit": scenario === "separate" ? r1(blocks[blocks.length - 1] / per) : null,
        "storage writes": writes.n, "MB written in all": r1(writes.bytes / 1048576), "stored KB": Math.round(storedBytes / 1024),
        "browser MB before": mem0 && mem0.total, "browser MB peak": memPeak && memPeak.total, "browser MB 1.5 s later": memAfter && memAfter.total, "memory curve MB": curve.join(" "), "page heap MB (+)": r1(heap1 - heap0),
        "compact export ms": exportTimes && r1(exportTimes.compact), "compact chars": exportTimes && exportTimes.compactLen, "detailed export ms": exportTimes && r1(exportTimes.detailed), "detailed chars": exportTimes && exportTimes.detailedLen, "one save ms": exportTimes && r1(exportTimes.save), "restored after reload at ms": r1(restoredAt) };
      rows.push(row);
      console.log("  ROW " + JSON.stringify(row));
    }
  }
  table("3. Changes in one designer session", rows);
  results.changes = rows;
}

// =====================================================================================================================================
// 4. the storage quota
// =====================================================================================================================================
async function limitsExperiment() {
  consumerDist ||= build("consumer", ["--edition", "consumer"]);
  const profile = fs.mkdtempSync(path.join(tmp, "p-"));
  const { context, worker } = await launch(consumerDist, profile);
  const quota = await worker.evaluate(() => chrome.storage.local.QUOTA_BYTES);
  const out = { quotaMB: quota / 1048576 };
  // how many typical sites fit: keep adding sites of 20 rules until the browser refuses
  let n = 0;
  try { for (;;) { await seed(worker, Array.from({ length: 200 }, (_, i) => `q${n + i}`), 20); n += 200; if (n > 60000) break; } } catch (e) { out.refusedWith = String(e.message).slice(0, 100); }
  out.sitesOf20Rules = n;
  out.bytesUsed = await bytes(worker);
  await context.close();
  // how big one site can get: rules are validated per Keep (2000 at most) but a site grows by Keeping again: find where one entry is refused
  const p2 = fs.mkdtempSync(path.join(tmp, "p-"));
  const b = await launch(consumerDist, p2);
  const o = origin("big");
  let kept = 0, error = null;
  const rules = (from, count) => Array.from({ length: count }, (_, i) => ({ s: `.item-${from + i}`, b: `.item-${from + i}`, d: `background-color:#${(((from + i + 1) * 2654435761) >>> 0).toString(16).slice(0, 6).padStart(6, "0")} !important;` }));
  try { while (kept < 400000) { await b.worker.evaluate(async ({ o, rules }) => { await saveSite(o, rules); }, { o, rules: rules(kept, 2000) }); kept += 2000; } } catch (e) { error = String(e.message).slice(0, 120); }
  out.oneSiteRules = kept; out.oneSiteError = error;
  out.syncAtLimitMs = r1(await sync(b.worker));
  // the message the Keep button shows when the browser refuses
  out.keepMessageWhenFull = await b.worker.evaluate(async (o) => { try { await saveSite(o, [{ s: ".z", b: ".z", d: "color:red !important;" }]); return "(saved)"; } catch (e) { return String(e.message).slice(0, 140); } }, o);
  await b.context.close();
  console.log("\n4. Storage limits");
  console.log(JSON.stringify(out, null, 1));
  results.limits = out;
}

try {
  if (want("sites")) await sitesExperiment();
  if (want("both")) await sitesExperiment(quick ? [[20, 200], [50, 100]] : [[50, 2000], [100, 500], [300, 200]], "1b. Sites and rules growing together (a 300-element page; the quota holds about 130,000 rules in all)", "both");
  if (want("rules")) await rulesExperiment();
  if (want("changes")) await changesExperiment();
  if (want("limits")) await limitsExperiment();
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (jsonFile) fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2));
