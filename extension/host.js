// The extension's side of the picker's host (see "where it runs" at the top of designer.js). It runs in the page's isolated world
// before designer.js and supplies window.__designerHost: edits kept in chrome.storage (per site and page, out of reach of the page's
// own scripts), the picker's UI in a closed-off Shadow DOM (the page's CSS cannot touch it, and its CSS stays out of the page),
// no design patches (those belong to the game's server), and previews through the background worker.
(() => {
  if (window.__designerHostInstalled) return;
  window.__designerHostInstalled = true;

  // Replaced by scripts/build.mjs with the edition being built (the designer edition when this file is used as it stands).
  const EDITION = /*edition*/ { name: "designer", features: {} } /*end*/;
  const key = "dz-changes:" + location.origin + location.pathname;
  const siteKey = "site:" + location.origin;   // what was kept for this site (see "kept sites" in background.js)
  const cache = { edits: null, tour: null, prefs: {}, kept: null };   // tour: the version of the tutorial last seen (older builds stored "done")
  let preview = false;

  // Writing the session to storage: see writeEdits below.
  const WRITE_DELAY = 400;
  let writeTimer = null;
  let dirty = false;
  let warnedFull = false;
  const isFull = (error) => /quota/i.test(String((error && error.message) || error));
  const FULL_MESSAGE = "The browser's storage for this extension is full, so your latest changes are not saved for next time. They still work in this tab. Copy them with Export, then remove sites you no longer need under the extension's Options.";
  function flushEdits() {
    clearTimeout(writeTimer);
    if (!dirty) return;
    dirty = false;
    const value = cache.edits;
    const done = value === null ? chrome.storage.local.remove(key) : chrome.storage.local.set({ [key]: value });
    done.then(() => { warnedFull = false; }, (error) => {
      if (!window.__designerHost || !window.__designerHost.onSaveFailed) return;
      if (isFull(error)) { if (!warnedFull) { warnedFull = true; window.__designerHost.onSaveFailed(FULL_MESSAGE); } }   // once, not on every edit
      else window.__designerHost.onSaveFailed("Your latest changes could not be saved for next time (they still work in this tab).");
    });
  }
  addEventListener("pagehide", flushEdits);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushEdits(); });

  // designer.js waits for this before it starts, so its reads of saved edits can stay synchronous.
  const ready = Promise.all([
    chrome.storage.local.get([key, "dz-tour", "dz-prefs", siteKey]).then((stored) => { cache.kept = stored[siteKey] ?? null; cache.edits = stored[key] ?? null; cache.tour = stored["dz-tour"] ?? null; cache.prefs = stored["dz-prefs"] || {}; }),
    chrome.runtime.sendMessage({ type: "who" }).then((answer) => { preview = !!(answer && answer.preview); }).catch(() => { /* no worker: not a preview */ }),
  ]);

  const shadowHost = document.createElement("div");
  shadowHost.id = "design-picker-extension-root";
  shadowHost.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
  const shadow = shadowHost.attachShadow({ mode: "open" });

  window.__designerHost = {
    ready,
    edition: EDITION.name,
    features: EDITION.features,
    storageKey: () => key,
    readEdits: () => cache.edits,
    // Every edit saves the whole session. Writing it to storage each time made a session of N edits write N times N bytes (394 MB for
    // 1,000 edits), so the write waits until the edits pause (and happens at once when the page is hidden or closed). What this tab
    // reads back is always the latest, because it comes from `cache`.
    writeEdits(_key, value) {
      cache.edits = value;
      dirty = true;
      clearTimeout(writeTimer);
      writeTimer = setTimeout(flushEdits, WRITE_DELAY);
    },
    flushEdits() { flushEdits(); },
    onEditsChanged(_key, callback) {   // a preview window hears about edits made in the page it mirrors
      chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes[key]) callback(); });
    },
    tourSeen: (version) => cache.tour === version,
    markTourSeen(version) { cache.tour = version; chrome.storage.local.set({ "dz-tour": version }); },
    patches: null,
    takeGuide: () => false,
    getPref: (name) => cache.prefs[name] ?? null,
    setPref(name, value) { cache.prefs[name] = value; chrome.storage.local.set({ "dz-prefs": cache.prefs }); },
    isPreview: () => preview,
    reportOn: (on) => { chrome.runtime.sendMessage({ type: "on", on, origin: location.origin }).catch(() => { /* no worker */ }); },
    openPreview: (width, height) => chrome.runtime.sendMessage({ type: "preview", url: location.href, width, height })
      .then((answer) => (answer && answer.error) || true),   // a string is shown to the designer as a message
    kept: {   // the rules kept for this site: read, switched on or off, removed one by one (the worker does the writing)
      get: () => cache.kept,
      onChange(callback) { chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes[siteKey]) { cache.kept = changes[siteKey].newValue ?? null; callback(); } }); },
      remove: (rule) => chrome.runtime.sendMessage({ type: "keep-remove", s: rule }),
      setEnabled: (enabled) => chrome.runtime.sendMessage({ type: "keep-enable", enabled }),
      removePreset: () => chrome.runtime.sendMessage({ type: "keep-remove-preset" }),
      repick: (rule, patch) => chrome.runtime.sendMessage({ type: "keep-repick", s: rule, b: patch.b, from: patch.from }),
    },
    keep: (sheet) => chrome.runtime.sendMessage({ type: "keep", rules: sheet.rules, skipped: sheet.skipped, presets: sheet.presets }),   // the worker names the site itself, from the tab
    capture: () => chrome.runtime.sendMessage({ type: "capture" }).then((answer) => {
      if (answer && answer.dataUrl) return answer.dataUrl;
      throw new Error((answer && answer.error) || "no picture came back");
    }),
    mount(root) {
      const sheet = new CSSStyleSheet();   // a constructed sheet: not blocked by the page's content security policy
      sheet.replaceSync(window.__designerCss || "");
      shadow.adoptedStyleSheets = [sheet];
      shadow.append(root);
      document.documentElement.append(shadowHost);
      // The top layer (the popover attribute, as VisBug does) puts the picker above everything on the page, a modal dialog's backdrop included,
      // which no z-index can do.
      try { shadowHost.popover = "manual"; shadowHost.showPopover(); } catch (_) { /* an older browser: the z-index has to do */ }
      // A modal dialog makes everything outside it inert and is drawn over anything opened before it, so while one is open the picker lives inside
      // it (still in the top layer, and now neither covered nor inert), and goes back to the page when the dialog closes.
      const rehome = () => {
        const modal = [...document.querySelectorAll("dialog[open]")].find((d) => { try { return d.matches(":modal"); } catch (_) { return false; } });
        const home = modal || document.documentElement;
        if (shadowHost.parentNode === home) return;
        try { shadowHost.hidePopover(); } catch (_) { /* not shown */ }
        home.append(shadowHost);
        try { shadowHost.showPopover(); } catch (_) { /* an older browser */ }
      };
      new MutationObserver(rehome).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["open"] });
      rehome();
    },
    isOwn: (node) => node === shadowHost,
  };

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!message) return false;
    if (message.type === "ping") { respond(true); return false; }   // the worker asks whether the picker is already in the page
    if (message.type === "toggle") ready.then(() => { if (window.__designerApi) window.__designerApi.toggle(); });
    if (message.type === "set") ready.then(() => { if (window.__designerApi) window.__designerApi.set(!!message.on); });
    return false;
  });
})();
