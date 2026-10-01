# Source-only hosted full-schema proposal

Published as inert review artifacts only. Nothing in this directory registers a
workflow or grants execution admission. `workflow.yaml.txt` is deliberately outside
.github/workflows; `proposal.mjs` has no automatic caller. `guards.node-test.mjs`
uses Node standard-library tests and performs no Docker or SQL operations.

A later separately reviewed activation would copy the workflow candidate to
.github/workflows/supabase-hosted-typegen.yaml, add the filename to the switchboard
in tuturuuu.ci.ts (exported by tuturuuu.ts), and obtain full-stack resource admission
before enabling or dispatching. This PR does none of those actions.

Commands (Linux hosted runner only, repository root):

1. Repository composite action installs pinned Supabase CLI 2.117.0; Node 24, Bun 1.4.1.
2. Set SUPABASE_CLI_BINARY_OVERRIDE to that installed native binary.
3. `node apps/database/tests/programming-hosted-typegen-review/proposal.mjs prepare`
4. `node apps/database/tests/programming-hosted-typegen-review/proposal.mjs run`
5. Unconditionally: `node apps/database/tests/programming-hosted-typegen-review/proposal.mjs cleanup`
6. Success and verified cleanup only: `node apps/database/tests/programming-hosted-typegen-review/proposal.mjs artifact`

The supported helper stages tracked Supabase files into one recorded disposable root,
with a project identity including hosted run ID/attempt. It invokes scoped `start`,
`db reset`, the complete checked-in SQL suite, and `gen types typescript --local
--schema public,private,storage`; it never links/pushes a remote project or invokes
post-reset-ai-credits.js. Reset applies only to that staged disposable stack.
Generated output is the helper's allowed packages/types/src/supabase.ts, without a
handwritten type patch, commit, or push. Review its diff before normal integration.

One ubuntu-24.04 runner, concurrency 1, job 35 minutes, lifecycle 25 minutes,
cleanup command 3 minutes/step 4 minutes. Aggregate container cgroup: 2 CPUs,
6 GiB RAM, no swap; verify systemd cgroup driver and each owned container's parent.
Docker logs cap 20 MiB per container. Start disk >=14 GiB free; abort below 8 GiB
or above 10 GiB disk growth, sampled every 2 seconds. Inventory command timeouts are 5 seconds; a tick makes up to three inventory
commands, so blocking inventory can delay the 2-second watchdog/25-minute process
timer by up to 15 seconds. The 35-minute job timeout is the outer wall-clock cap. Disk control is a watchdog,
not a filesystem quota. Daemon/image-download overhead lies outside the container
cgroup; it remains bounded by fresh hosted-runner capacity, disk watchdog, and job
wall time. No local M4 full stack or installation.

Inventory uses the exact installed CLI `--version` and `services -o json`, then
records actual owned Docker image content IDs during execution. Enabled repository
services: Postgres 17, API/gateway, Auth, Realtime, Storage/image transformation,
Studio/pg-meta, Inbucket. Pooler, edge runtime, analytics/vector disabled in config.
Do not claim unexecuted image tags/digests are attested. Normal setup/image download
network is needed; checked-in SQL can have extension/HTTP hooks, so the proposal
is not proof of offline execution or production absence of drift. No production
credentials, deployment permissions, linked project, OAuth login, or customer writes.
OAuth startup values are synthetic job-local placeholders; no secret references.

On success upload ONLY supabase.ts and provenance.json with retention 1 day.
Provenance: exact HEAD, migration fingerprint, CLI/service inventory, observed image
IDs, types hash, schema list, resource limits/disk observations, run/attempt, cleanup
verification. No DB snapshots, CLI status output/tokens, .env files, runtime logs,
private images, or customer data. State remains runner-local and is not uploaded.

Cleanup uses the supported `--cleanup <recorded-root>` and validates project/repo
identity first; verify no owned containers, volumes, temporary root, or open port block remains.
Hard hosted-runner cancellation cannot guarantee an always step runs: runner teardown
is the final backstop, never broaden cleanup to shared/default projects.

Frozen programming SQL proof remains 2895cf4d9e5d6cae17690c31eb4eecae02800de21730b3bdf6b8a67fc306e96f.
Existing delta fixture proof does not substitute for this unexecuted full-schema gate.
Real Next/API/RLS/runner integration and owning CI remain separate gates.

Source validation: Node syntax pass; three tests pass for disk budget boundaries,
exact cleanup inventory ownership, and rejecting non-hosted execution before Docker.
Existing YAML parser verifies manual-only trigger, contents-read permission, timeout,
and unconditional admitted cleanup. The repository's actual getWorkflowDecision was checked with an explicit disabled
candidate setting and denied manual dispatch. No switchboard setting is changed here. Docker/systemd execution,
forced interruption cleanup, service/image inventory and full-schema/typegen remain
unexecuted and must be validated on the admitted hosted runner; these three unit
checks are not a runtime resource-control proof. No dependency was installed.

