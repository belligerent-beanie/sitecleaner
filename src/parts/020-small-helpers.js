  // ---------- small helpers ----------
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, "");
      else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value);
    }
    for (const child of children) if (child) node.append(child);
    return node;
  }
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const hex2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  const toHex = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);

  function parseHex(text) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(text).trim());
    if (!m) return null;
    let v = m[1];
    if (v.length === 3) v = v.split("").map((c) => c + c).join("");
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let hue = 0;
    if (d) {
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    return [hue, max ? d / max : 0, max];
  }
  function hsvToRgb(hue, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = v - c;
    const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  /** A computed colour ("rgb(1, 2, 3)" or "rgba(…)") as "#rrggbb"; "transparent" when see-through; rgba(…) text when partly. */
  function colourText(computed) {
    const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)$/.exec(String(computed).trim());
    if (!m) return String(computed).trim();
    let alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (alpha === 0) return "transparent";
    if (alpha < 1) return `rgba(${Math.round(m[1])}, ${Math.round(m[2])}, ${Math.round(m[3])}, ${alpha})`;
    return toHex(+m[1], +m[2], +m[3]);
  }
  const NO_BORDER = (style, width) => style === "none" || style === "hidden" || parseFloat(width) === 0;
  function borderText(style, width, colour) {
    return NO_BORDER(style, width) ? "none" : `${width} ${style} ${colour}`;
  }
  /** Split a list on the commas that are not inside brackets ("rgba(0, 0, 0, 0.2) 0px 1px, …" has two shadows, not five). */
  function splitTopLevel(text) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      else if (text[i] === "," && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
    }
    parts.push(text.slice(start).trim());
    return parts.filter(Boolean);
  }
  /** One shadow ("rgba(0, 0, 0, 0.2) 0px 4px 12px 0px", the colour first or last, maybe "inset") as
   *  {x, y, blur, spread, rgb: [r, g, b], alpha, inset}; null when it cannot be read. */
  function parseShadow(text) {
    const colour = /rgba?\(([^)]*)\)/.exec(text);
    const numbers = colour ? colour[1].split(/[\s,/]+/).filter(Boolean) : ["0", "0", "0"];
    const lengths = text.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+(px)?/g) || [];
    if (lengths.length < 2) return null;
    const [x, y, blur = 0, spread = 0] = lengths.map((n) => Math.round(parseFloat(n)));
    const alphaText = numbers[3];
    const alpha = alphaText === undefined ? 1 : alphaText.endsWith("%") ? parseFloat(alphaText) / 100 : parseFloat(alphaText);
    return { x, y, blur, spread, rgb: numbers.slice(0, 3).map(Number), alpha: Math.round(alpha * 100) / 100, inset: /\binset\b/.test(text) };
  }
  /** A shadow as CSS: offsets, blur, spread, then the colour (#rrggbb when solid, rgba() when see-through), then "inset". */
  function shadowCss(s) {
    const colour = s.alpha >= 1 ? toHex(...s.rgb) : `rgba(${s.rgb.map(Math.round).join(", ")}, ${s.alpha})`;
    return `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${colour}${s.inset ? " inset" : ""}`;
  }
  /** A computed box-shadow in the same form as shadowCss, so before and after read alike in the export ("none" for none). */
  function shadowText(computed) {
    const text = String(computed).trim();
    if (!text || text === "none") return "none";
    return splitTopLevel(text).map((part) => { const s = parseShadow(part); return s ? shadowCss(s) : part; }).join(", ");
  }
