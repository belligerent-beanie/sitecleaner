  // ---------- the changes panel ----------
  function changesPanel() {
    const panel = h("div", { class: "dz-panel" });
    if (!changeCount()) { panel.append(h("p", { class: "dz-hint", text: "No changes yet." })); return panel; }
    for (const [element, rec] of changes) {
      if (!element.isConnected || !hasChange(rec)) continue;
      panel.append(h("div", { class: "dz-change" },
        h("code", { text: rec.selector }),
        h("button", { type: "button", class: "dz-link", text: "Reset", onclick: () => resetElement(element) })));
    }
    for (const state of STATES) {   // what the states change
      for (const [element, rec] of layers[state]) {
        if (!element.isConnected || !hasChange(rec)) continue;
        panel.append(h("div", { class: "dz-change" },
          h("code", { text: `${rec.selector}:${state}` }),
          h("button", { type: "button", class: "dz-link", text: "Reset", onclick: () => withLayer(state, () => resetElement(element)) })));
      }
      for (const item of pendingStates[state]) {
        panel.append(h("div", { class: "dz-change", title: "Kept and exported, but this element is not on the page right now" },
          h("code", { text: `${item.selector}:${state} (not on the page)` }),
          h("button", { type: "button", class: "dz-link", text: "Forget", onclick: () => { pushStep([], true); pendingStates[state] = pendingStates[state].filter((other) => other !== item); save(); renderDock(); } })));
      }
    }
    for (const item of pending) {   // saved, but the element is not on the page right now
      panel.append(h("div", { class: "dz-change", title: "Kept and exported, but this element is not on the page right now" },
        h("code", { text: item.selector + " (not on the page)" }),
        h("button", { type: "button", class: "dz-link", text: "Forget", onclick: () => forgetPending(item) })));
    }
    for (const op of ops) panel.append(h("div", { class: "dz-change", title: describeOp(op.desc) }, h("code", { text: shorten(describeOp(op.desc), 60) })));
    for (const d of pendingOps) {   // saved, but what it needs is not on the page right now
      panel.append(h("div", { class: "dz-change", title: "Kept and exported, but not on the page right now: " + describeOp(d) },
        h("code", { text: shorten(describeOp(d), 50) + " (not on the page)" }),
        h("button", { type: "button", class: "dz-link", text: "Forget", onclick: () => { pushStep([], true); pendingOps = pendingOps.filter((other) => other !== d); save(); renderDock(); } })));
    }
    panel.append(h("div", { class: "dz-menu" }, h("span", { class: "dz-hint", text: "Colours in the export:" }),
      ...NOTATIONS.map((name) => h("button", { type: "button", class: "dz-menu-button" + (notation() === name ? " dz-active" : ""), text: name, "aria-pressed": String(notation() === name),
        title: `Write colours as ${name}`, onclick: () => { host.setPref("colours", name); renderDock(); } }))));
    const copy = h("button", { type: "button", class: "dz-menu-button", text: "Copy", title: "Alt+Shift+E", onclick: copyChanges });
    panel.append(h("pre", { class: "dz-preview", text: exportMarkdown() || "(nothing differs from the original)" }),
      h("div", { class: "dz-menu" }, copy,
        h("button", { type: "button", class: "dz-menu-button", text: "Download", onclick: () => showToast(`Downloaded ${downloadExport()}.`) }),
        h("button", { type: "button", class: "dz-menu-button", text: "Reset all", onclick: resetAll })));
    return panel;
  }
