  // ---------- the changes panel ----------
  /** What is kept for this site (the consumer edition): switch it off, or take single rules away. */
  function keptSection() {
    const kept = host.kept && host.kept.get();
    const section = h("div", { class: "dz-kept" }, h("strong", { class: "dz-keys-title", text: "Kept on this site" }));
    if (keptIntro) section.append(h("p", { class: "dz-hint dz-kept-intro", role: "status", text: "Kept. These changes will be here every time you visit this site. This list is where you switch them off or remove one. To switch a site off without opening this, right-click the toolbar icon." }));
    const preset = kept && kept.presets && kept.presets.access;
    if (!kept || (!kept.rules.length && !preset)) {
      section.append(h("p", { class: "dz-hint", text: "Nothing is kept yet. Press Keep to have your changes here every time you visit." }),
        h("div", { class: "dz-menu" }, h("button", { type: "button", class: "dz-menu-button dz-active", text: "Keep these changes", onclick: keepOnSite })));
      return section;
    }
    const enabled = h("input", { type: "checkbox", "aria-label": "Apply the kept changes on this site" });
    enabled.checked = !!kept.enabled;
    enabled.addEventListener("change", () => { host.kept.setEnabled(enabled.checked); });
    section.append(h("label", { class: "dz-row" }, enabled, h("span", { text: "Apply on this site" })));
    if (preset && readable()) {
      section.append(h("div", { class: "dz-change" }, h("code", { text: "Easier to read: " + readable().describe(preset) }),
        h("button", { type: "button", class: "dz-link", text: "Change", onclick: openAccess }),
        h("button", { type: "button", class: "dz-link", text: "Remove", title: "Stop keeping these settings. The page changes back when you reload.", onclick: () => { host.kept.removePreset(); readable().apply(null); } })));
    }
    for (const rule of kept.rules) {
      const lost = (kept.stale || []).includes(rule.b);
      section.append(h("div", { class: "dz-change" + (lost ? " dz-lost" : ""), title: lost ? `${rule.b}: matches nothing on the last page you visited here` : rule.b },
        h("code", { text: (lost ? "⚠ " : "") + describeKept(rule) }),
        lost && h("button", { type: "button", class: "dz-link", text: "Re-pick", title: "Point this change at another element", onclick: () => startRepick(rule) }),
        h("button", { type: "button", class: "dz-link", text: "Remove", title: "Stop keeping this change. What you changed in this visit stays until you undo it.", onclick: () => { host.kept.remove(rule.s); } })));
    }
    if (kept.stale && kept.stale.length) section.append(h("p", { class: "dz-hint", text: `${kept.stale.length} of these match nothing on the last page you visited here: the site may have changed. Re-pick points one at another element.` }));
    section.append(h("div", { class: "dz-menu" }, h("button", { type: "button", class: "dz-menu-button", text: "Keep these changes", title: "Add what you changed in this visit", onclick: keepOnSite })));
    return section;
  }
  function changesPanel() {
    const panel = h("div", { class: "dz-panel" });
    panel.append(h("div", { class: "dz-menu" }, h("span", { class: "dz-hint", text: "Look of this panel:" }),
      ...THEMES.map((name) => h("button", { type: "button", class: "dz-menu-button" + (theme() === name ? " dz-active" : ""), text: name, "aria-pressed": String(theme() === name),
        title: name === "auto" ? "Follow the browser's light or dark setting" : `Use the ${name} look`, onclick: () => { host.setPref("theme", name); applyTheme(); renderDock(); } }))));
    const keptHere = has("keep") && host.keep ? keptSection() : null;
    if (!changeCount()) { panel.append(h("p", { class: "dz-hint", text: "No changes yet." })); if (keptHere) panel.append(keptHere); return panel; }
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
    if (has("export")) {
      panel.append(h("div", { class: "dz-menu" }, h("span", { class: "dz-hint", text: "Colours in the export:" }),
        ...NOTATIONS.map((name) => h("button", { type: "button", class: "dz-menu-button" + (notation() === name ? " dz-active" : ""), text: name, "aria-pressed": String(notation() === name),
          title: `Write colours as ${name}`, onclick: () => { host.setPref("colours", name); renderDock(); } }))));
      panel.append(h("div", { class: "dz-menu" }, h("span", { class: "dz-hint", text: "Export:" }),
        ...EXPORT_MODES.map((name) => h("button", { type: "button", class: "dz-menu-button" + (exportMode() === name ? " dz-active" : ""), text: name, "aria-pressed": String(exportMode() === name),
          title: name === "compact" ? "Fewest tokens: no before values, elements that share edits or a class are one entry, and where the property is defined now"
            : "Every element on its own, with before and after values and contrast", onclick: () => { host.setPref("export", name); renderDock(); } }))));
    }
    const resetAllButton = h("button", { type: "button", class: "dz-menu-button", text: "Reset all", onclick: resetAll });
    if (has("export")) {
      const copy = h("button", { type: "button", class: "dz-menu-button", text: "Copy", title: "Alt+Shift+E", onclick: copyChanges });
      const exportText = exportMarkdown();
      panel.append(h("pre", { class: "dz-preview", tabindex: "0", role: "region", "aria-label": "The changes as they will be copied", text: exportText || "(nothing differs from the original)" }),
        h("p", { class: "dz-hint dz-tokens", text: `${exportText.length} characters, about ${Math.round(exportText.length / 4)} tokens` }),
        h("div", { class: "dz-menu" }, copy,
          h("button", { type: "button", class: "dz-menu-button", text: "Download", onclick: () => showToast(`Downloaded ${downloadExport()}.`) }), resetAllButton));
    } else panel.append(h("div", { class: "dz-menu" }, resetAllButton));
    if (keptHere) panel.append(keptHere);
    return panel;
  }
