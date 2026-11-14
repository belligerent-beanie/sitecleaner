  // ---------- hover and focus states ----------
  // A state edit is a CSS rule, `selector:hover { ... }`, in a style sheet of our own (a constructed one: the page's security policy cannot refuse it).
  // The tools write to it through styleOf(), which gives them the rule's style instead of the element's, so every tool, and undo, saving and the export,
  // work on a state the way they do on the element itself. While a state is being edited the selected elements carry an attribute that makes
  // the rule (and a copy of the page's own :hover or :focus rules) apply, so the designer sees the state without having to hold the pointer there.
  const FORCE = "data-designer-force";
  const stateSheet = new CSSStyleSheet();    // the designer's state rules
  const mirrorSheet = new CSSStyleSheet();   // the page's own :hover and :focus rules, copied so that they also match the forced attribute
  const stateRules = { hover: new Map(), focus: new Map() };   // state -> element -> its CSSStyleRule
  const forced = new Set();                  // elements carrying the attribute now
  let pendingStates = { hover: [], focus: [] };   // saved state edits whose element is not on the page (yet)
  const anyPending = () => !!(pending.length || pendingOps.length || STATES.some((state) => pendingStates[state].length));

  function installSheets() {
    const have = document.adoptedStyleSheets;
    if (!have.includes(mirrorSheet) || !have.includes(stateSheet)) document.adoptedStyleSheets = [...have.filter((s) => s !== mirrorSheet && s !== stateSheet), mirrorSheet, stateSheet];
  }
  const ruleSelector = (element, state) => { const sel = selectorFor(element) || ":not(*)"; return `${sel}:${state}, ${sel}[${FORCE}~="${state}"]`; };

  /** Where a tool writes: the element's own style, or the rule for the state being edited (made when first needed). */
  function styleOf(element, which = layer) {
    if (which === "normal") return element.style;
    let rule = stateRules[which].get(element);
    if (!rule) {
      installSheets();
      let index;
      try { index = stateSheet.insertRule(`${ruleSelector(element, which)} {}`, stateSheet.cssRules.length); } catch (_) { index = stateSheet.insertRule(":not(*) {}", stateSheet.cssRules.length); }
      rule = stateSheet.cssRules[index];
      stateRules[which].set(element, rule);
    }
    return rule.style;
  }
  /** The rule's style if there is one, without making one (reading before an edit must not leave empty rules behind). */
  const peekStyle = (element, which) => (which === "normal" ? element.style : (stateRules[which].get(element) || {}).style || null);
  /** The selectors follow the page when structure changes move an element. */
  function retargetRules() {
    for (const state of STATES) for (const [element, rule] of stateRules[state]) { if (element.isConnected) { try { rule.selectorText = ruleSelector(element, state); } catch (_) { /* keeps the old one */ } } }
  }
  function clearStateRules() {
    while (stateSheet.cssRules.length) stateSheet.deleteRule(0);
    for (const state of STATES) stateRules[state].clear();
  }

  /** The page's own :hover and :focus rules, rewritten to match the forced attribute, so a forced state looks the way the site makes it look. */
  function mirrorRules(rules, out) {
    for (const rule of rules) {
      try {
        if (rule.type === 1) {
          const parts = rule.selectorText.split(",").filter((part) => /:(hover|focus|focus-visible)(?![\w-])/.test(part))
            .map((part) => part.replace(/:hover(?![\w-])/g, `[${FORCE}~="hover"]`).replace(/:focus(?:-visible)?(?![\w-])/g, `[${FORCE}~="focus"]`));
          if (parts.length) out.push(`${parts.join(",")} { ${rule.style.cssText} }`);
        } else if (rule.cssRules && (rule.type === 4 || rule.type === 12)) {   // @media, @supports
          const inner = [];
          mirrorRules(rule.cssRules, inner);
          if (inner.length) out.push(`${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{ ${inner.join("\n")} }`);
        }
      } catch (_) { /* a rule the browser will not let us read */ }
    }
  }
  function buildMirror() {
    const out = [];
    for (const sheet of document.styleSheets) { try { mirrorRules(sheet.cssRules, out); } catch (_) { /* another origin's sheet: cannot be read */ } }
    try { mirrorSheet.replaceSync(out.join("\n")); } catch (_) { /* nothing mirrored: the states show the element's normal look as their base */ }
    installSheets();
  }

  /** Read how an element looks in the state being edited (its "before"), without a transition getting in the way. */
  function forcedRead(element, read) {
    const had = element.getAttribute(FORCE);
    const hadStyleAttr = element.hasAttribute("style");
    const transition = [element.style.getPropertyValue("transition"), element.style.getPropertyPriority("transition")];
    element.style.setProperty("transition", "none");
    element.setAttribute(FORCE, layer);
    try { return read(); } finally {
      if (had === null) element.removeAttribute(FORCE); else element.setAttribute(FORCE, had);
      if (transition[0]) element.style.setProperty("transition", transition[0], transition[1]); else element.style.removeProperty("transition");
      if (!hadStyleAttr && element.getAttribute("style") === "") element.removeAttribute("style");   // leave no empty style attribute behind
    }
  }
  /** Run something as if a layer were being edited, without the side effects of switching. */
  function withLayer(which, run) {
    const before = [layer, changes];
    layer = which;
    changes = layers[which];
    try { return run(); } finally { [layer, changes] = before; }
  }
  /** Text and structure are the same in every state: those edits go to the normal layer. */
  function ensureNormal() { if (layer !== "normal") setLayer("normal"); }

  function syncForce() {
    const want = on && layer !== "normal" ? new Set(selection.filter((el) => el.isConnected)) : new Set();
    for (const element of [...forced]) { if (!want.has(element)) { element.removeAttribute(FORCE); forced.delete(element); } }
    for (const element of want) { if (element.getAttribute(FORCE) !== layer) element.setAttribute(FORCE, layer); forced.add(element); }
  }
  function setLayer(next) {
    if (next === layer) return;
    layer = next;
    changes = layers[next];
    lastEdit = { kind: "", elements: [], at: 0 };   // an edit in one state never merges into one in another
    if (next !== "normal") buildMirror();
    syncForce();
    renderDock();
    refreshBoxes();
  }
  refreshHooks.push(syncForce);
  offHooks.push(() => { layer = "normal"; changes = layers.normal; syncForce(); });

  /** The state switch, at the top of the tools. */
  function stateRow() {
    return h("div", { class: "dz-menu dz-states", role: "radiogroup", "aria-label": "State being edited" },
      h("span", { class: "dz-hint", text: "State:" }),
      ...["normal", ...STATES].map((name) => h("button", {
        type: "button", role: "radio", class: "dz-menu-button" + (layer === name ? " dz-active" : ""), text: name, "aria-checked": String(layer === name),
        title: name === "normal" ? "Edit the element as it is" : `Edit how it looks on :${name}. It is shown while you edit; the page's own :${name} look is the starting point.`,
        onclick: () => setLayer(name) })));
  }
