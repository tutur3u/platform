# CI measurement and flake review

Before changing job topology, record the source SHA, workflow path, job name, matrix identity, runner environment and exact command. Compare job creation-to-start and start-to-completion separately. Report whether the start metric uses a job timestamp or a workflow proxy. Track skipped, canceled and unfinished jobs independently, with denominators and timing coverage.

Pair a failed job with a later successful attempt of the same run, source SHA, workflow, job, and observed runner environment. Count failure attempts against all failures and separately against failures with comparable retries. A recovered job may reflect a dependency, runner, or artifact failure. Name a flaky test only when the failed assertion and the test's execution and pass on retry are both evidenced. Keep unconfirmed candidates visible without treating them as verified flakes.

Fix reproducible defects at the source. For a confirmed nondeterministic test, control the implicated clock, state, network, or scheduling dependency without weakening the assertion. Use quarantine only when the owner records the evidence, tracking issue, expiration and restoration check. Keep the test visible and continue running it under the quarantine procedure.

For a shard change, compare the old and new exact test inventories, command exits and coverage outputs. Retain stable required checks and the complete Root script policy gate. Report cold and warm setup time, critical-path wall time, runner-minutes, cancellations and runner pool capacity. A failed install or absent artifact carries its own cause and contributes no test result.

Keep the daily entry short. Record the UTC sampling window, measurement scope and missing data, previous and current queue and execution percentiles, recovered and unconfirmed failures, accepted change and rollback conditions. Link the evidence and exact source. Use the existing CI optimization cadence and record results only when the workflow or measurement changed.

## Daily routine

A scheduled agent runs once a day. It appends the measured sample with
`node scripts/ci/ci-daily-sample.js --append plugins/tuturuuu/skills/tuturuuu-development-tooling/references/ci-learnings.md --note "<lesson>"`,
investigates the slowest jobs, the longest queues and any failed-then-passed
job, lands one verified improvement or flake fix on `main`, and records the
lesson in the note: the cause, the change with its commit, and the rollback
condition. When nothing changed, the note says what was checked. Run
`bun fleet:ci` to validate a change across the fleet before pushing.

## 2026-11-19 | Main timing and retry sample

GitHub Actions listed 16,675 workflows on main from 12 November at 10:00 through 19 November at 10:00 ICT. There were 6,369 canceled and 59 unfinished workflows. The job sample covered 1,525 workflows, including all 37 workflows with retries, and returned 6,359 job records. It recorded 942 canceled jobs, 79 unfinished jobs and 6,393 observed runner-minutes. The runner-minute estimate includes jobs canceled after starting and omits jobs without a terminal execution interval.

| Job | Queue p50/p90 (n) | Execution p50/p90 (n) |
| --- | ---: | ---: |
| CodeQL JavaScript and TypeScript analysis | 65/218 s (31) | 1,375/1,671 s (25) |
| Mobile tests, shard 1 | 139/1,922 s (16) | 1,182/1,374 s (16) |
| Root script tests | 45/257 s (30) | 324/357 s (30) |
| Unit tests, shard 0 | 77/289 s (30) | 86/435 s (30) |
| Test admission check | 105/948 s (32) | 11/15 s (32) |

The CodeQL analysis step took a median of 1,323.5 s across 24 successful jobs. Keep its Security-owned coverage and schedule. The mobile test step took 1,195.5 s across 12 successful jobs, with median setup under one minute. Prioritize timing-weighted mobile test allocation with the mobile owner and Forge. Compare exact suite inventories and execution on matched sources before changing shard topology.

The prior sample's Root median queue and execution were 115 and 306 s. This sample measured 45 and 324 s. The samples overlap and use different recent-run quotas, so a matched-source comparison is still required to attribute any improvement. Six daily probes of one successful hosted unit shard showed three fully warm and three mixed Turbo task totals. Two days had no qualifying sample. Mark cold or warm only with explicit task-cache evidence.

