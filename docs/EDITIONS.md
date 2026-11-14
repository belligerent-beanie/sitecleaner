# Editions: designer and consumer

Status: the **edition switch is built** (the build option, the feature list, `test/editions.mjs`). Everything below it is a **design**, not code, so it can be argued with before it is built.

## The two editions

| | Designer (today) | Consumer (new) |
|---|---|---|
| Purpose | Restyle a page, then hand the changes to a developer or an AI | Make a site look the way *I* like, and keep it |
| Tools | All of them, including find, inspect, compare, preview, measuring, export | The editing tools and undo; the handoff tools are left out (`features` in `scripts/build.mjs`) |
| Edits kept | Per page, replayed by the picker | Per site, applied by a small loader (below) |
| Permissions | `activeTab`; all sites optional | `activeTab`; one site at a time, asked when the user keeps changes there |
| Name | SiteCleaner | **placeholder** ("SiteCleaner Personal"): check the Web Store before using any name |

They are separate extensions built from the same files, so each has its own storage and both can be installed. Bug fixes in the picker reach both.

## Why the consumer edition needs a different way of keeping edits

What exists now is built for a designer who turns the picker on:

- Edits are saved per **origin plus path** (`extension/host.js`), so a change on `/inbox` is not there on `/settings`.
- They are put back by `restore.js` at `document_idle`, which asks the worker to inject the whole picker (about 110 KB minified) and **replay each edit through the editing tools**, one `document.querySelector(selector)` per saved edit (`putBackEdits` in `src/parts/110`). That finds only the *first* element a selector matches, and it runs after the page has painted, so the site flashes its own look first.
- Names are made by `selectorFor` (`src/parts/080`), which prefers ids, `data-*` attributes and stable classes and falls back to `:nth-of-type` paths. Generated class names are skipped on purpose (`hashed`), so on many sites the fallback path is what is saved, and a redeploy breaks it silently.

That is acceptable when a designer reviews the result. For someone who just wants their site to look right, it is slow, it flashes, it only restores one element per edit, and it fails without saying so.

## The model: a site sheet

For each site the user keeps, save a **list of rules**, not a list of element edits:

    site:<origin> = { enabled: true, rules: [ { selector: ".tile", decl: { "background-color": "#fef3c7" } }, ... ], updated: <time> }

- **Where rules come from.** The picker already records, for each edited element, what changed (`rec.after`), and the compact export (`src/parts/125`) already groups elements that received the same edits and names the shared class (`.tile ×5`, `from: /css/site.css .tile`). The site sheet reuses that grouping: elements that were changed alike become one rule on their shared selector. Elements with no stable shared selector get one rule each, flagged as fragile.
- **Winning over the site's own CSS.** The same rule `setStyle` already uses: write it plainly, check the computed value, and add `!important` only where the site's CSS wins.
- **Where they live.** One constructed stylesheet adopted into the page (`document.adoptedStyleSheets`), as the state rules already are (`src/parts/095`), which a page's content security policy cannot block.

The designer edition can use the same machinery for "apply to every `.tile`", so this is not consumer-only work.

## The loader

A content script, `apply.js`, registered with `chrome.scripting.registerContentScripts` for **each origin the user has kept changes on** (and only those), at `document_start`:

1. Read `site:<origin>` from `chrome.storage.local`.
2. If `enabled`, build one stylesheet from `rules`, adopt it, and watch for rules whose selector matches nothing (see below).
3. Nothing else. No picker, no history, no tools: **about 1–2 KB**, so a page load costs one storage read, and only on sites the user chose. At `document_start` the site never shows its own look first.

The picker is injected only when the user opens it to edit, as now.

## Asking for permission, one site at a time

`optional_host_permissions` already lists `<all_urls>`; the consumer edition would request `https://<origin>/*` for the one site, which gives a better privacy statement ("only the sites you chose") and an easier Web Store review. One constraint to design around: **`chrome.permissions.request` is not available to content scripts** and needs a user gesture in an extension page. So the dock's "Keep my changes on this site" button sends a message to the worker, which opens a small extension page (`keep.html`) showing the site and an **Allow** button; that click makes the request, registers the loader and saves the sheet.

## When a rule stops matching

If a saved selector matches nothing (the site changed), the loader marks the site "needs attention": the toolbar badge shows it, the saved-sites page lists the rules that no longer match, and the dock offers to re-pick them. It never fails silently. Selectors made from generated class names are not saved as the primary key; where a rule can only be named by position, it is marked fragile when it is saved.

## The consumer interface (to design with Arsh)

- **Dock:** a short tool list (colours, text, font size, spacing, corners, hide), larger buttons, plain words. Undo and Reset stay.
- **Saved sites page** (options): each site with an on/off switch, the number of rules, "needs attention", and Reset and Forget.
- **First run:** a three-page tutorial in place of the nine-page designer one.
- **Toolbar badge:** on/off for the current site without opening anything.

## Order of work, and what each step costs

1. **Edition switch** (done): build option, feature list, test.
2. **Site sheet** (the core change): rules from grouped edits, the stylesheet, undo and save working through it. Medium; touches `110`, `125`, `095`. Both editions gain from it.
3. **Loader and per-site permission:** `apply.js`, `keep.html`, registration, the badge. Medium; new files, little existing code.
4. **Consumer interface:** the saved-sites page, short dock, tutorial. Largest; needs design decisions first.
5. **Store work:** a name, a privacy statement for per-site access, listing text and screenshots for the second extension.

## Open questions

- Name and branding of the consumer edition, and whether it shares a Web Store developer page with SiteCleaner.
- Sync across devices: `chrome.storage.sync` allows 8 KB per item and about 100 KB in all, so it fits only small per-site sheets (one item per site). Worth it before sharing themes? Probably not yet.
- Firefox and Safari: consumers use them more than designers do. Firefox needs its own manifest; the loader and the stylesheet model port, the worker does not.
- Should a consumer ever see the export? Probably as "Copy as CSS" so a change can be pasted into a userstyle manager, but that is a feature, not a default.
