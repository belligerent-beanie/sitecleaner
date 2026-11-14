  // ---------- the dock's look: light, dark, or the browser's setting ----------
  const THEMES = ["auto", "light", "dark"];
  const theme = () => (THEMES.includes(host.getPref("theme")) ? host.getPref("theme") : "auto");
  const applyTheme = () => { root.setAttribute("data-theme", theme()); };
  applyTheme();
