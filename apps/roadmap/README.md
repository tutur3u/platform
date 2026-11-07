# Tuturuuu public roadmap

A public, read-only migration roadmap served by TanStack Start, Vite+ and Void on
Cloudflare Workers. The app is mounted at `/roadmap`; assets and server-function
URLs use the same prefix. The provider asset base is root (omitted in source);
the post-build packaging step moves client files beneath `dist/client/roadmap/`.
Thus `/roadmap/assets/example.js` maps to the physical
`dist/client/roadmap/assets/example.js` through the `ASSETS` binding. Wrangler must be at least 4.148.0. There are no accounts, database bindings, analytics,
forms, provider credentials or private fleet dependencies.

## Public evidence

`scripts/refresh-snapshot.mjs` reads immutable tracked source for the fixed allowlist
of public customer-facing products. Run it manually; it has no watcher, network
fetch, database, provider credentials or private fleet dependencies.

```sh
node apps/roadmap/scripts/refresh-snapshot.mjs <source-sha> [public-evidence.json] [observation-ISO-time]
node --test apps/roadmap/src/roadmap-data.test.ts
```

The optional input is bounded to 128 KiB and validated by
`src/migration-evidence.ts`: `{ "schemaVersion": 1, "apps": {} }` is an empty
input. App keys must belong to the public allowlist. Each value has exactly `pr`
and `production`, each nullable. The snapshot records these normalized inputs,
the input SHA-256, source commit, observation time and source-verified merge
inclusion. Reproduce it with the same source, input bytes and observation time.
Review public evidence inputs before generating; never include private products,
customer records, accounts, check logs, security reasons or operational notes.
No status is assigned directly in the input. Source URLs encode each path segment
using RFC3986, including brackets and parentheses. Every evidence URL must be
absolute HTTPS at its category's exact host, without userinfo, query or fragment;
malformed escapes and noncanonical/raw reserved path characters are rejected.
Supplied migration PR and production receipt links accompany source links when
actual stage proof is available; no PR is inferred from configuration.

A PR record identifies its public first-party PR URL, `migration_completion`
scope, open/merged/closed state, current head, draft flag, review decision and
reviewed head, observation time, required check names, check names/head/conclusions,
and nullable merge SHA/time. Only use a PR that completes the product migration;
configuration scaffolding or an unrelated feature PR is not completion evidence.
The generator requires a recorded merged SHA to be an ancestor of the source.
It does not fetch or authenticate manually supplied metadata: retain the actual
public evidence and review its provenance, scope and observation before inclusion.

The lifecycle is `planned` → `rolling_out` → `waiting_for_merge` →
`waiting_for_production_sync` → `live`. Configuration only supports work in
progress. Awaiting merge requires a fresh non-draft open PR, explicit approval at
its current head, a nonempty required check set and all recorded checks successful
at that head. Missing, skipped, pending, unknown, stale or mismatched checks cannot
establish readiness. An evidenced merged migration waits for production verification.
Blocked is a separate public-safe flag derived from the publication hold, never
a replacement stage; the checkbox combines with any lifecycle filter and search.

A production record must have kind `production_readback`, a named canonical
`https://tuturuuu.com/<app>/` URL, immutable public repository `receiptUrl`, deployed
and response SHAs matching the merged migration SHA, acceptance result and
observation time. Only record actual production readback and acceptance; builds,
source artifacts and publication permissions are not production proof. Unsupported
live claims are rejected. Stale or unaccepted readbacks cannot establish live.
The model conservatively requires an exact merged SHA; later deployment SHAs need
a separately reviewed ancestry-proof extension.

The committed snapshot has no PR completion or production inputs. Its source
configuration and publication-policy evidence are real immutable source facts;
completion metadata remains explicitly missing. It asserts no merged-completion
or live stages. Evidence is shown as of its observation time, with a stale notice
after 24 hours. No percentages, estimated progress or inferred live claims appear.
Pure Node tests cover every stage, orthogonal blocking, filters/counts, bilingual
labels, public boundaries and invalid/stale/head-mismatched evidence.

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
