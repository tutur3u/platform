# Tuturuuu public roadmap

A public, read-only migration roadmap served by TanStack Start, Vite+ and Void on
Cloudflare Workers. The app is mounted at `/roadmap`; assets and server-function
URLs use the same prefix; `assets.base_path` mounts the client directory at
`/roadmap` without changing asset keys. Wrangler must be at least 4.148.0. There are no accounts, database bindings, analytics,
forms, provider credentials or private fleet dependencies.

## Public evidence

`scripts/refresh-snapshot.mjs` reads immutable tracked bytes for an explicit
allowlist of customer-facing products with public marketing pages. It writes
`src/snapshot.json`, including full source identity, evidence URLs and freshness:

```sh
node apps/roadmap/scripts/refresh-snapshot.mjs <full-public-source-commit>
node --test apps/roadmap/src/roadmap-data.test.ts
```

Review and commit each snapshot update. This script does not monitor a repository
or query deployment providers. Source configuration means source progress;
publication permission is not a live deployment attestation. This snapshot cannot
assert `deployed`. Adding verified deployment evidence needs a separate reviewed
data contract with production identity and public acceptance. No percentage or ETA
is inferred from source files or successful build jobs. Private products, customer
records, fleet metadata and security reason strings are excluded. Snapshots older
than 24 hours display a freshness notice.

## Build and publication

Use the frozen dependency versions in this workspace manifest. In an admitted CI
checkout with the complete lockfile, run the app's `build` script before its
`type-check` script so TanStack's route generator produces `src/routeTree.gen.ts`.
Set `ROADMAP_SOURCE_SHA` to the exact checkout commit, then run `build:cloudflare`.
Run `seal:cloudflare -- <same-sha>` after the build to hash the actual emitted
files into `roadmap-artifact.json`. The sealer requires one emitted Worker JSON
config, the expected Worker name, client assets and source identity in emitted
code. It does not attest runtime behavior or deployment. SSR HTML exposes the
build identity as `data-source-sha` for the release readback.
Run the data tests directly through Node; no database or app server is needed.
No local machine release build is required.

The Void plugin precedes the Start and React plugins. Vite asset base, Start
basepath and the router basepath all match `/roadmap`. Before production traffic,
verify the emitted Worker and client artifacts, the exact source SHA and account,
and both the bare `/roadmap` and `/roadmap/*` routes against existing zone routes.
The bare path with a query needs exact path canonicalization to `/roadmap/`,
preserving the query through the qualified zone/origin publisher; the two Worker
route patterns alone do not cover that case. Never broaden to `/roadmap*`.
The release owner uploads the sealed prebuilt artifact with the qualified
Wrangler versions interface. Publication must not rebuild it with Void deploy.
A configured Worker name does not establish target identity or authentication.

The canonical page is https://tuturuuu.com/roadmap/. The application, assets,
server functions and artifact seal keep the /roadmap mount; there is no
subdomain-root variant. The Cloudflare zone publisher owns a Single Redirect
for roadmap.tuturuuu.com: every path receives a 301 to the same path beneath
https://tuturuuu.com/roadmap/, preserving the query string. For example,
https://roadmap.tuturuuu.com/?status=active redirects to
https://tuturuuu.com/roadmap/?status=active.
This redirect is a zone operation, not an application request rewrite or a
Worker custom-domain declaration. Capture its rule preimage alongside the
Worker route preimages and verify both hostnames before accepting delivery.

Capture the existing route mapping and immutable Worker version before a write.
For a regression, the release owner restores those exact route mappings and the
prior Worker version, then checks that unrelated apex paths still reach their
prior origin. The first publication needs a recorded route-removal recovery path;
a Worker rollback alone does not restore the prior route topology. Verify the
public page, assets, reloads, English/Vietnamese selection and filters at the
canonical URL before calling the app delivered.

Shared lockfile and CI registration are integrated by the repository owner;
application ownership does not grant shared-root or zone writes.

Official tooling references:

- [Void with TanStack Start](https://void.cloud/integrations/frameworks/tanstack-start)
- [Void Cloudflare deployment](https://void.cloud/reference/cli/deploy)
- [Vite+ configuration](https://www.viteplus.dev/config/)
- [TanStack Start on Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
