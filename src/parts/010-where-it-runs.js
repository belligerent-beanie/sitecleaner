  // ---------- where it runs ----------
  // Everything that depends on the place the picker runs in goes through `host`. These defaults are the game's own pages (edits in
  // localStorage, patches from the server, a guide on the Guides page). The Chrome extension (extension/) sets window.__designerHost
  // before this file runs to replace any of them: chrome.storage, no patches, its own mount point (a Shadow DOM), and so on.
  const host = Object.assign({
    storageKey: () => "alchemy-designer-changes:" + location.pathname,
    readEdits(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    writeEdits(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) { /* full or blocked: edits still work in this tab */ } },
    onEditsChanged(key, callback) { window.addEventListener("storage", (event) => { if (event.key === key || event.key === null) callback(); }); },
    tourSeen() { try { return localStorage.getItem("alchemy-designer-tour") === "done"; } catch (_) { return false; } },
    markTourSeen() { try { localStorage.setItem("alchemy-designer-tour", "done"); } catch (_) { /* shows again next time */ } },
    patches: typeof Auth !== "undefined" ? {
      list: () => Auth.fetch("/patches/list").then((data) => data.patches),
      set: (name, state) => Auth.fetch("/patches/set", { name, state }).then((data) => data.patches),
      reload() {   // pick up /patches.css again, so a style patch shows (or goes) without reloading the page
        const link = document.querySelector('link[rel="stylesheet"][href^="/patches.css"]');
        if (link) link.href = "/patches.css?t=" + Date.now();
      },
    } : null,
    takeGuide: (name) => typeof takeGuide === "function" && takeGuide(name),
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
    mount(root) { document.body.append(root); },
    isOwn: () => false,   // a node outside the root that is still the picker's (the extension's shadow host)
  }, pre || {});
