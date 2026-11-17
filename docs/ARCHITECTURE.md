# SiteCleaner: architecture

How the extension is built, what it needs from the browser, and what would have to change to run it elsewhere. For what it does and who it is for, see
[OVERVIEW.md](OVERVIEW.md).

## The layers

```
┌──────────────────────────────────────────────────────────────┐
│ Editor (src/parts/*.js -> designer.js): plain DOM code       │  no chrome.* calls
│   tools, history, selectors, export, UI in a Shadow DOM      │
├──────────────────────────────────────────────────────────────┤
│ Host adapter (src/parts/010 + extension/host.js)             │  the only bridge
│   storage, mounting, previews, screenshots, keep             │
├──────────────────────────────────────────────────────────────┤
│ Content scripts: host.js, readable.js, restore.js, apply.js  │  chrome.storage, runtime
├──────────────────────────────────────────────────────────────┤
│ Service worker (extension/background.js)                     │  tabs, scripting, permissions,
│   toolbar, injection, permissions, previews, kept sites      │  windows, action, contextMenus
├──────────────────────────────────────────────────────────────┤
│ Extension pages: options, keep, cannot (.html + .js)         │
└──────────────────────────────────────────────────────────────┘
```

**The editor knows nothing about the browser's extension system.** It asks a `host` object for storage, a place to mount, previews and screenshots.
The defaults (`010-where-it-runs.js`) work on a plain page with `localStorage`; `extension/host.js` replaces them with `chrome.storage` and messages to the
service worker. This is also the seam for any other host (another browser, a bookmarklet, an embedded editor).

## What runs where

| Piece | File | Runs | Job |
|---|---|---|---|
| Editor | `designer.js` (built from `src/parts/*.js`) and `designer-css.js` | In the page's isolated content-script world, injected on demand | Everything the user sees and does |
| Host | `host.js` | Same, injected before the editor | Sets `window.__designerHost`; loads saved state before the editor starts so its reads stay synchronous |
| Restorer | `restore.js` | Every page, at `document_idle`, **only while all-sites is allowed** (designer and Studio) | Checks storage for edits on this page; if there are, asks the worker to inject the editor |
| Loader | `apply.js` + `readable.js` | One origin at a time, at `document_start`, only for kept sites (Personal) | Applies the site's CSS rules and reading settings before first paint; no editor |
| Service worker | `background.js` | Event-driven; stopped when idle | See below |
| Options | `options.html/js` | Extension page | All-sites permission, kept sites list, theme |
| Keep window | `keep.html/js` | Small popup window | The permission question for one site (a user gesture in an extension page is required) |
| Cannot | `cannot.html/js` | Popup | Explains why it cannot run on a page |

The service worker holds **no state in memory**, because the browser may stop it at any time. What it must remember across stops (which tabs have the
editor on, which tabs are previews, pending keep requests) lives in `chrome.storage.session`.

### The editor's files (`src/parts/`)

Joined in name order into one closure, so they share state. The number ranges are the map:

| Files | Contents |
|---|---|
| `000`–`010` | start-up guard, the **host adapter** |
| `020`–`080` | helpers, type and contrast, the page's colours, sizes, state, page furniture, selectors |
| `090`–`129` | recording edits, states, **undo/redo**, **structure operations**, saving, export (detailed and compact), site rules, easier-to-read |
| `130`–`220` | colour picker, compare, preview, layout, copy a look, measuring, inspector, find, tone, alignment guides |
| `230`–`290` | dock, tutorial guide, Font/Size/Spacing/Radius tools, Changes panel, Versions (`275`), picker mode, whole-object selection (`285`), element palette (`290`) |
| `300`–`360` | adapted from VisBug: structure editing, text in place, Move, Position, images, screenshot, shortcuts |
| `370`–`410` | movable dock and box model, theme, selection label, gridlines, Classes panel |
| `900` | start-up |

## The two kinds of change

Everything the user does is one of these, and both go through one history:

1. **Style edits.** A record per element: property, before, after. Written through the `apply…` functions.
2. **Structure operations.** Objects that know how to do, undo and redo themselves (delete, move, group, retype text, replace a picture). Written through `doOps`.
   After a reload they are replayed from selectors.

Because they are recorded, undo, keep, compare, versions and export need no code of their own per feature. To add a feature: add a file in
`src/parts/`, register with `keyHooks`, `pageEventHooks`, `refreshHooks` and `offHooks` in `060-state.js`, and change the page only through those
functions. The Markdown exporter, `125-export-compact.js`, groups elements that received the same edits into one entry named by their shared selector.

## Data

