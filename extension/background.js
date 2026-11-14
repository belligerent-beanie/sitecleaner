// The extension's service worker. The toolbar button (or Alt+Shift+P) injects the picker into the current tab and toggles it. With only
// "activeTab", that is all it may touch: the tab the designer just asked about, until they leave it. Screen-size previews open a second
// window and need the optional "all sites" permission to put the picker's edits on it, and the same permission is what lets saved edits come
// back by themselves after a reload (see options.html).

const FILES = ["host.js", "designer-css.js", "designer.js"];   // host first: it sets window.__designerHost for the picker
const ALL_SITES = { origins: ["<all_urls>"] };

async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
}

async function toggle(tab) {
  if (!tab || tab.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle" });   // already in the page
  } catch (_) {
    try {
      await inject(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
    } catch (_error) {   // chrome:// pages, the Web Store, a PDF: the browser does not allow it
      chrome.action.setBadgeText({ tabId: tab.id, text: "×" });
      chrome.action.setTitle({ tabId: tab.id, title: "The SiteCleaner cannot run on this page" });
    }
  }
}
chrome.action.onClicked.addListener(toggle);

// ---- putting saved edits back after a reload, by itself (only while the designer has allowed all sites)
// Without that permission the extension cannot act on a page until asked, so after a reload the picker has to be turned on again, which
// restores the edits. With it, a small script (restore.js) runs on every page, checks whether this page has saved edits and, only if it
// does, has the worker put the picker (off) on the page.
const RESTORER = { id: "restore", matches: ["<all_urls>"], js: ["restore.js"], runAt: "document_idle", persistAcrossSessions: true };
async function syncRestorer() {
  const allowed = await chrome.permissions.contains(ALL_SITES);
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [RESTORER.id] })).length > 0;
  if (allowed && !registered) await chrome.scripting.registerContentScripts([RESTORER]);
  else if (!allowed && registered) await chrome.scripting.unregisterContentScripts({ ids: [RESTORER.id] });
}
chrome.runtime.onInstalled.addListener(syncRestorer);
chrome.runtime.onStartup.addListener(syncRestorer);
chrome.permissions.onAdded.addListener(syncRestorer);
chrome.permissions.onRemoved.addListener(syncRestorer);

// ---- keeping the picker on across a reload (only while the designer has allowed all sites)
// The picker tells the worker whenever it is turned on or off. A tab that had it on, and then loads a page of the same site again (a reload, or a
// click on a link), gets it back on by itself. Session storage, because a service worker forgets everything when it is stopped; and gone with the tab.
const onTabs = {
  async all() { return (await chrome.storage.session.get("on-tabs"))["on-tabs"] || {}; },
  async set(tabId, origin) { const all = await this.all(); all[tabId] = origin; await chrome.storage.session.set({ "on-tabs": all }); },
  async remove(tabId) { const all = await this.all(); if (tabId in all) { delete all[tabId]; await chrome.storage.session.set({ "on-tabs": all }); } },
};
async function ensureOn(tabId) {
  try { await chrome.tabs.sendMessage(tabId, { type: "ping" }); } catch (_) { await inject(tabId); }
  await chrome.tabs.sendMessage(tabId, { type: "set", on: true });
}
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== "complete") return;
  const origin = (await onTabs.all())[tabId];
  if (!origin || !(await chrome.permissions.contains(ALL_SITES))) return;
  try { if (new URL(tab.url).origin === origin) await ensureOn(tabId); } catch (_) { /* a page that does not allow scripts */ }
});
chrome.tabs.onRemoved.addListener((tabId) => { onTabs.remove(tabId); });

// ---- screen-size previews: a real window of that size, with the same saved edits on the page
// What is known about each preview tab lives in session storage (a service worker is stopped and restarted whenever it is idle).
const previewTabs = {
  async all() { return (await chrome.storage.session.get("preview-tabs"))["preview-tabs"] || {}; },
  async get(tabId) { return (await this.all())[tabId]; },
  async set(tabId, info) { const all = await this.all(); all[tabId] = info; await chrome.storage.session.set({ "preview-tabs": all }); },
  async remove(tabId) { const all = await this.all(); delete all[tabId]; await chrome.storage.session.set({ "preview-tabs": all }); },
};

