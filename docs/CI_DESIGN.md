# Continuous integration

Status: **built** (updated 17 November 2026). This began as a proposal; the first half now describes what runs. The decisions, the proof on Linux and the later
additions are kept as a dated history at the end. How the documentation is checked and published is in [ARCHITECTURE.md](ARCHITECTURE.md#documentation).

## What runs

| Workflow | File | Runs on | Blocks merging |
|---|---|---|---|
| `test` | `.github/workflows/test.yml` | every pull request, every push to `main`, `v*` tags, by hand | **yes**, through its `result` job |
| `chrome-versions` | `.github/workflows/chrome-versions.yml` | every pull request, Mondays, by hand | no |
| `smoke` | `.github/workflows/smoke.yml` | nightly at 04:17 UTC, by hand | no |
| `beta` | `.github/workflows/beta.yml` | by hand only | no |
| `pages` | `.github/workflows/pages.yml` | pushes to `main` that change the documents, by hand | no |
| SonarCloud | a GitHub App, not a workflow in this repository | every pull request | no |

Everything runs on `ubuntu-latest`. Actions are pinned to full commit hashes, not tags, because this is the supply chain of a tool that runs on people's pages.

## How a change reaches `main`

1. A branch and a pull request. Nobody pushes to `main` directly: the branch rule binds administrators too.
2. `test` and `chrome-versions` run; SonarCloud reports. The required check is `result` alone, and the branch must be up to date with `main`.
3. With auto-merge on (the repository allows it), the pull request merges itself when `result` passes (so far with a squash).
4. The pull request's branch is deleted on merge (a repository setting).
5. On `main`, `test` runs again, `package` leaves the zip, and `pages` republishes the documentation if a document changed.

## The jobs in `test.yml`

| Job | Does | Notes |
|---|---|---|
| `plan` | Works out how many times to run the suite | One, unless started by hand with `repeats` (used to measure flakiness) |
| `changes` | Decides whether anything other than documentation changed | Documentation is `*.md`, `docs/` and the licences. If only those changed the browser suite is skipped. When it cannot tell (no base commit, a failed diff) it says the change is code. The rule is one shared action, `.github/actions/changed-code`, also used by `chrome-versions` |
| `docs` | Checks the documents against the code, builds the site, lints the Markdown | Runs on every change, code or not; about 5 minutes at most, in practice seconds. See [ARCHITECTURE.md](ARCHITECTURE.md#documentation) |
| `test` | Installs Bun and Playwright's Chromium, then runs `bun run test` under `xvfb-run` | 20-minute timeout; skipped for documentation-only changes; the console output and screenshots of failed pages are kept as an artifact for 14 days |
| `result` | The one stable name the branch rule requires | Passes when `changes` and `docs` passed and, if code changed, `test` passed. A documentation-only change passes in seconds |
| `package` | `bun run zip`, uploads the Web Store zip | Only after `result`, only on a push (so on `main` and tags), kept 30 days |

`result` exists so the branch rule does not depend on how many jobs sit behind it. The `docs` job is part of it, so a wrong document cannot be merged and
needed no change to the rule.

**Why the documentation skip is decided inside the workflow.** A `paths-ignore` filter on the workflow leaves the required check missing, and a pull request that
never reports it can never merge. Here `result` always reports.

`bun run test` runs the end-to-end suite, the editions, keep, easier-to-read and stress suites, and the accessibility audit of both looks of the dock.

## The other workflows

**`chrome-versions`.** Runs four suites (end to end, editions, keep, easier to read) in Chrome 114 (the manifest's `minimum_chrome_version`), 127 (the first with
`chrome.action.openPopup`), the current stable and the beta, using Google's "Chrome for Testing" builds, which accept `--load-extension` where branded Chrome does not. Every
suite runs even after one fails. 30-minute timeout. It reports; it never decides a merge. It uses the same `changes` rule as `test` and is skipped for a documentation-only change; Monday and manual runs have no base to compare with, so they always run. The accessibility audit and the stress suite do not depend on the browser's version and are not repeated.

**`smoke`.** `bun run smoke` on six real sites (strict security policies, web components, single-page apps), each retried once, since a live site may be down. On failure
it opens one issue, "Real-site smoke test failing", and updates it each night; when the run passes again it closes it. 15-minute timeout; needs `issues: write`. It fails the job (red in the Actions tab) but is never required.

**`beta`.** Started by hand: choose the branch, run. It runs `bun run beta --publish` (`scripts/beta.mjs`): builds all three editions as the next patch version `-beta.N`, checks the zips the way a
person would use them (`scripts/verify-share.mjs`), writes the notes from the Unreleased list in `CHANGELOG.md`, and creates a GitHub prerelease. It refuses a commit whose `test`
workflow has not succeeded unless `allow_untested` is ticked. Needs `contents: write`. Keep `--publish` out of anything that is not meant to publish.

**`pages`.** Builds the documentation site with `scripts/build-docs.mjs` and deploys it to GitHub Pages when `main` changes a document. It has no dependency on a package registry. Needs
`pages: write` and `id-token: write` for the deploy job only.

**SonarCloud.** Runs as a GitHub App, with no `sonar-project.properties` and no workflow here. It posts the "SonarCloud Code Analysis" check on a pull request and a link to its
dashboard; the findings stay on sonarcloud.io. Its quality gate is not a required check. It has caught real problems in new code, so a failed gate is worth reading.

## Repository settings that matter

- **Branch rule on `main`:** required status check `result`; the branch must be up to date; no required reviewers (one contributor); force pushes and deletion refused; administrators bound too (`enforce_admins`).
  In an emergency the owner can switch that off for the duration (`gh api -X DELETE repos/belligerent-beanie/sitecleaner/branches/main/protection/enforce_admins`) and back on with `-X POST`.
  A required check cannot pass on a commit that is not yet on GitHub, so even a documentation change goes through a pull request; auto-merge makes that quick.
- **Auto-merge** allowed; **delete branch on merge** on.
- **Pages:** the source is GitHub Actions.
- **Permissions:** the default token is read-only (`contents: read`); a workflow asks for more only where it needs it (`smoke`, `beta`, `pages`). No secrets in `test`.
- `test` uses `pull_request`, not `pull_request_target`, so code from a pull request never runs with more than a read-only token.

## Goals, and where they stand

| Goal | State |
|---|---|
| A change that breaks the suite or the accessibility audit cannot be merged unnoticed | met: `result` is required and binds administrators |
| The same commands run in CI and on a developer's machine (`bun run test`) | met |
| Every green build on `main` leaves the installable zip | met: `package`, 30 days (the screenshots are made by hand, `bun run screenshots`) |
| Real-site breakage is noticed within a day, without blocking anyone | met: `smoke`, nightly, one issue |
| A document that no longer matches the code cannot be merged | met since 17 November 2026: the `docs` job |

Non-goals, still: publishing to the Chrome Web Store (needs a developer account, a credential and a human decision per release; nothing here holds a secret); testing in branded
Chrome (it no longer loads unpacked extensions from the command line, so a manual checklist in `store/STORE_LISTING.md` is part of every release); cross-browser runs (Chrome and Edge only for now).

## The constraint that shaped it

Extensions do not load in the old headless mode, and the suite opens real windows (dragging, previews in a second window, a screenshot of the visible tab). On Linux that means a virtual
display: every browser command runs under `xvfb-run`. Playwright's Chromium with a persistent context and `--load-extension` is the same setup used on Windows, so no test needed
to change. This was unverified when proposed and has since been proved (see the history below).

## Flakiness policy

1. A failure is **never retried automatically** in `test`. A retry that turns red into green hides the race a user would meet.
2. A check that fails intermittently is a bug in the test or the product. It is fixed, or the check is removed, with the reason in the commit.
3. `smoke` may retry each site once, since a live site is allowed to be down.

## Risks

| Risk | Handling |
|---|---|
| Extensions or several windows do not work under Xvfb | proved on a branch (below) |
| A slower runner makes timing-based checks flake | the suite waits on conditions, not fixed delays, apart from a few 600 ms transition waits; measured over 20 runs before `test` was required (`repeats`) |
| Playwright's Chromium moves | pinned in the lockfile; upgraded by a pull request that has to pass |
| Smoke noise trains people to ignore CI | it never blocks, files one issue (not one per night) and closes it when it passes |
| A careless or malicious pull request runs code with the token | `pull_request`, read-only token, no secrets in `test` |

## Not done

- A screenshot on a smoke failure (the console output is kept; the end-to-end job already keeps screenshots).
- Windows and macOS runners (the extension is the same, but file paths and the line ends of the zips differ).
- An automatic issue when the Monday `chrome-versions` run fails (`smoke` does this).
- Turning SonarCloud findings into GitHub issues, for an agent to pick up. Discussed and deferred; today the findings are read on sonarcloud.io.
- A required reviewer on the branch rule (with one contributor, probably not needed).

## History

### Decisions (owner, 14 November 2026)

1. **Host:** GitHub, as `belligerent-beanie/sitecleaner` (renamed from `design-picker`; GitHub redirects the old address).
2. **Visibility:** private at first, because private repositories are metered. It was made public the same day (see below).
3. **Required check:** yes, once the suite had passed 20 runs in a row on the runner.
4. **Smoke issues:** one issue, updated while it fails, closed when it passes.
5. **Real Chrome:** a manual checklist in every release.

Rollout as planned: the repository, a proof branch that runs the suite 20 times, then the required check and `package`, then the nightly smoke, then a review after a month.

### Result of the proof (14 November 2026, branch `ci-proof`)

The suite and the accessibility audit **passed on `ubuntu-latest` under Xvfb**: 132 of 132 checks and 41 audits with no violations (the suite has grown since). Twenty runs of the same commit, as
20 parallel jobs: **20 passed, 0 failed.** Each took 87 to 131 seconds, 102 on average, including the browser install, so a run costs roughly two runner-minutes. (Twenty parallel jobs of
one commit measure flakiness within a commit, not across twenty successive commits.)

The first runs were not green. Three failures, each a fault in a test and not in the extension, fixed on that branch:

| Failure on Linux | Cause | Fix |
|---|---|---|
| Choosing an image file did not show the new source yet | the file is read asynchronously; Windows was just fast enough | the test waits for the new source |
| The `:active` check saw white while the button was held | the runner's taller window put the "Design: on" tab over the point the test pressed; the press turned the picker off | the test presses the right end of the link and waits for the colour transition to settle |
| A later click timed out | a consequence of the previous one | none needed |

What it shows: the Windows-only suite was not Windows-specific, an extension loads and is driven in Playwright's Chromium on Linux, and the tests' dependence on window size and timing was real. It does not replace a run in branded Chrome.

### Branch protection (14 November 2026)

On the free plan a private repository cannot have branch protection ("Upgrade to GitHub Pro or make this repository public"). The repository was made public on 14 November 2026 and the rule set the same day.
`enforce_admins` was switched on the same day at the owner's request, so nobody pushes to `main` directly.

### The first smoke run from GitHub's runners

Five of six sites held. The BBC page failed both attempts (the picker could not click its heading) and the workflow opened issue #1 as designed. The likeliest cause is a consent banner covering the page,
not confirmed. The site was replaced by gov.uk, and the script now keeps the "what was in the way" line of a click error, so the next failure of this kind says what it was.

### Betas and Chrome versions (15 November 2026)

Two workflows so that less of the release process depends on one person's computer. `beta` could not be run before it was merged, because GitHub only lists a manual workflow once its file is on `main`;
its steps were run from a throwaway branch first, which, through a mistake in how that trial file was made, published a prerelease that was then deleted. That is why `--publish` stays out of anything that is not meant to publish.

The first local run on Chrome 114 found a real bug that no other run could show: Chrome before about 123 returns nothing from `chrome.contextMenus.update` when called without a callback, so calling `.catch`
on it threw, and the Personal edition's right-click entry never updated. It now uses the callback form. That is what `chrome-versions` is for.

### Documentation checks, Pages, auto-merge (17 November 2026)

Pull requests 21 and 22. `changes` lets documentation-only changes skip the browser suite; the `docs` job checks the documents against the code on every change and is part of `result`; `pages` publishes the
site; auto-merge and delete-on-merge were switched on. SonarCloud's quality gate failed on the first version of the new scripts (a control character in a regular expression, a lookup of `git` through the path)
and passed after they were fixed; the regular expressions it flagged as slow were rewritten as small functions.
