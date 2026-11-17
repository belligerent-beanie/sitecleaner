  // ---------- whole objects (the studio edition) ----------
  // Designers think in things they can see (a picture, a heading, a button), not in the page's wrappers. In the studio edition a click picks the
  // thing that draws: the words of a button are the button. ↑ and ↓ then skip the wrappers (same box, nothing of their own to draw, one child inside),
  // so they walk between objects. Alt-click, or "Exact elements" in the panel, picks the page's own element.
  const friendly = () => !!(host.features && host.features.friendly === true);
  const exactElements = () => host.getPref("exact") === "1";
  const soleChild = (el) => {
    const kids = [...el.children].filter((c) => !ours(c) && !/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE)$/.test(c.tagName));
    return kids.length === 1 ? kids[0] : null;
  };
  /** Is this element only a wrapper: one child filling it, and nothing of its own that shows (no text, fill, picture, border or shadow)? */
  function isWrapper(el) {
    if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement || ours(el)) return false;
    const child = soleChild(el);
    if (!child || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.display === "contents") return false;
    if (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderRightWidth) || parseFloat(cs.borderBottomWidth) || parseFloat(cs.borderLeftWidth)) return false;
    if (cs.boxShadow !== "none" || cs.backgroundImage !== "none" || !/^rgba\(\s*0,\s*0,\s*0,\s*0\)$|^transparent$/.test(cs.backgroundColor)) return false;
    const a = el.getBoundingClientRect(), b = child.getBoundingClientRect();
    return Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) < 2 && Math.abs(a.width - b.width) < 2 && Math.abs(a.height - b.height) < 2;
  }
  /** Is this a run of words inside a block (a span, a bold or an emphasis), rather than a thing of its own (a picture, a field, a button)? */
  function isTextRun(el) {
    if (/^(IMG|SVG|VIDEO|CANVAS|INPUT|BUTTON|SELECT|TEXTAREA|IFRAME|PICTURE|AUDIO|OBJECT|A)$/i.test(el.tagName) || el.children.length) return false;
    const parent = el.parentElement;
    if (!parent || parent === document.body || ours(parent) || !el.textContent.trim()) return false;
    if (!/^inline/.test(getComputedStyle(el).display) || /^inline/.test(getComputedStyle(parent).display)) return false;
    return ![...parent.childNodes].some((n) => n !== el && n.nodeType === 3 && n.textContent.trim());   // words of the parent's own beside it: it is one of several runs of a paragraph, so it stays itself
  }
  /** What a click on this element selects: the whole object it is part of. */
  function wholeObject(el, event) {
    if (!friendly() || exactElements() || (event && event.altKey) || !el || ours(el)) return el;
    let node = el;
    if (isTextRun(node) && node.parentElement) node = node.parentElement;   // the words of a button are part of the button
    return node;
  }
  /** What ↑ goes to from an object: its container, past any wrappers. Null for the ordinary parent. */
  function aboveObject(el) {
    if (!friendly() || exactElements()) return null;
    let node = el.parentElement;
    while (node && isWrapper(node)) node = node.parentElement;
    return node;
  }
  /** What ↓ goes to from an object: through its wrappers to what they hold. Null if it is not a wrapper (the ordinary first child then). */
  function insideObject(el) {
    if (!friendly() || exactElements() || !isWrapper(el)) return null;
    let node = el;
    while (isWrapper(node)) node = soleChild(node);
    return node;
  }
