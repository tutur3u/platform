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

## Timeline and full history

`scripts/generate-history.mjs` (run by `build`, `build:cloudflare` and
`data:refresh`, with `GITHUB_TOKEN`) reads every merged PR in tutur3u/platform
since the first one (October 2022), drops bots and dependency churn, and
classifies each into a public track and a kind (feature, fix, maintenance) in
`src/history/classify.ts`. Titles are published only for user-facing features in
a public product track that pass the incident/security/customer, plumbing and
internal-implementation filters; everything else (including client work) is
counted, never titled. The result, with per-week/month/year aggregates
(`src/history/build.ts`, validated by `parseHistory`), is committed as
`src/generated/history.json` and emitted as a hashed, immutable asset that the
page fetches only when the timeline comes within 600px of the viewport
(`src/history/lazy-load.ts`); it is never prefetched. Without a token the
committed file is kept. Curated deliverables absorb their PRs, so each shows once in its period.
The Timeline offers Week, Month and Year views with a period scrubber; state
lives in the URL (`/roadmap?view=month&period=2025-03`). Transitions use the View
Transitions API when available; everything respects `prefers-reduced-motion`.

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
2. **In the browser.** Once the page has loaded, the tab is visible and the
   main thread is idle (`src/live/defer.ts`), the page refreshes from the
   public GitHub API (unauthenticated, the viewer's own quota: four search
   calls, the most recently updated PRs only, see `LIVE_SEARCH`) and from
   `GET /roadmap/api/hosts`, then every 10 minutes while visible. A 403 or
   429 from GitHub pauses refreshes for 30 minutes. Fresh data renders as a
   React transition, so it never blocks input. The last
   good result is kept in `localStorage` for 10 minutes. A failed refresh shows
   the newest good data with its real observation time ("Live check
   unavailable"), never a fresher-looking label.

**Hosting and the move to tuturuuu.com** are observed on every build, before
and independent of GitHub (`src/live/build-probe.ts`, written to the untracked
`.generated/hosting.json` and embedded by Vite). Providers come from each
app's public build-info, probed from the build machine (outside Cloudflare).
The migration list and paths are the repo's base-path registry
(`ONE_ORIGIN_APP_BASE_PATHS` in `packages/utils/src/app-mounts.ts`); an app
counts as moved only when its subdomain redirects navigations to its
`tuturuuu.com` path, and as in progress when its own Worker already answers
there. A build that cannot observe (for example `ROADMAP_OFFLINE=1`) shows
every value as not verifiable, with that build's time; the page never shows a
provider or migration value from an earlier build. The hosting section shows
Cloudflare's official web badge, unaltered (`src/assets/brands`).

`GET|HEAD /roadmap/api/hosts` probes the fixed allowlist in
`src/live/host-probe.ts` (request input never selects a host), with manual
redirects, a 4-second timeout and a 16 KiB body bound. It returns only
`{ app, platform, commit }` per app, with `private,no-store`. One isolate
shares a result for 60 seconds, so bursts fan out at most once a minute.

The shipped feed (`src/live/feed.ts`) publishes merged PR titles only when
they are `feat`/`perf` in a public product scope and contain no incident,
security, customer or internal-plumbing wording. `src/content/title-denylist.ts`
keeps a hashed-term hook but is intentionally empty: hashes of short names are
guessable, so client names are never shipped, even hashed.

```sh
GITHUB_TOKEN=$(gh auth token) bun run --cwd apps/roadmap data:refresh
node --test apps/roadmap/src/roadmap-data.test.ts
```

`src/roadmap-data.test.ts` (D79) covers the validator, status engine, content
guards, the approved plan copy, feed safety (including a denylist and hashed
names), freshness merging and the host probe. Each guard has a broken variant
that must fail.

## Shipping pulse, production updates and patch notes

Every figure comes from the same public sources, derived at build time and in
the page (`src/insights`); anything not observed reads "not available", never
zero or an earlier build's value.

- **Two scopes, labelled.** *All merged PRs* are every merged pull request in
  tutur3u/platform without bots and dependency updates (the history rule).
  *Roadmap-tracked PRs* are the ones the deliverables list. The chart nests
  them: all, tracked, and tracked PRs production runs now, plus a 7-day
  moving average.
- **Build activity.** `scripts/generate-roadmap-data.mjs` writes the
  untracked `.generated/activity.json` (embedded by Vite like
  `hosting.json`, `src/insights/activity.ts`): each app's production build
  (commit and `builtAt` from its public build-info) and the merged PRs from
  the build's search window, as `[number, day, track]`. Anonymous search
  allows 10 requests a minute, so the window is 7 days without a token and
  14 with one; a capped search is flagged. Older days come from the history
  JSON, fetched when the pulse nears the viewport or a reader picks 30 or 90
  days. Offline builds observe nothing.
- **Tiles** compare this week with last week as flows (merged, shipped,
  newly live, newly waiting), with an icon, a signed figure and words.
- **Merge → production** is the median and p90 from merge to the production
  build serving a tracked PR now. Earlier deploys are not public, so it is an
  upper bound. Waiting work shows how long it has waited so far.
- **Recent production updates** list each app's production build, newest
  first, with the tracked work it runs and what waits for its next deploy,
  using the Live rule (deployed commit at or after the merge). A divider marks
  what is new since the reader's last visit (`localStorage`, optional).
- **Patch notes** render `.generated/changelog.json` from the changelog
  pipeline (validated by `parseChangelog` in `src/changelog/schema.ts`, the
  newest releases embedded by Vite) as plain text, with PR links built from
  numbers. A missing or invalid file hides the section.
- **Chart access.** Each day is a real button: hover, tap or arrow keys
  (Home, End, PageUp, PageDown) select it, a polite live region reads the
  day, and a visually hidden table holds every figure.

## Performance on low-end phones

Targets: Lighthouse mobile 90+, LCP under 2.5 s and interaction latency under
200 ms at 4x CPU throttling on all four public pages.

- **First paint first.** The Worker rewrites each document before hashing its
  inline scripts (`src/defer-hydration.ts`), changing attributes only: module
  preloads and the entry script stay in place but inert. The boot script
  (`src/boot/roadmap-boot.js`, an async hashed same-origin asset in `<head>`,
  so no inline script and no render blocking) sets lite mode before first paint and imports the bundle at
  the reader's first intent (pointerdown, touchstart, keydown or focusin) or
  within 1 s of the largest contentful paint. A tap on a button that is not
  hydrated yet shows as pressed at once and is replayed once React has
  hydrated it; links and `<summary>` work natively throughout. Each public
  page keeps exactly the router's four inline scripts (JSON-LD, theme,
  router bootstrap, stream boundary); the doctor fails a fifth or an
  unhashed one, and runs the canonical smoke against the built Worker.
