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
