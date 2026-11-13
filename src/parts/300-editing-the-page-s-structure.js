
  // ---------- editing the page's structure from the keyboard ----------
  // Adapted from VisBug (Apache-2.0, https://github.com/GoogleChromeLabs/ProjectVisBug), app/features/selectable.js: delete, duplicate,
  // copy, cut and paste of elements, group and ungroup, expanding the selection to similar elements, and walking the siblings with Tab.
  // Modified: every change is an op (see "structure" above), so it can be undone and redone, is kept across reloads and is in the export;
  // pasted markup is cleaned (no scripts or event handlers); body and html are never removed or moved.
  // Delete / Backspace         remove the selected elements          Alt + Delete        clear the edits made to them
  // Ctrl + D                   duplicate (the copy sits right after) Ctrl + G            group them in a div; Ctrl + Shift + G ungroup
  // Ctrl + C / X / V           copy, cut and paste elements          Ctrl + E            select the next similar element; with Shift, all
  // Tab / Shift + Tab          next / previous sibling               Ctrl + Shift + Enter select all their children
  const structural = (list) => list.filter((el) => el.parentNode && el !== document.body && el !== document.documentElement && !ours(el));
  /** After a structural change: show the new selection (or none) and redraw. */
  function structureDone(newSelection) {
    if (newSelection) setSelection(newSelection);
    climbed = [];
    renderDock();
    refreshBoxes();
  }
  const similarQuery = (el) => `${el.nodeName.toLowerCase()}${[...el.classList].filter((name) => !hashed(name)).map((name) => "." + cssEscape(name)).join("")}`;

  function removeSelected() {
    const nodes = structural(selection);
    if (!nodes.length) return;
    // as VisBug does: what is selected afterwards is the neighbour the removed element had
    const after = [...new Set(nodes.map((el) => el.nextElementSibling || el.previousElementSibling || el.parentElement).filter((el) => el && !nodes.includes(el)))];
    doOps(nodes.map(removeOp));
    structureDone(after);
    showToast(`Removed ${nodes.length > 1 ? nodes.length + " elements" : label(nodes[0])}. Ctrl+Z puts ${nodes.length > 1 ? "them" : "it"} back.`);
  }
  function duplicateSelected() {
    const nodes = structural(selection);
    if (!nodes.length) return;
    const list = nodes.map(duplicateOp);
    doOps(list);
    structureDone(list.map((op) => op.copy));
  }
  function groupSelected() {
    const nodes = structural(selection);
    if (!nodes.length) return;
    const op = wrapOp(nodes);
    doOps([op]);
    structureDone([op.wrapper]);
  }
  function ungroupSelected() {
    const nodes = structural(selection).filter((el) => el.childNodes.length);
    if (!nodes.length) return;
    const kids = nodes.flatMap((el) => [...el.children]);
    doOps(nodes.map(unwrapOp));
    structureDone(kids);
  }
  /** Alt + Delete: put the selected elements back as the page had them (their style and text edits; not structure). */
  function clearSelectedEdits() {
    const edited = selection.filter((el) => changes.has(el));
    if (!edited.length) { showToast("Nothing has been changed on the selected elements."); return; }
    pushStep(edited.map(snapshotOf), false);
    bulk++;
    try { for (const el of edited) resetElement(el); } finally { bulk--; }
    renderDock();
  }
  function selectSimilar(all) {
    if (!selected) return;
    let found = [];
    try { found = [...document.querySelectorAll(similarQuery(selected))].filter((el) => !ours(el)); } catch (_) { return; }
    if (all) setSelection([...new Set([...selection, ...found])]);
    else {
      const start = found.indexOf(selected);
      const next = [...found.slice(start + 1), ...found.slice(0, start)].find((el) => !selection.includes(el));
      if (!next) return;
      setSelection([...selection, next]);
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    renderDock();
    refreshBoxes();
  }
  function selectChildren() {
    const kids = selection.flatMap((el) => [...el.children]).filter((el) => !ours(el));
    if (kids.length) structureDone(kids);
  }
  function walkSiblings(back) {
    const next = new Set();
    for (const el of selection) {
      const sibling = back ? el.previousElementSibling : el.nextElementSibling;
      next.add(sibling && !ours(sibling) ? sibling : el);
    }
    structureDone([...next]);
    if (selected) selected.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  // copy, cut and paste work on the page's elements as the browser's own clipboard events (so the menu works too), but only when
  // the picker is on, something is selected and no text is selected or being typed
  let clipboardHtml = "";
  const clipboardIsOurs = (event) => on && selection.length && !isEditingField(eventTarget(event)) && !String(window.getSelection()).length;
  document.addEventListener("copy", (event) => {
    if (!clipboardIsOurs(event)) return;
    const first = structural(selection)[0];
    if (!first) return;
    event.preventDefault();
    clipboardHtml = first.outerHTML;
    event.clipboardData.setData("text/html", clipboardHtml);
    event.clipboardData.setData("text/plain", clipboardHtml);
    showToast(`Copied ${label(first)}. Select another element and paste it into that.`);
  }, true);
  document.addEventListener("cut", (event) => {
    if (!clipboardIsOurs(event)) return;
    const first = structural(selection)[0];
    if (!first) return;
    event.preventDefault();
    clipboardHtml = first.outerHTML;
    event.clipboardData.setData("text/html", clipboardHtml);
    event.clipboardData.setData("text/plain", clipboardHtml);
    const after = first.nextElementSibling || first.previousElementSibling || first.parentElement;
    doOps([removeOp(first)]);
    structureDone(after ? [after] : []);
  }, true);
  document.addEventListener("paste", (event) => {
    if (!clipboardIsOurs(event)) return;
    const picture = [...(event.clipboardData.files || [])].find((file) => /^image\//.test(file.type));
    if (picture && imageTargetsOf(selection).length) { event.preventDefault(); swapFromFiles([picture], imageTargetsOf(selection)); return; }
    const html = event.clipboardData.getData("text/html") || event.clipboardData.getData("text/plain") || clipboardHtml;
    if (!/<[a-z][\s\S]*>/i.test(html)) return;   // not markup: the page may have a use for it
    const into = selection.filter((el) => el.nodeType === 1 && el !== document.documentElement);
    if (!into.length) return;
    event.preventDefault();
    const list = into.map((parent) => insertOp(parent, html, null));   // as VisBug does, as the last child of each selected element
    doOps(list);
    structureDone(list.flatMap((op) => op.nodes.filter((node) => node.nodeType === 1)));
  }, true);

  keyHooks.push((event) => {
    if (!selection.length || isEditingField(eventTarget(event))) return false;
    const mod = event.ctrlKey || event.metaKey, key = event.key;
    if ((key === "Delete" || key === "Backspace") && !mod) {
      event.preventDefault();
      if (event.altKey) clearSelectedEdits(); else removeSelected();
      return true;
    }
    if (mod && !event.altKey && key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); return true; }
    if (mod && !event.altKey && key.toLowerCase() === "g") { event.preventDefault(); if (event.shiftKey) ungroupSelected(); else groupSelected(); return true; }
    if (mod && !event.altKey && key.toLowerCase() === "e") { event.preventDefault(); selectSimilar(event.shiftKey); return true; }
    if (mod && event.shiftKey && key === "Enter") { event.preventDefault(); selectChildren(); return true; }
    if (key === "Tab" && !mod && !event.altKey && !ours(eventTarget(event))) { event.preventDefault(); walkSiblings(event.shiftKey); return true; }
    return false;
  });
