  // ---------- the page's colours ----------
  let paletteCache = null;
  /** The colours this page already uses, so a designer can pick one rather than a near miss: first the site's own colour variables
   *  (--brown and the like, with their names), then the colours most used on the page. [{hex, names, count}] */
  function pagePalette() {
    if (paletteCache && Date.now() - paletteCache.at < 5000) return paletteCache.list;
    const found = new Map();
    const add = (css, name) => {
      const c = toRgba(css);
      if (!c || c[3] < 1) return;
      const hex = toHex(c[0], c[1], c[2]);
      const item = found.get(hex) || { hex, names: [], count: 0 };
      if (name) { if (!item.names.includes(name)) item.names.push(name); } else item.count += 1;
      found.set(hex, item);
    };
    const names = new Set();
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.style) for (let i = 0; i < rule.style.length; i++) if (rule.style[i].startsWith("--")) names.add(rule.style[i]);
        if (rule.cssRules) walk(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch (_) { /* another site's sheet: not readable */ } }
    const rootStyle = getComputedStyle(document.documentElement);
    for (const name of names) {
      const value = rootStyle.getPropertyValue(name).trim();
      if (/^(#|rgb|hsl|oklch|color\()/i.test(value)) add(value, name);
    }
    let seen = 0;
    for (const element of document.body.querySelectorAll("*")) {
      if (++seen > 1500) break;
      if (ours(element)) continue;
      const cs = getComputedStyle(element);
      add(cs.color); add(cs.backgroundColor); add(cs.borderTopColor);
    }
    const list = [...found.values()].sort((a, b) => (b.names.length > 0) - (a.names.length > 0) || b.count - a.count).slice(0, 20);
    paletteCache = { at: Date.now(), list };
    return list;
  }
