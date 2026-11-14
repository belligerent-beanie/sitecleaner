  // ---------- the compact export ----------
  // The export is read by an AI (or a developer) that will make the same changes in the source files, so it is written to cost few tokens and to say what the
  // source needs to know. Three differences from the detailed export, which is still there (Changes panel: Export, Detailed):
  //   1. No "before" values and no boilerplate: what the source needs is the new value, and where to put it.
  //   2. Elements that received the same edits are one entry. When they share a class, the entry is that class ("×5": all five elements with it changed,
  //      so it is a change to the class's rule), or, when only some of the elements with that class changed ("2 of 5"), it says so, so that the reader
  //      decides between changing the class and adding a variant.
  //   3. "from:" names the style sheet rule that defines the property now (best effort: sheets from another origin cannot be read), which is where the
  //      change usually belongs.
  const EXPORT_MODES = ["compact", "detailed"];
  const exportMode = () => (EXPORT_MODES.includes(host.getPref("export")) ? host.getPref("export") : "compact");
  /** What gets copied or downloaded. */
  const exportMarkdown = () => (exportMode() === "compact" ? exportCompact() : exportDetailed());

  const cleanValue = (prop, value) => shorten(COLOUR_PROPS.includes(prop) ? colourIn(String(value)) : String(value), 90);
  /** The properties of one record that ended up different from how the page had them: [[prop, value], …]. */
  function changedProps(rec) {
    const out = [];
    for (const prop of EXPORT_PROPS) {
      const after = rec.after && rec.after[prop];
      if (after !== undefined && after !== (rec.before || {})[prop]) out.push([prop, cleanValue(prop, after)]);
    }
    return out;
  }

  /** Every changed thing, as {element (or null when it is not on the page now), rec, state, props, text}. */
  function exportItems() {
    const items = [];
    const add = (element, rec, state) => {
      const props = changedProps(rec);
      const text = rec.text && rec.text.after !== rec.text.before ? rec.text : null;
      if (props.length || text) items.push({ element, rec, state, props, text });
    };
    for (const [element, rec] of layers.normal) if (element.isConnected) add(element, rec, "");
    for (const item of pending) add(null, item, "");
    for (const state of STATES) {
      for (const [element, rec] of layers[state]) if (element.isConnected) add(element, rec, state);
      for (const item of pendingStates[state]) add(null, item, state);
    }
    return items;
  }

  // ---- shared classes
  const stableClasses = (element) => [...element.classList].filter((name) => !hashed(name));
  const pageMatches = (selector) => { try { return [...document.querySelectorAll(selector)].filter((el) => !ours(el)); } catch (_) { return []; } };
  /** The ways to name one element in a selector: its tag, each stable class, and the tag with them. */
  function simpleForms(element) {
    const tag = element.tagName.toLowerCase();
    const classes = stableClasses(element).map((name) => "." + cssEscape(name));
    return [tag, ...classes, ...classes.map((name) => tag + name), ...(classes.length > 1 ? [classes.join(""), tag + classes.join("")] : [])];
  }
  /**
   * The shortest selector that names all of `elements` and as few others as possible: {selector, total} (total = how many elements on the page match it), or null.
   * It is looked for among the elements' own classes and tags, alone and under a classed parent or ancestor (`.titleline > a`: the headline links of a list share
   * no class of their own, only the place they sit in). Bare tags are only used when they match exactly these elements.
   */
  function sharedSelector(elements) {
    const own = simpleForms(elements[0]);
    const candidates = new Set(own);
    let up = elements[0].parentElement;
    for (let depth = 0; up && up !== document.body && depth < 4; depth++, up = up.parentElement) {
      for (const parent of simpleForms(up).filter((form) => form.includes("."))) {   // an ancestor is only worth naming by a class
        for (const form of own) { candidates.add(`${parent} ${form}`); if (depth === 0) candidates.add(`${parent} > ${form}`); }
      }
    }
    let best = null;
    for (const selector of candidates) {
      const all = pageMatches(selector);
      if (!elements.every((el) => all.includes(el))) continue;
      if (all.length > elements.length && !selector.includes(".")) continue;   // "1 of 57 a" says nothing
      if (!best || all.length < best.total || (all.length === best.total && selector.length < best.selector.length)) best = { selector, total: all.length };
    }
    return best;
  }

  // ---- where the page defines a property now
  const PROBES = { border: ["border", "border-top-width", "border-top-style", "border-top-color"], "border-radius": ["border-radius", "border-top-left-radius"],
    padding: ["padding", "padding-top", "padding-left"], margin: ["margin", "margin-top", "margin-left"], gap: ["gap", "row-gap"], "background-image": ["background-image", "background"] };
  const probesFor = (prop) => PROBES[prop] || [prop];
  function specificityOf(selector) {
    const ids = (selector.match(/#[\w-]+/g) || []).length;
    const classes = (selector.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
    const tags = (selector.replace(/\[[^\]]*\]|[.#:][\w-]+(\([^)]*\))?/g, " ").match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
    return ids * 10000 + classes * 100 + tags;
  }
  function sheetName(sheet) {
    if (sheet.href) { try { const url = new URL(sheet.href); return url.origin === location.origin ? url.pathname : url.host + url.pathname; } catch (_) { return "(sheet)"; } }
    return sheet.ownerNode && sheet.ownerNode.tagName === "STYLE" ? "<style>" : "(sheet)";
  }
  /** Up to two "file selector" strings: the rules of the page's own style sheets that win for these properties on this element. */
  function sourcesOf(element, props, state) {
    const found = new Map();   // prop -> the winning rule so far
    const stripState = state ? new RegExp(":" + state + "(?![\\w-])", "g") : null;
    const hasState = state ? new RegExp(":" + state + "(?![\\w-])") : null;
    const visit = (rules, file) => {
      for (const rule of rules) {
        try {
          if (rule.type === 1) {
            for (const part of rule.selectorText.split(",")) {
              if (state ? !hasState.test(part) : /:(hover|focus|active)(?![\w-])/.test(part)) continue;   // a state rule belongs to its own state
              const probe = state ? part.replace(stripState, "") : part;
              if (!probe.trim() || !element.matches(probe)) continue;
              const spec = specificityOf(part);
              for (const prop of props) {
                if (!probesFor(prop).some((name) => rule.style.getPropertyValue(name))) continue;
                const current = found.get(prop);
                if (!current || spec >= current.spec) found.set(prop, { spec, where: `${file} ${part.trim()}` });
              }
            }
          } else if (rule.cssRules && (rule.type === 12 || (rule.type === 4 && window.matchMedia(rule.media.mediaText).matches))) {
            visit(rule.cssRules, file);   // @supports, and @media that applies in this window
          }
        } catch (_) { /* a rule the browser will not let us read */ }
      }
    };
    for (const sheet of document.styleSheets) { try { visit(sheet.cssRules, sheetName(sheet)); } catch (_) { /* another origin's sheet */ } }
    return [...new Set([...found.values()].map((entry) => entry.where))].slice(0, 2);
  }

  // ---- the entries
  const SHOWN = 5;   // how many elements of a group are named
  /** The elements by selector, each with a few words of its text when there are only a few (the words are what finds it in the source). */
  const listOf = (elements) => elements.slice(0, SHOWN).map((el) => {
    const words = elements.length <= 3 ? snippetOf(el) : "";
    return selectorFor(el) + (words ? ` ${JSON.stringify(shorten(words, 24))}` : "");
  }).join(", ") + (elements.length > SHOWN ? `, … (+${elements.length - SHOWN})` : "");
  function groupHead(group) {
    const state = group.state ? ":" + group.state : "";
    const elements = group.items.map((item) => item.element).filter(Boolean);
    if (!elements.length) return group.items[0].rec.selector + state;   // saved, and not on the page now: all that is known is its selector
    const shared = sharedSelector(elements);
    if (shared && shared.total === elements.length && elements.length > 1) return `${shared.selector}${state} ×${elements.length}`;   // every element with that class changed alike
    if (shared && shared.total > elements.length) return `${elements.length} of ${shared.total} ${shared.selector}${state}: ${listOf(elements)}`;   // some of them: class rule or variant?
    if (elements.length === 1) return listOf(elements).replace(/^(\S+)/, `$1${state}`);   // one element, and nothing it shares: its own selector
    return `×${elements.length}: ${listOf(elements)}${state ? " " + state : ""}`;
  }
  function exportCompact() {
    const items = exportItems();
    const groups = new Map();
    for (const item of items) {
      if (!item.props.length) continue;
      const key = item.state + "|" + JSON.stringify(item.props) + (item.element ? "" : "|" + item.rec.selector);
      if (!groups.has(key)) groups.set(key, { state: item.state, props: item.props, items: [] });
      groups.get(key).items.push(item);
    }
    const blocks = [];
    for (const group of groups.values()) {
      const first = group.items.find((item) => item.element);
      const lines = [groupHead(group)];
      if (first) {
        const sources = sourcesOf(first.element, group.props.map(([prop]) => prop), group.state);
        if (sources.length) lines.push("  from: " + sources.join(", "));
        if (group.props.some(([prop]) => prop === "color" || prop === "background-color")) {
          const info = group.state ? withLayer(group.state, () => forcedRead(first.element, () => contrastInfo(first.element))) : contrastInfo(first.element);
          if (!info.unknown && !info.aa) lines.push(`  ! contrast ${contrastLabel(info)} fails AA`);
        }
      }
      for (const [prop, value] of group.props) lines.push(`  ${prop}: ${value}`);
      blocks.push(lines.join("\n"));
    }
    const texts = items.filter((item) => item.text).map((item) => `${item.element ? selectorFor(item.element) : item.rec.selector}${item.state ? ":" + item.state : ""} text: ${JSON.stringify(shorten(item.text.before, 60))} → ${JSON.stringify(shorten(item.text.after, 60))}`);
    const structure = structureLines();
    if (!blocks.length && !texts.length && !structure.length) return "";
    const sized = blocks.some((block) => /^ {2}(width|height):/m.test(block));
    const stated = blocks.some((block) => /^\S.*:(hover|focus|active)\b/m.test(block));
    return [
      `SiteCleaner changes for ${location.origin + location.pathname} (window ${window.innerWidth}×${window.innerHeight}). Apply to the source.`
        + ` ×N = all N elements with that selector changed alike (change its rule). "N of M" = only N of the M changed (its rule, or a variant?). from: = where the property is defined now.`
        + `${stated ? " :hover, :focus and :active entries are rules for that state." : ""}${sized ? " Widths and heights are fixed pixels from this window: keep the layout responsive." : ""}`,
      "",
      blocks.join("\n"),
      ...(texts.length ? ["", ...texts] : []),
      ...(structure.length ? ["", "Structure, in order:", ...structure.map((line) => "- " + line)] : []),
      "",
    ].join("\n");
  }
