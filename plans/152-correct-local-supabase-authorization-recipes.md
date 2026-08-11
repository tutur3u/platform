# Plan 152: Correct Local Supabase Authorization Recipes

> **Executor instructions:** Replace schema-invalid RLS/trigger examples with
> current, hardened, executable Tuturuuu patterns and prevent the retired column
> names from returning.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/docs/build/development-tools/local-supabase-development.mdx apps/docs/reference/database/rls-policies.mdx apps/database/scripts/local-supabase-docs.test.js tmp/agent-coordination`

## Status

- **Execution status:** DONE
- **Completed by:** reviewed commit `f2c74af4b2` on
  `docs/fix-local-supabase-recipes`; focused contract 6/6, full `bun check`,
  whitespace, and commit-hook gates passed
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** docs / security
- **Depends on:** none; generated types are read-only evidence
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The primary local-Supabase guide gives copyable policies and triggers using
nonexistent `workspace_members.workspace_id/role`, `workspaces.created_by`, and
resource `workspace_id` columns. Its privileged helper also omits the fixed
search path and grant/caller hardening required by the canonical RLS guide.
Following it produces broken migrations or an unsafe security-definer boundary.

## Current state

- Current generated schema uses `workspace_members.ws_id/type` and
  `workspaces.creator_id`.
- The canonical RLS reference requires `auth.uid()`/service-role handling,
  permission validation, fixed `search_path`, and explicit revokes/grants.
- The local guide's pgTAP command uses the false-green ordering
  `bun --cwd apps/database run ...` instead of the executable form.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-database`, `$supabase`, `$supabase-postgres-best-practices`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/docs
`AGENTS.md` and both database references. Create an exact-base isolated
worktree, run `bun setup`, and treat generated types/migrations as read-only.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused docs | `node --test apps/database/scripts/local-supabase-docs.test.js` | stale phrases absent and hardened clauses present |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the local Supabase guide; one focused database-docs source-contract
test; only the minimal canonical RLS-reference wording needed to remove
contradiction.

**Out of scope:** schema/migrations, generated types, production database
changes, inventing application-specific permissions, restructuring the docs
navigation, Supabase lifecycle isolation from Plan 151.

## Git workflow

Use `docs/fix-local-supabase-recipes` and commit
`docs(database): correct local authorization recipes`. Claim/release the commit
window; do not push.

## Steps

### Step 1: Freeze current schema vocabulary

Add a focused docs contract test that extracts only the fenced SQL under
`Organization-based Access`, `Role-based Access`, and `Database Triggers`.
Reject the exact stale snippets `where workspace_id = table_name.workspace_id`,
`and role = 'admin'`, `insert into public.workspaces (id, name, created_by)`,
`insert into public.workspace_members (workspace_id, user_id, role)`, and
`where created_by = new.id`. Assert the replacement snippets use the resource's
`ws_id`, `workspace_members.ws_id`, current membership `type`, and
`workspaces.creator_id`. Do not reject generic resource `workspace_id` text in
unrelated explanatory sections, and do not parse or edit generated types.

**Verify:** the focused test fails on the current stale guide only.

### Step 2: Replace role folklore with canonical permission checks

Rewrite the policy examples around current `ws_id` columns and the maintained
workspace permission helper/pattern. Keep SELECT and mutation examples explicit
about `USING` versus `WITH CHECK`, wrap stable auth calls as documented, and
avoid presenting a lowercase `'admin'` role that does not match current member
types. Cross-link the canonical RLS reference for application-specific choices.

**Verify:** the examples' table/column names match current generated schema and
the focused test finds no retired names.

### Step 3: Harden the security-definer recipe

Either remove the unnecessary custom helper in favor of the canonical helper,
or show a complete safe function: caller derived from `auth.uid()`, explicit
service-role behavior, fixed `search_path`, internal workspace authorization,
revokes from public/anon, narrow authenticated grant only when safe, and pgTAP
grant/denial coverage. Keep the local and canonical guides consistent.

**Verify:** focused assertions require `set search_path`, caller checks,
`revoke`, and pgTAP guidance in the recipe section.

### Step 4: Correct the trigger and command examples

Use `creator_id`, `ws_id`, and the current membership `type` values in the
personal-workspace trigger. Avoid nondeterministic re-query by retaining the
created workspace id in the function. Add an explicit fixed search path and
grant posture appropriate for an auth trigger. Correct the pgTAP command to
`bun --cwd apps/database scripts/run-supabase.js test db`.

**Verify:** the focused test checks the exact runnable command and retired
trigger columns are absent.

### Step 5: Run documentation gates

Run the focused test, `bun check`, and whitespace. Confirm no migration,
generated type, navigation, package manifest, or dependency file changed.

## Done criteria

- [ ] Copyable RLS and trigger SQL uses current Tuturuuu columns/types.
- [ ] Privileged-function guidance includes the canonical hardening controls.
- [ ] The pgTAP command is executable and cannot false-green on Bun help output.
- [ ] A focused contract test prevents the retired recipes from returning.
- [ ] Script, docs, repository, and whitespace gates pass.

## STOP conditions

Stop if current schema evidence conflicts, the canonical helper cannot express
the example safely, an exact docs/tooling owner appears, the link-check command
does not exist, or the same mandatory gate fails twice.
