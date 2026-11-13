  // ---------- copy and paste a look ----------
  let copiedLook = null;
  function lookOf(element) {
    const cs = getComputedStyle(element);
    const border = toRgba(cs.borderTopColor) || [0, 0, 0, 1];
    return {
      from: label(element),
      fill: colourText(cs.backgroundColor), color: colourText(cs.color),
      "font-size": cs.fontSize, "font-weight": cs.fontWeight, lineHeight: lineHeightOf(cs),
      letterSpacing: cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing, "text-align": alignOf(cs),
      border: { style: NO_BORDER(cs.borderTopStyle, cs.borderTopWidth) ? "none" : cs.borderTopStyle, width: Math.round(parseFloat(cs.borderTopWidth)) || 0, colour: toHex(border[0], border[1], border[2]) },
      radius: radiusOf(cs), shadow: shadowText(cs.boxShadow), padding: sideNumbers(cs, "padding"),
    };
  }
  function copyLook(element) {
    copiedLook = lookOf(element);
    showToast(`Copied the look of ${copiedLook.from}. Select another element and paste it (Alt+Shift+V).`);
    renderDock();
  }
  /** Fill, text colour and type, border, corners, shadow and padding: not size, margin or layout, which belong to where it sits. */
  function pasteLook(target) {
    const elements = Array.isArray(target) ? target : [target];
    if (!copiedLook) { showToast("Copy an element's look first (Alt+Shift+C)."); return; }
    if (!elements.length) return;
    const look = copiedLook;
    checkpoint("paste:" + Date.now(), elements);   // the whole paste is one step to undo
    bulk++;
    try {
      applyFill(elements, look.fill);
      const type = { color: look.color, "font-size": look["font-size"], "font-weight": look["font-weight"], "letter-spacing": look.letterSpacing, "text-align": look["text-align"] };
      if (look.lineHeight !== "normal") type["line-height"] = look.lineHeight;
      applyType(elements, type);
      applyBorder(elements, look.border.style, look.border.width, look.border.colour);
      applyRadius(elements, look.radius);
      applyShadowValue(elements, look.shadow);
      applySpacing(elements, "padding", look.padding);
    } finally { bulk--; }
    showToast(`Pasted the look of ${look.from} onto ${elements.length > 1 ? elements.length + " elements" : label(elements[0])}.`);
    renderDock();
  }
