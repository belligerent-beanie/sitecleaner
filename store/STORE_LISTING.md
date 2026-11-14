# Chrome Web Store listing (draft)

Everything the developer dashboard asks for, ready to paste. What remains is for a person: a developer account (a one-time fee), the upload, and the
review. Build the file to upload with `node scripts/build.mjs --zip` (it writes `releases/sitecleaner-<version>.zip`).

**Decisions before publishing**
- **The name.** The owner chose "SiteCleaner" (14 November 2026). Two checks remain: search the store for a clash, and weigh how it reads. "Cleaner" names are
  most often antivirus, ad-blocking and tidy-up tools, and the store's policy on misleading names and descriptions is enforced; the listing text below says
  plainly that this is a design and review tool, which is the mitigation. If the review objects, rename in `extension/manifest.template.json` (`name`,
  `action.default_title`) and the strings in `src/`. Do not use "VisBug" (Apache-2.0 gives no right to the name).
- **Where the project lives.** https://github.com/belligerent-beanie/sitecleaner (public since 14 November 2026). The two URLs below point there; if the repository is ever moved or renamed, change them
  here and in `store/PRIVACY.md`.

## Basics

| Field | Value |
|---|---|
| Name | SiteCleaner |
| Category | Developer Tools |
| Language | English |
| Summary (from the manifest, 132 characters at most) | Select, restyle, move and measure anything on any page, check contrast, undo it all, and hand the changes to a developer or Claude. |
| Privacy policy URL | https://github.com/belligerent-beanie/sitecleaner/blob/main/store/PRIVACY.md |
| Homepage / support URL | https://github.com/belligerent-beanie/sitecleaner |
| Screenshots (1280 × 800) | `store/screenshots/*.png` (regenerate with `node scripts/screenshots.mjs`) |
| Small promo tile (440 × 280) | `store/promo-tile-440x280.png` (regenerate with `node scripts/promo-tile.mjs`) |

## Detailed description

> SiteCleaner lets you try design changes on a live page, undo any of them, and hand over what you changed in a form a developer (or Claude) can apply.
>
> **Select and restyle** any element: fill, border, shadow, corner radius, text, font (colour, size, weight, bold and italic, line height, spacing, alignment), size (type a
> number or drag the handles), padding and margin, flex and grid layout. Shift-click to select several elements and change them all at once, or search by
> CSS selector to select every match. Shift the hue, saturation and brightness of a whole selection together. Copy one element's look and paste it onto others.
>
> **Hover and focus.** Switch a tool to the hover, focus or active state and restyle it there, starting from the look the site already gives it. The change is exported as a
> `:hover`, `:focus` or `:active` rule.
>
> **Edit the page itself.** Delete, duplicate, copy, cut, paste and group elements. Double-click text to retype it. Move elements through the page with the
> arrow keys or by dragging, or place them anywhere. Drop an image file on a picture to replace it.
>
> **Check as you go.** Every colour picker shows the WCAG contrast ratio (AA and AAA) and the APCA contrast value live, and lists the colours the page already
> uses, with the names of its CSS variables. Hover anything with the inspector to see its size, type, colours, contrast and the name a screen reader would
> announce. Hold a key to measure distances between elements, another to see what lines up, switch on gridlines through the selection's edges, and hold another to flip back to the original page.
>
> **Work safely.** One undo and redo for everything, down to a whole drag or a run of key presses being a single step. Edits are kept per page and come back
> after a reload. Preview your edits at phone, tablet and laptop sizes in a real browser window. Save a screenshot of the selection.
>
> **Hand it off.** Copy every change as Markdown: the selector, then before and after for each property, what the change did to the contrast, and the structure
> changes in order. Paste it to a developer or into a chat with Claude.
>
> Private by design: no account, no servers, no analytics. Your edits stay in your browser. Open source (Apache-2.0), standing on the ideas of VisBug.

## Single purpose

Lets a designer select, restyle, move and measure elements on a web page to try changes, and export them as a change list.

## Permission justifications (for the review form)

- **activeTab**: runs the picker only on the tab the user clicks the extension on, and takes a screenshot of that tab when asked; no other tab is touched.
- **scripting**: injects the picker into that tab; when the user has allowed all sites, also restores their saved edits after a reload and puts them on a preview window.
- **storage**: keeps the user's edits for each page, and a flag that the first-time guide has been seen, in the browser.
- **Optional host permission (all sites)**: requested only when the user presses *Allow all sites* on the options page, so that saved edits are restored automatically
  after a reload and screen-size previews show the edits. A small script checks local storage for saved edits for the page and does nothing if there are none.
  It can be removed from the options page at any time.
- **Remote code**: none. All code is in the package; nothing is fetched or evaluated at run time. Markup pasted into a page is cleaned of scripts and event handlers.
- **Data use**: none collected, sold, transferred or used for any purpose other than the single purpose above.

## Where it can be hosted

- **GitHub** holds the source and can hold the built zip as a release asset (for people who install by hand: unzip, then Load unpacked). Chrome will
  **not** install an extension from a GitHub link, and updates do not arrive by themselves that way.
- **The Chrome Web Store** is the route for installing and updating in one click: a developer account (a one-time registration fee), the upload
  of `releases/sitecleaner-<version>.zip`, the listing text above, and Google's review. Microsoft Edge Add-ons takes the same package, for free.
- Self-hosting a package for ordinary users is not possible in Chrome (only inside a company, through a policy).

## Real Chrome checklist (before every release; CI cannot cover it)

Run `bun run build`, load `dist` at `chrome://extensions` (Developer mode, Load unpacked), then on a plain site, on github.com (strict security policy),
and on a site with its own hover and focus styles (CSS Zen Garden is a good one):

1. The shortcut turns the picker on (`chrome://extensions/shortcuts` shows the key; the options page shows it too). The toolbar button does the same.
2. Click an element, press Enter, change a fill from the palette, read the contrast, undo with Ctrl+Z.
3. With nothing selected, Tab selects the first element (it does not move into the panel); F6 moves into the panel and back out. Check F6 reaches
   the page: Chrome may keep the key for itself on some systems.
4. Hover and focus: switch the State row to hover, change the fill, move the real pointer over the element; the same with focus and the Tab key.
5. Delete a paragraph and undo; drag with the Move tool.
6. Reload: the Changes count is the same, and the edits are back. With **Allow all sites** on, the picker is also still on; without it, press the toolbar button.
7. Turn the picker off and reload: it stays off, and the edits are back.
8. Alt+Shift+E copies the changes; paste them and read them.
9. The light, dark and auto looks (Changes panel) all read well.
10. Screenshot, and a screen-size Preview (needs all sites).

Record the Chrome version, the site and anything that differed from the test run in the release notes.

## Release checklist

1. `bun run test` passes (and `bun run smoke` by hand).
2. Bump `version` in `package.json`; `node scripts/build.mjs --zip`.
3. Fill in the name decision and the two URLs above.
4. Upload the zip; paste the fields above; add the screenshots; submit.
