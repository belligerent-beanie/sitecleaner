  // ---------- compare with the original ----------
  // Hold the Compare link (or the \ key) to see the page without your edits; let go and they are back. Nothing is recorded or lost.
  let comparing = null;   // while held: what was swapped out, per element, to put back
  const compareBadge = h("div", { class: "dz-badge", hidden: true, text: "Original: let go to see your changes" });
  root.append(compareBadge);
  function setCompare(want) {
    if (want === !!comparing) return;
    if (want) {
      comparing = [];
      stateSheet.disabled = true;
      for (const [element, rec] of layers.normal) {
        if (!document.contains(element)) continue;
        const stash = [];
        for (const [prop, original] of rec.props) {
          stash.push([prop, element.style.getPropertyValue(prop), element.style.getPropertyPriority(prop)]);
          if (original.value) element.style.setProperty(prop, original.value, original.priority); else element.style.removeProperty(prop);
        }
        const text = rec.text && !element.children.length ? element.textContent : null;
        if (text !== null) element.textContent = rec.text.before;
        comparing.push({ element, stash, text });
      }
    } else {
      for (const { element, stash, text } of comparing) {
        for (const [prop, value, priority] of stash) {
          if (value) element.style.setProperty(prop, value, priority); else element.style.removeProperty(prop);
        }
        if (text !== null && !element.children.length) element.textContent = text;
      }
      comparing = null;
      stateSheet.disabled = false;
    }
    compareBadge.hidden = !comparing;
    refreshBoxes();
  }
  const isEditingField = (t) => t instanceof HTMLElement && (t.isContentEditable || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !/^(range|checkbox|radio|button)$/.test(t.type)));
  window.addEventListener("keyup", (event) => {
    if (event.key === "\\") setCompare(false);
    if (event.key.toLowerCase() === "m" && measuring) { measuring = false; renderMeasure(); }
    if (event.key.toLowerCase() === "g" && guiding) { guiding = false; renderGuides(); }
  }, true);
  window.addEventListener("blur", () => { setCompare(false); if (measuring) { measuring = false; renderMeasure(); } if (guiding) { guiding = false; renderGuides(); } });
