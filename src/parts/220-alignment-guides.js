  // ---------- alignment guides ----------
  // Hold G with an element selected: its edges and centres run across the page, and everything that lines up with them is outlined.
  const guideLayer = h("div", { class: "dz-guides" });
  root.append(guideLayer);
  let guiding = false;
  function renderGuides() {
    guideLayer.replaceChildren();
    if (!guiding || !on || !selected || !document.contains(selected)) return;
    const a = selected.getBoundingClientRect();
    const xs = [["left", a.left], ["centre", a.left + a.width / 2], ["right", a.right]];
    const ys = [["top", a.top], ["centre", a.top + a.height / 2], ["bottom", a.bottom]];
    for (const [, x] of xs) { const line = h("div", { class: "dz-g-line" }); line.style.left = x + "px"; line.style.top = "0px"; line.style.width = "1px"; line.style.height = "100vh"; guideLayer.append(line); }
    for (const [, y] of ys) { const line = h("div", { class: "dz-g-line" }); line.style.top = y + "px"; line.style.left = "0px"; line.style.height = "1px"; line.style.width = "100vw"; guideLayer.append(line); }
    let aligned = 0, seen = 0;
    for (const element of document.body.querySelectorAll("*")) {
      if (++seen > 1200) break;
      if (element === selected || selection.includes(element) || ours(element)) continue;
      const r = element.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
      const near = (v, list) => list.some(([, t]) => Math.abs(v - t) <= 0.6);
      if (near(r.left, xs) || near(r.right, xs) || near(r.left + r.width / 2, xs) || near(r.top, ys) || near(r.bottom, ys) || near(r.top + r.height / 2, ys)) {
        aligned++;
        const box = h("div", { class: "dz-g-box" });
        box.style.left = r.left + "px"; box.style.top = r.top + "px"; box.style.width = r.width + "px"; box.style.height = r.height + "px";
        guideLayer.append(box);
      }
    }
    const badge = h("div", { class: "dz-badge", text: aligned ? `${aligned} element${aligned > 1 ? "s" : ""} line up with this one` : "Nothing else lines up with this one" });
    guideLayer.append(badge);
  }
