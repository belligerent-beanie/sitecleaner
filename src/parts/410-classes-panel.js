  // ---------- the classes of the page ----------
  // A list of the classes the page's style sheets define: how many elements use each, which file defines it, and the rules themselves; a click selects every
  // element that has the class. Most pages are built from shared classes, and this is the way to see and reach them without hunting for an instance.
  let classCache = null;     // [{name, count, files, rules}], built when the panel is opened (or refreshed): reading every style sheet is not free
  let classFilter = "";
  let classUnused = false;   // also list classes no element has
  let classBlocked = [];     // the style sheets the browser would not let us read (another site's), by name: the reason some classes have no rules to show
  const CLASS_SHOWN = 80;    // rows drawn at once; the filter finds the rest
  const LINE = String.fromCharCode(10);

  /** Every rule inside a grouping rule: @media, @supports, @layer, @container, and the nested rules of a style rule. (rule.type is 0 for the newer ones, so look for cssRules.) */
  const innerRules = (rule) => (rule.cssRules ? [...rule.cssRules] : []);
  function buildClassIndex() {
    const byName = new Map();
    const entryFor = (name) => { let e = byName.get(name); if (!e) byName.set(name, e = { name, files: new Set(), rules: [], count: 0 }); return e; };
    const visit = (rules, file) => {
      for (const rule of rules) {
        try {
          if (rule.selectorText) {
            const seen = new Set();
            for (const match of rule.selectorText.replace(/\[[^\]]*\]/g, "").matchAll(/\.((?:\\.|[\w-])+)/g)) {   // attribute values such as [href$=".pdf"] are not classes
              const name = match[1].replace(/\\(.)/g, "$1");
              if (seen.has(name) || hashed(name)) continue;   // generated names change with every build: of no use to name
              seen.add(name);
              const entry = entryFor(name);
              entry.files.add(file);
              entry.rules.push({ file, selector: rule.selectorText, text: rule.style.cssText });
            }
          }
          visit(innerRules(rule), file);
        } catch (_) { /* a rule the browser will not let us read */ }
      }
    };
    classBlocked = [];
    for (const sheet of document.styleSheets) { try { visit(sheet.cssRules, sheetName(sheet)); } catch (_) { classBlocked.push(sheetName(sheet)); /* another origin's style sheet: its classes still show below, from the elements that have them */ } }
    // What the elements have: the count of each class, and the classes whose rules could not be read (another site's style sheet, a script)
    const used = new Map();
    for (const element of document.querySelectorAll("[class]")) {
      if (ours(element)) continue;
      for (const name of element.classList) { if (!hashed(name)) used.set(name, (used.get(name) || 0) + 1); }
    }
    for (const [name, count] of used) entryFor(name).count = count;
    const entries = [...byName.values()];
    for (const entry of entries) entry.unreadable = entry.count > 0 && !entry.rules.length;
    return entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  function classesPanel() {
    if (!classCache) classCache = buildClassIndex();
    const panel = h("div", { class: "dz-panel dz-classes" });
    const summary = h("p", { class: "dz-hint" });
    const list = h("div", { class: "dz-class-list" });
    const filter = h("input", { type: "text", class: "dz-text dz-class-filter", placeholder: "Filter classes", "aria-label": "Filter classes", spellcheck: "false" });
    filter.value = classFilter;
    const unused = h("input", { type: "checkbox", id: "dz-class-unused" });
    unused.checked = classUnused;
    const fill = () => {
      const needle = classFilter.trim().replace(/^\./, "").toLowerCase();
      const all = classCache.filter((entry) => (classUnused || entry.count > 0) && entry.name.toLowerCase().includes(needle));
      const inUse = classCache.filter((entry) => entry.count > 0).length;
      const blind = classCache.filter((entry) => entry.unreadable).length;
      summary.textContent = `${inUse} classes in use, ${classCache.length - inUse} defined but not used on this page.${blind ? ` For ${blind} of the ones in use the rules cannot be shown${classBlocked.length ? `: the browser does not let the picker read ${classBlocked.length === 1 ? "this style sheet from another site" : "these style sheets from other sites"} (${[...new Set(classBlocked)].slice(0, 3).join(", ")}${new Set(classBlocked).size > 3 ? ", …" : ""})` : " (set by a script, or in a style sheet the browser keeps closed)"}. They still work here: click one to select its elements and restyle them; only the original rules are missing from the list and the export.` : ""} Click one to select every element that has it.`;
      list.replaceChildren();
      for (const entry of all.slice(0, CLASS_SHOWN)) {
        const rule = h("pre", { class: "dz-preview dz-class-rule", hidden: true, tabindex: "0", role: "region", "aria-label": `Rules for .${entry.name}`,
          text: entry.rules.slice(0, 6).map((r) => [r.file, `${r.selector} { ${shorten(r.text, 220)} }`].join(LINE)).join(LINE + LINE)
            + (entry.rules.length > 6 ? LINE + LINE + `… ${entry.rules.length - 6} more rules` : "") });
        const toggle = entry.rules.length ? h("button", { type: "button", class: "dz-link", text: "Rules", "aria-expanded": "false", "aria-label": `Show the rules for .${entry.name}`,
          onclick: () => { rule.hidden = !rule.hidden; toggle.setAttribute("aria-expanded", String(!rule.hidden)); } }) : null;
        const name = h("button", { type: "button", class: "dz-link dz-class-name", text: "." + entry.name, disabled: !entry.count,
          title: entry.count ? `Select the ${entry.count} element${entry.count > 1 ? "s" : ""} with this class` : "No element on this page has this class",
          onclick: () => {
            setSelection(pageMatches("." + cssEscape(entry.name)).slice(0, 500));
            climbed = [];
            menuOpen = true;
            renderDock();
            refreshBoxes();
          } });
        list.append(h("div", { class: "dz-class" },
          h("div", { class: "dz-class-row" }, name, h("span", { class: "dz-num", text: `×${entry.count}` }), ...(toggle ? [toggle] : [])),
          h("p", { class: "dz-hint dz-class-file", text: entry.files.size ? [...entry.files].join(", ") : classBlocked.length ? "rules not shown: they are probably in a style sheet from another site" : "rules not shown: set by a script, or in a style sheet the browser keeps closed" }), ...(toggle ? [rule] : [])));
      }
      if (all.length > CLASS_SHOWN) list.append(h("p", { class: "dz-hint", text: `… and ${all.length - CLASS_SHOWN} more: type to narrow the list.` }));
      if (!all.length) list.append(h("p", { class: "dz-hint", text: classCache.length ? "No class matches." : "This page's style sheets define no classes that can be read." }));
    };
    filter.addEventListener("input", () => { classFilter = filter.value; fill(); });
    unused.addEventListener("change", () => { classUnused = unused.checked; fill(); });
    panel.append(h("div", { class: "dz-row" }, filter),
      h("label", { class: "dz-row dz-class-unused" }, unused, h("span", { text: "Also classes no element uses" }),
        h("button", { type: "button", class: "dz-link", text: "Refresh", title: "Read the page's style sheets again",
          onclick: (event) => { event.preventDefault(); classCache = null; renderDock(); } })),
      summary, list);
    fill();
    return panel;
  }
