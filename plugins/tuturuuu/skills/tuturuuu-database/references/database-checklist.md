# Database Checklist

Use this checklist for Supabase, RLS, API route, and database type changes.

## Migration Design

- Prefer additive migrations.
- Keep PR migration filenames ahead of latest `main` migrations after rebases.
- Avoid seed-dependent backfills unless they tolerate missing reference rows.
- Materialize replacement parent rows before rewiring child tables.
- Update trigger helpers and underlying `CHECK` constraints together when tightening limits.
- Audit reset/bootstrap scripts when strict limits change.

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
- Clear transaction-local JWT claims before privileged signup fixture inserts.
  `RESET ROLE` preserves `request.jwt.claims`, which signup/workspace triggers read.
- Run focused API/helper tests for affected code.
- Run `bun validate` for TypeScript changes.
