# Declarative schema adoption

## Current boundary

This is preparation for adoption, not a platform-wide switch. The migration
history remains authoritative. Do not enable pg-delta, set `schema_paths`, add a
partial schema tree, replace migration history, or refresh generated types as
part of readiness inspection. Root owns the CLI upgrade and release decisions.

Run the read-only checker from the repository root after dependency setup:

```sh
node apps/database/scripts/declarative-schema-readiness.js --json
```

Exit 2 means adoption is held; exit 1 means inspection failed or arguments were
rejected. `--help` exits 0. The checker never attests database equivalence. Even a
populated schema tree and a capable CLI leave `ready: false`. It emits filenames
and byte hashes, config/lock identities, configured PostgreSQL major, and bounded
CLI capability probes. It does not print SQL, CLI stderr, rows, or environment
values. Store reports in ignored task evidence, not a committed database dump.
The settings inspection recognizes known literal keys conservatively; it is not
a general TOML parser. Review the full config before any future engine change.

Only the installed bundled workspace binary is probed, using `--version` and
exact command `--help`, with ten-second timeouts and the update notifier explicitly disabled. There is no installer, global
binary fallback, override, connection flag, or mutation mode. Unsupported CLI
commands hold adoption rather than falling back to a different diff engine.
Run the focused Node tests before broad `bun check`.

## Engine distinction

Check both the pinned CLI and its actual help against the
[official declarative guide](https://supabase.com/docs/guides/local-development/declarative-database-schemas)
and [diff engine guide](https://supabase.com/docs/guides/local-development/diff-engines).
The current guide describes `db schema declarative generate` and `sync` on
pg-delta. They require `[experimental.pgdelta] enabled = true`, or a supported
single-command experimental flag. Future qualification must verify the exact
flags in installed help rather than assume newer documentation fits the pin.

Legacy migra uses `db diff` with declarative inputs and `schema_paths` ordering.
Pg-delta orders dependencies itself; `schema_paths` does not control its ordering.
Do not combine the legacy ordered input format with a pg-delta export. In
particular, do not run `db pull --declarative` on a legacy project. Never silently
change existing `sb:diff`, typegen, CI migration gates, or deploy commands.

## Required baseline evidence

Before creating or adopting any schema tree:

1. Freeze a fresh main commit/tree and complete migration filename/hash manifest,
   config/lock hashes, installed CLI binary/version, PostgreSQL image digest and
   actual server version. Reconcile pending migration owners and held chronology
   explicitly. A main-only inventory cannot establish pending-branch coverage.
2. Replay the entire approved migration set on a new task-owned disposable Linux
   database. Compare every migration ledger version and stored statement/name
   against the approved replay manifest, not just the last timestamp or count.
   Keep old migrations byte-identical. Never reset a foreign or linked database.
3. Export DDL only from that replayed database into an isolated staging directory,
   using an explicitly local target and verified engine/CLI flags. Do not use
   production, a linked project, arbitrary `--db-url`, `--overwrite`, or a dump
   that omits pending migrations as the baseline. Keep secrets and rows out of
   the export, reports, Git, and logs. Inspect SQL function bodies and options for
   embedded credentials before retaining or committing any DDL.
4. Review objects and exceptions below. Split reviewed DDL per object/schema so
   every authored file stays below 700 LOC. An empty or partial tree is unsafe:
   the engine can interpret absent objects as removals.
5. Prove a no-op declarative diff against the full replayed history using the
   exact chosen engine. A successful command alone is insufficient; review the
   generated SQL/output and prove no changes. Rebuild a second disposable
   database from the approved declarations plus imperative exceptions and
   compare catalogs, ownership, policies, privileges, functions, extensions,
   publications, and managed-schema customizations. Record both comparisons.
6. Freeze independently reviewed receipts bound to those bytes, ledger, engine,
   and database versions. Close task-owned containers, volumes, ports, and
   systemd scopes; prove absence. Use the shared `ttr resources` queue and
   explicit physical bounds. A cache artifact is evidence only when its complete
   source/config/lock/version binding and pristine ledger are verified read-only.

If replay, ledger coverage, no-op diff, owner reconciliation, or catalog parity
is incomplete, retain preparation status and do not commit mass DDL or a config
switch. A production schema dump is not a substitute for migration completeness.
Do not squash, drop, rename, rebase, or repair deployed migration history.

## Imperative exceptions and security review

Keep a reviewed exception inventory naming each object/change, its migration,
why the chosen engine cannot model it, its owner, and its verification. Continue
versioned imperative migrations for DML, data backfills, environment-dependent
operations, and objects unsupported by the verified engine. Generated SQL is a
proposal; inspect destructive changes, renames, and extension API calls manually.
The pg-delta `_custom` directory can preserve hand-authored SQL, but it does not
prove diff coverage or replace imperative exception verification.

- Review public and private schemas, schema USAGE, object ownership, grants,
  default privileges, RLS enable/force state, policy expressions and roles.
- Preserve authenticated/anon/service_role execution boundaries, function
  signatures, `SECURITY DEFINER`, controlled search paths, and explicit revokes.
  Test authorization behavior separately from catalog equality.
- Preserve extension versions/dependencies and extension-managed objects through
  supported extension APIs and imperative exceptions. Declare prerequisites;
  inspect webhooks/pg_net configuration independently. Never export extension
  internals as application-owned tables to recreate or drop.
- Treat auth/storage/realtime schemas as managed. Inspect application triggers
  on managed tables, Storage policies/bucket configuration, and Realtime
  policies/publications separately. The guide excludes some custom functions and
  indexes inside managed schemas; record them as imperative exceptions. Do not
  alter auth/report SQL owned by another lane.
- Track engine-specific unsupported objects explicitly. Legacy migra limitations
  include view grants/owners and security invoker, column privileges, comments,
  roles, domains, policy alterations, materialized-view index restoration, and
  publication changes. Do not infer parity from a diff that omits these objects.

## Later opt-in workflow

Only after baseline approval, edit reviewed declarations and generate a new
forward migration using the exact qualified engine. On pg-delta, use verified
`sync --no-apply` support to produce reviewable SQL without applying it. Do not
use `--apply` or global `--yes`. Preserve DML and other exceptions as explicit
forward migrations. Review the delta, replay it in the disposable environment,
run security/pgTAP checks, then generate types from that fully applied schema.
Migration chronology CI, baseline cache identity, staging/production deployment
gates, and production ledger verification remain separate requirements. This
foundation does not change any of them or authorize a deployment.
