  // ---------- size, spacing and radius tools ----------
  const SIZE_HELP = "Type a size, or drag the pink handles on the page (Shift keeps the proportions).";
  /** A pixel field: a number box that Shift+↑/↓ moves by 10, beside its slider. */
  function numberField(label, min, max, onChange) {
    const field = h("input", { type: "number", class: "dz-field", min: String(min), max: String(max), step: "1", "aria-label": label });
    field.addEventListener("input", () => { const n = field.valueAsNumber; if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n))); });
    field.addEventListener("keydown", (event) => {
      if (!event.shiftKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      const n = (Number.isFinite(field.valueAsNumber) ? field.valueAsNumber : 0) + (event.key === "ArrowUp" ? 10 : -10);
      field.value = String(Math.max(min, Math.min(max, n)));
      field.dispatchEvent(new Event("input"));
    });
    return field;
  }
  function sizePanel() {
    const element = selected;
    const inline = getComputedStyle(element).display === "inline";
    const note = h("p", { class: "dz-hint dz-note" });
    const controls = {};
    const askFor = {};   // the size last asked for, to tell the designer when the page's own rules keep the element from it
    function sync() {
      const now = boxSize(element);
      for (const axis of ["width", "height"]) {
        const { range, field } = controls[axis];
        range.max = String(Math.max(600, now[axis] * 2));
        range.value = String(now[axis]);
        if (activeEl() !== field) field.value = String(now[axis]);
      }
      const stuck = ["width", "height"].filter((axis) => askFor[axis] !== undefined && Math.abs(now[axis] - askFor[axis]) > 1);
      note.textContent = inline ? "This is inline text: it flows with its line and cannot be sized. Select its parent, or a box around it."
        : stuck.length ? `The page's own rules keep the ${stuck.join(" and ")} at ${stuck.map((a) => now[a] + "px").join(" × ")} (a min or max size, or its container).`
        : SIZE_HELP;
    }
    function set(axis, value) {
      askFor[axis] = value;
      applySize(targets(), { [axis]: value });
      sync();
    }
    const rows = ["width", "height"].map((axis) => {
      const range = h("input", { type: "range", min: "1", max: "600", class: "dz-range", "aria-label": `${axis === "width" ? "Width" : "Height"} slider`, disabled: inline });
      const field = numberField(axis === "width" ? "Width in pixels" : "Height in pixels", 1, 4000, (value) => set(axis, value));
      field.disabled = inline;
      range.addEventListener("input", () => set(axis, +range.value));
      controls[axis] = { range, field };
      return h("label", { class: "dz-row dz-sizing-row" }, h("span", { text: axis === "width" ? "Width" : "Height" }), range, field, h("span", { class: "dz-unit", text: "px" }));
    });
    const auto = h("button", { type: "button", class: "dz-menu-button", text: "Back to auto", disabled: inline,
      title: "Remove the width and height you set, so the page sizes it again",
      onclick: () => { askFor.width = askFor.height = undefined; clearSize(targets()); sync(); } });
    sync();
    sizeSync = sync;
    return h("div", { class: "dz-panel" }, ...rows, note, h("div", { class: "dz-menu" }, auto));
  }
  /** One group (padding or margin): a slider for all four sides, or one each when "same on all sides" is off. */
  function spacingGroup(element, kind, title, min, max) {
    const sides = sideNumbers(getComputedStyle(element), kind);
    const same = h("input", { type: "checkbox", "aria-label": `${title}: same on all sides` });
    same.checked = sides.every((n) => n === sides[0]);
    const body = h("div", { class: "dz-panel" });
    const apply = () => applySpacing(targets(), kind, sides);
    function build() {
      body.replaceChildren();
      const rows = same.checked ? [["All", null]] : SIDES.map((side, i) => [side[0].toUpperCase() + side.slice(1), i]);
      for (const [name, index] of rows) {
        const range = h("input", { type: "range", min: String(min), max: String(max), class: "dz-range", "aria-label": `${title} ${name.toLowerCase()}` });
        const number = h("span", { class: "dz-num" });
        const show = () => { const v = index === null ? sides[0] : sides[index]; range.value = String(v); number.textContent = v + "px"; };
        range.addEventListener("input", () => {
          const v = +range.value;
          if (index === null) sides.fill(v); else sides[index] = v;
          show();
          apply();
        });
        show();
        body.append(h("label", { class: "dz-row" }, h("span", { text: name }), range, number));
      }
    }
    same.addEventListener("change", () => { if (same.checked) sides.fill(sides[0]); build(); });
    build();
    return h("div", { class: "dz-spacing" },
      h("label", { class: "dz-row dz-group-head" }, h("strong", { text: title }), h("span", { class: "dz-wide", text: "same on all sides" }), same), body);
  }
  function spacingPanel() {
    const element = selected;
    const keys = ["padding", "margin"].map((kind) => h("button", { type: "button", class: "dz-menu-button" + (spacingKeys === kind ? " dz-active" : ""), text: kind[0].toUpperCase() + kind.slice(1),
      "aria-pressed": String(spacingKeys === kind), onclick: () => { spacingKeys = kind; renderDock(); } }));
    return h("div", { class: "dz-panel dz-spacing-panel" }, spacingGroup(element, "padding", "Padding", 0, 80), spacingGroup(element, "margin", "Margin", -40, 80),
      h("div", { class: "dz-panel" }, h("span", { class: "dz-hint", text: "The arrow keys change:" }), h("div", { class: "dz-menu" }, ...keys),
        h("span", { class: "dz-hint", text: "◀ ▶ ▲ ▼ the sides, Alt takes away, Shift is ten, Ctrl with ▲ ▼ all four." })));
  }
  const RADIUS_PRESETS = [["Square", "0px"], ["Soft", "6px"], ["Round", "16px"], ["Pill", "9999px"]];
  function radiusPanel() {
    const element = selected;
    const cs = getComputedStyle(element);
    const first = cs.getPropertyValue(CORNERS[0]).split(" ")[0];
    const box = boxSize(element);
    let value = first.endsWith("%") ? Math.round((parseFloat(first) / 100) * Math.min(box.width, box.height)) : Math.round(parseFloat(first) || 0);
    const range = h("input", { type: "range", min: "0", max: "64", class: "dz-range", "aria-label": "Corner radius" });
    const number = h("span", { class: "dz-num" });
    const buttons = RADIUS_PRESETS.map(([name, css]) => h("button", { type: "button", class: "dz-menu-button", text: name,
      onclick: () => { value = parseFloat(css); show(); applyRadius(targets(), css); } }));
    function show() {
      range.value = String(Math.min(64, value));
      number.textContent = value >= 999 ? "Pill" : value + "px";
      buttons.forEach((button, i) => button.classList.toggle("dz-active", parseFloat(RADIUS_PRESETS[i][1]) === value));
    }
    range.addEventListener("input", () => { value = +range.value; show(); applyRadius(targets(), value + "px"); });
    show();
    return h("div", { class: "dz-panel" }, h("div", { class: "dz-menu" }, ...buttons), h("label", { class: "dz-row" }, h("span", { text: "Radius" }), range, number));
  }