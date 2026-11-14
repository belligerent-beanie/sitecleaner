# Performance: scaling tests

Measured with `scripts/scale.mjs` (real Chromium, the built extension, many fake origins on one local server). Axes: number of kept sites, rules per site, and changes in one designer session. Numbers are from one Windows PC, so read the growth, not the exact milliseconds.

## Before the fixes

| Axis | Finding |
|---|---|
| Kept sites (1 to 1,000) | Registering took 0.09 s for 1 site, 24 s for 500, 82 s for 1,000; start-up sync 76 s at 1,000. Faster than linear. Memory and storage grow linearly. |
| Rules per site (10 to 5,000) | Page cost about 0.08 ms per rule above 500. At 5,000 rules the main thread works 772 ms (363 ms unkept) and rules apply 140 ms after first paint. |
| Changes per session (designer) | Every edit saved the whole session: 4 MB written for 100 edits, 35 MB for 300, 394 MB for 1,000. A test browser reached 16 GB at 3,000 edits. |
| Reload restore | About 4 ms per edit (428 ms for 100, 1,267 ms for 300). Acceptable. |
| Storage cap | 10 MB: about 6,600 typical sites, or about 128,000 rules on one site. |

## After the fixes (this change)

| Measure | Before | After |
|---|---|---|
| Start-up sync, 1,000 kept sites | 76 s | 0.8 s |
| Register all, 1,000 kept sites | 82 s | 8.6 s |
| Data written, 1,000 edits | 394 MB | 4.3 MB |
| 3,000 edits | browser reached 16 GB | completes, peak 433 MB, 12.5 s |
| Quota error | "Resource::kQuotaBytes quota exceeded" | plain message saying what to do |

Caveats: the harness applies edits in ten bursts, so "after" write counts show the best case for a debounce. A person editing with pauses writes more often, but still once per pause, not once per edit.

## Still open

- Time per edit still grows late in a very large session (8 ms per edit in the last tenth of 3,000 edits) because each save rebuilds the whole list. Fine for normal sessions.
- Rules per site above about 500 can show a brief flash on large pages: apply before first paint, and check stale selectors in chunks.
- Not measured: restore at 1,000 edits, and most of the sites-by-rules grid beyond three points (the run was stopped).