| Key in `chrome.storage.local` | Holds | Written by |
|---|---|---|
| `dz-changes:<origin><path>` | One page's recorded edits (designer, Studio) | `host.js`, debounced (400 ms) and flushed on `pagehide` |
| `site:<origin>` | `{enabled, rules[], stale[], presets, updated}` for a kept site (Personal) | the worker (`saveSite`), after validating every rule |
| `dz-tour`, `dz-prefs` | Tutorial version seen; small preferences | `host.js` |

| Key in `chrome.storage.session` | Holds |
|---|---|
| `on-tabs` | Tabs with the editor on, so it returns after a reload |
| `preview-tabs` | Preview windows and their sizes |
| `keep:<token>` | A pending keep request awaiting the permission click |

Storage full is reported in plain words and edits keep working in the tab. Rules sent to the worker are validated for type and size (no braces,
at most 2,000 rules) because the page cannot be trusted, and the origin always comes from the sending tab, never from the message.

## Messages

Editor and content scripts → worker (`chrome.runtime.sendMessage`): `who`, `on`, `restore`, `preview`, `capture`, `keep`, `keep-remove`, `keep-enable`, `keep-remove-preset`, `keep-repick`.
Loader → worker: `stale` (rules that match nothing on this page).
Keep window → worker: `keep-info`, `keep-confirm`, `keep-cancel`.
Options page → worker: `site-sync` (a site was switched on or off, or forgotten).
Worker → content script (`chrome.tabs.sendMessage`): `toggle`, `ping`, `set`.

## Flows

**Turn the editor on.** Toolbar click or `Alt+Shift+P` → worker tries `tabs.sendMessage("toggle")`; if nothing answers, it injects `host.js`, `readable.js`,
`designer-css.js`, `designer.js` with `scripting.executeScript`, then toggles. If the browser refuses (browser pages, the store, PDFs), it sets a badge,
a tooltip and a popup that explains.

**Come back after a reload.** With all-sites allowed: `restore.js` finds saved edits and sends `restore`; the worker injects the editor (off), which replays the
edits. A tab recorded in `on-tabs` gets the editor switched back on as well. Without the permission, the user turns the editor on again and the edits return.

**Keep on a site (Personal).** The editor builds a site sheet from the edits (elements changed alike become one rule on their shared selector) →
`keep` → worker validates → if the origin is not yet allowed, opens `keep.html` → the user clicks Allow (`permissions.request`) → worker saves
`site:<origin>` and registers `apply.js` for that origin → on every later load, `apply.js` adopts a constructed stylesheet at `document_start`. Rules whose selector
matches nothing are reported, never hidden. Registrations are synced in batches on install, startup and permission removal.

**Preview.** Editor → `preview` → worker opens a popup window (needs all-sites), injects the editor in preview mode when the page loads, then sizes the window so the
inside, not the frame, is the size asked for.

**Screenshot.** `capture` → `tabs.captureVisibleTab`; the editor crops to the selection.

## Browser APIs used

This table is the starting point for a port. "Where" is the only place to change.

| API | Used for | Where |
|---|---|---|
| `action.onClicked`, `setBadgeText`, `setTitle`, `setPopup`, `openPopup` | Toolbar toggle; "cannot run here" explanation | `background.js` |
| `commands` (`_execute_action`, Alt+Shift+P); `commands.getAll` | Keyboard toggle; the options page shows the shortcut in use | manifest, `options.js` |
| `scripting.executeScript` | Inject the editor; measure window frame for previews | `background.js` |
| `scripting.registerContentScripts`, `scripting.updateContentScripts`, `scripting.unregisterContentScripts`, `scripting.getRegisteredContentScripts` | Restorer (all sites); per-site loader | `background.js` |
| `permissions.contains`, `request`, `remove`, `onAdded`, `onRemoved`; `optional_host_permissions` | All-sites switch; per-site allow | `background.js`, `options.js`, `keep.js` |
| `storage.local`, `storage.session`, `storage.onChanged` | Edits, kept sites, state that must outlive the worker | `host.js`, `background.js`, `options.js` |
| `runtime.sendMessage`, `runtime.onMessage`, `runtime.getURL`, `runtime.getManifest`, `runtime.onInstalled`, `runtime.onStartup`, `runtime.lastError`; `tabs.sendMessage` | Messaging and lifecycle (`lastError` is read in the callback form `contextMenus` needs on older Chrome) | all |
| `tabs.query`, `tabs.get`, `tabs.onUpdated`, `tabs.onRemoved`, `tabs.onActivated`, `tabs.captureVisibleTab` | Re-enable after reload, previews, screenshots, the icon's state on the active tab | `background.js` |
| `windows.create`, `windows.update` | Preview windows; keep window; fallback explanation window | `background.js` |
| `contextMenus.create`, `contextMenus.update`, `contextMenus.removeAll`, `contextMenus.onClicked` | Personal: switch a site's changes off or on | `background.js` |
| `options_ui` (opens in a tab) | Options page | manifest |

