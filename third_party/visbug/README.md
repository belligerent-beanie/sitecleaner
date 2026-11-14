# VisBug, the source this product is derived from

[VisBug](https://github.com/GoogleChromeLabs/ProjectVisBug) is a browser extension for editing a live web page, by Adam Argyle and its
contributors, licensed under the **Apache License 2.0** (the licence is in this folder, unmodified). Its repository was archived by its owner
on 15 September 2026. Version read: 0.4.9, last commit 2 August 2026.

This product took what it does from VisBug (selection and keyboard handling, the editing tools, the inspector, guides, search, hue shift,
duplicating, deleting, grouping, moving and so on) and re-built it on its own foundation: every edit is recorded, so it can be undone, kept
across reloads and handed over as a change list. Where a file's logic comes from VisBug, the file starts with a header naming the VisBug file
it was adapted from, and it is listed below. All of them have been modified.

| This product's file | Adapted from (VisBug) | What changed |
|---|---|---|
| `src/parts/300-editing-the-page-s-structure.js` | `app/features/selectable.js` | Delete, duplicate, copy / cut / paste of elements, group and ungroup, select similar, walking siblings with Tab: each is now a recorded, undoable op; pasted markup is cleaned of scripts and event handlers; body and html are protected. |
| `src/parts/310-editing-text-in-place.js` | `app/features/text.js` | Double-click to edit text: only text with nothing inside it; recorded as a text change (saved, exported, one undo step); Enter / Escape end it. |
| `src/parts/320-the-move-tool.js` | `app/features/move.js` | Arrow-key moves (past a sibling, out of the parent, into the next sibling) as recorded ops; dragging reorders by inserting before / after the hovered sibling (one move) instead of VisBug's swap of the two; body and html protected. |
| `src/parts/330-the-position-tool.js` | `app/features/position.js` | Drag to place and arrow-key nudging (1 px, Shift 10 px, a static element becomes relative): recorded as position, top, left and z-index, one undo step per drag or run of nudges, selected elements move together; a panel with exact numbers. SVG elements are not moved. |
| `src/parts/340-replacing-images.js` | `app/features/imageswap.js` | Drop an image file on an `<img>`, `<picture>` or background picture to replace it (picture sources and srcset replaced too): recorded as attribute and style changes (undone, kept across reloads when small, in the export with the file's name and a note that srcset was dropped); an Image tool with a file chooser and an address field; paste an image. Dragging one image of the page onto another is not taken over. |
| `src/parts/360-shortcuts-and-nudging.js` | `app/components/vis-bug/model.js`, `app/features/padding.js`, `margin.js`, `font.js` | The keyboard model: a letter opens a tool, arrow keys nudge (1 unit, Shift ten, Alt the other way, Ctrl with up / down all four sides), with this product's tools on the letters; every nudge is recorded and a run of presses is one undo step; a shortcuts panel. |
| `src/parts/370-movable-dock-and-box-model.js` | `app/components/vis-bug/vis-bug.element.js` (the draggable toolbar), `app/components/selection/box-model.element.js` | The dock is dragged by its header (double-click puts it back); while the Spacing tool is open the margin (orange, outside) and padding (green, inside) are drawn around the selection. |
| `src/parts/250-the-font-tool.js` (bold and italic), `src/parts/390-selection-label.js` | `app/features/font.js` (Cmd+B and Cmd+I toggles), `app/components/selection/label.element.js` | Bold and italic are buttons as well as keys, go through the same undo, saving and export as every other property, and the bold test is on weight 600 and up. The label also gives the element's size and the state being edited, counts a selection of several, and points to an element scrolled out of view. |
| `src/parts/400-gridlines.js` | `app/components/selection/gridlines.element.js` | Four lines through the edges of the selection across the window. Modified: a remembered switch (the Gridlines button, or `;`), for up to 12 selected elements, drawn dashed in the picker's own layer; not the same as the alignment guides (hold `G`). |

## Not derived from VisBug

`src/parts/350-screenshot.js` (screenshots of the selection or the page) is this product's own work: VisBug lists a screenshot tool but ships only
`alert('Coming Soon!')`. The same goes for the picker's foundation (recording, undo, saved edits, the Markdown export, the host adapter), the
contrast, APCA, find, tone, guides, layout, font, size, spacing, radius and shadow panels, and the Chrome extension around it.
