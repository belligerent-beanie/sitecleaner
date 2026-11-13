  // ---------- page furniture ----------
  const root = h("div", { class: "dz-root", "data-designer": "" });
  const hoverBox = h("div", { class: "dz-box dz-hover", hidden: true });
  const selectBox = h("div", { class: "dz-box dz-picked", hidden: true });
  const dock = h("div", { class: "dz-dock", role: "region", "aria-label": "UI picker", hidden: true });
  const toggle = h("button", { class: "dz-toggle", type: "button", title: "UI picker (Alt+Shift+P); copy your changes with Alt+Shift+E", text: "Design" });
  const toast = h("div", { class: "dz-toast", role: "status", "aria-live": "polite", hidden: true });
  root.append(hoverBox, selectBox, dock, toggle, toast);

  const ours = (node) => node instanceof Node && (root.contains(node) || host.isOwn(node));
  /** The element that has focus: inside a Shadow DOM document.activeElement is only the shadow host. */
  const activeEl = () => { const top = root.getRootNode(); return top instanceof ShadowRoot ? top.activeElement : document.activeElement; };
  /** What an event really hit: event.target is retargeted to the shadow host for anything inside one. */
  const eventTarget = (event) => (event.composedPath && event.composedPath()[0]) || event.target;

  // Drag handles on the selected element while the Size tool is open: right edge, bottom edge, and the corner (Shift keeps the proportions).
  let sizeSync = null;    // the Size panel's way of updating its fields while a handle is dragged
  let drag = null;        // {dir, x, y, w, h} while a handle is held
  const handles = [["e", "dz-h-e", "Drag to change the width"], ["s", "dz-h-s", "Drag to change the height"],
                   ["se", "dz-h-se", "Drag to change both (Shift keeps the proportions)"]]
    .map(([dir, cls, title]) => h("div", { class: "dz-handle " + cls, title, "data-dir": dir }));
  selectBox.append(...handles);
  for (const handle of handles) {
    handle.addEventListener("pointerdown", (event) => {
      if (!selected || tool !== "size" || event.button !== 0) return;
      event.preventDefault();
      const r = selected.getBoundingClientRect();
      drag = { dir: handle.dataset.dir, x: event.clientX, y: event.clientY, w: r.width, h: r.height };
      lastEdit = { kind: "", elements: [], at: 0 };   // the drag starts a new step ...
      holdStep = true;                                    // ... and stays one however slowly it goes
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || !selected) return;
      let w = drag.dir.includes("e") ? drag.w + event.clientX - drag.x : null;
      let height = drag.dir.includes("s") ? drag.h + event.clientY - drag.y : null;
      if (drag.dir === "se" && event.shiftKey) {   // keep the shape: follow whichever side was pulled further
        const scale = Math.max(w / drag.w, height / drag.h);
        w = drag.w * scale;
        height = drag.h * scale;
      }
      const sizes = {};
      if (w !== null) sizes.width = Math.max(1, Math.round(w));
      if (height !== null) sizes.height = Math.max(1, Math.round(height));
      applySize(selected, sizes);
      if (sizeSync) sizeSync();
    });
    const release = () => { drag = null; holdStep = false; };
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", release);
  }
  function updateHandles() {
    selectBox.classList.toggle("dz-sizing", on && selection.length === 1 && tool === "size" && tourStep === null && !showChanges);
  }


  function place(box, element) {
    if (!element || !document.contains(element)) { box.hidden = true; return; }
    const r = element.getBoundingClientRect();
    box.hidden = false;
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }
  /** Make `list` the selection (the last of it is the one the tools show). Elements that left the page are dropped. */
  function setSelection(list) {
    selection = list.filter((el) => el && document.contains(el));
    selected = selection.length ? selection[selection.length - 1] : null;
  }
  const targets = () => selection.slice();   // what an edit applies to
  const extraBoxes = [];                     // outlines for the selected elements other than the primary one
  function placeSelection() {
    const others = on ? selection.filter((el) => el !== selected) : [];
    while (extraBoxes.length < others.length) { const box = h("div", { class: "dz-box dz-picked dz-more", hidden: true }); root.append(box); extraBoxes.push(box); }
    extraBoxes.forEach((box, i) => place(box, others[i] || null));
    while (extraBoxes.length > Math.max(24, others.length)) extraBoxes.pop().remove();   // a selector typed into Find can select hundreds for a moment
  }
  function refreshBoxes() {
    if (selection.some((el) => !document.contains(el))) { setSelection(selection); climbed = []; if (!selected) closeTool(); }
    place(hoverBox, on && hovered !== selected ? hovered : null);
    renderInspect(hovered);
    place(selectBox, on ? selected : null);
    placeSelection();
    updateHandles();
    renderMeasure();
    renderGuides();
  }
