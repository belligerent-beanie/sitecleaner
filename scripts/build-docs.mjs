// Builds the documentation site: node scripts/build-docs.mjs [--out DIR]   (default site/; published by .github/workflows/pages.yml)
// No dependencies: the documents use a small, plain subset of Markdown (headings, paragraphs, lists, tables, code, links, images, quotes), converted here,
// so the publishing chain is this file and GitHub's own actions, nothing fetched from a package registry.
// The README is the home page; the other pages are listed in PAGES. Links between pages are rewritten to the pages, links to other files in the repository go to
// GitHub, and pictures are copied next to the pages. The build fails if Markdown syntax is left over in the output, so a construct this does not handle is noticed, not published.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const out = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(root, "site"));
const REPO = "belligerent-beanie/sitecleaner";
const BLOB = `https://github.com/${REPO}/blob/main/`;
const TREE = `https://github.com/${REPO}/tree/main/`;
const PAGES = [   // [source, page, nav label]; CLAUDE.md is instructions for an AI, not a page
  ["README.md", "index.html", "Home"],
  ["docs/OVERVIEW.md", "OVERVIEW.html", "Overview"],
  ["docs/ARCHITECTURE.md", "ARCHITECTURE.html", "Architecture"],
  ["docs/EDITIONS.md", "EDITIONS.html", "Editions"],
  ["docs/CI_DESIGN.md", "CI_DESIGN.html", "Continuous integration"],
  ["docs/PERFORMANCE.md", "PERFORMANCE.html", "Performance"],
  ["store/PRIVACY.md", "PRIVACY.html", "Privacy"],
];
const pageOf = new Map(PAGES.map(([src, page]) => [src, page]));
const sha = (process.env.GITHUB_SHA || "").slice(0, 7);   // set in Actions; empty on a developer's machine, where the footer then leaves it out
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (text) => text.toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-");   // GitHub's anchors, the ones the documents link to
const copied = new Set();

