  // ---------- the site sheet: what "Keep on this site" saves ----------
  // The edits made in this session, written as CSS rules instead of per-element records, so that a small loader (extension/apply.js) can put them back
  // at document_start on every page of the site, without the picker. What can be kept: style edits, deleting an element (a rule that hides it) and
  // retyped text (replayed by the loader only while the element still says what it said before). What cannot: moving, duplicating, grouping, pasting
  // and replacing pictures (they rebuild the page's structure, which a loader cannot do safely on a page that redraws itself), and edits of elements
  // that are not on the page right now. Those are counted and left out.
  // Every declaration is written !important. An inline style (which is how the picker applies an edit) beats any site rule that is not !important,
  // whatever its specificity; a rule in a sheet only does so with !important.
  /** Elements that were changed alike are one rule when one class of theirs names exactly that set; otherwise each is named by selectorFor. */
  function commonSelector(group) {
    const first = group[0];
    const shared = [...first.classList].filter((c) => !hashed(c) && group.every((el) => el.classList.contains(c)));
    const tag = group.every((el) => el.tagName === first.tagName) ? first.tagName.toLowerCase() : "";
    const tries = [...shared.map((c) => tag + "." + cssEscape(c)), ...(shared.length > 1 ? [tag + shared.map((c) => "." + cssEscape(c)).join("")] : [])];
    for (const candidate of tries) {
      try {
        const found = document.querySelectorAll(candidate);
        if (found.length === group.length && [...found].every((el) => group.includes(el))) return candidate;
      } catch (_) { /* not a selector the browser takes */ }
    }
    return "";
  }
  function siteSheet() {
    const removed = ops.filter((op) => op.desc.type === "remove" && op.desc.selector);
    const skipped = { text: 0, structure: ops.length - removed.length + pendingOps.length, notOnPage: pending.length + STATES.reduce((sum, state) => sum + pendingStates[state].length, 0) };
    const groups = new Map();   // "state|declarations" -> the elements that got them
    const texts = [];
    for (const which of ["normal", ...STATES]) {
      for (const [element, rec] of layers[which]) {
        if (!element.isConnected || ours(element) || !hasChange(rec)) continue;
        if (which === "normal" && rec.text && rec.text.after.trim() !== rec.text.before.trim() && rec.selector) texts.push({ k: "text", s: "text:" + rec.selector, b: rec.selector, from: rec.text.before, to: rec.text.after });
        const style = peekStyle(element, which);
        if (!style) continue;
        const declarations = [...rec.props.keys()].map((prop) => [prop, style.getPropertyValue(prop)]).filter(([, value]) => value).map(([prop, value]) => `${prop}:${value.replace(/\s*!important\s*$/i, "")} !important`);
        if (!declarations.length) continue;
        const state = which === "normal" ? "" : which;
        const key = state + "|" + declarations.join(";");
        if (!groups.has(key)) groups.set(key, { state, d: declarations.join(";"), elements: [] });
        groups.get(key).elements.push(element);
      }
    }
    const rules = [];
    for (const { state, d, elements } of groups.values()) {
      const named = elements.length > 1 ? commonSelector(elements) : "";
      const bases = named ? [named] : elements.map((el) => selectorFor(el)).filter(Boolean);
      for (const b of new Set(bases)) rules.push({ s: state ? `${b}:${state}` : b, b, d });   // b: the selector without the state, which is what must match something
    }
    for (const op of removed) rules.push({ s: op.desc.selector, b: op.desc.selector, d: "display:none !important" });
    return { rules: [...rules, ...texts], skipped };
  }
  function keepOnSite() {
    if (!host.keep) { showToast("Keeping changes needs the extension."); return; }
    const sheet = siteSheet();
    if (!sheet.rules.length) { showToast("Nothing to keep yet: change a style first."); return; }
    host.keep(sheet).then((answer) => showToast((answer && answer.message) || "Could not keep the changes."), () => showToast("Could not keep the changes."));
  }
  /** One kept rule, in words a person can read in a list. */
  function describeKept(rule) {
    if (rule.k === "text") return `Text “${shorten(rule.from.trim(), 22)}” → “${shorten(rule.to.trim(), 22)}”`;
    if (/^display:\s*none/.test(rule.d)) return `Hidden: ${shorten(rule.b, 40)}`;
    const what = rule.d.split(";").map((part) => part.replace(/\s*!important\s*$/i, "").replace(":", " ")).slice(0, 3).join(", ");
    return `${shorten(rule.s, 36)}: ${shorten(what, 48)}`;
  }
  // A kept rule whose element is gone from the page (the site changed) can be pointed at another one: Re-pick, then click the element it should apply to.
  let keptIntro = false;   // the first time anything is kept, the My changes panel opens with a note on where it goes from there
  let repicking = null;   // the rule being re-picked
  function startRepick(rule) {
    repicking = rule;
    showChanges = false; showAccess = false;
    renderDock();
    showToast(rule.k === "text" ? "Click the element that now holds this text. Esc cancels." : "Click the element this change should apply to. Esc cancels.");
  }
  function finishRepick(rule, element) {
    const b = element && !ours(element) && element !== document.documentElement ? selectorFor(element) : "";
    if (!b || /[{}]/.test(b)) { showToast("Pick an element on the page."); return; }
    host.kept.repick(rule.s, { b, from: rule.k === "text" ? element.textContent : undefined })
      .then((answer) => { showToast(answer && answer.ok ? "Done: the change now applies there." : "Could not move that change."); }, () => showToast("Could not move that change."));
  }
