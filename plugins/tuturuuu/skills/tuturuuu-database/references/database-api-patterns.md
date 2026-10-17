# Database And API Patterns

Load this reference for Supabase, protected-table, storage, migration, or
workspace-scoped API work.

## Declarative adoption preparation

For declarative readiness, baseline qualification, diff-engine distinctions, and
imperative exceptions, read `declarative-schema-adoption.md`. Run the read-only
`node apps/database/scripts/declarative-schema-readiness.js --json`; exit 2
means adoption is held. Do not add partial schema trees or change the engine
until complete disposable replay, ledger coverage, no-op diff, and independent
review prove baseline equivalence. Existing migration history stays immutable.

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
- Storage paths that mirror protected domain records must reuse that domain's
  request-scoped authorization model before any admin-backed list, metadata, or
  signed-read operation. Finance transaction attachments, for example, should
  call `get_wallet_transactions_with_permissions` with `p_transaction_ids`
  through the authenticated Supabase client so wallet whitelists, viewing
  windows, and granular income/expense visibility match normal transaction
  reads.
- Direct-to-storage signed uploads still need server-side upload policy. Require
  positive declared sizes before signing, enforce domain caps before issuing the
  URL, and validate the actual stored object during finalize. When a finalized
  object violates the policy, delete it before returning an error so understated
  signed-upload requests cannot retain oversized files.
- For quota-sensitive namespaces where finalize cannot reliably verify the
  stored object, such as user-group/course storage or external-project media
  assets, route multipart bytes through `apps/web` and upload with the measured
  server-side byte length instead of issuing a signed upload URL.

## Validation

- Use concrete table insert/update types for typed Supabase payloads instead of
  `Record<string, unknown>`.
- Narrow split-key or grouped identifiers before `.in(...)` calls and `Map`
  reads.
- For JSON columns, transform parsed Zod payloads into the repo `Json` shape so
  typed Supabase builders accept them.

- Full-schema SQL fixtures must account for trigger-created rows. Workspace
  insertion creates its creator membership through `add_ws_creator`; reuse and
  assert that membership rather than inserting it again in later scenarios.
  Keep an explicit assertion when membership is part of permission admission.

- Feedback schema qualification uses the maintained hosted employee schema
  workflow's default-off `include_feedback` test profile: foundation172 plus
  feedback105, with same-database type generation and owned cleanup. All profiles
  still apply the full tracked migration snapshot; the flag does not gate SQL
  application or activate the feature. Isolate old matrix children from inherited
  feedback dispatch flags while keeping feedback controls explicit. Keep the
  original eligibility BEFORE packet until its full-schema failure is executed;
  selector/parser tests are not SQL qualification. See
  `apps/docs/build/development-tools/employee-schema-qualification.mdx` for the
  exact input combination and staged BEFORE/AFTER boundary.

- Full-schema admission fixtures must assert membership in the target workspace.
  Auth bootstrap can independently create a personal workspace for a synthetic
  user; that membership does not admit them to another workspace.

- Use distinct PL/pgSQL variable names and qualified table columns in trigger
  permit lookups. A name shared by a variable and a column can raise SQLSTATE
  `42702` before the intended admission error. Retain pgTAP assertions for the
  rejected mutation's exact error and unchanged state.

## Bounded Mail admission fixtures

- The Mail PGlite/pgTAP fixture applies actual notification migrations with a
  synthetic schema, preference lookup and `pg_net` transport. Queue its runner
  through `ttr resources`; never report it as full Supabase or provider proof.
- Reconcile legacy receipts without alerts before claiming raw-event/user keys.
  Preserve suppressed decisions, nullable duplicate history and unknown delivery
  outcomes. Configured `mail_domains.verified_at` is not fresh DNS ownership.
- Require authorized full-chain migration/type generation and exact-commit CI
  before promotion; see
  [Mail notification evidence](../../../../../apps/docs/platform/applications/mail-inbound-notifications.mdx).

## Personal journal qualification

