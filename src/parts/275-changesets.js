  // ---------- changesets ----------
  // A changeset is the page's edits as they are right now, saved under a name. Load any of them to see that look on the page; pick two (A and B) and
  // flip between them, to see which one you prefer. They are kept per page, in the same form the edits are kept across reloads (see save() and restore()),
  // so a changeset is replayed exactly as a reload would replay it.
  const SETS_KEY = "changesets:" + STORE_KEY;
  const readSets = () => {
    try { const raw = JSON.parse(host.getPref(SETS_KEY) || "null"); if (raw && Array.isArray(raw.sets)) return raw; } catch (_) { /* nothing saved, or not readable */ }
    return { sets: [], active: null, a: null, b: null, spare: null };
  };
  const writeSets = (data) => host.setPref(SETS_KEY, JSON.stringify(data));
  const setLabel = () => "Versions";   // the word on the button; a version is a saved changeset
  /** What the page looks like now, in the saved form (null: nothing differs from the original). */
  function currentPayload() { save(); return host.readEdits(STORE_KEY) || null; }
  function payloadSize(payload) {
    try {
      const raw = JSON.parse(payload || "null");
      if (!raw) return 0;
      const list = Array.isArray(raw) ? raw : raw.edits || [];
      return list.length + (raw.ops || []).length + STATES.reduce((sum, state) => sum + (((raw.states || {})[state] || []).length), 0);
    } catch (_) { return 0; }
  }
  function saveSet(name) {
    const data = readSets();
    const entry = { name, at: Date.now(), payload: currentPayload() };
    const at = data.sets.findIndex((set) => set.name === name);
    if (at >= 0) data.sets[at] = entry; else data.sets.push(entry);
    data.active = name;
    if (!data.a || !data.sets.some((set) => set.name === data.a)) data.a = name;
    else if (!data.b && data.a !== name) data.b = name;
    writeSets(data);
    return data;
  }
  function loadSet(name) {
    const data = readSets();
    const target = data.sets.find((set) => set.name === name);
    if (!target) return false;
    const now = currentPayload();
    const current = data.sets.find((set) => set.name === data.active);
    if (now && now !== target.payload && (!current || current.payload !== now)) data.spare = { at: Date.now(), payload: now };   // work that was in no changeset is not lost: it waits in "Before the last switch"
    if (comparing) setCompare(false);
    resetAll();
    undoStack.length = 0; redoStack.length = 0;   // the steps belonged to the look that has just been put away
    host.writeEdits(STORE_KEY, target.payload);
    restore();
    data.active = name;
    writeSets(data);
    exported = true;
    showCount(); showHistory(); renderDock(); refreshBoxes();
    return true;
  }
  function loadSpare() {
    const data = readSets();
    if (!data.spare) return;
    const now = currentPayload();
    const spare = data.spare;
    data.spare = now ? { at: Date.now(), payload: now } : null;
    data.active = null;
    writeSets(data);
    if (comparing) setCompare(false);
    resetAll();
    undoStack.length = 0; redoStack.length = 0;
    host.writeEdits(STORE_KEY, spare.payload);
    restore();
    showCount(); showHistory(); renderDock(); refreshBoxes();
  }
  function flipSets() {
    const data = readSets();
    if (!data.a || !data.b) { showToast("Pick two versions to flip between."); return; }
    loadSet(data.active === data.a ? data.b : data.a);
    const now = readSets();
    showToast(`Showing ${now.active} (${now.active === now.a ? "A" : "B"}).`);
  }
  let setDeleting = null;   // the name asked to be deleted: the button asks once more
  function setsPanel() {
    const data = readSets();
    const now = currentPayload();
    const active = data.sets.find((set) => set.name === data.active);
    const changed = !!active && active.payload !== now;
    const name = h("input", { type: "text", class: "dz-text", placeholder: "Name this version", "aria-label": "Name", maxlength: "40",
      value: `Version ${data.sets.length + 1}` });
    const commit = () => { const text = name.value.trim(); if (!text) { name.focus(); return; } saveSet(text); renderDock(); };
    name.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } event.stopPropagation(); });
    const panel = h("div", { class: "dz-panel dz-changes" },
      h("p", { class: "dz-hint", text: "Save how the page looks as a version (a changeset). Open any version later, or flip between two to see which you prefer." }),
      h("div", { class: "dz-menu" }, name, h("button", { type: "button", class: "dz-menu-button dz-active", text: "Save", title: "Save the page as it looks now", onclick: commit })));
    if (!data.sets.length) panel.append(h("p", { class: "dz-hint", text: "Nothing saved for this page yet." }));
    for (const set of data.sets) {
      const isActive = set.name === data.active;
      const n = payloadSize(set.payload);
      panel.append(h("div", { class: "dz-change" + (isActive ? " dz-active" : ""), title: new Date(set.at).toLocaleString() },
        h("code", { text: `${isActive ? "● " : ""}${set.name} · ${n} change${n === 1 ? "" : "s"}${isActive && changed ? " · edited since" : ""}` }),
        h("button", { type: "button", class: "dz-link", text: "Show", disabled: isActive && !changed, title: "Put the page in this version", onclick: () => loadSet(set.name) }),
        isActive && changed && h("button", { type: "button", class: "dz-link", text: "Update", title: "Save what the page looks like now over this one", onclick: () => { saveSet(set.name); renderDock(); } }),
        h("button", { type: "button", class: "dz-link", text: setDeleting === set.name ? "Sure?" : "Delete",
          onclick: () => {
            if (setDeleting !== set.name) { setDeleting = set.name; renderDock(); return; }
            setDeleting = null;
            const d = readSets();
            d.sets = d.sets.filter((other) => other.name !== set.name);
            for (const k of ["active", "a", "b"]) if (d[k] === set.name) d[k] = null;
            writeSets(d); renderDock();
          } })));
    }
    if (data.sets.length >= 2) {
      const pick = (which) => {
        const select = h("select", { class: "dz-select", "aria-label": which.toUpperCase() },
          ...data.sets.map((set) => h("option", { value: set.name, text: set.name, selected: data[which] === set.name })));
        select.addEventListener("change", () => { const d = readSets(); d[which] = select.value; writeSets(d); });
        return select;
      };
      panel.append(h("div", { class: "dz-menu" }, h("span", { class: "dz-hint", text: "A" }), pick("a"), h("span", { class: "dz-hint", text: "B" }), pick("b"),
        h("button", { type: "button", class: "dz-menu-button dz-active", text: "Flip A ↔ B", title: "Alt+Shift+B", onclick: flipSets })));
      panel.append(h("p", { class: "dz-hint", text: "Alt+Shift+B flips between A and B on the page itself." }));
    }
    if (data.spare) panel.append(h("div", { class: "dz-change" }, h("code", { text: `Before the last switch · ${payloadSize(data.spare.payload)} changes` }),
      h("button", { type: "button", class: "dz-link", text: "Show", title: "Work that was in no saved version when you switched", onclick: loadSpare })));
    return panel;
  }
  keyHooks.push((event) => {
    if (!has("versions") || event.code !== "KeyB" || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return false;
    event.preventDefault();
    flipSets();
    return true;
  });
