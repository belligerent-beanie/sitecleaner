
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
    event.preventDefault();   // without this the browser would open the file instead
    const targets = dropTargets(event);
    place(dropBox, targets[0] || null);
  }, true);
  window.addEventListener("dragleave", (event) => { if (!event.relatedTarget) place(dropBox, null); }, true);
  window.addEventListener("drop", (event) => {
    place(dropBox, null);
    if (!on || !carriesFiles(event) || ours(eventTarget(event))) return;
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
    return h("div", { class: "dz-panel" }, note, file, address,
      h("div", { class: "dz-menu" }, h("button", { type: "button", class: "dz-menu-button", text: "Use this address", disabled: !found.length, onclick: use })));
  }