// Small helpers instead of one big pattern each: patterns with neighbouring quantifiers that can match the same characters backtrack badly on odd input.
const OPEN_HEADING = /^(#{1,6}) +(\S.*)$/;
function headingText(text) {   // "Title ##" is "Title" (CommonMark: the closing hashes must follow a space)
  let t = text.trimEnd(), k = t.length;
  while (k > 0 && t[k - 1] === "#") k--;
  if (k < t.length && (k === 0 || t[k - 1] === " ")) t = t.slice(0, k).trimEnd();
  return t;
}
const cells = (line) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const isSeparator = (line, columns) => { const cs = cells(line); return cs.length === columns && cs.every((c) => /^:?-{3,}:?$/.test(c)); };   // | --- | :---: |

// ---- inline: code first (nothing inside it is touched), then images, links, bold, italic
function inline(text, from) {
  const codes = [];
  let t = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${esc(c)}</code>`); return `\uE000${codes.length - 1}\uE001`; });
  t = esc(t);
  t = t.replace(/!\[([^\]]{0,1000})\]\(([^)\s]{1,1000})(?:\s+&quot;[^&]{0,1000}&quot;)?\)/g, (_, alt, src) => `<img src="${asset(src, from)}" alt="${alt}" loading="lazy">`);
  t = t.replace(/\[([^\]]{1,1000})\]\(([^)\s]{1,1000})(?:\s+&quot;[^&]{0,1000}&quot;)?\)/g, (_, label, href) => `<a href="${link(href, from)}">${label}</a>`);
  t = t.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, "$1<em>$2</em>").replace(/(^|[^\w])_([^_\s][^_]*?)_(?![\w])/g, "$1<em>$2</em>");
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:])/g, '$1<a href="$2">$2</a>');
  return t.replace(/\uE000(\d+)\uE001/g, (_, i) => codes[Number(i)]);
}
const resolveFrom = (target, from) => path.posix.normalize(path.posix.join(path.posix.dirname(from), target));
function link(href, from) {
  const unesc = href.replace(/&amp;/g, "&");
  if (/^(https?:|mailto:)/.test(unesc)) return href;
  if (unesc.startsWith("#")) return unesc;
  const [target, anchor] = unesc.split("#");
  const rel = resolveFrom(target, from);
  if (pageOf.has(rel)) return pageOf.get(rel) + (anchor ? "#" + anchor : "");
  const isDir = fs.existsSync(path.join(root, rel)) && fs.statSync(path.join(root, rel)).isDirectory();
  return (isDir ? TREE : BLOB) + rel + (anchor ? "#" + anchor : "");
}
function asset(src, from) {
  if (/^https?:/.test(src)) return src;
  const rel = resolveFrom(src, from);
  if (fs.existsSync(path.join(root, rel))) {
    if (!copied.has(rel)) { copied.add(rel); fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true }); fs.copyFileSync(path.join(root, rel), path.join(out, rel)); }
    return rel;
  }
  throw new Error(`${from}: picture ${src} does not exist`);
}

// ---- blocks
const marker = /^( *)([-*+]|\d+[.)]) +(\S.*)$/;   // a list item: indent, bullet or number, the text
function blocks(lines, from, ids) {
  const html = [];
  let i = 0;
  const blank = (l) => !l.trim();
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    let m;
    if ((m = /^(```|~~~)\s*([\w-]*)/.exec(line.trim()))) {   // fenced code
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(m[1])) body.push(lines[i++]);
      i++;
      html.push(`<pre><code${m[2] ? ` class="language-${esc(m[2])}"` : ""}>${esc(body.join("\n"))}</code></pre>`);
    } else if ((m = OPEN_HEADING.exec(line))) {
      m[2] = headingText(m[2]);
      const level = m[1].length;
      let id = slug(m[2]);
      const n = ids.get(id) || 0;
      ids.set(id, n + 1);
      if (n) id += "-" + n;
      html.push(`<h${level} id="${id}">${inline(m[2], from)}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`);
      i++;
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { html.push("<hr>"); i++; }
    else if (/^\s*<!--/.test(line)) { while (i < lines.length && !lines[i].includes("-->")) i++; i++; }   // an HTML comment
    else if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      html.push(`<blockquote>${blocks(quote, from, ids)}</blockquote>`);
    } else if (line.includes("|") && i + 1 < lines.length && isSeparator(lines[i + 1], cells(line).length)) {   // a table
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && !blank(lines[i])) rows.push(cells(lines[i++]));
      const row = (cs, tag) => `<tr>${cs.map((c) => `<${tag}>${inline(c, from)}</${tag}>`).join("")}</tr>`;
      html.push(`<div class="table"><table><thead>${row(head, "th")}</thead><tbody>${rows.map((r) => row(r, "td")).join("")}</tbody></table></div>`);
    } else if ((m = marker.exec(line))) {   // a list: an item runs until the next line that starts one at the same depth, or a line less indented
      const ordered = /\d/.test(m[2][0]);
      const depth = m[1].length;
      const items = [];
      while (i < lines.length) {
        const start = marker.exec(lines[i]);
        if (!start || start[1].length !== depth) break;
        const width = start[1].length + start[2].length + 1;
        const body = [start[3]];
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (blank(next)) {   // a blank line stays in the item only if what follows is indented
            let j = i;
            while (j < lines.length && blank(lines[j])) j++;
            if (j < lines.length && /^\s+\S/.test(lines[j]) && lines[j].search(/\S/) > depth) { body.push(""); i++; continue; }
            break;
          }
          const indent = next.search(/\S/);
          const again = marker.exec(next);
          if (indent <= depth && (again || indent < width)) break;
          body.push(next.slice(Math.min(indent, width)));
          i++;
        }
        const inner = blocks(body, from, ids);
        items.push(`<li>${inner.replace(/^<p>([\s\S]*?)<\/p>(?=$|\n<)/, "$1")}</li>`);
      }
      html.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
    } else {   // a paragraph, up to a blank line or the start of another block
      const para = [];
      const startsBlock = (k) => OPEN_HEADING.test(lines[k]) || lines[k].startsWith("```") || lines[k].startsWith("~~~") || lines[k].trimStart().startsWith(">") || marker.test(lines[k])
        || (lines[k].includes("|") && k + 1 < lines.length && isSeparator(lines[k + 1], cells(lines[k]).length));
      while (i < lines.length && !blank(lines[i]) && !(para.length && startsBlock(i))) para.push(lines[i++].trim());
      html.push(`<p>${inline(para.join(" "), from)}</p>`);
    }
  }
  return html.join("\n");
}

