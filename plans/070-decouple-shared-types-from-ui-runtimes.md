# Plan 070: Decouple Shared Types from UI Runtimes

> **Executor instructions:** Move declaration-only React to the peer boundary,
> source Tiptap's JSON type from its framework-neutral package, remove unused
> React DOM, and verify the packed public declarations for non-UI consumers.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/types/package.json packages/types/src/tiptap.ts packages/types/src/json-render-dashboard.ts packages/types/src/index.ts packages/types/README.md bun.lock scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.test.js`
> Stop on dependency, public declaration, publication, or lockfile drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** Dependencies / Package boundaries
- **Depends on:** Mail catch-all lockfile ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Fifty-five workspace manifests directly consume the foundational types
package. Its emitted JavaScript does not use React, React DOM, or Tiptap React,
yet those UI runtimes are declared as production dependencies. Server, worker,
and tooling consumers therefore inherit an avoidable UI dependency edge from a
package intended to carry types.

## Current state

- `packages/types/package.json:23-26` declares `@tiptap/react`, `react`, and
  `react-dom` as runtime dependencies.
- `packages/types/src/tiptap.ts:1` only type-reexports `JSONContent` from the
  React integration. The same type is exported by framework-neutral
  `@tiptap/core` at the repository's current `3.29.2` line.
- `json-render-dashboard.ts:1` imports only the `ReactNode` type; emitted
  JavaScript does not load React. `react-dom` has no tracked source use in the
  package.
- Published declarations still name React types, so React must remain an
  explicit peer plus a development type dependency rather than disappearing
  from the consumer contract.
- The active Mail handoff owns `bun.lock`; dependency commands must wait for
  that ownership to terminate or transfer.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Do not execute
while the Mail handoff owns `bun.lock`. Re-run import searches across all
tracked package source/config and inspect the current published-package
workflow before changing dependency fields.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Remove UI runtimes | `cd packages/types && bun remove @tiptap/react react react-dom` | only owning manifest/lock edges change |
| Add framework-neutral type source | `cd packages/types && bun add @tiptap/core@3.29.2` | exact current Tiptap line is recorded |
| Add React peer | `cd packages/types && bun add --peer 'react@^19.2.8'` | React is an explicit consumer contract, not a direct runtime dependency |
| Package typecheck/build | `bun run --cwd packages/types type-check && bun run --cwd packages/types build` | declarations emit successfully |
| Publication tests | `node --test scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.test.js` | package manifest preparation remains valid |
| Prepared-manifest check | `types_pack_dir="$(mktemp -d)"; mkdir "$types_pack_dir/types"; cp packages/types/package.json "$types_pack_dir/types/package.json"; node scripts/ci/prepare-npm-package-manifest.js "$types_pack_dir/types"` | temporary prepared copy retains core dependency and React peer without React DOM/Tiptap React |
| Dependency tests | `node --test scripts/check-workspace-dependencies.test.js` | workspace graph remains valid |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/types/package.json`
- `packages/types/src/tiptap.ts`
- Only mechanically necessary `bun.lock` changes
- A temporary packed/prepared artifact outside the worktree for inspection;
  do not commit it

Do not change exported type names/shapes, update unrelated dependencies, edit
generated database types, or remove `@types/react` from development dependencies.

## Git workflow

- Branch: `chore/types-decouple-ui-runtimes` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `chore(types): decouple ui runtime dependencies`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Re-prove runtime and declaration usage

Search all package source and exports. Confirm React is type-only, React DOM is
absent, and Tiptap is used only for `JSONContent`. Inspect the built declaration
graph so no hidden public type requires `@tiptap/react`.

### Step 2: Change dependencies through Bun only

Run the exact owning-workspace commands. Import/re-export `JSONContent` from
`@tiptap/core`; keep the public `@tuturuuu/types/tiptap` export unchanged. Move
React to non-optional `peerDependencies` because the root declaration barrel
still exports a `ReactNode`-based type, and retain `@types/react` in dev
dependencies for local declaration builds. Remove React DOM entirely.

Inspect the lockfile after every command. Accept only consequences of these
four package-edge changes; stop if Bun rewrites unrelated versions.

### Step 3: Verify published and non-UI consumption

Build the package, inspect `dist/tiptap.d.ts` and
`dist/json-render-dashboard.d.ts`, and prepare the publish manifest in a
temporary copy. Prove the packed manifest contains `@tiptap/core` as a runtime
dependency, React as a peer, and neither `@tiptap/react` nor `react-dom`.
Typecheck at least one representative non-React server/tooling consumer already
in the workspace graph, selected from current direct consumers and named in the
execution handoff.

## Test plan

This is a package-boundary change, so emitted declarations, prepared manifest,
workspace dependency validation, and a real non-UI consumer typecheck are the
behavioral proof. Do not add a synthetic runtime test that imports React.

## Done criteria

- [ ] `JSONContent` keeps its public export while coming from `@tiptap/core`.
- [ ] React is a peer/dev-time declaration contract, not a direct production dependency.
- [ ] React DOM and Tiptap React are absent from the package manifest and prepared package.
- [ ] Lockfile diff is limited to the declared dependency moves.
- [ ] Package build/typecheck, publication/dependency tests, representative consumer, `bun check`, and whitespace pass.

## STOP conditions

Stop if the Mail lockfile owner has not released/transferred ownership, emitted
declarations require a React runtime dependency, a public type differs after
the Tiptap import switch, the chosen non-UI consumer actually requires React,
or Bun changes unrelated versions.

## Maintenance notes

Keep foundational type packages free of UI runtimes when imports are erased.
Declaration-visible framework types belong in explicit peer/dev boundaries;
runtime packages belong in dependencies only when emitted JavaScript loads them.
