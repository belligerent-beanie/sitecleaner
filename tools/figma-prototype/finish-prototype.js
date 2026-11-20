// SiteCleaner Studio mock: finishes the Figma prototype. Run it once in the Figma file
// https://www.figma.com/design/wC0emnt3iN9mTr0WNxFyEK/Untitled   (page "Editor panel (Studio, dark)")
// How: Figma > Plugins > "Scripter" (community plugin) > paste this whole file > Run.
//      Or, in the desktop app: Plugins > Development > New plugin > Run once, and paste it into code.js.
// What it does, in order (safe to run again):
//   1. Adds a Hover variant to every icon button and to Done, using the live build's hover colours.
//   2. Creates one "Button/Chip" component set (Active x State) and swaps every plain chip button for an instance.
//   3. Wires every hover, the chip clicks, and all tutorial navigation (numbers, Back, Next, Done, Close, Open Changes/Keys).
//   4. Deletes what is old: the html.to.design import on "Page 1", the first assembled frame and the standalone dock.
(async () => {
  const log = (...a) => console.log("[SiteCleaner finish]", ...a);
  const page = figma.root.children.find((p) => p.name === "Editor panel (Studio, dark)");
  if (!page) throw new Error('Page "Editor panel (Studio, dark)" not found: open the right file.');
  await figma.setCurrentPageAsync(page);
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
  const S = (h) => ({ type: "SOLID", color: hex(h) });
  const lib = page.findOne((n) => n.type === "FRAME" && n.name === "Components");
  const grid = lib && lib.findOne((n) => n.name === "all buttons");
  if (!grid) throw new Error('"Components" frame not found.');
  const report = {};

  // ---- 1. hover variants for icon buttons and Done
  const targets = lib.findAll((n) => n.type === "COMPONENT" && n.parent.type !== "COMPONENT_SET" && /^(Header|History|View|Mode|Tool|Look|Action)\//.test(n.name) && !n.name.includes("(disabled)") && !/^Mode\/(Whole objects|Icons)/.test(n.name));
  for (const c of targets) {
    const base = c.name; const hov = c.clone(); c.name = "State=Default"; hov.name = "State=Hover";
    hov.fills = [S(base === "Action/Done" ? "#ff7dbb" : "#383843")];
    figma.combineAsVariants([c, hov], grid).name = base;
  }
  report.hoverVariants = targets.length;

  // ---- 2. chip component set, then swap plain chip frames for instances
  let chipSet = lib.findOne((n) => n.type === "COMPONENT_SET" && n.name === "Button/Chip");
  if (!chipSet) {
    const mk = (name, fill, stroke, text) => {
      const c = figma.createComponent(); c.name = name; c.layoutMode = "HORIZONTAL"; c.primaryAxisAlignItems = "CENTER"; c.counterAxisAlignItems = "CENTER";
      c.primaryAxisSizingMode = "FIXED"; c.counterAxisSizingMode = "FIXED"; c.resize(60, 29.5); c.cornerRadius = 6; c.fills = [S(fill)]; c.strokes = [S(stroke)]; c.strokeWeight = 1;
      const t = figma.createText(); t.fontName = { family: "Inter", style: "Regular" }; t.fontSize = 13; t.characters = "Label"; t.fills = [S(text)]; t.name = "label"; c.appendChild(t); grid.appendChild(c); return c;
    };
    chipSet = figma.combineAsVariants([
      mk("Active=false, State=Default", "#2b2b33", "#55555f", "#f3f3f6"), mk("Active=false, State=Hover", "#383843", "#55555f", "#f3f3f6"),
      mk("Active=true, State=Default", "#ff5ca8", "#ff5ca8", "#1f1f24"), mk("Active=true, State=Hover", "#ff7dbb", "#ff5ca8", "#1f1f24"),
    ], grid);
    chipSet.name = "Button/Chip";
  }
  const chip = (active, hover) => chipSet.findOne((c) => c.name === `Active=${active}, State=${hover ? "Hover" : "Default"}`);
  const frames = page.children.filter((n) => n.type === "FRAME" && n.name.startsWith("State/"));
  let swapped = 0;
  for (const f of frames) {
    for (const n of f.findAll((m) => m.type === "FRAME" && m.name.startsWith("Button/") && m.layoutMode === "HORIZONTAL")) {
      if (n.opacity < 1 || !n.children.length || n.children[0].type !== "TEXT") continue;
      const fl = n.fills[0]; const active = !!fl && fl.type === "SOLID" && fl.color.r > 0.95 && fl.color.g < 0.45;
      const label = n.children[0].characters; const parent = n.parent; const i = parent.children.indexOf(n);
      const inst = chip(active, false).createInstance(); parent.insertChild(i, inst);
      inst.resize(n.width, n.height); inst.x = n.x; inst.y = n.y; inst.name = n.name; inst.children[0].characters = label; n.remove(); swapped++;
    }
  }
  report.chipsSwapped = swapped;

  // ---- 3. wiring
  const byName = Object.fromEntries(frames.map((f) => [f.name.replace("State/", ""), f]));
  const dest = (label) => (byName[label] ? byName[label].id : null);
  const click = (id) => ({ trigger: { type: "ON_CLICK" }, actions: [{ type: "NODE", destinationId: id, navigation: "NAVIGATE", transition: { type: "DISSOLVE", easing: { type: "EASE_OUT" }, duration: 0.12 }, resetVideoPosition: false }] });
  const change = (trigger, id) => ({ trigger: { type: trigger }, actions: [{ type: "NODE", destinationId: id, navigation: "CHANGE_TO", transition: { type: "SMART_ANIMATE", easing: { type: "EASE_OUT" }, duration: 0.1 }, resetVideoPosition: false }] });
  const isChange = (r) => (r.actions || []).some((a) => a && a.navigation === "CHANGE_TO");
  let hovers = 0, tutorialClicks = 0, chipClicks = 0;
  for (const f of frames) {
    const m = f.name.match(/Tutorial \(step (\d)\)/); const step = m ? +m[1] : 0;
    for (const inst of f.findAllWithCriteria({ types: ["INSTANCE"] })) {
      const mc = await inst.getMainComponentAsync(); if (!mc) continue;
      const set = mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent : null;
      let nav = null;
      if (step) {
        const nm = inst.name.replace(" (disabled)", ""); const num = nm.match(/^Button\/(\d)$/);
        if (num) nav = dest(`Tutorial (step ${num[1]})`);
        else if (nm === "Button/Back" && step > 1) nav = dest(`Tutorial (step ${step - 1})`);
        else if (nm === "Button/Next" && step < 9) nav = dest(`Tutorial (step ${step + 1})`);
        else if (nm === "Action/Done") nav = dest("No selection");
        else if (nm === "Button/Open Changes") nav = dest("View: Changes");
        else if (nm === "Button/Open Keys") nav = dest("View: Keys");
      }
      let reacts = (inst.reactions || []).filter((r) => r.trigger && r.trigger.type !== "ON_HOVER" && !isChange(r));
      if (nav) { reacts = reacts.filter((r) => r.trigger.type !== "ON_CLICK"); reacts.push(click(nav)); tutorialClicks++; }
      else if (set && mc.name.includes("Active=false")) { reacts.push(change("ON_CLICK", chip(true, false).id)); chipClicks++; }
      if (set) {
        const hv = set.children.find((c) => c.name === mc.name.replace("State=Default", "State=Hover"));
        if (hv) { reacts.push(change("ON_HOVER", hv.id)); hovers++; }
      }
      await inst.setReactionsAsync(reacts);
    }
    // heading selects the element; Close in the tutorial returns to the page
    const sel = dest("Selected h1 (choose a tool)");
    const h1 = f.findOne((n) => n.type === "TEXT" && n.name === "Page/h1"); if (h1 && sel && sel !== f.id) await h1.setReactionsAsync([click(sel)]);
    if (step) { const close = f.findOne((n) => n.name === "Link/Close"); if (close) await close.setReactionsAsync([click(dest("No selection"))]); }
  }
  Object.assign(report, { hovers, tutorialClicks, chipClicks });

  // ---- 4. cleanup of anything old
  const removed = [];
  for (const [id, name] of [["5:135", "Site with SiteCleaner on (Studio, dark)"], ["2:344", "SiteCleaner Studio — editor panel"]]) {
    const n = await figma.getNodeByIdAsync(id); if (n && n.name === name) { n.remove(); removed.push(name); }
  }
  const p1 = figma.root.children.find((p) => p.name === "Page 1");
  if (p1) { await p1.loadAsync(); for (const n of p1.children.slice()) if (/live\.html|html\.to\.design/i.test(n.name)) { removed.push("Page 1/" + n.name); n.remove(); } report.page1Left = p1.children.map((n) => n.name); }
  report.removed = removed;
  page.flowStartingPoints = [{ nodeId: dest("No selection"), name: "Start: picker on, nothing selected" }];
  log(JSON.stringify(report, null, 2));
  figma.notify(`Done: ${hovers} hovers, ${tutorialClicks} tutorial clicks, ${chipClicks} chip clicks, ${removed.length} old items removed`);
})().catch((e) => { console.error(e); figma.notify("Failed: " + e.message, { error: true }); });
