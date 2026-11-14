
  // ---------- start ----------
  window.__designerApi = { toggle: () => setOn(!on), set: (value) => { if (!!value !== on) setOn(!!value); }, isOn: () => on };   // the extension's toolbar button
  if (PREVIEW) { startPreviewMode(); return; }   // the screen-size preview window
  window.addEventListener("keydown", onKey, true);
  // Redraw the outlines at most once per frame, and only while the picker is on: with it off there is nothing to place, and a scroll
  // event fires many times a frame.
  let refreshQueued = false;
  const scheduleRefresh = () => {
    if (!on || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => { refreshQueued = false; if (on) refreshBoxes(); });
  };
  window.addEventListener("scroll", scheduleRefresh, { capture: true, passive: true });
  window.addEventListener("resize", scheduleRefresh);
  if (host.kept) host.kept.onChange(() => {
    showCount();
    const kept = host.kept.get();
    if (plain() && on && kept && (kept.rules.length || (kept.presets && kept.presets.access)) && host.getPref("keptIntro") !== "1") {   // the first time anything is kept (even after the permission window)
      host.setPref("keptIntro", "1");
      keptIntro = true; showChanges = true; showFind = false; showPreview = false; showKeys = false; tourStep = null;
      renderDock();
    } else if (on && showChanges) renderDock();
  });   // kept from another tab, or removed in this panel
  toggle.addEventListener("click", () => setOn(!on));
  host.mount(root);
  restore();
})();
