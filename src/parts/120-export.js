  // ---------- export ----------
  // Colours in the export are written the way the designer's tokens are: hex, rgb() or hsl() (a setting in the Changes panel, remembered).
  // Only the properties that carry a colour are converted, so words the designer typed are never rewritten.
  const NOTATIONS = ["hex", "rgb", "hsl"];
  const COLOUR_PROPS = ["background-color", "color", "border", "box-shadow"];
  const notation = () => (NOTATIONS.includes(host.getPref("colours")) ? host.getPref("colours") : "hex");
  function hslText(r, g, b, alpha) {
    const [hue, sat, val] = rgbToHsv(r, g, b);
    const light = val * (1 - sat / 2);
    const s = light === 0 || light === 1 ? 0 : (val - light) / Math.min(light, 1 - light);
    const text = `${Math.round(hue)}, ${Math.round(s * 100)}%, ${Math.round(light * 100)}%`;
    return alpha === undefined ? `hsl(${text})` : `hsla(${text}, ${alpha})`;
  }
  const colourIn = (value) => {
    const mode = notation();
    if (mode === "hex") return value;
    return value
      .replace(/#[0-9a-f]{6}\b/gi, (hex) => { const [r, g, b] = parseHex(hex); return mode === "rgb" ? `rgb(${r}, ${g}, ${b})` : hslText(r, g, b); })
      .replace(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/g, (all, r, g, b, a) => (mode === "rgb" ? all : hslText(+r, +g, +b, a)));
  };
  /** One text block per changed element: its selector (and a snippet of its text to confirm it), then each before → after. */
  function exportBlocks() {
    const blocks = [];
    for (const [element, rec] of [...changes.entries(), ...pending.map((item) => [null, item])]) {
      if (element && !element.isConnected) continue;   // removed from the page: its style edits are moot
      const lines = [];
      for (const prop of ["background-color", "color", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "border", "border-radius", "box-shadow", "padding", "margin", "width", "height", "display", "flex-direction", "flex-wrap", "justify-content", "align-items", "justify-items", "gap", "opacity", "position", "top", "left", "z-index", "background-image"]) {
        const after = rec.after && rec.after[prop];
        const say = COLOUR_PROPS.includes(prop) ? (value) => colourIn(String(value)) : (value) => String(value);
        if (after !== undefined && after !== rec.before[prop]) lines.push(`  ${prop}: ${shorten(say(rec.before[prop]), 110)} → ${shorten(say(after), 110)}`);
      }
      if (element && document.contains(element) && rec.before.contrast && rec.after && (rec.after["background-color"] !== undefined || rec.after.color !== undefined)) {
        const info = contrastInfo(element);
        if (contrastLabel(info) !== rec.before.contrast) lines.push(`  contrast: ${rec.before.contrast} → ${contrastLabel(info)}${info.unknown ? "" : ` (WCAG AA ${info.aa ? "pass" : "fail"}, APCA Lc ${Math.round(info.apca)})`}`);
      }
      if (rec.text && rec.text.after !== rec.text.before) lines.push(`  text: ${JSON.stringify(rec.text.before)} → ${JSON.stringify(rec.text.after)}`);
      if (!lines.length) continue;   // changed and changed back: nothing to hand over
      blocks.push([rec.selector + (rec.snippet ? `  (${JSON.stringify(rec.snippet)})` : ""), ...lines].join("\n"));
    }
    return blocks;
  }
  /** What gets copied or downloaded: a short heading that tells whoever reads it (a developer or Claude) what it is, then the blocks.
   *  It is meant to be pasted into a chat with Claude, who can then make the same changes in the source files. */
  function exportMarkdown() {
    const blocks = exportBlocks();
    const structure = structureLines();
    if (!blocks.length && !structure.length) return "";
    const sized = blocks.some((block) => /^  (width|height):/m.test(block));
    return [
      "# UI changes from the designer picker",
      `Page: ${location.origin + location.pathname}`,
      `Viewport: ${window.innerWidth}×${window.innerHeight} · ${new Date().toISOString().slice(0, 10)}`,
      "Each block is one element: its selector (with a snippet of its text to confirm it), then before → after. Apply these in the source code.",
      ...(sized ? ["Width and height are fixed pixel sizes set in this window: when applying them keep the layout working on smaller screens (min-width, percentages or clamp())."] : []),
      "",
      blocks.join("\n\n"),
      ...(structure.length ? [blocks.length ? "" : null, "## Structure changes (in the order they were made)", ...structure.map((line) => "- " + line)].filter((line) => line !== null) : []),
      "",
    ].join("\n");
  }
  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  }
  function fileName() {
    const slug = location.pathname.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    return `ui-changes-${slug || "home"}.md`;
  }
  function downloadExport() {
    const name = fileName();
    const url = URL.createObjectURL(new Blob([exportMarkdown()], { type: "text/markdown" }));
    const link = h("a", { href: url, download: name });
    root.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    exported = true;
    return name;
  }
  /** Copy every change to the clipboard (the Alt+Shift+E shortcut and the Copy button); if the browser refuses, download it instead. */
  async function copyChanges() {
    const count = exportBlocks().length + structureLines().length;
    if (!count) { showToast("No changes to export yet."); return false; }
    const text = exportMarkdown();
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
      const area = h("textarea", { class: "dz-offscreen", "aria-hidden": "true" });
      area.value = text;
      root.append(area);
      area.select();
      try { ok = document.execCommand("copy"); } catch (_e) { ok = false; }
      area.remove();
    }
    if (ok) {
      exported = true;
      showToast("Copied to Clipboard");
    } else {
      showToast(`The browser blocked copying, so ${downloadExport()} was downloaded instead.`);
    }
    return true;
  }
