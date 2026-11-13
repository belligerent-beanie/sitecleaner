  // ---------- type and contrast ----------
  const TEXT_ALIGNS = ["left", "center", "right", "justify"];
  const WEIGHTS = [[100, "Thin"], [200, "Extra light"], [300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"], [800, "Extra bold"], [900, "Black"]];
  /** Line height the way designers say it: a multiple of the font size ("1.5"), or "normal". */
  function lineHeightOf(cs) {
    if (cs.lineHeight === "normal") return "normal";
    const size = parseFloat(cs.fontSize);
    return size ? String(Math.round((parseFloat(cs.lineHeight) / size) * 100) / 100) : cs.lineHeight;
  }
  const alignOf = (cs) => ({ start: "left", end: "right" }[cs.textAlign] || cs.textAlign);

  const colourContext = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  /** Any CSS colour as [r, g, b, alpha 0..1] (the browser does the parsing, so rgb(), hex, hsl() and oklch() all work); null if it cannot. */
  function toRgba(css) {
    if (!colourContext) return null;
    try {
      colourContext.canvas.width = colourContext.canvas.height = 1;
      colourContext.fillStyle = "#000";
      colourContext.fillStyle = css;
      colourContext.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = colourContext.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    } catch (_) { return null; }
  }
  const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
  function luminance([r, g, b]) {
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  const contrastOf = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  /** What is behind the element's text: its own background, then its ancestors' until one is solid (white if none is). A picture or
   *  gradient cannot be measured: unknown is true then. */
  function backdrop(element) {
    const layers = [];
    let unknown = false;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage !== "none") unknown = true;
      const c = toRgba(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      if (unknown) break;
    }
    let base = [255, 255, 255];
    for (const layer of layers.reverse()) base = over(layer, base);
    return { rgb: base, unknown };
  }
  /** APCA lightness contrast Lc (the measure proposed for WCAG 3): how readable the text is. Negative means light text on a darker
   *  background. Checked against the published reference values (black on white 106.04, white on black -107.88). */
  function apcaOf(textRgb, backRgb) {
    const y = ([r, g, b]) => 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
    const clampBlack = (v) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
    const t = clampBlack(y(textRgb)), b = clampBlack(y(backRgb));
    if (Math.abs(b - t) < 0.0005) return 0;
    if (b > t) { const sapc = (b ** 0.56 - t ** 0.57) * 1.14; return sapc < 0.1 ? 0 : (sapc - 0.027) * 100; }
    const sapc = (b ** 0.65 - t ** 0.62) * 1.14;
    return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
  }
  const apcaUse = (lc) => { const a = Math.abs(lc); return a >= 90 ? "any text" : a >= 75 ? "body text" : a >= 60 ? "large or bold text" : a >= 45 ? "headlines" : a >= 30 ? "spot text only" : "not readable"; };
  /** The element's text colour against what is behind it, with the WCAG 2 thresholds for its size (large text needs less). */
  function contrastInfo(element) {
    const cs = getComputedStyle(element);
    const back = backdrop(element);
    const fore = toRgba(cs.color);
    if (!fore) return { unknown: true };
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (parseInt(cs.fontWeight, 10) >= 700 && size >= 18.66);
    const need = large ? 3 : 4.5, needAaa = large ? 4.5 : 7;
    const ratio = contrastOf(over(fore, back.rgb), back.rgb);
    return { unknown: back.unknown, ratio, need, aa: ratio >= need, aaa: ratio >= needAaa, apca: apcaOf(over(fore, back.rgb), back.rgb) };
  }
  const contrastLabel = (info) => (info.unknown ? "unknown" : info.ratio.toFixed(2) + ":1");
  /** A live line under a colour picker: the contrast ratio and whether it passes WCAG AA and AAA. update() after each change. */
  function contrastNode(element) {
    const node = h("p", { class: "dz-contrast" });
    function update() {
      if (!element.textContent.trim()) { node.hidden = true; return; }   // no words in it: nothing to read
      node.hidden = false;
      const info = contrastInfo(element);
      node.className = "dz-contrast " + (info.unknown ? "dz-unknown" : info.aa ? "dz-pass" : "dz-fail");
      node.textContent = info.unknown ? "Contrast: the background is a picture or gradient, so it cannot be measured."
        : `Contrast ${info.ratio.toFixed(2)}:1 · AA ${info.aa ? "✓" : `✗ (needs ${info.need}:1)`} · AAA ${info.aaa ? "✓" : "✗"} · APCA Lc ${Math.round(info.apca)} (${apcaUse(info.apca)})`;
    }
    update();
    return { node, update };
  }
