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

- **Tab is no longer a dead end.** Tab walked the page's blocks and stopped at the last one. It now carries on into the picker's panel, and Shift+Tab on the panel's first control comes back to the page. F6 still jumps in and out at once.
- **Pages that cannot be changed are recognised.** On a page the browser keeps closed to extensions (its own pages, the Web Store, PDFs, files), clicking the icon now opens a small explanation of why and what to do, and the icon says so when you hover it. Before, it only showed a cross. Chrome before 127 cannot open the toolbar popup from the extension, so there the same explanation opens in a small window.
- **Classes the picker cannot read are explained.** The classes panel says which style sheets the browser keeps closed (another site's), says the classes still work (select and restyle), and what is missing (the original rules in the list and the export).
- **"Allow all sites" says what it does for you** (the Options page and the install instructions): edits come back and the picker switches on by itself after a reload, previews work; and what it reads and how to take it away.
- **Making a beta is one command** (`bun run beta`): it builds both editions as the next patch version, `-beta.N`, checks the zips by unzipping them and loading both extensions into a real browser (`scripts/verify-share.mjs`), and writes the release notes from this list. `bun run beta --publish` also creates the GitHub prerelease, and refuses unless the work is committed and pushed. The build takes `--beta=N`.
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
