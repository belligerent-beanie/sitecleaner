// The page that asks, once per site, for permission to keep changes there. Chrome only lets an extension page (not a content script) ask, and only
// from a click, which is why this window exists. The worker holds the changes while this page asks; the site is named by the worker, from the tab.
const token = new URLSearchParams(location.search).get("token");
const done = document.getElementById("done");
const allow = document.getElementById("allow");
chrome.runtime.sendMessage({ type: "keep-info", token }).then((info) => {
  if (!info || info.error) { done.textContent = (info && info.error) || "This request has expired. Close this window and press Keep again."; allow.disabled = true; return; }
  document.getElementById("site").textContent = info.origin;
  const parts = [info.count ? `${info.count} style ${info.count === 1 ? "rule" : "rules"}` : "", info.settings ? "your easier-to-read settings" : ""].filter(Boolean);
  document.getElementById("what").textContent = `${parts.join(" and ")} will be kept.`;
  allow.addEventListener("click", async () => {
    allow.disabled = true;
    const granted = await chrome.permissions.request({ origins: [info.origin + "/*"] });
    if (!granted) { done.textContent = "Not allowed, so nothing was kept."; allow.disabled = false; return; }
    const answer = await chrome.runtime.sendMessage({ type: "keep-confirm", token });
    done.textContent = (answer && answer.message) || "Could not keep the changes.";
    if (answer && answer.ok) setTimeout(() => window.close(), 1200);
  });
});
document.getElementById("cancel").addEventListener("click", () => { chrome.runtime.sendMessage({ type: "keep-cancel", token }); window.close(); });
