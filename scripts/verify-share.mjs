// Checks the zips of a build the way a person would use them: unzip each share zip, look at what is inside, and load both extensions into one
// real browser at the same time from the folders the instructions tell people to choose.
//   node scripts/verify-share.mjs 0.4.1-beta.1        (the version as it appears in the file names; no argument: the version in package.json)
// Exit code 1 if anything is wrong. Needs a display (xvfb-run on a server), like the other browser tests.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const label = process.argv[2] || JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const numeric = label.replace(/-.*$/, "");   // the manifest's version is plain digits; a beta adds version_name
let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + detail}`); if (!ok) failures++; };

const unzip = (zip, to) => {
  if (process.platform === "win32") execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath "${zip}" -DestinationPath "${to}" -Force`]);
  else execFileSync("unzip", ["-q", "-o", zip, "-d", to]);
};
const tree = (dir, prefix = "") => fs.readdirSync(dir).flatMap((name) => { const full = path.join(dir, name); return fs.statSync(full).isDirectory() ? tree(full, prefix + name + "/") : [prefix + name]; });
const editions = [
  { name: "designer", share: `SiteCleaner-${label}-share.zip`, store: `sitecleaner-${label}.zip`, folder: `SiteCleaner-${label}`, title: "SiteCleaner", skill: true, perms: ["activeTab", "scripting", "storage"], mentions: "Classes" },
  { name: "personal", share: `SiteCleaner-Personal-${label}-share.zip`, store: `sitecleaner-personal-${label}.zip`, folder: `SiteCleaner-Personal-${label}`, title: "SiteCleaner Personal", skill: false, perms: ["activeTab", "scripting", "storage", "contextMenus"], mentions: "Keep" },
];

const work = fs.mkdtempSync(path.join(os.tmpdir(), "verify-share-"));
const loaded = [];
try {
  for (const e of editions) {
    const dest = path.join(work, e.name); fs.mkdirSync(dest);
    for (const f of [e.share, e.store]) if (!fs.existsSync(path.join(root, "releases", f))) { check(`${f} exists`, false, "build it first"); }
    if (failures) continue;
    unzip(path.join(root, "releases", e.share), dest);
    const top = path.join(dest, fs.readdirSync(dest)[0]);
    const files = tree(top);
    const manifest = JSON.parse(fs.readFileSync(path.join(top, "extension", "manifest.json"), "utf8"));
    const readme = fs.readFileSync(path.join(top, "README - START HERE.txt"), "utf8");
    const store = path.join(dest, "_store"); fs.mkdirSync(store); unzip(path.join(root, "releases", e.store), store);
    check(`${e.name}: top folder is ${e.folder}`, path.basename(top) === e.folder, path.basename(top));
    check(`${e.name}: the skill for AIs is ${e.skill ? "" : "not "}included`, files.some((f) => f.startsWith("for-AI/")) === e.skill);
    check(`${e.name}: instructions name this version, use Windows line ends and have no placeholders`, readme.split("\r\n")[0] === `${e.title} ${label}` && !/[^\r]\n/.test(readme) && !readme.includes("__VERSION__"), readme.split("\r\n")[0]);
    check(`${e.name}: instructions mention ${e.mentions}`, readme.includes(e.mentions));
    check(`${e.name}: manifest is ${e.title} ${numeric}${label === numeric ? "" : " (" + label + ")"} with the expected permissions`, manifest.name === e.title && manifest.version === numeric && (label === numeric || manifest.version_name === label) && JSON.stringify(manifest.permissions) === JSON.stringify(e.perms) && !manifest.host_permissions, JSON.stringify({ n: manifest.name, v: manifest.version, vn: manifest.version_name, p: manifest.permissions }));
    check(`${e.name}: extension/ is identical to the store package`, tree(store).every((f) => fs.existsSync(path.join(top, "extension", f)) && fs.readFileSync(path.join(store, f)).equals(fs.readFileSync(path.join(top, "extension", f)))));
    loaded.push(path.join(top, "extension"));
  }
  if (!failures) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "verify-share-profile-"));
    const context = await chromium.launchPersistentContext(profile, { headless: false, args: [`--disable-extensions-except=${loaded.join(",")}`, `--load-extension=${loaded.join(",")}`] });
    try {
      await context.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      const workers = context.serviceWorkers();
      check("both extensions load at once, each with its own service worker", workers.length === 2, String(workers.length));
      const names = [];
      for (const w of workers) {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${new URL(w.url()).host}/options.html`);
        await page.waitForTimeout(300);
        names.push(await page.locator("h1").first().innerText());
        await page.close();
      }
      check("each has its own options page", names.slice().sort().join() === ["SiteCleaner", "SiteCleaner Personal"].join(), names.join(", "));
    } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  }
} finally { fs.rmSync(work, { recursive: true, force: true }); }
console.log(failures ? `${failures} check(s) failed.` : `The ${label} zips check out.`);
process.exit(failures ? 1 : 0);
