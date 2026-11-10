# Roadmap lane handoff (2026-11-10)

Incomplete PR-B. This commit is a `wip:` checkpoint for a Claude successor. Do not merge it. Do not delete this worktree until you have pulled the branch and confirmed the files below are present.

## Binding

- Repo: `tutur3u/platform`
- Worktree (keep): `/Users/skora/.t3/scratch/roadmap-lane-20261110`
- Do not use `/Users/skora/Documents/GitHub/tuturuuu`
- Branch: `feat/roadmap-public-refresh-20261110`
- Base: `origin/main` `8d3f02d1ad3c57ad867a8586939c9aead928739b` (`fix(roadmap): canonical /roadmap/ redirect target and asset smoke (#8077)`)
- Upstream was unset on purpose after `checkout -b` from `origin/main`. The handoff push is `git push -u origin feat/roadmap-public-refresh-20261110` only.
- Commit only as `vhpx <contact@vohoangphuc.com>` from git config. No `Co-Authored-By`. DCO `Signed-off-by: vhpx <contact@vohoangphuc.com>` is allowed. No `--author` and no `GIT_AUTHOR_*` / `GIT_COMMITTER_*` overrides.
- Pax merges. This lane does not merge and does not watch the PR.
- A workflow, auth, or migration change needs Selene's exact-head receipt before Pax merges.

## Already on main (do not redo)

- PR-A `#8073` merged. Public roadmap Worker, satellite redirect, five stages, edge cache, pre-seal doctor.
- Guard follow-up `#8074` merged.
- PR-A2 `#8077` squash-merged as `8d3f02d1ad`. Asset smoke is `scripts/ci/asset-smoke.mjs`. Canonical mount is `/roadmap/` with one hop. This WIP does not change those files.
- Rex attached the apex routes to the roadmap Worker. Styled page, assets 200, one hop. Do not treat a CSS 404 or a 301-to-308 chain as the current production failure.

## What this commit contains

Not compiled, not tested, not typechecked in this handoff. Treat it as a partial patch.

1. Wrangler ratchet admission for `apps/roadmap/.gitignore`.
   - Both ignore lines stay: `.void-wrangler.jsonc` and `.wrangler/`.
   - Allowlist `scripts/ci/wrangler-usage-allowlist.json`: lines 2, uses 2, gap `void-wave1-publication`.
   - Digest `c7a29cb275ea3b1127101f9a286ac3edb5127408dd5a4785094fde01b11c9090` (sha256 of the two trimmed matching lines joined by newline).
   - `admitted.decision` is still `https://github.com/tutur3u/platform/pull/8073` (the PR that added the second line). After the successor opens the PR, change only that decision URL to the new PR. Counts and digest stay. Equal admitted objects do not authorize growth. The guard compares locally against `merge-base HEAD origin/main`, and in GitHub Actions against `HEAD^1`.
   - `scripts/ci/wrangler-usage-guard.test.js` was not run after the edit.

2. Optional public host observation on migration evidence.
   - `apps/roadmap/src/host-probe.ts`: `publicProbeUrl` and `classifyProbeResponse`.
   - Roadmap probe URL is `https://tuturuuu.com/roadmap/api/build-info`. Every other public product is `https://<id>.tuturuuu.com/api/build-info`.
   - `x-vercel-id` (non-empty) means `vercel` and commit stays null. Workers means HTTP 200, `content-type` contains `application/json`, and `commit` or `commitHash` is 40 hex. Anything else is `unknown`. The classifier returns only platform and commit.
   - `apps/roadmap/src/migration-evidence.ts`: `HostObservation`, `emptyEvidence.host = null`, `parseHost`, `parseEvidence` allows a missing `host` and rejects any other extra key. `deriveStage` takes an optional fifth argument `sourceCommit` (default null). A base stage of `live` stays `live`. A fresh Workers host whose commit equals `sourceCommit` becomes `live`. A fresh Workers host with a different commit becomes `waiting_for_production_sync`. Vercel and unknown do not override the base stage. A stale host (over 24h, or in the future) does not override.
   - `apps/roadmap/src/roadmap-data.ts`: `parseSnapshot` passes `sourceCommit` into `deriveStage`. Evidence label `Deploy readback` is accepted only when the URL equals `stageEvidence.host.url`.
   - `apps/roadmap/scripts/refresh-snapshot.mjs`: the same fifth `deriveStage` argument. It does not yet add the Deploy readback link, and it still has no network fetch.

## Data sources wired so far

Wired in code, not executed:

- Probe URL function only. No live fetch is in the tree.
- Classification reads status, `content-type`, `x-vercel-id` presence, and a JSON `commit` / `commitHash`. It does not store header values or bodies.
- Recorded public inputs stay `apps/roadmap/evidence/public-inputs.json` (schemaVersion 2). Existing rows: playground `#7647`, shortener `#7788`, roadmap `#7797`. Do not regenerate the committed `apps/roadmap/src/snapshot.json` for this handoff. Optional `host` keeps that file valid: `parseEvidence` adds `host: null` in memory when the key is absent.
- Do not import `scripts/ci/wave1-native-profiles.json`. It holds account IDs, zone IDs, and secret names.

Not wired:

- GitHub API refresh of those three PRs.
- Search for merged PRs labeled `public-roadmap`.
- Host probes against the public URLs.
- `apps/roadmap/scripts/collect-public-snapshot.mjs`.
- Hourly workflow and the non-PR step on `.github/workflows/roadmap-cloudflare.yaml`.
- `tuturuuu.ci.ts` registration.

## Next steps for the successor