- **History reference.** The roadmap head links the hashed history JSON as
  `rel="alternate" type="application/json"` (never fetched), which keeps its
  URL in the entry chunk where the canonical smoke finds it.
- **Small CSS.** `styles.css` excludes `packages/ui/src/components` and
  streamdown from Tailwind's class scan and lists the shell primitives it
  renders, which keeps the stylesheet near 20 KB compressed.
- **Fonts.** Heroes use only the preloaded 500/600 weights. The mono labels
  use a 17 KB subset of JetBrains Mono (`src/assets/fonts`; the rebuild
  command is in `styles.css`) instead of the 114 KB variable font.
- **Effects by tier.** Phones, screens under 1024px and low-end devices get
  flat surfaces. `src/lite-mode.ts` marks `html[data-lite]` before first paint
  when a device reports four or fewer cores, 4 GB or less of memory, or Data
  Saver. Backdrop filters, blend modes and infinite animations exist only
  for `:root:not([data-lite])` at 1024px and wider (infinite animations also
  need `prefers-reduced-motion: no-preference`). Below-the-fold sections use
  `content-visibility: auto`.
- **Split hydration.** Sections below the hero (each track card, the
  timeline, each EduFest section) sit in `<Suspense>` boundaries. Nothing
  suspends, so the server renders them complete (the doctor fails a pending
  `<!--$?-->` boundary); React hydrates them one at a time, yielding between
  them and starting with the one a reader taps.
- **Document size.** The doctor fails any public page over half of
  `MAX_DOCUMENT_BYTES` and prints each page's margin. Past that limit the
  CSP cannot hash inline scripts; the Worker then serves the page as
  rendered, without executable inline scripts (JSON-LD stays), so its
  external module entry still loads and no unhashed script is sent.
