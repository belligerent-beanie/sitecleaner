const ALL_SITES = { origins: ["<all_urls>"] };
const state = document.getElementById("state");
async function show() { state.textContent = (await chrome.permissions.contains(ALL_SITES)) ? "allowed" : "not allowed"; }
document.getElementById("allow").addEventListener("click", async () => { await chrome.permissions.request(ALL_SITES); show(); });
document.getElementById("revoke").addEventListener("click", async () => { await chrome.permissions.remove(ALL_SITES); show(); });
show();
async function showShortcut() {
  const commands = await chrome.commands.getAll();
  const action = commands.find((command) => command.name === "_execute_action");
  document.getElementById("shortcut").textContent = action && action.shortcut ? action.shortcut : "not set";
}
document.getElementById("shortcuts").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
showShortcut();

// ---- kept sites: switch a site's changes off and on, or forget it
const SITE_PREFIX = "site:";
async function showSites() {
  const all = await chrome.storage.local.get(null);
  const origins = Object.keys(all).filter((k) => k.startsWith(SITE_PREFIX)).map((k) => k.slice(SITE_PREFIX.length)).sort();
  document.getElementById("sites").hidden = !origins.length;
  const list = document.getElementById("site-list");
  list.replaceChildren();
  for (const origin of origins) {
    const entry = all[SITE_PREFIX + origin];
    const item = document.createElement("li");
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!entry.enabled;
    box.addEventListener("change", async () => {
      await chrome.storage.local.set({ [SITE_PREFIX + origin]: { ...entry, enabled: box.checked } });
      await chrome.runtime.sendMessage({ type: "site-sync", origin });
      showSites();
    });
    label.append(box, ` ${origin} (${entry.rules.length} ${entry.rules.length === 1 ? "rule" : "rules"})`);
    const forget = document.createElement("button");
    forget.type = "button";
    forget.textContent = "Forget";
    forget.addEventListener("click", async () => {
      await chrome.storage.local.remove(SITE_PREFIX + origin);
      await chrome.runtime.sendMessage({ type: "site-sync", origin });
      await chrome.permissions.remove({ origins: [origin + "/*"] }).catch(() => { /* not granted, or granted for all sites */ });
      showSites();
    });
    item.append(label, " ", forget);
    if (entry.stale && entry.stale.length) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = `${entry.stale.length} ${entry.stale.length === 1 ? "rule matches" : "rules match"} nothing on the last page visited (the site may have changed): ${entry.stale.slice(0, 3).join(", ")}${entry.stale.length > 3 ? ", …" : ""}`;
      item.append(note);
    }
    list.append(item);
  }
}
showSites();
