  // ---------- the Layout tool ----------
  const LAYOUT_OPTIONS = {
    display: ["block", "flex", "grid", "inline-block", "inline-flex"],
    "flex-direction": ["row", "row-reverse", "column", "column-reverse"],
    "flex-wrap": ["nowrap", "wrap", "wrap-reverse"],
    "justify-content": ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
    "align-items": ["stretch", "flex-start", "center", "flex-end", "baseline"],
    "justify-items": ["stretch", "start", "center", "end"],
  };
  const LAYOUT_LABELS = {
    display: "Display", "flex-direction": "Direction", "flex-wrap": "Wrap", "justify-content": "Justify", "align-items": "Align", "justify-items": "Items",
  };
  const isFlex = (display) => display === "flex" || display === "inline-flex";
  const isGrid = (display) => display === "grid" || display === "inline-grid";
  /** values: CSS property -> value (display, flex-direction, flex-wrap, justify-content, align-items, justify-items, gap "12px", opacity "0.8"). */
  function applyLayoutOne(element, values) {
    checkpoint("layout:" + Object.keys(values).join(), element);
    const rec = record(element);
    for (const [prop, value] of Object.entries(values)) {
      rememberOriginal(rec, element, prop);
      setStyle(element, prop, value);
      rec.after = Object.assign(rec.after || {}, { [prop]: value });
    }
    edited();
  }
  // Scrolling: a box that scrolls (overflow auto or scroll) can be opened out to show everything it holds, and put back. Turning it off sets
  // overflow visible, no maximum height and an automatic height; turning it on again puts back what the box had before its first edit.
  const SCROLLS = /\b(auto|scroll)\b/;
  const scrollsNow = (el) => { const cs = getComputedStyle(el); return SCROLLS.test(cs.overflowX) || SCROLLS.test(cs.overflowY); };
  const wasScrolling = (el) => { const rec = changes.get(el); return !!rec && SCROLLS.test(rec.before.overflow || "") && !scrollsNow(el); };
  function applyScrollingOne(element, on) {
    if (!on) { if (scrollsNow(element)) applyLayoutOne(element, { overflow: "visible", "max-height": "none", height: "auto" }); return; }
    if (!wasScrolling(element)) return;
    // back to what the page gave it: the inline values from before the first edit (a measured height would add the padding twice)
    const rec = changes.get(element), style = styleOf(element);
    checkpoint("layout:scrolling", element);
    for (const prop of ["overflow", "max-height", "height"]) {
      const original = rec.props.get(prop);
      if (!original) continue;
      if (original.value) style.setProperty(prop, original.value, original.priority); else style.removeProperty(prop);
      rec.props.delete(prop);
      if (rec.after) delete rec.after[prop];
    }
    if (!rec.props.size && !rec.text) changes.delete(element);
    edited();
  }
  function scrollingRow() {
    const list = targets();
    const turnOff = list.some(scrollsNow);
    if (!turnOff && !list.some(wasScrolling)) return null;   // nothing here scrolls, and nothing was opened out
    const button = h("button", { type: "button", class: "dz-menu-button" + (turnOff ? " dz-active" : ""), "aria-pressed": String(turnOff), text: turnOff ? "On" : "Off",
      title: turnOff ? "This box scrolls. Click to open it out so everything in it shows." : "This box was opened out. Click to make it scroll again.",
      onclick: () => { applyScrolling(list, !turnOff); renderDock(); } });
    return h("div", { class: "dz-row" }, h("span", { text: "Scrolling" }), button);
  }
  function layoutPanel() {
    const element = selected;
    const cs = getComputedStyle(element);
    const display = cs.display;
    const set = (values, rebuild) => { applyLayout(targets(), values); if (rebuild) renderDock(); };

    const choice = (prop, rebuild) => {
      const current = cs.getPropertyValue(prop);
      const options = LAYOUT_OPTIONS[prop].includes(current) ? LAYOUT_OPTIONS[prop] : [current, ...LAYOUT_OPTIONS[prop]];
      const select = h("select", { class: "dz-select", "aria-label": LAYOUT_LABELS[prop] },
        ...options.map((value) => h("option", { value, text: value, selected: value === current })));
      select.addEventListener("change", () => set({ [prop]: select.value }, rebuild));
      return h("label", { class: "dz-row" }, h("span", { text: LAYOUT_LABELS[prop] }), select);
    };
    const rows = [choice("display", true)];
    const flex = isFlex(display), grid = isGrid(display);
    if (flex) rows.push(choice("flex-direction"), choice("flex-wrap"), choice("justify-content"), choice("align-items"));
    if (grid) rows.push(choice("justify-items"), choice("align-items"));
    if (flex || grid) {
      let gap = Math.round(parseFloat(cs.rowGap) || 0);
      const range = h("input", { type: "range", min: "0", max: "64", class: "dz-range", "aria-label": "Gap between children" });
      const number = h("span", { class: "dz-num" });
      const show = () => { range.value = String(gap); number.textContent = gap + "px"; };
      range.addEventListener("input", () => { gap = +range.value; show(); set({ gap: gap + "px" }); });
      show();
      rows.push(h("label", { class: "dz-row" }, h("span", { text: "Gap" }), range, number));
    }
    let opacity = Math.round((parseFloat(cs.opacity) || 0) * 100);
    const opacityRange = h("input", { type: "range", min: "0", max: "100", class: "dz-range", "aria-label": "Opacity" });
    const opacityNumber = h("span", { class: "dz-num" });
    const showOpacity = () => { opacityRange.value = String(opacity); opacityNumber.textContent = opacity + "%"; };
    opacityRange.addEventListener("input", () => { opacity = +opacityRange.value; showOpacity(); set({ opacity: String(opacity / 100) }); });
    showOpacity();
    rows.push(h("label", { class: "dz-row" }, h("span", { text: "Opacity" }), opacityRange, opacityNumber));
    rows.push(scrollingRow());
    const hint = flex || grid ? null
      : h("p", { class: "dz-hint dz-note", text: "This is not a flex or grid container. Set Display to flex or grid to line up and space its children." });
    return h("div", { class: "dz-panel dz-layout" }, ...rows, hint);
  }
