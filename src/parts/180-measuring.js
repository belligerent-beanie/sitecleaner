  // ---------- measuring ----------
  // Hold M with an element selected and move over another: the distances between them, and the selected element's size.
  const measureLayer = h("div", { class: "dz-measure" });
  root.append(measureLayer);
  let measuring = false;
  function renderMeasure() {
    measureLayer.replaceChildren();
    if (!measuring || !on || !selected || !document.contains(selected)) return;
    const a = selected.getBoundingClientRect();
    const mark = (x1, y1, x2, y2, text) => {
      const line = h("div", { class: "dz-m-line" });
      line.style.left = Math.min(x1, x2) + "px"; line.style.top = Math.min(y1, y2) + "px";
      line.style.width = Math.max(1, Math.abs(x2 - x1)) + "px"; line.style.height = Math.max(1, Math.abs(y2 - y1)) + "px";
      measureLayer.append(line);
      tag(text, (x1 + x2) / 2, (y1 + y2) / 2);
    };
    const tag = (text, x, y) => {
      const chip = h("div", { class: "dz-m-label", text });
      chip.style.left = x + "px"; chip.style.top = y + "px";
      measureLayer.append(chip);
    };
    tag(`${Math.round(a.width)} × ${Math.round(a.height)}`, a.left + a.width / 2, a.bottom + 14);
    const other = hovered && hovered !== selected && document.contains(hovered) && !ours(hovered) ? hovered : null;
    if (!other) return;
    const b = other.getBoundingClientRect();
    const px = (n) => String(Math.round(n * 10) / 10).replace(/\.0$/, "");
    const inside = (outer, inner) => outer.left <= inner.left && outer.right >= inner.right && outer.top <= inner.top && outer.bottom >= inner.bottom;
    const [outer, inner] = inside(b, a) ? [b, a] : inside(a, b) ? [a, b] : [null, null];
    if (outer) {   // one is inside the other: the distance to each edge
      const mx = (inner.left + inner.right) / 2, my = (inner.top + inner.bottom) / 2;
      if (inner.left - outer.left >= 0.5) mark(outer.left, my, inner.left, my, px(inner.left - outer.left));
      if (outer.right - inner.right >= 0.5) mark(inner.right, my, outer.right, my, px(outer.right - inner.right));
      if (inner.top - outer.top >= 0.5) mark(mx, outer.top, mx, inner.top, px(inner.top - outer.top));
      if (outer.bottom - inner.bottom >= 0.5) mark(mx, inner.bottom, mx, outer.bottom, px(outer.bottom - inner.bottom));
      return;
    }
    const ox = [Math.max(a.left, b.left), Math.min(a.right, b.right)], oy = [Math.max(a.top, b.top), Math.min(a.bottom, b.bottom)];
    const midY = oy[0] < oy[1] ? (oy[0] + oy[1]) / 2 : (a.top + a.bottom) / 2;
    const midX = ox[0] < ox[1] ? (ox[0] + ox[1]) / 2 : (a.left + a.right) / 2;
    if (a.right <= b.left) mark(a.right, midY, b.left, midY, px(b.left - a.right));
    else if (b.right <= a.left) mark(b.right, midY, a.left, midY, px(a.left - b.right));
    if (a.bottom <= b.top) mark(midX, a.bottom, midX, b.top, px(b.top - a.bottom));
    else if (b.bottom <= a.top) mark(midX, b.bottom, midX, a.top, px(a.top - b.bottom));
  }

  /** An edit works on one element or on a list (the selection): the same change to each, one step to undo. */
  function forAll(kindOf, apply) {
    return function (target, ...args) {
      const elements = Array.isArray(target) ? target : [target];
      if (!elements.length) return;
      checkpoint(kindOf(...args), elements);
      bulk++;
      try { for (const element of elements) apply(element, ...args); } finally { bulk--; }
    };
  }
  const applyFill = forAll(() => "fill", applyFillOne);
  const applyBorder = forAll(() => "border", applyBorderOne);
  const applyShadowValue = forAll(() => "shadow", applyShadowValueOne);
  const applySpacing = forAll((kind) => "spacing:" + kind, applySpacingOne);
  const applyRadius = forAll(() => "radius", applyRadiusOne);
  const applySize = forAll(() => "size", applySizeOne);
  const clearSize = forAll(() => "size-clear", clearSizeOne);
  const applyType = forAll((values) => "font:" + Object.keys(values).join(), applyTypeOne);
  const applyLayout = forAll((values) => "layout:" + Object.keys(values).join(), applyLayoutOne);
  const applyScrolling = forAll(() => "layout:scrolling", applyScrollingOne);