// ---- pages
const CSS = `:root{--bg:#fff;--fg:#1d1d1f;--muted:#5b6270;--line:#dfe3ea;--soft:#f5f6f8;--accent:#0b5fff;--code:#f0f2f6}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#15171a;--fg:#e8eaed;--muted:#9aa3b2;--line:#2c3037;--soft:#1d2025;--accent:#7aa7ff;--code:#22262c}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{border-bottom:1px solid var(--line);background:var(--soft)}
nav{max-width:60rem;margin:0 auto;padding:.75rem 1rem;display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;align-items:baseline}
nav strong{margin-right:.5rem}nav a{color:var(--muted);text-decoration:none}nav a:hover,nav a[aria-current]{color:var(--fg);text-decoration:underline}
main{max-width:60rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1,h2,h3,h4{line-height:1.25;margin:2rem 0 .75rem}h1{margin-top:.5rem;font-size:2rem}h2{font-size:1.5rem;border-bottom:1px solid var(--line);padding-bottom:.25rem}h3{font-size:1.2rem}
.anchor{margin-left:.4rem;color:var(--muted);text-decoration:none;opacity:0;font-weight:400}h1:hover .anchor,h2:hover .anchor,h3:hover .anchor,h4:hover .anchor,.anchor:focus{opacity:1}
a{color:var(--accent)}img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:6px}
code{background:var(--code);padding:.1em .35em;border-radius:4px;font:.9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
pre{background:var(--code);padding:1rem;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}
.table{overflow-x:auto;margin:1rem 0}table{border-collapse:collapse;min-width:100%}th,td{border:1px solid var(--line);padding:.4rem .7rem;text-align:left;vertical-align:top}th{background:var(--soft)}
blockquote{margin:1rem 0;padding:.1rem 1rem;border-left:4px solid var(--line);color:var(--muted)}
footer{max-width:60rem;margin:0 auto;padding:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
@media (max-width:40rem){body{font-size:15px}h1{font-size:1.6rem}}`;

function render([src, page, label]) {
  const ids = new Map();
  const body = blocks(read(src).split("\n"), src, ids);
  const title = (/^# +(\S.*)$/m.exec(read(src)) || [, label])[1].replace(/`/g, "");
  const nav = PAGES.map(([, p, l]) => `<a href="${p}"${p === page ? ' aria-current="page"' : ""}>${esc(l)}</a>`).join("");
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page === "index.html" ? title : `${title} · SiteCleaner`)}</title>
<style>${CSS}</style>
</head>
<body>
<header><nav aria-label="Documentation"><strong>SiteCleaner</strong>${nav}</nav></header>
<main>
${body}
</main>
<footer><a href="${BLOB}${src}">Edit this page on GitHub</a>${sha ? ` · built from <a href="https://github.com/${REPO}/commit/${sha}">${sha}</a>` : ""}</footer>
</body>
</html>
`;
  // Markdown that was not converted would be published as it is: stop instead.
  const visible = doc.replace(/<pre>[\s\S]*?<\/pre>/g, "").replace(/<code>[\s\S]*?<\/code>/g, "").replace(/<style>[\s\S]*?<\/style>/g, "");
  const unconverted = (line) => {   // a line of the page (tags removed) that still looks like Markdown
    const text = line.replace(/<[^>]{1,4000}>/g, ""), t = text.trim();
    return /\*\*[^*\s]/.test(text) || (t.startsWith("|") && t.endsWith("|")) || /^#{1,6} /.test(text) || /^ *[-*] +\S/.test(text) || text.includes("](");
  };
  const left = visible.split("\n").filter(unconverted);
  if (left.length) throw new Error(`${src}: Markdown left in the page (this builder does not handle it):\n  ${left.slice(0, 5).join("\n  ")}`);
  return doc;
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const entry of PAGES) fs.writeFileSync(path.join(out, entry[1]), render(entry));
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log(`Documentation site: ${PAGES.length} pages and ${copied.size} picture${copied.size === 1 ? "" : "s"} in ${path.relative(process.cwd(), out) || "."}`);
