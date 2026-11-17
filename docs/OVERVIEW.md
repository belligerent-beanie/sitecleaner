# SiteCleaner: overview

What SiteCleaner is, who it is for, what it can do, and where it is meant to be used. For how it is built, see [ARCHITECTURE.md](ARCHITECTURE.md).
For the reasoning behind the editions, see [EDITIONS.md](EDITIONS.md). For install, tests and known limits, see the [README](../README.md).

## In one paragraph

SiteCleaner is a browser extension (Chrome and Edge today) that lets a person change how any web page looks **in their own browser**, with every change
recorded. Because every change is recorded, it can be undone, kept across reloads and sites, compared with the original, and exported as a compact
Markdown change list for a developer or an AI. Nothing is sent anywhere: there is no server, no account and no analytics.

## Who it is for

| Audience | What they want | Edition | Output |
|---|---|---|---|
| **Designers and front-end developers** | Try a visual change on the real, live page, then hand it to whoever edits the source | **SiteCleaner** (designer) | A Markdown change list; screenshots; the page itself, edited |
| **Designers used to Canva or Figma** | The same, without selectors, classes or CSS terms: pick whole objects, save versions, flip between them | **SiteCleaner Studio** | Versions of the page; the Markdown change list is still available |
| **Anyone who uses a site every day** | Make it readable or tolerable (colours, text size, hide clutter) and have it stay that way | **SiteCleaner Personal** (consumer) | The site, restyled on every visit |
| **People who need an accessible page** | Larger text, calmer motion, stronger focus, fixed low contrast, dark mode, per site | **SiteCleaner Personal** ("Easier to read") | The site, adjusted on every visit |
| **AI coding tools** (Claude Code and others) | A precise, cheap-to-read list of what to change and where, for the source files | Designer | The compact export, read with `skills/sitecleaner-apply` |

The names of the Studio and Personal editions are placeholders (see `store/STORE_LISTING.md` before publishing).

## What it can do

The designer edition has everything; the other editions leave things out (see the matrix below).

| Area | Capabilities |
|---|---|
| **Select** | Click an element; shift-click for several; `/` finds by CSS selector or words; ↑ parent, ↓ child, ← → siblings; Ctrl+E selects similar elements; the Classes panel lists the page's CSS classes, how many elements use each, and where each is defined |
| **Style** | Fill, border, shadow, radius, tone (hue/saturation/brightness for a whole selection), text and font (colour, size, weight, line height, letter spacing, alignment), size, padding and margin, flex/grid layout, opacity; copy one element's look and paste it onto others |
| **States** | Edit `:hover`, `:focus` and `:active` looks, starting from what the site's own rules already give them |
| **Edit the page** | Delete, duplicate, copy, cut, paste, group and ungroup; retype text in place; move or reorder elements; replace a picture by dropping or pasting a file; drag the page's own components and some basics onto the page from the element palette (Studio) |
| **Check** | Live contrast against the real background (WCAG 2 AA/AAA and APCA); an inspector showing size, type, colours, role and the accessible name; measuring, alignment guides and gridlines |
| **Compare** | Flip to the original page (`\`); preview at phone, tablet or laptop size in a real window; save **Versions** and flip between them |
| **Undo** | One history for everything (Ctrl+Z / Ctrl+Shift+Z); Reset all, itself undoable |
| **Keep** | Edits survive a reload (designer: replayed by the picker; Personal: written as CSS rules for the site and applied before the page paints) |
| **Hand over** | `Alt+Shift+E` copies the changes as Markdown, **compact** (shared classes, source file, no boilerplate) or **detailed** (every element, before and after); `Alt+Shift+S` saves a screenshot |
| **Make it readable** | Text size and minimum size, spacing, plain font, underlined links, strong focus outline, calm motion, bigger buttons, low-contrast text fixed, pointer highlight, dark mode |

### Edition matrix

| | Designer | Studio | Personal |
|---|---|---|---|
| Build command | `bun run build` | `node scripts/build.mjs --edition studio` | `bun run build:consumer` |
| Output folder | `dist/` | `dist-studio/` | `dist-consumer/` |
| Find, Classes, Inspector | yes | no | no |
| States (hover, focus, active) | yes | no | no |
| Compare, Preview, Measure, Markdown export | yes | yes | no |
| Size, Layout, Position, Move, Image, Structure tools | yes | yes | no |
| Whole-object selection, element palette | no | yes | no |
| Versions | yes | yes | no |
| Keep changes per site (applied before paint) | no | no | yes |
| Easier to read settings | no | no | yes |
| Everyday words, short tutorial, Delete button | no | no | yes |
| Pictures marked as "edited page" | no | no | yes |
| Host access | on the clicked tab; all sites optional | same | one site at a time, asked when you keep |

An edition is a name, a description and a list of features it leaves out (`EDITIONS` in `scripts/build.mjs`). All three are built from the same source,
so a fix in the editor reaches all of them.

## Where it is intended to be used

**Intended**
- Ordinary web pages (`http` and `https`), including strict content security policies, web components, and single-page apps.
- Design review on a live site, staging site or local dev server (`localhost`), before anything is written in the source.
- Personal customisation and accessibility on sites the person does not control.
- Producing change requests for a developer or an AI agent.

**Works, with limits**
- Pages that build their content differently on every load: structure changes are replayed from selectors and may not find their elements; they are kept and listed until forgotten.
- Pages whose styles come from another origin: the Classes panel cannot read those rules and says so.

**Not intended, or not possible**
- Browser pages (`chrome://`), the Chrome Web Store, PDFs and other pages the browser does not let extensions touch. The extension says so rather than failing silently.
- Cross-origin iframes (separate documents) and closed shadow roots.
- Changing a site for anyone else. Edits exist only in the browser that made them: **it is not a way to alter a live site, and not a security boundary**.
- Editing source files. It produces the change list; applying it is the developer's or the AI's job.

## What it stores and what it asks for

- **Permissions:** `activeTab`, `scripting`, `storage`. Access to every site is optional and exists only so edits come back after a reload and previews show them. Personal adds `contextMenus`.
- **Stored locally in `chrome.storage`:** your edits (per page in the designer edition, per site in Personal), whether you have seen the tutorial, and small preferences. Nothing leaves the browser.
- Full statement: `store/PRIVACY.md`.

## Where to go next

| I want to... | Read |
|---|---|
| Install and use it | [README](../README.md) |
| Understand the code, the browser APIs it depends on, or port it | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Understand why there are three editions and how Keep works | [EDITIONS.md](EDITIONS.md) |
| Run or add tests and CI | [CI_DESIGN.md](CI_DESIGN.md), the README's Test section |
| Have an AI apply an exported change list | [`skills/sitecleaner-apply/SKILL.md`](../skills/sitecleaner-apply/SKILL.md) |
| See what changed in each release | [CHANGELOG.md](../CHANGELOG.md) |
