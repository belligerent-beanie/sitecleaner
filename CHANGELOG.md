# Changelog

Every released version, and everything that is waiting for one. Newest first. Dates are when the version was published.

## How versions are tracked

- **The number** lives in `package.json` (the build copies it into the extension's manifest). It changes only in a pull request that is about a release.
- **A release** is a git tag `vX.Y.Z` on `main` and a [GitHub release](https://github.com/belligerent-beanie/sitecleaner/releases) with two files: `SiteCleaner-X.Y.Z-share.zip` (for people: extension, install instructions, licences, skill) and `sitecleaner-X.Y.Z.zip` (the Web Store package). Both are built by `bun run share` and carry a checksum in the release notes.
- **Changes in waiting** are listed under "Unreleased" below, each with the pull request that holds it. When one merges, its entry moves under the version that ships it. Pull requests that change behaviour add their entry here.
- **The tutorial** (`TUTORIAL_VERSION` in `src/parts/240-the-guide.js`) has its own number: people who have seen an older one see the new one once.

## Unreleased

Changes in waiting (from the scaling tests, `scripts/scale.mjs`):

- **Edits are written to storage once they pause**, not on every edit. Every edit used to save the whole session, so a session of N edits wrote N times N bytes (394 MB for 1,000 edits). Writing now waits 0.4 s for a pause and also happens when the page is hidden or closed.
- **A full store says so in plain words.** Keep, and the automatic saving of a session, now show "The browser's storage for this extension is full…" with what to do, instead of the browser's "Resource::kQuotaBytes quota exceeded".
- **Start-up is faster with many kept sites.** The extension looks at what is registered once and registers, updates and removes loaders in batches, instead of one round trip per site (82 s for 1,000 sites before).

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
