SiteCleaner Personal __VERSION__
================================

Make any website look the way you like: change colours, text and spacing,
make pages easier to read, undo anything, and keep your changes, so they are
there every time you visit that site. Nothing is changed on the real
website: it all happens in your own browser.

This is an early version. The name "SiteCleaner Personal" is a placeholder.

Project page: https://github.com/belligerent-beanie/sitecleaner


WHAT IS IN THIS FOLDER
----------------------
  extension/     The extension itself. This is the folder you give to Chrome.
  LICENSE, NOTICE, third_party/    Licence information.

(SiteCleaner Personal is a separate extension from SiteCleaner, the one for
designers. You can install both; they do not share anything.)


INSTALL IN GOOGLE CHROME
------------------------
It takes about two minutes. No account, nothing to pay.

 1. Unzip this file completely. On Windows: right-click the zip and choose
    "Extract All". On a Mac: double-click it. Do not run anything from
    inside the zip.

 2. Put the unzipped folder somewhere permanent, for example in Documents.
    Chrome reads the extension from this folder every time it starts. If you
    delete or move the folder, the extension stops working.

 3. In Chrome, type   chrome://extensions   in the address bar and press
    Enter.

 4. Switch on "Developer mode" (the switch at the top right).

 5. Click "Load unpacked" (it appears at the top left once Developer mode
    is on).

 6. Choose the folder called "extension" that is inside this folder (the one
    that contains a file named manifest.json), and click "Select Folder".

 7. SiteCleaner Personal now appears in your list of extensions. Optional:
    click the puzzle-piece icon in Chrome's toolbar and the pin next to it,
    so its icon is always visible.

Microsoft Edge works the same way: open edge://extensions, switch on
"Developer mode" (in the left-hand menu), click "Load unpacked" and choose
the "extension" folder.


USE IT
------
 1. Open a website you visit.

 2. Click the extension's icon (or press Alt+Shift+P). A small panel appears,
    with a three-page tutorial the first time. The "Tutorial" button at the
    top of the panel opens it again whenever you like.

 3. Click something on the page to select it. Shift-click picks several at
    once, and one change then covers all of them. Choose what to change:
    Background, Border, Shadow, Corners, Colour mood, Edit words (or
    double-click text to retype it), Text style, Spacing. "Delete" takes an
    element off the page. You see every change as you make it.

 4. "Undo" takes back the last change (Ctrl+Z does too).

 5. Press "Keep" to keep your changes on this site. The first time, Chrome
    asks whether to allow the extension on that one site (and only that
    one): choose Allow. From then on your changes are there every time you
    open the site, before the page finishes drawing.

 6. "My changes" lists what you have kept for the site, with a switch to turn
    it off and a Remove for each change.

 7. "Easier to read" opens a panel of reading aids: bigger text, a smallest
    text size, more spacing, a plain font, underlined links, a strong focus
    outline, calmer motion, bigger buttons, fixing low-contrast text, a
    highlight under the pointer, and a dark mode. They show live as you
    change them, and "Keep on this site" saves them for the site too.

 8. To switch your changes off on a site without opening the panel,
    right-click the extension's icon and choose "Switch off my changes on
    <site>". Hover over the icon to see whether the site's changes are on.

 9. To see everything you have kept, or to forget a site (this removes its
    changes and the permission you gave it), open the extension's Options:
    right-click the icon and choose "Options".

What is kept: colours, text, spacing and similar style changes, deleted
elements, and retyped text. What is not: moving, duplicating or grouping
elements, and replacing pictures. The Keep message tells you if some changes
could not be kept. If a website changes its design later, a kept change may
stop matching anything: the panel then shows a warning with a "Re-pick"
button to choose the element again.

Screenshots made with this extension carry a strip that says "Edited with
SiteCleaner, not the original page", so that an edited page cannot be passed
off as the real one.


IF SOMETHING GOES WRONG
-----------------------
 * "Manifest file is missing or unreadable" - you chose the wrong folder.
   Choose the folder called "extension", the one that contains manifest.json.

 * You cannot see "Load unpacked" - Developer mode is off (step 4).

 * Keep says "Not allowed, so nothing was kept" - you chose not to allow the
   site. Press Keep again and choose Allow.

 * Alt+Shift+P does nothing - another program or extension may be using that
   key; on Windows, Alt+Shift can also switch the keyboard language. Go to
   chrome://extensions/shortcuts to choose another key, or just click the
   icon.

 * The icon does nothing, or shows a small "x" - Chrome does not let any
   extension run on its own pages (chrome://...), the Chrome Web Store, the
   new-tab page or PDF files. Try an ordinary website.

 * A kept change no longer shows - the website may have changed. Open the
   panel, then "My changes": a change that matches nothing is marked with a
   warning and offers "Re-pick".

 * Chrome shows "Disable developer mode extensions" when it starts - Chrome
   shows this for every extension installed this way. Close the message; do
   not press Disable.

 * To update: unzip the new version into a new folder, remove the old
   extension on chrome://extensions, and load the new "extension" folder the
   same way. Kept changes are stored in the browser, so they stay.


PRIVACY
-------
Nothing is collected and nothing is sent anywhere. What you keep is stored in
your browser only. The extension asks for "activeTab", "scripting",
"storage" and "contextMenus" (for the right-click menu on its icon), and for
permission on one website at a time, only when you press Keep there. There is
no account and no server.


LICENCE
-------
Apache License 2.0 (see LICENSE and NOTICE). Built on ideas and some code of
VisBug, also Apache-2.0; see third_party/visbug/.
