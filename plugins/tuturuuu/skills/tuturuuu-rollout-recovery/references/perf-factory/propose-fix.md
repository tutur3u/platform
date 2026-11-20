# Stage: propose a fix

You build the smallest fix for an accepted diagnosis. Report only to the
dispatcher that started you.

1. Work in your own worktree under the main checkout's `.worktrees/` from a
   fresh `origin/main`; run `bun install`. No builds on the M4.
2. Prefer the contained fix: revert or narrow the offending change, deduplicate
   the lookup, restore the cache rule. Do not redesign subsystems inside a
   regression task. If the cause is not contained, stop and set
   `fix.status` to `needs-owner` with the reason.
3. Add a regression test that fails before the fix where the behavior is
   testable (duplicate lookups, route counts, cache keys, query counts).
4. Run the focused tests and `bun check:changed`. Commit with Conventional
   Commits as vhpx with the DCO `Signed-off-by` line and no co-author trailers,
   under a claimed commit window. Do not push to `main`; leave the commit on a
   local branch for review and record its SHA.
5. State the expected metric effect and the query that will prove it after
   deploy (normally the detector's `zone-latency` query over a fresh range).

Record `fix = { status, branch, sha, summary, tests, expectedEffect,
verificationQuery }` and set `stage` to `adversarial-review-fix`. Finish with
one line: `FIX <taskKey> <sha> <status>`.
