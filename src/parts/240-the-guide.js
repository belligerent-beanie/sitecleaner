  // ---------- the guide ----------
  const TOUR = [
    { title: "Select an element", lines: [
      "Alt+Shift+P turns the picker on and off.",
      "While it is on, clicking an element selects it; the click does not reach the page, so buttons and links do nothing."] },
    { title: "Move around", lines: [
      "↑ selects the parent of what you have selected. ↓ goes back down the way you came, or to the first child.",
      "Shift-click adds elements to the selection (or takes them out): the tools then change all of them at once. Esc clears the selection."] },
    { title: "Change it", lines: [
      "Enter opens the tools: Fill (colour), Border (style, thickness, colour), Shadow (presets, or offset, blur, spread, opacity, colour), Text (the words), Font (text colour, size, weight, line height, letter spacing, alignment), Size (width and height, or drag the pink handles), Spacing (padding and margin), Radius (rounded corners), Layout (display, flex and grid alignment and gap, opacity) and Tone (shift hue, saturation and brightness together). Alt+Shift+C copies an element's look and Alt+Shift+V pastes it onto another; hold M to measure distances or G to see what lines up with the selected element, press / to select everything that matches a CSS selector or some words, and press I to inspect what is under the pointer (size, type, colours, WCAG and APCA contrast, accessible name). Fill and Font show the contrast against what is behind the text, and every colour picker lists the colours already on the page. Hold Compare (or the \\ key) to see the original, and Preview opens the page at phone, tablet and laptop sizes.",
      "Text works only on elements with nothing inside them. The page changes straight away, in this tab only; Done closes the tool. Ctrl+Z undoes a step and Ctrl+Shift+Z (or Ctrl+Y) redoes it."] },
    { title: "Export your changes", lines: [
      "Alt+Shift+E copies every change as Markdown. Paste it to Claude, who can then make the same changes in the code.",
      "\"Changes\" lists them with Copy, Download and Reset. They are kept in this browser, through reloads, until you reset them."] },
  ];
  function endTour() {
    tourStep = null;
    host.markTourSeen();
    renderDock();
  }
  function tourPanel() {
    const page = TOUR[tourStep];
    const last = tourStep === TOUR.length - 1;
    return h("div", { class: "dz-tour" },
      h("div", { class: "dz-head" },
        h("strong", { text: `Guide ${tourStep + 1} / ${TOUR.length}` }),
        h("button", { type: "button", class: "dz-link", text: "Skip", onclick: endTour })),
      h("p", { class: "dz-tour-title", text: page.title }),
      ...page.lines.map((line) => h("p", { class: "dz-hint", text: line })),
      h("div", { class: "dz-menu" },
        h("button", { type: "button", class: "dz-menu-button", text: "Back", disabled: tourStep === 0, onclick: () => { tourStep -= 1; renderDock(); } }),
        h("button", { type: "button", class: "dz-menu-button dz-active", text: last ? "Done" : "Next",
                      onclick: () => { if (last) endTour(); else { tourStep += 1; renderDock(); } } })));
  }

  function renderDock() {
    dock.replaceChildren();
    sizeSync = null;   // the Size panel, if it is open, sets this again when it is built
    dock.hidden = !on;
    toggle.textContent = on ? "Design: on" : "Design";
    toggle.classList.toggle("dz-on", on);
    if (!on) return;
    updateHandles();
    if (tourStep !== null) { dock.append(tourPanel()); return; }

    changesLink = h("button", { type: "button", class: "dz-link", text: `Changes (${changeCount()})`, onclick: () => { showChanges = !showChanges; showPatches = false; showPreview = false; showFind = false; renderDock(); } });
    undoLink = h("button", { type: "button", class: "dz-link", text: "Undo", title: "Undo (Ctrl+Z)", onclick: undo });
    redoLink = h("button", { type: "button", class: "dz-link", text: "Redo", title: "Redo (Ctrl+Shift+Z or Ctrl+Y)", onclick: redo });
    showHistory();
    inspectLink = h("button", { type: "button", class: "dz-link" + (inspecting ? " dz-on-link" : ""), text: "Inspect", title: "Hover anything to see its size, type, colours, contrast and accessible name (I)", "aria-pressed": String(inspecting),
      onclick: () => { setInspect(!inspecting); inspectLink.setAttribute("aria-pressed", String(inspecting)); } });
    const compareLink = h("button", { type: "button", class: "dz-link", text: "Compare", title: "Hold to see the original page (or hold the \\ key)" });
    compareLink.addEventListener("pointerdown", (event) => { event.preventDefault(); setCompare(true); });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) compareLink.addEventListener(type, () => setCompare(false));
    const findLink = h("button", { type: "button", class: "dz-link", text: "Find", title: "Select everything that matches a CSS selector or some words (/)",
      onclick: () => { showFind = !showFind; showChanges = false; showPatches = false; showPreview = false; renderDock(); } });
    const previewLink = h("button", { type: "button", class: "dz-link", text: "Preview", title: "See this page at phone, tablet and laptop sizes",
      onclick: () => { showPreview = !showPreview; showChanges = false; showPatches = false; showFind = false; renderDock(); } });
    const head = h("div", { class: "dz-head" },
      h("strong", { text: selection.length > 1 ? `${selection.length} elements` : selected ? label(selected) : "UI picker" }),
      undoLink, redoLink, findLink, inspectLink, compareLink, previewLink,
      changesLink,
      host.patches && h("button", { type: "button", class: "dz-link", text: "Patches", title: "Design patches: switch them off, to preview, or on",
                    onclick: () => { showPatches = !showPatches; showChanges = false; showPreview = false; showFind = false; renderDock(); } }),
      h("button", { type: "button", class: "dz-link", text: "Guide", title: "How the picker works", onclick: () => { tourStep = 0; renderDock(); } }),
      h("button", { type: "button", class: "dz-link", text: "Off", title: "Turn picker mode off", onclick: () => setOn(false) }));
    dock.append(head);

    if (showPatches) { dock.append(patchesPanel()); return; }
    if (showPreview) { dock.append(previewPanel()); return; }
    if (showFind) { const panel = findPanel(); dock.append(panel); panel.querySelector(".dz-find").focus(); return; }   // focus at once: keys typed straight after / must land in the field
    if (showChanges) { dock.append(changesPanel()); return; }
    if (!selected) {
      dock.append(h("p", { class: "dz-hint", text: "Click any element to select it; Shift-click adds more. ↑ parent, ↓ child, Enter for the tools, Esc to clear. / to find, hold M to measure or G for alignment guides, I to inspect. Alt+Shift+E copies your changes." }));
      return;
    }
    const lookRow = () => h("div", { class: "dz-menu dz-look" },
      h("button", { type: "button", class: "dz-menu-button", text: "Copy look", title: "Copy this element's fill, type, border, corners, shadow and padding (Alt+Shift+C)", onclick: () => copyLook(selected) }),
      h("button", { type: "button", class: "dz-menu-button", text: "Paste look", disabled: !copiedLook, title: copiedLook ? `Paste the look of ${copiedLook.from} (Alt+Shift+V)` : "Copy an element's look first",
                    onclick: () => pasteLook(targets()) }));
    const tools = () => h("div", { class: "dz-tools" }, h("div", { class: "dz-menu" },
      menuButton("fill", "Fill"), menuButton("border", "Border"), menuButton("shadow", "Shadow"), menuButton("text", "Text"), menuButton("font", "Font"),
      menuButton("size", "Size"), menuButton("spacing", "Spacing"), menuButton("radius", "Radius"), menuButton("layout", "Layout"), menuButton("tone", "Tone")), lookRow());
    if (!menuOpen && !tool) {
      dock.append(h("p", { class: "dz-hint", text: "Press Enter, or choose a tool." }), tools());
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
    const blocked = name === "text" && selected ? (selection.length > 1 ? "Text edits one element at a time" : textBlocked(selected)) : "";
    return h("button", {
      type: "button", class: "dz-menu-button" + (tool === name ? " dz-active" : ""), text, disabled: !!blocked,
      title: blocked || undefined, "aria-pressed": tool === name ? "true" : "false",
      onclick: () => { menuOpen = true; tool = tool === name ? null : name; renderDock(); },
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