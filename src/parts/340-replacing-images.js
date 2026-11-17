
  // ---------- replacing images ----------
  // Adapted from VisBug (Apache-2.0, https://github.com/GoogleChromeLabs/ProjectVisBug), app/features/imageswap.js: drop an image file on an
  // <img>, a <picture> or an element with a background picture and it takes the picture's place (a <picture>'s sources and an <img>'s srcset
  // would hide the new one, so they are replaced too). Modified: a swap is recorded (undone, kept across reloads when the picture is small
  // enough, in the export with the file's name); there is an Image tool with a file chooser and an address field, and an image on the
  // clipboard can be pasted onto a selected image. Not taken over: dragging one image of the page onto another.
  const hasPicture = (el) => { const bg = getComputedStyle(el).backgroundImage; return !!bg && bg !== "none" && /url\(/i.test(bg); };
  /** The images in a list of elements: the <img>s and elements with a background picture, and the <img>s directly inside the others. */
  function imageTargetsOf(list) {
    const found = new Set();
    for (const el of list) {
      if (ours(el)) continue;
      if (el.tagName === "IMG" || hasPicture(el)) found.add(el);
      else for (const img of el.querySelectorAll(":scope > img, :scope > picture > img")) found.add(img);
    }
    return [...found];
  }
  /** Background pictures go through the same style path as every other edit. */
  function applyBackgroundOne(element, values) {
    checkpoint("background-image", element);
    const rec = record(element);
    for (const [prop, value] of Object.entries(values)) {
      rememberOriginal(rec, element, prop);
      setStyle(element, prop, value);
      rec.after = Object.assign(rec.after || {}, { [prop]: value });
    }
    edited();
  }
  const applyBackground = forAll(() => "background-image", applyBackgroundOne);
  /** Put `src` in the place of the pictures of `list`; label is what the export calls it (a file name or an address). */
  function swapImages(list, src, label) {
    const images = list.filter((el) => el.tagName === "IMG");
    const backgrounds = list.filter((el) => el.tagName !== "IMG" && hasPicture(el));
    const ops = [];
    for (const img of images) {
      ops.push(attrOp(img, "src", src, label));
      const parent = img.parentElement;
      const sources = parent && parent.tagName === "PICTURE" ? [...parent.children].filter((s) => s.tagName === "SOURCE" && (!s.media || window.matchMedia(s.media).matches)) : [];
      for (const source of sources) ops.push(attrOp(source, "srcset", src, label));
    }
    if (ops.length) doOps(ops);
    if (backgrounds.length) applyBackground(backgrounds, { "background-image": `url("${src.replace(/"/g, "%22")}")` });
    if (!ops.length && !backgrounds.length) showToast("Select an image, or an element with a background picture, first.");
    else showToast(`Replaced ${images.length + backgrounds.length > 1 ? images.length + backgrounds.length + " pictures" : "the picture"} with ${shorten(label, 40)}. Ctrl+Z undoes it.`);
    renderDock();
  }
  // A picture as the background of any element (not only one that has a picture already): cover, contain or tiled; undone, kept and exported like any edit.
  const bgFit = () => ({ cover: "cover", contain: "contain", tile: "tile" }[host.getPref("bgfit")] || "cover");
  const bgValues = (src) => { const fit = bgFit(); return { "background-image": `url("${src.replace(/"/g, "%22")}")`, "background-size": fit === "tile" ? "auto" : fit, "background-position": "center", "background-repeat": fit === "tile" ? "repeat" : "no-repeat" }; };
  function addBackground(list, src, label) {
    const els = list.filter((el) => el && el.nodeType === 1 && !ours(el) && el !== document.documentElement && el.tagName !== "IMG");
    if (!els.length) { showToast("Select an element to put the picture behind."); return; }
    applyBackground(els, bgValues(src));
    setSelection(els); climbed = [];
    showToast(`Set ${shorten(label, 30)} as the background of ${els.length > 1 ? els.length + " elements" : label_(els[0])}. Ctrl+Z undoes it.`);
    renderDock(); refreshBoxes();
  }
  const label_ = (el) => label(el);
  function clearBackground(list) {
    const els = list.filter((el) => el && el.nodeType === 1 && !ours(el) && hasPicture(el));
    if (!els.length) { showToast("Nothing to remove: no background picture here."); return; }
    applyBackground(els, { "background-image": "none" });
    showToast("Removed the background picture. Ctrl+Z puts it back.");
    renderDock(); refreshBoxes();
  }
  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  async function swapFromFiles(files, list) {
    const file = [...files].find((f) => /^image\//.test(f.type));
    if (!file) { showToast("That is not an image file."); return; }
    try { swapImages(list, await readAsDataUrl(file), file.name || "pasted image"); } catch (_) { showToast("The file could not be read."); }
  }

  // dropping a file: while the picker is on, an image file dropped on the page goes to the selected images, or the one under the pointer
  const dropBox = h("div", { class: "dz-box dz-drop", hidden: true });
  root.append(dropBox);
  const dropTargets = (event) => {
    const chosen = imageTargetsOf(selection);
    if (chosen.length) return chosen;
    let node = eventTarget(event);
    while (node && node.nodeType === 1 && node !== document.body) { if (node.tagName === "IMG" || hasPicture(node)) return [node]; node = node.parentElement; }
    return [];
  };
  const carriesFiles = (event) => !!event.dataTransfer && [...event.dataTransfer.types].includes("Files");
  window.addEventListener("dragover", (event) => {
    if (!on || !carriesFiles(event) || ours(eventTarget(event))) return;
    if (paletteFileOver(event)) return;   // the element palette is open: a file is a new picture, unless it is over a picture
    event.preventDefault();   // without this the browser would open the file instead
    const targets = dropTargets(event);
    place(dropBox, targets[0] || null);
  }, true);
  window.addEventListener("dragleave", (event) => { if (!event.relatedTarget) place(dropBox, null); }, true);
  window.addEventListener("drop", (event) => {
    place(dropBox, null);
    if (!on || !carriesFiles(event) || ours(eventTarget(event))) return;
    if (paletteFileDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    swapFromFiles(event.dataTransfer.files, dropTargets(event));
  }, true);

  function imagePanel() {
    const found = imageTargetsOf(selection);
    const note = h("p", { class: "dz-hint dz-note", text: found.length
      ? `This will replace ${found.length > 1 ? found.length + " pictures" : "the picture"} of ${selection.length > 1 ? "the selection" : label(selected)}. You can also drop an image file on the page, or paste an image (Ctrl+V).`
      : "Select an image, or an element with a background picture, first." });
    const file = h("input", { type: "file", accept: "image/*", class: "dz-file", "aria-label": "Choose an image file", disabled: !found.length });
    file.addEventListener("change", () => { if (file.files[0]) swapFromFiles(file.files, imageTargetsOf(selection)); file.value = ""; });
    const address = h("input", { type: "url", class: "dz-hex dz-find", placeholder: "https://…/picture.jpg", "aria-label": "Image address", disabled: !found.length });
    const use = () => {
      const value = address.value.trim();
      if (!/^(https?:\/\/|data:image\/)/i.test(value)) { showToast("Use an address that starts with http:// or https://."); return; }
      swapImages(imageTargetsOf(selection), value, value);
    };
    address.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); use(); } });
    const panel = h("div", { class: "dz-panel" }, note, file, address,
      h("div", { class: "dz-menu" }, h("button", { type: "button", class: "dz-menu-button", text: "Use this address", disabled: !found.length, onclick: use })));
    // a picture behind any element
    const anyTarget = selection.filter((el) => !ours(el) && el.tagName !== "IMG");
    const bgFile = h("input", { type: "file", accept: "image/*", class: "dz-filewide", "aria-label": "Choose a background picture", disabled: !anyTarget.length });
    bgFile.addEventListener("change", async () => {
      const f = bgFile.files[0];
      bgFile.value = "";
      if (!f || !/^image\//.test(f.type)) return;
      try { const item = await pictureFromFile(f); keepPicture(item); addBackground(selection, item.src, item.label); } catch (_) { showToast("The file could not be read."); }
    });
    const bgAddress = h("input", { type: "url", class: "dz-hex dz-wide", placeholder: "https://…/background.jpg", "aria-label": "Background picture address", disabled: !anyTarget.length });
    const useBg = () => { const item = pictureFromAddress(bgAddress.value.trim()); if (item) { keepPicture(item); addBackground(selection, item.src, item.label); } };
    bgAddress.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); useBg(); } event.stopPropagation(); });
    panel.append(h("div", { class: "dz-group-title", text: "Background picture" }),
      h("p", { class: "dz-hint", text: anyTarget.length ? `A picture behind ${selection.length > 1 ? "the selection" : label(selected)}. It is also a drop target: choose "Background" in the Elements panel and drop pictures on the page.` : "Select an element to put a picture behind it." }),
      bgFile, bgAddress,
      h("div", { class: "dz-menu" },
        ...[["cover", "Fill"], ["contain", "Fit"], ["tile", "Tile"]].map(([fit, text]) => h("button", { type: "button", class: "dz-menu-button" + (bgFit() === fit ? " dz-active" : ""), text, "aria-pressed": String(bgFit() === fit), disabled: !anyTarget.length,
          title: { cover: "Fill the element, cropping if needed", contain: "Show the whole picture inside the element", tile: "Repeat the picture at its own size" }[fit],
          onclick: () => { host.setPref("bgfit", fit); const picked = anyTarget.filter((el) => hasPicture(el)); if (picked.length) { const cur = picked[0]; const m = /url\((.*)\)/.exec(getComputedStyle(cur).backgroundImage); if (m) applyBackground(picked, bgValues(m[1].replace(/^"|"$/g, ""))); } renderDock(); } })),
        h("button", { type: "button", class: "dz-menu-button", text: "Remove", disabled: !anyTarget.some((el) => hasPicture(el)), onclick: () => clearBackground(selection) })));
    if (ownPictures.length) panel.append(h("div", { class: "dz-menu" }, ...ownPictures.slice(0, 4).map((item) => h("button", { type: "button", class: "dz-menu-button", text: item.label, disabled: !anyTarget.length, title: "Use this picture as the background", onclick: () => addBackground(selection, item.src, item.label) }))));
    return panel;
  }
