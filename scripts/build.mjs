// Builds the unpacked extension: node scripts/build.mjs [--edition designer|consumer] [--out DIR] [--test] [--zip] [--share]
// Two editions are built from the same files: the designer edition (everything; dist/) and the consumer edition (a smaller set of tools; dist-consumer/).
// An edition is a name, a description and a list of features the picker leaves out (see `has` in src/parts/010-where-it-runs.js).
// --zip also writes releases/sitecleaner-<version>.zip, the file the Chrome Web Store takes.
// --share also writes releases/SiteCleaner-<version>-share.zip, the one to hand to people: the extension plus plain-language instructions for installing it in Chrome
// (store/SHARE_README.txt), the licences, and the skill for AIs.
//
// The picker is one script made of the files in src/parts/, joined in name order (they are slices of one closure, so they share its state);
// its stylesheet is src/picker.css wrapped in a script (the picker draws inside a Shadow DOM and takes its CSS from there). The parts of the
// extension that are not the picker (host.js, background.js, restore.js, the options page) live in extension/.
// Minified with esbuild (a dev dependency, used only here: nothing it makes depends on it) unless --no-minify, which keeps the readable files for debugging. Without esbuild installed the build says so and stays readable.
// --test grants host access up front (and so also the all-sites permission previews need), so the end-to-end test can drive the extension without a human clicking the toolbar.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const ext = path.join(root, "extension");
const args = process.argv.slice(2);
const test = args.includes("--test");
const makeZip = args.includes("--zip");
const makeShare = args.includes("--share");
const wantMinify = !args.includes("--no-minify");
let esbuild = null;
if (wantMinify) { try { esbuild = await import("esbuild"); } catch (_) { console.warn("esbuild is not installed (bun install): building without minifying."); } }
const shrink = (code, loader) => (esbuild ? esbuild.transformSync(code, { loader, minify: true, target: "chrome114", legalComments: "none" }).code : code);
const EDITIONS = {
  designer: { name: "SiteCleaner", dir: "dist", zip: "sitecleaner", features: { keep: false },   // the designer edition keeps edits its own way (per page, replayed by the picker)
    description: "Select, restyle, move and measure anything on any page, check contrast, undo it all, and hand the changes to a developer or Claude." },
  consumer: { name: "SiteCleaner Personal", dir: "dist-consumer", zip: "sitecleaner-personal",   // the name is a placeholder: check it before publishing
    features: { find: false, inspector: false, compare: false, preview: false, measure: false, export: false,
      size: false, layout: false, position: false, move: false, image: false, states: false, structure: false,   // tools whose changes cannot be kept (or are for designers)
      plain: true },   // keep is on; plain: everyday words, a short tutorial, a Delete button
    description: "Make any website look the way you like: change colours and text, undo anything, and keep your changes." },
};
const editionName = args.includes("--edition") ? args[args.indexOf("--edition") + 1] : "designer";
if (!EDITIONS[editionName]) throw new Error(`unknown edition "${editionName}": use ${Object.keys(EDITIONS).join(" or ")}`);
const edition = EDITIONS[editionName];
const out = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(root, edition.dir));
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "icons"), { recursive: true });

// ---- the picker (minified unless --no-minify)
const parts = fs.readdirSync(path.join(root, "src", "parts")).filter((name) => name.endsWith(".js")).sort();
fs.writeFileSync(path.join(out, "designer.js"), shrink(parts.map((name) => fs.readFileSync(path.join(root, "src", "parts", name), "utf8")).join("\n"), "js"));
const css = shrink(fs.readFileSync(path.join(root, "src", "picker.css"), "utf8"), "css");
fs.writeFileSync(path.join(out, "designer-css.js"), `window.__designerCss = ${JSON.stringify(css)};\n`);

