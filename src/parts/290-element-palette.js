  // ---------- the element palette (the studio edition) ----------
  // A list of known elements to drag onto the page: the page's own components (its buttons, headings, pictures, repeated cards, found on the page and
  // copied with their classes, so a new one looks like the site's) and a few basics. While you paletteDrag, the container the element would go into is
  // outlined and a line shows where it lands between its siblings. Dropping is one undoable insert (the same op as a paste), kept and exported like any.
  // A click on a tile adds it after the selected element, for people who cannot or will not paletteDrag.
  const paletteOn = () => !!(host.features && host.features.palette === true) && has("structure");
  let palette = null;      // the scan of the page, kept until the panel is opened again or refreshed: [{title, items: [{label, note, html, el}]}]
  let paletteDrag = null;         // {item, x, y, moved, ghost, target: {parent, before}}
  const BASICS = [
    { label: "Heading", note: "h2", html: "<h2>Heading</h2>", swatch: "Aa" },
    { label: "Paragraph", note: "p", html: "<p>Write something here. Double-click to edit the words.</p>", swatch: "¶" },
    { label: "Button", note: "button", html: '<button type="button" style="padding:8px 16px">Button</button>', swatch: "▭" },
    { label: "Picture", note: "img", html: '<img alt="" style="display:block;width:240px;height:160px;background:#d9d9e0" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'240\' height=\'160\'%3E%3Crect width=\'240\' height=\'160\' fill=\'%23d9d9e0\'/%3E%3C/svg%3E">', swatch: "▨" },
    { label: "Divider", note: "hr", html: "<hr>", swatch: "—" },
    { label: "List", note: "ul", html: "<ul><li>One</li><li>Two</li><li>Three</li></ul>", swatch: "≡" },
    { label: "Box", note: "div", html: '<div style="padding:16px;border:1px solid #c9c9d2">Box</div>', swatch: "□" },
  ];
  const noKids = /^(IMG|INPUT|BR|HR|SELECT|TEXTAREA|VIDEO|AUDIO|CANVAS|SVG|IFRAME|OBJECT|EMBED|BUTTON)$/i;
  const wordsOnly = /^(P|H[1-6]|SPAN|A|LABEL|B|I|EM|STRONG|SMALL|CODE|PRE|DT|FIGCAPTION)$/i;   // elements that hold words, not other blocks: a drop lands beside them
  const canBecomeBox = /^(P|H[1-6]|SPAN|LABEL|B|I|EM|STRONG|SMALL|CODE|PRE|DT|FIGCAPTION)$/i;   // ...and these can be turned into a box (a div) that holds anything (not a link or a button: they would lose what they do)
  const skipTag = /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE)$/;
  const THING = { P: "A paragraph", H1: "A heading", H2: "A heading", H3: "A heading", H4: "A heading", H5: "A heading", H6: "A heading", SPAN: "A piece of text", A: "A link", BUTTON: "A button", IMG: "A picture",
    INPUT: "A field", SELECT: "A menu", TEXTAREA: "A text box", VIDEO: "A video", AUDIO: "A sound", CANVAS: "A drawing area", SVG: "A drawing", IFRAME: "An embedded page", HR: "A divider", BR: "A line break", LABEL: "A label" };
  const thingName = (el) => THING[el.tagName.toUpperCase()] || `A ${el.tagName.toLowerCase()}`;
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8 && !ours(el) && el.getClientRects().length > 0; };
  const segOf = (el) => el.tagName.toLowerCase() + [...el.classList].map((name) => "." + name).join("");   // every class, as the page wrote it
  const niceName = (el) => { const own = [...el.classList].find((name) => !hashed(name)); return own ? "." + own : el.tagName.toLowerCase(); };
  const pathOf = (el) => { const segs = []; for (let n = el; n && n !== document.body && n !== document.documentElement && segs.length < 4; n = n.parentElement) segs.unshift(segOf(n)); return segs; };
  function htmlOf(el) {   // a copy that can sit on the page next to the original: no ids
    const copy = el.cloneNode(true);
    copy.removeAttribute("id");
    for (const inner of copy.querySelectorAll("[id]")) inner.removeAttribute("id");
    const html = copy.outerHTML;
    return html.length <= MAX_HTML ? html : null;
  }
  const clip = (text, n) => { const t = (text || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  const drawsBox = (cs) => cs.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== "none";
  const pictureMode = () => (host.getPref("pictureAs") === "background" ? "background" : "image");
  const pictureSrc = (item) => item.src || item.bgSrc || null;   // a picture tile can also go behind an element
  /** A drop that sets the background of the element under the pointer (the picture tiles, when the panel says "Background"). */
  function backgroundTarget(x, y, alt) {
    let el = document.elementFromPoint(x, y);
    if (!el || ours(el)) return null;
    if (el === document.documentElement) el = document.body;
    let hit = wholeObject(el, { altKey: alt }) || el;
    if (hit.tagName === "IMG") hit = hit.parentElement || document.body;
    return ours(hit) ? null : { background: hit, parent: hit, before: null, row: false };
  }
  const targetFor = (item, x, y, alt, shift) => (item && pictureSrc(item) && pictureMode() === "background" ? backgroundTarget(x, y, alt) : dropTarget(x, y, alt, shift));
  let ownPictures = [];    // the pictures the designer added to the palette (a file or an address), kept while the page is open
  function scanPage() {
    const groups = [];
    const keep = new Set();
    const add = (list, el, label, extra) => { const html = htmlOf(el); if (!html || keep.has(html)) return; keep.add(html); list.push({ label, extra, html, el, path: pathOf(el), bgSrc: el.tagName === "IMG" ? (el.currentSrc || el.src) : null }); };
    const headings = [], buttons = [], pictures = [], text = [], cards = [];
    const sigs = new Set();
    for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) { const el = [...document.querySelectorAll(tag)].find(seen); if (el) add(headings, el, `${tag.toUpperCase()} ${clip(el.textContent, 18)}`, ""); }
    for (const el of [...document.querySelectorAll("button, [role=button], a")].slice(0, 1500)) {
      if (buttons.length >= 6) break;
      if (!seen(el) || el.children.length > 2 || !el.textContent.trim() || el.textContent.trim().length > 40) continue;
      const cs = getComputedStyle(el);
      if (!drawsBox(cs) || parseFloat(cs.paddingLeft) < 6) continue;
      const sig = "b" + segOf(el);
      if (sigs.has(sig)) continue;
      sigs.add(sig);
      add(buttons, el, clip(el.textContent, 20), "");
    }
    for (const el of [...document.querySelectorAll("img")].slice(0, 300)) {
      if (pictures.length >= 4) break;
      const r = el.getBoundingClientRect();
      if (!seen(el) || r.width < 24 || sigs.has("i" + segOf(el))) continue;
      sigs.add("i" + segOf(el));
      add(pictures, el, el.alt ? clip(el.alt, 20) : "Picture", `${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const para = [...document.querySelectorAll("p")].find((el) => seen(el) && el.textContent.trim().length > 20);
    if (para) add(text, para, "Paragraph", "");
    const list = [...document.querySelectorAll("ul, ol")].find((el) => seen(el) && el.children.length >= 2 && !el.closest("nav"));
    if (list) add(text, list, "List", `${list.children.length} items`);
    const found = [];
    for (const parent of [...document.querySelectorAll("body *")].slice(0, 4000)) {   // repeated components: siblings of one kind, drawn as boxes
      if (parent.children.length < 2 || skipTag.test(parent.tagName) || ours(parent)) continue;
      const bySig = new Map();
      for (const child of parent.children) { if (skipTag.test(child.tagName) || ours(child)) continue; const sig = segOf(child); bySig.set(sig, [...(bySig.get(sig) || []), child]); }
      for (const [sig, kids] of bySig) {
        const first = kids.find(seen);
        if (kids.length < 2 || !first) continue;
        const r = first.getBoundingClientRect(), cs = getComputedStyle(first);
        if (r.width < 80 || r.width > 800 || r.height < 40 || (!drawsBox(cs) && !first.querySelector("img"))) continue;
        found.push({ first, sig, count: kids.length, score: kids.length * 100 + Math.min(r.width * r.height, 50000) / 1000 });
      }
    }
    for (const c of found.sort((a, b) => b.score - a.score)) {
      if (cards.length >= 6) break;
      if (sigs.has("c" + c.sig)) continue;
      sigs.add("c" + c.sig);
      const r = c.first.getBoundingClientRect();
      add(cards, c.first, `${niceName(c.first)} ×${c.count}`, `${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    for (const [title, items] of [["Headings", headings], ["Buttons", buttons], ["Pictures", pictures], ["Text", text], ["Cards and repeated blocks", cards]]) if (items.length) groups.push({ title, items });
    // The full class path is kept (in the tile's tooltip, and as the page wrote it in the copy). What shows on the tile hides the ancestors every tile shares.
    const all = groups.flatMap((g) => g.items);
    let common = 0;
    while (all.length > 1 && all.every((it) => it.path.length - 1 > common && it.path[common] === all[0].path[common])) common++;
    for (const it of all) {
      it.fullPath = it.path.join(" › ");
      it.note = it.path.slice(common).join(" › ") || it.extra;
      it.title = `${it.label}\n${it.fullPath}${it.extra ? "\n" + it.extra : ""}`;
    }
    return groups;
  }
  /** A small drawing of an element, from how it looks now: its colours, corners, border and type. */
  function swatchOf(item) {
    const box = h("span", { class: "dz-swatch", "aria-hidden": "true" });
    const el = item.el;
    if (item.src) { box.append(h("img", { src: item.src, alt: "", draggable: "false" })); return box; }
    if (!el) { box.textContent = item.swatch || ""; return box; }
    if (el.tagName === "IMG") { box.append(h("img", { src: el.currentSrc || el.src, alt: "", draggable: "false" })); return box; }
    const cs = getComputedStyle(el);
    const style = box.style;
    style.setProperty("background", cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "transparent" : cs.backgroundColor);
    style.setProperty("color", cs.color);
    style.setProperty("border", `${Math.min(3, parseFloat(cs.borderTopWidth) || 0)}px ${cs.borderTopStyle === "none" ? "solid" : cs.borderTopStyle} ${cs.borderTopWidth === "0px" ? "transparent" : cs.borderTopColor}`);
    style.setProperty("border-radius", cs.borderTopLeftRadius);
    style.setProperty("font-weight", cs.fontWeight);
    style.setProperty("font-style", cs.fontStyle);
    style.setProperty("font-family", cs.fontFamily);
    style.setProperty("font-size", clip(String(Math.min(18, Math.max(10, parseFloat(cs.fontSize) || 14))), 4) + "px");
    box.textContent = el.querySelector("img") && !el.textContent.trim() ? "▨" : clip(el.textContent, 14) || "▭";
    return box;
  }
  // -- dropping
  const dropParent = h("div", { class: "dz-box dz-dropparent", hidden: true });
  const dropTag = h("span", { class: "dz-droptag" });
  dropParent.append(dropTag);
  const dropLine = h("div", { class: "dz-box dz-dropline", hidden: true });
  const dropBlocked = h("div", { class: "dz-box dz-dropblocked", hidden: true });   // the element under the pointer when it cannot hold what is being dragged
  root.append(dropParent, dropLine, dropBlocked);
  function dropTarget(x, y, alt, shift) {
    let el = document.elementFromPoint(x, y);
    if (!el || ours(el)) return null;
    if (el === document.documentElement) el = document.body;
    const hit = wholeObject(el, { altKey: alt }) || el;
    let blocked = null;   // what is under the pointer, if it cannot hold other elements
    if (hit !== document.body && (noKids.test(hit.tagName) || wordsOnly.test(hit.tagName))) blocked = { el: hit, text: wordsOnly.test(hit.tagName) || hit.tagName === "BUTTON", box: canBecomeBox.test(hit.tagName) };
    if (blocked && blocked.box && shift) return { parent: hit, before: null, row: false, convert: hit, blocked };   // Shift: turn it into a box, and drop inside
    let parent = hit;
    while (parent && parent !== document.body && (noKids.test(parent.tagName) || wordsOnly.test(parent.tagName))) parent = parent.parentElement;
    if (!parent || parent === document.documentElement) parent = document.body;
    if (ours(parent)) return null;
    const cs = getComputedStyle(parent);
    const rowParent = /flex/.test(cs.display) && /^row/.test(cs.flexDirection) || cs.display === "grid";
    let before = null;
    for (const child of parent.children) {
      if (ours(child) || skipTag.test(child.tagName) || !child.getClientRects().length) continue;
      const r = child.getBoundingClientRect();
      const row = rowParent || /^inline|table-cell/.test(getComputedStyle(child).display);
      if (row ? (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) : y < r.top + r.height / 2) { before = child; break; }
    }
    return { parent, before, row: rowParent, blocked };
  }
  /** Why a drop does not go where the pointer is, in words: nothing when it does. */
  function warningFor(target) {
    if (!target || !target.blocked) return "";
    const { el, text, box } = target.blocked, name = thingName(el);
    if (target.convert) return `${name} becomes a box (a div) and holds this. Its default size and spacing may change.`;
    return `${name} can only hold ${text ? "text" : "nothing"}, so this goes next to it.` + (box ? " Hold Shift to turn it into a box and drop inside." : "");
  }
  function showDrop(target) {
    if (!target) { dropParent.hidden = true; dropLine.hidden = true; dropBlocked.hidden = true; return; }
    if (target.background) {
      place(dropParent, target.background);
      dropParent.classList.remove("dz-dropconvert");
      dropTag.textContent = `background of ${label(target.background)}`;
      dropLine.hidden = true; dropBlocked.hidden = true;
      return;
    }
    place(dropParent, target.parent);
    dropParent.classList.toggle("dz-dropconvert", !!target.convert);
    dropTag.textContent = target.convert ? `${thingName(target.convert)} → box, drop inside` : `into ${label(target.parent)}`;
    place(dropBlocked, target.blocked && !target.convert ? target.blocked.el : null);
    if (target.convert) { dropLine.hidden = true; return; }
    const kids = [...target.parent.children].filter((c) => !ours(c) && !skipTag.test(c.tagName) && c.getClientRects().length);
    const anchor = target.before || kids[kids.length - 1] || null;
    const p = target.parent.getBoundingClientRect();
    let left, top, width, height;
    if (!anchor) { left = p.left + 6; top = p.top + 6; width = Math.max(20, p.width - 12); height = 3; }
    else {
      const r = anchor.getBoundingClientRect();
      const row = target.row || /^inline|table-cell/.test(getComputedStyle(anchor).display);
      if (row) { left = (target.before ? r.left : r.right) - 1; top = r.top; width = 3; height = r.height; }
      else { left = r.left; top = (target.before ? r.top : r.bottom) - 1; width = r.width; height = 3; }
    }
    Object.assign(dropLine.style, { left: left + "px", top: top + "px", width: width + "px", height: height + "px" });
    dropLine.hidden = false;
  }
  function startDrag(item, event) {
    if (paletteDrag || event.button !== 0) return;
    paletteDrag = { item, x: event.clientX, y: event.clientY, moved: false, ghost: null, target: null };
    window.addEventListener("pointermove", dragOver, true);
    window.addEventListener("pointerup", dragUpOutside, true);
    window.addEventListener("pointercancel", dragCancel, true);
  }
  function dragOver(event) {
    if (!paletteDrag) return;
    if (!paletteDrag.moved && Math.hypot(event.clientX - paletteDrag.x, event.clientY - paletteDrag.y) < 5) return;
    paletteDrag.moved = true;
    hovered = null;
    if (!paletteDrag.ghost) { paletteDrag.ghost = h("div", { class: "dz-ghost" }, h("strong", { text: paletteDrag.item.label }), h("span", { class: "dz-ghost-warn" })); root.append(paletteDrag.ghost); }
    paletteDrag.ghost.style.left = Math.min(event.clientX + 12, window.innerWidth - 300) + "px";
    paletteDrag.ghost.style.top = event.clientY + 12 + "px";
    paletteDrag.target = targetFor(paletteDrag.item, event.clientX, event.clientY, event.altKey, event.shiftKey);
    const warn = warningFor(paletteDrag.target);
    paletteDrag.ghost.lastChild.textContent = warn;
    paletteDrag.ghost.classList.toggle("dz-ghost-warn-on", !!warn);
    paletteDrag.ghost.classList.toggle("dz-ghost-no", !paletteDrag.target);
    showDrop(paletteDrag.target);
    refreshBoxes();
  }
  function endDrag(drop) {
    window.removeEventListener("pointermove", dragOver, true);
    window.removeEventListener("pointerup", dragUpOutside, true);
    window.removeEventListener("pointercancel", dragCancel, true);
    if (!paletteDrag) return;
    const { item, moved, ghost, target } = paletteDrag;
    paletteDrag = null;
    if (ghost) ghost.remove();
    showDrop(null);
    if (moved) lastDragEnd = performance.now();   // the click that follows a paletteDrag must not select or add anything
    if (moved && drop && target && target.background) addBackground([target.background], pictureSrc(item), item.label);
    else if (moved && drop && target) addElement(item, target.parent, target.before, target.convert);
    else if (moved) showToast("Nothing added.");
    refreshBoxes();
  }
  const dragUpOutside = () => endDrag(true);   // let go over the picker's own panel: there is no page element to drop on, so nothing is added, unless the pointer was last over one
  const dragCancel = () => endDrag(false);
  const LOOKS = ["color", "background-color", "font-size", "font-weight", "font-family", "border-top-left-radius", "border-top-width", "padding-top", "padding-left"];
  const LOOK_NAMES = { color: "text colour", "background-color": "background", "font-size": "text size", "font-weight": "text weight", "font-family": "font", "border-top-left-radius": "corners", "border-top-width": "border", "padding-top": "spacing", "padding-left": "spacing" };
  /** Add an element: into `parent`, before `before`; with `convert`, that element first becomes a box (a div) and the new one goes inside, as one undoable step. Returns the parent it went into. */
  function addElement(item, parent, before, convert) {
    const list = [];
    if (convert) { const retag = retagOp(convert, "div"); retag.redo(); list.push(retag); parent = retag.replacement; before = null; }
    const op = insertOp(parent, item.html, before);
    op.redo();
    list.push(op);
    doOps(list, true);
    const added = op.nodes.filter((node) => node.nodeType === 1);
    structureDone(added);
    let note = "";
    if (item.el && item.el.isConnected && added[0]) {   // a copy is styled by where it sits: say so when it does not look like the original
      const was = getComputedStyle(item.el), now = getComputedStyle(added[0]);
      const differs = [...new Set(LOOKS.filter((prop) => was.getPropertyValue(prop) !== now.getPropertyValue(prop)).map((prop) => LOOK_NAMES[prop]))];
      if (differs.length) note = ` It looks different from the original (${differs.join(", ")}): the page styles it by where it sits${item.fullPath ? ", " + item.fullPath : ""}. Drop it inside a matching container, or Ctrl+Z.`;
    }
    if (!op.desc.whole) note += " This picture is too large to keep across reloads.";
    showToast(`Added ${item.label} into ${label(parent)}.${convert ? " " + thingName(convert) + " is now a box." : ""}${note || " Ctrl+Z undoes."}`);
    return parent;
  }
  /** A paragraph (or similar) becomes a box: the same element, with the same classes and style, in a tag that can hold anything. Its children move with it. */
  function retagOp(el, tag) {
    const parent = el.parentNode, replacement = document.createElement(tag);
    for (const attr of [...el.attributes]) replacement.setAttribute(attr.name, attr.value);
    const desc = { type: "retag", selector: selectorFor(el), snippet: snippetOf(el), from: el.tagName.toLowerCase(), tag };
    const carry = (from, to) => { for (const map of Object.values(layers)) if (map.has(from)) { map.set(to, map.get(from)); map.delete(from); } };   // the edits made to it go with it
    const swap = (from, to) => { while (from.firstChild) to.appendChild(from.firstChild); parent.replaceChild(to, from); carry(from, to); };
    return { desc, replacement, redo: () => swap(el, replacement), undo: () => swap(replacement, el) };
  }
  // -- pictures: a file, an address, or a file dropped from the desktop
  const escAttr = (text) => String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const pictureHtml = (src, name) => `<img alt="${escAttr(name)}" src="${escAttr(src)}" style="display:block;max-width:100%;height:auto">`;
  async function shrinkPicture(src, type) {   // big pictures are made smaller so they can be kept across reloads (a file of a few megabytes would not fit)
    const img = new Image();
    img.src = src;
    await img.decode();
    let out = src;
    for (const side of [1600, 1200, 800, 500]) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * k)); canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      out = canvas.toDataURL(type === "image/png" ? "image/png" : "image/jpeg", 0.82);
      if (out.length <= MAX_ATTR) break;
    }
    return out;
  }
  async function pictureFromFile(file) {
    let src = await readAsDataUrl(file);
    const name = file.name || "picture";
    if (!/^image\/svg/.test(file.type) && src.length > MAX_ATTR) src = await shrinkPicture(src, file.type);
    return { label: clip(name, 20), extra: `${Math.max(1, Math.round(src.length / 1024))} KB`, note: "your picture", title: `${name}\nadded by you`, src, html: pictureHtml(src, name), el: null, path: [] };
  }
  function pictureFromAddress(address) {
    if (!/^(https?:\/\/|data:image\/)/i.test(address)) { showToast("Use an address that starts with http:// or https://."); return null; }
    const name = decodeURIComponent((address.split("?")[0].split("/").pop() || "picture").slice(0, 60)) || "picture";
    return { label: clip(name, 20), extra: "", note: "your picture", title: `${address}\nadded by you`, src: address, html: pictureHtml(address, name), el: null, path: [] };
  }
  const keepPicture = (item) => { if (item) { ownPictures.unshift(item); ownPictures.length = Math.min(ownPictures.length, 12); } };
  const pictureFiles = (event) => [...((event.dataTransfer && event.dataTransfer.files) || [])].filter((file) => /^image\//.test(file.type));
  const overPicture = (event) => { for (let n = eventTarget(event); n && n.nodeType === 1 && n !== document.body; n = n.parentElement) if (n.tagName === "IMG" || hasPicture(n)) return true; return false; };
  /** A file dragged over the page while the palette is open: show where a picture would land (over a picture, the Image tool's swap takes it instead). */
  function paletteFileOver(event) {
    if (!paletteOn() || !showPalette || overPicture(event)) { if (paletteOn()) showDrop(null); return false; }
    event.preventDefault();
    place(dropBox, null);
    const target = pictureMode() === "background" ? backgroundTarget(event.clientX, event.clientY, event.altKey) : dropTarget(event.clientX, event.clientY, event.altKey, event.shiftKey);
    showDrop(target);
    return true;
  }
  function paletteFileDrop(event) {
    showDrop(null);
    if (!paletteOn() || !showPalette || overPicture(event)) return false;
    const files = pictureFiles(event);
    if (!files.length) return false;
    event.preventDefault();
    event.stopPropagation();
    let target = pictureMode() === "background" ? backgroundTarget(event.clientX, event.clientY, event.altKey) : dropTarget(event.clientX, event.clientY, event.altKey, event.shiftKey);
    if (!target) return true;
    (async () => {
      for (const file of files) {
        let item = null;
        try { item = await pictureFromFile(file); } catch (_) { showToast("That file could not be read as a picture."); continue; }
        keepPicture(item);
        if (target.background) { addBackground([target.background], item.src, item.label); continue; }
        const into = addElement(item, target.parent, target.before, target.convert);
        if (target.convert) target = { parent: into, before: null };   // the next one goes into the same box
      }
      renderDock();
    })();
    return true;
  }
  window.addEventListener("dragleave", (event) => { if (!event.relatedTarget) showDrop(null); }, true);
  function addAfterSelection(item) {
    if (performance.now() - lastDragEnd < 400) return;
    if (pictureSrc(item) && pictureMode() === "background") { addBackground(selected ? [selected] : [document.body], pictureSrc(item), item.label); return; }
    const at = selected && selected.parentElement && selected !== document.body ? selected : null;
    if (at && ours(at.parentElement)) return;
    if (at) addElement(item, at.parentElement, at.nextElementSibling);
    else addElement(item, document.body, null);
  }
  pageEventHooks.push((event) => {
    if (paletteDrag && event.type === "pointerup") { event.preventDefault(); event.stopImmediatePropagation(); endDrag(true); return true; }
    if (event.type === "click" && performance.now() - lastDragEnd < 400) { event.preventDefault(); event.stopImmediatePropagation(); return true; }
    return false;
  });
  keyHooks.push((event) => {
    if (!paletteDrag || event.key !== "Escape") return false;
    event.preventDefault();
    endDrag(false);
    return true;
  });
  offHooks.push(() => { if (paletteDrag) endDrag(false); showPalette = false; });
  function palettePanel() {
    if (!palette) palette = scanPage();
    const tile = (item) => {
      const button = h("button", { type: "button", class: "dz-tile", title: `${item.title || item.label}\ndrag onto the page, or press to add after the selected element`, "aria-label": `Add ${item.label}`,
        onclick: () => addAfterSelection(item) }, swatchOf(item), h("span", { class: "dz-tile-name", text: item.label }), item.note && h("span", { class: "dz-tile-note", text: item.note }));
      button.addEventListener("pointerdown", (event) => startDrag(item, event));
      button.addEventListener("dragstart", (event) => event.preventDefault());   // a picture on the tile must not start the browser's own image drag, which would cancel ours
      return button;
    };
    const file = h("input", { type: "file", accept: "image/*", multiple: true, class: "dz-filewide", "aria-label": "Add picture files" });
    file.addEventListener("change", async () => {
      for (const f of [...file.files]) { try { keepPicture(await pictureFromFile(f)); } catch (_) { showToast("That file could not be read as a picture."); } }
      file.value = "";
      renderDock();
    });
    const address = h("input", { type: "url", class: "dz-hex dz-wide", placeholder: "https://…/picture.jpg", "aria-label": "Picture address" });
    const useAddress = () => { const item = pictureFromAddress(address.value.trim()); if (item) { keepPicture(item); renderDock(); } };
    address.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); useAddress(); } event.stopPropagation(); });
    const panel = h("div", { class: "dz-panel dz-elements" },
      h("p", { class: "dz-hint", text: "Drag an element onto the page: the container it will go into is outlined, and a line shows where it lands. Or press one to add it after the selected element. Hold Alt while dragging to drop into the exact element. Drop a picture file on the page to add it." }),
      h("div", { class: "dz-group-title", text: "Add a picture" }), file, address,
      h("div", { class: "dz-menu" }, h("button", { type: "button", class: "dz-menu-button", text: "Add from address", onclick: useAddress })),
      h("div", { class: "dz-menu" }, h("span", { class: "dz-hint", text: "Drop pictures as:" }),
        ...[["image", "Image"], ["background", "Background"]].map(([mode, text]) => h("button", { type: "button", class: "dz-menu-button" + (pictureMode() === mode ? " dz-active" : ""), text, "aria-pressed": String(pictureMode() === mode),
          title: mode === "image" ? "A picture dropped on the page is added as a new image" : "A picture dropped on an element becomes its background",
          onclick: () => { host.setPref("pictureAs", mode); renderDock(); } }))));
    const groups = [...(ownPictures.length ? [{ title: "Your pictures", items: ownPictures }] : []), ...palette, { title: "Basics", items: BASICS }];
    for (const group of groups) panel.append(h("div", { class: "dz-group-title", text: group.title }), h("div", { class: "dz-tiles" }, ...group.items.map(tile)));
    panel.append(h("div", { class: "dz-menu" }, h("button", { type: "button", class: "dz-menu-button", text: "Look at the page again", title: "Find the page's components again (after you changed the page)", onclick: () => { palette = null; renderDock(); } })));
    return panel;
  }
