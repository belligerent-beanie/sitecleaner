---
name: sitecleaner-apply
description: Apply a SiteCleaner change list to a web project's source files. Use when the user pastes (or points at) a block that starts "SiteCleaner changes for <url>" or "# UI changes from the designer picker", or asks you to make the design changes they tried out in the browser with the SiteCleaner extension.
---

# Applying a SiteCleaner change list

SiteCleaner is a browser extension a designer uses to try changes on a live page (colours, type, spacing, hover states, moving or deleting elements). It
produces a **change list**: what the page looked like was changed *in the browser only*; your job is to make the same changes in the **source code** of the project.

You are not given the designer's intent, only the result. Make the smallest change in the right place, keep the project's conventions, and say what you assumed.

## 1. Read the list

A compact list (the default) looks like this:

```
SiteCleaner changes for https://shop.example/cart (window 1280×720). Apply to the source. ×N = … "N of M" = … from: = …

.tile ×5
  from: /css/site.css .tile
  ! contrast 1.69:1 fails AA
  background-color: #222222
  font-weight: 700

2 of 5 .tile: section.tiles > a.tile:nth-of-type(1) "One", section.tiles > a.tile:nth-of-type(2) "Two"
  border-radius: 8px

.btn:hover ×3
  background-color: #1a4fa0

h1.title text: "Welcome" → "Welcome back"

Structure, in order:
- removed `div.promo` ("Sale"): it was child 2 of `main`
```

| Part | Meaning |
|---|---|
| first line | the page address and the browser window size the designer used |
| `selector ×N` | **all N** elements on the page that match the selector received these edits: it is a change to that selector's **rule** |
| `N of M selector: a, b` | only **N of the M** elements that match the selector changed (a, b are those). Decide: its rule, or a variant (see 3) |
| `×N: a, b, …` | N elements with no class in common, listed (first five) |
| a plain selector, maybe with `"words"` | one element; the words are the start of its text, to find it in the markup |
| `selector:hover` / `:focus` / `:active` | the properties are for that **state**, not the normal look |
| `from: file selector` | the style sheet rule that defines the property **now** (best effort; absent when the property is not set in a readable sheet, or the sheet is from another origin) |
| `! contrast X:1 fails AA` | the designer's colours fail WCAG AA text contrast. Apply, then tell the user |
| `text: "old" → "new"` | the visible words changed |
| `Structure, in order` | removed, duplicated, moved, grouped or inserted elements, and attribute changes (image sources, links), in the order they were done |

Property lines are plain CSS (`prop: value`), with `padding`, `margin`, `border` and `border-radius` already in shorthand. Widths and heights are fixed pixels measured in
that browser window: do **not** hard-code them if the layout is fluid (use the project's responsive approach, `min-`/`max-`, percentages, `clamp()`), unless the project
already uses fixed sizes there.

A **detailed** list (`# UI changes from the designer picker`) has one block per element with `before → after` for each property. It means the same; treat the
elements as separate, then apply step 3 yourself: find which of them share a class.

## 2. Find where each change belongs

1. **Identify the stack**: plain CSS, Sass/Less, CSS Modules, Tailwind or other utility classes, CSS-in-JS, a component library, a design-token file. Look at how an existing, similar style is written and copy that.
2. **Use `from:` first.** It is a URL path as the browser saw it (`/css/site.css`). Map it to a source file: the same path in the repo, or a source behind a build step (`/assets/app.3f9c.css` is built from `src/**/*.scss`). Search for the *selector*, not the file name alone.
3. **No `from:`?** Search the repo for the selector's class names (`rg "\.tile\b"`), then for the element's `"words"` in templates and components. Class names built at runtime or by a framework (CSS-in-JS hashes, Tailwind) will not grep: find the component by its text.
4. A selector like `section.tiles > a.tile:nth-of-type(1)` is a **path into the rendered page**, not a name from the source. Use it to find the element, never copy it into the code.

## 3. Decide, then change

- **`×N` entries**: edit the **rule** of that selector (or the component's style) once. Do not add per-element overrides or inline styles. If `from:` names a rule that is *more specific* than the entry's selector
  (`from: /css/site.css .card .tile` for `.tile ×5`), that rule is the one currently winning: change it, or the edit will have no effect. If the rule sets the property through a shorthand
  (`background: #fff`, `padding: 4px 8px`), change the shorthand's value rather than adding a longhand beside it.
- **`N of M` entries**: not all elements with that class changed, so the class rule alone is wrong. Choose the least surprising of:
  - the N elements share a context (the same section, a modifier already in use): add a **variant** (a modifier class like `.tile--feature`, a prop, a scoped selector) and apply it only there;
  - the designer evidently meant the whole class (the edited ones are the only ones that matter, or the others are hidden): change the rule;
  - otherwise do the variant, and **say you did**, so they can switch to the rule.
- **Two entries with the same class and different values** (`1 of 5 .tile` twice) are two variants or two instances: do not collapse them.
- **State entries** go into rules for that state (`:hover`, `:focus-visible` for keyboard focus, `:active`), beside the normal rule. Keep an existing transition and never remove a visible focus indicator.
- **Values**: use the project's tokens when one equals the value (search the tokens or theme file for the hex colour or the pixel size) and keep its units (`rem` vs `px`). A utility-class project gets the equivalent utilities or its token classes, not arbitrary CSS.
- **`text:` entries**: change the words where they live (template, component, content file, translations). If the string occurs in several places, change the one that matches the element and list the others.
- **`Structure`**: apply in the order given. The browser's tree is the *rendered* page: a removed element may come from a component, a loop or a CMS, so change the source that renders it, not a copy of its output. If a step cannot be applied faithfully (generated content), do not guess: report it.
- **`!` contrast warnings**: apply what the designer chose, and tell the user, with a close colour that passes if you can name one.

Do not change anything the list does not mention. Do not "tidy" neighbouring code.

## 4. Check

Run the project's build, linters and tests. If you can run it, load the page and look. Re-read each entry against the diff: every property in the list should be set, once, in the place you chose.

## 5. Report

Reply with, per entry: the file and rule changed, one line on what, and any **assumption** (class rule vs variant, a token you substituted, a value you made responsive). End with what you could **not** apply and why. Keep it short; the diff is the detail.

## Using this with other AI tools

This file is plain markdown. For tools without skills, paste it into the system prompt or the tool's rules file (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules`), then paste the change list. The list's first line is
a one-paragraph legend, so a list pasted into a chat with no instructions at all is still usable; this file adds the method.
