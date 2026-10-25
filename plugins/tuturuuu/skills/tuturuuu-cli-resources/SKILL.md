---
name: tuturuuu-cli-resources
description: "Queue heavy local Tuturuuu validation and diagnose competing CPU or RAM workloads with ttr resources."
---

# TTR Resource Control

Keep concurrent editing responsive by admitting heavy validation through one
per-user queue. Check `ttr resources help` and `ttr resources status --json`
before a broad test, build, type check, database setup, or browser suite.
These commands are local and require no login.

## Choose execution

- Prefer a verified remote runner for broad validation:
  `ttr box run --runner <remote-id> -- <command>`. Confirm its actual host and
  checkout; same-machine runners and containers do not offload CPU or RAM.
- For local work, use `ttr resources run -- <command>`. Sequence lint, tests,
  and browser QA. Do not start independent heavy commands with Promise.all,
  parallel shells, or background operators merely because separate threads
  own them.
- Run focused checks first. The queue does not excuse skipping required checks.
  Persistent development servers and custom subprocess fan-out still consume
  resources; start only services needed for the task and clean up your own.

## Setup and inspect

When machine setup is authorized, use:

```sh
ttr resources setup --root <repo> --shell zsh --dry-run
ttr resources setup --root <repo> --shell zsh
ttr resources status --json
```

Explicit `run` validates and reuses existing executable shims without provisioning. Missing, stale or malformed launchers fail before admission with an explicit setup instruction. Repository scripts and check:changed invoke `~/.bun/bin/ttr` directly, bypassing workspace binaries. Run and shim never provision launchers. Setup refuses existing launchers owned by a different installation; use the explicit force preview and drain procedure below before switching. Setup is the provisioning boundary; inspect occupancy and obtain installation authority before replacing an installed scheduler. An early lightweight resource dispatch avoids general CLI imports but source review does not prove a host startup repair.

Repeat `--root` for other repositories. Linked Git worktrees inherit repository
scope. Zsh/Bash hooks apply to new shells; `--shell none` avoids shell edits and
supports explicit queue use. Installation backs up shell files. Setup does not
modify repository source, Docker settings, credentials, or runner registrations.

The queue defaults to one lane per user. `validationLanes` is the base count,
an integer from `1` to `8`, configured with `setup --lanes`. Lanes split the
aggregate Vitest/Cargo total, and each lane gets at least one worker. Turbo runs
one task per lane, and explicit worker flags are capped per lane. Out-of-range
numeric config values clamp with a warning that names the field. Wrongly typed
fields make shims run unmanaged with an actionable error, and `run` fails.

Adaptive lanes require a CLI release before activation. Optional
`maxValidationLanes` accepts integers from the base count through `8` and defaults to the
base count. Host capacity never changes that default automatically. After release
and a full idle drain, explicitly opt in with
`ttr resources setup --max-lanes N`. Use a justified `--workers` value only when
needed. Base-lane, maximum-lane, and aggregate worker-budget changes all require
idle owners and zero waiters. The maximum is a ceiling, not a concurrency promise.

Burst admission above the base requires load divided by CPU count below `0.7`.
macOS must report normal memory pressure, `1`. Linux must have at least 25%
available memory and enough for the estimated per-lane need. Missing telemetry
refuses burst admission while preserving base behavior. Burst memory checks still
apply with `--ignore-pressure`. Preserve FIFO order and never interrupt running
jobs to shrink occupancy.

Effective lanes are `max(1, min(maxValidationLanes, host lane ceiling))`, with
a host lane ceiling of `min(8, floor(memory GiB / 4), CPUs - 2)`. Base lanes
above the ceiling are capped too, and `status` warns about them. Worker totals
no longer cap lanes. After the aggregate budget is spent, each pressure-gated
burst lane gets exactly one worker. Multi-lane worker totals clamp to the host
worker ceiling, `min(8, floor(memory GiB / 8), floor(CPUs / 2))`.

