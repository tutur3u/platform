# Inert hosted full-schema/typegen proposal

This directory is source for review. The PR also includes a narrow atomic-metadata
fix in the existing supported helper, without adding an automatic caller. `workflow.yaml.txt` is outside
.github/workflows; no switchboard registration or automatic caller is added.
No Docker, network-policy, database, full-stack, build, install, typegen or workflow
execution is admitted by source publication. Activation and dispatch require a
separate reviewed change and explicit resource admission. Parent owns release/CI.

## Exact helper contract and commands

A future reviewed activation would copy the text candidate to
.github/workflows/supabase-hosted-typegen.yaml and register its filename in
`tuturuuu.ci.ts`, exported by `tuturuuu.ts`. That is not done here. Its
manual-only trigger and switchboard gate do not replace resource admission.

Commands below describe the unexecuted hosted job, from repository root:

1. Setup Node 24, Bun 1.4.1 and repository composite pinned Supabase CLI installer.
2. Apply and verify the candidate's Docker cgroup, DNS and IP-denial configuration
   on a fresh dedicated Ubuntu runner before any container can start.
3. Set SUPABASE_CLI_BINARY_OVERRIDE to the explicitly installed native CLI.
4. `node apps/database/tests/programming-hosted-typegen-review/proposal.mjs prepare`
5. `node apps/database/tests/programming-hosted-typegen-review/proposal.mjs run`
6. Always: `node apps/database/tests/programming-hosted-typegen-review/proposal.mjs cleanup`
7. Success plus verified cleanup only:
   `node apps/database/tests/programming-hosted-typegen-review/proposal.mjs artifact`

`prepare` checks the native CLI exact pin and service metadata, hashes tracked
migrations, checks disk, and verifies network denial before staging. Output
metadata stores exactly the supported helper's repository-relative
`packages/types/src/supabase.ts`, using its actual constant and validator.

The existing helper copies tracked Supabase files to one owned temporary root,
with run/attempt-specific project identity and eight available loopback ports.
`run` verifies recorded ownership and the network gate before passing only
`--resume <recorded-root>` to that helper. The helper invokes:

```text
supabase --workdir <owned-root> start
supabase --workdir <owned-root> db reset
supabase --workdir <owned-root> test db
supabase --workdir <owned-root> gen types typescript --local --schema public,private,storage
```

Reset targets only the staged disposable stack. The ordinary/shared/prod database
is never reset, linked or pushed. No post-reset-ai-credits.js hook runs. The helper
atomically writes only its approved generated type file; there is no handwritten
type patch, auto-commit or auto-push. Review generated output before integration.

## Container egress must be denied before migrations

Historical migration
`20260205070000_add_exchange_rates_and_seed_currencies.sql` schedules
`net.http_post` at `0 6 * * *`, falling back to
`https://tuturuuu.com/api/cron/finance/exchange-rates` even with an empty service key.
Missing credentials are not an egress boundary. That migration remains unchanged;
removing its cron job or changing its SQL would not establish authoritative replay.

