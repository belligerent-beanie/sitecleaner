// Checks that the documentation still matches the code: node scripts/check-docs.mjs
// No dependencies. Prints "file:line: problem" (and GitHub annotations when run in Actions) and exits 1 if anything is wrong.
//
// What it checks, in the documents listed in DOCS below:
//   links      relative Markdown links point at files that exist, and #anchors at headings that exist
//   paths      a file path written in `code` exists (globs must match something; `file:12` and `file:12-20` must be within the file); a bare name like `host.js`
//              must exist somewhere in the repository (build outputs are listed in GENERATED)
//   commands   `bun run X` names a script in package.json; `node scripts/X.mjs --flag` names a script that exists and mentions every flag; --edition takes a real edition
//   parts      `010`-style numbers name a file in src/parts/
//   names      `camelCase`, `__name` and `call(...)` names appear in the source somewhere
//   both ways  docs/ARCHITECTURE.md and the code agree on: the chrome.* APIs, the message types between the parts, and the storage keys. A new API, message or key that
//              the document does not mention fails here, so the document cannot quietly go stale; a documented one that is gone fails too.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = ["README.md", "CLAUDE.md", ...fs.readdirSync(path.join(root, "docs")).filter((f) => f.endsWith(".md")).map((f) => "docs/" + f)];
const ARCHITECTURE = "docs/ARCHITECTURE.md";
const GENERATED = new Set(["designer.js", "designer-css.js", "manifest.json", "test-output.txt"]);   // made by the build or the tests, not in the repository
const GENERATED_DIRS = ["dist", "dist-studio", "dist-consumer", "releases", "node_modules", "test-artifacts"];
const SOURCE_DIRS = ["src", "extension", "scripts", "test"];

