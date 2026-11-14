  // ---------- where it runs ----------
  // Everything that depends on the place the picker runs in goes through `host`. These defaults are a plain page (edits in localStorage,
  // the UI in the page's body). The Chrome extension (extension/host.js) sets window.__designerHost before this file runs to replace any of
  // them: chrome.storage, a mount point of its own (a Shadow DOM), previews through its service worker, and so on.
  const host = Object.assign({
    storageKey: () => "alchemy-designer-changes:" + location.pathname,
    readEdits(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    writeEdits(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) { /* full or blocked: edits still work in this tab */ } },
    onEditsChanged(key, callback) { window.addEventListener("storage", (event) => { if (event.key === key || event.key === null) callback(); }); },
    tourSeen(version) { try { return localStorage.getItem("alchemy-designer-tour") === version; } catch (_) { return false; } },   // the tutorial is shown again when its version changes
    markTourSeen(version) { try { localStorage.setItem("alchemy-designer-tour", version); } catch (_) { /* shows again next time */ } },
    getPref(name) { try { return localStorage.getItem("design-picker-pref:" + name); } catch (_) { return null; } },   // a setting that outlives the page
    setPref(name, value) { try { localStorage.setItem("design-picker-pref:" + name, value); } catch (_) { /* not remembered */ } },
    reportOn() {},   // (on) => the picker was turned on or off: the extension remembers it for this tab
    isPreview: () => window.name === "dz-preview",
    openPreview(width, height) {   // true if a window opened
      const win = window.open(location.href, "dz-preview", `popup,width=${width},height=${height}`);
      if (!win) return false;
      win.focus();
      setTimeout(() => {   // make the inside of the window, not its frame, the size asked for
        try { win.resizeTo(width + (win.outerWidth - win.innerWidth), height + (win.outerHeight - win.innerHeight)); } catch (_) { /* not allowed: it stays as opened */ }
      }, 500);
      return true;
    },
    capture: null,   // () => a promise of a PNG data URL of the visible tab: only the extension can
    features: {},   // {name: false} turns a feature off: find, inspector, compare, preview, measure, export (all on unless an edition says otherwise)
    mount(root) { document.body.append(root); },
    isOwn: () => false,   // a node outside the root that is still the picker's (the extension's shadow host)
  }, pre || {});
  /** Is this feature part of this edition of the picker? Everything is, unless the host switched it off (see the editions in scripts/build.mjs). */
  const has = (name) => !host.features || host.features[name] !== false;
