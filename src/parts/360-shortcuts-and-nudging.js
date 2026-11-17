
  // ---------- tool hotkeys, nudging with the arrow keys, and the shortcuts panel ----------
  // The keyboard model is VisBug's (Apache-2.0, https://github.com/GoogleChromeLabs/ProjectVisBug; app/components/vis-bug/model.js and the tool
  // files padding.js, margin.js and font.js): a letter opens a tool, and the arrow keys then nudge what is selected, 1 unit at a time, Shift for
  // ten, Alt for the other way. Modified: the letters name this product's tools, and every nudge is recorded (undone, kept, exported), a run
  // of presses being one step.
  const TOOL_KEYS = { c: "fill", b: "border", d: "shadow", e: "text", f: "font", s: "size", p: "spacing", r: "radius", a: "layout", h: "tone", v: "move", l: "position" };
  keyHooks.push((event) => {
    if (!selection.length || event.ctrlKey || event.metaKey || event.altKey || event.repeat || isEditingField(eventTarget(event))) return false;
    const name = TOOL_KEYS[event.key.toLowerCase()];
    if (!name || !has(name)) return false;   // a tool an edition leaves out is not opened by its letter
    event.preventDefault();
    if (name === "text" && (selection.length > 1 || textBlocked(selected))) { showToast(selection.length > 1 ? "Text edits one element at a time." : textBlocked(selected) + "."); return true; }
    menuOpen = true;
    tool = tool === name ? null : name;
    renderDock();
    refreshBoxes();   // a tool may draw its own overlay
    return true;
  });

  const ARROWS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
  const nudgeKeys = (tools, run) => keyHooks.push((event) => {
    if (!tools.includes(tool) || !selection.length || isEditingField(eventTarget(event)) || !ARROWS[event.key]) return false;
    event.preventDefault();
    run(ARROWS[event.key], event);
    renderDock();
    return true;
  });

  // Spacing: the arrows change the padding or the margin (a choice in the panel): ▲ ▼ ◀ ▶ are the sides; Alt takes away; Shift is ten;
  // Ctrl or Cmd with ▲ ▼ changes all four sides together
  const SIDE_OF = { up: 0, right: 1, down: 2, left: 3 };
  nudgeKeys(["spacing"], (direction, event) => {
    const els = structural(selection);
    const kind = spacingKeys;
    const amount = (event.shiftKey ? 10 : 1) * (event.altKey ? -1 : 1);
    const all = (event.ctrlKey || event.metaKey) && (direction === "up" || direction === "down");
    checkpoint("spacing-nudge:" + kind, els);
    bulk++;
    try {
      for (const el of els) {
        const sides = sideNumbers(getComputedStyle(el), kind);
        const floor = kind === "padding" ? 0 : -1000;
        if (all) { const change = direction === "up" ? Math.abs(amount) : -Math.abs(amount); for (let i = 0; i < 4; i++) sides[i] = Math.max(floor, sides[i] + change); }
        else if (!((event.ctrlKey || event.metaKey))) sides[SIDE_OF[direction]] = Math.max(floor, sides[SIDE_OF[direction]] + amount);
        applySpacingOne(el, kind, sides);
      }
    } finally { bulk--; }
  });
  // Size: ▶ ◀ the width, ▼ ▲ the height
  nudgeKeys(["size"], (direction, event) => {
    const els = placeable(selection);
    const step = event.shiftKey ? 10 : 1;
    checkpoint("size-nudge", els);
    bulk++;
    try {
      for (const el of els) {
        const now = boxSize(el);
        const sizes = direction === "left" ? { width: Math.max(1, now.width - step) } : direction === "right" ? { width: now.width + step }
          : direction === "up" ? { height: Math.max(1, now.height - step) } : { height: now.height + step };
        applySizeOne(el, sizes);
      }
    } finally { bulk--; }
  });
  // Font: ▲ ▼ the size, ◀ ▶ the letter spacing, Alt with ▲ ▼ the line height
  nudgeKeys(["font"], (direction, event) => {
    const els = structural(selection);
    checkpoint("font-nudge", els);
    bulk++;
    try {
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (direction === "left" || direction === "right") {
          const spacing = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0;
          applyTypeOne(el, { "letter-spacing": Math.round((spacing + (direction === "right" ? 1 : -1) * (event.shiftKey ? 2 : 0.5)) * 10) / 10 + "px" });
        } else if (event.altKey) {
          const line = lineHeightOf(cs) === "normal" ? 1.2 : parseFloat(lineHeightOf(cs));
          applyTypeOne(el, { "line-height": String(Math.max(0.5, Math.round((line + (direction === "up" ? 1 : -1) * (event.shiftKey ? 0.5 : 0.05)) * 100) / 100)) });
        } else {
          applyTypeOne(el, { "font-size": Math.max(1, Math.round(parseFloat(cs.fontSize)) + (direction === "up" ? 1 : -1) * (event.shiftKey ? 10 : 1)) + "px" });
        }
      }
    } finally { bulk--; }
  });

  // the shortcuts panel: ? opens it
  const SHORTCUTS = [
    ["Select", [["Click", "select; Shift adds or removes"], ["↑ ↓", "parent, child"], ["← →", "previous, next sibling (same parent)"], ["Ctrl E", "select similar (Shift: all)"], ["Alt Shift B", "flip between the two saved versions, A and B"],
                ["Ctrl Shift Enter", "select the children"], ["/", "find by selector or words"], ["Esc", "clear, close"]]],
    ["Tools (with something selected)", [["C B D E", "fill, border, shadow, text"], ["F S P R", "font, size, spacing, radius"], ["A H", "layout, tone (hue)"], ["V L", "move, position"], ["Enter", "the tool menu"]]],
    ["Nudge, with a tool open", [["Spacing", "arrows change a side; Alt takes away; Shift ten; Ctrl ▲▼ all sides"], ["Font", "Ctrl B, Ctrl I bold, italic; ▲▼ size, ◀▶ letter spacing, Alt ▲▼ line height"], ["Size", "▶◀ width, ▼▲ height"], ["Position / Move", "arrows place or move"]]],
    ["Edit", [["Delete", "remove (Alt: clear its edits)"], ["Ctrl D", "duplicate"], ["Ctrl C X V", "copy, cut, paste elements"], ["Ctrl G", "group (Shift: ungroup)"], ["Double-click", "edit text in place"],
              ["Alt Shift C V", "copy, paste a look"], ["Ctrl Z", "undo (Shift or Y: redo)"]]],
    ["See", [["I", "inspect on hover"], [";", "gridlines through the selection, on or off"], ["hold M", "measure distances"], ["hold G", "alignment guides"], ["hold \\", "the original"], ["Alt Shift S", "screenshot"]]],
    ["Hand off", [["Alt Shift E", "copy the changes as Markdown"], ["Alt Shift P", "picker on and off"], ["?", "this list"]]],
  ];
  const SHORTCUT_FEATURE = { "/": "find", "I": "inspector", ";": "measure", "hold M": "measure", "hold G": "measure", "hold \\": "compare", "Alt Shift E": "export", "Alt Shift B": "versions", "Ctrl D": "structure", "Ctrl C X V": "structure", "Ctrl G": "structure" };   // the shortcuts an edition can switch off
  const PLAIN_TOOL_ROWS = [["C B D E", "background, border, shadow, edit words"], ["F P R H", "text style, spacing, corners, colour mood"], ["Enter", "the tool menu"]];
  /** The rows of one section; the plain interface lists only the tools it has. */
  function shownRows(title, rows) {
    if (!plain()) return rows;
    if (title.startsWith("Tools")) return PLAIN_TOOL_ROWS;
    return rows.filter(([keys]) => !/^(Size|Position \/ Move)$/.test(keys) && !/^(Ctrl D|Ctrl C X V|Ctrl G)$/.test(keys));
  }
  function keysPanel() {
    const panel = h("div", { class: "dz-panel dz-keys" });
    for (const [title, rows] of SHORTCUTS) {
      panel.append(h("strong", { class: "dz-keys-title", text: title }));
      for (const [keys, what] of shownRows(title, rows).filter(([keys]) => has(SHORTCUT_FEATURE[keys] || ""))) panel.append(h("div", { class: "dz-keys-row" }, h("kbd", { text: keys }), h("span", { text: what })));
    }
    return panel;
  }
  keyHooks.push((event) => {   // ; turns the gridlines on or off
    if (event.key !== ";" || !has("measure") || event.ctrlKey || event.metaKey || event.altKey || isEditingField(eventTarget(event))) return false;
    event.preventDefault();
    setGridlines(!gridOn());
    return true;
  });
  keyHooks.push((event) => {   // Ctrl+B and Ctrl+I with the Font tool open (as VisBug has them): bold and italic on or off
    if (tool !== "font" || !selection.length || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || isEditingField(eventTarget(event))) return false;
    const key = event.key.toLowerCase();
    if (key !== "b" && key !== "i") return false;
    event.preventDefault();
    if (key === "b") toggleBold(); else toggleItalic();
    renderDock();
    return true;
  });
  keyHooks.push((event) => {
    if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey || isEditingField(eventTarget(event))) return false;
    event.preventDefault();
    showKeys = !showKeys;
    showChanges = false; showAccess = false; showPreview = false; showFind = false; showClasses = false;
    renderDock();
    return true;
  });
