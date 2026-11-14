  // ---------- picker mode ----------
  function select(element, add) {
    if (!element || ours(element) || element === document.documentElement) return;
    if (add && selection.includes(element)) setSelection(selection.filter((el) => el !== element));
    else setSelection(add ? [...selection, element] : [element]);
    if (!add) { closeTool(); menuOpen = false; }   // adding more keeps the tool that is open
    showChanges = false;
    showPreview = false;
    showFind = false;
    showKeys = false;
    renderDock();
    refreshBoxes();
  }
  const STOPPED = ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "auxclick", "contextmenu", "submit", "dragstart"];
  function swallow(event) {
    if (ours(eventTarget(event))) return;
    for (const hook of pageEventHooks) if (hook(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") {
      if (repicking) { const rule = repicking; repicking = null; finishRepick(rule, eventTarget(event)); renderDock(); return; }
      climbed = []; select(eventTarget(event), event.shiftKey);
    }
  }
  function onMove(event) {
    if (ours(eventTarget(event))) { hovered = null; } else { hovered = eventTarget(event) === document.documentElement ? null : eventTarget(event); }
    refreshBoxes();
  }
  function onKey(event) {
    if (event.altKey && event.shiftKey && event.code === "KeyP") { event.preventDefault(); setOn(!on); return; }
    if (event.altKey && event.shiftKey && event.code === "KeyE" && has("export")) { event.preventDefault(); copyChanges(); return; }   // works with the picker off too
    if (!on) return;
    if (event.altKey && event.shiftKey && (event.code === "KeyC" || event.code === "KeyV") && selected) {
      event.preventDefault();
      if (event.code === "KeyC") copyLook(selected); else pasteLook(targets());
      return;
    }
    if (tourStep !== null) {   // the guide is open: Esc closes it, the arrows turn its pages
      if (event.key === "Escape") { event.preventDefault(); endTour(); return; }
      if (event.key === "ArrowRight" && tourStep < TOUR.length - 1) { event.preventDefault(); tourStep += 1; renderDock(); return; }
      if (event.key === "ArrowLeft" && tourStep > 0) { event.preventDefault(); tourStep -= 1; renderDock(); return; }
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && /^[zy]$/i.test(event.key)) {
      const editing = isEditingField(eventTarget(event));
      const forward = event.key.toLowerCase() === "y" || event.shiftKey;
      if (!editing && (forward ? redoStack.length : undoStack.length)) { event.preventDefault(); if (forward) redo(); else undo(); }
      return;
    }
    for (const hook of keyHooks) if (hook(event)) return;
    if (event.key === "/" && has("find") && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditingField(eventTarget(event))) {   // find
      event.preventDefault();
      showFind = true; showChanges = false; showPreview = false; showKeys = false;
      renderDock();
      return;
    }
    if (event.key.toLowerCase() === "g" && has("measure") && !event.ctrlKey && !event.metaKey && !event.altKey && selected && !isEditingField(eventTarget(event))) {   // hold for guides
      event.preventDefault();
      if (!event.repeat) { guiding = true; renderGuides(); }
      return;
    }
    if (event.key.toLowerCase() === "i" && has("inspector") && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditingField(eventTarget(event))) {   // toggle the inspector
      event.preventDefault();
      if (!event.repeat) { setInspect(!inspecting); renderDock(); }
      return;
    }
    if (event.key.toLowerCase() === "m" && has("measure") && !event.ctrlKey && !event.metaKey && !event.altKey && selected && !isEditingField(eventTarget(event))) {   // hold to measure
      event.preventDefault();
      if (!event.repeat) { measuring = true; renderMeasure(); }
      return;
    }
    if (event.key === "\\" && has("compare") && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditingField(eventTarget(event))) {   // hold to compare
      event.preventDefault();
      if (!event.repeat) setCompare(true);
      return;
    }
    const typing = ours(eventTarget(event)) && (/^(INPUT|TEXTAREA|SELECT)$/.test(eventTarget(event).tagName) || isEditingField(eventTarget(event)));
    if (event.key === "Escape") {
      event.preventDefault();
      if (repicking) { repicking = null; showToast("Cancelled."); }
      else if (showKeys) showKeys = false;
      else if (showFind) showFind = false;
      else if (showPreview) showPreview = false;
      else if (showChanges) showChanges = false;
      else if (tool) closeTool();
      else if (menuOpen) menuOpen = false;
      else if (selected) { setSelection([]); climbed = []; }
      renderDock(); refreshBoxes();
      return;
    }
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "ArrowUp" && selected) {
      event.preventDefault();
      const parent = selected.parentElement;
      if (parent && parent !== document.documentElement && !ours(parent)) { climbed.push(selected); select(parent); }
    } else if (event.key === "ArrowDown" && selected) {
      event.preventDefault();
      let next = climbed.pop();
      if (!next || !selected.contains(next) || next === selected) next = [...selected.children].find((c) => !ours(c)) || null;
      if (next) select(next);
    } else if (event.key === "Enter" && selected && (!ours(eventTarget(event)) || eventTarget(event) === toggle)) {   // the Design button keeps focus after a mouse click: Enter must not press it
      event.preventDefault();
      menuOpen = true;
      renderDock();
    }
  }
  let pollTimer = null;
  function setOn(value) {
    on = value;
    if (!host.isPreview()) host.reportOn(on);
    const method = on ? "addEventListener" : "removeEventListener";
    for (const type of STOPPED) window[method](type, swallow, true);
    window[method]("mousemove", onMove, true);
    clearInterval(pollTimer);   // the page may move things around (the board does): poll for it only while the picker is on
    pollTimer = on ? setInterval(() => { if (selected) refreshBoxes(); }, 500) : null;
    if (!on) { repicking = null; keptIntro = false; for (const hook of offHooks) hook(); inspecting = false; renderInspect(null); hovered = null; setSelection([]); climbed = []; menuOpen = false; tool = null; showChanges = false; tourStep = null; }
    else {
      if (!host.tourSeen(TUTORIAL_VERSION)) tourStep = 0;   // the first time on this browser, and once after an update that changes the tutorial
    }
    renderDock();
    refreshBoxes();
  }
