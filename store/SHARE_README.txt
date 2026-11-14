SiteCleaner __VERSION__
=======================

Select any element on any web page, change how it looks, and copy the
changes as a short list that an AI (or a developer) can apply to the real
code. Everything you try stays in your browser until you copy it.

Project page: https://github.com/belligerent-beanie/sitecleaner


WHAT IS IN THIS FOLDER
----------------------
  extension/     The extension itself. This is the folder you give to Chrome.
  for-AI/        A skill file that teaches an AI how to apply the lists
                 SiteCleaner makes (optional, see "Using the list" below).
  LICENSE, NOTICE, third_party/    Licence information.


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

 7. SiteCleaner now appears in your list of extensions. Optional: click the
    puzzle-piece icon in Chrome's toolbar and the pin next to SiteCleaner, so
    its icon is always visible.

Microsoft Edge works the same way: open edge://extensions, switch on
"Developer mode" (in the left-hand menu), click "Load unpacked" and choose
the "extension" folder.


USE IT
------
 1. Open any ordinary web page.

 2. Click the SiteCleaner icon, or press Alt+Shift+P. A small panel appears,
    with a nine-page tutorial the first time (press Esc to close it). The
    "Tutorial" button at the top of the panel opens it again whenever you like.

 3. Click an element on the page to select it. Shift-click adds more. Press
    Enter to open the tools (Fill, Border, Font, Size, Spacing and more), or
    press a letter: C fill, B border, F font, S size, P spacing. The
    "Classes" link lists the page's classes: click one to select every
    element that has it.
    Press ? at any time to see every shortcut.

 4. Change things. Ctrl+Z undoes (Ctrl+Shift+Z redoes). Hold the \ key to
    see the page as it was. Hover, focus and active states can be edited:
    use the "State" buttons above the tools.

 5. When you are happy, press Alt+Shift+E (or open "Changes" and click
    Copy). The changes are copied as a short list.

 6. Turn SiteCleaner off with the "Off" link, Esc, or Alt+Shift+P. Your
    edits are remembered per page in this browser and come back when you
    open the page again.


USING THE LIST
--------------
Paste the list into a chat with an AI together with a sentence such as
"Apply these changes to the code in my project". The list starts with a
one-paragraph explanation, so it works even without anything else.

For better results, give the AI the skill in the "for-AI" folder:
  - Claude Code: copy the folder  for-AI/sitecleaner-apply  into the
    folder  .claude/skills/  of your project (or into  ~/.claude/skills/
    to use it everywhere).
  - Other AI tools: paste the contents of  for-AI/sitecleaner-apply/SKILL.md
    into the tool's rules or instructions file (for example AGENTS.md), then
    paste the list.

In the "Changes" panel, "Compact" is the short list for AIs (it groups
elements that share a class, and says where each style is defined);
"Detailed" lists every element with before and after values, for people.


IF SOMETHING GOES WRONG
-----------------------
 * "Manifest file is missing or unreadable" - you chose the wrong folder.
   Choose the folder called "extension", the one that contains manifest.json.

 * You cannot see "Load unpacked" - Developer mode is off (step 4).

 * Alt+Shift+P does nothing - another program or extension may be using that
   key; on Windows, Alt+Shift can also switch the keyboard language. Go to
   chrome://extensions/shortcuts to choose another key, or just click the
   SiteCleaner icon.

 * The icon does nothing, or the icon shows a small "x" - Chrome does not
   let any extension run on its own pages (chrome://...), the Chrome Web
   Store, the new-tab page or PDF files. Try an ordinary website.

 * After reloading a page your edits are back, but SiteCleaner is off - this
   is normal. To have it come back on by itself, right-click its icon, choose
   "Options", and press "Allow all sites". SiteCleaner then only checks
   whether the page you open has saved edits; it reads nothing else.

 * Chrome shows "Disable developer mode extensions" when it starts - Chrome
   shows this for every extension installed this way. Close the message; do
   not press Disable.

 * To update: unzip the new version into a new folder, remove the old
   SiteCleaner on chrome://extensions, and load the new "extension" folder
   the same way.


PRIVACY
-------
SiteCleaner collects nothing and sends nothing anywhere. Your edits are kept
in your browser only, and it has no account and no server. It asks only for
"activeTab", "scripting" and "storage"; access to all sites is optional and
only if you press "Allow all sites" in its options.


LICENCE
-------
Apache License 2.0 (see LICENSE and NOTICE). Built on ideas and some code of
VisBug, also Apache-2.0; see third_party/visbug/.
