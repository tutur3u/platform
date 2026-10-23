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

Explicit `run` validates and reuses existing executable shims without provisioning. Missing, stale or malformed launchers fail before admission with an explicit setup instruction. Setup is the provisioning boundary; inspect occupancy and obtain installation authority before replacing an installed scheduler. An early lightweight resource dispatch avoids general CLI imports but source review does not prove a host startup repair.

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

Effective lanes are `min(maxValidationLanes, max(base, host lane ceiling))`, with
a host lane ceiling of `min(8, floor(memory GiB / 4), CPUs - 2)`. Worker totals
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
admitted ancestor (filtered env). Stale or copied markers queue normally. Waiters
recheck ancestry about once per second, so they never deadlock behind their own
ancestor. Version/help probes and read-only commands such as `ls` and `git status`
skip the queue. Cancellation releases only its own slot after the
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
runners; selection excludes them.

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
retain argv/env. Invalid config errors name the field and range but omit values. The queue is cooperative scheduling.

Resource fixtures mock host capacity in Vitest parents and disposable Bun loaders/shims. Read subprocess diagnostics after pipes close; use a separate exit barrier for surviving-descendant tests. Pass a custom script as the launcher target, keeping its working directory a directory. Parent Vitest coverage is not evidence of coverage inside Bun subprocesses.
