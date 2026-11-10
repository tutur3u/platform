# Tuturuuu public roadmap

A public, read-only migration roadmap served by TanStack Start, Vite+ and Void on
Cloudflare Workers. The canonical app mount is `/roadmap`; assets and server-function
URLs use the same prefix. The provider asset base is root (omitted in source);
the post-build packaging step moves client files beneath `dist/client/roadmap/`.
Thus `/roadmap/assets/example.js` maps to the physical
`dist/client/roadmap/assets/example.js` through the `ASSETS` binding. Wrangler must be at least 4.148.0. There are no accounts, database bindings, analytics,
forms, provider credentials or private fleet dependencies.

## Public evidence

`scripts/refresh-snapshot.mjs` reads immutable tracked source for the fixed allowlist
of public customer-facing products and three explicitly admitted public route entries. Run it manually; it has no watcher, network
fetch, database, provider credentials or private fleet dependencies.

```sh
node apps/roadmap/scripts/refresh-snapshot.mjs <source-sha> apps/roadmap/evidence/public-inputs.json [observation-ISO-time]
node --test apps/roadmap/src/roadmap-data.test.ts
```

The optional input is bounded to 128 KiB and validated by
`src/migration-evidence.ts`: `{ "schemaVersion": 2, "apps": {} }` is an empty
input. App keys must belong to the public allowlist. Each value has exactly `source`, `pr` and `production`, each nullable.
Source records pin the cohort and app subtree; PR records include the exact public
GitHub API provenance URL and observation time. Historic review and checks stay
UNKNOWN or empty when they were not observed, rather than implying current green. The snapshot records these normalized inputs,
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
or roadmap-only `root_assets_correction` scope, open/merged/closed state, current head, draft flag, review decision and
reviewed head, observation time, required check names, check names/head/conclusions,
and nullable merge SHA/time. Only use a PR that completes the product migration;
configuration scaffolding or an unrelated feature PR is not completion evidence.
The generator requires a recorded merged SHA to be an ancestor of the source.
It does not fetch or authenticate manually supplied metadata: retain the actual
public evidence and review its provenance, scope and observation before inclusion.

The lifecycle is `planned` → `rolling_out` → `waiting_for_merge` →
`waiting_for_production_sync` → `live`. The public labels are Planned, Rolling
out, Waiting for merge, Waiting for prod sync and Live. Configuration only supports work in
progress. Awaiting merge requires a fresh non-draft open PR, explicit approval at
its current head, a nonempty required check set and all recorded checks successful
at that head. Missing, skipped, pending, unknown, stale or mismatched checks cannot
establish readiness. An evidenced merged migration waits for production verification.
Blocked is a separate public-safe flag derived from the publication hold, never
a replacement stage; the checkbox combines with any lifecycle filter and search.

A production record must have kind `production_readback`, an app scope, a named
accepted public target, immutable public repository `receiptUrl` and SHA-256,
deployed and response SHAs, version UUID, acceptance result and observation time.
Response and deployed SHA must match exactly. The equivalence proof retains the
separate pinned source, merge and deployed commits plus app identity and subtree.
The generator checks merge ancestry and reads all three app subtrees from Git;
only exact app-tree equality permits a different deployment cohort. Whole commits
are never treated as equal because one app matches. A receipt may predate the
merge when the independently released cohort has identical app source; the
24-hour freshness fence still applies.

The generator reads the immutable receipt blob without fetching it and checks
its bounded bytes and digest. Its JSON must exactly equal the production record
without the `receiptUrl` and `receiptSha256` pointer fields. An archive/build,
unknown receipt, wrong app/host/cohort/merge/subtree, or mismatched response cannot
establish live. This validates provenance and source consistency; it does not
authenticate provider metadata. Independent source and receipt review remains
required before integration.

For roadmap, only the admitted `/roadmap/` URLs at `roadmap.tuturuuu.com` and
`tuturuuu-roadmap.tuturuuu-e89.workers.dev` can carry production proof. The canonical
apex URL is not an accepted serving target. The original 14 products retain their exact apex target restrictions; Playground
and Shortener have no admitted production target in this input and remain
merge-backed only. All evidence categories retain canonical RFC3986 HTTPS
and exact-host validation.

The committed public inputs contain merge-backed Playground #7647, Shortener
#7788 and roadmap #7797 facts observed through the public GitHub API, plus source
app subtrees at `a3a26468748d9660851b809bb4a43f7ab94610d3`. They support waiting
for production verification, not live. Their product links point to source-verified
public route definitions rather than invented marketing pages; the original 14
public product entries are retained. No other fleet entries are included.