Before replacing the installed scheduler, fully drain old brokers, shim
processes, and FIFO waiters. An old scheduler encountering `slots/2` fails closed.
Do not rewrite tickets, clear live locks, or operate mixed versions. Source review
is not activation approval; documentation changes do not activate the installed
scheduler. Status retains `owner`, `owners`, `laneCount`, `waiting`, and `limits`,
and adds `baseLanes`, `maxLanes`, `occupied`, and `burst: { eligible, reason }`.
Reconcile legacy status consumers and check all owners, not only the compatibility
`owner` field. Unknown or malformed occupancy fails closed. Admission is reentrant. Admitted jobs
export `TTR_RESOURCES_ADMITTED=<token>`. Nested `run` calls and shims pass straight
through with the owner's caps when that marker names a live owner inside their
process tree (ancestor or owned process group), or when ancestry alone finds an
admitted ancestor (filtered env). Stale or copied markers queue normally, and
so does any marker when `ps` cannot read the process tree. Waiters
recheck ancestry about once per second, so they never deadlock behind their own
ancestor. Ancestry uses only `/bin/ps` or `/usr/bin/ps` with an empty
environment, never PATH. Only read-only coreutils (`cat`, `echo`, ...; never
`ls`) skip the queue, and only when the executable that would run canonicalizes
to a root-locked binary under `/bin` or `/usr/bin` (every path component
root-owned, not group/other writable) and no `LD_*`/`DYLD_*` loader variable is
set. The CLI spawns that canonical path, never the original symlink. Runtimes and package managers (even `--version`, since
`NODE_OPTIONS` can preload code) and every git command (fsmonitor, hooks,
pager, textconv) always queue. Shims classify only the program (first positional), never later arguments,
and never admit the `ttr` launcher itself (it starts through the bun shim
when shims are on PATH, e.g. from `~/.zshenv`). Cancellation releases only its own slot after the
owned child group drains. Do not use separate
`TTR_RESOURCES_HOME` values across projects: that creates independent queues.

Elevated pressure delays new admission with cancellable backoff outside the
mutex and a fresh pressure probe before launch. Continue lightweight editing. Do not kill an owner, delete a
live lock, or routinely use `TTR_RESOURCES_BYPASS=1` / `--ignore-pressure` to
avoid waiting. A bypass is a deliberate exception for a known small operation.

Disk admission uses hysteresis. A volume turns `low` below `TTR_STORAGE_MIN_FREE`
(15G), 5% free or 5% inodes. It recovers only at `TTR_STORAGE_RECOVER_FREE*`
(default twice each).

While a volume is `low` and automatic reclaim is opted in, admission first
runs it under the cleanup lease of this storage authority (one OS user's
`~/.tuturuuu/storage` on one host; not host-wide across OS users):

- It removes only path-bounded trees: idle DerivedData and merged-clean
  worktree build artifacts. Homebrew, npm, Docker and simulator cleanups are
  manual only.
- Right before each item it captures the directory identity, re-checks holds
  from every project's holds file, a cwd scan of every live process of this
  user, and `lsof`. Hidden processes of other users (root included) are
  tolerated only with macOS `private-tree` evidence for the item.
- It fsyncs an intent receipt before acting and removes only inside the
  lease guard, which re-validates the lease's fence under the mutation lock.
- It stops at the recover thresholds.

If the volume is still `low`, the heavy command exits 75. Admission is checked
before queueing and again right before launch; an unmeasurable volume
(UNKNOWN) is refused too. The blocker report
lists skipped items, the largest manual actions with their hold owners, and the
free space needed to resume. A second orchestrator on the same host gets the
holder's name instead of a parallel run.

Alerts print once per level. Set `TTR_ORCHESTRATOR_ID` so leases and receipts
name your orchestrator. Automatic reclaim is off by default: opt in per storage authority with
`TTR_STORAGE_AUTO_RECLAIM=1` or `1` in `~/.tuturuuu/storage/auto-reclaim`.
A false value (`0`, `false`, `off`, `no`) in either is a hard kill switch
for both triggers and manual `ttr storage reclaim --apply`.

`ttr storage reclaim` shows the plan, the lease holder and the last run. A human
still decides worktrees, `node_modules`, the Bun and pub caches, tmp, evidence,
volumes, images and held paths, using `ttr storage suggest` / `ttr storage prune`.
Don't use `--ignore-disk` / `TTR_RESOURCES_IGNORE_DISK=1` for those cases.

With `--offload auto`, the command prefers a devbox runner. Offload skips
runners whose heartbeat reports critical disk (`blockedBy=low_disk`).
`ttr storage fleet` lists every runner's reported headroom and marks stale or
offline runners `unknown`, never healthy. See
`apps/docs/build/development-tools/machine-storage-health.mdx`.

