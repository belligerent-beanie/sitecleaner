# Figma prototype: finishing script (temporary)

One-off script that finishes the click-through mock of the SiteCleaner Studio editor panel in Figma.
It lives on a throwaway branch (`figma-finish-prototype`): run it once, then delete the branch.

- Figma file: https://www.figma.com/design/wC0emnt3iN9mTr0WNxFyEK/Untitled
- Page it works on: **Editor panel (Studio, dark)**
- Script: `tools/figma-prototype/finish-prototype.js`

## Why a script

The Figma MCP server hit its Starter-plan call limit before the last steps could be made, so they are done with Figma's own
plugin runtime instead (not counted against that limit). The script was syntax-checked only; it has not been run.

## What it does (safe to run again)

1. Adds a **Hover** variant to every icon button and to Done, using the hover colours in `src/picker.css`
   (`--dz-field-hover` `#383843`, and `#ff7dbb` for pink buttons).
2. Creates one `Button/Chip` component set (Active x State) and swaps every plain chip button in the `State/...` frames for an instance.
3. Wires every hover, the chip clicks (a chip turns active), and the tutorial: number buttons, Back, Next, Done and Close, plus
   "Open Changes" and "Open Keys". Keyboard steps are not wired.
4. Deletes what is old: the html.to.design import on **Page 1**, the first assembled frame ("Site with SiteCleaner on...") and the
   standalone dock ("SiteCleaner Studio - editor panel"). Each is matched by name before it is removed. Undo with Cmd+Z or the
   file's version history.

Not covered: hover on the Elements tiles, the plain "Close" link and the colour swatches; there is no pressed state because the
live build has none.

## How to run it

1. Open the Figma file above, on the page **Editor panel (Studio, dark)**.
2. Either:
   - install the free community plugin **Scripter** (works in the browser), open it from Plugins > Scripter, paste the whole of
     `finish-prototype.js` and press Run; or
   - in the Figma desktop app: Plugins > Development > New plugin > Run once, and paste the script into `code.js`.
3. A message at the bottom of the canvas reports the number of hovers and clicks wired, or why it failed. The same summary is
   printed to the plugin console.
4. Click Present (Shift+Space) to try the mock. It starts at **No selection**.

If it throws an error, paste the message back so the script can be fixed.

## Afterwards

Delete this branch (`git branch -D figma-finish-prototype`; add `git push origin --delete figma-finish-prototype` if it was pushed).
Nothing else in the repository depends on it.
