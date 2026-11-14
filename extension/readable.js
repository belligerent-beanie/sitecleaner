// The "easier to read" preset: what makes a page easier to see and use, applied the same way by the loader (at document_start, on a kept site) and by the
// picker (as a preview while the settings panel is open). It sets window.__scReadable = { apply(options), current(), defaults, describe(options), stats() }.
//
// Most of it is one style sheet (spacing, font, links, focus ring, calm motion, bigger buttons). Two things cannot be done in CSS and are done to the text
// itself, in one read-everything-then-write-everything pass (so a change does not disturb what the next one reads):
//   * text size and the smallest size allowed: every element that holds text gets its own computed size times the factor (or the minimum), as an
//     !important inline style. Working from the computed size, not from a rule, is what makes it work on pages that size text in px;
//   * text that is hard to read: colour against the colour behind it, WCAG 2 (4.5:1; 3:1 for large text). Only text on a plain background is touched:
//     if the background could be a picture or a gradient, or the text sits in something positioned (a hero banner), it is left alone, because a wrong
//     guess would make good text unreadable. The colour moves as little as it can towards black or white.
// Everything it writes inline is remembered and put back when the options change or are turned off.
(() => {
  if (window.__scReadable) return;
  const DEFAULTS = { textScale: 1, minText: 0, spacing: false, font: false, links: false, focus: false, motion: false, buttons: false, contrast: false };
  const sheet = new CSSStyleSheet();   // a constructed sheet: the page's content security policy cannot refuse it
  const touched = new Map();           // element -> what its inline style said before: {"font-size": [value, priority], color: [...]}
  let options = null;                  // null: off
  let observer = null, timer = 0, slowUntil = 0;
  let counts = { text: 0, contrast: 0, unsure: 0 };

  const clean = (o) => {
    if (!o || typeof o !== "object") return null;
    const next = { ...DEFAULTS };
    next.textScale = Math.min(2, Math.max(1, Number(o.textScale) || 1));
    next.minText = Math.min(24, Math.max(0, Number(o.minText) || 0));
    for (const key of ["spacing", "font", "links", "focus", "motion", "buttons", "contrast"]) next[key] = o[key] === true;
    const any = next.textScale > 1 || next.minText > 0 || ["spacing", "font", "links", "focus", "motion", "buttons", "contrast"].some((key) => next[key]);
    return any ? next : null;
  };

  // ---- the style sheet part
  function css(o) {
    const out = [];
    if (o.spacing) {
      out.push("body :where(p, li, dd, dt, blockquote, td, th, figcaption, label, summary) { line-height: 1.6 !important; letter-spacing: 0.03em !important; word-spacing: 0.08em !important; }");
      out.push("body :where(p) { margin-bottom: 1em !important; }");
    }
    if (o.font) {   // not on icons (icon fonts draw their symbols from letters), code, or pictures
      out.push('body :not([class*="icon" i]):not([class*="glyph" i]):not([class*="material" i]):not([class*="fa-"]):not(.fa):not(.fas):not(.far):not(.fab):not(svg):not(svg *):not(code):not(pre):not(kbd):not(samp) { font-family: Verdana, Tahoma, "Segoe UI", system-ui, sans-serif !important; }');
    }
    if (o.links) out.push("a:where([href]) { text-decoration: underline !important; text-underline-offset: 0.15em !important; }");
    if (o.focus) out.push(":focus-visible { outline: 3px solid #ffbf47 !important; outline-offset: 2px !important; box-shadow: 0 0 0 2px #111 !important; }");
    if (o.motion) out.push("*, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }");
    if (o.buttons) out.push('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], select, summary { min-height: 44px !important; min-width: 44px !important; }');
    return out.join("\n");
  }

  // ---- colour
  function parse(text) {   // computed colours are rgb()/rgba() or color(srgb ...); anything else is unknown (null)
    let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(text);
    if (m) { const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return [+m[1], +m[2], +m[3], a]; }
    m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(text);
    if (m) { const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return [+m[1] * 255, +m[2] * 255, +m[3] * 255, a]; }
    return null;
  }
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const over = (c, below) => mix(below, c, c[3]);   // c with its alpha, over an opaque colour

  /** The opaque colour behind an element, or null when it cannot be known (a picture, a gradient, something positioned over other things). */
  function backgroundOf(el, cache) {
    if (cache.has(el)) return cache.get(el);
    const cs = getComputedStyle(el);
    let result;
    if (cs.backgroundImage !== "none") result = null;
    else {
      const c = parse(cs.backgroundColor);
      if (c && c[3] >= 1) result = [c[0], c[1], c[2]];
      else {
        const parent = el.parentElement;
        const loose = cs.position === "absolute" || cs.position === "fixed" || cs.position === "sticky" || [...el.children].some((child) => /^(IMG|VIDEO|PICTURE|CANVAS|SVG|IFRAME)$/i.test(child.tagName));
        const below = loose && !(c && c[3] > 0) ? null : parent ? backgroundOf(parent, cache) : [255, 255, 255];   // above the root: the page's white
        result = !below ? null : c && c[3] > 0 ? over(c, below) : below;
      }
    }
    cache.set(el, result);
    return result;
  }

  /** The colour nearest to `fg` that reads on `bg` at the ratio `need`, towards black or white; null if it already does. */
  function fixColour(fg, bg, need) {
    const solid = fg[3] < 1 ? over(fg, bg) : fg;
    if (ratio(solid, bg) >= need) return null;
    const target = lum(bg) > 0.179 ? [0, 0, 0] : [255, 255, 255];
    if (ratio(target, bg) < need) return target;
    const at = (t) => mix(solid, target, t).map((v) => Math.round(v));   // judged on the whole-number colour that will really be used
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (ratio(at(mid), bg) >= need) hi = mid; else lo = mid; }
    const [r, g, b] = at(hi);
    return `rgb(${r}, ${g}, ${b})`;
  }

  // ---- the pass over the text
  function restoreInline() {
    for (const [el, saved] of touched) {
      for (const prop of Object.keys(saved)) { const [value, priority] = saved[prop]; if (value) el.style.setProperty(prop, value, priority); else el.style.removeProperty(prop); }
      if (el.getAttribute("style") === "") el.removeAttribute("style");
    }
    touched.clear();
  }
  function textContainers() {
    const found = new Set();
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/\S/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let n = walker.nextNode(); n && found.size < 8000; n = walker.nextNode()) {
      const el = n.parentElement;
      if (el && !/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|TEMPLATE)$/i.test(el.tagName) && el.id !== "design-picker-extension-root") found.add(el);
    }
    return [...found];
  }
  function inlinePass() {
    restoreInline();
    counts = { text: 0, contrast: 0, unsure: 0 };
    if (!options || (options.textScale === 1 && !options.minText && !options.contrast)) return;
    const els = textContainers();
    const cache = new Map();
    const plan = [];
    for (const el of els) {   // read everything first
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const step = { el };
      let shown = size;
      if ((options.textScale > 1 || options.minText) && size > 0) {
        const next = Math.round(Math.max(size * options.textScale, options.minText) * 10) / 10;
        if (Math.abs(next - size) > 0.05) { step.size = next; shown = next; }
      }
      if (options.contrast) {
        const fg = parse(cs.color);
        const bg = fg ? backgroundOf(el, cache) : null;
        if (!fg || !bg) counts.unsure += 1;
        else {
          const large = shown >= 24 || (shown >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
          const fixed = fixColour(fg, bg, large ? 3 : 4.5);
          if (fixed) step.color = fixed;
        }
      }
      if (step.size || step.color) plan.push(step);
    }
    for (const { el, size, color } of plan) {   // then write
      const saved = {};
      if (size) { saved["font-size"] = [el.style.getPropertyValue("font-size"), el.style.getPropertyPriority("font-size")]; el.style.setProperty("font-size", size + "px", "important"); counts.text += 1; }
      if (color) { saved.color = [el.style.getPropertyValue("color"), el.style.getPropertyPriority("color")]; el.style.setProperty("color", color, "important"); counts.contrast += 1; }
      touched.set(el, saved);
    }
  }

  // Content that arrives later (a page that draws itself, a feed) is handled by doing the whole pass again, in one go so nothing is seen half done;
  // a slow page is looked at less often.
  function watch(on) {
    if (!on) { if (observer) { observer.disconnect(); observer = null; } clearTimeout(timer); return; }
    if (observer) return;
    observer = new MutationObserver((records) => {
      if (!records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 || (n.nodeType === 3 && /\S/.test(n.data))))) return;
      clearTimeout(timer);
      timer = setTimeout(() => { const t0 = performance.now(); inlinePass(); slowUntil = performance.now() + (performance.now() - t0 > 80 ? 3000 : 0); }, Math.max(400, slowUntil - performance.now()));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function apply(next) {
    options = clean(next);
    sheet.replaceSync(options ? css(options) : "");
    const adopted = document.adoptedStyleSheets.includes(sheet);
    if (options && !adopted) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    else if (!options && adopted) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((other) => other !== sheet);
    const needsText = !!options && (options.textScale > 1 || options.minText > 0 || options.contrast);
    inlinePass();
    watch(needsText);
    return stats();
  }
  const stats = () => ({ ...counts });
  function describe(o) {
    const c = clean(o);
    if (!c) return "Nothing turned on";
    const parts = [];
    if (c.textScale > 1) parts.push(`text ${Math.round(c.textScale * 100)}%`);
    if (c.minText) parts.push(`nothing under ${c.minText}px`);
    if (c.spacing) parts.push("more spacing");
    if (c.font) parts.push("plain font");
    if (c.links) parts.push("underlined links");
    if (c.focus) parts.push("strong focus outline");
    if (c.motion) parts.push("calm motion");
    if (c.buttons) parts.push("bigger buttons");
    if (c.contrast) parts.push("fixed low contrast");
    return parts.join(", ");
  }
  // The page's own load: text that is there only once it has been parsed.
  window.addEventListener("DOMContentLoaded", () => { if (options && (options.textScale > 1 || options.minText || options.contrast)) inlinePass(); }, { once: true });
  window.__scReadable = { apply, current: () => (options ? { ...options } : null), defaults: { ...DEFAULTS }, describe, stats };
})();
