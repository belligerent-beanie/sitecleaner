  // ---------- undo and redo ----------
  // A step is a snapshot, taken just before an edit, of the properties the picker manages on the element (never the whole style
  // attribute: the game board moves its tiles with inline styles, and undoing must not touch those), its record, and its text.
  // Edits of one kind to one element close together in time (a slider being dragged, digits being typed) are one step.
  const MANAGED = ["background-color", "color", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align",
    "border-style", "border-width", "border-color", "border-radius", "box-shadow", "width", "height",
    "display", "flex-direction", "flex-wrap", "justify-content", "align-items", "justify-items", "gap", "opacity", "position", "top", "left", "z-index", "background-image",
    ...["padding", "margin"].flatMap((kind) => ["top", "right", "bottom", "left"].map((side) => `${kind}-${side}`))];
  const MERGE_MS = 1200;
  const MAX_STEPS = 100;
  const undoStack = [];
  const redoStack = [];
  let restoring = false;       // edits being put back after a reload are not new history
  let bulk = 0;                // above 0 while one step covers several edits (Reset all, a paste, an edit of several elements)
  let holdStep = false;        // a handle is being dragged: the whole drag is one step
  let lastEdit = { kind: "", elements: [], at: 0 };
  let undoLink = null;
  let redoLink = null;

  function cloneRec(rec) {
    if (!rec) return null;
    return { ...rec, props: new Map([...rec.props].map(([k, v]) => [k, { ...v }])), text: rec.text ? { ...rec.text } : null,
             before: { ...rec.before }, after: rec.after ? { ...rec.after } : undefined };
  }
  function snapshotIn(element, which) {
    const style = {};
    const source = peekStyle(element, which);
    for (const prop of MANAGED) style[prop] = source ? [source.getPropertyValue(prop), source.getPropertyPriority(prop)] : ["", ""];
    return { element, layer: which, style, text: which !== "normal" || element.children.length ? null : element.textContent, rec: cloneRec(layers[which].get(element)) };
  }
  const snapshotOf = (element) => snapshotIn(element, layer);
  function putSnapshotBack(snap) {
    const element = snap.element;
    if (!document.contains(element)) return;
    const which = snap.layer || "normal";
    const style = Object.values(snap.style).some(([value]) => value) ? styleOf(element, which) : peekStyle(element, which);   // no rule to make just to clear it
    if (style) for (const [prop, [value, priority]] of Object.entries(snap.style)) {
      if (value) style.setProperty(prop, value, priority); else style.removeProperty(prop);
    }
    if (snap.text !== null && !element.children.length && element.textContent !== snap.text) element.textContent = snap.text;
    if (snap.rec) layers[which].set(element, snap.rec); else layers[which].delete(element);
  }
  function showHistory() {
    if (undoLink) undoLink.disabled = !undoStack.length;
    if (redoLink) redoLink.disabled = !redoStack.length;
  }
  function pushStep(snaps, keepPending) {
    undoStack.push({ snaps, pending: keepPending ? [...pending] : null, pendingOps: keepPending ? [...pendingOps] : null });
    if (undoStack.length > MAX_STEPS) undoStack.shift();
    redoStack.length = 0;
    showHistory();
  }
  /** Call just before an edit to `element`; `kind` names what is being edited ("fill", "size", …) so unlike edits are separate steps. */
  function checkpoint(kind, target) {
    const elements = Array.isArray(target) ? target : [target];
    if (comparing) setCompare(false);   // an edit while the original is showing: bring the edits back first
    if (restoring || bulk) return;
    const now = Date.now();
    const sameElements = lastEdit.elements.length === elements.length && elements.every((el, i) => el === lastEdit.elements[i]);
    const same = sameElements && lastEdit.kind === kind && (holdStep || now - lastEdit.at < MERGE_MS);
    lastEdit = { kind, elements, at: now };
    if (!same) pushStep(elements.map(snapshotOf), false);
  }
  /** Walk one step back (from = undoStack, to = redoStack) or forward (the other way round). */
  function moveStep(from, to) {
    const entry = from.pop();
    if (!entry) return;
    const next = { ...entry };   // what the step becomes on the other stack: the state as it is now, to come back to
    if (entry.snaps) { next.snaps = entry.snaps.map((snap) => snapshotIn(snap.element, snap.layer || "normal")); entry.snaps.forEach(putSnapshotBack); }
    if (entry.pending) { next.pending = [...pending]; pending = entry.pending; }
    if (entry.pendingOps) { next.pendingOps = [...pendingOps]; pendingOps = entry.pendingOps; }
    if (entry.ops) {   // structural changes: undo them newest first, or do them again oldest first; a Reset all step is the other way round
      const undoing = (from === undoStack) !== !!entry.inverted;
      if (undoing) { for (const op of [...entry.ops].reverse()) { op.undo(); const i = ops.indexOf(op); if (i >= 0) ops.splice(i, 1); } }
      else { for (const op of entry.ops) op.redo(); ops.push(...entry.ops); }
    }
    to.push(next);
    lastEdit = { kind: "", elements: [], at: 0 };
    exported = false;
    showCount();
    save();
    renderDock();
    refreshBoxes();
  }
  function undo() { moveStep(undoStack, redoStack); }
  function redo() { moveStep(redoStack, undoStack); }
