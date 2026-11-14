  // ---------- the site sheet: what "Keep on this site" saves ----------
  // The edits made in this session, written as CSS rules instead of per-element records, so that a small loader (extension/apply.js) can put them back
  // at document_start on every page of the site, without the picker. Only style edits can be kept this way: text edits, structure changes and edits of
  // elements that are not on the page right now are counted but left out.
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
    const skipped = { text: 0, structure: ops.length + pendingOps.length, notOnPage: pending.length + STATES.reduce((sum, state) => sum + pendingStates[state].length, 0) };
    const groups = new Map();   // "state|declarations" -> the elements that got them
    for (const which of ["normal", ...STATES]) {
      for (const [element, rec] of layers[which]) {
        if (!element.isConnected || ours(element) || !hasChange(rec)) continue;
        if (rec.text && rec.text.after !== rec.text.before) skipped.text += 1;
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
    return { rules, skipped };
  }
  function keepOnSite() {
    if (!host.keep) { showToast("Keeping changes needs the extension."); return; }
    const sheet = siteSheet();
    if (!sheet.rules.length) { showToast("Nothing to keep yet: change a style first."); return; }
    host.keep(sheet).then((answer) => showToast((answer && answer.message) || "Could not keep the changes."), () => showToast("Could not keep the changes."));
  }
