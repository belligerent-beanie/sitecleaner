  // ---------- the dock ----------
  const NO_TEXT_TAGS = new Set(["IMG", "INPUT", "TEXTAREA", "SELECT", "BR", "HR", "SVG", "CANVAS", "VIDEO", "AUDIO", "IFRAME"]);
  function textBlocked(element) {
    if (element.children.length) return "Elements with children may not have text";
    if (NO_TEXT_TAGS.has(element.tagName.toUpperCase())) return "This element has no text to edit";
    return "";
  }
  function closeTool() { tool = null; }
