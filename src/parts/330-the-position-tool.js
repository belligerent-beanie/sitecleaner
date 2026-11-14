
  // ---------- the Position tool: place elements anywhere ----------
  // Adapted from VisBug (Apache-2.0, https://github.com/GoogleChromeLabs/ProjectVisBug), app/features/position.js: with the tool open,
  // drag a selected element to place it, or nudge it with the arrow keys (1 px, Shift 10 px); a static element becomes relative first.
  // Modified: every placement is recorded (undone, kept across reloads, in the export as position, top, left), the whole of a drag or a run of
  // nudges is one step, selected elements move together, and a panel gives exact numbers, a z-index and a way back to static.
  const POSITIONS = ["static", "relative", "absolute", "fixed", "sticky"];
  const POSITION_PROPS = ["position", "top", "left", "z-index"];
  /** values: CSS property -> value (position, top, left, z-index). */
  function applyPositionOne(element, values) {
    checkpoint("position", element);
    const rec = record(element);
    for (const [prop, value] of Object.entries(values)) {
      rememberOriginal(rec, element, prop);
      setStyle(element, prop, value);
      rec.after = Object.assign(rec.after || {}, { [prop]: value });
    }
    edited();
  }
  /** Back to how the page placed it: the inline position, top, left and z-index it had before. */
  function clearPositionOne(element) {
    const rec = changes.get(element);
    if (!rec) return;
    checkpoint("position-clear", element);
    const style = styleOf(element);
    for (const prop of POSITION_PROPS) {
      const original = rec.props.get(prop);
      if (!original) continue;
      if (original.value) style.setProperty(prop, original.value, original.priority); else style.removeProperty(prop);
      rec.props.delete(prop);
      if (rec.after) delete rec.after[prop];
    }
    if (!rec.props.size && !rec.text) changes.delete(element);
    edited();
  }
  const applyPosition = forAll((values) => "position:" + Object.keys(values).join(), applyPositionOne);
  const clearPosition = forAll(() => "position-clear", clearPositionOne);
  const placeable = (list) => structural(list).filter((el) => !(el instanceof SVGElement));

  function nudgePosition(direction, amount) {
    const els = placeable(selection);
    if (!els.length) return;
    checkpoint("position-nudge", els);   // a run of key presses is one step
    bulk++;
    try {
      for (const el of els) {
        const cs = getComputedStyle(el);
        const axis = direction === "left" || direction === "right" ? "left" : "top";
        const current = parseFloat(cs[axis]);
        const values = {};
        if (cs.position === "static") values.position = "relative";
        values[axis] = ((Number.isFinite(current) ? current : 0) + (direction === "right" || direction === "down" ? amount : -amount)) + "px";
        applyPositionOne(el, values);
      }
    } finally { bulk--; }
    renderDock();
  }
  keyHooks.push((event) => {
    if (tool !== "position" || !selection.length || isEditingField(eventTarget(event)) || event.ctrlKey || event.metaKey || event.altKey) return false;
    const direction = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[event.key];
    if (!direction) return false;
    event.preventDefault();
    nudgePosition(direction, event.shiftKey ? 10 : 1);
    return true;
  });

  // dragging: the pointer's travel is added to where each selected element started
  let placing = null;   // {x, y, starts: [{el, left, top}]}
  function placingMove(event) {
    if (!placing) return;
    const dx = event.clientX - placing.x, dy = event.clientY - placing.y;
    bulk++;
    try { for (const { el, left, top } of placing.starts) applyPositionOne(el, { left: left + dx + "px", top: top + dy + "px" }); } finally { bulk--; }
  }
  function placingEnd() {
    window.removeEventListener("pointermove", placingMove, true);
    window.removeEventListener("pointercancel", placingEnd, true);
    if (!placing) return;
    placing = null;
    holdStep = false;
    lastDragEnd = performance.now();
    renderDock();
  }
  pageEventHooks.push((event) => {
    if (placing && event.type === "pointerup") {   // swallowed like every pointer-up, so the drag ends here
      event.preventDefault();
      event.stopImmediatePropagation();
      placingEnd();
      return true;
    }
    if (tool !== "position" || event.type !== "pointerdown" || event.button !== 0 || placing || !selection.length) return false;
    const hit = eventTarget(event);
    if (!selection.some((el) => el.contains(hit))) return false;   // press on a selected element to place the selection
    const els = placeable(selection);
    if (!els.length) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    checkpoint("position-drag", els);
    holdStep = true;   // the whole drag is one step
    bulk++;
    try {
      for (const el of els) if (getComputedStyle(el).position === "static") applyPositionOne(el, { position: "relative" });
    } finally { bulk--; }
    placing = { x: event.clientX, y: event.clientY, starts: els.map((el) => { const cs = getComputedStyle(el); return { el, left: parseFloat(cs.left) || 0, top: parseFloat(cs.top) || 0 }; }) };
    window.addEventListener("pointermove", placingMove, true);
    window.addEventListener("pointercancel", placingEnd, true);
    return true;
  });
  offHooks.push(() => { if (placing) placingEnd(); });

  function positionPanel() {
    const element = selected;
    const cs = getComputedStyle(element);
    const select = h("select", { class: "dz-select", "aria-label": "Position" },
      ...POSITIONS.map((value) => h("option", { value, text: value, selected: value === cs.position })));
    select.addEventListener("change", () => { applyPosition(targets(), { position: select.value }); renderDock(); });
    const fields = ["left", "top"].map((axis) => {
      const current = parseFloat(cs[axis]);
      const field = numberField(`${axis === "left" ? "Left" : "Top"} in pixels`, -5000, 5000, (value) => {
        const values = { [axis]: value + "px" };
        if (getComputedStyle(element).position === "static") values.position = "relative";
        applyPosition(targets(), values);
      });
      field.min = "-5000";
      field.value = String(Number.isFinite(current) ? Math.round(current) : 0);
      return h("label", { class: "dz-row" }, h("span", { text: axis === "left" ? "Left" : "Top" }), field, h("span", { class: "dz-unit", text: "px" }));
    });
    const z = numberField("Stacking order (z-index)", -999, 9999, (value) => applyPosition(targets(), { "z-index": String(value) }));
    z.min = "-999";
    z.value = cs.zIndex === "auto" ? "" : cs.zIndex;
    return h("div", { class: "dz-panel" },
      h("label", { class: "dz-row" }, h("span", { text: "Mode" }), select),
      ...fields,
      h("label", { class: "dz-row" }, h("span", { text: "Layer" }), z, h("span", { class: "dz-unit", text: "z" })),
      h("p", { class: "dz-hint dz-note", text: "Drag a selected element to place it, or use the arrow keys (Shift for 10 px). A static element becomes relative first." }),
      h("div", { class: "dz-menu" }, h("button", { type: "button", class: "dz-menu-button", text: "Back to where the page put it", title: "Remove the position, top, left and z-index you set",
        onclick: () => { clearPosition(targets()); renderDock(); } })));
  }
