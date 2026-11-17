  // ---------- the tutorial ----------
  // The tutorial: opened on the first run (and once after an update that changes it), and by the Tutorial button at the top of the panel at any time.
  // A page may have an `action`: a button that closes the tutorial and opens what the page is about.
  const TUTORIAL_VERSION = "0.4.0";   // change it when the tutorial changes enough to show it once more to people who have seen the last one
  const FULL_TOUR = [
    { title: "Welcome", lines: [
      "SiteCleaner lets you try changes on any page and then hand them over. Nothing touches the real site: it all happens in this tab, and Ctrl+Z undoes it.",
      "Turn it on with the toolbar icon or Alt+Shift+P. The Tutorial button at the top of this panel brings these pages back whenever you like."] },
    { title: "Select", lines: [
      "Click an element: a label shows its name and size. Shift-click adds more, and the tools then change all of them.",
      "↑ ↓ go to the parent and child, ← → to the previous and next sibling. / finds everything that matches a selector or some words. Esc clears.",
      "The Classes link lists the page's classes, most used first: click one to select every element that has it."],
      action: { label: "Try Find", run: () => { showFind = true; } } },
    { title: "Style", lines: [
      "Press Enter, or a letter: C fill, B border, D shadow, E text, F font, S size, P spacing, R radius, A layout, H tone. The page changes at once.",
      "Fill and Font show the contrast against the background (WCAG and APCA). In Font, B and I (or Ctrl+B and Ctrl+I) switch bold and italic. With a tool open, the arrow keys nudge a value: Shift for ten."] },
    { title: "Hover and focus", lines: [
      "The State buttons (normal, hover, focus, active) point every tool at that state. The element is shown in it while you edit, starting from the site's own look for it.",
      "They are exported as :hover, :focus and :active rules."] },
    { title: "Edit the page itself", lines: [
      "Delete removes, Ctrl+D duplicates, Ctrl+C / X / V copy, cut and paste, Ctrl+G groups. Double-click text to retype it. Drop an image file on a picture to replace it.",
      "V moves elements through the page (arrows, or drag a sibling), L places them anywhere. All of it is undone with Ctrl+Z."] },
    { title: "Look closely", lines: [
      "I inspects whatever is under the pointer: size, type, colours, contrast and its accessible name. Hold M to measure distances, G to see what lines up, and the backslash key to see the original.",
      "The Gridlines button (or ;) draws lines through the selection's edges. Preview shows the page at phone, tablet and laptop sizes; Alt+Shift+S saves a screenshot."],
      action: { label: "Gridlines on or off", run: () => setGridlines(!gridOn()) } },
    { title: "Hand it over", lines: [
      "Alt+Shift+E copies the changes for an AI or a developer. Elements that share a class are one entry: \"×5\" means all five changed (so change the class), \"2 of 5\" that only two did. \"from:\" names the rule that defines the property now.",
      "Changes shows what the list costs, and switches between Compact and Detailed (every element, with before and after)."],
      action: { label: "Open Changes", run: () => { showChanges = true; showAccess = false; } } },
    { title: "Keep your work", lines: [
      "Ctrl+Z undoes, Ctrl+Shift+Z redoes, Reset all puts the page back. Your changes are kept per page and come back after a reload.",
      "In the extension's Options, \"Allow all sites\" also turns the picker back on by itself after a reload. The Changes panel sets the look of this panel: light, dark or automatic."] },
    { title: "Every shortcut", lines: [
      "? (or Keys) lists every shortcut, grouped.",
      "The Tutorial button at the top of this panel shows these pages again, at any time."],
      action: { label: "Open Keys", run: () => { showKeys = true; showAccess = false; } } },
  ];
  const PLAIN_TOUR = [
    { title: "Welcome", lines: [
      "Click anything on a page to change how it looks: colours, text, spacing, corners. Nothing touches the real site, and Undo takes anything back.",
      "Turn this on with the toolbar icon. The Tutorial button at the top of this panel shows these pages again."] },
    { title: "Change things", lines: [
      "Click an element, then choose what to change: Background, Text style, Corners and so on. Shift-click picks several at once, so one change covers them all.",
      "Edit words changes what it says (double-clicking text does too), and Delete takes it off the page. You see every change as you make it."] },
    { title: "Keep it", lines: [
      "Press Keep and your changes are there every time you visit this site. The first time, your browser asks to allow the extension on that one site, and only that one.",
      "My changes lists what you have kept, with a switch to turn it off and a Remove for each change. The extension's options list all your sites."],
      action: { label: "Open My changes", run: () => { showChanges = true; showAccess = false; } } },
  ];
  const TOUR = plain() ? PLAIN_TOUR : FULL_TOUR;
  function endTour() {
    tourStep = null;
    host.markTourSeen(TUTORIAL_VERSION);
    renderDock();
  }
  function tourPanel() {
    const page = TOUR[tourStep];
    const last = tourStep === TOUR.length - 1;
    const goTo = (n) => { tourStep = n; renderDock(); };
    return h("div", { class: "dz-tour" },
      h("div", { class: "dz-head" },
        h("strong", { text: `Tutorial ${tourStep + 1} / ${TOUR.length}` }),
        h("button", { type: "button", class: "dz-link", text: "Close", title: "Close the tutorial (Esc)", onclick: endTour })),
      h("p", { class: "dz-tour-title", text: page.title }),
      ...page.lines.map((line) => h("p", { class: "dz-hint", text: line })),
      ...(page.action ? [h("div", { class: "dz-menu" },
        h("button", { type: "button", class: "dz-menu-button", text: page.action.label, title: "Closes the tutorial and shows it",
                      onclick: () => { endTour(); page.action.run(); renderDock(); refreshBoxes(); } }))] : []),
      h("div", { class: "dz-menu dz-tour-steps", role: "group", "aria-label": "Tutorial pages" },
        ...TOUR.map((entry, i) => h("button", { type: "button", class: "dz-menu-button dz-step" + (i === tourStep ? " dz-active" : ""), text: String(i + 1),
          title: entry.title, "aria-label": `Page ${i + 1}: ${entry.title}`, "aria-current": i === tourStep ? "step" : "false", onclick: () => goTo(i) }))),
      h("div", { class: "dz-menu" },
        h("button", { type: "button", class: "dz-menu-button", text: "Back", disabled: tourStep === 0, onclick: () => goTo(tourStep - 1) }),
        h("button", { type: "button", class: "dz-menu-button dz-active", text: last ? "Done" : "Next",
                      onclick: () => { if (last) endTour(); else goTo(tourStep + 1); } })));
  }

  function renderDock() {
    dock.replaceChildren();
    sizeSync = null;   // the Size panel, if it is open, sets this again when it is built
    dock.hidden = !on;
    const word = plain() ? "Edit" : "Design";
    toggle.textContent = on ? `${word}: on` : word;
    toggle.classList.toggle("dz-on", on);
    if (!on) return;
    updateHandles();
    if (tourStep !== null) { dock.append(tourPanel()); return; }

    changesLink = h("button", { type: "button", class: "dz-link", text: `${say("changes", "Changes")} (${changeCount()})`, onclick: () => { showChanges = !showChanges; showAccess = false; showClasses = false; showPreview = false; showFind = false; showKeys = false; renderDock(); } });
    undoLink = h("button", { type: "button", class: "dz-link", text: "Undo", title: "Undo (Ctrl+Z)", onclick: undo });
    redoLink = h("button", { type: "button", class: "dz-link", text: "Redo", title: "Redo (Ctrl+Shift+Z or Ctrl+Y)", onclick: redo });
    showHistory();
    inspectLink = h("button", { type: "button", class: "dz-link" + (inspecting ? " dz-on-link" : ""), text: "Inspect", title: "Hover anything to see its size, type, colours, contrast and accessible name (I)", "aria-pressed": String(inspecting),
      onclick: () => { setInspect(!inspecting); inspectLink.setAttribute("aria-pressed", String(inspecting)); } });
    const compareLink = h("button", { type: "button", class: "dz-link", text: "Compare", title: "Hold to see the original page (or hold the \\ key)" });
    compareLink.addEventListener("pointerdown", (event) => { event.preventDefault(); setCompare(true); });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) compareLink.addEventListener(type, () => setCompare(false));
    const findLink = h("button", { type: "button", class: "dz-link", text: "Find", title: "Select everything that matches a CSS selector or some words (/)",
      onclick: () => { showFind = !showFind; showChanges = false; showAccess = false; showPreview = false; showKeys = false; showClasses = false; renderDock(); } });
    const classesLink = h("button", { type: "button", class: "dz-link", text: "Classes", title: "The classes the page defines: how many elements use each, where, and the rules", "aria-pressed": String(showClasses),
      onclick: () => { showClasses = !showClasses; showFind = false; showAccess = false; showChanges = false; showPreview = false; showKeys = false; renderDock(); } });
    const previewLink = h("button", { type: "button", class: "dz-link", text: "Preview", title: "See this page at phone, tablet and laptop sizes",
      onclick: () => { showPreview = !showPreview; showChanges = false; showAccess = false; showFind = false; showKeys = false; showClasses = false; renderDock(); } });
    const versionsLink = h("button", { type: "button", class: "dz-link", text: setLabel(), title: "Save the page as it looks now, and flip between two saved looks to see which you prefer", "aria-pressed": String(showVersions),
      onclick: () => { showVersions = !showVersions; showChanges = false; showAccess = false; showPreview = false; showFind = false; showKeys = false; showClasses = false; renderDock(); } });
    const paletteLink = h("button", { type: "button", class: "dz-link", text: "Elements", title: "Known elements to drag onto the page: the page's own components, and basics", "aria-pressed": String(showPalette),
      onclick: () => { showPalette = !showPalette; showVersions = false; showChanges = false; showAccess = false; showPreview = false; showFind = false; showKeys = false; showClasses = false; if (showPalette) palette = null; renderDock(); } });
    const head = h("div", { class: "dz-head" },
      h("strong", { text: selection.length > 1 ? `${selection.length} elements` : selected ? label(selected) : "SiteCleaner" }),
      h("button", { type: "button", class: "dz-menu-button dz-tutorial", text: "Tutorial", title: "A short tutorial: what SiteCleaner can do, and how", onclick: () => { tourStep = 0; renderDock(); } }),
      undoLink, redoLink,
      has("keep") && host.keep && h("button", { type: "button", class: "dz-link dz-keep", text: "Keep", title: "Keep these changes on this site, so they are there every time you visit", onclick: keepOnSite }),
      has("find") && findLink, has("classes") && classesLink, has("inspector") && inspectLink, has("compare") && compareLink, has("preview") && previewLink,
      host.features && host.features.access === true && h("button", { type: "button", class: "dz-link", text: "Easier to read", title: "Bigger text, clearer links, calmer pages: kept for this site if you like", "aria-pressed": String(showAccess),
        onclick: () => { if (showAccess) { showAccess = false; renderDock(); } else openAccess(); } }),
      paletteOn() && paletteLink, changesLink, has("versions") && versionsLink,
      friendly() && h("button", { type: "button", class: "dz-link", text: exactElements() ? "Exact elements" : "Whole objects", "aria-pressed": String(!exactElements()),
        title: "Whole objects: a click picks the thing you see, not the page's wrappers around it. Exact elements: a click picks the page's own element (Alt-click does that once).",
        onclick: () => { host.setPref("exact", exactElements() ? "0" : "1"); setSelection([]); climbed = []; renderDock(); refreshBoxes(); } }),
      h("button", { type: "button", class: "dz-link", text: "Keys", title: "Every keyboard shortcut (?)", "aria-pressed": String(showKeys),
                    onclick: () => { showKeys = !showKeys; showChanges = false; showAccess = false; showPreview = false; showFind = false; showClasses = false; renderDock(); } }),
      h("button", { type: "button", class: "dz-link", text: "Off", title: "Turn picker mode off", onclick: () => setOn(false) }));
    dock.append(head);

    if (showAccess || showPreview || showKeys || showClasses || showFind || showChanges || showVersions) showPalette = false;   // opening another panel closes this one
    if (showAccess || showPreview || showKeys || showClasses || showFind || showChanges) showVersions = false;
    if (showPalette && paletteOn()) { dock.append(palettePanel()); return; }
    if (showVersions && has("versions")) { dock.append(setsPanel()); return; }
    if (showAccess && has("access")) { dock.append(accessPanel()); return; }
    if (showPreview) { dock.append(previewPanel()); return; }
    if (showKeys) { dock.append(keysPanel()); return; }
    if (showClasses) { dock.append(classesPanel()); return; }
    if (showFind) { const panel = findPanel(); dock.append(panel); panel.querySelector(".dz-find").focus(); return; }   // focus at once: keys typed straight after / must land in the field
    if (showChanges) { dock.append(changesPanel()); return; }
    if (!selected) {
      dock.append(h("p", { class: "dz-hint", text: plain() ? "Click anything on the page to change it. Shift-click picks several. Press Keep when you like it." : "Click any element to select it; Shift-click adds more. ↑ parent, ↓ child, ← → siblings, Enter for the tools, Esc to clear." + (has("find") ? " / to find." : "") + (has("measure") ? " Hold M to measure or G for alignment guides." : "") + (has("inspector") ? " I to inspect." : "") + (has("export") ? " Alt+Shift+E copies your changes." : "") }));
      return;
    }
    const lookRow = () => h("div", { class: "dz-menu dz-look" },
      h("button", { type: "button", class: "dz-menu-button", text: "Copy look", title: "Copy this element's fill, type, border, corners, shadow and padding (Alt+Shift+C)", onclick: () => copyLook(selected) }),
      h("button", { type: "button", class: "dz-menu-button", text: "Paste look", disabled: !copiedLook, title: copiedLook ? `Paste the look of ${copiedLook.from} (Alt+Shift+V)` : "Copy an element's look first",
                    onclick: () => pasteLook(targets()) }),
      has("measure") && h("button", { type: "button", class: "dz-menu-button" + (gridOn() ? " dz-active" : ""), text: "Gridlines", "aria-pressed": String(gridOn()),
                    title: "Draw lines through the edges of the selection, across the page (;)", onclick: () => setGridlines(!gridOn()) }),
      h("button", { type: "button", class: "dz-menu-button", text: "Screenshot", disabled: !host.capture, title: host.capture ? "Save a PNG of the selected elements, or of the page if nothing is selected (Alt+Shift+S)" : "Screenshots need the Chrome extension",
                    onclick: () => takeScreenshot() }));
    const tools = () => h("div", { class: "dz-tools" }, has("states") && stateRow(), h("div", { class: "dz-menu" },
      menuButton("fill", say("fill", "Fill")), menuButton("border", say("border", "Border")), menuButton("shadow", say("shadow", "Shadow")), menuButton("radius", say("radius", "Radius")), menuButton("tone", say("tone", "Tone")),
      menuButton("text", say("text", "Text")), menuButton("font", say("font", "Font")), has("image") && menuButton("image", "Image"),
      has("size") && menuButton("size", "Size"), menuButton("spacing", say("spacing", "Spacing")), has("layout") && menuButton("layout", "Layout"), has("position") && menuButton("position", "Position"), has("move") && menuButton("move", "Move"),
      plain() && h("button", { type: "button", class: "dz-menu-button", text: "Delete", title: "Remove this from the page (the Delete key). Kept like any other change.", onclick: removeSelected })), lookRow());
    if (!menuOpen && !tool) {
      dock.append(h("p", { class: "dz-hint", text: plain() ? "Choose what to change." : "Press Enter, or choose a tool." }), tools());
      return;
    }
    dock.append(tools());
    if (tool === "fill") dock.append(fillPanel());
    else if (tool === "border") dock.append(borderPanel());
    else if (tool === "shadow") dock.append(shadowPanel());
    else if (tool === "text") dock.append(textPanel());
    else if (tool === "font") dock.append(fontPanel());
    else if (tool === "size") dock.append(sizePanel());
    else if (tool === "spacing") dock.append(spacingPanel());
    else if (tool === "radius") dock.append(radiusPanel());
    else if (tool === "layout") dock.append(layoutPanel());
    else if (tool === "tone") dock.append(tonePanel());
    else if (tool === "move") dock.append(movePanel());
    else if (tool === "position") dock.append(positionPanel());
    else if (tool === "image") dock.append(imagePanel());
    // Edits apply as they are made, so there is nothing to confirm; Done just closes the tool and lets go of the element
    // (Esc does the same in steps). Without it a phone, which has no Esc key, had no visible way out of a tool.
    dock.append(h("div", { class: "dz-done-row" },
      h("span", { class: "dz-hint", text: "Changes apply as you go." }),
      h("button", { type: "button", class: "dz-menu-button dz-active", text: "Done", title: "Close the tool and deselect (Esc)", onclick: done })));
  }
  function done() {
    closeTool();
    menuOpen = false;
    setSelection([]);
    climbed = [];
    renderDock();
    refreshBoxes();
  }
  function menuButton(name, text) {
    const blocked = layer !== "normal" && (name === "text" || name === "move" || name === "image") ? "Text, pictures and moving through the page are the same in every state: switch to normal to use them"
      : name === "text" && selected ? (selection.length > 1 ? "Text edits one element at a time" : textBlocked(selected)) : "";
    return h("button", {
      type: "button", class: "dz-menu-button" + (tool === name ? " dz-active" : ""), text, disabled: !!blocked,
      title: blocked || undefined, "aria-pressed": tool === name ? "true" : "false",
      onclick: () => { menuOpen = true; tool = tool === name ? null : name; renderDock(); refreshBoxes(); },
    });
  }
  function currentFill(element) {
    const parsed = parseHex(colourText(getComputedStyle(element).backgroundColor));
    return parsed ? toHex(...parsed) : "#ffffff";
  }
  function fillPanel() {
    const element = selected;
    const contrast = contrastNode(element);
    return h("div", { class: "dz-panel" }, colourPicker(currentFill(element), (colour) => { applyFill(targets(), colour); contrast.update(); }), contrast.node);
  }
  function borderPanel() {
    const element = selected;
    const cs = getComputedStyle(element);
    let style = NO_BORDER(cs.borderTopStyle, cs.borderTopWidth) ? "none" : cs.borderTopStyle;
    let width = Math.round(parseFloat(cs.borderTopWidth)) || 0;
    const colourParsed = parseHex(colourText(cs.borderTopColor));
    let colour = colourParsed ? toHex(...colourParsed) : "#000000";
    const apply = () => applyBorder(targets(), style, width, colour);

    const styleSelect = h("select", { class: "dz-select", "aria-label": "Border style" },
      ...["none", "solid", "dashed", "dotted", "double"].map((s) => h("option", { value: s, text: s, selected: s === style })));
    const widthInput = h("input", { type: "range", min: "0", max: "20", class: "dz-range", "aria-label": "Border thickness" });
    const widthNumber = h("span", { class: "dz-num" });
    const showWidth = () => { widthInput.value = String(width); widthNumber.textContent = width + "px"; };
    styleSelect.addEventListener("change", () => {
      style = styleSelect.value;
      if (style !== "none" && width === 0) { width = 1; showWidth(); }
      apply();
    });
    widthInput.addEventListener("input", () => {
      width = +widthInput.value;
      if (width > 0 && style === "none") { style = "solid"; styleSelect.value = "solid"; }
      showWidth();
      apply();
    });
    showWidth();
    const holder = h("div", { class: "dz-colour-holder", hidden: true });
    const swatch = h("span", { class: "dz-swatch" });
    swatch.style.backgroundColor = colour;
    const colourButton = h("button", {
      type: "button", class: "dz-menu-button", "aria-expanded": "false",
      onclick: () => {
        holder.hidden = !holder.hidden;
        colourButton.setAttribute("aria-expanded", holder.hidden ? "false" : "true");
        if (!holder.hidden && !holder.firstChild) {
          holder.append(colourPicker(colour, (value) => {
            colour = value; swatch.style.backgroundColor = value;
            if (style === "none") { style = "solid"; styleSelect.value = "solid"; if (width === 0) { width = 1; showWidth(); } }
            apply();
          }));
        }
      },
    }, "Colour ", swatch);
    return h("div", { class: "dz-panel" },
      h("label", { class: "dz-row" }, h("span", { text: "Style" }), styleSelect),
      h("label", { class: "dz-row" }, h("span", { text: "Width" }), widthInput, widthNumber),
      colourButton, holder);
  }
  const SHADOW_PRESETS = [
    ["None", null],
    ["Subtle", { x: 0, y: 1, blur: 3, spread: 0, alpha: 0.15 }],
    ["Soft", { x: 0, y: 4, blur: 12, spread: 0, alpha: 0.15 }],
    ["Medium", { x: 0, y: 8, blur: 24, spread: 0, alpha: 0.2 }],
    ["Strong", { x: 0, y: 16, blur: 40, spread: 0, alpha: 0.3 }],
  ];
  function shadowPanel() {
    const element = selected;
    // Start from the element's own (first) shadow, or from a soft black one that is switched off.
    const first = splitTopLevel(String(getComputedStyle(element).boxShadow)).map(parseShadow).find(Boolean);
    let enabled = !!first;
    const s = first || { x: 0, y: 4, blur: 12, spread: 0, rgb: [0, 0, 0], alpha: 0.15, inset: false };
    const apply = () => applyShadow(targets(), enabled ? s : null);

    const sliders = {};
    const rows = [];
    for (const [key, name, min, max, unit] of [["x", "X", -40, 40, "px"], ["y", "Y", -40, 40, "px"], ["blur", "Blur", 0, 80, "px"],
                                                ["spread", "Spread", -20, 40, "px"], ["alpha", "Opacity", 0, 100, "%"]]) {
      const input = h("input", { type: "range", min: String(min), max: String(max), class: "dz-range", "aria-label": `Shadow ${name}` });
      const number = h("span", { class: "dz-num" });
      sliders[key] = { input, number, unit };
      input.addEventListener("input", () => {
        s[key] = key === "alpha" ? +input.value / 100 : +input.value;
        enabled = true;
        show();
        apply();
      });
      rows.push(h("label", { class: "dz-row" }, h("span", { text: name }), input, number));
    }
    const inset = h("input", { type: "checkbox", "aria-label": "Inner shadow" });
    inset.addEventListener("change", () => { s.inset = inset.checked; enabled = true; show(); apply(); });
    const swatch = h("span", { class: "dz-swatch" });
    const presetButtons = SHADOW_PRESETS.map(([name, preset]) => h("button", {
      type: "button", class: "dz-menu-button", text: name,
      onclick: () => {
        if (preset) { Object.assign(s, preset, { inset: false }); enabled = true; } else enabled = false;
        show();
        apply();
      },
    }));
    function show() {
      for (const [key, { input, number, unit }] of Object.entries(sliders)) {
        const value = key === "alpha" ? Math.round(s.alpha * 100) : s[key];
        input.value = String(value);
        number.textContent = value + unit;
      }
      inset.checked = s.inset;
      swatch.style.backgroundColor = toHex(...s.rgb);
      presetButtons.forEach((button, i) => {
        const preset = SHADOW_PRESETS[i][1];
        const active = preset ? enabled && !s.inset && Object.entries(preset).every(([k, v]) => s[k] === v) : !enabled;
        button.classList.toggle("dz-active", active);
      });
    }
    const holder = h("div", { class: "dz-colour-holder", hidden: true });
    const colourButton = h("button", {
      type: "button", class: "dz-menu-button", "aria-expanded": "false",
      onclick: () => {
        holder.hidden = !holder.hidden;
        colourButton.setAttribute("aria-expanded", holder.hidden ? "false" : "true");
        if (!holder.hidden && !holder.firstChild) {
          holder.append(colourPicker(toHex(...s.rgb), (value) => { s.rgb = parseHex(value); enabled = true; show(); apply(); }));
        }
      },
    }, "Colour ", swatch);
    show();
    return h("div", { class: "dz-panel dz-shadow" },
      h("div", { class: "dz-menu" }, ...presetButtons),
      ...rows,
      h("label", { class: "dz-row" }, inset, h("span", { text: "Inner shadow (inset)", class: "dz-wide" })),
      colourButton, holder);
  }
  function textPanel() {
    const element = selected;
    const input = h("textarea", { class: "dz-text", rows: "3", "aria-label": "Element text" });
    input.value = element.textContent;
    input.addEventListener("input", () => applyText(element, input.value));
    return h("div", { class: "dz-panel" }, input);
  }