# Database And API Patterns

Load this reference for Supabase, protected-table, storage, migration, or
workspace-scoped API work.

## Schema And Typegen

- Prepare migrations; do not push production Supabase changes from Codex.
- Prefer additive migrations and runtime fallbacks when rollout order can vary.
- Apply local migrations before `bun sb:typegen` when possible. Typegen reads
  the live local schema, not unapplied SQL.
- Never hand-edit generated type files. Prefer shared DB row aliases from
  `@tuturuuu/types/db`.
- If a migration adds or changes PostgREST-exposed RPC signatures, drop legacy
  overloads that would make named arguments ambiguous.
- Public `SECURITY DEFINER` RPCs must enforce `auth.uid()` and workspace/RBAC
  checks internally, then revoke broad execution and grant only required roles.
- Views over RLS-protected tables need `security_invoker` before broad grants.

## Workspace-Scoped Writes

- Authenticate before normalizing workspace aliases when possible.
- If one route in a flow accepts workspace aliases, normalize consistently in
  every companion route.
- Verify workspace membership with the request-scoped client before
  admin-backed child-resource lookups.
- After membership is proven, keep validation reads, inserts, and relation-table
  writes on the same authorized admin path when protected tables require it.
- For workspace-scoped `UPDATE` or `DELETE`, request returning rows and stop
  side effects when no row matched.
- Membership lookup errors are `500`; successful lookups with no membership are
  `403`.

## Storage

- Authenticated storage API routes should authorize with the user-scoped client,
  then perform storage operations through an admin-backed storage client.
- Supabase signed upload URLs for protected buckets often need admin-backed
  storage clients because `createSignedUploadUrl` writes storage metadata.
- Do not request signed read URLs before the client uploads the object.
- Storage key builders must sanitize parent paths and terminal names.
- Folder deletes should recurse through the Storage API; do not depend on
  direct `storage.objects` SQL scans.
- Mixed Supabase/R2 upload helpers must preserve Authorization headers when
  the server issued a bearer token and relax only headers that break presigned
  PUTs.

## Validation

- Use concrete table insert/update types for typed Supabase payloads instead of
  `Record<string, unknown>`.
- Narrow split-key or grouped identifiers before `.in(...)` calls and `Map`
  reads.
- For JSON columns, transform parsed Zod payloads into the repo `Json` shape so
  typed Supabase builders accept them.
