# Design Picker

A Chrome extension for designers. Select any element on any page, restyle it, move it, measure it, check its contrast, replace its pictures,
undo all of it, and hand what you changed to a developer (or to Claude) as a precise Markdown change list.

It stands on the ideas of [VisBug](https://github.com/GoogleChromeLabs/ProjectVisBug), the Apache-2.0 editor from Google Chrome Labs
(archived in September 2026), and adds what VisBug never had: **everything you do is recorded**, so it can be undone, kept across reloads and
exported. See [Where it comes from](#where-it-comes-from).

*Design Picker is a working name. Check it is free on the Chrome Web Store before publishing (see `store/STORE_LISTING.md`).*

![Restyling a heading with the live contrast readout](store/screenshots/1-restyle-with-live-contrast.png)

## What it does

**Select.** Click an element. Shift-click adds or removes elements and the tools then change all of them at once. `/` finds everything
that matches a CSS selector (or some words). Walk the page with ↑ parent, ↓ child, Tab siblings; Ctrl+E selects the similar ones.

**Style.** Fill, border, shadow, corner radius, tone (shift the hue, saturation and brightness of a whole selection together); text, font
(colour, size, weight, line height, letter spacing, alignment); size (type it, or drag the handles), padding and margin, flex and grid layout,
opacity. Copy one element's look and paste it onto others. Every colour picker lists the colours already on the page, with the names of the
site's CSS variables.

**Check as you go.** Fill and Font show the contrast against what is behind the text: WCAG 2 (AA and AAA) and APCA. The inspector (`I`)
shows whatever is under the pointer: size, type, colours, contrast, role and the name a screen reader would announce, and flags a missing name or alt
text. Hold `M` to measure distances, `G` to see what lines up with the selection, `\` to flip back to the original page.

**Edit the page itself.** Delete, duplicate, copy, cut and paste, group and ungroup elements. Double-click text to retype it. Move elements through
the page (arrow keys, or drag a sibling to reorder), or place them anywhere. Drop an image file on a picture, or paste one, to replace it.

**Undo everything.** One history for all of it: Ctrl+Z and Ctrl+Shift+Z, a slider drag or a run of key presses being a single step. Reset all
puts the page back, in one step you can undo.

**Hand it over.** `Alt+Shift+E` copies a Markdown change list: for each element its selector, then before and after for every property (with what
the change did to the contrast), then the structure changes in the order they were made. Paste it into a chat with Claude, or give it to a developer.
`Alt+Shift+S` saves a screenshot of the selection. Preview opens the page, with your edits, in a window of phone, tablet or laptop size.

Press `?` in the picker for every shortcut.

## Install

    node scripts/build.mjs        # makes dist/
    # Chrome: chrome://extensions > Developer mode > Load unpacked > dist

Then click the toolbar icon, or press **Alt+Shift+P**, on any page.

## Permissions and privacy

`activeTab`, `scripting` and `storage`. The picker runs only on the tab you click it on. Access to **every site is optional** (the options page):
it is what lets your edits come back by themselves after a reload, and lets previews show them. Nothing is collected or sent anywhere; your edits
stay in this browser, in `chrome.storage`, out of reach of the page's own scripts. See `store/PRIVACY.md`.

## How it is put together

The picker is one script built from the files in `src/parts/`, joined in name order (they are slices of one closure and share its state):

| Files | What is in them |
|---|---|
| `010` where it runs | the **host adapter**: everything that depends on the place it runs (storage, mounting, previews, screenshots) |
| `020`–`080` | helpers, colour and contrast, the page's colours, the state, the outlines, selectors |
| `090`–`120` | recording edits, **undo and redo**, **structure operations** (`105`), saved edits, the export |
| `130`–`230` | the colour picker, compare, preview, layout, copy a look, measuring, the inspector, find, tone, guides |
| `240`–`280` | the dock and guide, the Font, Size, Spacing and Radius tools, the changes panel, the picker's mode and keys |
| `300`–`360` | **adapted from VisBug**: editing structure, text in place, Move, Position, images; the screenshot; shortcuts |
| `900` | start-up |

`extension/` is what is not the picker: `host.js` (storage in `chrome.storage`, the UI in a Shadow DOM so the page's CSS cannot touch it,
previews and screenshots through the worker), `background.js` (the toolbar button, previews, the screenshot), `restore.js` (puts saved edits back after
a reload) and the options page. **Two kinds of change** go through the same history: style edits (a record of before and after per element) and
structure operations (an object that knows how to undo and redo itself, replayed from selectors after a reload).

To add a feature: a new file in `src/parts/`, registered through the `keyHooks`, `pageEventHooks`, `refreshHooks` and `offHooks` lists in
`060-state.js`, changing styles through the `apply…` functions and the page through `doOps`, so that it is undone, saved and exported for free.

## Test

    bun install                   # Playwright, for the tests
    node test/e2e.mjs             # 107 checks in a real browser

It builds the extension, loads it into Playwright's Chromium (branded Chrome no longer loads unpacked extensions from the command line), and
drives it on a page that is nothing like a designer's own: a strict content security policy, generated class names, its own CSS variables. It covers
every feature above, including the round trip through a reload and through Reset all. `node scripts/build.mjs --zip` writes the zip for the Web Store
(`releases/`), and `node scripts/screenshots.mjs` regenerates the store screenshots from the real extension.

## Where it comes from

Licensed under **Apache-2.0** (`LICENSE`, `NOTICE`). The files adapted from VisBug say so in a header, and `third_party/visbug/README.md` lists them,
what each was adapted from, and what changed. The idea of each came from VisBug; the code was rewritten to run on this foundation. VisBug has no undo,
no saved edits and no export of what changed, and writes to the page directly; here nothing is written without being recorded. The screenshot is new
(VisBug lists a screenshot tool but ships an alert saying "Coming Soon!").

## Known limits

- **Without the all-sites permission a reload turns the picker off** (the extension cannot act on a page until asked): turn it on again and the
  saved edits come back. With the permission they return by themselves.
- **Hover and focus states** cannot be edited yet: each state needs its own rule, and undo, compare, reload and export have to learn about states.
- **Replaced pictures** that are large (over about 300 KB) are not kept across a reload, and a page whose security policy forbids `data:` images
  cannot show a replaced local file (the change is still recorded and exported).
- **Cross-origin iframes** are separate documents the picker does not reach; **closed shadow roots** on a page cannot be selected into.
- Structure changes are replayed from selectors after a reload. On a page that builds its content differently each time, they may not find their
  elements; they are then kept, listed under Changes, and exported, until you forget them.
- Chrome only for now (Edge works the same way). Firefox needs its own manifest.
