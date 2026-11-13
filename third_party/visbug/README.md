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
