# Continuous integration: design

Status: **proposal, nothing built.** No workflow file exists. This document is for approval first.

## Why

The project has three kinds of check, and today a person has to remember to run them:

| Check | Command | Needs | Runs for | Today |
|---|---|---|---|---|
| End-to-end suite (132 checks) | `bun run test:e2e` | a real browser with the extension loaded | roughly 2 minutes | by hand |
| Accessibility audit of the dock (41 audits, both looks) | `bun run test:a11y` | the same | roughly 1 minute | by hand |
| Smoke test on six real sites | `bun run smoke` | the same, plus the network and live sites | roughly 3 minutes | by hand |

The first two are deterministic and offline: they decide whether a change may be merged. The third depends on websites we do not control, so it can only
ever warn. A fourth job, building the zip for the Web Store, is cheap and should leave an artifact.

## Goals and non-goals

Goals
1. A change that breaks the end-to-end suite or the accessibility audit cannot be merged unnoticed.
2. The same commands run in CI and on a designer's or developer's own machine (`bun run test`), so a failure can be reproduced locally.
3. Every green build on `main` leaves the installable zip and the screenshots as downloadable artifacts.
4. Real-site breakage is noticed within a day, without blocking anyone.

Non-goals
- **Publishing to the Chrome Web Store.** It needs a developer account, an API credential and a human decision about every release. Nothing here holds a secret.
- Testing in branded Google Chrome. Chrome 157 no longer loads unpacked extensions from the command line, so the suite uses Playwright's bundled Chromium, here as everywhere.
- Cross-browser runs (Firefox, Safari). The extension is Chrome and Edge only for now.

## The constraint that shapes it

Extensions do not load in the old headless mode, and this suite opens real windows (it tests dragging, previews that open a second window, a screenshot of
the visible tab). On a Linux runner that means a virtual display: run the commands under `xvfb-run`. Playwright's Chromium with a persistent context
and `--load-extension` is the same setup used here on Windows, so no test needs to change. **This is unverified on Linux**: the first step of the
work is a branch that proves the whole suite passes there, before anything is made required.

## Proposed jobs

Platform: GitHub Actions on `ubuntu-latest` (cheapest, and the only runner with `xvfb`). The project has no repository yet, so nothing can run until the
owner creates one; this document assumes GitHub, and the jobs are plain shell commands, so another host would need only the wrapper changed.

| Job | Trigger | Blocks merging | Steps |
|---|---|---|---|
| `test` | every push and pull request | **yes** | install Bun; `bun install --frozen-lockfile`; install Playwright's Chromium; `xvfb-run bun run test` |
| `package` | after `test` passes, on `main` and on tags | no | `bun run zip`; upload `releases/*.zip` as an artifact (kept 30 days) |
| `smoke` | nightly, and by hand | **no** (reports only) | `xvfb-run bun run smoke`; on failure open or update one issue titled "Real-site smoke test failing" with the output |

Details that matter
- **Caching:** Bun's install cache and Playwright's browser download, keyed on the lockfile and the Playwright version, so a run does not download 150 MB each time.
- **Timeouts:** 15 minutes for `test`, 10 for `smoke`. A hung browser must not hold a runner for hours.
- **Artifacts on failure:** the suite's console output, plus a screenshot on a failed check (a small addition to `test/e2e.mjs`, not yet written).
- **Permissions:** the default token, read-only (`contents: read`), except `smoke`, which also needs `issues: write` to file its issue. No secrets.
- **Concurrency:** a new push to a branch cancels the older run of the same branch.
- **Pinning:** Bun and Playwright at the versions in the lockfile. Actions pinned to a full commit hash, not a tag, since this is the supply chain of a tool that runs on people's pages.

## Flakiness policy

The suite has produced one flaky run so far (a test that pressed a shortcut while a control in the dock had focus; fixed). The rule:

1. A failure is **never retried automatically** in `test`. A retry that turns red into green hides the very race the user would meet.
2. A check that fails intermittently is a bug in the test or the product, and is fixed or the check is removed, with the reason in the commit.
3. `smoke` may retry each site once, since a live site is allowed to be down.