Web platform features it also depends on: Shadow DOM (the UI is isolated from the page's CSS), constructed stylesheets and `adoptedStyleSheets` (immune to page
CSP), `CSSStyleSheet` rule reading (for classes and `from:` source hints), `MutationObserver`, and `FileReader` for replaced pictures.

APIs it **does not** use, and should not start using without thinking about other browsers: `sidePanel`, `offscreen`, `debugger`, `userScripts`,
`declarativeNetRequest`, `webRequest`.

### Porting notes

Rough effort: Firefox is days, Safari is one to two weeks plus an Xcode project and Apple developer account. The manifest differs (`background.scripts` instead of `service_worker` in Firefox, a
`browser_specific_settings` id), optional host permissions and `action.openPopup` behave differently, and Safari adds an Xcode wrapper and weaker support for dynamic
content-script registration. The build already templates the manifest (`extension/manifest.template.json`, `scripts/build.mjs`), so a `--target` option is where this
would go. Do it after the feature set settles.

## Build

`node scripts/build.mjs [--edition designer|studio|consumer] [--out DIR] [--test] [--zip] [--share] [--beta=N]`

1. Joins `src/parts/*.js` and minifies (esbuild, dev-only) into `designer.js`; wraps `src/picker.css` into `designer-css.js`.
2. Copies the extension files; in `host.js` and `options.js` replaces the `/*edition*/ … /*end*/` marker with the edition's name and feature switches.
3. Fills in `manifest.template.json`: name, description (checked against the store's 132-character limit), extra permissions, version.
4. `--test` grants all-sites up front so the end-to-end tests need no human click. `--zip` writes the store zip; `--share` the zip for people, with instructions;
   `--beta=N` builds the next patch version labelled `-beta.N`.

Minimum Chrome version is 114. Branded Chrome no longer loads unpacked extensions from the command line, so tests use Playwright's Chromium.

## Tests

| Command | Covers |
|---|---|
| `bun run test:e2e` | Every feature, on a hostile test page (strict CSP, generated class names), including reload and Reset all |
| `bun run test:editions` | Each edition has exactly the features it should |
| `bun run test:keep`, `test:access` | Keep and the loader; the Easier-to-read settings |
| `bun run test:stress` | Many kept sites, many edits, many rules, a full store |
| `bun run test:a11y`, `test:a11y:consumer` | axe-core audit of every tool and panel, both looks, no violations allowed |
| `bun run test:docs` | The documentation against the code (see Documentation below) |
| `bun run smoke` | Real sites; needs the network; run by hand before a release |

CI design: [CI_DESIGN.md](CI_DESIGN.md). Performance notes: [PERFORMANCE.md](PERFORMANCE.md).

## Documentation

The documents are checked and published like code. Sources: `README.md`, `docs/*.md`, `CLAUDE.md` and `store/PRIVACY.md`.

| Step | Where it runs | What it catches |
|---|---|---|
| `bun run test:docs` (`scripts/check-docs.mjs`) | The `docs` job in `.github/workflows/test.yml`, on every pull request and push | Links and `#anchors` that point nowhere; a file written in `code` that does not exist, or a `file:line` past the end of the file; a `bun run` script or a `node scripts/...` flag or edition that is not there; a `010`-style part number with no file; a function or variable name that is not in the source |
| The same script, against this file | Same | **Both ways:** a `chrome.*` API, a message type or a storage key used in `extension/` but missing here, or listed here but no longer used. This is what stops this document going stale |
| markdownlint (`.markdownlint-cli2.jsonc`) | Same | A short list of rules that find broken Markdown (table columns, empty links, pictures without a description). It is not a style guide |
| `bun run docs` (`scripts/build-docs.mjs`) | Same, and `.github/workflows/pages.yml` | The site builds, every picture exists, and no Markdown is left unconverted |
| Publish | `.github/workflows/pages.yml`, when `main` changes | Deploys the site to GitHub Pages |

The `docs` job is part of the required `result` check in `test.yml`, so a document that is wrong cannot be merged. A change that touches only documentation skips the
browser suite and runs these steps alone, which takes seconds. A change to the code that makes a document wrong fails the same way, which is the point.

## Provenance

Apache-2.0. Files adapted from VisBug (`300`–`360`) carry a header and are listed in `third_party/visbug/README.md`.
