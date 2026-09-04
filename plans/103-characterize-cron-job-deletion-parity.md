# Plan 103: Characterize Web and Rust Cron-Job Deletion

> **Executor instructions:** Add executable parity coverage only. Do not change
> deletion behavior, move the legacy Web handler, or claim that Rust serves
> production traffic.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/cron/jobs/[jobId]' apps/backend/src/workspaces_wsid_cron_jobs_jobid.rs apps/backend/src/workspaces_wsid_cron_jobs_jobid`
> Stop on cron deletion, RLS forwarding, response, or handler-test drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** test coverage
- **Depends on:** cron/frontend status handoff ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The future Rust handler already owns DELETE for a live Web route, but Web has no
colocated test and Rust tests only path extraction. Migration readiness can
therefore drift on auth forwarding, workspace predicates, status codes, cache
headers, or fallthrough while both suites remain green.

## Current state

- The live DELETE in the legacy Web handler scopes by both job and workspace,
  relies on the user client/RLS, returns 200 `{ message: 'success' }`, and maps
  database errors to 500.
- `workspaces_wsid_cron_jobs_jobid.rs:46-58,124-179` ports DELETE and forwards
  the caller bearer token with the project API key.
- Its tests at `:219-283` cover only path matching, not outbound requests or
  responses.
- The Rust handler file is 283 lines today; behavioral fixtures should live in
  a sibling test module to keep future growth bounded.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`; read
`apps/backend/AGENTS.md`. Remain blocked while
`20260630-234545-claude-cron-and-frontend-status.md` retains its canonical
handoff over this exact DELETE follow-up. This characterization plan does not
edit route metadata, production handlers, or database schema.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web route test | `bun run --cwd apps/web test -- 'src/legacy-api-routes/v1/workspaces/[wsId]/cron/jobs/[jobId]/route.test.ts'` | DELETE contract passes |
| Rust focused test | `cd apps/backend && cargo test --locked workspaces_wsid_cron_jobs_jobid -- --nocapture` | outbound and response parity passes |
| Rust library suite | `cd apps/backend && cargo test --locked --lib` | no shared-dispatch regression |
| Backend gate | `bun check:backend` | native and Worker targets plus route coverage pass |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- create the colocated legacy Web route test
- move existing Rust unit tests into
  `apps/backend/src/workspaces_wsid_cron_jobs_jobid/tests.rs` and add behavioral
  coverage; only add `mod tests;` to the handler
- `plans/README.md` only for status

No production route, response, auth helper, dispatcher, OpenAPI, migration
manifest, package manifest, or database file may change.

## Git workflow

Use branch `chore/cover-cron-job-deletion` in an isolated worktree and run
`bun setup`. Commit `test(cron): characterize job deletion parity`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize the live Web route

Mock the user-scoped Supabase chain separately from route parameters. Cover
successful deletion, database error, job/workspace predicates, and that no
request body is required. Assert the exact 200 and 500 envelopes.

### Step 2: Characterize Rust request construction

Using the existing outbound recording fixture, prove DELETE sends one
PostgREST DELETE with exact `id=eq.<job>` and `ws_id=eq.<workspace>` filters,
forwards the caller bearer token, supplies the project API key, and never logs
or returns either credential.

### Step 3: Freeze dispatch and response parity

Cover missing bearer, outbound transport error, non-2xx provider response, and
2xx success. Preserve and assert Rust's existing `private, no-store` response
header without claiming that the handler-level Next response object supplies an
identical explicit header; document this known difference in test names or
comments instead of treating it as parity. Prove GET remains handled and
PUT/unknown methods return `None` for live Web fallthrough.

### Step 4: Run focused and shared gates

Run both focused suites, the full Rust library suite, Web typecheck, `bun check`,
and whitespace validation. Do not regenerate route artifacts for test-only work.

## Done criteria

- [ ] Web DELETE success/error and exact tenant predicates are executable tests.
- [ ] Rust DELETE outbound auth, filters, status, and envelope match Web, and its existing no-store header is preserved.
- [ ] PUT and unknown methods still fall through rather than returning 405.
- [ ] No production behavior, route logic, or migration artifact changes; the handler edit is only `mod tests;`.
- [ ] Focused tests, Rust library/backend suites, typecheck, repository gate, and whitespace pass.

## STOP conditions

Stop until the exact handoff transfers ownership. After transfer, revise into
an implementation plan if characterization exposes a behavior mismatch beyond
the already documented explicit-header difference, if tests require production
changes, or if a required gate fails twice.

## Maintenance notes

A migration-ready handler needs contract tests, not only a path parser. Keep
the live Next route authoritative until an approved cutover.
