# Stage: post-deploy verification

You verify recovery after the approved fix reached production. Report only to
the dispatcher that started you.

1. Confirm the fix commit is live: for Workers, the active deployment version
   for the app's Worker carries the fix SHA; for `apps/web`, the production
   alias deployment commit contains it.
2. Wait until at least two full detector windows have closed after the deploy,
   then run the stored `fix.verificationQuery` and the detector for the app
   with `--now` at the latest closed window.
3. Recovered means: no breach under the detector rule for those windows, and
   p95 within the original trigger of the pre-regression baseline. Compare
   error rate with the baseline as well.
4. Record the queries and results in `verification`.

If recovered, move the task to `Done`. If not, reopen it: set `stage` to
`investigate`, keep all evidence, add the new measurements as evidence, and move
the task to `Live Today`. Finish with one line:
`VERIFY <taskKey> recovered|reopened`.
