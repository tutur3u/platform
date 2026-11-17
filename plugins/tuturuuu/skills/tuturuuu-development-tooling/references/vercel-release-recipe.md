# Offline Vercel release recipe

Use `scripts/ci/release-vercel-config.mjs`, `release-vercel-queue.mjs` and
`release-vercel-modes.mjs` for the Calendar mechanism. Queue ports and provider
operations are injected; no live authority transport is supplied. Never add a
provider fallback, queue directory or scheduler. A job requests exactly one phase.

Preserve the stage publisher's 37 guard codes, pre-spawn subcommand allowlist,
output guards before reads/uploads, skip-domain deploy, and unchanged-alias
readback. The config test pins all literals, workflow parity and a baseline
signature of every exported publisher value/function. Config-import errors have
the separate `VERCEL_CONFIG_INVALID` code and precede stage stop receipts.

Run the queue, modes and config tests individually, the unchanged Calendar
publisher/stage-only/output and Mail tests, and `bun check:changed` through the
owning host broker at the exact commit. Use synthetic ports only. Verify stale
epochs, cancellation, unknown acceptance, durable receipt recovery, alias target
and preimage/readback, human promotion approval and bounded watch thresholds.
Fast green probes must span the observation window rather than exhaust samples.

Production-only environments retain production-only refs. Promote and rollback
need separate operation-scoped approval; stage cannot invoke them. Watch emits
rollback-required evidence; cancellation itself never triggers rollback. Preserve
active dispatch blob pins, adding imported configuration to the reviewed pin set
before activating a config-driven publisher. Source tests do not prove authority
authentication, durable storage, worker eligibility or provider fencing.

Verify lifecycle dispatch receipts retain ReleaseStop codes/phases. Policy
failures are failed; cancellation is stopped; accepted-but-uncertain effects are
unknown. Test final authority acknowledgement refusals and forged replayed
receipts. Reject unknown fields at every payload object boundary, including
secret-shaped extras. Input env names reject credential words anywhere.

Bind the authority-provided predecessor digest, phase/status, exact approval,
qualification evidence and canonical target. Compute config/recipe digests from
the running records/source. Check production ancestry and preserve the recorded
preimage as the sole rollback target. The authority lock must cover the alias
across environments: Vercel does not provide an atomic alias CAS. Re-entry at the
verified target is read-only. Repeated fake-clock tests include 1500ms green
probes and early timers; no probe receives a shortened timeout at the window edge.

For combined Calendar/Mail diagnostics, install workspace dependency links as well
as root dependencies: CF fixture supplier resolution starts under `apps/calendar`.
A root-only node_modules link does not make `cf/package.json` available there.
Run Python tests with Python, separately from Node's test runner.

Use `node --test --test-concurrency=2` for the combined Node suite under host
admission. The Mail namespace-termination tests launch a fresh Node process with
a two-second wall-clock timeout; unrestricted file parallelism can consume that
budget in child startup/execution. Preserve the termination assertion and timeout.
Capture the unrestricted failure separately and compare the exact failing file
alone before attributing it to shared state. Bounded-concurrency success does not
erase a recorded unrestricted failure.