Roadmap cohort `299ed1dfd72870685cf47291a2e35efe876d8ff9` and merge `a3a26468`
have verified app subtree `3b8d0a012d919d1a2ccb00755e077b2c727847fe`. The required
immutable public production receipt, digest and recorded observation/provenance
are not supplied in this input, so roadmap live remains unclaimed. No raw provider
operations or private receipts belong in the evidence directory. A future public
receipt must contain only sanitized admitted production fields, without credentials,
account identifiers, local paths or private fleet details.

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
apps/roadmap/src/cache-policy.test.ts apps/roadmap/scripts/seal-artifact.test.mjs
apps/roadmap/scripts/pre-seal-doctor.test.mjs` for data, boundary, packaging, mapping
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
answers two hosts. `https://roadmap.tuturuuu.com` returns 301 to
`https://tuturuuu.com/roadmap` plus the same path and query (`/` becomes
`/roadmap/`). `https://tuturuuu.com/roadmap/` serves the app. `GET` and `HEAD`
`/roadmap/api/build-info` (and `/api/build-info` on the canonical host) return
the build commit as JSON and are not cached. workers.dev keeps the `/roadmap`
mount: root and the bare mount return 308 to `/roadmap/` with the query
preserved, and outside-prefix requests return 404. A loopback request whose
Host header is one of those two public hosts uses the same contract; any other
Host on loopback is left unchanged. Forwarded-host headers do not select a mount.

The reserved `/roadmap/assets` and `/roadmap/_serverFn` paths are transport
exceptions on the canonical mount: they retain the physical asset and
server-function URLs, including POST bodies and query strings. This app emits
client resources under its Vite `assets` directory; additional public asset
roots require an explicit transport contract before use. Encoded paths,
backslashes and repeated slashes return 400, preventing alias fallthrough and
protocol-relative redirect targets.

Pinned Start server-core 1.169.44 and client-core 1.170.38 overwrite the router
basepath with the compiled mount. The source therefore rewrites a non-satellite root-mounted page request
beneath `/roadmap`, retaining the compiled SSR router,
asset base and server-function base. The Worker overwrites an internal mount
header for every delegated request. The router reads that server-owned value,
dehydrates it and restores the external client basepath during Router's hydrate
hook, before client location matching. There is no independent client host sniff.
The source trace uses react-start 1.169.3 and router-core 1.171.38; acceptance must
verify actual SSR/hydration and navigation in the emitted Worker, not just the
pure boundary fixtures. No provider config projection or build-SHA change is used.

The release owner uploads the sealed prebuilt artifact with the qualified
Wrangler versions interface. Publication must not rebuild it with Void deploy.
A configured Worker name does not establish target identity or authentication.

Hosted acceptance must build the exact source, inspect the emitted configuration
and physical client tree, create a fresh Linux descriptor seal, and exercise root
and bare-mount query redirects, outside-prefix rejection, SSR, assets and server
functions against that artifact. Synthetic source tests do not attest a build,
seal, runtime or deployment. A PR synthetic merge SHA is distinct from its PR head
and from the reviewed main commit used for release.

The canonical page remains https://tuturuuu.com/roadmap/. The satellite host
only redirects there. The release owner must reconcile any existing zone
redirect with this contract and capture routing preimages before a hosted rollout.
No DNS, zone, provider or deployment operation follows from source publication.
Before sealing, `scripts/pre-seal-doctor.mjs` serves the built Worker on
loopback with `Host: tuturuuu.com` (200, Tuturuuu branding, the five stage
labels, public HTML cache, immutable hashed asset) and `Host:
roadmap.tuturuuu.com` (301), and reads `/roadmap/api/build-info` for
`ROADMAP_SOURCE_SHA`. The same checker must reject a broken variant. Verify
that local result against the hosted routes after publication.

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

## Public satellite presentation and response caching

The public page opts into `@tuturuuu/satellite/public` for the shared brand,
logo and theme. It does not mount authenticated satellite providers or resolve
sessions. EN/VI controls, filters and evidence use the bundled public snapshot.
A central sign-in link is the only account affordance. Root and mounted-host
router selection and the canonical apex URL remain owned by the request adapter.

`src/cache-policy.ts` composes headers after the native response. Only successful
GET/HEAD HTML at `https://tuturuuu.com/roadmap/` and
`https://roadmap.tuturuuu.com/`, without query variants, receives
`public,s-maxage=300,stale-while-revalidate=86400`. A renderer default of
`private` or `no-store` does not keep that document private: the page has no
actor. Cookie-bearing requests do not select a different document or read
identity. Set-Cookie, a Vary other than `accept-encoding`, unknown hosts,
auth/serverFn paths, errors and non-document responses receive `private,no-store`.
Unsafe headers remain present. Hashed files under `/roadmap/assets/`
(`name-<8+ hash>.ext`) receive `public, max-age=31536000, immutable`. Unhashed
files keep the supplier's cache policy.

The wrapper preserves response body streams, status and Content-Type bytes.
It has no Cache API, storage, network work, timers or background operations;
rollback is the owning source revert and normal reviewed release process.
`node --test src/cache-policy.test.ts src/roadmap-data.test.ts
scripts/pre-seal-doctor.test.mjs` exercises the header boundary with synthetic
requests and preserves stage/evidence controls. The doctor test prints the
broken-variant rejection.

Source tests do not establish hosted edge hits. The release owner must verify
exact-artifact SSR/hydration, immutable hashed assets, response headers and actual
edge cache hits on both hosts. Measure before/after client bytes and Lighthouse
metrics only on admitted production artifacts with identical commands and limits.
No source-only measurement substitutes for that acceptance.
