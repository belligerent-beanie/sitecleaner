# Editions: designer and consumer

Status: **built** are the edition switch (`--edition`, the feature list, `test/editions.mjs`) and the **keep feature** of the consumer edition: the site sheet (`src/parts/128-site-rules.js`),
the loader (`extension/apply.js`), the per-site permission window (`extension/keep.html`), the worker side (`extension/background.js`, "kept sites"), a plain list of kept sites in the
options page, and `test/keep.mjs`. **Built as a first version, for you to react to**: the consumer interface (see below). **Not built**: everything under "Open questions". The sections below describe the design; "What was built" says where it differs.

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

## The consumer interface

First version, built from the choices below. **These are my choices, made so there was something to react to; change any of them.**

- **Everyday words** (`plain` in the edition's features; `say()` in `src/parts/010`): Fill is **Background**, Radius **Corners**, Tone **Colour mood**, Text **Edit words**, Font **Text style**, Changes **My changes**, and the side tab says "Edit" where the designer edition says "Design".
- **Fewer tools:** Background, Border, Shadow, Corners, Colour mood, Edit words, Text style, Spacing, Copy/Paste look, a **Delete** button and Screenshot. Left out: Size, Layout, Position, Move, Image (they are for rebuilding a page, and moves and picture swaps cannot be kept), the hover/focus/active switch, and duplicate, group and copy/paste of elements. The keys of tools that are left out do nothing, and the Keys list shows only what exists.
- **Three-page tutorial** (Welcome, Change things, Keep it) instead of nine.
- **Keep** is the one bold action in the dock; **My changes** lists this visit's changes and, under "Kept on this site", what is kept, with a switch and a Remove for each rule. No export controls.
- **My sites** (the options page): a card per site with a switch, the number of changes, Forget, a "What is kept" list with Remove for each change, a warning when rules match nothing, and an empty state that says how to start.
- **Toolbar, stale rules, first Keep, touch** (added after the first version): hovering the toolbar icon says whether this site's changes are on and how many no longer match; right-clicking it
  offers "Switch off my changes on <site>" (the consumer edition asks for the `contextMenus` permission for this; the designer edition does not); a kept rule that matches nothing on the last page visited
  is marked "⚠" in My changes with **Re-pick** (click the element it should apply to; a state such as :hover stays on the end, and retyped text is matched against what that element says now);
  the first time anything is kept the My changes panel opens with a note on where it goes from there; and on touch screens (`pointer: coarse`) the buttons grow to 40 px.
- **Screenshots say they are of an edited page** (consumer edition only, `watermark` in its features): a dark strip under the picture reads "Edited with SiteCleaner · not the original page", and faint tiles of the same words run across the picture, so cropping the strip off does not make it pass. Edit words plus a screenshot could otherwise fake a changed price or message. The designer edition's pictures stay clean, for handoffs and bug reports.
- **Not done:** the touch sizes are untested on a real device (Chrome on Android does not run Web Store extensions, so this only matters for browsers that do); the context-menu *click* is not exercised by
  the tests (the action it runs is); the dock is still the designer's layout, not a bottom sheet.

## What was built, and where it differs from the design

- **Rules:** `siteSheet()` turns the session's style edits (normal, hover, focus and active) into rules. Elements changed alike become one rule when one of their classes (with their tag) names
  *exactly* that set, checked against the page; otherwise each element gets a rule named by `selectorFor`. A rule is `{s, b, d}`: the selector as written, the selector without the state (this is
  what must match something), and the declarations.
- **Always `!important`.** An inline style beats every site rule that is not `!important`, whatever its specificity; a sheet rule does not. So every kept declaration is `!important`. The one case
  this does not reproduce is a site `!important` rule of higher specificity, which also beats an `!important` sheet rule (an inline `!important` would win). Rare, and left alone for now.
- **Also kept:** deleting an element (a rule that hides it) and retyped text (the loader puts it back only while the element still says what it said before, and follows pages that redraw). **Left out and counted:** moving, duplicating, grouping, pasting, replacing pictures, and edits of elements that are not on the page: they rebuild the page structure, which a loader cannot do safely on a page that redraws itself. The Keep message says how many.
- **Easier to read** (`access: true` in the consumer features; `src/parts/129-easier-to-read.js`, `extension/readable.js`): a head button opens a panel with text size (100-200%), a smallest text size, and seven switches: spacing, plain font, underlined links, strong focus outline, calm motion, 44px buttons, and low-contrast text fixed. It previews live and "Keep on this site" saves it as `entry.presets.access`, beside the rules (an entry may have rules, settings or both). The loader brings `readable.js` with it, so the settings are there before you touch anything; the picker is not needed.
  - **Text size works from what is shown**, not from the page's rules: each element that holds text gets its own computed size times the factor (or the minimum), read for all elements first and then written, so pages sized in px, em or rem all work and nothing is scaled twice. Content that arrives later triggers the whole pass again (debounced, and less often on a slow page).
  - **Contrast fixes are deliberately cautious** (WCAG 2: 4.5:1, 3:1 for large text). Only text on a plain background is changed; if the background might be a picture or gradient, or the text sits in something positioned, it is left alone and counted ("left alone because the background could not be judged"). A wrong fix would be worse than none. The colour moves as little as it can towards black or white.
  - **Not covered yet:** text inside iframes or closed shadow roots, dark-mode switching, and anything drawn on a canvas. The worker checks the settings itself (ranges, true/false, at least one thing on) rather than loading the engine.
- **Keeping again adds.** Rules merge by selector: a rule made again replaces the old one, the others stay. Removing one rule is not possible yet; "Forget" in the options page removes the whole site.
- **The permission window** (`keep.html`) opens only when the site has not been allowed yet. The worker names the site from the tab that asked, and refuses rules with braces in them.
- **The loader** (`apply.js`) is registered per origin, only while the site is switched on *and* its permission is still granted, and re-checked at start-up and whenever a permission is removed.
- **Stale rules** are recorded in the site's entry and shown by a "!" badge on the tab and a line in the options page. Not yet: offering to re-pick them in the dock.
- **The designer edition** does not get the Keep button (`keep: false` in `scripts/build.mjs`): it keeps edits its own way. One line to change if you want both.
- **Not tried in this environment:** the permission window itself (the test build is given every site up front, so no window opens), and the real Chrome Web Store flow.

## Order of work, and what each step costs

1. **Edition switch** (done): build option, feature list, test.
2. **Site sheet** (done, in a first form): rules from the session's edits. Still to do: removing single rules, and using it in the designer edition for "apply to every `.tile`".
3. **Loader and per-site permission** (done): `apply.js`, `keep.html`, registration, the badge.
4. **Consumer interface** (first version done): the saved-sites page, short dock, tutorial, with the choices listed above.
5. **Store work:** a name, a privacy statement for per-site access, listing text and screenshots for the second extension.

## Open questions

- Name and branding of the consumer edition, and whether it shares a Web Store developer page with SiteCleaner.
- Sync across devices: `chrome.storage.sync` allows 8 KB per item and about 100 KB in all, so it fits only small per-site sheets (one item per site). Worth it before sharing themes? Probably not yet.
- Firefox and Safari: consumers use them more than designers do. Firefox needs its own manifest; the loader and the stylesheet model port, the worker does not.
- Should a consumer ever see the export? Probably as "Copy as CSS" so a change can be pasted into a userstyle manager, but that is a feature, not a default.
