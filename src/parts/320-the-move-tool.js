
  // ---------- the Move tool: change where elements sit in the page's structure ----------
  // Adapted from VisBug (Apache-2.0, https://github.com/GoogleChromeLabs/ProjectVisBug), app/features/move.js. With the tool open, the arrow
  // keys move the selected elements: ← → past a sibling, ↑ out of the parent (to just before it), ↓ into the next sibling (or, from the last
  // child, out to just after the parent). Dragging a sibling reorders it among its brothers.
  // Modified: every move is an op (undone, redone, kept across reloads, in the export); a drag is ONE move, made by inserting the dragged
  // element before or after the sibling under the pointer (VisBug swaps the two, which would move other elements too); body and html stay put.
  const insideFlow = (parent) => parent && parent.nodeType === 1 && parent !== document.documentElement;
  /** The op that moves `el` one step in a direction, or null when it cannot go that way. */
  function planMove(el, direction) {
    const parent = el.parentNode;
    if (!parent || el === document.body || el === document.documentElement) return null;
    const grand = parent.parentNode;
    switch (direction) {
      case "left": return el.previousElementSibling ? moveOp(el, parent, el.previousElementSibling) : null;
      case "right": return el.nextElementSibling ? moveOp(el, parent, el.nextElementSibling.nextElementSibling) : null;
      case "up": return insideFlow(grand) && parent !== document.body ? moveOp(el, grand, parent) : null;
      case "down":
        if (!el.nextElementSibling) return insideFlow(grand) && parent !== document.body ? moveOp(el, grand, parent.nextElementSibling) : null;
        return el.nextElementSibling.children.length ? moveOp(el, el.nextElementSibling, el.nextElementSibling.firstElementChild) : null;
      default: return null;
    }
  }
  function moveSelected(direction) {
    const list = [];
    for (const el of structural(selection)) {
      const op = planMove(el, direction);
      if (op) { op.redo(); list.push(op); }   // run at once: the next element is planned on the page this one left
    }
    if (!list.length) { showToast("Nothing to move that way."); return; }
    doOps(list, true);
    renderDock();
  }
  keyHooks.push((event) => {
    if (tool !== "move" || !selection.length || isEditingField(eventTarget(event)) || event.ctrlKey || event.metaKey || event.altKey) return false;
    const direction = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[event.key];
    if (!direction) return false;
    event.preventDefault();
    moveSelected(direction);
    return true;
  });

  // dragging a sibling: the element follows the pointer through its brothers, and letting go records a single move
  let dragging = null;       // {node, parent, origNext, lastEnd}
  let lastDragEnd = -Infinity;   // when a drag last ended (a fresh page has had none)
  const moveBounds = h("div", { class: "dz-box dz-bounds", hidden: true, title: "Drag bounds" });
  root.append(moveBounds);
  refreshHooks.push(() => {
    const parent = on && tool === "move" && selection.length === 1 && selected ? selected.parentElement : null;
    place(moveBounds, parent && insideFlow(parent) ? parent : null);
  });
  const siblingUnder = (x, y, parent, not) => {
    let node = document.elementFromPoint(x, y);
    while (node && node.parentNode !== parent) node = node.parentNode;
    return node && node !== not ? node : null;
  };
  function dragMove(event) {
    if (!dragging) return;
    const { node, parent } = dragging;
    const sibling = siblingUnder(event.clientX, event.clientY, parent, node);
    if (sibling) {
      const a = sibling.getBoundingClientRect(), b = node.getBoundingClientRect();
      const sideBySide = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) / 2;   // the same row: order by x
      const first = sideBySide ? event.clientX < a.left + a.width / 2 : event.clientY < a.top + a.height / 2;
      const before = first ? sibling : sibling.nextElementSibling;
      if (before !== node && node.nextElementSibling !== before) parent.insertBefore(node, before);
    }
    refreshBoxes();
  }
  function dragEnd() {
    window.removeEventListener("pointermove", dragMove, true);
    window.removeEventListener("pointercancel", dragEnd, true);
    if (!dragging) return;
    const { node, parent, origNext } = dragging;
    const finalBefore = node.nextElementSibling;
    parent.insertBefore(node, origNext && origNext.parentNode === parent ? origNext : null);   // back where it was, so the move is recorded from there
    dragging = null;
    lastDragEnd = performance.now();
    if (finalBefore !== node.nextElementSibling) doOps([moveOp(node, parent, finalBefore)]);
    structureDone([node]);
  }
  pageEventHooks.push((event) => {
    if (dragging && event.type === "pointerup") {   // the picker swallows pointerup before any listener added later could see it, so the drag ends here
      event.preventDefault();
      event.stopImmediatePropagation();
      dragEnd();
      return true;
    }
    if (event.type === "click" && performance.now() - lastDragEnd < 400) {   // the click that ends a drag must not change the selection
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
    if (tool !== "move" || event.type !== "pointerdown" || event.button !== 0 || selection.length !== 1 || dragging) return false;
    const parent = selection[0].parentNode;
    if (!insideFlow(parent)) return false;
    let node = eventTarget(event);
    while (node && node.parentNode !== parent) node = node.parentNode;
    if (!node || node === document.body || [...parent.children].filter((el) => !ours(el)).length < 2) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!selection.includes(node)) setSelection([node]);
    dragging = { node, parent, origNext: node.nextSibling };
    window.addEventListener("pointermove", dragMove, true);
    window.addEventListener("pointercancel", dragEnd, true);
    return true;
  });
  offHooks.push(() => { if (dragging) dragEnd(); });

  function movePanel() {
    const primary = selected;
    const can = (direction) => !!primary && !!planMoveCheck(primary, direction);
    const button = (symbol, text, direction) => h("button", { type: "button", class: "dz-menu-button", text: `${symbol} ${text}`, disabled: !can(direction),
      title: { left: "Move past the previous sibling (←)", right: "Move past the next sibling (→)", up: "Move out of its parent, to just before it (↑)", down: "Move into the next sibling, or out to just after the parent (↓)" }[direction],
      onclick: () => moveSelected(direction) });
    return h("div", { class: "dz-panel" },
      h("p", { class: "dz-hint dz-note", text: "Move the selected elements through the page's structure with the arrow keys or these buttons. Or drag a sibling inside the purple bounds to reorder it." }),
      h("div", { class: "dz-menu" }, button("◀", "Earlier", "left"), button("▶", "Later", "right"), button("▲", "Out", "up"), button("▼", "In", "down")));
  }
  /** Whether a move is possible, without doing it. */
  function planMoveCheck(el, direction) {
    const parent = el.parentNode;
    if (!parent || el === document.body || el === document.documentElement) return false;
    const grand = parent.parentNode;
    switch (direction) {
      case "left": return !!el.previousElementSibling;
      case "right": return !!el.nextElementSibling;
      case "up": return insideFlow(grand) && parent !== document.body;
      case "down": return el.nextElementSibling ? el.nextElementSibling.children.length > 0 : insideFlow(grand) && parent !== document.body;
      default: return false;
    }
  }
