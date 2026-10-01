# Programming delta: disposable PostgreSQL fixture

This runner requires explicit admission for a dedicated synthetic database stage.
It never accepts an existing database URL. Do not use it for ordinary, shared or
production databases, and do not turn its minimal baseline into public DB types.

From a bootstrapped checkout on the admitted host:

```sh
ttr resources run -- node apps/database/tests/programming-disposable/run.mjs
```

The runner requires the already present pinned PostgreSQL 17 ARM64 image, never
pulls an image, proves its unique container/volume and unused loopback port 55439,
records baseline Docker identities and the migration hash, and creates one labeled
container capped at 2 CPUs/2 GiB. Its execution deadline is 18 minutes with two
minutes reserved for cleanup. It requires 10 GiB free disk to start, stops below
9 GiB, limits data to 1000 MiB and logs to 20 MiB. Existing services are excluded.
A missing image, name/port collision or failed gate must stop without a workaround.

`baseline.sql` contains only fake prerequisite tables/identities. The runner applies
the existing unchanged enqueue migration and the new Programming delta to populated
and empty synthetic baselines. Assertions cover private tables/RPC browser grants,
hidden-case DTO boundaries, failed transaction rollback, stale revisions, parent
execution denial, unchanged ready-runner rejection, immutable submission binding and
workspace deletion preserving history. Two concurrent psql sessions test edit/edit,
edit/enqueue and archive/enqueue conflicts. No runner is created or code executed.

Finally removes only recorded fixture-owned container/volume identities after label
verification, proves unrelated Docker identities unchanged and port closed, and
records post-cleanup disk. Evidence is ignored. Failure remains a failure; preserve
its evidence before any explicitly admitted retry. Cleanup interruption requires
reporting the recorded IDs, not a broad prune/reset.

This validates the Programming delta against synthetic prerequisites. It does not
prove full production-schema replay, PostgREST/API integration, or generated types.
Type generation requires a separately approved compatible path and must preserve
the existing full public schema; the one-container fixture does not admit a second
metadata service or type generation against an ordinary local database.
