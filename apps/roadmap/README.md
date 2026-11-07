# Tuturuuu public roadmap

A public, read-only migration roadmap served by TanStack Start, Vite+ and Void on
Cloudflare Workers. The app is mounted at `/roadmap`; assets and server-function
URLs use the same prefix. The provider asset base is root (omitted in source);
the post-build packaging step moves client files beneath `dist/client/roadmap/`.
Thus `/roadmap/assets/example.js` maps to the physical
`dist/client/roadmap/assets/example.js` through the `ASSETS` binding. Wrangler must be at least 4.148.0. There are no accounts, database bindings, analytics,
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
checkout with the complete lockfile, the app's `type-check` script generates
`src/routeTree.gen.ts` through the shared TanStack generator before checking types.
It does not require a release build or run a formatter.
Set `ROADMAP_SOURCE_SHA` to the exact checkout commit, then run `build:cloudflare`.
Both build scripts run `vp build` and then `scripts/package-assets.mjs`; a fresh
client directory is required, and packaging refuses a second run. The source-SHA
guard remains in Vite configuration. No emitted provider configuration is patched.
Run `seal:cloudflare -- <same-sha>` after the build to hash the actual emitted
files into a fresh `roadmap-artifact.json`. Sealing runs on the qualified Linux
CI host: every ancestor and artifact is opened without following symlinks,
reads stay relative to retained directory descriptors through `/proc/self/fd`,
and file size/content/hash checks use the same regular-file descriptor.
Replacement or mutation refuses the seal; an existing manifest is never overwritten. The sealer requires one emitted Worker JSON
config, the expected Worker name and emitted entry, the configured `dist/client`
asset directory, root provider asset base, `ASSETS`, worker-first handling,
`not_found_handling: none`, default or auto trailing-slash HTML handling, every
physical client key beneath `roadmap/`, and source identity in emitted code.
Public `basePath` and `providerAssetBase` are distinct manifest fields. It does not attest runtime behavior or deployment. SSR HTML exposes the
build identity as `data-source-sha` for the release readback.
Run `node --test apps/roadmap/src/roadmap-data.test.ts
apps/roadmap/scripts/seal-artifact.test.mjs` for data, boundary, packaging, mapping
and descriptor-security checks. Linux-only descriptor cases skip on other hosts.
Run the data tests directly through Node; no database or app server is needed.
No local machine release build is required.

The pull-request artifact job builds and seals its triggering CI merge cohort
without deployment credentials. Release artifacts come from a separate manual run.
Dispatch `roadmap-cloudflare.yaml` on `main` with `source_sha` equal to the
reviewed merged commit. The workflow checks out its triggering `github.sha` and
rejects a mismatching requested source before checkout or dependency execution.
A moved main requires fresh exact-source qualification rather than a silent rebuild.

The Void plugin precedes the Start and React plugins. Vite asset base, Start
basepath and the router basepath all match `/roadmap`. Before production traffic,
verify the emitted Worker and client artifacts, the exact source SHA and account,
and both the bare `/roadmap` and `/roadmap/*` routes against existing zone routes.
The app-owned `src/worker.ts`, selected through Void's supported `cloudflare.main`,
returns 308 for `/`, `/?x=1`, `/roadmap` and `/roadmap?x=1` to `/roadmap/`,
preserving query bytes. Mounted page, asset and server-function requests delegate
to the native Start entry. Encoded or malformed pathnames return 400, preventing Void's asset fallback
from decoding rejected aliases; paths outside `/roadmap/` return 404; the Worker does not act as an apex fallback. The existing
zone route patterns still need publisher acceptance for bare paths with queries. Never broaden to `/roadmap*`.
The release owner uploads the sealed prebuilt artifact with the qualified
Wrangler versions interface. Publication must not rebuild it with Void deploy.
A configured Worker name does not establish target identity or authentication.

Hosted acceptance must build the exact source, inspect the emitted configuration
and physical client tree, create a fresh Linux descriptor seal, and exercise root
and bare-mount query redirects, outside-prefix rejection, SSR, assets and server
functions against that artifact. Synthetic source tests do not attest a build,
seal, runtime or deployment. A PR synthetic merge SHA is distinct from its PR head
and from the reviewed main commit used for release.

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
