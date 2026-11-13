  // ---------- the Tone tool: shift hue, saturation and brightness together ----------
  // Relative to how the selected elements look when the tool opens, on their fill, text colour and border at once, so a whole set keeps its
  // relationships while its mood changes. (VisBug has a hue shift; this one also does saturation and brightness, and records every change.)
  function tonePanel() {
    const elements = targets();
    const baseline = elements.map((element) => {
      const cs = getComputedStyle(element);
      const fill = toRgba(cs.backgroundColor), text = toRgba(cs.color), edge = toRgba(cs.borderTopColor);
      const border = !NO_BORDER(cs.borderTopStyle, cs.borderTopWidth) && edge ? { style: cs.borderTopStyle, width: Math.round(parseFloat(cs.borderTopWidth)) || 0, rgba: edge } : null;
      return { element, fill: fill && fill[3] > 0 ? fill : null, text: element.textContent.trim() ? text : null, border };
    });
    const state = { hue: 0, sat: 0, val: 0 };
    const shift = ([r, g, b, a]) => {
      const [hue, sat, val] = rgbToHsv(r, g, b);
      const [nr, ng, nb] = hsvToRgb((hue + state.hue + 360) % 360, clamp(sat + state.sat / 100, 0, 1), clamp(val + state.val / 100, 0, 1));
      return a < 1 ? `rgba(${Math.round(nr)}, ${Math.round(ng)}, ${Math.round(nb)}, ${a})` : toHex(nr, ng, nb);
    };
    const apply = () => {
      checkpoint("tone", elements);
      bulk++;
      try {
        for (const { element, fill, text, border } of baseline) {
          if (fill) applyFill([element], shift(fill));
          if (text) applyType([element], { color: shift(text) });
          if (border) { const edge = shift(border.rgba); applyBorder([element], border.style, border.width, edge.startsWith("#") ? edge : toHex(...border.rgba)); }
        }
      } finally { bulk--; }
    };
    const rows = [["hue", "Hue", -180, 180, "°"], ["sat", "Saturation", -100, 100, "%"], ["val", "Brightness", -100, 100, "%"]].map(([key, name, min, max, unit]) => {
      const range = h("input", { type: "range", min: String(min), max: String(max), class: "dz-range", "aria-label": `${name} shift` });
      const number = h("span", { class: "dz-num" });
      const show = () => { range.value = String(state[key]); number.textContent = (state[key] > 0 ? "+" : "") + state[key] + unit; };
      range.addEventListener("input", () => { state[key] = +range.value; show(); apply(); });
      show();
      return { row: h("label", { class: "dz-row" }, h("span", { text: name }), range, number), show, key };
    });
    const reset = h("button", { type: "button", class: "dz-menu-button", text: "Back to start", title: "Put the colours back as they were when this tool opened",
      onclick: () => { state.hue = state.sat = state.val = 0; rows.forEach((r) => r.show()); apply(); } });
    const used = baseline.filter((b) => b.fill || b.text || b.border).length;
    return h("div", { class: "dz-panel dz-tone" },
      h("p", { class: "dz-hint dz-note", text: `Shifts the fill, text colour and border of ${elements.length > 1 ? `all ${elements.length} elements` : "this element"} together.${used ? "" : " Nothing here has a colour to shift."}` }),
      ...rows.map((r) => r.row), h("div", { class: "dz-menu" }, reset));
  }
