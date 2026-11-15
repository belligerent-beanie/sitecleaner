// The page that explains why the extension cannot run on the tab it was clicked on (opened by background.js when the page refused it).
// Chrome does not tell an extension the address of a page it may not touch, so the address often is not known: then the reason is general.
const name = chrome.runtime.getManifest().name;
const given = new URLSearchParams(location.search).get("u") || "";

/** What went wrong, in plain words, from the address if there is one. */
function reasonFor(address) {
  let url = null;
  try { url = new URL(address); } catch (_) { /* no address */ }
  if (!url) return { why: "This page does not allow extensions.", tip: "Chrome did not say which kind of page it is." };
  const host = url.hostname;
  if (/^(chrome|edge|brave|about|devtools|chrome-untrusted|chrome-search)$/.test(url.protocol.replace(":", ""))) return { why: "This is one of the browser's own pages.", tip: "The browser keeps these closed to every extension." };
  if (url.protocol === "chrome-extension:" || url.protocol === "moz-extension:") return { why: "This is another extension's page.", tip: "Extensions cannot change each other's pages." };
  if (url.protocol === "view-source:") return { why: "This is a page's source code, not the page itself.", tip: "Open the page normally to restyle it." };
  if (url.protocol === "file:") return { why: "This is a file on your computer.", tip: "To allow files, open chrome://extensions, choose this extension's Details, and switch on \"Allow access to file URLs\"." };
  if (host === "chromewebstore.google.com" || (host === "chrome.google.com" && url.pathname.startsWith("/webstore")) || host === "microsoftedge.microsoft.com") return { why: "This is the browser's extension store.", tip: "The store is closed to every extension." };
  if (/\.pdf$/i.test(url.pathname)) return { why: "This is a PDF file.", tip: "The browser shows PDFs in a viewer that extensions cannot change." };
  if (url.protocol !== "http:" && url.protocol !== "https:") return { why: "This is not a web page.", tip: "Only http and https pages can be changed." };
  return { why: "The browser did not allow it on this page.", tip: "The page may still be loading, or your organisation's browser settings may block extensions here. Reload the page and try again." };
}

const { why, tip } = reasonFor(given);
document.getElementById("title").textContent = `${name} cannot change this page`;
document.getElementById("why").textContent = why;
document.getElementById("tip").textContent = tip;
document.title = `${name}: cannot run on this page`;
