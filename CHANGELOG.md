# Changelog

Every released version, and everything that is waiting for one. Newest first. Dates are when the version was published.

## How versions are tracked

- **The number** lives in `package.json` (the build copies it into the extension's manifest). It changes only in a pull request that is about a release.
- **A release** is a git tag `vX.Y.Z` on `main` and a [GitHub release](https://github.com/belligerent-beanie/sitecleaner/releases) with two files: `SiteCleaner-X.Y.Z-share.zip` (for people: extension, install instructions, licences, skill) and `sitecleaner-X.Y.Z.zip` (the Web Store package). Both are built by `bun run share` and carry a checksum in the release notes.
- **Changes in waiting** are listed under "Unreleased" below, each with the pull request that holds it. When one merges, its entry moves under the version that ships it. Pull requests that change behaviour add their entry here.
- **A beta** is a prerelease tagged `vX.Y.Z-beta.N`, made with `bun run beta`. A pull request that changes behaviour is merged only after the beta has been tried in real Chrome.
- **The tutorial** (`TUTORIAL_VERSION` in `src/parts/240-the-guide.js`) has its own number: people who have seen an older one see the new one once.

## Unreleased

Changes in waiting:

- **Versions (changesets).** The new Versions link saves the page's edits under a name, per page. Show puts the page in any saved version (it is replayed the way a reload replays edits); pick two as A and B and flip between them with the button or Alt+Shift+B to see which you prefer. Work that was in no version when you switch waits under "Before the last switch", so nothing is lost. In the designer and studio editions.
- **A third edition, SiteCleaner Studio** (`--edition studio`, built into `dist-studio/`; the name is a placeholder), for designers used to Canva and Figma: no selectors, classes, inspector or hover/focus states. A click picks the thing you see (the words of a button are the button); ↑ and ↓ skip invisible wrappers; Alt-click, or "Exact elements" in the panel, picks the page's own element. The Elements panel lists known elements to drag onto the page: the page's own components (its headings, buttons, pictures, paragraph, list and repeated cards, copied with their classes so a new one looks like the site's) and a few basics. While you drag, the container it would go into is outlined and a line shows where it lands between its siblings; Alt drops into the exact element; Esc cancels; pressing a tile adds it after the selected element. Tiles keep the component's full class path (every class, hashed ones included; the tooltip shows it, the tile hides the ancestors every tile shares), and when a copy looks different where it lands (a style that depends on its parent), the toast says which looks changed and where the original sat. Pictures can be added from a file, an address or a file dropped from the desktop onto the page (large ones are made smaller so they can be kept across reloads). Dragging over something that cannot hold other elements (a picture, a field, a paragraph, a heading) says so, and the drop goes next to it; Shift turns a paragraph, heading or similar into a box (a div) and drops inside, in one undoable step (a new "retag" structure change, kept, replayed and exported). A drop is one undoable insert, kept and exported like a paste. Pictures can also go behind any element: the Image tool has a Background picture section (a file or an address, Fill / Fit / Tile, Remove) that works on any selected element, and the Elements panel has a "Drop pictures as: Image | Background" switch, so a picture tile or a file dropped on the page becomes the background of the element under the pointer. Background size, position and repeat are undone, kept across reloads and exported with the picture. A layers list, a studio tutorial and its own install instructions are not built yet.
- **← → walk the brothers.** With an element selected, the left and right arrows select its previous and next sibling (same parent, same level), skipping the picker's own nodes and non-visual tags. ↑ and ↓ still go to the parent and child. Inside the Move, Position, Spacing and Size tools the arrows keep nudging, as before. They replace Tab and Shift+Tab, which no longer select siblings: Tab is the browser's own again.
- **A scrolling box can be opened out.** In the Layout tool, a box that scrolls shows a Scrolling switch: Off opens it out so everything in it shows (overflow visible, no maximum height, automatic height); On puts it back as the page had it. Both are undoable, kept across reloads and in the export (overflow, max-height, height).
- **Pop an element out of its parent.** The Move tool has an Out after button beside Out before (renamed from Out): the selected element leaves its parent and sits just after it, wherever it was among its brothers.
- **Pages that cannot be changed are recognised.** On a page the browser keeps closed to extensions (its own pages, the Web Store, PDFs, files), clicking the icon now opens a small explanation of why and what to do, and the icon says so when you hover it. Before, it only showed a cross. Chrome before 127 cannot open the toolbar popup from the extension, so there the same explanation opens in a small window.
- **Classes the picker cannot read are explained.** The classes panel says which style sheets the browser keeps closed (another site's), says the classes still work (select and restyle), and what is missing (the original rules in the list and the export).
- **"Allow all sites" says what it does for you** (the Options page and the install instructions): edits come back and the picker switches on by itself after a reload, previews work; and what it reads and how to take it away.
- **Making a beta is one command** (`bun run beta`): it builds all three editions (designer, studio, consumer) as the next patch version, `-beta.N`, checks the zips by unzipping them and loading both extensions into a real browser (`scripts/verify-share.mjs`), and writes the release notes from this list. `bun run beta --publish` also creates the GitHub prerelease, and refuses unless the work is committed and pushed. The build takes `--beta=N`.
- **A beta can be made on GitHub** (Actions, beta, Run workflow), and the browser tests run against Chrome 114, 127, the current stable and the beta on every pull request (`chrome-versions`), not only the Chromium Playwright installs.
- **Fixed on Chrome before about 123 (Personal edition):** the right-click menu entry for switching a site's changes off or on stopped updating, because the code expected a result that older Chrome does not return. Found by the Chrome 114 run.

## 0.4.0 (2026-11-14)

[Release](https://github.com/belligerent-beanie/sitecleaner/releases/tag/v0.4.0) · PRs [#9](https://github.com/belligerent-beanie/sitecleaner/pull/9), [#7](https://github.com/belligerent-beanie/sitecleaner/pull/7), and the pull request that made this release

**Two extensions now.** **SiteCleaner** (the designer edition, as before) and **SiteCleaner Personal** (the consumer edition, an early version; its name is a placeholder). Each has its own zip for people with its own plain-language install instructions: `SiteCleaner-0.4.0-share.zip` and `SiteCleaner-Personal-0.4.0-share.zip`, built by `bun run release:build`. The release also carries the designer edition's Web Store package, `sitecleaner-0.4.0.zip`.

- The designer edition gains the classes panel and the performance and build changes below. Its tutorial mentions the classes panel and opens once more for everyone who saw an older one (`TUTORIAL_VERSION` is 0.4.0).
- Version number: this release bumps `package.json` to 0.4.0.

### Performance, a minified build and the consumer edition (#9)

- **Performance:** outlines redraw once per frame and only while the picker is on; saving no longer recomputes every edited element's selector on every edit (the patch message gives the old cost as about 50 s for 300 edited elements on a 20,000-element page; the names are now worked out again only after the page has changed); `bun run profile` times the heavy operations.
- **Minified build:** the picker goes from 218 KB to 111 KB (61 KB to 37 KB gzipped) with esbuild, a new dev dependency; `--no-minify` keeps readable files.
- **Two editions** from the same files. The designer edition is the default build, as before. `--edition consumer` builds a separate extension (name `SiteCleaner Personal` is a placeholder) that keeps changes per site as CSS rules applied by a small loader before the page paints, asks permission one site at a time, keeps deleted elements and retyped text, shows what is kept with a switch and a Remove for each rule, flags stale rules with a Re-pick, watermarks screenshots as edited, and has an **Easier to read** preset. It asks for one more permission (`contextMenus`) than the designer edition. Design: `docs/EDITIONS.md`.
- Still open for the consumer edition: a real name, a Web Store listing and privacy policy, and the open questions in `docs/EDITIONS.md`. Not tried by a person: the per-site permission window, the right-click menu click, and the touch sizes.

### Classes panel (#7)

- A **Classes** link lists the classes the page defines, most used first: how many elements have each, the file that defines it, its rules, a filter, and an option to include classes nothing uses. A click selects every element that has the class.
- Reads inside `@media`, `@supports`, `@layer`, `@container` and nested rules. Classes the elements have but whose rules cannot be read (a style sheet from another site, or a script) are listed too and say so. Measured on real sites: Wikipedia 215 classes in use, GitHub 371, Tailwind's site 702, Bootstrap's site 151; counts matched an independent count on seven sites.
- The compact export's `from:` lookup reads inside `@layer` as well.
- The tutorial's nine page numbers share one row (fixes a cosmetic fault in 0.3.1: the "9" sat alone on a second line).
- Designer edition only. Described on page 2 of the tutorial.

## 0.3.1 (2026-11-14)

[Release](https://github.com/belligerent-beanie/sitecleaner/releases/tag/v0.3.1) · PR [#8](https://github.com/belligerent-beanie/sitecleaner/pull/8)

- A **nine-page tutorial** for everything in 0.3.0, opened by a **Tutorial** button at the top of the panel at any time (it replaces the small "Guide" link). Page numbers jump to a page, the arrow keys turn pages, and four pages have a button that opens what they describe.
- Opens by itself the first time, and once after an update that changes it (the extension now stores which tutorial version was seen; earlier builds stored "done").
- Known cosmetic fault, fixed in #7: the page numbers wrap, leaving the "9" on its own line.

## 0.3.0 (2026-11-14)

[Release](https://github.com/belligerent-beanie/sitecleaner/releases/tag/v0.3.0) · PRs [#5](https://github.com/belligerent-beanie/sitecleaner/pull/5), [#6](https://github.com/belligerent-beanie/sitecleaner/pull/6)

- A **compact export**, now the default: elements that received the same edits are one entry, named by what they share (`.tile ×5`: all five changed; `2 of 5 .tile`: only two did), with `from:` naming the rule that defines the property now, no before-values and no boilerplate. On Hacker News, 30 restyled links cost 87 tokens against 1,746 for the detailed list. A Compact / Detailed switch in the Changes panel, with a readout of what the list costs.
- `skills/sitecleaner-apply/SKILL.md`: a skill (plain markdown) that teaches an AI to apply a change list to a project.
- `bun run share` builds a zip for people with plain-language install instructions for Chrome, the licences and the skill.

## 0.2.0 (2026-11-14)

[Release](https://github.com/belligerent-beanie/sitecleaner/releases/tag/v0.2.0)

First public release, as **SiteCleaner** (built from the picker in the coop-alchemy game and ideas of VisBug, Apache-2.0). Select, restyle (fill, border, shadow, radius, tone, text, font with bold and italic, size, spacing, layout, position), several elements at once, **hover, focus and active states**, delete / duplicate / copy / paste / group / move elements, retype text, replace pictures, contrast (WCAG and APCA) and an inspector, measuring and alignment guides, **gridlines** and a **label on the selected element**, undo for everything, edits kept across reloads (the picker stays on across a reload when all sites are allowed), previews and screenshots, light and dark looks, and a Markdown change list.
