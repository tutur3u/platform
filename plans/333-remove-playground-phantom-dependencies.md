# Plan 333: Remove Unused Playground Dependency Declarations

> **Executor instructions:** Remove only the two dependencies proven unused by
> Playground, regenerate the shared lockfile through Bun, and preserve all app
> behavior. Do not hand-edit dependency versions.
>
> **Drift check (run first):**
> `git diff --stat f8fa36af4b..HEAD -- apps/playground/package.json apps/playground apps/playground/next.config.ts bun.lock tmp/agent-coordination/20260711-134432-codex-mail-catchall-ux.md`
> Re-run the complete source/config/dynamic-import inventory after any drift.

## Status

- **Execution status:** BLOCKED — Mail handoff owns `bun.lock`
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** dependencies / dx
- **Depends on:** exact `bun.lock` transfer from `20260711-134432-codex-mail-catchall-ux.md`
- **Planned at:** commit `f8fa36af4b`, 2026-08-12

## Why this matters

Playground directly declares the workspace Supabase package and Day.js without
importing either. Those entries make its manifest an inaccurate account of its
direct runtime requirements and can mask accidental hoisted or transitive
reliance in future edits. Removing only the proven-unused declarations improves
package hygiene without changing runtime behavior.

## Current state and exact contract

- `apps/playground/package.json:27-39` declares
  `@tuturuuu/supabase: workspace:*` and `dayjs: ^1.11.21`.
- Fixed-string searches find no source, config, CSS, script, or dynamic consumer
  under `apps/playground`; the only matches are those manifest declarations.
- Playground's required `@tuturuuu/ai`, `@tuturuuu/satellite`,
  `@tuturuuu/ui`, and `@tuturuuu/utils` dependencies already reach Supabase
  transitively, and several retained packages reach Day.js. Do **not** claim
  this cleanup shrinks the current Turbo closure or install; `turbo ls` should
  still show those transitive packages. The benefit is truthful direct ownership.
- Preserve every other dependency, especially `@tuturuuu/typescript-config`,
  `@tuturuuu/satellite`, `@tuturuuu/types`, `@tuturuuu/ui`, and
  `@tuturuuu/utils`.
- This promotes only Playground's slice of the ledger's deferred fleet Day.js
  cleanup because its same manifest also has an unused direct Supabase
  declaration. Other apps remain deferred.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Usage proof | `rg -n -e '@tuturuuu/supabase' -e 'dayjs' apps/playground --glob '!package.json' --glob '!**/.next/**' --glob '!**/.turbo/**' --glob '!tsconfig.tsbuildinfo'` | no matches |
| Remove | `(cd apps/playground && bun remove '@tuturuuu/supabase' dayjs)` | exits 0; Bun updates only the owning manifest and shared lockfile |
| Manifest absence | `rg -n '"@tuturuuu/supabase"|"dayjs"' apps/playground/package.json` | no matches |
| Typecheck | `bun --cwd apps/playground run type-check` | exits 0 |
| Build | `bun --cwd apps/playground run build` | production build passes |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only Playground manifest, `bun.lock`, and plan status changed |

## Suggested executor toolkit

- Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
  `$tuturuuu-commit` only if the operator later asks for a commit.

## Scope

**In scope:** `apps/playground/package.json`, `bun.lock`, plan status.

**Out of scope:** removing any other dependency; fleet dependency cleanup;
source/UI/API changes; lockfile deduplication or upgrades; Turbo/Vercel selection
logic; package publication; hand-editing package or lockfile entries.

## Git workflow

- After lockfile transfer, use branch `chore/playground-dependency-cleanup` in
  an isolated worktree and run `bun setup` immediately.
- Commit: `chore(playground): remove unused dependencies`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

### Step 1: Re-prove both edges are unused

Run Usage proof and inspect `next.config.ts`, PostCSS/CSS, root layout/providers,
scripts, and string/dynamic imports. Do not infer use merely from transitive
packages, and do not remove an edge if any runtime/config consumer appears.

**Verify:** Usage proof has no match outside the manifest.

### Step 2: Remove through Bun

Run the exact Remove command. Inspect the manifest and lockfile diff. The
manifest must lose exactly two dependency entries; lock changes must be limited
to reachability/metadata caused by that removal.

**Verify:** Manifest absence and Scope pass; stop on broad unexplained lock churn.

### Step 3: Prove the app remains executable

Run Playground typecheck and real build, then `bun check`, scope, and whitespace.
Do not add compatibility packages or imports merely to retain a phantom edge.

## Test plan

- Static use inventory covers source, config, CSS, scripts, and dynamic imports.
- Manifest assertion proves both exact names are absent and neighboring required
  dependencies remain.
- Playground typecheck and production build are the runtime resolution proof.

## Done criteria

- [ ] Playground declares neither `@tuturuuu/supabase` nor `dayjs`.
- [ ] No source/config/dynamic consumer was removed or changed.
- [ ] Bun produced only explainable manifest/lockfile changes.
- [ ] Playground typecheck/build, `bun check`, scope, and whitespace pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if the Mail handoff has not transferred `bun.lock`; either package has a
real consumer; another owner edits the manifest/lockfile; Bun produces broad
unexplained churn; or a required gate fails twice.

## Maintenance notes

Keep the broader Day.js fleet cleanup deferred until each active owner and the
shared lockfile are available. Prefer behavior-based affected-graph tests only
when a removed workspace edge demonstrably changes deployment selection.