## Immutable delivery and CI-defect context

Backend corrected head: f83ebb0d783b1555ea48f93233448611e8fa7289.
Frontend dependency merge head: 3d05378f78eb6abab6dc9337cae64789b21e1c1e.
Reviewed frontend correction retained: cde193865c3cb68f4e6bebf30d774d20cc2283a1.
Earlier backend reviewed source: 048933b4f6d2b78d35d91b752184aaf3078ea605.

Backend048 Biome job110301337967/run36839608030 reported exactly two formatting
errors in packages/education-core/src/education/programming-execution.test.ts and
packages/internal-api/src/programming.test.ts. f83 applies the formatter to those
owned tests, without behavior changes.

Type Check job110300512359/run36839608180 reported TS6059 at
src/education/programming-runner-contract.test.ts(6,35): SDK
src/cli/devbox-judge-sandbox.ts was outside education-core's rootDir src; its
transitive devbox-judge-languages.ts import caused the second TS6059. f83 moves
that cross-package integration test to packages/education-core/tests and adjusts
its three relative imports. Vitest already discovers tests there; the same actual
runner parser and all assertions remain. Production typecheck's src rootDir is
unchanged, and no compiler exception or fake declaration was introduced.

Twelve tests across runner-contract/execution/internal-api passed; focused
source-mapped backend no-emit TypeScript and three-file Biome passed. The direct
package typecheck locally failed unresolved links to another checkout's missing
build outputs in the reused compatible dependency tree. It is not reported green
and is not the CI TS6059 or evidence of absent generated schema types. No build,
install, broad unrelated fix, or CI rerun occurred. Fresh exact-head CI must verify.
This inert review branch does not change those two published implementation branches.

## Reproduce source-only checks

From repository root, with compatible existing Node/dependencies:

```sh
node --test apps/database/tests/programming-hosted-typegen-review/guards.node-test.mjs
node --check apps/database/tests/programming-hosted-typegen-review/proposal.mjs
node node_modules/@biomejs/biome/bin/biome format apps/database/tests/programming-hosted-typegen-review/proposal.mjs apps/database/tests/programming-hosted-typegen-review/guards.node-test.mjs
git diff --check
```

Use normal Tuturuuu resource FIFO for these checks. No install is needed for the
Node guard tests. YAML parsing used the already available yaml package; no parser
was installed. The `.yaml.txt` candidate is not interpreted by GitHub Actions.
A directory inside apps/database/tests is a review artifact, not a new docs-site
page, so it requires no apps/docs/docs.json navigation entry.

## Tool and image provenance limits

The composite setup action resolves 2.117.0 from bun.lock and uses
supabase/setup-cli@45a513f8c64c0bc8e0e3dfe572b5c95be85f6359 (v3.0.1), bounded
four attempts and 5/10/20-second setup backoffs. The candidate uses the existing
checkout@v7, setup-node@v7, upload-artifact@v7 conventions and setup-bun@v2.
Action major refs are mutable; exact resolved action SHAs and hosted image release
come from a future admitted run log, not these unexecuted artifacts. The wrapper
checks the native CLI's version against the database package's exact pin.

`services -o json` captures CLI-advertised service versions, not pulled digests.
Owned Docker `.Image` content IDs observed during runtime are recorded separately;
no image pull, tag digest, service count or image release has been attested locally.
Image downloads use the candidate's ghcr.io Supabase registry. Reconcile the runtime
inventory with repository config and fail startup/resource checks if unsupported.
Do not use the earlier standalone PostgreSQL fixture image as a full-stack proof.

## Termination and remaining proof limits

The lifecycle child runs in its own POSIX process group. Timer, disk/cgroup checks,
or SIGTERM/SIGINT kill that owned group; the always step invokes supported scoped
cleanup from the recorded root. That helper validates the temp-directory prefix,
metadata ownership and project ID. Cleanup has a separate 3-minute command timeout,
and verifies exact owned container/volume absence, root absence, and all eight ports
available on loopback. Failed cleanup blocks artifact production. Do not remove
unrelated resources or force a shared/default database reset to recover.

SIGKILL or hosted runner cancellation can interrupt the always step; VM teardown is
the last backstop. These source tests do not verify interrupted Docker startup,
systemd enforcement, CLI reset behavior, SQL hooks, image inventory, full suite
compatibility, typegen output, schema drift, auth/RLS through actual product APIs,
or the real execution runner. The container cgroup does not constrain daemon/CLI
memory; the fresh hosted VM and outer timeout bound those processes. Disk growth
is sampled and can overshoot before abort; no hard volume quota is claimed.
Source publication is explicitly separate from held full-stack execution admission.
