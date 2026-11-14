"use strict";
// The designer's SiteCleaner. Accounts marked as designers (accounts_admin.py make-designer) get this on every page (auth.js loads it).
// Alt+Shift+P (or the Design button) turns picker mode on: clicks select an element instead of reaching the page; ↑ selects the
// parent, ↓ a child, Enter opens Fill / Border / Shadow / Text / Font / Size / Spacing / Radius / Layout, Ctrl+Z undoes, Esc closes things and clears the selection; Alt+Shift+E copies every change
// as Markdown (the tutorial, shown the first time and under "Tutorial", explains all of this). Edits are inline styles on THIS
// browser's copy of the page only: nothing is sent to the server; they are kept in this browser (localStorage, per page) and put back after a reload. "Changes" exports them as
// Markdown (selector, before → after) to hand to a developer or an AI. This is a convenience for designers, not a security
// boundary: anyone can do the same in their browser's developer tools, and the server never trusts any of it.
// The same file is the Chrome extension's picker (extension/): everything that depends on where it runs is in `host` below.
(function boot() {
  const pre = window.__designerHost;
  if (pre && pre.ready && !pre.loaded) { pre.ready.then(() => { pre.loaded = true; boot(); }); return; }   // the extension loads its saved state first
  if (window.__designerLoaded) return;
  window.__designerLoaded = true;