1. Pull this branch in this worktree. Confirm the commit, then this lane can drop the worktree only after that confirmation. Do not open a second worktree.
2. Run `node --test scripts/ci/wrangler-usage-guard.test.js` and `node --test apps/roadmap/src/roadmap-data.test.ts apps/roadmap/src/cache-policy.test.ts apps/roadmap/scripts/pre-seal-doctor.test.mjs`. Fix failures before adding the collector. `emptyEvidence` must keep `host: null` because `parseEvidenceInputs` deep-equals it.
3. Finish the public refresh as a pure module plus a thin CLI. Planned names: `apps/roadmap/src/public-refresh.ts`, `apps/roadmap/src/public-refresh.test.ts`, `apps/roadmap/src/host-probe.test.ts`, `apps/roadmap/scripts/collect-public-snapshot.mjs`.
4. Refresh only PRs already in `public-inputs.json`, plus new merged PRs that carry the label `public-roadmap` and exactly one of `migration-completion` or `root-assets-correction` (the latter only for roadmap). Preserve recorded scope, review, `reviewedHeadSha`, `requiredChecks`, and checks. Update state, draft, head SHA, merge SHA/time, and `observedAt` from `https://api.github.com/repos/tutur3u/platform/pulls/{n}`. New PRs get review `UNKNOWN` and empty checks, so they cannot become `waiting_for_merge`.
5. Assign a new PR to a product only when `GET /pulls/{n}/files?per_page=100` shows exactly one `apps/<id>/` prefix in the public product allowlist. Read filenames only. A page of 100 files is incomplete: skip it. Do not replace an existing different PR. If a merge SHA is not an ancestor of the source commit, drop that merge instead of failing the deploy. Do not copy titles, bodies, logins, header values, or response bodies into the snapshot. A test must show a fixture containing `FLEET-BACKLOG`, a client name, and a secret name does not appear in the mapped result.
6. Probe with `fetch` and `redirect: 'manual'`. A 3xx is `unknown` and is not followed. A missing or failed host stays null and does not change stage. Accept only `publicProbeUrl(id)`. Send `GITHUB_TOKEN` / `GH_TOKEN` only to `api.github.com`, never to app hosts, and never print it. User-Agent: `tuturuuu-roadmap-public-refresh`. Network failure keeps the committed snapshot and exits 0. A snapshot that fails `parseSnapshot` restores the file and exits 1.
7. Do not run the collector on `pull_request` builds. Live probes would change stages and fail `roadmap-data.test.ts` (playground, shortener, and roadmap are `waiting_for_production_sync` in the committed snapshot). On `.github/workflows/roadmap-cloudflare.yaml`, run it only when `github.event_name != pull_request`, after `node --test` and before `vp build`. If `git rev-parse --is-shallow-repository` is true, `git fetch --no-tags --unshallow origin` first. Overlay probes only after `refresh-snapshot.mjs` succeeds and `snapshot.sourceCommit` equals the build SHA. Comparing a current Workers commit with the old snapshot source `a3a26468748d9660851b809bb4a43f7ab94610d3` would mark current deploys as waiting for prod sync.
8. Hourly job: a new workflow, suggested name `roadmap-public-refresh.yaml`, `contents: read`, `persist-credentials: false`, checkout pin `3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node pin `949feb2413d6458794dcd2491c4babbbce0c15c1`, cron `17 * * * *`, `workflow_dispatch`, `fetch-depth: 0`, ref `main`, node only, upload-artifact pin `cf430e030ddbb5b0abf93d22962f4752f3646cd9`, `retention-days: 1`, `if-no-files-found: error`, concurrency group `roadmap-public-refresh`, `cancel-in-progress: true`, `timeout-minutes: 20`. Do not call `ci-check.yml`. Do not put the token `wrangler` in that file or the workflow allowlist digest changes. Register the file as `true` in `tuturuuu.ci.ts`. The hourly job must not deploy. Rex deploys the artifact. Tell Pax the workflow change needs Selene first.
9. README: replace the sentence that says the generator has no network fetch. The manual generator stays for recorded input. The collector is the public GitHub API plus the allowlisted probes. No database, provider credentials, or private fleet data. Document the label mapping. Asset smoke and `/roadmap/` are already documented from `#8077`.
10. Add `Deploy readback` to `apps/roadmap/messages/en.json` and `vi.json` if the UI should translate it. The route already renders evidence labels and "Evidence checked" from `snapshot.checkedAt`. Do not change the UTC label. Do not render host internals except as that evidence link. Cap evidence links at 8.
11. Add new tests to `apps/roadmap/package.json` `test` and to the `node --test` line in `roadmap-cloudflare.yaml`.
12. Open the PR against `main` only when the successor's scope is ready. First-commit decision URL `#8073` is valid for this WIP. Retarget `admitted.decision` to the new PR in a follow-up commit with counts and digest unchanged. Label `ready-for-ci` when it is actually ready, not on this WIP. Link the PR with `t3-code` `link_pull_request` as the next call after create or push. Do not watch. Child last line after PR work: `PR <url>, head <SHA>, checks and reviews <state>`.
13. Report the PR URL and head SHA to Atlas by steer if Atlas is running. If Atlas has no running turn, retain the receipt. Do not send the stale pre-merge `#8077` Atlas note.

## Out of scope

- No second worktree.
- No merge, no worktree removal, no watch.
- No secrets, no fleet board, no client names, no incident text, no account IDs.
- No redo of the public-cache guard.
- Do not "fix" the localized Next redirect `/vi/roadmap`, which still 308s to unsashed `https://tuturuuu.com/roadmap`.
- Browser verification is not required for this Worker and CI change.