- **Small renders.** The status filter is local, deferred state over memoised
  track cards; the navbar dock re-renders only the shell; the timeline
  scrubber renders 24 chips around the selected period; each deliverable's
  status glyph is a CSS mask, not an inline SVG.

`src/perf.test.ts`, `src/hydration-loader.test.ts` and `src/a11y.test.ts` (D79, run via
`src/roadmap-data.test.ts`) guard each rule with a broken variant;
`src/css-guards.ts` checks the stylesheet.

## Content-Security-Policy

`src/csp.ts` attaches a CSP to every HTML response from the SSR handler.
`script-src` is `'self'` plus the sha256 of each inline script in that exact
response (theme bootstrap and TanStack stream bootstrap; the stream bootstrap
changes per request, so hashes are computed per response). There is no
`'unsafe-inline'`, `'unsafe-eval'` or nonce (the document is publicly
cacheable). Scripts injected after the Worker, including Cloudflare's
edge-injected JavaScript detections, are blocked. Other directives:
`default-src 'self'`, `style-src 'self' 'unsafe-inline'` (inline styles cannot
run script; SSR bar widths and the marketing shell's runtime scroll-lock style
need it), `img-src`/`font-src 'self' data:`,
`connect-src 'self' https://api.github.com`, `object-src 'none'`,
`base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'self'` and
`upgrade-insecure-requests`. The pre-seal doctor fails if any SSR inline
script is not allowed or `script-src` is broader; a source test keeps raw-HTML
and dynamic-code sinks out of `src`.

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
`https://tuturuuu.com/roadmap` plus the same path and query, with no trailing
slash, in one hop (`/` becomes `/roadmap`). `https://tuturuuu.com/roadmap` (no
slash, the Tuturuuu-wide canonical form) serves the app; `/roadmap/` and any
`/roadmap/x/` return 301 to the no-slash form with the query kept. English is
unprefixed (Vietnamese is `/roadmap/vi`), so old English links `/roadmap/en`
and `/roadmap/en/<rest>` return 301 to `/roadmap` and `/roadmap/<rest>`, and
the satellite's `/en/<rest>` goes straight there in its one hop; only an exact
`en` segment matches (`/roadmap/english` is untouched). Internally
the Worker hands `/roadmap` to the SSR handler as the router's basepath root
`/roadmap/`, and the client restores `/roadmap` in the address bar after
hydration. `GET` and `HEAD`
`/roadmap/api/build-info` (and `/api/build-info` on the canonical host) return
the build commit as JSON and are not cached. workers.dev keeps the `/roadmap`
mount: root returns 301 to `/roadmap` with the query preserved, and outside-prefix requests return 404. A loopback request whose
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

The canonical page is https://tuturuuu.com/roadmap (no trailing slash; the
canonical link, `og:url` and hreflang alternates all use it).
`https://tuturuuu.com/roadmap/` and `https://roadmap.tuturuuu.com/roadmap` each
redirect once, directly to that URL. The satellite host only redirects there. The release owner must reconcile
any existing zone redirect with this contract and capture routing preimages
before a hosted rollout.
No DNS, zone, provider or deployment operation follows from source publication.
Before sealing, `scripts/pre-seal-doctor.mjs` serves the built Worker on
loopback with `Host: tuturuuu.com` (200, Tuturuuu branding, the five status
labels and the approved plan card, public HTML cache, immutable hashed asset) and `Host:
roadmap.tuturuuu.com` (301 straight to `https://tuturuuu.com/roadmap`). It
asserts the no-slash canonical, `og:url` and hreflang, and that every slash
and satellite form reaches the canonical in exactly one 301 (`REDIRECT_CHAINS`), and
reads `/roadmap/api/build-info` for `ROADMAP_SOURCE_SHA`. It also runs
`scripts/ci/asset-smoke.mjs`: every CSS, JS, font, `<img>` and icon-link URL
referenced by the canonical and satellite documents must return 200 with the
matching MIME type on `tuturuuu.com`, and images must be non-empty. The brand
logo and favicon ship inside the mount (`src/assets/tuturuuu-logo.png`, served
as a hashed `/roadmap/assets/` file) rather than from the apex `/media` path,
and the doctor requires that mounted logo. The same checker must reject a broken variant, including a
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
GET/HEAD HTML at `https://tuturuuu.com/roadmap` and
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
