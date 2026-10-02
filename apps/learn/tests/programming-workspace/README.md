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

The repository keeps Node >=22.13.0. The parent explicitly passes
`--experimental-strip-types` to its children because the UI runner imports the
test-only TypeScript freshness helper. Direct UI and regression invocations must
also pass that flag; Node22.13–22.17 does not enable stripping by default.
[Node22.13 documentation](https://nodejs.org/download/release/v22.13.0/docs/api/typescript.html#type-stripping)
documents the supported explicit flag. For a direct UI run:

```sh
ttr resources run -- node --experimental-strip-types apps/learn/tests/programming-workspace/run-ui.mjs
```

Published correction `766f33b7c4` passed the original equivalent local batch: 4 geometry
checks and 17 workspace checks, no console/page errors, focused lint/typecheck pass.
This portable followup relocates/sanitizes that harness; its validation is recorded
in the PR handoff separately. Customer pixels/Library metadata stay outside Git.

The canonical frontend slice additionally provides `run-canonical.mjs`, a finite
loopback browser check for the actual catalog, author CRUD form and database DTO
workspace adapter. Its navigation/server actions use synthetic in-memory fixtures;
no actual app authorization, API or database requests occur. It checks draft reload,
Back/Forward, problem/language and actor switching, unavailable session storage,
late mutation isolation, case capacity, conflict preservation and parent phone UX.
Results are ignored under `evidence/canonical`; missing dependencies are blockers,
never an instruction to install. Run only within the admitted normal FIFO budget.

Review regressions can run without a browser or server:

```bash
ttr resources run -- node --experimental-strip-types --test apps/learn/tests/programming-workspace/review-regressions.node-test.mjs
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

The four Run/Submit flow checks first wait for exact output tagged with the synthetic attempt
ordinal, UUID, challenge and Run/Submit kind. This same browser wait predicate has
a regression proving that an older identical 1/1 verdict cannot pass. Stored
fixture attempts are read by submission id. The tags identify fresh UI renders;
they provide no evidence of real judge correctness.

Run the canonical catalog/authoring/history/navigation harness within FIFO:

```sh
ttr resources run -- node --experimental-strip-types apps/learn/tests/programming-workspace/run-canonical.mjs
```
