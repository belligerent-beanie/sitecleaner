  // ---------- selectors ----------
  const hashed = (name) => /\d{4,}/.test(name) || name.length > 30 || /^(css|sc|jsx|svelte|_)[-_]?[a-z0-9]{5,}$/i.test(name) || /^[a-z]{1,3}-[A-Za-z0-9]{5,}$/.test(name);
  function cssEscape(text) { return window.CSS && CSS.escape ? CSS.escape(text) : String(text).replace(/[^\w-]/g, "\\$&"); }
  function unique(selector, element) {
    try { const found = document.querySelectorAll(selector); return found.length === 1 && found[0] === element; } catch (_) { return false; }
  }
  /** Our best stable selector: id, then data-* attributes, then stable classes, then a short :nth-child path. */
  function selectorFor(element) {
    const tag = element.tagName.toLowerCase();
    if (element.id && !hashed(element.id)) {
      const byId = "#" + cssEscape(element.id);
      if (unique(byId, element)) return tag + byId;
    }
    for (const attr of element.attributes) {
      if (!attr.name.startsWith("data-") || attr.name === "data-designer" || !attr.value || attr.value.length > 40) continue;
      const byData = `${tag}[${attr.name}="${attr.value.replace(/(["\\])/g, "\\$1")}"]`;
      if (unique(byData, element)) return byData;
    }
    const classes = [...element.classList].filter((c) => !hashed(c));
    const own = tag + classes.map((c) => "." + cssEscape(c)).join("");
    if (classes.length && unique(own, element)) return own;
    const parts = [];
    for (let node = element; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      const t = node.tagName.toLowerCase();
      const cls = [...node.classList].filter((c) => !hashed(c)).slice(0, 2).map((c) => "." + cssEscape(c)).join("");
      const siblings = node.parentElement ? [...node.parentElement.children].filter((s) => s.tagName === node.tagName) : [];
      const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : "";
      if (node.id && !hashed(node.id)) { parts.unshift(t + "#" + cssEscape(node.id)); break; }
      parts.unshift(t + cls + nth);
      if (parts.length >= 2 && unique(parts.join(" > "), element)) break;
      if (node === document.body) break;
    }
    return parts.join(" > ");
  }
  const snippetOf = (element) => element.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
  function label(element) {
    const cls = [...element.classList].filter((c) => !hashed(c)).slice(0, 2).map((c) => "." + c).join("");
    return element.tagName.toLowerCase() + (element.id ? "#" + element.id : "") + cls;
  }
