  // ---------- the Font tool ----------
  /** values: CSS property -> value ("color" "#336699", "font-size" "18px", "font-weight" "600", "line-height" "1.5", "letter-spacing" "1px", "text-align" "center"). */
  function applyTypeOne(element, values) {
    checkpoint("font:" + Object.keys(values).join(), element);
    const rec = record(element);
    for (const [prop, value] of Object.entries(values)) {
      rememberOriginal(rec, element, prop);
      setStyle(element, prop, value);
      rec.after = Object.assign(rec.after || {}, { [prop]: value });
    }
    edited();
  }
  function fontPanel() {
    const element = selected;
    const cs = getComputedStyle(element);
    const rgba = toRgba(cs.color) || [0, 0, 0, 1];
    const lineNow = lineHeightOf(cs);
    const state = {
      colour: toHex(rgba[0], rgba[1], rgba[2]),
      size: Math.round(parseFloat(cs.fontSize)) || 16,
      weight: parseInt(cs.fontWeight, 10) || 400,
      line: lineNow === "normal" ? 1.2 : parseFloat(lineNow),
      spacing: cs.letterSpacing === "normal" ? 0 : Math.round(parseFloat(cs.letterSpacing) * 2) / 2,
      align: alignOf(cs),
    };
    const contrast = contrastNode(element);
    const set = (values) => { applyType(targets(), values); contrast.update(); };

    const swatch = h("span", { class: "dz-swatch" });
    swatch.style.backgroundColor = state.colour;
    const holder = h("div", { class: "dz-colour-holder", hidden: true });
    const colourButton = h("button", { type: "button", class: "dz-menu-button", "aria-expanded": "false",
      onclick: () => {
        holder.hidden = !holder.hidden;
        colourButton.setAttribute("aria-expanded", holder.hidden ? "false" : "true");
        if (!holder.hidden && !holder.firstChild) {
          holder.append(colourPicker(state.colour, (value) => { state.colour = value; swatch.style.backgroundColor = value; set({ color: value }); }));
        }
      } }, "Text colour ", swatch);

    const sizeRange = h("input", { type: "range", min: "8", max: "72", class: "dz-range", "aria-label": "Font size slider" });
    const sizeField = numberField("Font size in pixels", 6, 200, (value) => { state.size = value; showSize(); set({ "font-size": value + "px" }); });
    const showSize = () => { sizeRange.value = String(Math.min(72, Math.max(8, state.size))); if (activeEl() !== sizeField) sizeField.value = String(state.size); };
    sizeRange.addEventListener("input", () => { state.size = +sizeRange.value; showSize(); set({ "font-size": state.size + "px" }); });

    const known = WEIGHTS.some(([value]) => value === state.weight);
    const weightSelect = h("select", { class: "dz-select", "aria-label": "Font weight" },
      ...(known ? [] : [h("option", { value: String(state.weight), text: String(state.weight), selected: true })]),
      ...WEIGHTS.map(([value, name]) => h("option", { value: String(value), text: `${value} ${name}`, selected: value === state.weight })));
    weightSelect.addEventListener("change", () => { state.weight = +weightSelect.value; set({ "font-weight": String(state.weight) }); });

    const lineRange = h("input", { type: "range", min: "0.8", max: "2.4", step: "0.05", class: "dz-range", "aria-label": "Line height" });
    const lineNumber = h("span", { class: "dz-num" });
    const showLine = () => { lineRange.value = String(state.line); lineNumber.textContent = String(Math.round(state.line * 100) / 100); };
    lineRange.addEventListener("input", () => { state.line = +lineRange.value; showLine(); set({ "line-height": String(state.line) }); });

    const spaceRange = h("input", { type: "range", min: "-2", max: "10", step: "0.5", class: "dz-range", "aria-label": "Letter spacing" });
    const spaceNumber = h("span", { class: "dz-num" });
    const showSpace = () => { spaceRange.value = String(state.spacing); spaceNumber.textContent = state.spacing + "px"; };
    spaceRange.addEventListener("input", () => { state.spacing = +spaceRange.value; showSpace(); set({ "letter-spacing": state.spacing + "px" }); });

    const alignButtons = TEXT_ALIGNS.map((align) => h("button", { type: "button", class: "dz-menu-button", text: align[0].toUpperCase() + align.slice(1),
      "aria-pressed": "false", onclick: () => { state.align = align; showAlign(); set({ "text-align": align }); } }));
    const showAlign = () => alignButtons.forEach((button, i) => {
      const on = TEXT_ALIGNS[i] === state.align;
      button.classList.toggle("dz-active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    showSize(); showLine(); showSpace(); showAlign();
    return h("div", { class: "dz-panel dz-font" },
      colourButton, holder, contrast.node,
      h("label", { class: "dz-row" }, h("span", { text: "Size" }), sizeRange, sizeField, h("span", { class: "dz-unit", text: "px" })),
      h("label", { class: "dz-row" }, h("span", { text: "Weight" }), weightSelect),
      h("label", { class: "dz-row" }, h("span", { text: "Line" }), lineRange, lineNumber),
      h("label", { class: "dz-row" }, h("span", { text: "Letters" }), spaceRange, spaceNumber),
      h("div", { class: "dz-menu" }, ...alignButtons));
  }
