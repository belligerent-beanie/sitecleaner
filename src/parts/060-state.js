  // ---------- state ----------
  let on = false;
  let selected = null;         // the element the tools show the values of: the last one picked
  let selection = [];          // everything selected (Shift-click adds); the tools change all of it
  let hovered = null;
  let climbed = [];            // the elements we came up from, so ↓ goes back the way we came
  let menuOpen = false;
  let tool = null;             // "fill" | "border" | "shadow" | "text" | "font" | "size" | "spacing" | "radius" | "layout" | "tone" | "move" | "position" | "image" | null
  let showChanges = false;
  let showPreview = false;    // the screen-size preview panel
  let showFind = false;       // the find-by-selector panel
  let tourStep = null;         // the guide page being shown (0-based), or null
  let toastTimer = 0;
  let changesLink = null;      // the "Changes (n)" button in the dock, kept so its count can change without rebuilding the dock
  let exported = true;         // false while there are edits that were not copied or downloaded
  const changes = new Map();   // element -> {selector, tag, snippet, props: Map(prop -> {before, after, original}), text}
  // Features register with these instead of editing the handlers below.
  const pageEventHooks = [];   // (event) => true to take over a click, pointer or double-click on the page (it is not swallowed)
  const keyHooks = [];         // (event) => true if the key was used (checked while the picker is on, after undo and redo)
  const offHooks = [];         // () => called when the picker is turned off
  const refreshHooks = [];     // () => called whenever the outlines are redrawn (a tool that draws its own overlay)