Cross-machine offload: `ttr resources run --offload auto -- <cmd>` runs the
exact pushed `HEAD` on a fresh, attested trusted-development `ttr box` runner
when local lanes are saturated. `--offload <runner-id>` targets one runner.
Dirty trees and commits not on an `origin/*` branch are refused, and no local
environment is sent. When offload cannot run, the message names `blockedBy`
(actionable blockers such as `stale_heartbeat` rank ahead of `trust_cap`).
`ttr resources offload --json` explains eligibility using the server clock.
Once a remote run exists, a failure stops it and exits non-zero; even
`--offload auto` never reruns it locally. Never offload to Judge or playground
runners; selection excludes them. A runner must also advertise
`protocols.commitRun` containing the client's envelope version. Otherwise it is
`blockedBy=capability_missing`, and `auto` queues locally.

## Cross-project budget (shared host)

An optional `budget` in `config.json` layers worker tokens, memory and
per-project shares onto the same lanes, home and mutex. There is no second
queue or home.
- Projects come from roots, including a linked worktree's main checkout.
  Unmatched work is `other` and only borrows.
- Tokens come from `run --tokens N` or `TTR_RESOURCES_TOKENS`. Otherwise they
  are inferred: vitest costs its worker count, browser or DB suites at least 2,
  builds at least 4. Admission grants exactly that many workers.
- Per-project FIFO. Owners reclaim unused share first; borrowing only when no
  owner with spare share waits; no preemption.
- `status --json` shows `budget` (ceiling, used, per-project
  share/used/borrowing/waiting).
- Studio policy: 12 lanes / 24 tokens / 320 GiB, Tuturuuu and Upskii 6/12/160
  each. Roll out only through the SDK reference's Studio plan: pinned
  artifact, drain first, every `ttr` on the host upgraded before the config
  changes, the zshenv shim guard, then a +2 lane ramp with measurements.
  Never edit a shared host's live config from an agent session.

## Multi-host weighted admission

`ttr resources run --hosts -- CMD` admits across `<home>/hosts.json`. It is off
until an operator installs that file after a reviewed release; never write or
activate it from an agent session.
- The registry is trusted only in the canonical `~/.tuturuuu/resources`
  (0700 directory, 0600 file, owned by you, no symlinks, no writable parents).
  A home inside an opted-in repository root is refused. Any other
  `TTR_RESOURCES_HOME` ignores it and disables `--hosts`.
- `--hosts` jobs are heavy unless `--class light`. Nested `run --hosts` reuses
  the ancestor's reservation (verified by process ancestry). The disk probe is
  bounded, runs outside the mutex, and reports `blockedBy=disk`.
- Runners are re-validated against a fresh server-timestamped snapshot just
  before remote creation; if one is no longer eligible, the job requeues.
- Hosts have separate light and heavy slots, per-class CPU/memory weights, and
  reserved CPU/memory/disk headroom.
- Local heavy work keeps the lane FIFO. Runners use the devbox offload
  transport. Stale or unreachable runners and unknown disk are never admitted.
- Reservations are created only inside the admission mutex and released on
  cancel or owner death. Project-only locks never count as host admission.
- Optional per-host `preference` (lower first) orders only eligible hosts
  with capacity; degraded (load per CPU >= `maxLoadPerCpu`, default 1),
  stale, low-disk or full preferred hosts are skipped, never forced. Operator
  order: skr-studio > skr-sonha > skr-linux-lan > M4.
- Fairness is by repository share with a bypass bound (`maxBypass`), so no
  waiter starves.
- Every lane-queued job re-checks disk at dequeue: `TTR_STORAGE_MIN_FREE`
  (15 GiB) and `TTR_STORAGE_MIN_FREE_PERCENT` (5%), fail closed;
  `TTR_RESOURCES_IGNORE_DISK=1` overrides it for one command.

Use `ttr resources hosts --simulate` for the offline dry run. The SDK reference
has the measured old to new limits table.

| Host | Old | New |
| --- | --- | --- |
| M4 | 2 lanes for every class | heavy 2 (2 CPU/5 GiB), light 1 (1 CPU/1 GiB), reserve 4 CPU/8 GiB/15 GiB |
| skr-linux-lan | none (2 validation `flock` slots) | heavy 2 (5 CPU/6 GiB), light 2, reserve 8 CPU/12 GiB/50 GiB |
| Sonha, ThanhStudio | none | not registered |

