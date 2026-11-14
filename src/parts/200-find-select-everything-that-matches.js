  // ---------- find: select everything that matches ----------
  // A CSS selector (.card, h2, button[disabled]) or, failing that, words that appear on the page. The matches become the selection, so one
  // tool then changes all of them. An idea from VisBug (Apache-2.0, github.com/GoogleChromeLabs/ProjectVisBug), written afresh here.
  const FIND_LIMIT = 300;
  function findMatches(query) {
    const q = query.trim();
    if (!q) return [];
    let found = [];
    try { found = [...document.querySelectorAll(q)]; } catch (_) { /* not a selector: it is words */ }
    if (!found.length) {
      const needle = q.toLowerCase();
      found = [...document.body.querySelectorAll("*")].filter((el) => !ours(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.toLowerCase().includes(needle)));
    }
    return found.filter((el) => !ours(el) && el !== document.documentElement && el.getBoundingClientRect().width > 0).slice(0, FIND_LIMIT);
  }
  function findPanel() {
    const input = h("input", { type: "search", class: "dz-hex dz-find", "aria-label": "Find elements", placeholder: ".card   h2   or some words", spellcheck: "false" });
    const count = h("p", { class: "dz-hint dz-note", text: "Selects every match. Try .card, button, img:not([alt]), or words from the page." });
    const update = () => {
      const matches = findMatches(input.value);
      setSelection(matches);
      count.textContent = input.value.trim() ? `${matches.length} found${matches.length >= FIND_LIMIT ? ` (the first ${FIND_LIMIT})` : ""}` : "Selects every match. Try .card, button, img:not([alt]), or words from the page.";
      refreshBoxes();
    };
    const useThem = () => { if (!selection.length) return; showFind = false; showClasses = false; menuOpen = true; renderDock(); refreshBoxes(); };
    input.addEventListener("input", update);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); useThem(); } });
    return h("div", { class: "dz-panel" }, input, count,
      h("div", { class: "dz-menu" }, h("button", { type: "button", class: "dz-menu-button dz-active", text: "Edit these", onclick: useThem })));
  }