async function openPreview({ url, width, height }) {
  if (!(await chrome.permissions.contains(ALL_SITES))) {
    return { error: "Previews need the extension's \"all sites\" permission: right-click its icon, choose Options, and allow it." };
  }
  const win = await chrome.windows.create({ url, type: "popup", width, height });
  const tab = win.tabs && win.tabs[0];
  if (tab) await previewTabs.set(tab.id, { windowId: win.id, width, height, sized: false });
  return { ok: true, windowId: win.id };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "who") {
    previewTabs.get(sender.tab ? sender.tab.id : -1).then((info) => respond({ preview: !!info }));
    return true;
  }
  if (message.type === "capture") {   // a picture of the visible part of the tab that asked (activeTab, or the all-sites permission, allows it)
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }).then((dataUrl) => respond({ dataUrl }), (error) => respond({ error: String((error && error.message) || error) }));
    return true;
  }
  if (message.type === "on") {
    if (sender.tab) (message.on ? onTabs.set(sender.tab.id, message.origin) : onTabs.remove(sender.tab.id));
    return false;
  }
  if (message.type === "restore") {
    if (sender.tab) inject(sender.tab.id).catch(() => { /* a page that does not allow scripts */ });
    return false;
  }
  if (message.type === "preview") {
    openPreview(message).then(respond, (error) => respond({ error: String((error && error.message) || error) }));
    return true;
  }
  return false;
});

// A preview window gets the picker (in preview mode: no dock, just the edits) every time its page loads, and is sized once so that
// the inside of the window, not its frame, is the size asked for.
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (change.status !== "complete") return;
  const info = await previewTabs.get(tabId);
  if (!info) return;
  try {
    await inject(tabId);
    if (!info.sized) {
      const [frame] = await chrome.scripting.executeScript({ target: { tabId }, func: () => [outerWidth - innerWidth, outerHeight - innerHeight] });
      const [dx, dy] = (frame && frame.result) || [0, 0];
      await chrome.windows.update(info.windowId, { width: info.width + dx, height: info.height + dy });
      await previewTabs.set(tabId, { ...info, sized: true });
    }
  } catch (_) { /* the page may not allow scripts */ }
});
chrome.tabs.onRemoved.addListener((tabId) => { previewTabs.remove(tabId); });

// ---- kept sites (the consumer edition's "Keep on this site")
// A site the user keeps changes on is `site:<origin>` in storage: {enabled, rules: [{s, b, d}], stale, updated}. For each such site that is enabled, and whose
// permission is still granted, the loader (apply.js) is registered for that origin alone. The origin always comes from the tab that asked, never from the message.
const SITE_PREFIX = "site:";
const siteScriptId = (origin) => "site-" + origin;
const sitePattern = (origin) => origin + "/*";
const webOrigin = (url) => { try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null; } catch (_) { return null; } };

async function syncSite(origin) {
  const id = siteScriptId(origin);
  const stored = (await chrome.storage.local.get(SITE_PREFIX + origin))[SITE_PREFIX + origin];
  const wanted = !!(stored && stored.enabled && stored.rules && stored.rules.length) && (await chrome.permissions.contains({ origins: [sitePattern(origin)] }));
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length > 0;
  const script = { id, matches: [sitePattern(origin)], js: ["apply.js"], runAt: "document_start", persistAcrossSessions: true };
  if (wanted && !registered) await chrome.scripting.registerContentScripts([script]);
  else if (!wanted && registered) await chrome.scripting.unregisterContentScripts({ ids: [id] });
}
async function syncAllSites() {
  const all = await chrome.storage.local.get(null);
  const origins = Object.keys(all).filter((k) => k.startsWith(SITE_PREFIX)).map((k) => k.slice(SITE_PREFIX.length));
  const registered = (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id).filter((id) => id.startsWith("site-")).map((id) => id.slice(5));
  for (const origin of new Set([...origins, ...registered])) { try { await syncSite(origin); } catch (_) { /* one bad entry must not stop the rest */ } }
}
chrome.runtime.onInstalled.addListener(syncAllSites);
chrome.runtime.onStartup.addListener(syncAllSites);
chrome.permissions.onRemoved.addListener(syncAllSites);

/** Add (or replace, rule by rule) the rules of a site and turn the loader on for it. */
async function saveSite(origin, rules) {
  const key = SITE_PREFIX + origin;
  const old = (await chrome.storage.local.get(key))[key];
  const merged = new Map(((old && old.rules) || []).map((rule) => [rule.s, rule]));   // what was kept before stays unless the same rule is made again
  for (const rule of rules) merged.set(rule.s, rule);
  const list = [...merged.values()];
  await chrome.storage.local.set({ [key]: { enabled: true, rules: list, stale: [], updated: Date.now() } });
  await syncSite(origin);
  return list.length;
}
const validRule = (r) => !!r && typeof r.s === "string" && typeof r.b === "string" && r.s.length < 2000 && r.b.length < 2000
  && (r.k === "text" ? typeof r.from === "string" && typeof r.to === "string" && r.from.length < 5000 && r.to.length < 5000
    : r.k === undefined && typeof r.d === "string" && r.d.length < 4000 && !/[{}]/.test(r.s + r.b + r.d));   // braces would let a rule close itself and start another