Capability-aware `--hosts` placement uses repeatable `--requires
ios|macos|flutter|web|rust|docker`, host capability attestations and declared OS
checked against runtime telemetry. Direct tools infer requirements; wrappers
must declare them. Registries containing runners require `hubHostname` to match
the M4 before dispatch. Remote hosts use local admission, never another fleet
dispatch. This fence controls dispatch origin; it does not prohibit local heavy
work or builds. Follow the M4 no-build policy separately. Nested `--hosts` must
validate capabilities and actual OS before reusing a heavy lane or light host
reservation; incompatible nesting fails before spawning.
Requirement parsing and local compatibility checks precede the trusted trivial
command shortcut too; explicit resource bypass retains raw local execution.
Preserve ticket identity, age and bypass on retries; an unknown remote write
must be reconciled rather than replayed. See the owning
[capability and drain-window procedure](../../../../apps/docs/reference/packages/sdk.mdx#capability-placement-and-the-m4-hub).
Mastermind owns Studio pool A (6 base/8 max; no pool B) and idle-only lane changes. Do not count the
same physical Studio twice or activate a registry/config from an agent session.

## SDK supplier updates

For an authorized dev/latest or private-tarball supplier change, use the
[rollout procedure](references/sdk-rollout.md). It preserves the global Bun
installation and the existing queue, verifies checksums, records rollback, and
qualifies each host. Source changes never authorize activation.

## Diagnose and recover
`ttr resources status` lists each owner's command, PIDs, age and CPU, plus waiter
ages. It warns when an owner has been idle at 0% CPU for more than 10 minutes.
Inspect such an owner and its thread; status never kills anything.
`ttr resources monitor --seconds 60` emits bounded JSONL samples of memory
pressure, T3 descendants, and top processes, without command arguments or env
values. RSS differs from Activity Monitor's footprint. A snapshot does not prove
a historical leak. Identify the owning thread before interrupting active work.

If an older CLI lacks this command, report its version and use one serialized
validation command with explicit worker limits until the new CLI is installed;
do not silently launch unrestricted parallel validation.

`disable` / `enable` toggle future automatic admission. Configuration mutations
serialize with admission and read the latest policy inside the mutex. `uninstall` requires an
idle queue and removes only owned hooks/shims, preserving shell content and
backups. Existing processes, absolute binary paths, and replaced PATH values can
bypass automatic shims; explicitly wrap unrecognized commands. Admission caps apply only when enabled; disabled/out-of-scope/bypass commands
retain argv/env. Invalid config errors name the field and range but omit values; `status` still
reports (`config.state`: `invalid`, `disabled`, `enabled` or `missing`, with
warnings) and exits 1 for an invalid config. The queue is cooperative scheduling.

Resource fixtures mock host capacity in Vitest parents and disposable Bun loaders/shims. Read subprocess diagnostics after pipes close; use a separate exit barrier for surviving-descendant tests. Pass a custom script as the launcher target, keeping its working directory a directory. Parent Vitest coverage is not evidence of coverage inside Bun subprocesses.

Budget reclaim priority is decided before global fit. A reclaiming project head drains capacity before admitting later borrowers (`resources-budget.test.ts`, `resources-budget-admission.test.ts`). Playwright always receives a numeric `--workers` cap matching the charged tokens, overriding config defaults and percentage flags. Every new-version admission persists `slots/budget-v3`, including before any budget is configured, by staging outside `slots/` and linking a complete marker under the existing mutex; legacy 0.28.0 rejects that marker even after owners drain. An idle downgrade requires explicit owner custody of removing that marker. At 12 lanes 0.28.0 already fails closed. PID start identity recovery is separately tracked in https://github.com/tutur3u/platform/issues/6561.
Node runtime option values must be consumed before classifying the first program. Unknown or incomplete options admit conservatively; never scan an ordinary program's arguments for another tool. `resources-node-options.test.ts` covers diagnostic directories, profiling/report options, worker caps and Node separators.

Treat `--experimental-specifier-resolution` as an equals-only Node option; its bare form queues as ambiguous. Both Node config-file flags (`--experimental-config-file` and `--experimental-default-config-file`) queue as ambiguous in every form because configuration can enable native tests; inject `--test-concurrency` and preserve a positive lower user limit. If a separate option value itself names a tool, ttr launcher or heavy script, also queue as ambiguous: a future or incorrectly modelled flag must not swallow an executable. `resources-node-options.test.ts` covers both rules; real Node 26.4 probes must verify runtime parsing rather than relying on the option table.

Ambiguous commands default to at least `max(2, vitestWorkers)` tokens. Cap native tests (including config-enabled tests) with `--test-concurrency` at the lower positive requested value or granted token cap; zero means auto and uses that cap, and preserve arguments after the program or `--`. Fix #6561 before enabling budgets on long-uptime Studio hosts; PID reuse can retain a dead reservation and stall all projects. Upgrade/crash and worker-cap regressions live in `resources-budget-upgrade.test.ts`.

### Budget scheduler rollout and rollback

The budget-capable setup preflight runs before `--force`: force applies only to managed launchers already carrying protocol 3. A foreign legacy launcher is refused even with `--force --dry-run`. For that incident, an operator must stop all work, take exclusive custody, verify zero owners and waiters, and preserve the config and launcher bytes. Move only the identified foreign managed launcher files to an operator-owned backup outside `bin`; preserve unmanaged files and any existing budget marker. Then use the verified owning global CLI to run setup with the saved roots and shell settings. Verify every launcher and global version before resuming. Do not use a stale workspace CLI for recovery.

Protocol 3 permanently fences legacy clients on the first normal admission, even when no project budget is configured. The frozen 0.28.0 error `Unknown resource slot; admission is closed.` means upgrade the global CLI and refresh its shims; it is not permission to delete a live marker. At 12 lanes, 0.28.0 already fails closed independently of this marker.

Before rollout, fix [PID start identity #6561](https://github.com/tutur3u/platform/issues/6561) before enabling budgets on long-uptime Studio hosts: PID reuse can retain a dead reservation and stall every project. Source review and a package build do not publish or activate the new scheduler.

Follow the single [SDK budget protocol rollout and rollback procedure](../../../../apps/docs/reference/packages/sdk.mdx#budget-scheduler-rollout-and-rollback). Upgrade every owning Bun global install before refreshing launchers with the existing roots and shell settings; a separate npm-prefix installation is a different owner. Setup does not publish the fence. Its preflight inspects only known launchers in the local resource home; it cannot inventory globals, PATH aliases, cached binaries, running processes or other hosts.

Rollback requires exclusive custody: stop all admissions, disable with the new CLI, drain, then uninstall its launchers and managed shell hooks while the marker remains. Restore a disabled legacy-compatible config and downgrade all globals before removing only empty high slots and `slots/budget-v3`. Then use the legacy owning CLI to restore shims/settings and verify direct and fresh-shell admission without a marker. Never invoke a new-version mutation or admission after marker removal. Disabling alone permits unmanaged work and does not neutralise `.zshenv`.

Non-borrowing requests clamp demand and worker caps to their share; absent/zero shares fail before enqueue. With borrowing, an intrinsically oversized project head gets age priority over younger share heads and reserves draining capacity. Older reclaimers and ordinary-borrower reclaim priority remain intact. Change budget policy only while idle; stale tickets above a reduced host ceiling must be cancelled and requeued. Legacy owners are charged their maximum recorded worker cap and proportional estimated memory, rather than one token and zero memory.

Regression coverage: `resources-budget-publish.test.ts` proves fsync-before-link, one-time warning, fast reuse and stale-stage cleanup. `resources-budget-upgrade.test.ts` kills a publisher with an empty stage and verifies recovery. `resources-budget-rollout.test.ts` covers legacy preflight, installation-only setup, same-global versus consumer identity and idle upgrade. Native worker charging/caps retain positive lower `--test-concurrency`, while zero/auto uses the configured cap (`resources-node-budget.test.ts`).

Prepare fixture shims once per home; concurrent run loaders wait for that preparation instead of racing shell-file compare-and-swap. Scope barriers to the child, operation or detached group that can produce the awaited state. Allow one second for final writes after liveness ends and emit scoped stderr before the test deadline. Keep synthetic CPU, memory and load telemetry consistent so host contention does not alter policy inputs. Test idle-warning status composition with one injected CPU snapshot, asserting warning data and rendered text plus a busy-snapshot negative control. A preliminary zero sample cannot stabilise a later ps read; do not resample an injected table. Reuse a fixture home only with the same CPU/memory budget; changed host budgets require a fresh home.

### Launcher mismatch incident recovery

Symptom: the global CLI rejects missing, stale or malformed launchers. A stale workspace SDK dist can write its own entry into shared launchers before admission, and its nested run can block the queue. Never run operational commands through workspace or ancestor `node_modules/.bin/ttr` or stale `packages/sdk/dist`.

Repository admission uses the verified global `~/.bun/bin/ttr` (stable >= 0.28.0). `check:changed` and `node scripts/ttr-run.js -- COMMAND` run directly when the inherited `TTR_RESOURCES_ADMITTED` or `TTR_RESOURCE_OWNER` marker is present. When the global install is absent, `check:changed` warns and runs sequentially with its existing worker limits. The operational wrappers still require a global CLI, and an invalid/old installed global fails with `bun add -g tuturuuu` recovery guidance. None falls back to a workspace binary. Refresh declared workspace bin links after adopting the source wrapper. `bun install` alone can leave orphan aliases unchanged; use the explicit orphan inspection/removal procedure below. This does not rebuild dist. The shipped bin works in installed packages; workspace aliases refuse to execute dist, including from `bunx`.

An operator with installation authority must identify and drain the offending jobs, preserve the existing resource configuration, then restore canonical launchers through the trusted global CLI with the **same existing roots and shell settings**:

```sh
~/.bun/bin/ttr resources setup --root <existing-root-1> --root <existing-root-2> --shell <existing-shell>
~/.bun/bin/ttr resources status --json
```

Fence-enabled CLI versions refuse a different installation by default. For managed protocol-3 launchers, inspect `setup --force --dry-run` before an intentional cross-install restore, then use `setup --force` with the same roots after the queue drains. Foreign legacy launchers require the operator-controlled recovery in the budget rollout section; force does not bypass that preflight. The plan reports each old/new launcher. Force never overwrites unmanaged files. Version changes within one Bun global installation are allowed; versioned cache paths normalise to its stable global link. Run/shim never write launchers. Review status for enabled installation and an empty queue before resuming work. Source changes do not repair already-installed links or prove historical writer attribution.

Regression coverage: `scripts/trusted-ttr.test.js`, `scripts/workspace-ttr-bin.test.js`, and `resources-provisioning.test.ts` exercise ancestor lookup, inherited admission, minimum version, stale bins, same-install upgrades, refusal and forced replacement with disposable homes.

#### Orphan workspace aliases

A refusal can also mean stale workspace bin links in an ancestor checkout that still has a legitimate SDK dependency. Inspect that ancestor's package.json and links first. For a declared dependency, run `~/.bun/bin/ttr resources run -- bun install --force` there to regenerate aliases pointing to `bin/ttr.cjs`; retain its legitimate package link. `--no-ttr` does not bypass unsafe ancestor links. The removal procedure below applies only to confirmed undeclared orphan symlinks.

If the root manifest has no `tuturuuu` dependency, old symlinks can remain: `node_modules/tuturuuu -> ../packages/sdk` and `node_modules/.bin/{ttr,tuturuuu,tutur3u} -> ../tuturuuu/dist/cli/index.js`. Bun may report no changes and keep them. The trusted repo wrapper and `check:changed` refuse such ancestor aliases, even inside an admitted lane; they never execute or remove them silently. A healthy global CLI does not make those bare aliases safe.

From the affected ancestor checkout, inspect the manifest and every link first. Only after confirming these are the orphan symlinks above, remove those links explicitly and reinstall under admission:

```sh
ls -l node_modules/tuturuuu node_modules/.bin/ttr node_modules/.bin/tuturuuu node_modules/.bin/tutur3u
# Confirm the root has no tuturuuu dependency and each path is a symlink.
for alias in ttr tuturuuu tutur3u; do
  file="node_modules/.bin/$alias"
  if [ -L "$file" ] && [ "$(readlink "$file")" = '../tuturuuu/dist/cli/index.js' ]; then
    rm -- "$file"
  fi
done
if [ -L node_modules/tuturuuu ] && [ "$(readlink node_modules/tuturuuu)" = '../packages/sdk' ]; then
  rm -- node_modules/tuturuuu
fi
~/.bun/bin/ttr resources run -- bun install
```

Do not remove `packages/sdk` or its dist. A declared dependency can recreate aliases pointing to the new `bin/ttr.cjs` wrapper; an undeclared orphan can remain absent. Inspect the resulting links before resuming. Native temp-directory and symlinked-home tests use physical paths, so macOS `/var/folders` aliases do not change installation identity. Resolve HOME and the Bun install base independently: a symlinked `.bun` or `.bun/install` is supported, while entries outside that resolved install base are still refused.
