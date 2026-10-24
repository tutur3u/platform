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

Node runtime option values must be consumed before classifying the first program. Unknown or incomplete options admit conservatively; never scan an ordinary program's arguments for another tool. `resources-node-options.test.ts` covers diagnostic directories, profiling/report options, worker caps and Node separators.

Treat `--experimental-specifier-resolution` as an equals-only Node option; its bare form queues as ambiguous. Both Node config-file flags (`--experimental-config-file` and `--experimental-default-config-file`) queue as ambiguous in every form because configuration can enable native tests; inject `--test-concurrency` and preserve a positive lower user limit. If a separate option value itself names a tool, ttr launcher or heavy script, also queue as ambiguous: a future or incorrectly modelled flag must not swallow an executable. `resources-node-options.test.ts` covers both rules; real Node 26.4 probes must verify runtime parsing rather than relying on the option table.

Prepare fixture shims once per home; concurrent run loaders wait for that preparation instead of racing shell-file compare-and-swap. Scope barriers to the child, operation or detached group that can produce the awaited state. Allow one second for final writes after liveness ends and emit scoped stderr before the test deadline. Keep synthetic CPU, memory and load telemetry consistent so host contention does not alter policy inputs. Test idle-warning status composition with one injected CPU snapshot, asserting warning data and rendered text plus a busy-snapshot negative control. A preliminary zero sample cannot stabilise a later ps read; do not resample an injected table. Reuse a fixture home only with the same CPU/memory budget; changed host budgets require a fresh home.

### Launcher mismatch incident recovery

Symptom: the global CLI rejects missing, stale or malformed launchers. A stale workspace SDK dist can write its own entry into shared launchers before admission, and its nested run can block the queue. Never run operational commands through workspace or ancestor `node_modules/.bin/ttr` or stale `packages/sdk/dist`.

Repository admission uses the verified global `~/.bun/bin/ttr` (stable >= 0.28.0). `check:changed` and `node scripts/ttr-run.js -- COMMAND` run directly when the inherited `TTR_RESOURCES_ADMITTED` or `TTR_RESOURCE_OWNER` marker is present. When the global install is absent, `check:changed` warns and runs sequentially with its existing worker limits. The operational wrappers still require a global CLI, and an invalid/old installed global fails with `bun add -g tuturuuu` recovery guidance. None falls back to a workspace binary. Refresh declared workspace bin links after adopting the source wrapper. `bun install` alone can leave orphan aliases unchanged; use the explicit orphan inspection/removal procedure below. This does not rebuild dist. The shipped bin works in installed packages; workspace aliases refuse to execute dist, including from `bunx`.

An operator with installation authority must identify and drain the offending jobs, preserve the existing resource configuration, then restore canonical launchers through the trusted global CLI with the **same existing roots and shell settings**:

```sh
~/.bun/bin/ttr resources setup --root <existing-root-1> --root <existing-root-2> --shell <existing-shell>
~/.bun/bin/ttr resources status --json
```

Fence-enabled CLI versions refuse a different installation by default. Inspect `setup --force --dry-run` before an intentional cross-install restore, then use `setup --force` with the same roots after the queue drains. The plan reports each old/new launcher. Force never overwrites unmanaged files. Version changes within one Bun global installation are allowed; versioned cache paths normalise to its stable global link. Run/shim never write launchers. Review status for enabled installation and an empty queue before resuming work. Source changes do not repair already-installed links or prove historical writer attribution.

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
