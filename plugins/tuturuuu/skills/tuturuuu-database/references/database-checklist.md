# Database Checklist

Use this checklist for Supabase, RLS, API route, and database type changes.

## Migration Design

- Prefer additive migrations.
- Keep PR migration filenames ahead of latest `main` migrations after rebases.
- Every definer replacement must retain a privilege-checked search path with
  `pg_temp` explicitly last; use `pg_catalog, pg_temp` for qualified bodies.
  Run `security-definer-search-paths.sql` on the full chain: even trigger-only
  functions with revoked client EXECUTE can regress after earlier hardening.
- Avoid seed-dependent backfills unless they tolerate missing reference rows.
- Materialize replacement parent rows before rewiring child tables.
- Update trigger helpers and underlying `CHECK` constraints together when tightening limits.
- Audit reset/bootstrap scripts when strict limits change.
- Nova session inserts must check overlapping active sessions after acquiring the
  challenge lock, alongside attempt counts. Keep the expiry boundary exclusive,
  retain expired attempt history, and use explicit UTC dates for daily limits.
  Verify with `supabase/tests/private-schema-nova-session-limits.sql` through
  `sb:validate:isolated`; the HTTP conflict path is covered in Nova session tests.

## Runtime Access

- Normalize workspace aliases consistently across related routes.
- Verify workspace membership with request-scoped clients before admin-backed child lookups.
- Keep protected follow-up validation and writes on the same authorized path after membership is proven.
- Request returning rows for workspace-scoped updates/deletes and skip side effects when no row matched.
- Use recursive storage API traversal for Supabase folder deletes instead of direct `storage.objects` scans.

## Type Follow-Through

- Apply local migrations before typegen.
- Run `bun sb:typegen` after schema changes.
- Prefer shared aliases from `packages/types/src/db.ts`.
- Keep package exports in sync when adding `packages/types/src/primitives` modules.

## Verification

- Run local migration checks or focused pgTAP tests where available.
- Verify role contracts against the full migration chain, including existing
  grants. Assert intended permission denials with SQLSTATE `42501` and exercise
  supported RPCs as their caller roles; reduced schemas cannot prove this boundary.
- Auth hooks need both schema `USAGE` and function `EXECUTE` for
  `supabase_auth_admin`. Assert schema access separately from function privileges
  and call the hook after switching roles; an `EXECUTE` catalog check alone can
  pass while schema lookup fails. Capture the result with psql's `\gset` and
  reset the role before pgTAP assertions, rather than granting Auth access to
  the test extension.
- Clear transaction-local JWT claims before privileged signup fixture inserts.
  `RESET ROLE` preserves `request.jwt.claims`, which signup/workspace triggers read.
- Run focused API/helper tests for affected code.
- Run `bun check:changed` for TypeScript changes; `bun validate` runs in CI only.

### Isolated lifecycle recovery

Metadata transitions replace the previous regular record atomically at mode `0600`.
Keep `O_EXCL` on temporary creation; use destination exclusivity only for actual
create-only callers. Inject interrupted writes at the file descriptor in tests,
and verify partial bytes, the last complete record and identical retry behavior.
Run the retained proposal metadata suite explicitly from the repo root using the
[local recovery command](../../../../../apps/docs/build/development-tools/local-supabase-development.mdx#validating-an-exact-worktree-in-isolation).
It is outside active CI and root script discovery; database scripts globs do not cover it.

### Full pgTAP baseline

Reset the isolated database before each full run: independent-session concurrency
fixtures commit data. Scope counts to fixture IDs. On non-superuser local images,
configure `test.dblink_connstr` after reset with a password-authenticated connection
to the same disposable database; loopback trust fails dblink authentication.
See the local Supabase development runbook. Preserve security negatives, distinguish
restrictive MFA policies from access-granting policies, and seed provider identities
for verified staff. Report runtime/schema regressions instead of weakening assertions.
