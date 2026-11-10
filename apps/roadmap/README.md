# Tuturuuu public roadmap

The public product roadmap at https://tuturuuu.com/roadmap/, served by TanStack
Start, Vite+ and Void on Cloudflare Workers. The canonical app mount is
`/roadmap`; assets and server-function URLs use the same prefix. The provider
asset base is root (omitted in source); the post-build packaging step moves
client files beneath `dist/client/roadmap/`. Thus `/roadmap/assets/example.js`
maps to the physical `dist/client/roadmap/assets/example.js` through the
`ASSETS` binding. Wrangler must be at least 4.148.0. There are no accounts,
database bindings, analytics, forms, provider credentials or private fleet
dependencies.

## Content and status

`src/content/tracks.ts` is the curated roadmap: tracks → milestones →
deliverables. Each deliverable lists the public PRs in tutur3u/platform that
deliver it and the app whose production deploy must contain them. Status is
never written by hand; `src/live/status.ts` derives it from evidence:

| Status | Rule |
| --- | --- |
| Live | Every PR merged and the app's deployed commit is at or after the last merge on main. Hosting moves (`requires: 'workers'`) need the app's probe to answer from Workers. Mobile needs the latest `mobile-v*` release tag to contain the merge. Items with no deploy target are live once merged. |
| Waiting for prod sync | Merged; production does not contain it yet, or the deploy cannot be verified publicly. |
| Waiting for merge | Every unmerged PR is open, not draft and approved. |
| In progress | Any other open PR, or curated `fallback: 'in_progress'` with no PR. |
| Planned | No public evidence. No claims. |

`src/content/coming-soon.ts` holds approved announcement copy only; change it
only with an approved replacement. Never add private products, client names,
security incidents, operational notes or tokens to content.

## Live data

Data comes from public sources only, in two layers:

1. **Build time.** `scripts/generate-roadmap-data.mjs` (run by `build`,
   `build:cloudflare` and `data:refresh`) reads the public GitHub REST API (open,
   approved and recently merged PRs, every PR the content references, main
   HEAD, deployed-commit-vs-main compares and the latest mobile release tag)
   and probes each allowlisted app's public `/api/build-info`. It writes
   `src/generated/live.json`. `GITHUB_TOKEN`/`GH_TOKEN` is optional and only
   lifts the anonymous rate limit; it is never written. If GitHub fails, the
   previous file is kept with its own timestamp. `ROADMAP_OFFLINE=1` skips the
   refresh.
2. **In the browser.** After hydration the page refreshes from the public
   GitHub API (unauthenticated, the viewer's own quota, about 10 calls) and
   from `GET /roadmap/api/hosts`, then every 10 minutes while visible. The last
   good result is kept in `localStorage` for 10 minutes. A failed refresh shows
   the newest good data with its real observation time ("Live check
   unavailable"), never a fresher-looking label.

`GET|HEAD /roadmap/api/hosts` probes the fixed allowlist in
`src/live/host-probe.ts` (request input never selects a host), with manual
redirects, a 4-second timeout and a 16 KiB body bound. It returns only
`{ app, platform, commit }` per app, with `private,no-store`. One isolate
shares a result for 60 seconds, so bursts fan out at most once a minute.

The shipped feed (`src/live/feed.ts`) publishes merged PR titles only when
they are `feat`/`perf` in a public product scope and contain no incident,
security, customer or internal-plumbing wording. Client or organisation names
are blocked through hashed terms in `src/content/title-denylist.ts`; add one
with `node apps/roadmap/scripts/hash-denylist-term.mjs "Name"` and never
commit the name itself.

```sh
GITHUB_TOKEN=$(gh auth token) bun run --cwd apps/roadmap data:refresh
node --test apps/roadmap/src/roadmap-data.test.ts
```

`src/roadmap-data.test.ts` (D79) covers the validator, status engine, content
guards, the approved plan copy, feed safety (including a denylist and hashed
names), freshness merging and the host probe. Each guard has a broken variant
that must fail.

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

The canonical page remains https://tuturuuu.com/roadmap/. `https://tuturuuu.com/roadmap`
and `https://roadmap.tuturuuu.com/roadmap` each redirect once, directly to that
URL. The satellite host only redirects there. The release owner must reconcile
any existing zone redirect with this contract and capture routing preimages
before a hosted rollout.
No DNS, zone, provider or deployment operation follows from source publication.
Before sealing, `scripts/pre-seal-doctor.mjs` serves the built Worker on
loopback with `Host: tuturuuu.com` (200, Tuturuuu branding, the five status
labels and the approved plan card, public HTML cache, immutable hashed asset) and `Host:
roadmap.tuturuuu.com` (301 straight to `https://tuturuuu.com/roadmap/`), and
reads `/roadmap/api/build-info` for `ROADMAP_SOURCE_SHA`. It also runs
`scripts/ci/asset-smoke.mjs`: every CSS, JS and font URL referenced by the
canonical and satellite documents must return 200 with the matching MIME type
on `tuturuuu.com`. The same checker must reject a broken variant, including a
stylesheet that returns 404 `text/html`. Post-deploy D15 runs that smoke for
any app whose cutover entry sets `assetSmoke` (`node scripts/ci/asset-smoke.mjs`,
or `node scripts/cutover-smoke.mjs roadmap https://tuturuuu.com`). Verify that
local result against the hosted routes after publication.

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
sessions. EN/VI controls, filters and statuses use the generated public data,
refreshed in the browser from public sources.
A central sign-in link is the only account affordance. Root and mounted-host
router selection and the canonical apex URL remain owned by the request adapter.

`src/cache-policy.ts` composes headers after the native response. Only successful
GET/HEAD HTML at `https://tuturuuu.com/roadmap/` and
`https://roadmap.tuturuuu.com/`, without query variants, receives
`public,s-maxage=300,stale-while-revalidate=86400`. A renderer default of
`private` or `no-store` does not keep that document private: the page has no
actor. Cookie-bearing requests do not select a different document or read
identity. `src/public-cache-guard.ts` fails the cache test if `src` imports
an auth or session module, or reads `Cookie` or `Authorization`, while that
document still uses the shared cache. The only escape is an explicit
`private` cache-control with no `s-maxage` on the document. Set-Cookie, a
Vary other than `accept-encoding`, unknown hosts,
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
