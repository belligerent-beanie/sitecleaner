// The loader for kept sites. The service worker registers it (at document_start) only for sites the user chose to keep changes on, and only
// while the permission for that site is still granted. It does one thing: put the site's saved rules on the page as a style sheet, before the
// page paints. No picker, no history. Rules whose selector no longer matches anything (the site changed) are reported, never hidden.
// A rule is {s, b, d} (a style rule: selector, selector without state, declarations; deleting an element is one that hides it) or
// {k: "text", s, b, from, to} (retyped text).
(() => {
  if (window.__siteCleanerLoader) return;
  window.__siteCleanerLoader = true;
  const key = "site:" + location.origin;
  const sheet = new CSSStyleSheet();   // a constructed sheet: the page's content security policy cannot refuse it
  let entry = null;

  const normal = (text) => String(text).replace(/\s+/g, " ").trim();
  const find = (selector) => { try { return document.querySelector(selector); } catch (_) { return null; } };

  // Retyped text is put back only while the element still says what it said when the change was made, so a page whose content has moved on (a new
  // headline in the same place) is never overwritten. Pages that draw themselves late or redraw are followed by a watcher, which does nothing
  // when there is nothing to change.
  let texts = [];
  let watcher = null;
  let timer = 0;
  function applyTexts() {
    for (const rule of texts) {
      const element = find(rule.b);
      if (element && !element.children.length && normal(element.textContent) === normal(rule.from) && element.textContent !== rule.to) element.textContent = rule.to;
    }
  }
  function watchTexts() {
    if (!texts.length) { if (watcher) { watcher.disconnect(); watcher = null; } return; }
    applyTexts();
    if (watcher) return;
    watcher = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(applyTexts, 150); });
    watcher.observe(document, { childList: true, characterData: true, subtree: true });
  }

  function apply() {
    const all = entry && entry.enabled && Array.isArray(entry.rules) ? entry.rules : [];
    const rules = all.filter((rule) => rule.k !== "text");
    texts = all.filter((rule) => rule.k === "text");
    watchTexts();
    sheet.replaceSync(rules.map((rule) => `${rule.s}{${rule.d}}`).join("\n"));   // a rule the browser cannot parse is dropped, not fatal
    const adopted = document.adoptedStyleSheets.includes(sheet);
    if (rules.length && !adopted) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];   // last: after the page's own sheets
    else if (!rules.length && adopted) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((other) => other !== sheet);
  }

  // Which rules match nothing on this page? Checked once the page is built and again a little after it has loaded (a script-built page draws late).
  function checkStale() {
    if (!entry || !entry.enabled || !Array.isArray(entry.rules)) return;
    const stale = [];
    for (const rule of entry.rules) {
      const element = find(rule.b);
      if (!element || (rule.k === "text" && normal(element.textContent) !== normal(rule.from) && normal(element.textContent) !== normal(rule.to))) stale.push(rule.b);
    }
    const before = Array.isArray(entry.stale) ? entry.stale : [];
    const same = stale.length === before.length && stale.every((selector, i) => selector === before[i]);
    chrome.runtime.sendMessage({ type: "stale", count: stale.length }).catch(() => { /* no worker */ });
    if (same) return;
    chrome.storage.local.get(key).then((stored) => {   // one field is updated, on the latest copy
      if (stored[key]) chrome.storage.local.set({ [key]: { ...stored[key], stale } });
    }).catch(() => { /* the extension was reloaded under this page */ });
  }

  chrome.storage.local.get(key).then((stored) => {
    entry = stored[key] || null;
    apply();
    const later = () => { checkStale(); setTimeout(checkStale, 3000); };
    if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
  }).catch(() => { /* the extension was reloaded under this page */ });

  chrome.storage.onChanged.addListener((changes, area) => {   // switched on or off, or changed, from the options page or another tab
    if (area !== "local" || !changes[key]) return;
    entry = changes[key].newValue || null;
    apply();
  });
})();
