# Plan 201: Retire the Orphaned Web Mobile-Deployment Fork

> **Executor instructions:** After Plans 173 and 174 land, re-prove that Web's
> mobile-deployment library has no live importer, delete that closed fork, and
> point shared provenance at the Infrastructure owner without changing runtime
> behavior.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/web/src/lib/mobile-deployment apps/web/src/lib/infrastructure apps/infrastructure/src/lib/mobile-deployment apps/infrastructure/src/app/api/v1/mobile-deployment packages/storage-core/src/lib/mobile-deployment apps/backend/src/mobile_deployment.rs apps/backend/src/mobile_deployment_bundle.rs tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** architecture / migration / tech debt
- **Depends on:** Plans 173 and 174
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Web retains an 11-file, 3,041-line mobile-deployment implementation whose only
external importers sit inside the dead Infrastructure graph governed by Plan
173. The live product routes use Infrastructure's copy. Leaving the newly
orphaned fork and its tests behind creates a convincing but false authority for
security, OIDC, validation, and encrypted storage behavior.

## Current state

- `apps/web/src/lib/mobile-deployment/**` contains 11 files / 3,041 lines.
- Its only external importers are
  `apps/web/src/lib/infrastructure/github-bot/{configuration,clients,state}.ts`,
  all within Plan 173's deletion set.
- Live routes under `apps/infrastructure/src/app/api/v1/mobile-deployment/**`
  import `apps/infrastructure/src/lib/mobile-deployment/**`.
- `packages/storage-core/src/lib/mobile-deployment/constants.ts:1-4` still
  names the Web constants file canonical. Plan 174 separately converges the
  Infrastructure store on Storage Core and must land before hashes/provenance
  are judged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read Infrastructure/Web instructions. Verify Plans 173 and
174 are DONE and use their reviewed integration base. Create a new isolated
worktree and run `bun setup` immediately. Treat Infrastructure and Rust as
read-only authorities unless a comment-only provenance correction is proven
necessary.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Import proof | `rg -n "@/lib/mobile-deployment|lib/mobile-deployment" apps/web/src --glob '!apps/web/src/lib/mobile-deployment/**' --glob '*.ts' --glob '*.tsx'` | no Web importer after Plan 173 |
| Absence | `test ! -e apps/web/src/lib/mobile-deployment` | exit 0 after deletion |
| Provenance | `rg -n 'Canonical definition: apps/web/src/lib/mobile-deployment|apps/web/src/app/api/v1/mobile-deployment' packages/storage-core apps/backend/src --glob '*.ts' --glob '*.rs'` | no stale Web-authority statement |
| Infrastructure tests | `bun --cwd apps/infrastructure vitest run src/lib/mobile-deployment` | live owner tests pass |
| Typechecks | `bun run --cwd apps/web type-check && bun run --cwd apps/infrastructure type-check && bun run --cwd packages/storage-core type-check` | all exit 0 |
| Backend | `bun check:backend` | comment/source contract remains valid |
| Builds | `bun run --cwd apps/web build && bun run --cwd apps/infrastructure build` | both production builds exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** delete all 11 files under
`apps/web/src/lib/mobile-deployment/**`; correct the exact Storage Core and Rust
provenance comments that name deleted Web sources; add a narrow source-absence
test only if an existing architecture test has a suitable home.

**Read-only evidence:** live Infrastructure routes/library/tests, Plan 173's
deleted Web infrastructure graph, Plan 174's converged store, package exports.

**Out of scope:** changing mobile-deployment behavior, routes, secrets, OIDC,
storage formats, Rust handlers, route manifests, dependencies, or live
Infrastructure tests beyond import/provenance updates.

## Git workflow

Use `refactor/retire-web-mobile-deployment-fork` and commit
`refactor(infrastructure): retire Web mobile deployment fork`. Claim/release
the commit window; do not push.

## Steps

1. On the combined Plans 173/174 base, enumerate every Web fork file and search
   aliases, relative/dynamic imports, test mocks, scripts, exports, and string
   references. Compare production files with the live Infrastructure owner and
   classify drift as dead-copy drift only. **Verify:** the import proof has no
   match; any live importer is a STOP.
2. Delete the entire Web subtree and its tests without editing the live
   Infrastructure implementation. Add a narrow contract assertion preventing
   recreation only if it fits an existing source-boundary suite.
3. Correct Storage Core's canonical-source comment to the live
   Infrastructure/package boundary. Correct only Rust provenance comments that
   point to removed Web handlers; do not change executable Rust code or route
   ownership status.
4. Run focused Infrastructure tests, all typechecks, backend gate, both builds,
   repository, and whitespace. Confirm no manifest, dependency, or lockfile
   drift.

## Done criteria

- [ ] Every deleted Web file has zero importer outside the deletion set.
- [ ] The complete 3,041-line Web fork and its tests are absent.
- [ ] Infrastructure remains the sole live TypeScript owner and Storage Core/
      Rust comments no longer cite deleted Web sources.
- [ ] No runtime, route-manifest, dependency, or storage-format behavior changed.
- [ ] Focused tests, typechecks, backend, builds, repository, and whitespace pass.

## STOP conditions

Stop if Plans 173/174 are not DONE, a live or dynamic Web importer exists, the
live Infrastructure owner is missing, deletion requires behavior changes, an
active note claims an exact path, or a mandatory gate fails twice.
