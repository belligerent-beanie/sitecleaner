  // ---------- sizes, spacing and corners ----------
  const SIDES = ["top", "right", "bottom", "left"];
  const CORNERS = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"];
  /** CSS shorthand for four values (top right bottom left), as short as it can be: "8px", "8px 12px", "8px 12px 4px", or all four. */
  function sidesText(values) {
    const [t, r, b, l] = values;
    if (t === r && r === b && b === l) return t;
    if (t === b && r === l) return `${t} ${r}`;
    if (r === l) return `${t} ${r} ${b}`;
    return `${t} ${r} ${b} ${l}`;
  }
  /** A padding or margin shorthand ("8px 12px") back to four numbers, or null if it is not plain pixels. */
  function parseSides(text) {
    const parts = String(text).trim().split(/\s+/).map((p) => (/^-?\d+(\.\d+)?px$/.test(p) ? parseFloat(p) : NaN));
    if (!parts.length || parts.length > 4 || parts.some(Number.isNaN)) return null;
    const [t, r = t, b = t, l = r] = parts;
    return [t, r, b, l];
  }
  const sideNumbers = (cs, kind) => SIDES.map((side) => Math.round((parseFloat(cs.getPropertyValue(`${kind}-${side}`)) || 0) * 10) / 10);
  const sidesOf = (cs, kind) => sidesText(sideNumbers(cs, kind).map((n) => n + "px"));
  const radiusOf = (cs) => sidesText(CORNERS.map((corner) => cs.getPropertyValue(corner).split(" ")[0]));
  /** The size the designer sees and sets: the element's border box in pixels. */
  function boxSize(element) {
    const r = element.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height) };
  }
  /** The width/height value that makes the border box `target` pixels (the site's boxes are border-box; this covers the ones that are not). */
  function cssSize(element, axis, target) {
    const cs = getComputedStyle(element);
    if (cs.boxSizing === "border-box") return target;
    const extra = axis === "width"
      ? ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"] : ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"];
    return Math.max(0, target - extra.reduce((sum, key) => sum + (parseFloat(cs[key]) || 0), 0));
  }
