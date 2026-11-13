
  // ---------- start ----------
  window.__designerApi = { toggle: () => setOn(!on), isOn: () => on };   // the extension's toolbar button
  if (PREVIEW) { startPreviewMode(); return; }   // the screen-size preview window
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", refreshBoxes, { capture: true, passive: true });
  window.addEventListener("resize", refreshBoxes);
  setInterval(() => { if (on && selected) refreshBoxes(); }, 500);   // the page may move things around (the board does)
  toggle.addEventListener("click", () => setOn(!on));
  host.mount(root);
  restore();
})();
