# N-213 deployment queue shadow trial

Replay synthetic or sanitized deployment intake on the repository's Node
runtime. The trial uses only local input and stdout/stderr.

```sh
node scripts/ci/deployment-queue/trial.mjs scripts/ci/deployment-queue/events.fixture.json
node --test scripts/ci/deployment-queue/trial.test.mjs
```

The schema version 1 input contains an `events` array in intake evaluation
order. Each event carries `app`, `target` (`production` or `main`), a full
lowercase Git `sha`, the immutable `recipeDigest` (`sha256:` plus 64 lowercase
hex digits), and the `observedHeadSha` for that app and target at evaluation.
The observations are supplied by the fixture. The trial does not authenticate
events, resolve refs, or verify recipes.

A newer unique event at the observed head supersedes the pending candidate for
its app and target. Deduplication covers the full app/target/SHA/recipe tuple
for the lifetime of the replay, including superseded entries. If an observation
shows a changed head and supplies no unique replacement, the now-stale pending
candidate receives `head_changed`. This also fences a branch rewind to a
previously seen tuple. Production candidates come first, with surviving jobs
ordered by acceptance within each target, matching the retained L1 ready-queue
priority. The trial has no in-flight jobs or retry loop.

The CLI prints one JSON object on stdout. `queue` contains zero-based indices
into `decisions` in priority order. Every input gets a `pending` or `no_work`
disposition. `no_work` has a distinct reason (`superseded`, `duplicate`,
`stale_head`, or `head_changed`), with `displacedBy` or `duplicateOf` linking
the applicable observation. The bundled example yields `queue: [3,1,2]`.
Input errors exit 1 and emit one JSON error on stderr with empty stdout.

A future read-only `ttr deploy` diagnostic can pass normalized JSON with
`node scripts/ci/deployment-queue/trial.mjs -` and display the plan as advisory
output. The exit code describes replay and parsing only. This CLI has no build,
security-check, GitHub status, or deployment interface. Required checks,
artifact and release admissions, and active lease/provider custody remain with
their existing owners. L1 owns the live scheduler, including any future
recipe-aware identity migration.
