  // ---------- design patches ----------
  const PATCH_STATES = [["off", "Off"], ["preview", "Preview"], ["on", "On"]];
  function patchesPanel() {
    const panel = h("div", { class: "dz-panel" }, h("p", { class: "dz-hint", text: "Loading patches…" }));
    host.patches.list().then((patches) => fillPatches(panel, patches))
      .catch((err) => panel.replaceChildren(h("p", { class: "dz-hint", text: err.message })));
    return panel;
  }
  function fillPatches(panel, patches) {
    panel.replaceChildren(h("p", { class: "dz-hint", text: "Preview: only admins and designers see it. On: everyone." }));
    if (!patches.length) panel.append(h("p", { class: "dz-hint", text: "No patches yet." }));
    for (const patch of patches) {
      const buttons = PATCH_STATES.map(([state, label]) => h("button", {
        type: "button", class: "dz-menu-button" + (patch.state === state ? " dz-active" : ""), text: label,
        "aria-pressed": patch.state === state ? "true" : "false",
        onclick: async () => {
          if (patch.state === state) return;
          try {
            fillPatches(panel, await host.patches.set(patch.name, state));
            host.patches.reload();
            showToast(patch.text_changes ? `${patch.name}: ${label}. Reload the page for its text changes (your edits are kept).` : `${patch.name}: ${label}`);
          } catch (err) { showToast(err.message); }
        },
      }));
      panel.append(h("div", { class: "dz-patch" },
        h("strong", { text: patch.name }), h("span", { class: "dz-hint", text: patch.title + (patch.problem ? ` (${patch.problem})` : "") }),
        h("div", { class: "dz-menu" }, ...buttons)));
    }
  }

  function changesPanel() {
    const panel = h("div", { class: "dz-panel" });
    if (!changeCount()) { panel.append(h("p", { class: "dz-hint", text: "No changes yet." })); return panel; }
    for (const [element, rec] of changes) {
      if (!hasChange(rec)) continue;
      panel.append(h("div", { class: "dz-change" },
        h("code", { text: rec.selector }),
        h("button", { type: "button", class: "dz-link", text: "Reset", onclick: () => resetElement(element) })));
    }
    for (const item of pending) {   // saved, but the element is not on the page right now
      panel.append(h("div", { class: "dz-change", title: "Kept and exported, but this element is not on the page right now" },
        h("code", { text: item.selector + " (not on the page)" }),
        h("button", { type: "button", class: "dz-link", text: "Forget", onclick: () => forgetPending(item) })));
    }
    const copy = h("button", { type: "button", class: "dz-menu-button", text: "Copy", title: "Alt+Shift+E", onclick: copyChanges });
    panel.append(h("pre", { class: "dz-preview", text: exportMarkdown() || "(nothing differs from the original)" }),
      h("div", { class: "dz-menu" }, copy,
        h("button", { type: "button", class: "dz-menu-button", text: "Download", onclick: () => showToast(`Downloaded ${downloadExport()}.`) }),
        h("button", { type: "button", class: "dz-menu-button", text: "Reset all", onclick: resetAll })));
    return panel;
  }
