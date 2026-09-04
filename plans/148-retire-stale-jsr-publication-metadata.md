# Plan 148: Retire Stale JSR Publication Metadata

> **Executor instructions:** Prove whether the dormant JSR channel has supported
> consumers, then remove stale configs or stop for a separately governed release
> design.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/*/jsr.json packages/*/package.json scripts/ci/release-workflows.test.js apps/docs tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** dependencies / release / docs
- **Depends on:** Forms/CI ownership transfer for
  `scripts/ci/release-workflows.test.js`; maintainer disposition of any external
  JSR consumers
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Eleven packages advertise JSR metadata whose versions trail their npm
manifests, while release tests explicitly enforce npm-only publication and
forbid JSR publishing. The repository presents a second distribution contract
that it deliberately never updates.

## Current state

- `packages/{ai,apis,games,google,icons,supabase,types,typescript-config,ui,
  utils,vercel}/jsr.json` remain checked in; every version differs from its npm
  manifest (for example APIs 0.0.10 vs 0.11.0 and UI 0.0.4 vs 0.25.3).
- `release-workflows.test.js:960-967` forbids Release Please from updating JSR
  metadata because package releases are npm-only; lines 2002-2006 forbid JSR
  publication commands.
- No maintained docs or workflow describe a supported JSR release channel.
- Registry downloads cannot prove subpath/package consumers; public code search
  and maintainer risk acceptance are required before deletion.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, `$tuturuuu-commit`, and `$github`. Do not begin
until the active Forms note transfers `release-workflows.test.js`. Use an
isolated worktree and `bun setup`; networked registry/code searches require
normal read-only approval.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Inventory | `find packages -mindepth 2 -maxdepth 2 -name jsr.json -print | sort` | exact eleven-file list |
| JSR registry | `bun -e 'const ps=["ai","apis","games","google","icons","supabase","types","typescript-config","ui","utils","vercel"]; let bad=false; for (const p of ps) { const r=await fetch(`https://jsr.io/@tuturuuu/${p}/meta.json`,{headers:{Accept:"application/json"}}); const body=r.status===200?await r.json():null; console.log(JSON.stringify({package:`@tuturuuu/${p}`,status:r.status,metadata:body})); if (r.status!==200&&r.status!==404) bad=true; } if (bad) process.exit(1);'` | one labeled JSON record per package; status is exactly 200 with metadata or explicit 404, otherwise nonzero |
| External code | `for p in ai apis games google icons supabase types typescript-config ui utils vercel; do gh search code "jsr:@tuturuuu/$p" --limit 100 --json repository,path,url; gh search code "@jsr/tuturuuu__$p" --limit 100 --json repository,path,url; done` | every direct and npm-compatibility import hit dispositioned; zero supported/unknown external consumers remain before removal |
| Release tests | `node --test scripts/ci/release-workflows.test.js` | stale metadata invariant passes |
| Script suite | `bun test:scripts` | all pass |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the eleven `jsr.json` files; release-workflow readiness test;
one existing package-release docs page or focused docs note if needed.

**Out of scope:** publishing to JSR, npm version changes, package exports,
release workflow YAML, lockfile changes, or deleting a channel with an
undispositioned consumer.

## Git workflow

After transfer use `chore/retire-jsr-metadata` and commit
`chore(release): retire stale JSR metadata`. Claim/release the commit window;
do not push.

## Steps

1. Record exact package/version/export metadata. Query the official JSR package
   metadata endpoint (`/@scope/name/meta.json`, with JSON Accept header) for
   each of the eleven names, then search both native `jsr:@tuturuuu/name` and
   npm-compatibility `@jsr/tuturuuu__name` imports. Success requires every hit
   to be classified as this repository, an archived/example-only consumer, or
   a maintainer-approved unsupported external use; any live or unknown consumer
   is a STOP. Obtain explicit maintainer acceptance that JSR is unsupported
   before deletion; otherwise produce a design-only governed-channel handoff.
2. Delete exactly the eleven dormant configs. Do not modify npm manifests,
   versions, exports, or lockfiles.
3. Change the release validator from merely forbidding version updates/publish
   commands to rejecting new `packages/*/jsr.json` unless an explicit future
   governed-channel allowlist is introduced by a separate decision.
4. Update the narrow release documentation to state npm is the supported
   package channel, then run focused/full gates.

## Done criteria

- [ ] External-use evidence and maintainer disposition authorize retirement.
- [ ] All eleven stale configs are removed with no package/lockfile churn.
- [ ] CI prevents silent reintroduction of unsupported JSR metadata.
- [ ] npm remains the documented and tested release channel.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on ownership, any supported/undispositioned external consumer, maintainer
request to retain JSR, need for package export/version changes, or a gate
failing twice.
