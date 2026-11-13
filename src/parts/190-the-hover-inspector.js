  // ---------- the hover inspector ----------
  // Press I (or use Inspect in the dock) and hover anything: what it is, its size, type, colours, contrast (WCAG and APCA) and what
  // assistive technology would make of it. An idea from VisBug (Apache-2.0, github.com/GoogleChromeLabs/ProjectVisBug), written afresh here.
  let inspecting = false;
  const inspectTip = h("div", { class: "dz-tip", hidden: true });
  root.append(inspectTip);
  /** What a screen reader would call the element: aria-label, then a label it points at, then alt, title or its own text. */
  function accessibleName(element) {
    const byId = (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((el) => el.textContent.trim()).join(" ");
    const name = element.getAttribute("aria-label") || (element.getAttribute("aria-labelledby") && byId(element.getAttribute("aria-labelledby")))
      || (element.labels && element.labels[0] && element.labels[0].textContent.trim()) || element.getAttribute("alt")
      || element.getAttribute("title") || (element.children.length < 4 ? element.textContent.trim() : "");
    return name.replace(/\s+/g, " ").slice(0, 60);
  }
  const IMPLICIT_ROLES = { a: "link", button: "button", img: "img", input: "textbox", select: "combobox", textarea: "textbox", nav: "navigation", main: "main",
    header: "banner", footer: "contentinfo", ul: "list", ol: "list", li: "listitem", table: "table", h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading" };
  function renderInspect(element) {
    inspectTip.replaceChildren();
    if (!inspecting || !on || !element || ours(element) || element === document.documentElement || !document.contains(element)) { inspectTip.hidden = true; return; }
    const cs = getComputedStyle(element);
    const box = boxSize(element);
    const info = element.textContent.trim() ? contrastInfo(element) : null;
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role") || IMPLICIT_ROLES[tag] || "";
    const name = accessibleName(element);
    const focusable = element.tabIndex >= 0 || element.matches("a[href], button, input, select, textarea, [tabindex]");
    const lines = [
      [label(element), "dz-tip-title"],
      [`${box.width} × ${box.height}px`, ""],
      [`${cs.fontFamily.split(",")[0].replace(/"/g, "")} ${cs.fontSize} / ${lineHeightOf(cs)}, weight ${cs.fontWeight}`, ""],
    ];
    if (info) {
      const back = backdrop(element);
      lines.push([`text ${colourText(cs.color)} on ${back.unknown ? "an image or gradient" : toHex(...back.rgb.map(Math.round))}`, ""]);
      lines.push([info.unknown ? "contrast: cannot be measured here" : `${info.ratio.toFixed(2)}:1 · WCAG AA ${info.aa ? "✓" : "✗"} · AAA ${info.aaa ? "✓" : "✗"} · APCA Lc ${Math.round(info.apca)}`, info.unknown ? "" : info.aa ? "dz-pass" : "dz-fail"]);
    }
    lines.push([`padding ${sidesOf(cs, "padding")} · margin ${sidesOf(cs, "margin")}`, ""]);
    lines.push([`${role ? "role " + role + " · " : ""}${name ? "name “" + name + "”" : "no accessible name"}${focusable ? " · focusable" : ""}`,
      !name && (role === "button" || role === "link" || role === "img" || tag === "input") ? "dz-fail" : ""]);
    if (tag === "img" && !element.hasAttribute("alt")) lines.push(["missing alt text", "dz-fail"]);
    for (const [text, cls] of lines) inspectTip.append(h("div", { class: cls, text }));
    inspectTip.hidden = false;
    const r = element.getBoundingClientRect();
    const tip = inspectTip.getBoundingClientRect();
    inspectTip.style.left = Math.max(8, Math.min(window.innerWidth - tip.width - 8, r.left)) + "px";
    inspectTip.style.top = (r.bottom + tip.height + 12 < window.innerHeight ? r.bottom + 8 : Math.max(8, r.top - tip.height - 8)) + "px";
  }
  function setInspect(value) {
    inspecting = value;
    renderInspect(hovered);
    if (inspectLink) inspectLink.classList.toggle("dz-on-link", inspecting);
  }
  let inspectLink = null;
