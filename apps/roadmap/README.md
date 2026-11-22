# Tuturuuu public roadmap

The public product roadmap at https://tuturuuu.com/roadmap/, served by TanStack
Start, Vite+ and Void on Cloudflare Workers. The canonical app mount is
`/roadmap`; assets and server-function URLs use the same prefix. The provider
asset base is root (omitted in source); the post-build packaging step moves
client files beneath `dist/client/roadmap/`. Thus `/roadmap/assets/example.js`
maps to the physical `dist/client/roadmap/assets/example.js` through the
`ASSETS` binding. Wrangler must be at least 4.148.0. The Worker's
`compatibility_date` (`void.config.ts`) stays at or below the newest date the
locked dev workerd supports, or `vp dev` refuses to start;
`scripts/dev-runtime.test.mjs` checks it against the workerd that
`@cloudflare/vite-plugin` resolves through `void` and miniflare. There are no accounts,
database bindings, analytics, forms, provider credentials or private fleet
dependencies.

The page source (pages, components, content, live data, insights, history,
changelog, styles, messages and their tests) lives in the shared workspace
package `@tuturuuu/roadmap-core` at `packages/roadmap-core`, so the marketing app
can render the same pages. This app keeps the Worker (`src/worker.ts`), the
router and routes, the build and release scripts, and the route-level tests.
Build-time observations land in the untracked `packages/roadmap-core/.generated/`.

## Page layout and tabs

