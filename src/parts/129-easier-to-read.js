  // ---------- the "easier to read" settings (the consumer edition) ----------
  // Text size, the smallest text allowed, spacing, a plain font, underlined links, a strong focus ring, calm motion, bigger buttons and low-contrast
  // text fixed. The work is done by extension/readable.js (window.__scReadable), which the loader also uses on kept sites, so what is seen here
  // while the panel is open is exactly what comes back on the next visit. Settings live in the kept entry of the site, beside the rules.
  const readable = () => window.__scReadable || null;
  const ACCESS_FLAGS = [
    ["spacing", "More space between lines and words", "Easier to follow a line of text"],
    ["font", "A plain, easy-to-read font", "Not on icons or code"],
    ["links", "Underline every link", "Links are not only a colour"],
    ["focus", "A strong outline on what the keyboard is on", "Shows where Tab has got to"],
    ["motion", "Calm motion", "Almost no animation or sliding"],
    ["buttons", "Bigger buttons", "At least 44 pixels, easier to hit"],
    ["contrast", "Fix text that is hard to read", "Only on plain backgrounds, never over pictures"],
    ["highlight", "Highlight what you point at or tab to", "A solid background behind it, easy to read and to follow with a screen magnifier or reader"],
    ["dark", "Dark mode", "Dark background, light text; pictures stay as they are. Pages that are dark already are left alone"],
  ];
  let accessOpts = null;   // what the panel shows
  let accessTimer = 0;
  let accessStatus = null;
  const keptAccess = () => { const kept = host.kept && host.kept.get(); return kept && kept.presets && kept.presets.access ? kept.presets.access : null; };
  const sameAccess = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function openAccess() {
    const engine = readable();
    if (!engine) { showToast("This needs the extension's reading settings, which did not load."); return; }
    accessOpts = { ...engine.defaults, ...(keptAccess() || engine.current() || {}) };
    showAccess = true; showChanges = false; showFind = false; showPreview = false; showKeys = false; tourStep = null;
    renderDock();
  }
  function previewAccess() {
    clearTimeout(accessTimer);
    accessTimer = setTimeout(() => {
      const engine = readable();
      if (!engine) return;
      const stats = engine.apply(accessOpts);
      if (accessStatus) accessStatus.textContent = [accessOpts.dark && stats.darkSkipped ? "This page is dark already, so dark mode was not added." : "",
        accessOpts.contrast ? `Fixed ${stats.contrast} pieces of text that were hard to read; ${stats.unsure} left alone because their background could not be judged.` : ""].filter(Boolean).join(" ");
    }, 120);
  }
  function accessPanel() {
    const engine = readable();
    const panel = h("div", { class: "dz-panel dz-access", role: "group", "aria-label": "Easier to read" });
    const scale = h("input", { type: "range", min: "100", max: "200", step: "10", value: String(Math.round(accessOpts.textScale * 100)), "aria-label": "Text size, percent" });
    const scaleValue = h("span", { class: "dz-hint", text: Math.round(accessOpts.textScale * 100) + "%" });
    scale.addEventListener("input", () => { accessOpts.textScale = Number(scale.value) / 100; scaleValue.textContent = scale.value + "%"; previewAccess(); });
    panel.append(h("label", { class: "dz-row" }, h("span", { text: "Text size" }), scale, scaleValue));
    const min = h("select", { "aria-label": "Smallest text allowed" }, ...[[0, "No minimum"], [12, "12 px"], [14, "14 px"], [16, "16 px"], [18, "18 px"]].map(([value, text]) => h("option", { value: String(value), text })));
    min.value = String(accessOpts.minText);
    if (min.value !== String(accessOpts.minText)) min.value = "0";
    min.addEventListener("change", () => { accessOpts.minText = Number(min.value); previewAccess(); });
    panel.append(h("label", { class: "dz-row" }, h("span", { text: "Smallest text" }), min));
    for (const [name, label, hint] of ACCESS_FLAGS) {
      const box = h("input", { type: "checkbox", title: hint });
      box.checked = !!accessOpts[name];
      box.addEventListener("change", () => { accessOpts[name] = box.checked; previewAccess(); });
      panel.append(h("label", { class: "dz-row", title: hint }, box, h("span", { text: label })));
    }
    accessStatus = h("p", { class: "dz-hint", role: "status" });
    panel.append(accessStatus);
    const kept = keptAccess();
    panel.append(h("div", { class: "dz-menu" },
      h("button", { type: "button", class: "dz-menu-button dz-active", text: kept ? "Keep these settings" : "Keep on this site", title: "Have these settings on this site every time you visit",
        onclick: () => {
          if (!ACCESS_FLAGS.some(([name]) => accessOpts[name]) && accessOpts.textScale === 1 && !accessOpts.minText) { showToast("Turn something on first."); return; }
          engine.apply(accessOpts);   // so what is kept is exactly what is on the page
          host.keep({ rules: [], skipped: { text: 0, structure: 0, notOnPage: 0 }, presets: { access: { ...accessOpts } } })
            .then((answer) => showToast((answer && answer.message) || "Could not keep the settings."), () => showToast("Could not keep the settings."));
        } }),
      h("button", { type: "button", class: "dz-menu-button", text: "Reset", title: kept ? "Back to what is kept" : "Turn everything off",
        onclick: () => { accessOpts = { ...engine.defaults, ...(kept || {}) }; engine.apply(kept); renderDock(); } }),
      kept && h("button", { type: "button", class: "dz-menu-button", text: "Stop keeping", title: "Remove these settings from this site (the page changes back when you reload)",
        onclick: () => { host.kept.removePreset(); engine.apply(null); accessOpts = { ...engine.defaults }; renderDock(); } })));
    panel.append(h("p", { class: "dz-hint", text: kept ? "Kept on this site: " + engine.describe(kept) + "." : "Changes show on the page as you make them. Press Keep to have them on this site every time." }));
    previewAccess();
    return panel;
  }