// ---- the extension's own files
for (const file of ["restore.js", "apply.js", "keep.html", "keep.js", "background.js", "options.html"]) fs.copyFileSync(path.join(ext, file), path.join(out, file));
const marked = /\/\*edition\*\/[\s\S]*?\/\*end\*\//;
for (const file of ["host.js", "options.js"]) {   // the files that need to know which edition they are in
  const source = fs.readFileSync(path.join(ext, file), "utf8");
  if (!marked.test(source)) throw new Error(`extension/${file} has lost its /*edition*/ ... /*end*/ marker`);
  fs.writeFileSync(path.join(out, file), source.replace(marked, () => JSON.stringify({ name: editionName, features: edition.features })));
}
const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.template.json"), "utf8").replace("__VERSION__", version));
manifest.name = edition.name;
manifest.description = edition.description;
if (manifest.description.length > 132) throw new Error(`the manifest description is ${manifest.description.length} characters; the Chrome Web Store allows 132`);
if (test) manifest.host_permissions = ["<all_urls>"];   // the real build asks only for the tab clicked (activeTab), and all sites only if the designer opts in
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// ---- icons: a selection frame and a pointer on indigo, drawn here so there is no image tool to install (Chrome wants PNGs)
const FRAME_OUTER = [[12, 12], [46, 12], [46, 46], [12, 46]];
const FRAME_INNER = [[17, 17], [41, 17], [41, 41], [17, 41]];
const POINTER = [[33, 30], [33, 56], [39.5, 49.5], [44, 59], [49, 56.8], [44.5, 47.5], [53.5, 47.5]];
function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const roundedSquare = (x, y) => {
  const r = 12, cx = Math.min(Math.max(x, r), 64 - r), cy = Math.min(Math.max(y, r), 64 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const sub = 4;   // supersampling for smooth edges
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < sub; sy++) for (let sx = 0; sx < sub; sx++) {
        const x = ((px + (sx + 0.5) / sub) / size) * 64, y = ((py + (sy + 0.5) / sub) / size) * 64;
        if (!roundedSquare(x, y)) continue;
        const [cr, cg, cb] = inside(POINTER, x, y) ? [255, 176, 59] : inside(FRAME_OUTER, x, y) && !inside(FRAME_INNER, x, y) ? [255, 255, 255] : [53, 70, 190];
        r += cr; g += cg; b += cb; a += 255;
      }
      const n = sub * sub, o = py * (size * 4 + 1) + 1 + px * 4;
      const cover = a / 255;
      raw[o] = cover ? Math.round(r / cover) : 0; raw[o + 1] = cover ? Math.round(g / cover) : 0; raw[o + 2] = cover ? Math.round(b / cover) : 0;
      raw[o + 3] = Math.round((cover / n) * 255);
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;   // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const size of [16, 48, 128]) fs.writeFileSync(path.join(out, "icons", `${size}.png`), png(size));

// ---- the zip for the Chrome Web Store
function zipDirectory(dir) {
  const entries = [];
  const walk = (current, prefix) => {
    for (const name of fs.readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (fs.statSync(full).isDirectory()) walk(full, prefix + name + "/");
      else entries.push({ name: prefix + name, data: fs.readFileSync(full) });
    }
  };
  walk(dir, "");
  const locals = [], centrals = [];
  let offset = 0;
  const stamp = new Date(2026, 0, 1);   // a fixed time, so the same sources always make the same zip
  const dosTime = (stamp.getHours() << 11) | (stamp.getMinutes() << 5), dosDate = ((stamp.getFullYear() - 1980) << 9) | ((stamp.getMonth() + 1) << 5) | stamp.getDate();
  for (const { name, data } of entries) {
    const packed = zlib.deflateRawSync(data), nameBuf = Buffer.from(name), sum = crc(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);   // deflate, UTF-8 names
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}
if (makeZip) {
  fs.mkdirSync(path.join(root, "releases"), { recursive: true });
  const zipPath = path.join(root, "releases", `${edition.zip}-${version}.zip`);
  fs.writeFileSync(zipPath, zipDirectory(out));
  console.log(`Wrote ${zipPath}`);
}

if (makeShare) {
  if (test) throw new Error("--share makes the zip for people, which must be the real build: not with --test");
  if (editionName !== "designer") throw new Error("--share is only for the designer edition");
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "sitecleaner-share-"));
  const top = path.join(stage, `SiteCleaner-${version}`);
  fs.mkdirSync(top, { recursive: true });
  fs.cpSync(out, path.join(top, "extension"), { recursive: true });
  const instructions = fs.readFileSync(path.join(root, "store", "SHARE_README.txt"), "utf8").replace(/__VERSION__/g, version).replace(/\r?\n/g, "\r\n");   // CRLF: opens cleanly in Notepad
  fs.writeFileSync(path.join(top, "README - START HERE.txt"), instructions);
  for (const file of ["LICENSE", "NOTICE"]) fs.copyFileSync(path.join(root, file), path.join(top, file));
  fs.mkdirSync(path.join(top, "third_party", "visbug"), { recursive: true });
  for (const file of ["LICENSE", "README.md"]) fs.copyFileSync(path.join(root, "third_party", "visbug", file), path.join(top, "third_party", "visbug", file));
  fs.cpSync(path.join(root, "skills", "sitecleaner-apply"), path.join(top, "for-AI", "sitecleaner-apply"), { recursive: true });
  fs.mkdirSync(path.join(root, "releases"), { recursive: true });
  const sharePath = path.join(root, "releases", `SiteCleaner-${version}-share.zip`);
  fs.writeFileSync(sharePath, zipDirectory(stage));
  fs.rmSync(stage, { recursive: true, force: true });
  console.log(`Wrote ${sharePath}`);
}

console.log(`Built the ${editionName} extension (version ${version}${test ? ", test build" : ""}) in ${out}`);
