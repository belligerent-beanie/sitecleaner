  // ---------- the label on the selected element ----------
  // A badge with the element's name and size next to it, so the designer does not have to look away from the page to the panel (VisBug has one too,
  // and a second for an element scrolled out of view). Modified: it also says which state is being edited, and counts a selection of several.
  const selLabel = h("div", { class: "dz-selabel", "aria-hidden": "true", hidden: true });
  root.append(selLabel);
  refreshHooks.push(() => {
    const element = on && selected && selected.isConnected ? selected : null;
    if (!element) { selLabel.hidden = true; return; }
    const rect = element.getBoundingClientRect();
    const above = rect.bottom < 0, below = rect.top > window.innerHeight;   // out of view: the badge stays at the edge and points the way
    const name = selection.length > 1 ? `${selection.length} elements` : `${label(element)}  ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    selLabel.textContent = (above ? "↑ " : below ? "↓ " : "") + name + (layer !== "normal" ? `  :${layer}` : "");
    selLabel.hidden = false;
    const height = selLabel.offsetHeight, width = selLabel.offsetWidth;
    let top;
    if (above) top = 4;
    else if (below) top = window.innerHeight - height - 4;
    else if (rect.top - height - 2 >= 4) top = rect.top - height - 2;      // above the element
    else if (rect.bottom + height + 2 <= window.innerHeight - 4) top = rect.bottom + 2;   // no room above: below it
    else top = Math.max(4, rect.top + 2);                                    // an element as tall as the window: inside it
    selLabel.style.top = top + "px";
    selLabel.style.left = clamp(rect.left, 4, Math.max(4, window.innerWidth - width - 4)) + "px";
  });
