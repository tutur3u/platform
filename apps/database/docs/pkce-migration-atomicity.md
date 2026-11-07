# PKCE migration transaction contract

`20261101090000_bind_cross_app_handoff_pkce.sql` sets transaction-local lock and
statement limits (5s and 60s), takes an ACCESS EXCLUSIVE NOWAIT lock before DDL,
and checks the resulting catalogs before the CLI records the migration. The 60s
limit applies to each statement, not to the entire file. Acceptance reads only
catalogs: two nullable text columns, the validated replacement check constraint,
four exact function signatures and body hashes, language, return types,
search paths, definer flags, effective role privileges and the PUBLIC ACL.

The migration drops and **recreates** `cross_app_tokens_code_challenge_check`.
The expected final state is the validated replacement constraint, not absence
of that name. Function bodies and grants remain unchanged. The static contract
test verifies that acceptance hashes and the role matrix match those definitions.

## Production executor and atomicity proof

Source baseline: platform `9d458840f0064f6c37e43da5d4fca3bccd4fa88c`.
Production uses Supabase CLI **2.121.0**:

- [Production workflow lines 647–670](https://github.com/tutur3u/platform/blob/9d458840f0064f6c37e43da5d4fca3bccd4fa88c/.github/workflows/supabase-production.yaml#L647-L670)
  invoke the composite setup action without a version override and run
  `supabase db push --include-all` from `apps/database`.
- [Setup action lines 3–26](https://github.com/tutur3u/platform/blob/9d458840f0064f6c37e43da5d4fca3bccd4fa88c/.github/actions/setup-supabase-cli-with-retry/action.yml#L3-L26)
  resolve the empty version input through
  [runtime.mjs lines 14–39](https://github.com/tutur3u/platform/blob/9d458840f0064f6c37e43da5d4fca3bccd4fa88c/.github/actions/setup-supabase-cli-with-retry/runtime.mjs#L14-L39).
  The resolver reads the database workspace and `packages.supabase` from
  [bun.lock line 8085](https://github.com/tutur3u/platform/blob/9d458840f0064f6c37e43da5d4fca3bccd4fa88c/bun.lock#L8085).
  [Database package line 33](https://github.com/tutur3u/platform/blob/9d458840f0064f6c37e43da5d4fca3bccd4fa88c/apps/database/package.json#L33)
  also declares 2.121.0.

The CLI tag `v2.121.0` resolves to immutable commit
`8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2`. Its shipped TypeScript path proves:

1. [Push handler lines 112–119](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/commands/db/push/push.handler.ts#L112-L119)
   calls `dbPushCore`; [core lines 125–154](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/command-internal/db-push-core.ts#L125-L154)
   use `includeAll` for pending-version selection, and
   [line 251](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/command-internal/db-push-core.ts#L251)
   calls `applyMigrations`.
2. [Per-file loop lines 653–674](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/command-internal/migration-apply.ts#L653-L674)
   resets connection state then calls `execMigrationBatch` for each file.
3. [Batch assembly lines 519–597](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/command-internal/migration-apply.ts#L519-L597)
   queues every ordinary statement, appends `INSERT_MIGRATION_VERSION` on the
   final flush, and submits all operations with `session.execBatch`.
   [History lines 35–36](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/command-internal/migration-history.ts#L35-L36)
   define that insert into `supabase_migrations.schema_migrations`, including the
   version, name and statements.
4. [execBatch lines 946–975](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/command-internal/db-connection.sql-pg.layer.ts#L946-L975)
   acquires one connection and submits a `PgBatchQuery`.
   [Wire submission lines 267–284](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/command-internal/db-connection.sql-pg.layer.ts#L267-L284)
   sends Parse/Bind/Execute for each operation and exactly one final Sync.
5. PostgreSQL's [extended-query protocol](https://www.postgresql.org/docs/18/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY)
   ends an implicit transaction at Sync, committing on success and rolling back
   on error. Therefore this file's DDL, functions, grants, catalog assertions and
   history insert are in **one transaction**. A lock error, timeout, assertion
   failure or history-insert error aborts that transaction.
   [SET LOCAL](https://www.postgresql.org/docs/18/sql-set.html) expires at its end;
   [LOCK](https://www.postgresql.org/docs/18/sql-lock.html) is held until its end.

This proof applies to this file shape: SET LOCAL, LOCK, ALTER TABLE, CREATE OR
REPLACE FUNCTION, REVOKE, GRANT and DO, without explicit transaction control,
`transaction=false`, session resets or pipeline-incompatible commands. PL/pgSQL
BEGIN/END delimit routine blocks; they are not transaction commands. The static
test rejects top-level boundaries and incompatible commands.
[Sequential exceptions at lines 502–510](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/command-internal/migration-apply.ts#L502-L510)
and [pipeline exceptions at lines 578–597](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli/src/command-internal/migration-apply.ts#L578-L597)
prevent generalizing this claim to every migration or the whole pending train.

This is source/protocol proof and static validation, not an executed rollback or
runtime acceptance test. Release validation must use the final source SHA/blob.

## Already-applied environments

The repository targets staging on main through
[supabase-staging.yaml](https://github.com/tutur3u/platform/blob/9d458840f0064f6c37e43da5d4fca3bccd4fa88c/.github/workflows/supabase-staging.yaml#L150-L199),
which runs `db push --include-all` and can skip versions already applied by a
descendant. GitHub workflow history provides evidence that staging already
applied version 20261101090000:

- [Run 42022449204](https://github.com/tutur3u/platform/actions/runs/42022449204)
  at `1c5e0365e6eb6ff9d004075e2875b83ab439db52` completed the migration step and
  reported “Remote database is up to date.”
- [Run 42052068622](https://github.com/tutur3u/platform/actions/runs/42052068622)
  at the source baseline also completed that step with the same result.

These commits contain the original migration. Editing its bytes creates
source/history drift on staging: the CLI selects by version and will not rerun
this file's new preamble or acceptance block there. The intended schema,
functions and grants are unchanged, but staging success alone cannot validate
execution of the edited file. This conclusion uses workflow history, not a live
schema/history query. Other independently provisioned environments remain unknown.

Recommended handling: retain existing applied history; do not delete or mark the
version unapplied to force execution. Before release, the environment owner must
reconcile its applied identity and catalog state and qualify the edited file in
a fresh disposable environment where the version is pending. If checks or schema
repair must execute on an already-applied environment, use a separately reviewed
forward migration or acceptance procedure. Production must consume the edited
file only while its version is still pending. Re-pin release evidence to its
final SHA/blob; an existing staging marker cannot prove its new execution path.

## Source-bound security admission

The existing anonymous validator exception binds the whole migration's SHA-256.
Its `sourceDigest` is re-pinned; the reviewed function digest, signature, line,
roles and reason remain unchanged. The introductory comment is condensed so
adding the preamble preserves the reviewed definition's line number. The guard's
source-only rebind mechanism still requires independent exact-head attestation
under `security/definer-record-admission` from the pinned release bot. Local
checks using the proposed ledger do not grant that admission; no security guard
or assertion is relaxed by this change.
