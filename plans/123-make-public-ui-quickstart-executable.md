# Plan 123: Make the Public UI Quickstart Executable

> **Executor instructions:** Correct the public `@tuturuuu/ui` README and add
> a focused contract test that proves its quickstart uses real exports, valid
> props, and the required stylesheet. Do not change component behavior or add a
> package-root export to preserve the stale example.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/ui/README.md packages/ui/package.json packages/ui/src/components/ui/button.tsx packages/ui/src/components/ui/card.tsx packages/ui/src/globals.css packages/ui/src/readme-contract.test.tsx apps/tanstack-web/src/components/ui-docs/ui-docs-overview-page.tsx apps/tanstack-web/src/components/ui-docs/ui-docs-setup-page.tsx`
> Stop if the public export map, supported button variants, or canonical UI
> setup example has changed materially.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `1ed1e5c2430315da91f46a89b6989cfbae13abb6`
  on branch `docs/ui-public-quickstart`; focused contract tests, all 818 UI
  tests, typecheck, packed-artifact verification, `bun check`, and hooks passed
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Documentation / package contract
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The first usage example for the public UI package cannot compile: it imports
`Button` and `Card` from a package root that is not exported and passes the
unsupported button variant `primary`. It also omits the shared stylesheet that
provides the package's tokens and base styles. An external adopter following
the README therefore encounters multiple independent failures before rendering
one component.

## Current state

- `packages/ui/README.md:20-31` imports `{ Button, Card }` from
  `@tuturuuu/ui` and renders `<Button variant="primary">`.
- `packages/ui/package.json:203-213,431` exports `./button` and wildcard
  component subpaths, but defines no `.` package-root export. The wildcard
  makes `@tuturuuu/ui/card` valid.
- `packages/ui/src/components/ui/button.tsx:11-35` supports `default`,
  `destructive`, `outline`, `secondary`, `ghost`, and `link`; it does not
  support `primary`.
- `packages/ui/package.json:203-205` exposes `./globals.css`. Live consumers
  import it once at the app root, for example
  `apps/apps/src/app/[locale]/layout.tsx:1`.
- `apps/tanstack-web/src/components/ui-docs/ui-docs-overview-page.tsx:85-93`
  is the maintained quickstart exemplar: import the stylesheet, then import
  `Button` from `@tuturuuu/ui/button` and use its default variant.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Run
`git status --short` and inspect active coordination notes. This plan owns only
the UI README and its focused package test; preserve the unrelated shared
`bun.lock` change and do not install dependencies.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused contract | `bun --cwd packages/ui vitest run src/readme-contract.test.tsx` | the README/export/variant contract tests pass |
| Package typecheck | `bun run --cwd packages/ui type-check` | exit 0, proving the example's imports and props typecheck |
| Package suite | `bun run --cwd packages/ui test` | all UI tests pass |
| Workspace gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:**

- `packages/ui/README.md`
- `packages/ui/src/readme-contract.test.tsx` (create)
- `plans/README.md` only for the executor's status update

**Out of scope:**

- `packages/ui/package.json` and its export map
- component implementation or variant changes
- `apps/tanstack-web/**`; those files are evidence/exemplars only
- dependency manifests, `bun.lock`, package versions, changelogs, and release
  workflows

**Read-only drift evidence (inspect, do not edit):**

- `packages/ui/package.json`
- `packages/ui/src/components/ui/button.tsx`
- `packages/ui/src/components/ui/card.tsx`
- `packages/ui/src/globals.css`
- `apps/tanstack-web/src/components/ui-docs/ui-docs-overview-page.tsx`
- `apps/tanstack-web/src/components/ui-docs/ui-docs-setup-page.tsx`

## Git workflow

Use isolated branch `docs/ui-public-quickstart`, run `bun setup`, and commit
`docs(ui): make public quickstart executable`. Claim and release the commit
window. Do not push unless instructed.

## Steps

### Step 1: Characterize the public quickstart contract

Create `packages/ui/src/readme-contract.test.tsx`. Follow the repository-file
inspection pattern in `packages/ui/src/globals.test.ts:1-21`. The test must:

1. Read `packages/ui/README.md` and `packages/ui/package.json` from either the
   repository root or package working directory.
2. Assert that the README imports `@tuturuuu/ui/globals.css` exactly once and
   imports `Button` and `Card` through `@tuturuuu/ui/button` and
   `@tuturuuu/ui/card`.
3. Assert that the example does not import from bare `@tuturuuu/ui` and does
   not use `variant="primary"`.
4. Import the two component subpaths in the test and render the documented
   component tree with Testing Library so TypeScript and the test runner prove
   the public import/prop contract rather than only matching README text.

Do not add a root export or a `primary` alias to make the stale example pass.

**Verify:** the focused contract command fails against the current README for
the documented reasons before Step 2, then passes after Step 2.

### Step 2: Replace the broken README example

Rewrite the Installation/Usage section to use one package-manager-neutral
primary command plus concise alternatives, import `globals.css` once at the
application root, and use the two supported component subpaths. Use the
default button variant or another currently supported named variant. Explain
that package exports are source TypeScript/TSX and a framework must transpile
the package when it does not already handle dependency source files.

Keep the existing release-order warning for published Tuturuuu workspace
dependencies. Do not claim a provider is optional where the selected component
requires one; name only prerequisites exercised by the sample.

**Verify:** focused contract, package typecheck, and package suite all pass.

### Step 3: Run repository verification

Run `bun check` and `git diff --check`. Inspect `git status --short`; only the
two in-scope UI files and the advisor index status row may differ.

## Test plan

- Broken bare-root import is rejected by the test.
- Invalid `primary` variant is rejected by the test.
- Missing stylesheet import is rejected by the test.
- The documented Button/Card tree renders through the exported subpaths.
- Existing UI tests and typecheck remain green.

## Done criteria

- [ ] A reader can copy the README sample without changing its import paths or
      button props.
- [ ] The README explicitly loads `@tuturuuu/ui/globals.css`.
- [ ] The focused contract test proves the sample against the live export and
      component contract.
- [ ] Focused test, package suite, package typecheck, `bun check`, and
      `git diff --check` pass.
- [ ] No manifest, dependency, export-map, version, or component behavior
      changed.

## STOP conditions

Stop if the package has gained a deliberate root export, the canonical
TanStack UI docs no longer use subpath imports and shared CSS, the sample
requires changing component behavior, package self-reference cannot be tested
without changing build/export configuration, or any verification command fails
twice after one reasonable correction.

## Maintenance notes

The README is a public API surface. When component exports or required global
styles change, update the sample and its contract test together. Plan 124 will
separately correct singleton peer dependencies; do not fold that manifest work
into this documentation-only plan.
