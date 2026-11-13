
  // ---------- editing text in place ----------
  // Adapted from VisBug (Apache-2.0, https://github.com/GoogleChromeLabs/ProjectVisBug), app/features/text.js: double-click any text on the
  // page and type. Modified: only text with nothing inside it (as the Text tool), the whole session is one undo step and is recorded as a
  // text change (so it is saved and exported), and Enter or Escape ends it (Shift + Enter adds a line break).
  let textEditing = null;   // {element, before, was}: the element being edited, its text when editing began, its contenteditable attribute
  function startTextEdit(element) {
    if (!element || ours(element) || textBlocked(element)) { if (element && !ours(element)) showToast("Double-click the words themselves: " + (textBlocked(element) || "").toLowerCase()); return false; }
    finishTextEdit();
    select(element);
    checkpoint("text", element);   // the text as it is now: one step for the whole session
    holdStep = true;
    textEditing = { element, before: element.textContent, was: element.getAttribute("contenteditable") };
    try { element.contentEditable = "plaintext-only"; } catch (_) { element.contentEditable = "true"; }
    if (element.contentEditable !== "plaintext-only") element.contentEditable = "true";
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const picked = window.getSelection();
    picked.removeAllRanges();
    picked.addRange(range);
    element.addEventListener("input", typedInPlace);
    return true;
  }
  function typedInPlace() {
    if (!textEditing) return;
    const { element, before } = textEditing;
    checkpoint("text", element);   // merges into the step begun when editing started
    const rec = record(element);
    if (!rec.text) rec.text = { before, after: before };
    rec.text.after = element.textContent;
    edited();
  }
  function finishTextEdit() {
    if (!textEditing) return;
    const { element, was } = textEditing;
    element.removeEventListener("input", typedInPlace);
    if (was === null) element.removeAttribute("contenteditable"); else element.setAttribute("contenteditable", was);
    window.getSelection().removeAllRanges();
    holdStep = false;
    textEditing = null;
    renderDock();
  }
  offHooks.push(finishTextEdit);

  pageEventHooks.push((event) => {
    if (textEditing) {   // clicks inside the text being edited reach it (the caret, a selection); a click anywhere else ends the edit
      if (textEditing.element.contains(eventTarget(event))) return true;
      if (event.type === "pointerdown" || event.type === "mousedown" || event.type === "click") finishTextEdit();
      return false;
    }
    if (event.type === "dblclick") {
      event.preventDefault();
      event.stopImmediatePropagation();
      startTextEdit(eventTarget(event));
      return true;
    }
    return false;
  });
  keyHooks.unshift((event) => {   // while typing in the page's text, no shortcut may fire
    if (!textEditing) return false;
    if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) { event.preventDefault(); finishTextEdit(); return true; }
    return true;
  });
