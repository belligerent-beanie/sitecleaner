  // ---------- preview at other screen sizes ----------
  // Opens this page in a real browser window of that size (so its media queries really run). That window, named dz-preview,
  // shows no picker: it puts the same saved edits on the page, and reloads when they change here (the storage event).
  const PREVIEW = host.isPreview();
  const PREVIEW_SIZES = [["Phone", 390, 844], ["Tablet", 820, 1180], ["Laptop", 1280, 800]];
  function openPreview(width, height) {
    // true or false straight away (the game's pages), or a promise of true or a message to show (the extension)
    Promise.resolve(host.openPreview(width, height)).then((result) => {
      if (result === false) showToast("The browser blocked the window: allow pop-ups for this site, then try again.");
      else if (typeof result === "string") showToast(result);
    });
  }
  function previewPanel() {
    return h("div", { class: "dz-panel" },
      h("p", { class: "dz-hint", text: "Opens this page in a window of that size, with your edits on it. It updates when you change something here. Fixed sizes you set show how they hold up." }),
      h("div", { class: "dz-menu" }, ...PREVIEW_SIZES.map(([name, width, height]) =>
        h("button", { type: "button", class: "dz-menu-button", title: `${width} × ${height}`, text: `${name} ${width}`, onclick: () => openPreview(width, height) }))));
  }
  function startPreviewMode() {
    const badge = h("div", { class: "dz-badge dz-size-badge" });
    const show = () => { badge.textContent = `Preview ${window.innerWidth} × ${window.innerHeight}`; };
    show();
    window.addEventListener("resize", show);
    host.mount(h("div", { class: "dz-root", "data-designer": "" }, badge));
    restore();
    let timer = 0;
    host.onEditsChanged(STORE_KEY, () => {
      clearTimeout(timer);
      timer = setTimeout(() => location.reload(), 300);
    });
  }
