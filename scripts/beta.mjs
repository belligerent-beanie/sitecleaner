// Makes a beta of the branch you are on, in one command:  bun run beta          (build, check, write the notes; nothing leaves this computer)
//                                                           bun run beta --publish   (also create the GitHub prerelease and print the link)
// A beta is the next patch version of package.json, numbered -beta.1, -beta.2, ... (the next free number is found from the releases on GitHub).
// What it does: builds both editions' zips with --beta, checks the zips the way a person would use them (scripts/verify-share.mjs), writes
// releases/notes-<version>.md from the changes waiting in CHANGELOG.md, and with --publish creates the prerelease from the commit you are on.
// Publishing needs a clean working tree and the commit pushed, so that the beta is exactly something that can be rebuilt from the branch.
// The same script is what the "beta" workflow on GitHub runs (Actions tab > beta > Run workflow, choosing the branch): no one's computer is involved.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const publish = args.includes("--publish");
const run = (cmd, a, opts = {}) => { const out = execFileSync(cmd, a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts }); return (out || "").trim(); };
const fail = (message) => { console.error("\n" + message); process.exit(1); };

const released = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const next = released.replace(/[0-9]+$/, (n) => String(Number(n) + 1));
const inCI = process.env.GITHUB_ACTIONS === "true";   // run by the beta workflow (.github/workflows/beta.yml): the commit is on GitHub by definition
const branch = run("git", ["branch", "--show-current"]) || process.env.GITHUB_REF_NAME || "(no branch)";
const sha = run("git", ["rev-parse", "HEAD"]);
const dirty = run("git", ["status", "--porcelain"]).split("\n").filter((line) => line && !line.startsWith("??"));   // new, untracked files do not go into a build

// the next free number: after the highest -beta.N already released for this version
let taken = [];
try { taken = JSON.parse(run("gh", ["release", "list", "--limit", "100", "--json", "tagName"])).map((r) => r.tagName); } catch (_) { console.log("(could not read the releases on GitHub: numbering from the tags on this computer)"); }
taken = taken.concat(run("git", ["tag", "-l", `v${next}-beta.*`]).split("\n"));
const used = taken.map((tag) => (new RegExp(`^v${next.replace(/\./g, "\\.")}-beta\\.([0-9]+)$`).exec(tag) || [])[1]).filter(Boolean).map(Number);
const forced = args.find((a) => a.startsWith("--n="));
const n = forced ? Number(forced.slice(4)) : (used.length ? Math.max(...used) + 1 : 1);
const label = `${next}-beta.${n}`;
console.log(`Beta ${label} from ${branch} at ${sha.slice(0, 7)}${dirty.length ? " (with changes not committed yet)" : ""}`);

if (publish) {
  if (dirty.length) fail("There are changes that are not committed. Commit them first: a published beta must be something the branch can rebuild.");
  let pushed = inCI ? sha : "";
  if (!inCI) { try { pushed = run("git", ["rev-parse", `origin/${branch}`]); } catch (_) { /* never pushed */ } }
  if (pushed !== sha) fail(`This commit is not on GitHub yet. Push ${branch} first (git push -u origin ${branch}), then run this again.`);
}

// build both editions
for (const edition of ["designer", "consumer"]) run("node", ["scripts/build.mjs", "--edition", edition, "--zip", "--share", `--beta=${n}`], { stdio: ["ignore", "ignore", "inherit"] });
const files = [`SiteCleaner-${label}-share.zip`, `SiteCleaner-Personal-${label}-share.zip`];
for (const f of files) if (!fs.existsSync(path.join(root, "releases", f))) fail(`The build did not make ${f}.`);

// check what was built
try { execFileSync("node", ["scripts/verify-share.mjs", label], { cwd: root, stdio: "inherit" }); } catch (_) { fail("The zips did not pass their checks (above). Nothing was published."); }

// the notes: what is waiting in the changelog, how to install, what to do
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8").replace(/\r\n/g, "\n");
const waiting = (/## Unreleased\n([\s\S]*?)\n## /.exec(changelog) || [])[1] || "";
const sums = files.map((f) => `sha256  ${crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "releases", f))).digest("hex")}  ${f}`);
const notes = `**Beta: for testing only.** This is what the branch \`${branch}\` would ship as ${next}. It is not a release, and it is not on the Chrome Web Store.

| | Download |
|---|---|
| **SiteCleaner** (designer) | \`${files[0]}\` |
| **SiteCleaner Personal** (early version) | \`${files[1]}\` |

Install the same way as before: unzip, open \`chrome://extensions\`, switch on Developer mode, **Load unpacked**, choose the \`extension\` folder (\`README - START HERE.txt\` inside has the steps). Chrome shows the version as **${label}**. If you have another version loaded, remove it first.

## What is new in it

${waiting.trim() || "(nothing listed under Unreleased in CHANGELOG.md)"}

## What to try

Try each change above on a real site, in the edition it belongs to. Then the real-Chrome checklist in \`store/STORE_LISTING.md\`. Say what you see; anything odd is worth knowing about.

## Checksums

\`\`\`
${sums.join("\n")}
\`\`\`

Apache-2.0. See \`NOTICE\` and \`third_party/visbug/\`.
`;
const notesPath = path.join(root, "releases", `notes-${label}.md`);
fs.writeFileSync(notesPath, notes);
console.log(`\nBuilt, checked, and wrote ${path.relative(root, notesPath)}`);
files.forEach((f) => console.log("  releases/" + f));

if (!publish) {
  console.log(`\nNothing has been published. To create the GitHub prerelease: bun run beta --publish${forced ? " " + forced : ""}`);
} else {
  const url = run("gh", ["release", "create", `v${label}`, "--prerelease", "--target", sha, "--title", `${label} (beta, for testing)`, "--notes-file", notesPath, ...files.map((f) => path.join("releases", f))]);
  console.log(`\nPublished: ${url}`);
}
