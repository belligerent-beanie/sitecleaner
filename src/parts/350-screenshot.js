
  // ---------- screenshot ----------
  // A picture of the selected elements (the area they cover together), or of what is visible when nothing is selected, saved as a PNG: for
  // a hand-off, a bug report or a before / after. VisBug lists this as a tool but ships only an alert saying "Coming Soon!", so this is
  // new. It needs the extension (the browser only lets an extension photograph a tab); the picker's own outlines and dock are hidden for it.
  const nextFrames = (n) => new Promise((resolve) => { const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve()); step(n); });
  const loadImage = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
  /** A picture of an edited page can be made to look like the real one (a changed price, a changed message). Where the edition asks for it
   *  (`watermark`), every picture says so: a strip under it, and faint tiles across it, so cropping the strip off does not make it pass. */
  const watermarked = () => !!(host.features && host.features.watermark);
  function addWatermark(canvas, scale) {
    const text = "Edited with SiteCleaner · not the original page";
    const size = Math.max(11 * scale, Math.min(17 * scale, canvas.width / 26));
    const bar = Math.round(size * 2.2);
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height + bar;
    const c = out.getContext("2d");
    c.drawImage(canvas, 0, 0);
    c.font = `600 ${size}px system-ui, sans-serif`;
    c.textBaseline = "middle";
    const width = c.measureText(text).width;
    c.save();   // faint tiles over the picture itself
    c.beginPath(); c.rect(0, 0, canvas.width, canvas.height); c.clip();
    c.translate(canvas.width / 2, canvas.height / 2);
    c.rotate(-Math.PI / 8);
    c.globalAlpha = 0.22;
    c.lineWidth = Math.max(2, size / 5);
    c.strokeStyle = "#ffffff"; c.fillStyle = "#000000";   // white edge, black fill: readable on light and on dark
    const reach = Math.hypot(canvas.width, canvas.height);
    for (let y = -reach, row = 0; y < reach; y += size * 5, row++) for (let x = -reach - (row % 2) * width / 2; x < reach; x += width + size * 3) { c.strokeText(text, x, y); c.fillText(text, x, y); }
    c.restore();
    c.fillStyle = "#111111";
    c.fillRect(0, canvas.height, out.width, bar);
    c.fillStyle = "#ffffff";
    c.fillText(text, size * 0.6, canvas.height + bar / 2, out.width - size * 1.2);
    return out;
  }
  async function takeScreenshot() {
    if (!host.capture) { showToast("Screenshots need the Chrome extension."); return false; }
    const targets = structural(selection).filter((el) => el.isConnected);
    let area = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    if (targets.length) {
      const rects = targets.map((el) => el.getBoundingClientRect());
      area = { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) };
      area = { left: Math.max(0, area.left), top: Math.max(0, area.top), right: Math.min(window.innerWidth, area.right), bottom: Math.min(window.innerHeight, area.bottom) };
      if (area.right - area.left < 1 || area.bottom - area.top < 1) { showToast("The selected elements are off the screen: scroll them into view first."); return false; }
    }
    root.style.visibility = "hidden";   // the dock and outlines must not be in the picture
    let dataUrl;
    try {
      await nextFrames(2);
      dataUrl = await host.capture();
    } catch (error) {
      root.style.visibility = "";
      showToast("The screenshot could not be taken: " + (error && error.message ? error.message : "the browser refused"));
      return false;
    }
    root.style.visibility = "";
    const picture = await loadImage(dataUrl);
    const scale = picture.naturalWidth / window.innerWidth;   // the screen's pixels per CSS pixel
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((area.right - area.left) * scale));
    canvas.height = Math.max(1, Math.round((area.bottom - area.top) * scale));
    canvas.getContext("2d").drawImage(picture, Math.round(area.left * scale), Math.round(area.top * scale), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const finished = watermarked() ? addWatermark(canvas, scale) : canvas;
    const blob = await new Promise((resolve) => finished.toBlob(resolve, "image/png"));
    const slug = (targets.length ? (targets.length > 1 ? "selection" : selectorFor(targets[0])) : "page").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40) || "screenshot";
    const url = URL.createObjectURL(blob);
    const link = h("a", { href: url, download: `${slug}.png` });
    root.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`Saved ${slug}.png (${finished.width} × ${finished.height}).`);
    return true;
  }
  keyHooks.push((event) => {
    if (!(event.altKey && event.shiftKey && event.code === "KeyS")) return false;
    event.preventDefault();
    takeScreenshot();
    return true;
  });
