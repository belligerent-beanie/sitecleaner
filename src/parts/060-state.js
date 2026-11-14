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
  let showKeys = false;       // the shortcuts panel
  let showClasses = false;    // the page's classes
  let spacingKeys = "padding"; // what the arrow keys change while the Spacing tool is open: padding or margin
  let tourStep = null;         // the guide page being shown (0-based), or null
  let toastTimer = 0;
  let changesLink = null;      // the "Changes (n)" button in the dock, kept so its count can change without rebuilding the dock
  let exported = true;         // false while there are edits that were not copied or downloaded
  // Edits are kept in layers: "normal" (the element as it is) and one per state (:hover, :focus). `changes` is the layer being edited.
  const STATES = ["hover", "focus", "active"];
  const layers = { normal: new Map(), hover: new Map(), focus: new Map(), active: new Map() };   // layer -> element -> {selector, tag, snippet, props: Map(prop -> {before, after, original}), text}
  let layer = "normal";
  let changes = layers.normal;
  // Features register with these instead of editing the handlers below.
  const pageEventHooks = [];   // (event) => true to take over a click, pointer or double-click on the page (it is not swallowed)
  const keyHooks = [];         // (event) => true if the key was used (checked while the picker is on, after undo and redo)
  const offHooks = [];         // () => called when the picker is turned off
  const refreshHooks = [];     // () => called whenever the outlines are redrawn (a tool that draws its own overlay)