The inert candidate configures systemd cgroup IP filtering on the parent Docker
slice BEFORE the CLI lifecycle: IPAddressDeny=any; IPAddressAllow only loopback
and 172.28.0.0/16, the dedicated Docker address pool. Both IPv4 and IPv6 traffic
are filtered, with inheritance to container child cgroups. A privileged preflight
reads the exact slice allow/deny properties and effective kernel ingress/egress
program attachments via bpftool; missing tools, configuration, permissions or
attached filters abort before any helper start/reset. Checking configuration
without attached filters is insufficient because unsupported kernels can ignore
systemd IP filtering. [Systemd directive source](https://raw.githubusercontent.com/systemd/systemd/main/man/systemd.resource-control.xml),
[bpftool effective-cgroup inspection](https://raw.githubusercontent.com/libbpf/bpftool/main/docs/bpftool-cgroup.rst).

Docker's fresh-daemon configuration fixes user-defined address allocation to that
pool and assigns all containers to the protected parent slice. IPv6 Docker
allocation is disabled; the IP filter also denies IPv6 destinations except
loopback. Internal service traffic and local CLI health/typegen connections are
allowed. Container destinations on public networks, including the production
HTTP cron target, are denied before SQL/cron execution, rather than on a sampled
post-start inspection. Runtime observation still checks each owned container's
cgroup parent and aborts on mismatch.

The candidate also installs dedicated IPv4/IPv6 bridge-forwarding drop rules
before any containers exist: bridged same-network service packets may return to
Docker routing; other packets arriving from Docker bridges are dropped. The
owned chain is first in DOCKER-USER and FORWARD, and its exact rules/ordering are
verified before helper startup. This covers forwarded traffic even when its
socket originates from a daemon outside the container cgroup. Docker host downloads
use host OUTPUT rather than this container forwarding path.
[Docker firewall ordering](https://docs.docker.com/engine/network/firewall-iptables/).

Public DNS forwarding is also disabled: the default container DNS upstream is
127.0.0.1, which refers to container loopback. Docker's embedded DNS still resolves
its internal service names; external lookups cannot use the host's public resolver.
[Docker network and DNS behavior](https://docs.docker.com/engine/network/).

Host setup, CLI installer and image downloads remain outside the restricted
container slice. This separates required host downloads from migration/cron
traffic originating in Postgres containers. No production credentials or linked
project are supplied. OAuth placeholders are synthetic job-local startup values;
no login or customer write is authorized. No production endpoint is used as a
network test target.

This is a proposed, unexecuted policy. The future admitted runner must verify
kernel/daemon enforcement and internal connectivity before accepting full-schema
proof. It must not weaken the denial or edit authoritative migrations to make a
run pass. bpftool/iptables/ip6tables/systemd/cgroup-v2 availability is an explicit hosted prerequisite;
no package was installed locally to obtain it. Runtime configuration remains held.

## Tool and image provenance

The repository composite resolves Supabase 2.117.0 from bun.lock, using
supabase/setup-cli@45a513f8c64c0bc8e0e3dfe572b5c95be85f6359 (v3.0.1), four
attempts with 5/10/20-second setup backoffs. Existing checkout@v7, setup-node@v7,
upload-artifact@v7 and setup-bun@v2 conventions are retained. Major action refs
are mutable: resolved action SHAs and hosted image release must come from the
future run log. The native CLI version must equal the exact database-package pin.

`supabase services -o json` provides advertised service versions; owned Docker
.Image content IDs observed during execution provide a separate pulled inventory.
The candidate uses ghcr.io as the Supabase image registry. No image was pulled,
and no exact digest or full service inventory is attested by these source checks.
Repository config enables Postgres 17, API/gateway, Auth, Realtime, Storage/image
transformation, Studio/pg-meta and Inbucket; pooler, edge runtime, analytics/vector
are disabled. Reconcile the actual pinned CLI inventory with that configuration.
Do not substitute the earlier standalone Postgres delta-fixture image.

## Aggregate limits, disk and time bounds

One Ubuntu 24.04 hosted runner, with no pre-existing containers/volumes/custom networks; workflow concurrency one, no cancellation of an
existing run. Outer job timeout 35 minutes; lifecycle group 25 minutes; cleanup
group 3 minutes with a 4-minute cleanup step. The aggregate parent container slice
sets CPUQuota=200%, MemoryMax=6 GiB and MemorySwapMax=0 before startup, with
property readback and owned-container cgroup checks. Limits apply collectively
to descendant containers, not independently to each service. Docker logs cap at
20 MiB per container. More than 32 owned containers aborts observation.

Disk must start with >=14 GiB free. Abort below 8 GiB free or above 10 GiB growth.
The watchdog samples every two seconds; inventory commands have five-second
limits and a tick can run three, delaying the process timer/watchdog by up to
15 seconds. A sampled threshold can overshoot; it is not a filesystem/volume quota.
Host daemon, CLI, installer and image-download memory lie outside the container
slice, bounded by the fresh hosted VM and outer job wall time. Aggregate limits
and the network filter have not been exercised here.

## Prepare ownership, termination and cleanup

All fingerprint/provenance work and output-directory creation precede staging.
As soon as staging returns, ownership is written atomically via an owned temporary
file/rename. Failed initial ownership writes remove exactly that staged root;
failed removal reports the remaining scoped recovery path. Later state writes
cannot truncate the previously recorded ownership. Staging never starts Docker.

The supported helper's own recovery file also uses exclusive temporary writes
and a same-directory atomic rename for staging and every lifecycle transition.
A SIGKILL during a write leaves the preceding complete recovery record readable;
a partial temporary can remain until scoped cleanup removes the owned root. A
normal write failure removes its temporary in finally. This is process-interruption
atomicity, not a claim of fsync-backed power-loss durability.

The regression runs the actual helper lifecycle in synthetic subprocesses, pauses
its real metadata writer after a partial temporary write, and SIGKILLs the owned
group at starting/resetting/testing/typegen. The actual recovery reader must parse
the preceding complete record. That record then drives the actual supported
cleanup function with a mocked CLI runner, verifying exact project/root stop args
and actual owned-root removal. No Docker or SQL work is performed. A separate
normal-transition test exercises the helper's default metadata writer throughout.

Lifecycle AND cleanup helpers run in new POSIX process groups. Timeout, monitor
failure or SIGTERM/SIGINT kills the owned group, covering helper and inherited
Supabase CLI descendants. The wrapper also terminates leftover descendants when
the parent exits. Docker objects are separate: they still require the unconditional
scoped cleanup step. The async cleanup timeout does not kill only the helper while
leaving its CLI child alive.

Cleanup validates recorded root, repo, HEAD and project identity, then invokes the
supported helper with `--cleanup <recorded-root>`. It never resets a database or
broadens deletion to unrelated resources. After success, verify no exactly owned
container/volume/network/root remains and all eight loopback ports are available. Any
failure, changed identity or remaining object blocks cleanup verification and
artifact production. Recovery uses only the preserved supported metadata/root.
SIGKILL or hosted cancellation can interrupt an always step; VM teardown is the
last backstop. Those cancellation cases are not claimed to guarantee cleanup.

## Artifacts are public material

This repository is public. Generated types and provenance uploaded as workflow
artifacts must be treated as public material. One-day retention controls duration;
it does not make them private. Review every permitted field before activation.
Only supabase.ts and provenance.json are eligible, after success AND verified
cleanup. Provenance includes HEAD, migration fingerprint, CLI/service versions,
observed image content IDs, types hash, schema names, resource limits/disk readings,
network policy/program IDs/owned firewall rules, run/attempt and cleanup status. Kernel program IDs and
Docker project/container identifiers are infrastructure metadata, not credentials.

Do not upload database snapshots, runtime/CLI status logs, tokens, .env files,
private screenshots, customer rows or other data. State remains runner-local and
is not uploaded. The artifact contains schema declarations, not database records.
No artifact was generated or uploaded by source validation.

## Source validation and remaining proof

From repository root, using existing Node and normal Tuturuuu resource FIFO:

```sh
node --test apps/database/tests/programming-hosted-typegen-review/guards.node-test.mjs apps/database/tests/programming-hosted-typegen-review/lifecycle.node-test.mjs apps/database/tests/programming-hosted-typegen-review/metadata.node-test.mjs
node --check apps/database/scripts/run-supabase-isolated.js
node --check apps/database/tests/programming-hosted-typegen-review/proposal.mjs
node --check apps/database/tests/programming-hosted-typegen-review/process-group.mjs
node --check apps/database/tests/programming-hosted-typegen-review/network-policy.mjs
node node_modules/@biomejs/biome/bin/biome format apps/database/scripts/run-supabase-isolated.js apps/database/tests/programming-hosted-typegen-review/*.mjs
git diff --check
```

The latest 21 source tests passed. Tests cover real helper staging/metadata/output validation using owned synthetic
filesystem fixtures; failed ownership writes; mocked resume/cleanup argv and
bounds; changed identity/residue/interruption denial; fail-closed policy metadata;
and harmless fake helper/CLI descendants killed on timeout, interruption and
monitor failure. They do not start Docker, install tools, configure network policy,
run SQL/typegen or contact a production endpoint. Existing YAML parser checks the
text candidate; no executable workflow or switchboard registration exists.

Remaining gates: admitted hosted kernel/Docker/egress and cleanup-interruption
verification, full historical migration replay/SQL suite, generated public/private/
storage types, actual Next/router/auth/API/RLS/history/enqueue integration, actual
runner integration and owning CI. No offline replay, production drift absence,
release readiness or runtime resource-control success is claimed from these tests.

## Immutable implementation and exact CI defect context

Backend corrected: f83ebb0d783b1555ea48f93233448611e8fa7289.
Frontend dependency merge: 3d05378f78eb6abab6dc9337cae64789b21e1c1e.
Reviewed frontend retained: cde193865c3cb68f4e6bebf30d774d20cc2283a1.
Earlier reviewed backend: 048933b4f6d2b78d35d91b752184aaf3078ea605.
Frozen programming SQL SHA256:
2895cf4d9e5d6cae17690c31eb4eecae02800de21730b3bdf6b8a67fc306e96f.

Biome job110301337967/run36839608030 reported two formatting errors in
programming-execution.test.ts and internal-api/programming.test.ts; f83 applies
formatting only. Type Check job110300512359/run36839608180 reported TS6059 at
programming-runner-contract.test.ts(6,35): SDK devbox-judge-sandbox.ts and its
transitive devbox-judge-languages.ts were outside education-core's src rootDir.
f83 moves that cross-package test to education-core/tests and adjusts relative
imports, preserving actual-parser assertions and production compiler scope.
Twelve affected tests and focused mapped backend types/formatting passed. Direct
local package tsc remains blocked by reused dependency links to another checkout's
missing build outputs; fresh CI must confirm. This is distinct from the remaining
authoritative generated-schema gate. This proposal changes neither implementation
branch nor the migration; delta SQL proof remains historical scoped evidence.
