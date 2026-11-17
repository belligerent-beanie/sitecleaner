
  // ---------- structure: removing, duplicating, moving, grouping, pasting and replacing ----------
  // Changes to the page's structure, not its styles. Each is an op that knows how to undo and redo itself: it goes on the same undo stack as
  // style edits (one Ctrl+Z history for everything), is listed in the export, is kept across reloads and is replayed from selectors
  // when the page comes back. (VisBug makes these same edits, but records none of them.)
  const ops = [];              // the structural changes in force, oldest first: {desc, redo(), undo()}
  let pendingOps = [];         // saved ones that could not be replayed (yet): their elements are not on the page
  const MAX_HTML = 20000;      // pasted markup longer than this is not kept across reloads
  const MAX_ATTR = 300000;     // nor is an attribute value (a replaced image) longer than this

  const elementIndex = (node) => (node.parentElement ? [...node.parentElement.children].indexOf(node) : 0);
  const placeOf = (node) => ({ parentSelector: node.parentElement ? selectorFor(node.parentElement) : "", index: elementIndex(node) });
  const findBySelector = (selector) => { try { return selector ? document.querySelector(selector) : null; } catch (_) { return null; } };
  const reinsert = (node, parent, next) => parent.insertBefore(node, next && next.parentNode === parent ? next : null);

  function removeOp(node) {
    const parent = node.parentNode, next = node.nextSibling;
    const desc = { type: "remove", selector: selectorFor(node), snippet: snippetOf(node), ...placeOf(node) };
    return { desc, redo: () => node.remove(), undo: () => reinsert(node, parent, next) };
  }
  function duplicateOp(node) {
    const copy = node.cloneNode(true), parent = node.parentNode;
    const desc = { type: "duplicate", selector: selectorFor(node), snippet: snippetOf(node) };
    return { desc, copy, redo: () => parent.insertBefore(copy, node.nextSibling), undo: () => copy.remove() };
  }
  /** Move `node` into `parent`, before `before` (null: at the end). */
  function moveOp(node, parent, before) {
    const oldParent = node.parentNode, oldNext = node.nextSibling;
    const desc = { type: "move", selector: selectorFor(node), snippet: snippetOf(node), from: placeOf(node),
                   to: { parentSelector: selectorFor(parent), index: before ? [...parent.children].indexOf(before) : parent.children.length,   // index: counted before the move (replay finds `before` by it)
                         final: (() => { const rest = [...parent.children].filter((child) => child !== node); return before ? rest.indexOf(before) : rest.length; })() } };   // final: where it ends up (what the export says)
    return { desc, redo: () => parent.insertBefore(node, before), undo: () => reinsert(node, oldParent, oldNext) };
  }
  /** Put `nodes` in a new element (a div) where the first of them is. */
  function wrapOp(nodes, tag = "div") {
    const first = nodes[0], parent = first.parentNode, wrapper = document.createElement(tag);
    const places = nodes.map((node) => ({ node, parent: node.parentNode, next: node.nextSibling }));
    const desc = { type: "wrap", selectors: nodes.map(selectorFor), tag };
    return { desc, wrapper,
      redo: () => { parent.insertBefore(wrapper, first); for (const node of nodes) wrapper.appendChild(node); },
      undo: () => { for (const place of [...places].reverse()) reinsert(place.node, place.parent, place.next); wrapper.remove(); } };
  }
  /** Replace `element` with its own children. */
  function unwrapOp(element) {
    const parent = element.parentNode, next = element.nextSibling, kids = [...element.childNodes];
    const desc = { type: "unwrap", selector: selectorFor(element), snippet: snippetOf(element) };
    return { desc,
      redo: () => { for (const kid of kids) parent.insertBefore(kid, element); element.remove(); },
      undo: () => { reinsert(element, parent, next); for (const kid of kids) element.appendChild(kid); } };
  }
  /** Markup that came from a clipboard is not trusted: no scripts, frames, objects or event handlers, and no javascript: links. */
  function cleanMarkup(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    for (const bad of template.content.querySelectorAll("script, iframe, object, embed, link, meta, base, form")) bad.remove();
    for (const el of template.content.querySelectorAll("*")) {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name) || (/^(href|src|action|formaction|xlink:href)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value))) el.removeAttribute(attr.name);
      }
    }
    return template.content;
  }
  function insertOp(parent, html, before) {
    const nodes = [...cleanMarkup(html).childNodes];
    const limit = /src="data:image\//.test(html) ? MAX_ATTR : MAX_HTML;   // a picture that was added is kept whole when it fits like a replaced one does
    const desc = { type: "insert", parentSelector: selectorFor(parent), index: before ? [...parent.children].indexOf(before) : parent.children.length, html: html.slice(0, limit), whole: html.length <= limit };
    return { desc, nodes, redo: () => { for (const node of nodes) parent.insertBefore(node, before); }, undo: () => { for (const node of nodes) node.remove(); } };
  }
  /** Set (or with null remove) an attribute: an image's address, its alt text. An image's srcset would hide a new src, so it goes too. */
  function attrOp(element, name, value, label) {
    const before = element.hasAttribute(name) ? element.getAttribute(name) : null;
    const dropSrcset = name === "src" && element.hasAttribute("srcset");
    const oldSrcset = dropSrcset ? element.getAttribute("srcset") : null;
    const desc = { type: "attr", selector: selectorFor(element), snippet: snippetOf(element), name, before: before && before.slice(0, 500), after: value, whole: value === null || value.length <= MAX_ATTR, label: label && label.slice(0, 200), dropsSrcset: dropSrcset };
    const put = (v) => { if (v === null) element.removeAttribute(name); else element.setAttribute(name, v); };
    return { desc,
      redo: () => { put(value); if (dropSrcset) element.removeAttribute("srcset"); },
      undo: () => { put(before); if (dropSrcset) element.setAttribute("srcset", oldSrcset); } };
  }

  /** Perform structural changes as one step; each is {desc, redo, undo}. */
  function doOps(list, applied = false) {   // applied: they have been run already, one after another (each planned on the page the last left)
    if (!list.length) return;
    ensureNormal();
    if (comparing) setCompare(false);
    if (!applied) for (const op of list) op.redo();
    ops.push(...list);
    if (!restoring) {
      undoStack.push({ ops: list, inverted: false });
      if (undoStack.length > MAX_STEPS) undoStack.shift();
      redoStack.length = 0;
      lastEdit = { kind: "", elements: [], at: 0 };
      showHistory();
    }
    exported = false;
    showCount();
    save();
    refreshBoxes();
  }

  /** Do again, from its saved description, something done before a reload. False if what it needs is not on the page (yet). */
  function replayOp(d) {
    const el = findBySelector(d.selector);
    switch (d.type) {
      case "remove": if (!el) return false; doOps([removeOp(el)]); return true;
      case "duplicate": if (!el) return false; doOps([duplicateOp(el)]); return true;
      case "unwrap": if (!el) return false; doOps([unwrapOp(el)]); return true;
      case "move": {
        const parent = d.to && findBySelector(d.to.parentSelector);
        if (!el || !parent) return false;
        doOps([moveOp(el, parent, parent.children[d.to.index] || null)]);
        return true;
      }
      case "wrap": {
        const els = (d.selectors || []).map(findBySelector);
        if (!els.length || els.some((e) => !e)) return false;
        doOps([wrapOp(els, /^[a-z][a-z0-9-]*$/.test(d.tag) ? d.tag : "div")]);
        return true;
      }
      case "insert": {
        const parent = findBySelector(d.parentSelector);
        if (!parent || !d.whole || typeof d.html !== "string") return !d.whole;   // too large to have been kept: nothing to do
        doOps([insertOp(parent, d.html, parent.children[d.index] || null)]);
        return true;
      }
      case "retag": {
        if (!el || !/^[a-z][a-z0-9-]*$/.test(d.tag || "") || el.tagName.toLowerCase() === d.tag) return !!el;
        doOps([retagOp(el, d.tag)]);
        return true;
      }
      case "attr":
        if (!d.whole) return true;   // a local file that was too big to keep
        if (!el || typeof d.name !== "string" || !/^[a-z][a-z0-9-]*$/i.test(d.name) || /^on/i.test(d.name)) return false;
        doOps([attrOp(el, d.name, d.after)]);
        return true;
      default: return true;   // a kind this version does not know: drop it
    }
  }

  const shorten = (text, n = 70) => (text === null ? "(none)" : text.length > n ? text.slice(0, n) + "…" : text);
  /** What a structural change did, in a line a developer (or Claude) can act on. */
  function describeOp(d) {
    const named = (selector, snippet) => `\`${selector}\`${snippet ? ` (${JSON.stringify(snippet)})` : ""}`;
    switch (d.type) {
      case "remove": return `removed ${named(d.selector, d.snippet)}: it was child ${d.index + 1} of \`${d.parentSelector}\``;
      case "duplicate": return `duplicated ${named(d.selector, d.snippet)}: the copy sits right after it`;
      case "move": return `moved ${named(d.selector, d.snippet)} from child ${d.from.index + 1} of \`${d.from.parentSelector}\` to child ${(d.to.final === undefined ? d.to.index : d.to.final) + 1} of \`${d.to.parentSelector}\``;
      case "wrap": return `grouped ${d.selectors.map((s) => `\`${s}\``).join(", ")} in a new \`${d.tag}\``;
      case "unwrap": return `ungrouped ${named(d.selector, d.snippet)}: its children now sit where it was`;
      case "retag": return `changed ${named(d.selector, d.snippet)} from \`<${d.from}>\` to \`<${d.tag}>\` (a box that can hold other elements): its attributes and children moved with it`;
      case "insert": return `inserted markup as child ${d.index + 1} of \`${d.parentSelector}\`: \`${shorten(d.html.replace(/data:image\/[^"')\s]+/g, (uri) => `data:image… (${Math.round(uri.length / 1024)} KB)`).replace(/\s+/g, " "), 120)}\`${d.whole ? "" : " (too large to keep across reloads)"}`;
      case "attr": return `${named(d.selector, d.snippet)}: ${d.name} ${d.before === null ? "(none)" : "\"" + shorten(d.before) + "\""} → ${d.after === null ? "(removed)" : d.label ? "\"" + shorten(d.label, 60) + "\"" + (d.whole ? "" : " (too large to keep across reloads)") : d.whole ? "\"" + shorten(d.after) + "\"" : "a local file (too large to keep across reloads)"}${d.dropsSrcset ? "; its srcset is dropped, or it would hide the new picture" : ""}`;
      default: return `${d.type}`;
    }
  }
  const structureLines = () => [...ops.map((op) => op.desc), ...pendingOps].map(describeOp);
