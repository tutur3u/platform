# Plan 058: Make Note-to-Task Conversion Lossless and Atomic

> **Executor instructions:** Convert one note into exactly one task, preserve its
> description, and archive the note in the same transaction.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/notes/[noteId]/convert-to-task/route.ts' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/utils/src/task-description-content.ts packages/utils/src/yjs-task-description.ts`
> Stop if note conversion or task-description persistence changed.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** Correctness / Data integrity
- **Depends on:** generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while active Mail and Zalo lanes retain generated database
type ownership. The conversion RPC and its generated signature cannot land
without exclusive typegen ownership.

## Why this matters

The route drops every extracted note description of 255 characters or fewer,
then creates the task and archives the note as separate writes. If archiving
fails it still returns success; retrying can create another task from the same
unarchived note.

## Current state

- `convert-to-task/route.ts:75-89` inserts a task with
  `description: noteDescription.length > 255 ? noteDescription : null`, the
  inverse of preserving ordinary note content.
- Lines 96-108 archive the note after task creation, log update failure, and
  still return a success payload.
- The note lookup correctly scopes `id`, workspace, creator, and unarchived state;
  list-to-board validation also confirms the destination workspace.
- Task descriptions accept normalized text/ProseMirror content and have a Yjs
  state compatibility path; the conversion must not create an invalid or stale
  description representation.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, and `$tuturuuu-agent-coordination`.
Characterize how plain note content should be represented in Tasks before
writing the transaction. Reuse established description normalization rather
than inventing another encoding.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/notes/[noteId]/convert-to-task/route.test.ts'` | content/idempotency cases pass |
| Database apply | `bun sb:reset` | conversion migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | atomic conversion cases pass |
| Database types | `bun sb:typegen` | generated RPC types are current |
| Tasks typecheck | `bun run --cwd apps/tasks type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- The Tasks conversion route and new colocated route test
- One private transactional conversion RPC, additive migration,
  `apps/database/supabase/tests/note-to-task-conversion.sql`, and generated types
- A nullable `notes.converted_task_id` restrictive foreign key plus a partial
  unique index for non-null values, recording a one-note/one-task conversion;
  no unrelated Notes columns or policies
- A narrow existing task-description helper only if required to produce the
  canonical persisted description/Yjs input before calling the RPC

Do not redesign Notes UI, convert-to-project, general task creation, or task
description collaboration.

## Git workflow

- Branch: `fix/atomic-note-to-task-conversion` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(tasks): make note conversion atomic`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Define the persisted description contract

Convert nonempty note content into the same valid task-description form used by
normal task creation, with matching `description_yjs_state` when required.
Empty content may become null; content length must not decide whether it is kept.

### Step 2: Add one server-only conversion transaction

Create a private security-definer operation that locks the note, validates
actor/workspace/unarchived state and destination list/board workspace, inserts
the task once, stores its ID in `notes.converted_task_id`, and archives the note
in the same transaction. Preserve current conversion behavior by omitting
`sort_key` and allowing the table's existing default to apply; do not introduce
a conversion-only ordering lock that other task writers do not share. Return
the committed task identity. Revoke execute from `PUBLIC`, `anon`, and
`authenticated`; the route's service role supplies the verified actor explicitly.

### Step 3: Make retries deterministic

Lock the note row first. If `converted_task_id` is already present, return that
same task ID with the existing HTTP 200 success envelope; an archived note with
no conversion reference remains the existing non-disclosing error. This makes
sequential and concurrent retries idempotent without caller branching. Remove
the route's split insert/update and swallowed archive error.

## Test plan

Cover empty, short, exactly-255, 256+, and structured note content; foreign list;
foreign/other-user note; already archived note; task insert failure; archive
failure rollback; sequential retry; and concurrent retry. Assert no success can
contain an unarchived source note or duplicate task. The named pgTAP file covers
sequential retry, rollback, the persisted reference invariant, and a real
two-connection race using the installed `extensions.dblink` async query helpers
(`dblink_connect`, `dblink_send_query`, and `dblink_get_result`) against the
local test database. Both calls must return the same task ID and leave exactly
one task/reference. Route Vitest covers only response mapping and idempotent
200 replay; it is not the database concurrency gate.

## Done criteria

- [ ] Every nonempty note description is preserved in a valid task representation.
- [ ] Task creation and note archival commit together or not at all.
- [ ] Repeated/concurrent conversion creates at most one task.
- [ ] The RPC is server-only and validates every affected identity.
- [ ] Route/database tests, reset/typegen, typecheck, repository gate, build, and whitespace pass.

## STOP conditions

Stop if normal task creation has no canonical plain-text/Yjs representation,
if omitting `sort_key` no longer preserves the route's current task-placement
behavior, if the local pgTAP environment cannot open two `dblink` connections
without introducing credentials, or if historical converted notes need an
operator-approved backfill.

## Maintenance notes

Keep all future note conversion targets idempotent and transactional. Content
presence—not an arbitrary length threshold—controls description persistence.
