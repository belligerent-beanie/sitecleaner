  // ---------- keeping edits across reloads ----------
  // Every edit is saved in this browser (localStorage, one list per page) and put back when the page loads again, so a
  // reload, or a new version of the site never costs a designer their work. An edit whose element
  // is not on the page (yet: the game board draws itself later; or any more: the page changed) is kept as it is, listed
  // under Changes and still exported, until it is reset.
  const STORE_KEY = host.storageKey();
  let pending = [];   // saved edits whose element is not on the page: {selector, snippet, before, after, text}
  // Saved as {v: 2, edits: [...], ops: [...]} (a bare list of edits, as the first version wrote it, is still read).
  const saved = (rec) => ({ selector: rec.selector, snippet: rec.snippet, before: rec.before, after: rec.after || {}, text: rec.text || null });
  /** An entry that changes nothing (everything put back as it was) is not worth keeping, counting or exporting. */
  function save() {
    if (PREVIEW) return;
    try {
      const live = [...changes.entries()].filter(([element]) => element.isConnected);   // what was removed from the page cannot come back
      for (const [element, rec] of live) rec.selector = selectorFor(element);            // named by the page as it is now, structure changes included
      const edits = [...live.map(([, rec]) => saved(rec)), ...pending].filter(hasChange);
      const structure = [...ops.map((op) => op.desc), ...pendingOps];
      host.writeEdits(STORE_KEY, edits.length || structure.length ? JSON.stringify({ v: 2, edits, ops: structure }) : null);
    } catch (_) { /* the edits still work in this tab */ }
  }
  function restore() {
    let raw = null;
    try { raw = JSON.parse(host.readEdits(STORE_KEY) || "null"); } catch (_) { raw = null; }
    const edits = Array.isArray(raw) ? raw : raw && Array.isArray(raw.edits) ? raw.edits : [];
    pending = edits.filter((item) => item && typeof item.selector === "string" && item.before && hasChange(item));
    pendingOps = raw && Array.isArray(raw.ops) ? raw.ops.filter((d) => d && typeof d.type === "string") : [];
    if (!pending.length && !pendingOps.length) return;
    putBack();
    let tries = 0;   // the page may build the element later: look again every second for half a minute
    const timer = setInterval(() => { if ((!pending.length && !pendingOps.length) || ++tries > 30) clearInterval(timer); else putBack(); }, 1000);
  }
  function putBack() {
    restoring = true;
    try { putBackEdits(); } finally { restoring = false; }
  }
  function putBackEdits() {
    const leftOps = [];   // structure first, in the order it was done: the style edits are named by the page as it ended up
    for (const d of pendingOps) { try { if (!replayOp(d)) leftOps.push(d); } catch (_) { leftOps.push(d); } }
    pendingOps = leftOps;
    const left = [];
    for (const item of pending) {
      let element = null;
      try { element = document.querySelector(item.selector); } catch (_) { /* a selector the browser rejects */ }
      if (!element || ours(element) || changes.has(element)) { left.push(item); continue; }
      const after = item.after || {};
      if (after["background-color"]) applyFill(element, after["background-color"]);
      if (after.border) {
        const m = /^(\d+)px (\w+) (.+)$/.exec(after.border);
        if (after.border === "none") applyBorder(element, "none", 0, "#000000");
        else if (m) applyBorder(element, m[2], +m[1], m[3]);
      }
      if (after["box-shadow"]) applyShadowValue(element, after["box-shadow"]);
      if (/^(\d+(\.\d+)?(px|%)( |$)){1,4}$/.test(after["border-radius"] || "")) applyRadius(element, after["border-radius"]);
      for (const kind of ["padding", "margin"]) {
        const sides = after[kind] ? parseSides(after[kind]) : null;
        if (sides) applySpacing(element, kind, sides);
      }
      const sizes = {};
      for (const axis of ["width", "height"]) {
        const m = /^(\d+(?:\.\d+)?)px$/.exec(after[axis] || "");
        if (m) sizes[axis] = +m[1];
      }
      if (Object.keys(sizes).length) applySize(element, sizes);
      const type = {};
      if (/^#[0-9a-f]{6}$/i.test(after.color || "")) type.color = after.color;
      if (/^\d+(\.\d+)?px$/.test(after["font-size"] || "")) type["font-size"] = after["font-size"];
      if (/^[1-9]00$/.test(after["font-weight"] || "")) type["font-weight"] = after["font-weight"];
      if (/^\d+(\.\d+)?$/.test(after["line-height"] || "")) type["line-height"] = after["line-height"];
      if (/^-?\d+(\.\d+)?px$/.test(after["letter-spacing"] || "")) type["letter-spacing"] = after["letter-spacing"];
      if (TEXT_ALIGNS.includes(after["text-align"])) type["text-align"] = after["text-align"];
      if (Object.keys(type).length) applyType(element, type);
      const layout = {};
      for (const prop of Object.keys(LAYOUT_OPTIONS)) if (/^[a-z]+(-[a-z]+)*$/.test(after[prop] || "")) layout[prop] = after[prop];
      if (/^\d+(\.\d+)?px$/.test(after.gap || "")) layout.gap = after.gap;
      if (/^(0|1|0?\.\d+)$/.test(after.opacity || "")) layout.opacity = after.opacity;
      if (Object.keys(layout).length) applyLayout(element, layout);
      if (item.text && typeof item.text.after === "string" && !element.children.length) applyText(element, item.text.after);
      const rec = changes.get(element);
      if (rec) {   // "before" is how it was when the designer first changed it, not how it looks after a reload
        rec.before = item.before;
        if (rec.text && item.text) rec.text.before = item.text.before;
      }
    }
    pending = left;
    showCount();
    save();
  }

  function applyFillOne(element, colour) {
    checkpoint("fill", element);
    const rec = record(element);
    rememberOriginal(rec, element, "background-color");
    setStyle(element, "background-color", colour);
    rec.after = Object.assign(rec.after || {}, { "background-color": colour });
    edited();
  }
  function applyBorderOne(element, style, widthPx, colour) {
    checkpoint("border", element);
    const rec = record(element);
    for (const prop of ["border-style", "border-width", "border-color"]) rememberOriginal(rec, element, prop);
    setStyle(element, "border-style", style);
    setStyle(element, "border-width", widthPx + "px");
    setStyle(element, "border-color", colour);
    rec.after = Object.assign(rec.after || {}, { border: style === "none" ? "none" : `${widthPx}px ${style} ${colour}` });
    edited();
  }
  /** shadow is {x, y, blur, spread, rgb, alpha, inset}, or null for no shadow. */
  function applyShadow(element, shadow) {
    applyShadowValue(element, shadow ? shadowCss(shadow) : "none");
  }
  function applyShadowValueOne(element, value) {
    checkpoint("shadow", element);
    const rec = record(element);
    rememberOriginal(rec, element, "box-shadow");
    setStyle(element, "box-shadow", value);
    rec.after = Object.assign(rec.after || {}, { "box-shadow": value });
    edited();
  }
  /** padding or margin: four sides in pixels (top, right, bottom, left). */
  function applySpacingOne(element, kind, sides) {
    checkpoint("spacing:" + kind, element);
    const rec = record(element);
    SIDES.forEach((side, i) => {
      rememberOriginal(rec, element, `${kind}-${side}`);
      setStyle(element, `${kind}-${side}`, sides[i] + "px");
    });
    rec.after = Object.assign(rec.after || {}, { [kind]: sidesText(sides.map((n) => n + "px")) });
    edited();
  }
  /** Every corner the same: "12px", or "9999px" for a pill. */
  function applyRadiusOne(element, value) {
    checkpoint("radius", element);
    const rec = record(element);
    rememberOriginal(rec, element, "border-radius");
    setStyle(element, "border-radius", value);
    rec.after = Object.assign(rec.after || {}, { "border-radius": value });
    edited();
  }
  /** sizes is {width?, height?} in pixels (the border box). */
  function applySizeOne(element, sizes) {
    checkpoint("size", element);
    const rec = record(element);
    for (const axis of ["width", "height"]) {
      if (sizes[axis] === undefined) continue;
      rememberOriginal(rec, element, axis);
      setStyle(element, axis, cssSize(element, axis, sizes[axis]) + "px");
      rec.after = Object.assign(rec.after || {}, { [axis]: sizes[axis] + "px" });
    }
    edited();
  }
  /** Back to the size the page gives it: put the original inline width and height back. */
  function clearSizeOne(element) {
    const rec = changes.get(element);
    if (!rec) return;
    checkpoint("size-clear", element);
    for (const axis of ["width", "height"]) {
      const original = rec.props.get(axis);
      if (!original) continue;
      if (original.value) element.style.setProperty(axis, original.value, original.priority); else element.style.removeProperty(axis);
      rec.props.delete(axis);
      if (rec.after) delete rec.after[axis];
    }
    if (!rec.props.size && !rec.text) changes.delete(element);   // nothing left to hand over: no longer a change
    edited();
  }
  function applyText(element, text) {
    checkpoint("text", element);
    const rec = record(element);
    if (!rec.text) rec.text = { before: element.textContent, after: element.textContent };
    element.textContent = text;          // text, never markup
    rec.text.after = text;
    edited();
  }
  function resetElement(element) {
    const rec = changes.get(element);
    if (!rec) return;
    if (!bulk) pushStep([snapshotOf(element)], false);
    for (const [prop, original] of rec.props) {
      if (original.value) element.style.setProperty(prop, original.value, original.priority);
      else element.style.removeProperty(prop);
    }
    if (rec.text) element.textContent = rec.text.before;
    changes.delete(element);
    save();
    renderDock();
    refreshBoxes();
  }
  function forgetPending(item) {
    pushStep([], true);
    pending = pending.filter((other) => other !== item);
    save();
    renderDock();
  }
  function resetAll() {
    if (changes.size || pending.length || ops.length || pendingOps.length) {   // one step puts all of it back
      undoStack.push({ snaps: [...changes.keys()].map(snapshotOf), pending: [...pending], pendingOps: [...pendingOps], ops: [...ops], inverted: true });
      if (undoStack.length > MAX_STEPS) undoStack.shift();
      redoStack.length = 0;
      showHistory();
    }
    for (const op of [...ops].reverse()) op.undo();
    ops.length = 0;
    pendingOps = [];
    bulk++;
    try { for (const element of [...changes.keys()]) resetElement(element); } finally { bulk--; }
    pending = [];
    save();
    exported = true;
    renderDock();
  }
