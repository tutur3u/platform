# @tuturuuu/data

Portable data layer for Tuturuuu data Workers: a table registry, a scoped
Kysely query builder and a raw-SQL statement registry. The Kysely dialect is
injected; the package imports only `kysely` and `@tuturuuu/authz`.

**Status:** dark. No app imports it yet. Owned by the Supabase-to-Cloudflare
Foundations lane.

## What it enforces

- `forPrincipal(engine, principal, database, { budget })` is the only client
  constructor; the invocation budget from `createInvocationBudget` is
  required and capped at 1,000 queries.
- Every tenant table in a builder query (FROM, JOIN, subqueries, CTEs, set
  operations, RETURNING) must carry its minted scope as a top-level AND.
  `Scoped<Q>` is the type-level check; the runtime guard in `src/guard.ts` is
  authoritative.
- Inserts take `ws_id` from the resource; upserts must target `ws_id`;
  REPLACE, RIGHT/FULL joins and raw fragments in builder queries are refused.
- Raw statements (`defineStatements`) are a reviewed exception with a narrow
  grammar, one tenant table per statement and `ws_id = ?1` on each source.

## Adoption gates

Before the first adoption of raw statements:

1. A fail-closed allowlist of reviewed SQL expression functions across all
   clauses, with the adopter's runtime capabilities pinned (no
   `load_extension`, `readfile`, `writefile` or `fts3_tokenizer`).
2. Verified base-table and workspace-key invariants per domain, and review or
   refusal of indirect effects: `ON DELETE CASCADE` without workspace
   identity, triggers, views, virtual tables, and a writable rowid alias for
   `ws_id`. Exercised in the adopted schema's integration suite.
3. A dense-numbered-slots binding contract: check the argument count against
   the highest `?N` slot before forwarding, tested through the real adapter,
   including a repeated `?1` and missing or excess arguments.
4. The registry-only CI ban on `.exec()`, `sql.raw()` and `prepare()` outside
   a domain's `sql/` module.

Open items for the next foundations steps:

- Per-tenant-source scope and predicate for raw statements.
- The table behind an alias in the coverage types, and `delete` required on
  the DELETE target alone.
- `forSystem()` and Vectorize `vectors.query()`.
- Error wrapping with `@tuturuuu/utils/effect`.
- Refuse duplicate aliases early (low).

## Tests

`bun run test` and `bun run type-check` in this package. The execution tests
use Node's built-in `node:sqlite` and need Node 22.5 or later; on older
runtimes they skip.
