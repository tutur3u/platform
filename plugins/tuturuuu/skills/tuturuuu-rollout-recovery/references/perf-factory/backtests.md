# Backtests

Historical incidents replayed through the investigate stage as dry runs. Each
entry lists what the detector and the procedure in `../perf-forensics.md` would
have produced, the reproducible queries, and the gaps the replay exposed. Add an
entry after each resolved regression and rerun old entries when the detector
rule or the stage prompts change.

## 2026-11-20 Forms Worker rollback (05:29 ICT)

- Signal: Forms p95 TTFB 980 ms against a 913 ms trigger; the Worker was
  rolled back at 2026-11-19T22:29Z (05:29 ICT).
- Detector replay: `node scripts/perf/perf-regression-detector.mjs --apps forms
  --fixture scripts/perf/fixtures/forms-rollback-2026-11-20.json`. The fixture
  is reconstructed: the 763 ms baseline follows from the recorded trigger
  (913 = 763 + 150, which is below 1.25 x 763 = 954), 980 ms is the recorded
  p95, and window shapes and the candidate deploy time are placeholders. The
  detector reports one `p95_ttfb_ms` regression with trigger 913, observed
  `[980, 994]`, and the candidate deploy as the suspect. With 15-minute windows
  a page arrives 30 minutes after onset (two closed windows), about when the
  manual rollback happened; 5-minute windows cut that to 10 minutes at the cost
  of noisier per-window p95 values.
- What changed: `git log --format='%h %cI %s' b1f7f8f163..ca85cdec50 --
  apps/forms packages/start-bridge` lists the Forms and start-bridge changes
  before the rollback (mount-scoped assets, default icon in app mounts, apex
  favicon and metadata asset catalog).
- Hypotheses and outcome of the dry run:
  - H1 duplicate share lookups (supported by code): metadata generation and the
    landing render each called the shared-form loader, so a `/f/<code>` render
    made two `form_share_links` reads. `5b1c59e3b0` memoizes the lookup per
    request and its runtime test asserts one lookup per render. Live
    confirmation needs the `worker-versions` query comparing
    `subrequests / requests` between the rolled-back and baseline versions.
  - H2 cold-root latency (open): needs the `worker-versions` wall/CPU split and
    a cold versus warm probe of the mount root with `app-switch-lab.mjs ttfb`.
  - H3 static asset revalidation (partly supported): fingerprinted assets were
    not marked immutable; `5b1c59e3b0` adds
    `public, max-age=31536000, immutable`. Check the `x-gateway-cache` HIT
    share for `/forms/assets/*` before and after.
- Expected adversarial review result: send back, because H1 is supported by code
  but not by production subrequest counts, and H2 is unsettled.
- Gaps: no Cloudflare analytics token was available on the replay host, so the
  stored queries were not run live; the exact rolled-back version ID and its
  SHA are not recorded in the repository. Worker version annotations should
  carry the source SHA so `suspects[].sha` is filled automatically.

## 2026-11-20 Vercel route-limit rejection of 629c5f5e57

- Signal: the production platform deploy for `629c5f5e57` failed at
  2026-11-19T22:44:46Z (05:44 ICT) with `Maximum number of routes (rewrites,
  redirects, etc) exceeded. Max is 2048, received 2053.` Production stayed on
  `d80690db49`.
- Detector replay: not detectable. This is a deploy-time rejection with no
  runtime latency or error change, so the latency detector stays silent. The
  dispatcher needs a second intake source: failed `vercel-production-platform`
  deployments and the route-budget CI step.
- Reproducible queries:
  - `gh api "repos/tutur3u/platform/deployments?environment=vercel-production-platform&per_page=20" --jq '.[] | [.created_at,.sha[0:10],.id] | @tsv'`
    gives the last accepted (`d80690db49`) and rejected (`629c5f5e57`) SHAs.
  - `gh run view <run-id> --log-failed | grep 'Maximum number of routes'`
    gives the count.
  - `git diff --name-status d80690db49 629c5f5e57 -- apps/web/src/app | grep -E '(route\.ts|page\.tsx)$'`
    finds four new route handlers across 93 commits (fleet smoke identities,
    education learner progress and quiz attempts, wallet checkpoint review).
- Diagnosis: route growth crossed Vercel's 2,048 routing-rule limit by 5; no
  single commit was at fault. Each App Router endpoint can emit more than one
  routing rule, so the source inventory undercounts the emitted rules.
- Fix that shipped: `4e63ab5444` consolidated legacy workspace routes into
  generated catch-all wrappers, and `294e935a4e` runs
  `scripts/ci/check-web-vercel-route-budget.js` (budget 1,948) in the
  production workflow. Production deployed `294e935a4e` at 23:57Z, 1 h 13 min
  after the rejection.
- Gap: the budget check reads emitted Vercel output, so it fails late in the
  deploy. A cheaper early signal is a trend line of the emitted route count per
  `main` commit, alerting when it passes the budget minus 50.
