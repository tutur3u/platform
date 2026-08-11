# Plan 170: Restrict Finance Creator RPCs to Trusted Server Callers

> **Executor instructions:** Remove direct authenticated access to both finance
> creator RPCs without changing their signatures. Run every gate and stop rather
> than inventing a new client-facing creator-directory contract.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/users-core/src/routes/users/database.ts tmp/agent-coordination`
> The users-core file and generated types are read-only evidence. Stop on a later
> redefinition, a runtime caller, or database ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / tenant privacy
- **Depends on:** Plan 154; Finance/Inventory database ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Two public `SECURITY DEFINER` functions accept any workspace UUID, skip actor
authorization, and return creator email addresses. Direct execution is granted
to every authenticated database client, so an unrelated account can enumerate
private identities from another tenant. No in-repository runtime caller exists;
the safest current contract is service-role-only until a governed API needs a
minimized projection.

## Current state

- `apps/database/supabase/migrations/20260110000000_add_get_creators_rpcs.sql:2-29`
  defines `get_transaction_creators(uuid)` with no `auth.uid()` or permission
  check, returns `id`, `full_name`, `email`, and `avatar_url`, and grants it to
  `authenticated`.
- The same file at lines 32-58 repeats the contract for
  `get_invoice_creators(uuid)`.
- Repository-wide search finds only those definitions and generated types; no
  maintained application, SDK, or internal-api caller uses either RPC.
- `packages/users-core/src/routes/users/database.ts:413-421` removes email and
  other private fields unless the actor has `view_users_private_info`, proving
  email is not a membership-free projection.
- PostgreSQL functions are executable by `PUBLIC` unless explicitly revoked;
  granting `authenticated` does not itself remove broader default privileges.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'get_(transaction|invoice)_creators' apps packages --glob '!packages/types/src/supabase.ts'` | no runtime caller; only migration/test references after the change |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/finance-creator-rpc-privileges.sql` | focused pgTAP passes on a disposable stack |
| Full database | `bun --cwd apps/database sb:validate:isolated` | full pgTAP exits 0 on the Plan 154 baseline |
| Generated types | `git diff --exit-code -- packages/types/src/supabase.ts` | no diff; signatures did not change |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Suggested executor toolkit

Load `$tuturuuu-database`, `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-commit`, and the `supabase` skill before editing. Read the root
`AGENTS.md` database workflow and the current private-user projection tests.

## Scope

**In scope:** one additive migration created with `bun sb:new`; new
`apps/database/supabase/tests/finance-creator-rpc-privileges.sql`; README status.

**Read-only evidence:** the original migration, generated Supabase types,
users-core private-field projection, coordination notes.

**Out of scope:** changing either function signature/result columns; adding a
new HTTP/internal-api caller or UI; finance aggregation behavior; manual edits to
generated types; production migration apply.

## Git workflow

Use `fix/restrict-finance-creator-rpcs` in an isolated worktree and run
`bun setup`. Commit `fix(finance): restrict creator RPC access`. Claim/release
the commit window; do not push unless instructed.

## Steps

### Step 1: Reconfirm there is no supported repository caller

Search application, package, SDK, docs, and tests for both function names.
Inspect active Finance/Inventory notes and obtain exact migration/test ownership
transfer. If a supported direct authenticated consumer exists, STOP: its actor,
permission, and minimized response contract require a separate design.

**Verify:** the caller-inventory command has no runtime match and the ownership
transfer is recorded in the executor's coordination note.

### Step 2: Revoke broad execution in one additive migration

Create a migration that applies all of the following to both exact signatures:

- `REVOKE ALL ... FROM PUBLIC, anon, authenticated`;
- `GRANT EXECUTE ... TO service_role` only;
- preserve the signatures, volatility, returned columns, and function bodies;
- add comments stating that callers must use a separately authorized server
  boundary before exposing creator identities.

Do not redefine the functions unless privilege changes alone cannot express the
contract.

**Verify:** apply the migration in the focused disposable validator; it reaches
the pgTAP file rather than failing during migration apply.

### Step 3: Prove role and cross-tenant denial

Add pgTAP fixtures for two workspaces with distinct creator rows. Assert:

- `PUBLIC`, `anon`, and `authenticated` lack execute privilege for both RPCs;
- a direct authenticated invocation fails before returning any row;
- `service_role` retains execute privilege and the existing workspace filter;
- neither signature nor result-column contract changed.

Do not include real identity values in fixtures or output.

**Verify:** focused database command passes, then the full isolated suite passes.

### Step 4: Run final gates

Run the generated-type no-diff check, `bun check`, and whitespace check. Confirm
only the unique migration, focused pgTAP file, and reviewer-owned index row
changed.

## Done criteria

- [ ] Neither RPC is executable by `PUBLIC`, `anon`, or `authenticated`.
- [ ] Service-role behavior and both existing signatures are preserved.
- [ ] Cross-workspace fixtures prove no authenticated identity data is returned.
- [ ] Focused and full isolated database suites pass.
- [ ] Generated types are unchanged and all repository gates pass.

## STOP conditions

Stop if Plan 154 is not DONE/available in the execution base, either function
was later redefined, a supported direct client is found, privilege changes would
break a confirmed caller, an active owner has not transferred the migration/test
paths, or a mandatory gate fails twice.

## Maintenance notes

If creator filtering returns later, expose it through an actor-bound Finance
API and return the minimum fields its UI needs. Do not restore direct access to
this email-bearing definer function.