Use the existing disposable Linux schema workflow's `include_personal_journal`
profile for the full selected migration snapshot, 172 foundation plus 24 journal
rollback assertions and same-database private RPC type generation. Keep employee
journal/HTTP/RESTORE/address-migration profiles off for this selection. Require the exact-source
receipt, fixture/type digests and positive cleanup; provider, explicit consent and runtime
acceptance remain separate gates. See [schema qualification](../../../../../apps/docs/build/development-tools/employee-schema-qualification.mdx#personal-journal-schema-qualification).

Correct chronology only for a new, unapplied PR migration, preserving its SQL
bytes. Never rename an applied migration or reuse old-source SQL/type receipts
after a snapshot identity change; requalify the new exact source.

### Legacy address migration suppliers

The inactive migration supplier uses a separate protected journal; do not reuse
CREATE/RESTORE receipts. Its PostgreSQL fixture runner verifies the new migration
against reduced prerequisites, not the full schema or GoTrue. GoTrue `identity_id`
is SQL `auth.identities.id`, while JSON `id` is provider-specific. Verify identity
email state independently: admin `{email}` can leave `email_verified=false` despite
a confirmed timestamp. Retain pending inspection; never supply `email_confirm`.
Pinned GoTrue v2.197.0 admin confirmation and magic-link recovery do not set the
email identity flag. For a disposable positive fixture, create an unconfirmed
source and use supported signup link/OTP verification, which sets the matching
identity flag. Preserve the existing strict guard; never manually set identity
verification or infer it from the timestamp. This does not repair an already
confirmed production source. The real-provider runner compares sessions and
refresh tokens and simulates a lost PUT acknowledgement without replay; its mail
table and journal are fixtures, not full-schema proof. Add the separate 10-assertion
migration packet through the opt-in trusted-control schema selection; preserve
foundation172, journal301, HTTP29 and separately admitted RESTORE66 receipts.
See `apps/docs/build/development-tools/employee-address-migration.mdx` for the
canonical fingerprint, lock scope, mail prerequisites and remaining runtime gates.

## Employee RESTORE transport qualification

Extend the canonical employee schema/HTTP runner for RESTORE rather than creating
another database lifecycle. The optional RESTORE profile requires journal and HTTP
selection; preserve the 301 SQL and 29 CREATE checks and require its separate fixed
phase counts, real committed readbacks, zero child exit and owned cleanup. Inject
lost acknowledgements after real PostgREST/GoTrue completion and retain operation
and user UUIDs; reconciliation must never repeat the provider mutation. SQL ACL
checks and real Auth transport remain separate from Web/satellite session proof.
See [employee schema qualification](../../../../../apps/docs/build/development-tools/employee-schema-qualification.mdx).

## Inventory concurrency lock boundaries

The cascade fixture rejects every granted advisory lock except the proven
employee-admission bigint key in `ShareLock` mode with `objsubid=1`. Keep that
predicate narrow: unknown keys, an exclusive mode, real inventory keys, and the
same halves in the two-integer namespace must still fail. Explicitly account for
permitted locks rather than allowing a generic count of one.

The full-schema failure mapped shared employee admission through the profile FK
`SET DEFAULT` update and its statement-level admission trigger. Preserve that
admission. The 28-check Inventory fixture retains the original 22 cases and adds
rollback controls for a zero-row profile update, mixed admission/inventory locks,
unexpected key/mode/namespace, and cleanup. Require actual same-schema CI to run
these controls; source and mock checks cannot qualify the repair. Keep bounded
failure-only diagnostics, original tested counts and cleanup on failure.


## Address migration admission contention

Migration RPCs must try exclusive `employee-address-reservations` admission and
raise `55P03` on contention before row locks or durable state changes. A blocking
exclusive waiter can queue later shared Auth/profile/mail writers behind it.
Retain ordinary shared admission and every subsequent row/table NOWAIT fence.
The minimal qualification runner owns a three-session blocking-exclusive control
and four RPC contention cases with unrelated Auth-writer progress and unchanged
fixture snapshots. Its exact daemon check is a fixture admission fence, not a
portable Docker version requirement. Run only with a separately admitted disposable
lifecycle; the composed 10-SQL packet is not concurrency proof. Source checks are
static evidence until the actual PostgreSQL concurrency runner passes.
