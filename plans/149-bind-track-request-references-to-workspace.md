# Plan 149: Bind Track Request References to One Workspace

> **Executor instructions:** Prevent time-tracking requests and breaks from
> retaining foreign-workspace task, category, session, or break-type references,
> and make approval/rejection revalidate the linked session before mutation.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/requests/route.ts' 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/breaks/route.ts' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Blocked by:** database migration/generated-type ownership transfer and
  coordination with Plans 038 and 083 on the shared time-tracking state machine
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** security / correctness
- **Depends on:** active database/type owners releasing or transferring the
  required uniquely named migration and generated type path
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The Track request route inserts caller-selected foreign keys through a service-
role client after checking only the route workspace. A user in workspaces A and
B can therefore create an A request linked to a B session; approval or rejection
later trusts that stored id and can update or delete the B session. Break
creation has the same missing boundary for `break_type_id`, and joined reads can
surface foreign metadata.

## Current state

- The request POST accepts `taskId`, `categoryId`, `breakTypeId`, and
  `linkedSessionId` and inserts them through the admin client without proving
  co-tenancy or linked-session ownership.
- The approval/status SQL trusts `linked_session_id`; its security-definer
  trigger updates or deletes that session by id alone.
- The break POST validates its session but accepts an arbitrary break type; its
  GET joins and returns the referenced break-type row.
- Independent single-column foreign keys preserve existence, not same-workspace
  ownership.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root plus Track/database `AGENTS.md`. Create an exact-
base isolated worktree and run `bun setup` immediately. Recheck active notes and
the retained Plan 038/083 worktrees; STOP unless the migration and generated
type paths are explicitly available.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Request route | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/requests/route.test.ts'` | reference matrix passes |
| Break route | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/breaks/route.test.ts'` | break-type containment passes |
| Focused DB | `bun --cwd apps/database scripts/run-supabase.js test db supabase/tests/time-tracking-reference-containment.sql` | every foreign-parent and approval case passes |
| Full DB | `bun --cwd apps/database scripts/run-supabase.js test db` | all pgTAP suites pass; any unrelated baseline failure is reported and still blocks commit |
| Apply | `bun sb:up` | unique migration applies locally |
| Typegen | `bun sb:typegen` | only expected generated type changes |
| Track typecheck | `bun run --cwd apps/track type-check` | exit 0 |
| Track build | `bun run --cwd apps/track build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** request and break collection handlers plus focused tests; the
existing request approval/status function and linked-session trigger; one
uniquely named additive migration; focused pgTAP; generated database types only
when schema signatures change.

**Out of scope:** pause/resume replacement semantics from Plans 038/083,
timesheet UI, unrelated Track routes, historical record deletion, production
migration application, Web/Rust/TanStack route work.

## Git workflow

Use `fix/track-reference-containment` and commit
`fix(track): bind time references to workspace`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

### Step 1: Audit existing mismatches before mutation

Add a read-only query/test fixture that classifies request rows whose task,
category, break type, or linked session belongs to another workspace, plus
break rows whose break type differs from the session workspace. The migration
must fail closed with counts and no sensitive values when any mismatch exists;
do not silently rewrite or delete historical rows.

**Verify:** clean fixtures report zero; one fixture per foreign parent aborts
the migration before DDL or data mutation.

### Step 2: Bind request creation at route and database boundaries

Normalize the route workspace once. Before inserting, validate every supplied
optional reference through its canonical parent: task through list/board,
category and break type through their workspace columns, and linked session
through both workspace and actor ownership. Return 404 for an inaccessible
foreign id without disclosing its tenant. Preserve nullable references and the
current successful envelope.

Enforce the same contract for non-route writers with a transaction-safe database
function/trigger. Do not rely only on application pre-reads. If a private RPC is
introduced, make it service-role-only, accept the server-resolved actor id, set
a fixed search path, and revoke public/anon/authenticated execution.

**Verify:** cookie and Track app-session route tests reject each foreign parent
before insert while authorized same-workspace combinations still succeed.

### Step 3: Revalidate linked sessions during approval and rejection

Inside the transaction that changes request status, lock the request and linked
session and require identical workspace and actor ownership before any session
update/delete. Make the trigger fail closed if legacy or concurrently changed
data violates the invariant. Preserve existing approved/rejected state rules
and duration calculations.

**Verify:** pgTAP proves approving or rejecting a workspace-A request can never
update/delete a workspace-B session, including a concurrent parent change.

### Step 4: Bind break types to their sessions

Keep the existing session authorization, then require `break_type_id` to belong
to the session workspace before the admin insert. Add a database invariant for
all writers and make reads refuse rather than join foreign break-type metadata.

**Verify:** same-workspace break creation/read succeeds; foreign break types are
rejected and no row is written or exposed.

### Step 5: Run mandatory gates

Apply the migration locally, regenerate types only if required, run focused and
full database tests, both route suites, Track typecheck/build, `bun check`, and
the whitespace gate. Keep unrelated local database failures separate; no commit
is allowed while a mandatory gate is unsatisfied.

## Done criteria

- [ ] Every request foreign key is tenant-bound; linked sessions are also actor-bound.
- [ ] Approval/rejection cannot mutate a session outside the request workspace/user.
- [ ] Break types must share the authorized session workspace.
- [ ] Existing mismatches abort rollout rather than being silently rewritten.
- [ ] Cookie/app-session and direct database denial cases are covered.
- [ ] Migration, typegen, focused/full tests, build, and repository gates pass.

## STOP conditions

Stop on active ownership, any nonzero production/preflight mismatch without an
approved remediation, inability to lock/revalidate the approval transition,
schema drift, destructive shared-database repair, or the same mandatory gate
failing twice.