One of 179 failed job attempts recovered, and three attempts had a comparable retry. The recovered attempt failed fetching an npm package during strict Mintlify validation. Matching hosted image versions and exact job logs establish a setup recovery. The sample establishes zero fail-then-pass test assertions and supports no quarantine. Keep the original assertion and attempt identity when investigating a timeout. [Mintlify run](https://github.com/tutur3u/platform/actions/runs/44057985423)

## 2026-11-19 | Daily CI sample

Window 2026-11-18T17:43 to 2026-11-19T17:43 UTC, main branch: 1000 workflow runs (625 success, 136 cancelled, 96 queued, 54 failure, 38 pending, 36 skipped, 15 in_progress). Job timing covers 80 sampled runs; execution uses successful jobs only.

| Slowest workflows (wall) | p50 / p90 (n) |
| --- | ---: |
| mobile | 42.7 min / 64.8 min (3) |
| Teach Cloudflare Source | 42.6 min / 74.9 min (7) |
| Nova Cloudflare Source | 41.3 min / 75.1 min (8) |
| Chat Cloudflare Source | 40.0 min / 75.8 min (8) |
| Forms Cloudflare Source | 38.8 min / 68.7 min (8) |
| Apps Cloudflare Source | 38.4 min / 61.6 min (9) |

| Slowest jobs (execution) | p50 / p90 (n) | queue p90 |
| --- | ---: | ---: |
| mobile / Mobile Tests (1) | 22.4 min / 24.0 min (2) | 2.1 min |
| mobile / Mobile Tests (0) | 21.7 min / 23.9 min (2) | 2.8 min |
| CodeQL Manual Fallback / Analyze (javascript-typescript) | 19.0 min / 20.8 min (3) | 64 s |
| Finance Cloudflare Source / native-production / validate | 4.3 min / 4.3 min (1) | 7.1 min |
| Public schema guard / contract | 3.3 min / 3.3 min (1) | 7.0 min |
| Tutoring teacher hours foundation / contract | 3.2 min / 3.2 min (1) | 7.0 min |

Longest queues (p90): Oxc Check / check-ci / Check CI Config 34.3 min; Coordination Cloudflare / check-ci / Check CI Config 31.1 min; Pay Cloudflare Source / check-ci / Check CI Config 28.8 min; Forms Cloudflare Source / check-ci / Check CI Config 26.7 min.
Failed then passed on a later attempt: none. Treat these as flake candidates until the failed assertion is confirmed.

Baseline before main coalescing (74ca3852f4). Workflow wall time was mostly queue: Cloudflare Source runs took 38-41 min p50 while their jobs executed in 2-7 min, and tiny Check CI Config jobs queued up to 30 min, because 26 workflows gave every main SHA its own group and each push to a shared package queued about five jobs in each of 23 Cloudflare Source workflows. 74ca3852f4 moves Cloudflare Source, docs/SEO, Test and Type Check to one shared main group without cancelling: the active run finishes and only the pending run is replaced. CodeQL (per-tip security baseline) and Oxc (job-level locks) keep per-SHA groups. Rollback condition: a promotion or release gate that needs evidence for an intermediate main SHA. Also fixed: the SDK portable closure test expected 28 sources after task-history joined (7a246d8107), and web Vitest pins apps/web/tsconfig.json (d69934ece9) because Oxc tsconfig discovery walks past tsconfig files that do not include a test and, in a worktree nested in another checkout, reached that checkout's unresolvable package configs. A changed web Vitest config runs the whole web suite in bun check:changed, which needs an owned Redis: wrap it with scripts/fleet-ci/with-redis.sh. Under host load, subprocess and crypto tests with fixed 0.4-7 s budgets time out on fleet Macs (sdk-qualification-phase, qualify-sdk-package, native-integrity-apple, agent-quota positional admission); they passed on hosted runners, so they stay unconfirmed flake candidates.