A compact summary (the live production commit, when the public data was read,
labelled Snapshot, Live or Snapshot only for the data on screen, and four
headline figures) sits above five tabs, the shared `@tuturuuu/ui` Tabs:
**Overview** (status bar, every track at a glance, coming soon, the latest
production updates), **Tracks** (milestones, deliverables and the timeline),
**Activity** (shipped this week, the shipping pulse, commits per product, the
product-by-day heatmap, the release train, every production update, patch
notes), **Releases** (each store's status, dates, listing and screenshots)
and **Tech stack** (the move to TanStack Start on Cloudflare, hosting and the
move to tuturuuu.com).

`packages/ui/src/components/ui/custom/hash-tabs.tsx` (HashTabs) renders every
panel on the server (`forceMount`), so crawlers, no-JS readers, structured
data and the live refresh cover all of them. Each trigger is an anchor to
`#tracks`, `#activity`, `#releases` or `#stack`, so it works as a link before
hydration; `packages/roadmap-core/src/styles/tabs.css` shows the panel the
fragment names, or the panel holding the element it names (older links such
as `#progress`, `#infrastructure`, `#pulse` or `#track-cms` still land), with
`:target` and `:has()`, and the tab list shows the same selection. Where
`:has()` is unsupported every panel shows until hydration. After hydration the
Tabs root carries `data-ready` and the selected tab is derived on every render
from the router location and nothing else
(`packages/roadmap-core/src/components/tab-model.ts`): a tab id (or an alias of
an earlier layout) selects itself, an id inside a panel selects that panel's
tab, and anything else selects Overview. A tab click navigates through the
router (a key replaces the history entry, a click pushes one) with
`resetScroll: false` and `hashScrollIntoView: false`, so the page does not
scroll; a link into another tab's section opens the tab and scrolls to the
section. Modified clicks keep the native link. Radix provides the roles,
`aria-selected`, `aria-controls` and the arrow, Home and End keys.
`packages/ui/src/components/ui/custom/hash-tabs.test.tsx` drives it with a
fragment-based location (click, back and forward, keys) and
`packages/roadmap-core/src/tabs.test.ts` pins the fragment rule. The skip link
targets `#sections` (focusable with `tabindex="-1"`); once hydrated it focuses
the selected tab and keeps the URL. Known limit: before hydration, following it
selects Overview. `scripts/doctor-tabs.mjs` checks the built page's tab markup.

## Charts, heatmap and screenshots

Every chart uses the shared chart components, so each has a tooltip on hover,
focus and tap, a legend and quiet axes from the Sorbet tokens:

- `ChartBars` (`@tuturuuu/ui/chart-bars`, on `ChartContainer`, `ChartTooltip`
  and `ChartLegend`): the shipping pulse (stacked, with the 7-day average as a
  line and the day's products in the tooltip) and commits per product
  (horizontal). Arrow keys move the tooltip between categories.
- `ChartHeatmap` (`@tuturuuu/ui/chart-heatmap`): commits per product and day.
  One tooltip follows hover, focus and tap; arrow keys, Home and End move
  between cells, each of which is named "product, day: value". Wide grids scroll
  under sticky row labels. Cells are 24px with 4px between them (WCAG 2.5.8's
  spacing rule); a dense grid cannot hold 44px cells.
- Recharts is a separate chunk (`components/ds/lazy-chart.tsx`): a chart is a
  fixed-size skeleton until it is within 240px of the viewport, then loads.
  Each chart also has its figures in a visually hidden table
  (`ChartCard`/`ChartTable`), which keeps the server HTML complete.

The Releases tab (`components/store-releases.tsx`, `components/ds/store-*.tsx`)
shows each store as one compact row: its glyph, status, version and build, a
slim submit, review and release bar with the dates (targets marked as plans)
and two decorative thumbnails. A row opens the store in a near-full-screen
dialog (`ds/store-dialog.tsx`, a full-screen sheet on phones, loaded on the
first open) on `@tuturuuu/ui` Dialog and Tabs: Overview (status, the five
release dates, version and build), Screenshots (a captioned grid per device
class), Store listing (every listing field with copy buttons), What's new and
Availability. The store and tab live in the URL (`?store=ios&tab=screenshots`,
`ds/use-store-dialog.ts`), so a link opens the dialog on that tab and Back
closes it: opening pushes a history entry marked in its history state, a tab
replaces it and keeps the mark, and closing a marked entry goes back (also
after Forward or a reload). Closing a dialog the reader landed on drops the
two params in place and shows the Releases tab when the link named no other
section. Focus starts on the selected tab and returns to the store's row, or
to the page's selected tab while the row is hidden.

A screenshot thumbnail opens `MediaPreviewDialog`
(`@tuturuuu/ui/custom/media-preview-dialog`, on `Dialog`, loaded on the first
open): focus is trapped and returned to the thumbnail, Escape closes, Left and
Right, swipes and edge buttons move between screenshots, + and - (or the
buttons or a double tap) zoom and a drag pans, and the caption names the
screenshot, store, device and language. Thumbnails keep a skeleton until
decoded (a `span`, valid inside the row's button). Captions, device, language
and listing text come from `apps/mobile/store` (`content/store-releases.ts`).

## Design tokens (Sorbet)

The roadmap uses the default Sorbet palette from `@tuturuuu/ui`. Its root
document renders `<html data-ui="sorbet">` for `/roadmap` and `/roadmap/vi`
(`packages/roadmap-core/src/sorbet-page.ts`, set in the server HTML, no script), so
`packages/ui/src/sorbet.css`, which the page already ships through the
shared `globals.css`, remaps the shared semantic tokens: light from its
`:root[data-ui="sorbet"]` block, dark from `.dark`. Nothing is copied, so the
stylesheet does not grow. `packages/roadmap-core/src/styles/tokens.css` maps the page's own tokens
onto Sorbet's stable names:

| Roadmap token | Sorbet source |
| --- | --- |
| `--rm-bg`, `--rm-panel` | `--background` (warm white), `--card` (white) |
| `--rm-ink`, `--rm-muted` | `--foreground`, `--muted-foreground` |
| `--rm-line`, `--rm-soft`, `--rm-ring` | `--border`, `--accent`, `--ring` |
| `--rm-live`, `-sync`, `-merge`, `-progress`, `-planned` (and `*-text`) | status inks `--green`, `--teal`, `--purple`, `--orange`, `--gray` |
| `--rm-*-fill` (badges, the emphasised figure, empty-state icons) | `--calendar-bg-green`, `-cyan`, `-purple`, `-orange`, `-gray` |
| `--rm-radius-sm`, `--rm-radius`, `--rm-radius-lg` | `--radius` (12px), `--radius-xl` (18px cards), `--radius-2xl` (24px) |
| `--rm-shadow` (every card) | `--sorbet-shadow-sm` |
| `--rm-wash-1`, `--rm-wash-2` (hero wash) | `--calendar-bg-pink`, `--calendar-bg-blue` |
| `--rm-chart-muted` (all-PR bars and swatch, product bars) | `--gray` mixed into `--card`: 70% light, 55% dark (opaque) |
| `--rm-chart-workers-edge` (1px edge on the Cloudflare-orange Workers segment) | `--orange` |

Sorbet has no type or spacing tokens yet, so `tokens.css` also holds one type
scale (`--rm-text-xs` 12px to `--rm-text-h1`) and one spacing rhythm
(`--rm-space-1` 4px to `--rm-space-8` 64px) used by the hero, the tab bar and
every panel. The workshop pages share the stylesheet without Sorbet and keep
the earlier mapping (the first block in `tokens.css`).
`packages/roadmap-core/src/sorbet-tokens.test.ts` pins both default Sorbet blocks byte for byte,
allows only the stable Sorbet names, and checks every text pair the page
draws for WCAG AA (4.5:1; focus ring and status marks 3:1) in light and dark,
so a Sorbet change fails CI here until the roadmap is reviewed against it.
It also composites every pulse-chart mark (all PRs, tracked, in production,
the moving average and the no-data outline) over the card and over the chart's
cursor band (`--accent` at 60%) and requires 3:1 (WCAG 1.4.11) in both modes;
stacked series also have a card-coloured edge, so they never rely on colour
alone. The cursor band is a highlight behind the hovered day, not a mark: it
makes no 3:1 claim, and the marks stay at 3:1 or more on top of it.

Every control is at least 44 x 44 CSS px on every pointer
(`packages/roadmap-core/src/styles/targets.css`): compact controls keep their look and gain an
invisible, centred hit area inside the control; rows that scroll sideways
(the track chips and the status filters) get room inside them for those hit
areas, and stacked rows open up so no two hit areas overlap. Docked into the
44px compact navbar, the chip row is a 44px scroll row 4px inside the header
and each chip's hit area spans it. The shared tabs and segmented filters keep their look and gain the same hit
area; the charts take the pointer as one surface (a tap or a hover selects the
category under it) and keep keyboard and screen-reader use through Recharts'
accessibility layer and the hidden table. The only exceptions are inline
targets under WCAG 2.5.8: PR numbers inside a metadata line and links in
running text. The shared marketing shell's own controls are measured but
owned by `packages/marketing-shell`.

Empty and unknown states share one component (`packages/roadmap-core/src/components/empty-state.tsx`):
a build that could not check hosting, no patch notes, no production updates, a
filter with no deliverables and a timeline period with nothing merged each say
what is missing and why, in English and Vietnamese, with no placeholder data.

## Content and status

`packages/roadmap-core/src/content/tracks.ts` is the curated roadmap: tracks → milestones →
deliverables. Each deliverable lists the public PRs in tutur3u/platform that
deliver it, or the full SHAs of the commits on main that deliver it for work
that landed without a pull request (`commits`), and the app whose production
deploy must contain them. Status is never written by hand;
`packages/roadmap-core/src/live/status.ts` derives it from evidence:

| Status | Rule |
| --- | --- |
| Live | Every PR merged and the app's deployed commit is at or after the last merge on main. Hosting moves (`requires: 'workers'`) need the app's probe to answer from Workers. Mobile needs the latest `mobile-v*` release tag to contain the merge. Items with no deploy target are live once merged. |
| Waiting for prod sync | Merged; production does not contain it yet, or the deploy cannot be verified publicly. |
| Commit evidence | A deliverable that cites commits reads as Waiting for prod sync with the note that its deploy can't be verified publicly, once the build (`scripts/commit-log.mjs` `readCitedCommits`, written to `.generated/evidence.json` and embedded only when it was read from the build's own source commit) found every cited commit on main (on the checkout's history and on `origin/main`; a checkout without that ref gives no evidence). A commit proves the merge, never a deploy: no public probe ties a commit to what each service serves, so a commit-cited deliverable is never Live and its note, in Tracks and in the timeline, never promises an app release or names a host. A cited commit the build did not find keeps the curated fallback. |
| Waiting for merge | Every unmerged PR is open, not draft and approved. |
| In progress | Any other open PR, or curated `fallback: 'in_progress'` with no PR. |
| Planned | No public evidence. No claims. |

`packages/roadmap-core/src/content/coming-soon.ts` holds approved announcement copy only; change it
only with an approved replacement. Never add private products, client names,
security incidents, operational notes or tokens to content.

## Timeline and full history

`scripts/generate-history.mjs` (run by `build`, `build:cloudflare` and
`data:refresh`, with `GITHUB_TOKEN`) reads every merged PR in tutur3u/platform
since the first one (October 2022), drops bots and dependency churn, and
classifies each into a public track and a kind (feature, fix, maintenance) in
`packages/roadmap-core/src/history/classify.ts`. Titles are published only for user-facing features in
a public product track that pass the incident/security/customer, plumbing and
internal-implementation filters; everything else (including client work) is
counted, never titled. The result, with per-week/month/year aggregates
(`packages/roadmap-core/src/history/build.ts`, validated by `parseHistory`), is committed as
`packages/roadmap-core/src/generated/history.json` and emitted as a hashed, immutable asset that the
page fetches only when the timeline comes within 600px of the viewport
(`packages/roadmap-core/src/history/lazy-load.ts`); it is never prefetched. Without a token the
committed file is kept. `data:refresh` then runs
`scripts/format-generated.mjs`, which rewrites `live.json` and `history.json`
with the root-pinned oxfmt so the refreshed snapshot passes `oxfmt --check`;
it stops when oxfmt is not installed at the pinned version. Curated deliverables absorb their PRs, so each shows once in its period.
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
   `packages/roadmap-core/src/generated/live.json`. `GITHUB_TOKEN`/`GH_TOKEN` is optional and only
   lifts the anonymous rate limit; it is never written. If GitHub fails, the
   previous file is kept with its own timestamp. `ROADMAP_OFFLINE=1` skips the
   refresh.
2. **In the browser.** Once the page has loaded, the tab is visible and the
   main thread is idle (`packages/roadmap-core/src/live/defer.ts`), the page refreshes from the
   public GitHub API (unauthenticated, the viewer's own quota: four search
   calls, the most recently updated PRs only, see `LIVE_SEARCH`) and from
   `GET /roadmap/api/hosts`, then every 30 minutes while visible. A 403 or
   429 from GitHub pauses refreshes for 30 minutes. Fresh data renders as a
   React transition, so it never blocks input. One validated snapshot, bounded
   to 1,000,000 characters and keyed by this deployment's source SHA, is stored
   in `localStorage` with its observation timestamp. At thirty minutes, a
   future timestamp, a different build, missing/malformed storage or a failed
   refresh, the page uses the current build snapshot and its timestamp. A
   failed network refresh displays "Live check unavailable". Runtime data is
   merged only against this build; older runtime facts cannot accumulate.
   Failed, missing, unknown or incomplete runtime host probes fail the entire
   refresh; retained build host facts never acquire a new observation time.
   The existing five-minute clock checks expiration, and the existing poll
   performs refreshes; no additional timer or endpoint is required. Hidden
   tabs do not poll, so this is a visible-page cadence, not a scheduled job.
   Hosting classifications, migration observations, activity history and patch
   notes retain their build-owned provenance: the Workers and Vercel provider
   counts come from `BUILD_HOSTING` (`packages/roadmap-core/src/live/build-hosting.ts`) and change
   only with a new build. `packages/roadmap-core/src/live/runtime-refresh.test.ts` covers clock
   boundaries, storage bounds, malformed data and build fallback.

**Hosting and the move to tuturuuu.com** are observed on every build, before
and independent of GitHub (`packages/roadmap-core/src/live/build-probe.ts`, written to the untracked
`packages/roadmap-core/.generated/hosting.json` and embedded by Vite). Providers come from each
app's public build-info, probed from the build machine (outside Cloudflare).
The migration list and paths are the repo's base-path registry
(`ONE_ORIGIN_APP_BASE_PATHS` in `packages/utils/src/app-mounts.ts`); an app
counts as moved only when its subdomain redirects navigations to its
`tuturuuu.com` path, and as in progress when its own Worker already answers
there. A build that cannot observe (for example `ROADMAP_OFFLINE=1`) shows
every value as not verifiable, with that build's time; the page never shows a
provider or migration value from an earlier build. The Cloudflare Workers
group and legend show Cloudflare's official cloud mark, unaltered, where the
Vercel group shows its triangle (`packages/roadmap-core/src/assets/brands/CLOUDFLARE-MARK.md`).

`GET|HEAD /roadmap/api/hosts` probes the fixed allowlist in
`packages/roadmap-core/src/live/host-probe.ts` (request input never selects a host), with manual
redirects, a 4-second timeout and a 16 KiB body bound. It returns only
`{ app, platform, commit }` per app, with `private,no-store`. One isolate
shares a result for 60 seconds, so bursts fan out at most once a minute.

The shipped feed (`packages/roadmap-core/src/live/feed.ts`) publishes merged PR titles only when
they are `feat`/`perf` in a public product scope and contain no incident,
security, customer or internal-plumbing wording. `packages/roadmap-core/src/content/title-denylist.ts`
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
the page (`packages/roadmap-core/src/insights`); anything not observed reads "not available", never
zero or an earlier build's value.

- **Commits to main lead.** Work lands on main directly, so the Activity tab
  counts commits first. `scripts/commit-log.mjs` reads first-parent commits
  to main over 90 days from the build checkout (`fetch-depth: 0`,
  `filter: blob:none`, `--no-renames`, so no file contents are fetched) and
  marks each in production when `origin/production` or an observed app
  build contains it. `packages/roadmap-core/src/insights/commits.ts` counts
  them per Vietnam day and product (`apps/<dir>/` paths first, then the
  conventional scope, then tooling paths as developer tools) into
  `activity.json`; only counts leave the build, never subjects, authors or
  paths. Bots, releases and dependency updates are dropped; a squash
  `(#123)` or a pull-request merge counts as via a pull request. The tiles
  show shipped this week (landed in the last 7 days and in production now),
  commits this week against last, commits waiting for production with the
  oldest one's age, and the direct-to-main share. The pulse defaults to
  commits (in production under waiting, 7-day average, totals, breakdown);
  a switch shows the pull-request view below as the earlier flow. A shallow
  checkout writes no commit window, and the tab falls back to the
  deliverables tile and the pull-request pulse.
- **Two scopes, labelled.** *All merged PRs* are every merged pull request in
  tutur3u/platform without bots and dependency updates (the history rule).
  *Roadmap-tracked PRs* are the ones the deliverables list. The chart nests
  them: all, tracked, and tracked PRs production runs now, plus a 7-day
  moving average.
- **Build activity.** `scripts/generate-roadmap-data.mjs` writes the
  untracked `packages/roadmap-core/.generated/activity.json` (embedded by Vite like
  `hosting.json`, `packages/roadmap-core/src/insights/activity.ts`): each app's production build
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
- **Patch notes** render `packages/roadmap-core/.generated/changelog.json` from the changelog
  pipeline (validated by `parseChangelog` in `packages/roadmap-core/src/changelog/schema.ts`, the
  data.ts Vite glob embedding) as plain text, with PR links built from
  numbers. Fallback output has a visible label; model output names its model.
  Release dates use Vietnam calendar days. Release details mount when opened,
  keeping the initial document small even for large fallback releases. A missing, invalid or empty file
  hides the section and leaves production updates in a single column.
- **Chart access.** Hover, tap or the arrow keys open a day's tooltip, and a
  visually hidden table holds every figure.

## Performance on low-end phones

Targets: Lighthouse mobile 90+, LCP under 2.5 s and interaction latency under
200 ms at 4x CPU throttling on all four public pages.

- **First paint first.** The Worker rewrites each document before hashing its
  inline scripts (`packages/roadmap-core/src/defer-hydration.ts`), changing attributes only: module
  preloads and the entry script stay in place but inert. The boot script
  (`packages/roadmap-core/src/boot/roadmap-boot.js`, an async hashed same-origin asset in `<head>`,
  so no inline script and no render blocking) sets lite mode before first paint and imports the bundle at
  the reader's first intent (pointerdown, touchstart, keydown or focusin) or
  within 1 s of the largest contentful paint. A tap on a button that is not
  hydrated yet shows as pressed at once and is replayed once React has
  hydrated it; links, `<summary>` and popover buttons work natively
  throughout.
- **Explanations on demand.** Long explanations (how statuses are computed,
  section intros, migration rules, pulse scopes) sit behind (i) buttons, and
  status and metric labels carry definition tooltips (`packages/roadmap-core/src/components/info.tsx`).
  Both are native HTML popovers (`popovertarget`): their text is in the server
  HTML, a tap, Enter or Space opens them before hydration and without
  JavaScript, Escape or a tap elsewhere closes them, and they open in the top
  layer, so nothing moves. (i) buttons are named disclosures
  (`aria-expanded`, `aria-controls`); tooltip triggers are buttons described by
  their tooltip (`aria-describedby`) that also open on hover and focus. The
  doctor checks this markup on the built page (`infoPopoverFailures`). Each public
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
  use a 17 KB subset of JetBrains Mono (`packages/roadmap-core/src/assets/fonts`; the rebuild
  command is in `styles.css`) instead of the 114 KB variable font.
- **Effects by tier.** Phones, screens under 1024px and low-end devices get
  flat surfaces. `packages/roadmap-core/src/lite-mode.ts` marks `html[data-lite]` before first paint
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

`packages/roadmap-core/src/perf.test.ts`, `packages/roadmap-core/src/hydration-loader.test.ts` and `packages/roadmap-core/src/a11y.test.ts` (D79, run via
`src/roadmap-data.test.ts`) guard each rule with a broken variant;
`packages/roadmap-core/src/css-guards.ts` checks the stylesheet.

## Content-Security-Policy

`packages/roadmap-core/src/csp.ts` attaches a CSP to every HTML response from the SSR handler.
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
without deployment credentials. Every push to `production` builds the exact
production SHA through `workflow_call` and republishes it with
`serving-workers-production.yaml`
(see [Serving Worker republication](../docs/build/devops/serving-workers-publication.mdx)).
For a manual release artifact, dispatch `roadmap-cloudflare.yaml` on `main` with `source_sha` equal to the
reviewed merged commit. The workflow checks out its triggering `github.sha` and
rejects a mismatching requested source before checkout or dependency execution.
A moved main requires fresh exact-source qualification rather than a silent rebuild.

The Void plugin precedes the Start and React plugins. Vite asset base, Start
basepath and the router basepath all match `/roadmap`. Before production traffic,
verify the emitted Worker and client artifacts, the exact source SHA and account,
and the `tuturuuu.com/roadmap*` route against the existing zone route set.
The terminal wildcard covers queries on the bare mount. The Worker sends
sibling paths such as `/roadmapping` to the zone origin.
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

The serving-worker publisher, or a release owner running it, converts the
sealed prebuilt artifact to cf Build Output and uploads it with the cf CLI. Publication must not rebuild it with Void deploy.
A configured Worker name does not establish target identity or authentication.

Hosted acceptance must build the exact source, inspect the emitted configuration
and physical client tree, create a fresh Linux descriptor seal, and exercise root
and bare-mount query responses, slash redirects, outside-prefix rejection, SSR, assets and server
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
logo and favicon ship inside the mount (`packages/roadmap-core/src/assets/tuturuuu-logo.png`, served
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

`packages/roadmap-core/src/cache-policy.ts` composes headers after the native response. Only successful
GET/HEAD HTML at `https://tuturuuu.com/roadmap` and
`https://roadmap.tuturuuu.com/`, without query variants, receives
`public,s-maxage=300,stale-while-revalidate=86400`. A renderer default of
`private` or `no-store` does not keep that document private: the page has no
actor. Cookie-bearing requests do not select a different document or read
identity. `packages/roadmap-core/src/public-cache-guard.ts` fails the cache test if `src` imports
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
