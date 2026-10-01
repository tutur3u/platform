# Focused synthetic Programming workspace checks

From an already bootstrapped repository checkout with the pinned dependencies and
an existing Playwright Chromium browser, run:

```sh
ttr resources run -- node apps/learn/tests/programming-workspace/run-font-fix-batch.mjs
```

This finite batch runs actual Learn CodingLab, shared UI components, Monaco and the
bundled font through Vite. It checks font geometry/caret/hit-testing/wrapping first,
then desktop/mobile dark/light rendering, contrast, keyboard controls, draft
switches, collapse/resize, guarded execution, and synthetic result expansion.
Both runners close browser/server in finally; strict loopback port 4187 must be free.
Each child has a 10-minute work budget. The parent permits 750 seconds per child
to include bounded teardown and startup margin. No dependency or
browser downloads, application build, real API, database, customer fixture or judge
execution is performed. Missing compatible dependencies/browser are prerequisites,
not permission to install or bypass FIFO.

Boundary adapters replace Next dynamic loading, compiled next/font metadata, and
server actions. The actual licensed local WOFF2 loads; its variable is scoped to the
lab, deliberately absent from body, reproducing Monaco's measurement boundary.
The synthetic judge returns fake public-only results. This proves focused component
behavior and does not replace a real Next Learn build in CI.

Generated source-alias tsconfig, Vite cache, JSON evidence and synthetic PNGs stay
ignored in this directory. No private screenshot is included. The source-export
mapper reads each workspace package manifest and uses actual TypeScript source
instead of stale compiled declarations; it does not create fake declaration stubs.
Biome and focused no-emit TypeScript failures make the runners fail. Geometry owns
the type check; the second runner avoids repeating it for unchanged product source.
Use `run-geometry.mjs` or `run-ui.mjs` directly to isolate a failure.

Published correction `766f33b7c4` passed the original equivalent local batch: 4 geometry
checks and 17 workspace checks, no console/page errors, focused lint/typecheck pass.
This portable followup relocates/sanitizes that harness; its validation is recorded
in the PR handoff separately. Customer pixels/Library metadata stay outside Git.

Review regressions can run without a browser or server:

```bash
ttr resources run -- node --test apps/learn/tests/programming-workspace/review-regressions.node-test.mjs
```

These execute the actual header measurement helper, editor font callbacks,
toolbar focus properties and synthetic judge fixture with synthetic adapters.
They also verify the parent batch budget and timeout diagnostics. Each browser
child retains its 600-second work budget; the parent allows an additional
120 seconds for lint/typecheck teardown and 30 seconds of startup margin.
Source checks do not prove device safe-area geometry or replace the browser
batch and exact-head Learn build in CI.

The UI runner also enables the actual shared mobile navigation, wraps its
synthetic header row, and crosses the 767/768 breakpoint. Test-only CSS variables
simulate 24px top and 20px bottom safe insets; geometry evidence explicitly labels
these simulated values. Desktop Chromium is not real notched-device acceptance.
Disabled Run/Submit tooltips are reached with keyboard Tab through the actual
Radix components. Both challenges exercise Run and Submit and compare actual
rendered verdicts with the one synthetic case card. Unique synthetic submission
ids keep query caching faithful between these attempts.
