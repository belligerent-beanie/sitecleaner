# SiteCleaner

A browser extension (Chrome and Edge today) that restyles any web page in the user's own browser, records every change so it can be undone, kept and
exported as a Markdown change list. Three editions are built from one source: designer, Studio and Personal (consumer).

## Read the docs before answering

When answering questions about this project, or reasoning about hypotheticals (porting to another browser, adding or removing a feature, a new edition,
a permissions change, a new audience), **read the relevant doc first and answer from it**. Do not reconstruct the answer from the code when a doc covers it.
If the doc and the code disagree, say so and fix the doc.

| Question is about | Read |
|---|---|
| What it does, who it is for, where it is meant to be used, what edition has what | `docs/OVERVIEW.md` |
| How it is built, which browser APIs it uses, storage keys, messages, flows, build, tests, porting | `docs/ARCHITECTURE.md` |
| Why there are several editions, how Keep and the site loader work | `docs/EDITIONS.md` |
| CI, performance | `docs/CI_DESIGN.md`, `docs/PERFORMANCE.md` |
| Install, shortcuts, known limits | `README.md` |
| Privacy and permissions wording | `store/PRIVACY.md` |

For hypotheticals specifically:
- **Porting or new browsers:** start from the "Browser APIs used" table and "Porting notes" in `docs/ARCHITECTURE.md`. The editor (`src/parts/`) has no `chrome.*`
  calls; only `extension/` does. Porting is deliberately deferred until the feature set settles.
- **New features:** check the edition matrix in `docs/OVERVIEW.md` to decide which editions get it, and "The two kinds of change" in `docs/ARCHITECTURE.md` for how
  to make it undoable, kept and exported.
- **Anything touching permissions, storage or what leaves the browser:** check `docs/OVERVIEW.md` ("What it stores and what it asks for") and `store/PRIVACY.md`.
  Nothing may be sent anywhere.

## Keep the docs current

`bun run test:docs` checks the documents against the code and the `docs` job in CI requires it. Run it after touching docs or the code they describe. It fails on a broken
link or anchor, a path, `file:line`, script, flag or part number that does not exist, and on a `chrome.*` API, message type or storage key that `docs/ARCHITECTURE.md`
and `extension/` disagree on. **When it fails, fix the document or the reference, not the check.** Write file references in `code` so they are checked;
`bun run docs` builds the site from the same files (published to GitHub Pages when `main` changes).

When a change alters what the docs describe, update them in the same commit:
- a feature added, removed or moved between editions: `docs/OVERVIEW.md` (capabilities and the edition matrix) and the `EDITIONS` list in `scripts/build.mjs`
- a browser API, storage key, message type or content script added or removed: `docs/ARCHITECTURE.md`
- a permission added: `docs/OVERVIEW.md`, `docs/ARCHITECTURE.md`, `store/PRIVACY.md`, and the manifest description limits

## Working rules

- Keep browser API calls out of `src/parts/`; they belong in `extension/` behind the host adapter (`src/parts/010-where-it-runs.js`).
- Avoid Chrome-only APIs (`sidePanel`, `offscreen`, `debugger`, `userScripts`) so a port stays small.
- Changes to the page go through the `apply…` functions and `doOps`, so they are undone, kept and exported for free.
- Tests: `bun run test` must pass (end-to-end, editions, keep, access, stress, accessibility), and `bun run test:docs` for anything that touches documents or the code they describe. `bun run smoke` is by hand, before a release.
- Build: `node scripts/build.mjs [--edition designer|studio|consumer]`.
