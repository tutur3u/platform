# Plan 193: Authorize Direct Time-Tracking Analytics Access

> **Executor instructions:** Make direct time-tracking analytics match the
> maintained management/self-service authorization boundaries without breaking
> the prepared root-only export.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/track/src/lib/time-tracking-helper.ts apps/web/src/lib/time-tracking-helper.ts apps/backend/src/time_tracking_export.rs apps/backend/src/time_tracking_export_test.rs apps/backend/api/openapi.yaml tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** security / privacy / database authorization
- **Depends on:** Plans 154 (BLOCKED) and 163 (DONE); Track/database and G22 backend review/transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The grouped-session definer RPC returns every workspace user's titles,
descriptions, timestamps, categories, durations, names, and avatars after only
a membership check. Other analytics RPCs use the same membership or obsolete
permission rules. Direct authenticated Data API callers can therefore bypass
the management pages and routes that restrict cross-user time data.

## Current state

- `20251204172238_update_grouped_session_rpc.sql:10-286` defines and grants
  `get_grouped_sessions_paginated` to `authenticated`; its only guard is
  workspace membership at lines 42-49, while its JSON includes full sessions.
- `20250901120000_time_tracking_daily_hierarchy.sql` defines
  `get_time_tracking_sessions_paginated`, `get_period_summary_stats`, and
  `get_daily_activity_heatmap`; all remain exposed and use membership or old
  ADMIN/OWNER assumptions.
- `20251104180627_update_time_tracking_permissions.sql:5-145` is the latest
  `get_time_tracking_stats`; cross-user access checks
  `manage_workspace_members`, not the canonical
  `manage_time_tracking_requests`, and workspace-wide mode is member-readable.
- `apps/track/src/app/[locale]/(dashboard)/[wsId]/management/page.tsx:40-80`
  restricts the live management view to the root workspace/root users.
- `apps/backend/src/time_tracking_export.rs` exposes a root-only prepared export
  and forwards the caller token to `get_grouped_sessions_paginated`; this
  supported path must remain functional under the corrected permission rule.
- Plan 055 restricted cross-user session/goal HTTP reads but explicitly did not
  change database RPC authorization.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database,
Track, and backend instructions. Inventory every overload and caller. Execute
from the completed Plan 163 base only after Plan 154 is green and G22/database
ownership transfers.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n "get_grouped_sessions_paginated|get_time_tracking_sessions_paginated|get_period_summary_stats|get_daily_activity_heatmap|get_time_tracking_stats" apps packages --glob '!packages/types/src/supabase.ts'` | every live/unused caller and overload is classified |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/time-tracking-analytics-permissions.sql` | self/manager/root/member/foreign/service matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/time-tracking-analytics-permissions.sql` | only intentional removals/signatures change |
| Backend focused | `cargo test --manifest-path apps/backend/Cargo.toml time_tracking_export` | root export still passes with caller-token RPC authorization |
| Backend full | `bun check:backend` | exit 0 |
| Track typecheck | `bun run --cwd apps/track type-check` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** additive replacements/ACLs for the five named analytics function
families and their exact overloads; retire truly unused obsolete functions only
after a zero-caller proof; one pgTAP matrix; minimal Track/Rust caller changes
and generated types required by the final contract.

**Out of scope:** management UI redesign; pagination algorithm changes; session
mutation rules; export response changes; broader auth-engine extraction;
production apply or Rust cutover.

## Git workflow

After transfers, use `fix/authorize-time-tracking-analytics` and commit
`fix(track): authorize time tracking analytics`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Inventory exact function identities, privileges, and callers. Classify each
   output as self-only, workspace-management, root export, or obsolete. **Verify:**
   caller inventory plus `pg_proc` assertions cover every overload; no function
   is silently omitted.
2. Define the contract: self-specific analytics may use `auth.uid()`; any
   other-user or workspace-wide detail requires
   `manage_time_tracking_requests`; root-only export must also satisfy its
   existing root gate. Replace obsolete role-name logic with permission checks.
   **Verify:** ordinary members see only permitted self results and cannot use
   null/foreign user parameters to widen scope.
3. Apply fixed search paths and explicit ACLs. Retire an old function only if
   source, backend, internal API, and generated-client searches prove no
   supported caller; otherwise secure it under the same matrix. **Verify:**
   pgTAP tests direct authenticated calls, foreign workspace ids, managers,
   root export actor, and service role.
4. Run focused/full database, disposable typegen, Rust export, Track, repository,
   and whitespace gates.

## Done criteria

- [ ] Membership alone never exposes workspace-wide session details or totals.
- [ ] Cross-user analytics use `manage_time_tracking_requests`, not role names
      or unrelated member-management permission.
- [ ] The root-only Rust export retains its documented caller-token behavior.
- [ ] Every overload is secured or removed with a proven zero-caller result.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on red Plan 154, ownership, an unclassified caller/overload, conflict
between root export and the canonical permission, legacy consumers needing
member-wide data, unexpected type drift, or any mandatory gate failing twice.
