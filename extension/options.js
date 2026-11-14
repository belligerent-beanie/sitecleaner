// Replaced by scripts/build.mjs with the edition being built (the designer edition when this file is used as it stands).
const EDITION = /*edition*/ { name: "designer", features: {} } /*end*/;
document.body.dataset.edition = EDITION.name;
document.getElementById("title").textContent = chrome.runtime.getManifest().name;
document.title = chrome.runtime.getManifest().name + " options";
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

// ---- the consumer edition: the sites changes are kept on. Each can be switched off, forgotten, or have single changes removed.
const SITE_PREFIX = "site:";
const cut = (text, n) => (text.length > n ? text.slice(0, n - 1) + "…" : text);
function describe(rule) {   // the same words as the picker's panel
  if (rule.k === "text") return `Text “${cut(rule.from.trim(), 22)}” → “${cut(rule.to.trim(), 22)}”`;
  if (/^display:\s*none/.test(rule.d)) return `Hidden: ${cut(rule.b, 40)}`;
  const what = rule.d.split(";").map((part) => part.replace(/\s*!important\s*$/i, "").replace(":", " ")).slice(0, 3).join(", ");
  return `${cut(rule.s, 36)}: ${cut(what, 48)}`;
}
async function save(origin, entry) {
  if (entry.rules.length || (entry.presets && entry.presets.access)) await chrome.storage.local.set({ [SITE_PREFIX + origin]: entry });
  else await chrome.storage.local.remove(SITE_PREFIX + origin);
  await chrome.runtime.sendMessage({ type: "site-sync", origin });
}
async function showSites() {
  if (EDITION.name !== "consumer") return;
  const all = await chrome.storage.local.get(null);
  const origins = Object.keys(all).filter((k) => k.startsWith(SITE_PREFIX)).map((k) => k.slice(SITE_PREFIX.length)).sort();
  document.getElementById("empty").hidden = origins.length > 0;
  const list = document.getElementById("site-list");
  list.replaceChildren();
  for (const origin of origins) {
    const entry = all[SITE_PREFIX + origin];
    const item = document.createElement("li");
    item.className = "site" + (entry.enabled ? "" : " off");
    const head = document.createElement("div");
    head.className = "site-head";
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!entry.enabled;
    box.setAttribute("aria-label", `Apply my changes on ${origin}`);
    box.addEventListener("change", async () => { await save(origin, { ...entry, enabled: box.checked }); showSites(); });
    const name = document.createElement("span");
    name.textContent = origin.replace(/^https?:\/\//, "");
    label.append(box, name);
    const count = document.createElement("span");
    count.className = "count";
    const preset = entry.presets && entry.presets.access;
    const total = entry.rules.length + (preset ? 1 : 0);
    count.textContent = `${total} ${total === 1 ? "change" : "changes"}`;
    const forget = document.createElement("button");
    forget.type = "button";
    forget.textContent = "Forget";
    forget.addEventListener("click", async () => {
      const { presets, ...rest } = entry;
      await save(origin, { ...rest, rules: [] });
      await chrome.permissions.remove({ origins: [origin + "/*"] }).catch(() => { /* not granted, or granted for all sites */ });
      showSites();
    });
    head.append(label, count, forget);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "What is kept";
    const rules = document.createElement("ul");
    rules.className = "rules";
    if (preset && window.__scReadable) {
      const row = document.createElement("li");
      const text = document.createElement("code");
      text.textContent = "Easier to read: " + window.__scReadable.describe(preset);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => { const { presets, ...rest } = entry; await save(origin, rest); showSites(); });
      row.append(text, remove);
      rules.append(row);
    }
    for (const rule of entry.rules) {
      const row = document.createElement("li");
      const text = document.createElement("code");
      text.textContent = describe(rule);
      text.title = rule.b;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => { await save(origin, { ...entry, rules: entry.rules.filter((other) => other.s !== rule.s) }); showSites(); });
      row.append(text, remove);
      rules.append(row);
    }
    details.append(summary, rules);
    item.append(head, details);
    if (entry.stale && entry.stale.length) {
      const warn = document.createElement("p");
      warn.className = "warn";
      warn.textContent = `${entry.stale.length} of these match nothing on the last page you visited (the site may have changed): ${entry.stale.slice(0, 3).map((b) => cut(b, 30)).join(", ")}${entry.stale.length > 3 ? ", …" : ""}`;
      item.append(warn);
    }
    list.append(item);
  }
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && Object.keys(changes).some((k) => k.startsWith(SITE_PREFIX))) showSites(); });
showSites();