const validRules = (rules) => Array.isArray(rules) && rules.length > 0 && rules.length <= 2000 && rules.every(validRule);
const skippedNote = (skipped) => {
  const left = skipped ? (skipped.text || 0) + (skipped.structure || 0) + (skipped.notOnPage || 0) : 0;
  return left ? ` (${left} ${left === 1 ? "change" : "changes"} that are not styles were left out)` : "";
};

const pendingKeeps = {
  async get(token) { return (await chrome.storage.session.get("keep:" + token))["keep:" + token]; },
  async set(token, info) { await chrome.storage.session.set({ ["keep:" + token]: info }); },
  async remove(token) { await chrome.storage.session.remove("keep:" + token); },
};

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "keep") {
    (async () => {
      const origin = sender.tab && webOrigin(sender.tab.url);
      if (!origin) return { message: "Changes can only be kept on web pages." };
      if (!validRules(message.rules)) return { message: "Nothing to keep." };
      if (await chrome.permissions.contains({ origins: [sitePattern(origin)] })) {   // asked before for this site (or allowed everywhere): no question needed
        const count = await saveSite(origin, message.rules);
        return { ok: true, message: `Kept on ${new URL(origin).host}: ${count} ${count === 1 ? "rule" : "rules"}${skippedNote(message.skipped)}.` };
      }
      const token = crypto.randomUUID();
      await pendingKeeps.set(token, { origin, rules: message.rules, skipped: message.skipped || null });
      await chrome.windows.create({ url: chrome.runtime.getURL("keep.html?token=" + token), type: "popup", width: 460, height: 330 });
      return { message: "A window opened to ask for this site." };
    })().then(respond, (error) => respond({ message: String((error && error.message) || error) }));
    return true;
  }
  if (message.type === "keep-info") {
    pendingKeeps.get(message.token).then((info) => respond(info ? { origin: info.origin, count: info.rules.length } : { error: "This request has expired. Close this window and press Keep again." }));
    return true;
  }
  if (message.type === "keep-confirm") {
    (async () => {
      const info = await pendingKeeps.get(message.token);
      if (!info) return { message: "This request has expired. Close this window and press Keep again." };
      if (!(await chrome.permissions.contains({ origins: [sitePattern(info.origin)] }))) return { message: "Not allowed, so nothing was kept." };
      const count = await saveSite(info.origin, info.rules);
      await pendingKeeps.remove(message.token);
      return { ok: true, message: `Kept: ${count} ${count === 1 ? "rule" : "rules"}${skippedNote(info.skipped)}. Reload the site to see them apply by themselves.` };
    })().then(respond, (error) => respond({ message: String((error && error.message) || error) }));
    return true;
  }
  if (message.type === "keep-remove" || message.type === "keep-enable") {   // from the picker: take one rule away, or switch the site's changes off or on
    (async () => {
      const origin = sender.tab && webOrigin(sender.tab.url);
      const key = origin && SITE_PREFIX + origin;
      const entry = key && (await chrome.storage.local.get(key))[key];
      if (!entry) return { ok: false };
      if (message.type === "keep-enable") await chrome.storage.local.set({ [key]: { ...entry, enabled: !!message.enabled } });
      else {
        const rules = entry.rules.filter((rule) => rule.s !== message.s);
        if (rules.length) await chrome.storage.local.set({ [key]: { ...entry, rules, stale: (entry.stale || []).filter((b) => rules.some((rule) => rule.b === b)) } });
        else await chrome.storage.local.remove(key);   // the last rule: the site is no longer kept
      }
      await syncSite(origin);
      return { ok: true };
    })().then(respond, () => respond({ ok: false }));
    return true;
  }
  if (message.type === "keep-cancel") { pendingKeeps.remove(message.token); return false; }
  if (message.type === "site-sync" && typeof message.origin === "string") {   // from the options page: a site was switched on or off, or forgotten
    syncSite(message.origin).then(() => respond({ ok: true }), () => respond({ ok: false }));
    return true;
  }
  if (message.type === "stale" && sender.tab) {   // the loader found rules that match nothing on this page
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: message.count ? "!" : "" });
    if (message.count) chrome.action.setTitle({ tabId: sender.tab.id, title: `SiteCleaner: ${message.count} kept ${message.count === 1 ? "change" : "changes"} no longer match this page` });
    return false;
  }
  return false;
});
