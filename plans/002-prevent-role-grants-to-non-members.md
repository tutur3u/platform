# Plan 002: Prevent Role Grants to Non-Members

> **Executor instructions:** This plan defines the eligibility policy; do not
> reopen it during implementation. Prepare and test migrations locally only.
> Never run `bun sb:push` or `bun sb:linkpush`. Stop on drift or evidence of
> invalid production rows; cleanup requires separate operator approval.

## Status

- **Execution status:** BLOCKED — shared role migration artifacts remain owned
  by `tmp/agent-coordination/20260707-141449-codex-g22-time-roles-templates.md`
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** Security / Authorization / Database
- **Depends on:** operator decision only if the read-only orphan count is nonzero
- **Planned at:** `68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b`, 2026-08-10

Do not start while that note is `working`; this plan must update the same role
override and generated manifest. Reconcile the lane first rather than editing
around it.

## Invariant and evidence

A role recipient is eligible only when the same user has an active
`workspace_members` row for the role's workspace with
`member_type = 'MEMBER'`. Guests and pending invitations are ineligible.
`apps/docs/platform/architecture/authorization.mdx` documents that role-derived
permissions are loaded only for members; guests receive default permissions.

The current main writer checks the role workspace and then inserts caller-owned
global IDs directly into `workspace_role_members`:

```ts
await supabase.from('workspace_role_members').insert(
  memberIds.map((userId) => ({ role_id: roleId, user_id: userId }))
);
```

in
`apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/roles/[roleId]/members/route.ts`.
`apps/web/src/lib/external-projects/team-access.ts` repeats the write.
`has_workspace_permission` joins role membership to permissions without also
requiring an eligible `workspace_members` row. External-project member selection
uses the same normalized workspace-member source, so it follows the same
MEMBER-only rule.

## Allowed files

- The main role-members route, moved with `git mv` from
  `apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/roles/[roleId]/members/route.ts`
  to
  `apps/web/src/app/api/v1/workspaces/[wsId]/roles/[roleId]/members/route.ts`,
  plus `route.test.ts` at the destination.
- `apps/web/src/lib/external-projects/team-access.ts` and its existing test.
- One new migration under `apps/database/supabase/migrations/` and new
  `apps/database/supabase/tests/workspace-role-membership-invariant.sql`.
- `packages/types/src/supabase.ts`, the matching role-route entry in
  `apps/tanstack-web/migration/route-overrides.json`, generated
  `route-manifest.json`, and
  `apps/docs/platform/architecture/authorization.mdx`.
- Do not edit Rust GET behavior; POST is still live in Next.

## Preflight and drift gate

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`; read `apps/database/AGENTS.md`. Run:

```bash
git status --short
git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- \
  'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/roles/[roleId]/members' \
  apps/web/src/lib/external-projects/team-access.ts \
  apps/database/supabase/migrations apps/backend/src/workspaces_roles_roleid_members.rs
```

Expected: no change to membership eligibility, role writes, permission
evaluation, or POST ownership. Any semantic drift is a STOP. Use synthetic UUIDs
and never print production identities.

## Implementation steps

1. **Inventory the exact mutation surface.** Run
   `rg -n "workspace_role_members.*insert|from\('workspace_role_members'\)" apps packages`.
   Classify every writer as main route, external-project helper, migration/test,
   or unsupported legacy tooling. Add any supported runtime writer to this plan
   before editing.

   Verify: a checked-in test fixture or PR evidence lists every supported writer;
   the main route and external helper are both present. An unclassified runtime
   writer is a STOP.

2. **Add a safe orphan diagnostic.** In the migration's verification comments
   or focused pgTAP setup, define a read-only aggregate query counting role rows
   whose role workspace lacks the same user's MEMBER row. It must return only a
   count, never user/role IDs. Do not delete or quarantine rows.

   Verify locally: the diagnostic returns zero on a clean fixture and one after
   inserting a synthetic invalid row. If a production operator later reports a
   nonzero count, stop for a separate cleanup plan.

3. **Create one transactional database boundary.** Add a security-definer RPC
   that accepts workspace ID, role ID, and a bounded array of user IDs; sets a
   fixed `search_path`; proves the role belongs to the workspace; proves every
   recipient has `workspace_members.member_type = 'MEMBER'`; and inserts
   idempotently only when the whole input is valid. Revoke public execution and
   grant only the runtime roles already used by adjacent protected-table RPCs.

   Verify with pgTAP: same-workspace MEMBER succeeds; guest, pending invite,
   global non-member, other-workspace member, and foreign role fail without any
   partial insert; duplicates are idempotent. Expected suite exit 0.

4. **Harden permission evaluation.** Amend `has_workspace_permission` so the
   role-derived branch requires the same MEMBER join. Preserve the documented
   creator exception and guest default-permission behavior.

   Verify with pgTAP: a synthetic orphan role row grants no permission, MEMBER
   role permission succeeds, guest role permission does not, and creator/default
   cases remain unchanged. Inspect `EXPLAIN` locally and add an index only if the
   join lacks support.

5. **Route both writers through the RPC.** Move the substantially reworked main
   handler to first-class `apps/web/src/app/api/**`; validate a nonempty,
   duplicate-normalized, maximum-100 UUID array before the RPC. Make the external
   helper call the same boundary. Preserve existing non-enumerating errors.

   Verify: route/helper tests cover valid MEMBER arrays, guest/non-member/foreign
   role denial, malformed and 101-item arrays, duplicates, and all-or-nothing
   behavior; focused Vitest exits 0.

6. **Refresh artifacts and document rollout.** Run `bun sb:up` against local
   Supabase, `bun sb:typegen`, `bun web:api-routes:check`, and
   `bun migration:tanstack:manifest`. Update the authorization doc with the
   MEMBER-only invariant and the aggregate orphan pre-deploy gate.

   Expected: all commands exit 0; generated diffs are limited to affected DB
   types and the one moved route. Never apply production SQL.

7. **Run final gates.** Run focused pgTAP and Vitest suites, then `bun check`,
   `bun --cwd apps/web run build`, and `git diff --check`; expect both Bun
   commands to exit 0 and no whitespace output.

## Done criteria

- [ ] Every supported role writer uses the atomic MEMBER-only boundary.
- [ ] Guest, invite, global non-member, and cross-workspace IDs cannot receive or
  exercise role-derived permissions.
- [ ] Existing invalid rows are measured without identities and never
  automatically deleted.
- [ ] Local migration, pgTAP, route/helper tests, manifests, `bun check`, and
  the Web build and `git diff --check` pass.

## STOP conditions

Stop if a supported writer is outside the allowed list, current docs/code show
guests intentionally receive role-derived permissions, POST has moved to Rust,
the aggregate orphan count is nonzero in an operator-run environment, rollout
would require destructive cleanup, or the invariant cannot be deployed
compatibly. Amend this plan before proceeding.
