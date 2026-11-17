  // ---------- applying and recording edits ----------
  function record(element) {
    let rec = changes.get(element);
    if (!rec) {
      const make = () => {
      const cs = getComputedStyle(element);
      return {
        selector: selectorFor(element), tag: element.tagName.toLowerCase(), snippet: snippetOf(element), props: new Map(),
        text: null,
        before: {
          "background-color": colourText(cs.backgroundColor),
          border: borderText(cs.borderTopStyle, cs.borderTopWidth, colourText(cs.borderTopColor)),
          "box-shadow": shadowText(cs.boxShadow),
          "border-radius": radiusOf(cs),
          padding: sidesOf(cs, "padding"),
          margin: sidesOf(cs, "margin"),
          width: boxSize(element).width + "px",
          height: boxSize(element).height + "px",
          color: colourText(cs.color),
          "font-size": cs.fontSize,
          "font-weight": cs.fontWeight,
          "font-style": cs.fontStyle === "oblique" ? "italic" : cs.fontStyle,
          "line-height": lineHeightOf(cs),
          "letter-spacing": cs.letterSpacing === "normal" ? "normal" : cs.letterSpacing,
          "text-align": alignOf(cs),
          contrast: contrastLabel(contrastInfo(element)),
          display: cs.display,
          "flex-direction": cs.flexDirection,
          "flex-wrap": cs.flexWrap,
          "justify-content": cs.justifyContent,
          "align-items": cs.alignItems,
          "justify-items": cs.justifyItems,
          gap: cs.rowGap === cs.columnGap ? cs.rowGap : `${cs.rowGap} ${cs.columnGap}`,
          opacity: cs.opacity,
          position: cs.position,
          top: cs.top,
          left: cs.left,
          "z-index": cs.zIndex,
          "background-image": cs.backgroundImage,
          "background-size": cs.backgroundSize,
          "background-position": cs.backgroundPosition,
          "background-repeat": cs.backgroundRepeat,
          overflow: cs.overflow,
          "max-height": cs.maxHeight,
        },
      };
      };
      rec = layer === "normal" ? make() : forcedRead(element, make);   // a state is read as it looks when forced
      changes.set(element, rec);
    }
    return rec;
  }
  function rememberOriginal(rec, element, prop) {
    if (!rec.props.has(prop)) {
      const style = styleOf(element);
      rec.props.set(prop, { value: style.getPropertyValue(prop), priority: style.getPropertyPriority(prop) });
    }
  }
  /** Set an inline style; if the site's own CSS still wins, set it again with !important. */
  function setStyle(element, prop, value) {
    const hadStyleAttr = element.hasAttribute("style");
    const saved = [element.style.getPropertyValue("transition"), element.style.getPropertyPriority("transition")];
    element.style.setProperty("transition", "none");          // read the final value, not a point in an animation
    const target = styleOf(element);                           // the element itself, or the rule of the state being edited
    target.setProperty(prop, value);
    const computed = getComputedStyle(element);
    const style = computed.borderTopStyle;
    const skip = prop === "border-width" && NO_BORDER(style, "1px");
    const now = computed.getPropertyValue(prop);
    const same = prop.endsWith("color") ? colourText(now) === value.toLowerCase()
      : prop === "box-shadow" ? shadowText(now) === shadowText(value)
      : prop === "line-height" ? Math.abs(parseFloat(now) - parseFloat(value) * parseFloat(computed.fontSize)) < 0.5 : now === value;
    if (!skip && !same) target.setProperty(prop, value, "important");
    if (saved[0]) element.style.setProperty("transition", saved[0], saved[1]); else element.style.removeProperty("transition");
    if (!hadStyleAttr && element.getAttribute("style") === "") element.removeAttribute("style");   // a state edit leaves the element's own attributes alone
  }
  /** An edit was made. The panel is NOT rebuilt (a slider being dragged must stay in the page); only the count and outlines change. */
  function edited() {
    exported = false;
    showCount();
    save();
    refreshBoxes();
  }
  /** Only an end state that differs from the start is a change: set and set back (or switched and switched back) is not. */
  const hasChange = (item) => Object.entries(item.after || {}).some(([prop, value]) => value !== (item.before || {})[prop])
    || !!(item.text && item.text.after !== item.text.before);
  const changeCount = () => Object.values(layers).reduce((sum, map) => sum + [...map.entries()].filter(([el, rec]) => el.isConnected && hasChange(rec)).length, 0)
    + pending.filter(hasChange).length + STATES.reduce((sum, state) => sum + pendingStates[state].filter(hasChange).length, 0) + ops.length + pendingOps.length;
  function showCount() { if (changesLink) changesLink.textContent = `${say("changes", "Changes")} (${changeCount()})`; }
