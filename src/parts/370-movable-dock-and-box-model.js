
  // ---------- a dock you can move, and the box model drawn while you set spacing ----------
  // Both are VisBug's (Apache-2.0, https://github.com/GoogleChromeLabs/ProjectVisBug): its toolbar can be dragged out of the way, and its margin
  // and padding tools draw the box model (components/selection/box-model.element.js). Modified: the dock is dragged by its header (a double-click
  // there puts it back), and the spacing overlay is two plain boxes: margin in orange outside the element, padding in green inside it.
  dock.addEventListener("pointerdown", (event) => {
    const grip = event.target.closest && event.target.closest(".dz-head");
    if (!grip || event.target.closest("button") || event.button !== 0) return;
    const start = dock.getBoundingClientRect();
    const grab = { x: event.clientX - start.left, y: event.clientY - start.top };
    dock.setPointerCapture(event.pointerId);
    event.preventDefault();
    const move = (e) => {
      const left = clamp(e.clientX - grab.x, 4, Math.max(4, window.innerWidth - 80));
      const top = clamp(e.clientY - grab.y, 4, Math.max(4, window.innerHeight - 48));
      Object.assign(dock.style, { left: left + "px", top: top + "px", right: "auto", bottom: "auto" });
    };
    const up = () => { dock.removeEventListener("pointermove", move); dock.removeEventListener("pointerup", up); };
    dock.addEventListener("pointermove", move);
    dock.addEventListener("pointerup", up);
  });
  dock.addEventListener("dblclick", (event) => {
    const head = dock.querySelector(".dz-head");   // by where the pointer is: pointer capture makes the dock itself the target
    if (!head || event.clientY < head.getBoundingClientRect().top || event.clientY > head.getBoundingClientRect().bottom || (event.target.closest && event.target.closest("button"))) return;
    for (const side of ["left", "top", "right", "bottom"]) dock.style[side] = "";   // back to the corner
  });

  const marginBox = h("div", { class: "dz-box dz-margin", hidden: true });
  const paddingBox = h("div", { class: "dz-box dz-padding", hidden: true });
  root.append(marginBox, paddingBox);
  refreshHooks.push(() => {
    const element = on && tool === "spacing" && selected && selected.isConnected ? selected : null;
    const rect = element && element.getBoundingClientRect();
    if (!element || !rect.width || !rect.height) { marginBox.hidden = paddingBox.hidden = true; return; }
    const cs = getComputedStyle(element);
    const px = (prop) => Math.max(0, parseFloat(cs[prop]) || 0);   // a negative margin cannot be drawn as a frame
    const [mt, mr, mb, ml] = ["marginTop", "marginRight", "marginBottom", "marginLeft"].map(px);
    const [pt, pr, pb, pl] = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].map(px);
    const [bt, br, bb, bl] = ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"].map(px);
    marginBox.hidden = paddingBox.hidden = false;
    // margin: a frame around the border box (content-box sizing, so the frame's width is the margin itself)
    Object.assign(marginBox.style, { boxSizing: "content-box", left: rect.left - ml + "px", top: rect.top - mt + "px", width: rect.width + "px", height: rect.height + "px",
      borderStyle: "solid", borderColor: "rgba(246, 178, 107, 0.55)", borderWidth: `${mt}px ${mr}px ${mb}px ${ml}px` });
    // padding: a frame just inside the border, around the content
    Object.assign(paddingBox.style, { boxSizing: "content-box", left: rect.left + bl + "px", top: rect.top + bt + "px",
      width: Math.max(0, rect.width - bl - br - pl - pr) + "px", height: Math.max(0, rect.height - bt - bb - pt - pb) + "px",
      borderStyle: "solid", borderColor: "rgba(147, 196, 125, 0.55)", borderWidth: `${pt}px ${pr}px ${pb}px ${pl}px` });
  });
