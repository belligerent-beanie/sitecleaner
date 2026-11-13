# Design Picker: privacy policy

*Last updated 14 November 2026.*

**Design Picker collects no data.** Nothing about you, your browsing or the pages you work on is sent anywhere, by the extension or by anyone on its
behalf. It has no server, no account, no analytics and no tracking.

## What it stores, and where

When you change something on a page, the extension keeps **your edits** so they can be put back after a reload: which element, the before and after
values of the properties you changed, the structure changes you made (for example "removed this element", "moved it here"), and, when you replace a
picture with a file from your computer, that picture if it is small. They are stored in your browser with `chrome.storage.local`, under the address of
the page. They never leave your browser, and the page's own scripts cannot read them. Remove them with Reset all in the picker, or by removing the
extension. It also remembers that you have seen its first-time guide.

## What it does with the pages you use it on

It runs only on a tab where you turn it on (the toolbar button or Alt+Shift+P), unless you choose to allow all sites. It reads the page's styles and
structure so it can show you values and measure distances, and it changes how the page looks **in your browser only**: the page's server and other
visitors never see your edits. The text it copies to your clipboard (when you press Copy) and the screenshots it saves (when you ask for one) are made
on your device and go only where you put them. A screenshot is a picture of the tab as you see it, taken by the browser at your request.

## Permissions, and why

| Permission | Why |
|---|---|
| `activeTab` | To run on the tab you clicked the extension on, and nothing else, until you leave that page; and to take a screenshot of it when you ask. |
| `scripting` | To put the picker on that tab, and (with all sites allowed) to restore your saved edits after a reload and to put them on a preview window. |
| `storage` | To keep your edits and the guide flag in your browser, as above. |
| *All sites* (optional, asked only if you press **Allow all sites** in the options) | To restore your saved edits automatically after a reload (a small script checks whether the page has saved edits, and does nothing if it has none) and to put your edits on a screen-size preview window. You can remove it again in the options. |

## Changes and contact

If this policy changes, the new version replaces this file with a new date. Questions or concerns: [the address of the project's issue tracker, filled in
when the extension is published]. The extension is open source under the Apache License 2.0.
