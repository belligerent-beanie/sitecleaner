  // ---------- the colour picker (used by Fill and by Border's colour button) ----------
  function colourPicker(startHex, onChange) {
    let [r, g, b] = parseHex(startHex) || [255, 255, 255];
    let [hue, sat, val] = rgbToHsv(r, g, b);
    const sv = h("div", { class: "dz-sv", "aria-label": "Saturation and brightness" });
    const dot = h("div", { class: "dz-sv-dot" });
    sv.append(dot);
    const hueInput = h("input", { type: "range", min: "0", max: "359", class: "dz-range dz-hue", "aria-label": "Hue" });
    const sliders = {};
    const rows = [];
    for (const [key, name] of [["r", "R"], ["g", "G"], ["b", "B"]]) {
      const input = h("input", { type: "range", min: "0", max: "255", class: `dz-range dz-${key}`, "aria-label": name });
      const number = h("span", { class: "dz-num" });
      sliders[key] = { input, number };
      rows.push(h("label", { class: "dz-row" }, h("span", { text: name }), input, number));
    }
    const hexInput = h("input", { type: "text", class: "dz-hex", maxlength: "7", spellcheck: "false", "aria-label": "Hex colour" });
    const swatch = h("span", { class: "dz-swatch" });

    function show() {
      sv.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
      dot.style.left = sat * 100 + "%";
      dot.style.top = (1 - val) * 100 + "%";
      hueInput.value = String(Math.round(hue));
      sliders.r.input.value = String(Math.round(r)); sliders.r.number.textContent = String(Math.round(r));
      sliders.g.input.value = String(Math.round(g)); sliders.g.number.textContent = String(Math.round(g));
      sliders.b.input.value = String(Math.round(b)); sliders.b.number.textContent = String(Math.round(b));
      const text = toHex(r, g, b);
      if (activeEl() !== hexInput) hexInput.value = text;
      swatch.style.backgroundColor = text;
    }
    const fromRgb = () => { [hue, sat, val] = rgbToHsv(r, g, b); if (sat === 0 || val === 0) hue = +hueInput.value; };
    const fromHsv = () => { [r, g, b] = hsvToRgb(hue, sat, val); };
    const emit = () => { show(); onChange(toHex(r, g, b)); };

    function dragSv(event) {
      const box = sv.getBoundingClientRect();
      sat = clamp((event.clientX - box.left) / box.width, 0, 1);
      val = 1 - clamp((event.clientY - box.top) / box.height, 0, 1);
      fromHsv();
      emit();
    }
    sv.addEventListener("pointerdown", (event) => { sv.setPointerCapture(event.pointerId); dragSv(event); });
    sv.addEventListener("pointermove", (event) => { if (sv.hasPointerCapture(event.pointerId)) dragSv(event); });
    hueInput.addEventListener("input", () => { hue = +hueInput.value; fromHsv(); emit(); });
    for (const key of ["r", "g", "b"]) {
      sliders[key].input.addEventListener("input", () => {
        r = +sliders.r.input.value; g = +sliders.g.input.value; b = +sliders.b.input.value;
        fromRgb(); emit();
      });
    }
    hexInput.addEventListener("input", () => {
      const parsed = parseHex(hexInput.value);
      if (!parsed) return;
      [r, g, b] = parsed;
      fromRgb(); show(); onChange(toHex(r, g, b));
    });
    hexInput.addEventListener("blur", show);
    show();
    const colours = pagePalette();
    let paletteBox = null;
    if (colours.length) {
      paletteBox = h("div", { class: "dz-palette", role: "group", "aria-label": "Colours on this page" }, h("span", { class: "dz-hint", text: "On this page" }));
      for (const item of colours) {
        const chip = h("button", { type: "button", class: "dz-chip", title: item.names.length ? `${item.hex} · ${item.names.join(", ")}` : item.hex,
          "aria-label": item.names.length ? `${item.hex}, ${item.names.join(", ")}` : item.hex,
          onclick: () => { [r, g, b] = parseHex(item.hex); fromRgb(); emit(); } });
        chip.style.backgroundColor = item.hex;
        paletteBox.append(chip);
      }
    }
    return h("div", { class: "dz-picker" }, sv, h("label", { class: "dz-row" }, h("span", { text: "Hue" }), hueInput, swatch), ...rows,
             h("label", { class: "dz-row" }, h("span", { text: "Hex" }), hexInput), paletteBox);
  }