## Risks and how each is handled

| Risk | Handling |
|---|---|
| Extensions or multiple windows do not work under Xvfb | proven on a branch first; fallback is a self-hosted Windows runner (the machine where the suite already passes) |
| Runner is slower, so timing-based checks flake | the suite waits on conditions, not fixed delays, apart from a few 600 ms transition waits; measure over 20 runs before making `test` required |
| Playwright's Chromium version moves | pinned in the lockfile; upgraded by a pull request that has to pass |
| Smoke test noise trains people to ignore CI | it never blocks, files one issue (not one per night), and closes it when it passes again |
| A malicious or careless pull request runs code with the token | `pull_request` (not `pull_request_target`), read-only token, no secrets in the `test` job |

## Rollout

1. Create the repository (owner's decision; see below) and push `main`.
2. Branch `ci-proof`: add only the `test` job; run it 20 times; record the failure rate. Stop here if it is not zero.
3. Make `test` a required check; add `package`.
4. Add `smoke`, nightly, report-only.
5. Revisit in a month: how many red runs were product bugs, how many were infrastructure.

## Decisions (owner, 14 November 2026)

1. **Host:** GitHub. The repository exists, private, as `belligerent-beanie/sitecleaner` (renamed from `design-picker` on 14 November 2026; GitHub redirects the old address).
2. **Visibility:** private for now. Private repositories are metered, so the cost of three jobs per run matters until the repository is made public.
3. **Required check:** yes. `test` becomes mandatory for merging, once it has passed 20 runs in a row on the runner (rollout step 3).
4. **Smoke issues:** a failing nightly `smoke` opens a GitHub issue (one issue, updated while it fails, closed when it passes).
5. **Real Chrome:** a manual checklist is part of every release; it is in `store/STORE_LISTING.md`.

Still to decide, not blocking: whether the branch-protection rule that makes `test` required needs a second reviewer (with one contributor, probably not).

Status: approved in principle. **Not built**: rollout step 1 is done (the repository exists); step 2, the proof branch that shows the suite passes under Xvfb
on a Linux runner, is the next piece of work, and nothing is made required before it has passed.

## Result of the proof (14 November 2026, branch `ci-proof`)

The suite and the accessibility audit **pass on `ubuntu-latest` under Xvfb**: 132 of 132 checks and 41 audits with no violations. Twenty runs of the
same commit, as 20 parallel jobs (`bun run test` under `xvfb-run`): **20 passed, 0 failed.** Each job took 87 to 131 seconds, 102 on average, including the
browser install, so a run costs roughly two runner-minutes. (Twenty parallel jobs of one commit measure flakiness within a commit; they are not twenty
successive commits.)

The first runs on the runner were not green. Three failures, each a fault in a test and not in the extension, and each fixed on this branch:

| Failure on Linux | Cause | Fix |
|---|---|---|
| Choosing an image file did not show the new source yet | the file is read asynchronously; Windows was just fast enough | the test waits for the new source |
| The `:active` check saw white while the button was held | the runner's taller window put the "Design: on" tab over the point the test pressed; the press turned the picker off, which also caused the next timeout | the test presses the right end of the link and waits for the colour transition to settle |
| A later click timed out | a consequence of the previous one | none needed |

What it shows, and what it does not: the Windows-only suite is not Windows-specific, an extension loads and is driven in Playwright's Chromium on Linux, and
the tests' dependence on window size and timing was real. It does not replace a run in branded Chrome (the checklist in `store/STORE_LISTING.md`).

On failure the job uploads the console output, and a screenshot of each open page plus what the dock said (`test-artifacts/`).

### Not done yet (rollout steps 3 and 4)

- The workflow still triggers only on the `ci-proof` branch. For real use it must run on pull requests and on `main`; the test fixes above live only on this
  branch until it is merged.
- Making `test` a required check is a repository setting. On a private repository, GitHub's free plan may not offer branch protection; this has not been tried.
- The `package` job (zip as an artifact) and the nightly `smoke` job that opens an issue are not written.