const problems = [];
const fail = (file, line, message) => problems.push({ file, line, message });
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "dist-studio", "dist-consumer", "releases", "site", "test-artifacts"]);   // not the sources; found by walking the folder, so nothing depends on git being on the PATH
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (SKIP_DIRS.has(e.name) ? [] : walk(path.posix.join(dir, e.name))) : [path.posix.join(dir, e.name)]);
const files = walk(".").map((f) => f.replace(/^\.\//, ""));
const fileSet = new Set(files);
const byBase = new Map();
for (const f of files) { const b = path.basename(f); byBase.set(b, [...(byBase.get(b) || []), f]); }
const code = files.filter((f) => SOURCE_DIRS.some((d) => f.startsWith(d + "/")) && /\.(m?js|json|html|css)$/.test(f)).map((f) => read(f)).join("\n");
const lineCount = (rel) => read(rel).split("\n").length - (read(rel).endsWith("\n") ? 1 : 0);
const pkg = JSON.parse(read("package.json"));
const buildSource = read("scripts/build.mjs");
const editions = [...buildSource.matchAll(/^  (\w+): \{ name:/gm)].map((m) => m[1]);

// ---- reading a document: its lines, with the inline code and the headings found in it (fenced blocks are skipped: they are pictures, not claims)
function parse(rel) {
  const lines = read(rel).split("\n");
  const spans = [], links = [], headings = [];
  let fenced = false, section = "";
  lines.forEach((text, i) => {
    if (/^\s*(```|~~~)/.test(text)) { fenced = !fenced; return; }
    if (fenced) return;
    const h = /^(#{1,6}) +(\S.*)$/.exec(text);
    if (h) { section = headingText(h[2]); headings.push({ line: i + 1, text: section }); }
    for (const m of text.matchAll(/`([^`]+)`/g)) spans.push({ line: i + 1, text: m[1], section });
    for (const m of text.replace(/`[^`]*`/g, "").matchAll(/\[[^\]]{0,1000}\]\(([^)\s]{1,1000})(?:\s+"[^"]{0,1000}")?\)/g)) links.push({ line: i + 1, target: m[1] });
  });
  return { lines, spans, links, headings };
}
function headingText(text) {   // "Title ##" is "Title" (CommonMark: the closing hashes must follow a space)
  const t = text.trimEnd();
  let k = t.length;
  while (k > 0 && t[k - 1] === "#") k--;
  return k < t.length && (k === 0 || t[k - 1] === " ") ? t.slice(0, k).trimEnd() : t;
}
const slug = (text) => text.toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-");   // GitHub's anchors
const anchorsOf = (parsed) => { const seen = new Map(), out = new Set(); for (const h of parsed.headings) { const s = slug(h.text); const n = seen.get(s) || 0; seen.set(s, n + 1); out.add(n ? `${s}-${n}` : s); } return out; };
const parsed = new Map(DOCS.map((d) => [d, parse(d)]));

// ---- links
for (const doc of DOCS) {
  for (const { line, target } of parsed.get(doc).links) {
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [pathPart, anchor] = target.split("#");
    const resolved = pathPart ? path.posix.normalize(path.posix.join(path.posix.dirname(doc), pathPart)) : doc;
    if (pathPart && !fileSet.has(resolved) && !files.some((f) => f.startsWith(resolved + "/"))) { fail(doc, line, `link to ${target}: no such file`); continue; }
    if (anchor && resolved.endsWith(".md")) {
      const there = parsed.get(resolved) || parse(resolved);
      if (!anchorsOf(there).has(anchor)) fail(doc, line, `link to ${target}: no heading with that anchor in ${resolved}`);
    }
  }
}

// ---- code spans
const topDirs = new Set(files.map((f) => f.split("/")[0]).filter((f) => files.some((g) => g.startsWith(f + "/"))));
const looksLikePath = (t) => /^[\w@.*-]+(\/[\w@.*-]+)*\.(m?js|json|html|css|md|yml|yaml|txt|png|zip)(:\d+(-\d+)?)?$/.test(t) || (/^(\.\/)?[\w@-]+(\/[\w@.*-]+)+\/?(:\d+(-\d+)?)?$/.test(t) && topDirs.has(t.replace(/^\.\//, "").split("/")[0]));   // `owner/name` is not a path
const globToRegExp = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
function checkPath(doc, line, raw) {
  const m = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(raw);
  let p = m[1].replace(/^\.\//, "").replace(/\/$/, "");
  if (GENERATED.has(p) || GENERATED_DIRS.some((d) => p === d || p.startsWith(d + "/"))) return;
  let found;
  if (!p.includes("/") && !p.includes("*")) {   // a bare file name: anywhere in the repository
    found = byBase.get(p);
  } else if (p.includes("*")) {
    const re = globToRegExp(p);
    found = files.filter((f) => re.test(f));
  } else {
    found = fileSet.has(p) ? [p] : files.some((f) => f.startsWith(p + "/") || (p.startsWith("src/parts/") && f.startsWith(p + "-"))) ? [p] : [];   // a folder, or a part by its number
  }
  if (!found || !found.length) { fail(doc, line, `\`${raw}\`: no such file`); return; }
  if (m[2] && fileSet.has(found[0])) {
    const last = Number(m[3] || m[2]);
    if (last > lineCount(found[0])) fail(doc, line, `\`${raw}\`: ${found[0]} has only ${lineCount(found[0])} lines`);
  }
}
const NOT_USED = new Set(["sidePanel", "offscreen", "debugger", "userScripts", "declarativeNetRequest", "webRequest"]);   // named in the documents as APIs to stay away from
const word = (name) => new RegExp("(^|[^\\w$])" + name.replace(/[$]/g, "\\$") + "([^\\w$]|$)").test(code);
for (const doc of DOCS) {
  for (const { line, text } of parsed.get(doc).spans) {
    if (/[<>{}$…]|\.\.\./.test(text) && !/^`?bun run/.test(text)) continue;   // placeholders and ellipses are not names
    let m;
    if ((m = /^bun run ([\w:-]+)/.exec(text))) { if (!pkg.scripts[m[1]]) fail(doc, line, `\`${text}\`: package.json has no script "${m[1]}"`); continue; }
    const words = text.split(" ").filter(Boolean);
    if (words[0] === "node" && /^scripts\/[\w-]+\.mjs$/.test(words[1] || "")) {   // a command: the script is there and knows every flag
      if (!fileSet.has(words[1])) { fail(doc, line, `\`${text}\`: no such script`); continue; }
      const source = read(words[1]), rest = words.slice(2).join(" ");
      for (const flag of rest.matchAll(/--[a-z][\w-]*/g)) if (!source.includes(flag[0])) fail(doc, line, `\`${text}\`: ${words[1]} does not mention ${flag[0]}`);
      const ed = /--edition +([a-z|]+)/.exec(rest);
      if (ed && words[1] === "scripts/build.mjs") for (const name of ed[1].split("|")) if (!editions.includes(name)) fail(doc, line, `\`${text}\`: no edition called "${name}" (build.mjs has ${editions.join(", ")})`);
      continue;
    }
    if (/^\d{3}$/.test(text)) { if (!files.some((f) => f.startsWith(`src/parts/${text}-`))) fail(doc, line, `\`${text}\`: no file src/parts/${text}-*.js`); continue; }
    if (/^\S+$/.test(text) && looksLikePath(text)) { checkPath(doc, line, text); continue; }
    if ((m = /^(?:window\.)?(__\w+|[a-z]+[A-Z]\w*)(?:\(.*\))?(?:\.\w+)*$/.exec(text)) || (m = /^([A-Za-z_$][\w$]*)\(.*\)$/.exec(text))) {
      if (!NOT_USED.has(m[1]) && !word(m[1])) fail(doc, line, `\`${text}\`: "${m[1]}" is not in the source`);
    }
  }
}

// ---- both ways: docs/ARCHITECTURE.md against the code
if (parsed.has(ARCHITECTURE)) {
  const arch = parsed.get(ARCHITECTURE);
  const archText = read(ARCHITECTURE);
  const extFiles = files.filter((f) => /^extension\/.*\.js$/.test(f));
  const ext = extFiles.map((f) => read(f)).join("\n");
  const inSection = (name) => arch.spans.filter((s) => s.section === name);

  // chrome.* APIs: every namespace.member used must be mentioned (by its member name) in the document; every `ns.member` the document names must still be used
  const noComments = ext.split("\n").map((l) => (l.includes("//") ? l.slice(0, l.indexOf("//")) : l)).join("\n");   // (a line comment, and a web address's // too: harmless here)
  const used = new Set([...noComments.matchAll(/chrome\.([a-zA-Z]{1,40})\.([a-zA-Z]{1,60})/g)].map((m) => `${m[1]}.${m[2]}`).filter((a) => a !== "google.com"));   // (chrome.google.com is a web address)
  const namespaces = new Set([...used].map((a) => a.split(".")[0]));
  const manifest = read("extension/manifest.template.json");
  const nameInDoc = (n) => new RegExp("(^|[^\\w])" + n + "([^\\w]|$)").test(archText);
  for (const api of used) {
    const [ns, member] = api.split(".");
    if (!nameInDoc(ns) || !nameInDoc(member)) fail(ARCHITECTURE, 0, `the code uses chrome.${api} but "Browser APIs used" does not mention ${!nameInDoc(ns) ? ns : member}`);
  }
  for (const { line, text } of inSection("Browser APIs used").length ? arch.spans.filter((s) => s.section === "Browser APIs used") : []) {
    const m = /^([a-zA-Z]+)\.([a-zA-Z]+)$/.exec(text);
    if (m && namespaces.has(m[1]) && !used.has(text) && !manifest.includes(`"${m[2]}"`) && !manifest.includes(`"${m[1]}"`) && !new RegExp(`chrome\\.${m[1]}\\b`).test(ext)) fail(ARCHITECTURE, line, `\`${text}\` is in "Browser APIs used" but the code no longer uses it`);
  }

  // message types: the string passed as `type` between the parts
  const sent = new Set([...ext.matchAll(/sendMessage\([^)]*?\{\s*type:\s*"([\w-]+)"|\.type\s*===?\s*"([\w-]+)"/g)].map((m) => m[1] || m[2]));   // (windows.create has a `type: "popup"` of its own)
  const messageSpans = new Set(arch.spans.filter((s) => s.section === "Messages" && /^[a-z][a-z-]*$/.test(s.text)).map((s) => s.text));
  for (const type of sent) if (!messageSpans.has(type)) fail(ARCHITECTURE, 0, `the code uses the message type "${type}" but the Messages section does not list it`);
  for (const t of messageSpans) if (!sent.has(t)) fail(ARCHITECTURE, arch.spans.find((s) => s.section === "Messages" && s.text === t).line, `message type \`${t}\` is listed but the code does not use it`);

  // storage keys: the first column of the tables under Data
  for (const { line, text } of arch.spans.filter((s) => s.section === "Data")) {
    const m = /^([a-z][a-z-]*)(:|$)/.exec(text);
    if (m && !ext.includes(`"${m[1]}${m[2]}`) && !ext.includes(`"${m[1]}"`) && !ext.includes(`'${m[1]}`)) fail(ARCHITECTURE, line, `storage key \`${text}\` is not in extension/`);
  }
  for (const m of ext.matchAll(/"(dz-[a-z-]+|site:|on-tabs|preview-tabs|keep:)/g)) {
    const key = m[1];
    if (!archText.includes("`" + key)) fail(ARCHITECTURE, 0, `the code uses the storage key "${key}" but "Data" does not list it`);
  }
}

// ---- report
problems.sort((a, b) => (a.file + String(a.line).padStart(6)).localeCompare(b.file + String(b.line).padStart(6)));
const seen = new Set();
for (const p of problems) {
  const text = `${p.file}${p.line ? ":" + p.line : ""}: ${p.message}`;
  if (seen.has(text)) continue;
  seen.add(text);
  console.log(text);
  if (process.env.GITHUB_ACTIONS) console.log(`::error file=${p.file}${p.line ? ",line=" + p.line : ""}::${p.message}`);
}
console.log(problems.length ? `\n${seen.size} problem${seen.size === 1 ? "" : "s"} in the documentation.` : `Documentation checked: ${DOCS.length} documents, no problems.`);
process.exit(problems.length ? 1 : 0);
