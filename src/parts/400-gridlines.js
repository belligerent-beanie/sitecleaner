  // ---------- gridlines through the selection ----------
  // Four lines through the edges of each selected element, across the whole window, so the designer can see what its edges line up with.
  // An idea from VisBug (Apache-2.0, https://github.com/GoogleChromeLabs/ProjectVisBug, app/components/selection/gridlines.element.js).
  // Modified: it is a switch (the Gridlines button, or ;) that is remembered, it covers a selection of several (up to 12 elements), and it is
  // drawn as dashed lines in the picker's own layer. It is separate from the alignment guides (hold G), which show what lines up with *other* elements.
  const GRID_MAX = 12;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const gridOn = () => host.getPref("gridlines") === "on";
  function setGridlines(value) {
    host.setPref("gridlines", value ? "on" : "off");
    renderDock();
    refreshBoxes();
  }
  const gridSvg = document.createElementNS(SVG_NS, "svg");
  gridSvg.setAttribute("class", "dz-gridlines");
  gridSvg.setAttribute("aria-hidden", "true");
  gridSvg.setAttribute("hidden", "");
  root.append(gridSvg);
  const gridPool = [];
  function gridLine(i) {
    while (gridPool.length <= i) {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("class", "dz-gridline");
      gridSvg.append(line);
      gridPool.push(line);
    }
    return gridPool[i];
  }
  refreshHooks.push(() => {
    const elements = on && gridOn() ? selection.filter((el) => el.isConnected).slice(0, GRID_MAX) : [];
    gridSvg.toggleAttribute("hidden", !elements.length);
    const width = window.innerWidth, height = window.innerHeight;
    let used = 0;
    for (const element of elements) {
      const r = element.getBoundingClientRect();
      for (const [x1, y1, x2, y2] of [[r.left, 0, r.left, height], [r.right, 0, r.right, height], [0, r.top, width, r.top], [0, r.bottom, width, r.bottom]]) {
        const line = gridLine(used++);
        line.setAttribute("x1", x1); line.setAttribute("y1", y1); line.setAttribute("x2", x2); line.setAttribute("y2", y2);
      }
    }
    gridPool.forEach((line, i) => line.toggleAttribute("hidden", i >= used));
  });
