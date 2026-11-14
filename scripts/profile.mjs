// Times the picker's heavier operations on a large page: node scripts/profile.mjs [elements]
// Loads the picker (plain-page host, no extension) with a few of its internals exposed, so each operation can be timed on its own.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const count = Number(process.argv[2]) || 20000;
const parts = fs.readdirSync(path.join(root, "src", "parts")).filter((n) => n.endsWith(".js")).sort();
let script = parts.map((n) => fs.readFileSync(path.join(root, "src", "parts", n), "utf8")).join("\n");
const tail = script.lastIndexOf("})();");
script = script.slice(0, tail) + "  window.__prof = { pagePalette, findMatches, setSelection, refreshBoxes, targets, applyFill, setOn, invalidatePalette: () => { paletteCache = null; } };\n" + script.slice(tail);
const css = fs.readFileSync(path.join(root, "src", "picker.css"), "utf8");

const rows = [];
for (let i = 0; i < count / 4; i++) rows.push(`<div class="row r${i % 50}" style="padding:${i % 7}px"><span class="a">item ${i}</span><a href="#${i}" class="lnk">link ${i}</a><p class="t">text ${i} lorem ipsum</p></div>`);
const PAGE = `<!doctype html><meta charset=utf-8><style>:root{--brand:#3546be;--ink:#222}.row{color:var(--ink);border:1px solid #ccc}.lnk{color:var(--brand)}.r3{background:#fee}</style><body>${rows.join("")}</body>`;
const server = http.createServer((_q, res) => { res.setHeader("content-type", "text/html"); res.end(PAGE); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.evaluate((css) => { window.__designerCss = css; }, css);
await page.addScriptTag({ content: script });
const result = await page.evaluate((n) => {
  const P = window.__prof, out = {}, time = (name, fn, reps = 3) => { const t = []; for (let i = 0; i < reps; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); } out[name] = Math.round(Math.min(...t) * 10) / 10; };
  out.elements = document.body.querySelectorAll("*").length;
  time("palette (uncached)", () => { P.invalidatePalette(); P.pagePalette(); });
  time("find: selector .row", () => P.findMatches(".row"));
  time("find: words (no selector)", () => P.findMatches("lorem ipsum 4999"));
  const many = P.findMatches(".row");
  P.setSelection(many);
  P.setOn(true);
  time("refreshBoxes with 300 selected", () => P.refreshBoxes());
  time("applyFill on 300 selected", () => P.applyFill(many, "#336699"));
  return out;
}, count);
console.log(JSON.stringify(result, null, 1));
await browser.close(); server.close();
